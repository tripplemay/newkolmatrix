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

import { describe, it, expect } from 'vitest';
import {
  EXEMPT_RULE_IDS,
  EXEMPT_RULES,
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
];

const GUARDED_PAGE_PATHS = [
  '/',
  '/admin',
  '/admin/today',
  '/admin/creators',
  '/admin/campaigns/abc',
  '/preview/agent-loop',
];

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

  it('豁免规则没有「通配一切」的写法（前缀 / 后缀正则都不得匹配裸路径）', () => {
    for (const rule of EXEMPT_RULES) {
      if (rule.kind === 'prefix') expect(rule.path.length).toBeGreaterThan(1);
      if (rule.kind === 'suffix-regex') {
        expect(rule.pattern.test('/api/projects')).toBe(false);
        expect(rule.pattern.test('/admin/today')).toBe(false);
      }
    }
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
  ])('matcher 排除静态资源 %s（省去每张图跑一次 edge 函数）', (p) => {
    expect(matches(p)).toBe(false);
  });

  it('豁免路径仍进 matcher（由豁免清单放行，而不是靠 matcher 漏掉——两道各司其职）', () => {
    for (const p of ['/login', '/signup', '/api/health', '/api/signals/inbound']) {
      expect(matches(p)).toBe(true);
      expect(isExemptPath(p)).toBe(true);
    }
  });
});
