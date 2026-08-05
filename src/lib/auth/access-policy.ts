// M5-AUTH-RLS F003（spec D-2）— 全站鉴权边界的**判定层**（纯函数，零 next 依赖）。
//
// middleware.ts 只是本模块的薄适配层：它把 NextRequest 拆成 (pathname, isLoggedIn) 交给这里，
// 拿回一个 Response 或 null。这么切的理由：豁免清单与「401 还是 302」的判定是安全语义，
// 必须能被单测逐条钉；写在 middleware 里就只能靠起服务器打请求才能验，回归成本高到不会有人跑。
//
// 判定原则（spec D-2）：
//   - middleware 只做「有没有合法会话」的**粗闸**；细粒度租户归属归数据层（RLS，F008/F009）
//   - 豁免清单**显式写死**：要放行新路径必须改这里的常量 + 改单测断言（tests/unit/auth-middleware-gate.test.ts）
//   - 未登录访问 API → **401 JSON**；访问页面 → 302 到 /login（带 callbackUrl）
//   - **恒不产生 403**：403 在本仓锁死为闸门语义（architecture.md:1450），认证失败一律 401

import { LOGIN_PATH } from './config';

/** 未认证的 API 响应体（稳定契约：前端与探针据此判定，勿改字段名）。 */
export const UNAUTHORIZED_BODY = { ok: false, error: 'unauthorized' } as const;

export type ExemptRule =
  | { id: string; kind: 'exact'; path: string }
  | { id: string; kind: 'prefix'; path: string }
  /**
   * public/ 下的静态文件。**扩展名只在已知静态目录内生效**（见 I-1）：
   * 早先这条写成「整条 path 以某扩展名结尾即放行」，于是任何末段为动态段的路由
   * （`/api/actions/[id]`、`/admin/campaigns/[id]` …）只要在 id 后面加 `.json`/`.js`/`.txt`/`.map`
   * 就能让闸门**根本不执行**（首轮验收实测 401 → 500/405）。收窄成
   * 「public/ 顶层已知单文件」+「已知静态目录 × 已知扩展名」两种形态。
   */
  | {
      id: string;
      kind: 'static-asset';
      /** public/ 顶层单文件：整条 path 精确匹配（不是前缀，不是后缀） */
      files: readonly string[];
      /** public/ 下的静态资源目录：只有落在这些目录内才适用扩展名放行（含首尾 `/`） */
      dirs: readonly string[];
      pattern: RegExp;
    };

/**
 * 豁免清单（spec D-2 逐条对应）。**这是全集**——单测钉住 id 集合，
 * 任何新增/删除都必须先改断言，杜绝「顺手加一条豁免」式的静默扩面。
 */
export const EXEMPT_RULES: readonly ExemptRule[] = [
  // 容器 healthcheck 探针（GO-LIVE F001）：要在无会话下可达，否则 compose 判 app unhealthy
  { id: 'api-health', kind: 'exact', path: '/api/health' },
  // Resend webhook：svix 签名自鉴权（M3-A F004），不是浏览器会话面
  { id: 'api-signals-inbound', kind: 'exact', path: '/api/signals/inbound' },
  // Auth.js 自身端点（含 F005 的 /api/auth/register）：登录动作本身不能被登录闸门拦住
  { id: 'api-auth', kind: 'prefix', path: '/api/auth' },
  // 登录 / 注册页
  { id: 'login-page', kind: 'exact', path: LOGIN_PATH },
  { id: 'signup-page', kind: 'exact', path: '/signup' },
  // Next 静态资源（构建产物）
  { id: 'next-static', kind: 'prefix', path: '/_next' },
  // public/ 下的静态文件（图片 / 字体 / 样式 / manifest / favicon / robots）。
  // 目录白名单 = public/ 下的实际静态目录；扩展名列表按 public/ 实际文件类型取，
  // **刻意不含 `js` / `map`**（public/ 下无此类文件；构建产物走 `/_next`，由 next-static 规则管）。
  {
    id: 'public-asset',
    kind: 'static-asset',
    files: ['/favicon.ico', '/manifest.json', '/robots.txt'],
    dirs: ['/img/', '/fonts/', '/svg/', '/styles/'],
    pattern:
      /\.(?:ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|eot|css|txt|xml|webmanifest|json)$/i,
  },
];

/** 豁免清单的 id 全集（单测断言锚点）。 */
export const EXEMPT_RULE_IDS: readonly string[] = EXEMPT_RULES.map((r) => r.id);

/**
 * 单条规则的匹配判定（导出是为了让单测能拿**构造出来的恶意规则**驱动它——
 * 比如把 `/api/` 塞进 `dirs`，验证第二道防线仍然拦住）。
 */
export function matchesExemptRule(rule: ExemptRule, pathname: string): boolean {
  if (rule.kind === 'exact') return pathname === rule.path;
  if (rule.kind === 'prefix') {
    return pathname === rule.path || pathname.startsWith(`${rule.path}/`);
  }
  // ① 前置硬规则：/api/ 一律不适用扩展名豁免。
  //    dirs 白名单本身已经排除了 API 面，这条是第二道防线——防止将来有人往 dirs 里
  //    加一条看起来无害的目录（或 public/ 下真出现 `api` 目录）就把闸门重新捅穿。
  if (isApiPath(pathname)) return false;
  // ② public/ 顶层单文件：整条 path 精确匹配
  if (rule.files.includes(pathname)) return true;
  // ③ 已知静态目录 × 已知扩展名（两者都必须成立）
  return (
    rule.dirs.some((dir) => pathname.startsWith(dir)) && rule.pattern.test(pathname)
  );
}

export function isExemptPath(pathname: string): boolean {
  return EXEMPT_RULES.some((rule) => matchesExemptRule(rule, pathname));
}

/** API 面 = /api/* （未登录时给 401 JSON 而不是跳转页面）。 */
export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export type AccessDecision =
  | { type: 'allow'; reason: 'exempt' | 'authenticated' }
  | { type: 'unauthorized-json' }
  | { type: 'redirect-login'; callbackUrl: string };

/**
 * 单请求判定。callbackUrl 只允许站内相对路径（调用方传的是 pathname+search，天然相对）。
 */
export function decideAccess(input: {
  pathname: string;
  search?: string;
  isLoggedIn: boolean;
}): AccessDecision {
  const { pathname, search = '', isLoggedIn } = input;
  if (isExemptPath(pathname)) return { type: 'allow', reason: 'exempt' };
  if (isLoggedIn) return { type: 'allow', reason: 'authenticated' };
  if (isApiPath(pathname)) return { type: 'unauthorized-json' };
  return { type: 'redirect-login', callbackUrl: `${pathname}${search}` };
}

/** 只读取 header 的最小接口（便于单测直接喂对象，不必造 Request）。 */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * 从请求头推导对外 origin —— patterns/web-runtime-patterns.md §2 的规定动作。
 *
 * 实测（standalone + curl）：`req.nextUrl.origin` 恒为进程监听地址 `http://localhost:3000`，
 * 无视 Host 与 X-Forwarded-Host。而 Next 的 middleware 又**强制 Location 必须是绝对 URL**
 * （返回相对 Location 会被 `new URL()` 判 ERR_INVALID_URL → 500，本机实测踩到）。
 * 两条约束夹在一起，只剩一条正确解：从 forwarded headers 推导 origin。
 *
 * 信任前提与 Auth.js 的 `trustHost: true` 一致——我方 nginx 反代负责设置这些头。
 */
export function resolveRequestOrigin(
  headers: HeaderReader,
  fallbackOrigin: string,
): string {
  const firstOf = (raw: string | null): string | undefined =>
    raw?.split(',')[0]?.trim() || undefined;
  const host = firstOf(headers.get('x-forwarded-host')) ?? firstOf(headers.get('host'));
  if (!host) return fallbackOrigin;
  const proto =
    firstOf(headers.get('x-forwarded-proto')) ??
    new URL(fallbackOrigin).protocol.replace(':', '');
  return `${proto}://${host}`;
}

/** 未登录跳转的 Location（绝对 URL —— Next middleware 的硬要求，见 resolveRequestOrigin）。 */
export function loginRedirectLocation(
  callbackUrl: string,
  origin: string,
): string {
  const target = new URL(LOGIN_PATH, origin);
  target.searchParams.set('callbackUrl', callbackUrl);
  return target.toString();
}

/**
 * 判定 → Response。返回 null 表示放行（middleware 不返回响应即继续）。
 *
 * 用标准 Response 而不是 NextResponse：本模块因此零 next 依赖，单测可直接驱动并断言
 * 真实状态码 / 头 / body，而不是只断言一个「决策对象」。
 */
export function buildGateResponse(
  decision: AccessDecision,
  origin: string,
): Response | null {
  if (decision.type === 'allow') return null;
  if (decision.type === 'unauthorized-json') {
    return Response.json(UNAUTHORIZED_BODY, { status: 401 });
  }
  // 307：保留原请求方法语义（不因跳转把 POST 降级成 GET）
  return new Response(null, {
    status: 307,
    headers: { location: loginRedirectLocation(decision.callbackUrl, origin) },
  });
}

/** middleware 的一行入口：给路径 / 会话状态 / 对外 origin，拿响应（null = 放行）。 */
export function authGateResponse(input: {
  pathname: string;
  search?: string;
  isLoggedIn: boolean;
  origin: string;
}): Response | null {
  return buildGateResponse(decideAccess(input), input.origin);
}
