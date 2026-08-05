// M5-AUTH-RLS F003 — 鉴权边界（middleware）行为钉（spec D-2）。
//
// 分三层钉：
//   ① 豁免清单**全集**（id 逐条对账）——要放行新路径必须先改这里的断言
//   ② 判定 → 真 Response（状态码 / body / Location 都是实物，不是决策对象）
//   ③ matcher 覆盖面——摘掉 matcher 里拦 API 的那段，②再对也白搭（middleware 根本不被调用）
//
// 变异对照（逐条实跑过）：
//   1. 豁免清单塞 '/api/projects' → ①②同时红
//   2. 摘掉 matcher（或把 api 加进负向排除）→ ③红
//   3. 未登录 API 改成 403 → 「恒不产生 403」红
//   4. 跳转 Location 改回 req.nextUrl.origin（监听地址）→ 「Location host 取自请求头」红
//   5. isExemptPath 用 startsWith 松匹配 → 「/loginx 不豁免」红
//   6.【I-1 回归】public-asset 改回「整条 path 的扩展名后缀正则」/ matcher 排除项放回
//      `.*\.(?:…)$` → ①②③ 的扩展名绕过样本同时红（fix_round1 实跑，见 commit 正文）
//
// I-1 教训（首轮验收实测击穿）：原「通配一切」守卫只拿 `/api/projects`、`/admin/today` 两个
// **不带扩展名**的路径试探后缀正则，对「末段加 .json 即绕过」这一类**恒绿**。
// 所以本轮把带扩展名的动态段样本直接并进 GUARDED_* 全集——三层断言（豁免 / 判定 / matcher）
// 全都会吃到它们，而不是另起一条容易被遗忘的独立用例。

import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  EXEMPT_RULE_IDS,
  EXEMPT_RULES,
  matchesExemptRule,
  isExemptPath,
  isApiPath,
  decideAccess,
  authGateResponse,
  resolveRequestOrigin,
  loginRedirectLocation,
  UNAUTHORIZED_BODY,
} from 'lib/auth/access-policy';
import { config as middlewareConfig } from 'middleware';

const ORIGIN = 'https://kolmatrix.example.com';

/**
 * 扩展名绕过样本（I-1）：末段为动态段的真实路由 + 常见静态扩展名。
 * 这些路径**都是非豁免 API/页面**，闸门必须照常生效。
 */
const EXT_BYPASS_API_PATHS = [
  '/api/actions/abc.json',
  '/api/actions/abc.js',
  '/api/actions/abc.txt',
  '/api/actions/abc.map',
  '/api/delivery/deliverables/abc.json',
  '/api/projects/abc.json',
  '/api/kols/abc.png',
  '/api/agent.json',
];

const EXT_BYPASS_PAGE_PATHS = [
  '/admin/campaigns/abc.json',
  '/admin/today.json',
  '/admin/creators/abc.txt',
];

/** 未登录时必须被拦的 API 抽样：actions / agent / projects / delivery 各 ≥1（acceptance 点名）。 */
const GUARDED_API_PATHS = [
  '/api/projects',
  '/api/projects/abc/goal',
  '/api/actions',
  '/api/actions/abc/confirm',
  '/api/actions/abc/execute',
  '/api/agent',
  '/api/agent/plan-ack',
  '/api/delivery/payout',
  '/api/delivery/deals/abc/keys',
  '/api/reach/send',
  '/api/insight/share',
  '/api/materials',
  '/api/nav-badges',
  '/api/handoffs',
  '/api/kols/abc/contact',
  '/api/match/refresh',
  ...EXT_BYPASS_API_PATHS,
];

const GUARDED_PAGE_PATHS = [
  '/',
  '/admin',
  '/admin/today',
  '/admin/creators',
  '/admin/campaigns/abc',
  '/preview/agent-loop',
  ...EXT_BYPASS_PAGE_PATHS,
];

/** public/ 下的真实静态文件全集（S-M5-2：收窄豁免后它们必须仍免闸门）。 */
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');
function listPublicFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? listPublicFiles(full)
      : [`/${relative(PUBLIC_DIR, full).split(sep).join('/')}`];
  });
}
const PUBLIC_FILE_PATHS = listPublicFiles(PUBLIC_DIR);

describe('M5-AUTH-RLS F003 — ① 豁免清单全集（spec D-2 逐条）', () => {
  it('豁免规则 id 恰等于清单全集（增删都必须先改这条断言）', () => {
    expect([...EXEMPT_RULE_IDS]).toEqual([
      'api-health',
      'api-signals-inbound',
      'api-auth',
      'login-page',
      'signup-page',
      'next-static',
      'public-asset',
    ]);
  });

  it.each([
    '/api/health',
    '/api/signals/inbound',
    '/api/auth',
    '/api/auth/csrf',
    '/api/auth/callback/credentials',
    '/api/auth/register',
    '/login',
    '/signup',
    '/_next/static/chunks/main.js',
    '/favicon.ico',
    '/manifest.json',
    '/img/auth/auth.png',
    '/fonts/DMSans.woff2',
  ])('豁免：%s', (p) => {
    expect(isExemptPath(p)).toBe(true);
  });

  it.each([
    ...GUARDED_API_PATHS,
    ...GUARDED_PAGE_PATHS,
    // 边界：前缀/精确匹配不得被松成 startsWith
    '/api/healthz',
    '/api/health/details',
    '/api/signals/inbound/replay',
    '/api/authz/token',
    '/loginx',
    '/login/reset',
    '/signup-promo',
    '/_nextdoor',
  ])('不豁免：%s', (p) => {
    expect(isExemptPath(p)).toBe(false);
  });

  it('豁免规则没有「通配一切」的写法（前缀不得是根；静态规则的目录白名单不得含 / 或 API 面）', () => {
    for (const rule of EXEMPT_RULES) {
      if (rule.kind === 'prefix') expect(rule.path.length).toBeGreaterThan(1);
      if (rule.kind === 'static-asset') {
        for (const dir of rule.dirs) {
          expect(dir.startsWith('/'), `${dir} 必须是绝对目录`).toBe(true);
          expect(dir.endsWith('/'), `${dir} 必须以 / 结尾（否则 /imgx 也会命中）`).toBe(
            true,
          );
          expect(dir.length, `${dir} 不得是根目录（= 通配一切）`).toBeGreaterThan(2);
          expect(isApiPath(dir), `${dir} 不得落在 API 面`).toBe(false);
        }
        for (const f of rule.files) {
          expect(f.slice(1).includes('/'), `${f} 必须是 public/ 顶层单文件`).toBe(false);
          expect(rule.pattern.test(f), `${f} 必须是静态扩展名`).toBe(true);
        }
      }
    }
  });

  it('**I-1**：扩展名豁免只在 public/ 静态目录内生效，末段加后缀不得绕过闸门', () => {
    for (const p of [...EXT_BYPASS_API_PATHS, ...EXT_BYPASS_PAGE_PATHS]) {
      expect(isExemptPath(p), `${p} 加了扩展名就被豁免 = 闸门可绕过`).toBe(false);
    }
    // 反面对照：同样的扩展名落在 public/ 静态目录内则必须豁免（否则每张图跑一次 edge 函数）
    expect(isExemptPath('/img/auth/auth.png')).toBe(true);
    expect(isExemptPath('/styles/Plugins.css')).toBe(true);
  });

  it('**I-1 第二道防线**：即便有人把 /api/ 塞进静态目录白名单，API 面仍不豁免', () => {
    const malicious = {
      id: 'evil',
      kind: 'static-asset' as const,
      files: ['/api/actions/abc.json'],
      dirs: ['/api/'],
      pattern: /\.(?:json|png)$/i,
    };
    expect(matchesExemptRule(malicious, '/api/actions/abc.json')).toBe(false);
    expect(matchesExemptRule(malicious, '/api/kols/x.png')).toBe(false);
    // 同一条规则对非 API 面按原语义工作（证明上面两条不是因为规则本身失效）
    expect(matchesExemptRule({ ...malicious, dirs: ['/img/'] }, '/img/x.png')).toBe(true);
  });

  it('S-M5-2：public/ 下每个真实静态文件都仍被豁免（收窄不得误伤）', () => {
    expect(PUBLIC_FILE_PATHS.length).toBeGreaterThan(100); // 走到了真目录，不是空列表恒绿
    const notExempt = PUBLIC_FILE_PATHS.filter((p) => !isExemptPath(p));
    expect(notExempt, 'public/ 下这些真实文件被闸门拦了').toEqual([]);
  });

  it('isApiPath 只认 /api 面', () => {
    expect(isApiPath('/api/projects')).toBe(true);
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/apixyz')).toBe(false);
    expect(isApiPath('/admin/api')).toBe(false);
  });
});

describe('M5-AUTH-RLS F003 — ② 未登录判定 → 真 Response', () => {
  it.each(GUARDED_API_PATHS)('未登录 %s → 401 JSON', async (pathname) => {
    const res = authGateResponse({ pathname, isLoggedIn: false, origin: ORIGIN });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    expect(res!.headers.get('content-type')).toContain('application/json');
    expect(await res!.json()).toEqual(UNAUTHORIZED_BODY);
  });

  it.each(GUARDED_PAGE_PATHS)('未登录 %s → 307 跳 /login 且带 callbackUrl', (pathname) => {
    const res = authGateResponse({ pathname, isLoggedIn: false, origin: ORIGIN });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(307);
    const loc = new URL(res!.headers.get('location')!);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('callbackUrl')).toBe(pathname);
  });

  it('页面跳转保留原 query（登录后能回到同一个筛选态）', () => {
    const res = authGateResponse({
      pathname: '/admin/creators',
      search: '?platform=youtube&page=2',
      isLoggedIn: false,
      origin: ORIGIN,
    });
    const loc = new URL(res!.headers.get('location')!);
    expect(loc.searchParams.get('callbackUrl')).toBe(
      '/admin/creators?platform=youtube&page=2',
    );
  });

  it('豁免路径 / 已登录 → 放行（返回 null，middleware 不产生响应）', () => {
    expect(
      authGateResponse({ pathname: '/login', isLoggedIn: false, origin: ORIGIN }),
    ).toBeNull();
    expect(
      authGateResponse({
        pathname: '/api/signals/inbound',
        isLoggedIn: false,
        origin: ORIGIN,
      }),
    ).toBeNull();
    for (const pathname of [...GUARDED_API_PATHS, ...GUARDED_PAGE_PATHS]) {
      expect(
        authGateResponse({ pathname, isLoggedIn: true, origin: ORIGIN }),
        `已登录访问 ${pathname} 必须原样放行`,
      ).toBeNull();
    }
  });

  it('**恒不产生 403**（403 已锁死为闸门语义，architecture:1450）', () => {
    for (const pathname of [
      ...GUARDED_API_PATHS,
      ...GUARDED_PAGE_PATHS,
      '/api/health',
      '/login',
    ]) {
      for (const isLoggedIn of [true, false]) {
        const res = authGateResponse({ pathname, isLoggedIn, origin: ORIGIN });
        expect(res?.status ?? 200).not.toBe(403);
      }
    }
  });

  it('decideAccess 的三态语义（allow 带原因，便于排障）', () => {
    expect(decideAccess({ pathname: '/login', isLoggedIn: false })).toEqual({
      type: 'allow',
      reason: 'exempt',
    });
    expect(decideAccess({ pathname: '/admin/today', isLoggedIn: true })).toEqual({
      type: 'allow',
      reason: 'authenticated',
    });
    expect(decideAccess({ pathname: '/api/projects', isLoggedIn: false })).toEqual(
      { type: 'unauthorized-json' },
    );
  });
});

describe('M5-AUTH-RLS F003 — ②b 跳转 Location 的 origin 取自请求头（反代必需）', () => {
  const headersOf = (h: Record<string, string>) => ({
    get: (n: string) => h[n.toLowerCase()] ?? null,
  });

  it('x-forwarded-host / -proto 优先（nginx 反代实况）', () => {
    expect(
      resolveRequestOrigin(
        headersOf({
          'x-forwarded-host': 'kolmatrix.example.com',
          'x-forwarded-proto': 'https',
          host: 'app-internal:3000',
        }),
        'http://localhost:3000',
      ),
    ).toBe('https://kolmatrix.example.com');
  });

  it('无 forwarded 头时退回 Host 头；两者皆无才用监听地址', () => {
    expect(
      resolveRequestOrigin(headersOf({ host: 'kolmatrix.example.com' }), 'http://localhost:3000'),
    ).toBe('http://kolmatrix.example.com');
    expect(resolveRequestOrigin(headersOf({}), 'http://localhost:3000')).toBe(
      'http://localhost:3000',
    );
  });

  it('多级代理链取最左段（客户端最初访问的域）', () => {
    expect(
      resolveRequestOrigin(
        headersOf({
          'x-forwarded-host': 'kolmatrix.example.com, inner-lb',
          'x-forwarded-proto': 'https, http',
        }),
        'http://localhost:3000',
      ),
    ).toBe('https://kolmatrix.example.com');
  });

  it('**绝不**用监听地址当跳转 host（standalone 下恒是 localhost:3000 → 反代后必断）', () => {
    const origin = resolveRequestOrigin(
      headersOf({ host: 'kolmatrix.example.com' }),
      'http://localhost:3000',
    );
    const loc = loginRedirectLocation('/admin/today', origin);
    expect(loc).toBe(
      'http://kolmatrix.example.com/login?callbackUrl=%2Fadmin%2Ftoday',
    );
    expect(loc).not.toContain('localhost');
  });
});

describe('M5-AUTH-RLS F003 — ③ matcher 覆盖面（摘一段就失守）', () => {
  const matchers = middlewareConfig.matcher;

  /** 本仓 matcher 采用 Next 的「正则串」写法，编译成 RegExp 即其匹配语义。 */
  const compiled = matchers.map((m) => new RegExp(`^${m}$`));
  const matches = (p: string): boolean => compiled.some((re) => re.test(p));

  it('matcher 是「全拦 + 负向排除」形态（新路由默认被守住）', () => {
    expect(matchers).toHaveLength(1);
    expect(matchers[0].startsWith('/((?!')).toBe(true);
  });

  it.each([...GUARDED_API_PATHS, ...GUARDED_PAGE_PATHS])(
    'matcher 覆盖 %s（不覆盖 = middleware 根本不执行 = 静默失守）',
    (p) => {
      expect(matches(p)).toBe(true);
    },
  );

  it.each([
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/favicon.ico',
    '/img/auth/auth.png',
    '/fonts/DMSans.woff2',
    '/manifest.json',
    '/robots.txt',
  ])('matcher 排除静态资源 %s（省去每张图跑一次 edge 函数）', (p) => {
    expect(matches(p)).toBe(false);
  });

  it('S-M5-2：public/ 下每个真实静态文件都被 matcher 排除（收窄后不得每张图跑一次 edge）', () => {
    const notExcluded = PUBLIC_FILE_PATHS.filter((p) => matches(p));
    expect(notExcluded, 'public/ 下这些真实文件会触发 edge 函数').toEqual([]);
  });

  it('**I-1**：matcher 与豁免清单两层同步收窄——matcher 排除的路径必须都是豁免路径', () => {
    // 两层各写一份正则很容易漂移（I-1 就是两层同时写宽）。这条把它们钉成同一语义：
    // matcher 漏掉 = middleware 不执行 = 事实上的放行，故它必须是豁免集的子集。
    const corpus = [
      ...GUARDED_API_PATHS,
      ...GUARDED_PAGE_PATHS,
      ...PUBLIC_FILE_PATHS,
      '/api/health',
      '/api/signals/inbound',
      '/login',
      '/signup',
      '/_next/static/chunks/main.js',
      '/favicon.ico',
    ];
    const silentlyPassed = corpus.filter((p) => !matches(p) && !isExemptPath(p));
    expect(silentlyPassed, '这些路径 matcher 不拦、豁免清单也不认 = 静默失守').toEqual([]);
  });

  it('豁免路径仍进 matcher（由豁免清单放行，而不是靠 matcher 漏掉——两道各司其职）', () => {
    for (const p of ['/login', '/signup', '/api/health', '/api/signals/inbound']) {
      expect(matches(p)).toBe(true);
      expect(isExemptPath(p)).toBe(true);
    }
  });
});
