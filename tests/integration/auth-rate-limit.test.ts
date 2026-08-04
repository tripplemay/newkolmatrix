// M5-AUTH-RLS F006（spec D-4）— 登录 / 注册 fail-closed 限速 + 审计留痕（打真库 + 真 handlers）。
//
// 分两层，失效模式不重叠：
//   ① 判定层（注入时钟，零 DB）：阈值、窗口、5 分钟封禁、fail-closed 的两条异常路径。
//      注入 now 是必须的——真等 5 分钟的测试没人会跑，跑了也是 flaky。
//   ② HTTP + 留痕层（真库、真 Auth.js handlers、真 route）：429 的形状、Retry-After、
//      以及成/败/限速三类事件真的落到了 OperationLog（且只落元数据）。
//
// 【为什么留痕断言要打真库】写库这件事只有真库能证。mock 出来的 create 调用记录只能证明
// "调了一个叫 create 的函数"，证不了行落在哪个租户、字段里到底装了什么。

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '../../src/lib/db/prisma';
import { handlers } from '../../src/lib/auth';
import { hashPassword } from '../../src/lib/auth/password';
import { POST as authRoutePost } from '../../src/app/api/auth/[...nextauth]/route';
import { POST as registerPost } from '../../src/app/api/auth/register/route';
import {
  authRateLimitVerdict,
  LOGIN_ATTEMPT_LIMIT,
  LOGIN_BLOCK_MS,
  LOGIN_WINDOW_MS,
  RATE_LIMITED_MESSAGE,
  REGISTER_ATTEMPT_LIMIT,
  REGISTER_WINDOW_MS,
  type AuthRateLimiterDeps,
} from '../../src/lib/auth/rate-limit';
import {
  AUTH_AUDIT_ACTOR,
  AUTH_AUDIT_TENANT_SLUG,
} from '../../src/lib/auth/audit';
import {
  blockKey,
  blockStatus,
  checkRateLimit,
  clientIpOf,
  resetRateLimit,
} from '../../src/lib/http/rate-limit';

const TAG = `f006-${process.pid}`;
const PROBE_DOMAIN = `probe-${process.pid}.invalid`;
const FIXTURE_SLUG = `test-tenant-${TAG}`;
const TEST_EMAIL = `${TAG}-user@${PROBE_DOMAIN}`;
const TEST_PASSWORD = `RateLimit${process.pid}Pass1`;
const ORIGIN = 'http://127.0.0.1';

let tenantId: string;
const createdTenantIds = new Set<string>();

/** 每个用例一个独一 IP：进程内桶是全局的，共用 IP 会让用例互相污染。 */
const ipOf = (name: string): string => {
  // 203.0.113.0/24 是文档专用段（RFC 5737），且 clientIpOf 不会把它当内网段跳过
  let h = 0;
  for (const ch of `${TAG}-${name}`) h = (h * 31 + ch.charCodeAt(0)) % 250;
  return `203.0.113.${h + 1}`;
};

function req(url: string, ip: string, init: RequestInit = {}): NextRequest {
  const headers = new Headers(init.headers);
  headers.set('x-forwarded-for', ip);
  return new NextRequest(`${ORIGIN}${url}`, { ...init, headers } as never);
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: `M5 F006 夹具租户 ${process.pid}` },
  });
  tenantId = t.id;
  createdTenantIds.add(tenantId);
  await prisma.user.create({
    data: {
      tenantId,
      email: TEST_EMAIL,
      name: 'F006 夹具用户',
      passwordHash: await hashPassword(TEST_PASSWORD),
    },
  });
});

afterEach(() => {
  resetRateLimit();
  delete process.env.DISABLE_GATE_RATELIMIT;
});

afterAll(async () => {
  for (const id of createdTenantIds) {
    await prisma.operationLog.deleteMany({ where: { tenantId: id } });
    await prisma.user.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  /**
   * 第二层（**不从登记表派生**）：按探针域名普查全表。
   * 合法落点只有两个——夹具租户 与 审计占位租户；落到第三个地方的行即 stray。
   * **先量后清**（同 auth-register.test.ts 的理由）：本轮红，但不把残留留给下一轮。
   */
  const auditTenant = await prisma.tenant.findUnique({
    where: { slug: AUTH_AUDIT_TENANT_SLUG },
    select: { id: true },
  });
  const probeRows = await prisma.operationLog.findMany({
    where: { summary: { contains: PROBE_DOMAIN } },
    select: { tenantId: true },
  });
  const stray = probeRows.filter(
    (r) => r.tenantId !== auditTenant?.id && !createdTenantIds.has(r.tenantId),
  ).length;
  // 审计占位租户是**共享长存**的（不删租户本身），只清本文件写进去的行
  await prisma.operationLog.deleteMany({
    where: { summary: { contains: PROBE_DOMAIN } },
  });
  const residue = await prisma.operationLog.count({
    where: { summary: { contains: PROBE_DOMAIN } },
  });
  await prisma.$disconnect();
  expect({ stray, residue }).toEqual({ stray: 0, residue: 0 });
});

/* ================================================================== *
 * ① 判定层（注入时钟）
 * ================================================================== */

describe('阈值与窗口（spec D-4 定值，导出常量）', () => {
  it('登录 5/min + 封禁 5min；注册 3/min', () => {
    expect(LOGIN_ATTEMPT_LIMIT).toBe(5);
    expect(LOGIN_WINDOW_MS).toBe(60_000);
    expect(LOGIN_BLOCK_MS).toBe(5 * 60_000);
    expect(REGISTER_ATTEMPT_LIMIT).toBe(3);
    expect(REGISTER_WINDOW_MS).toBe(60_000);
  });
});

describe('登录限速：5/min 超限即封 5 分钟', () => {
  it('前 5 次放行，第 6 次拒并给出 ~5 分钟的 Retry-After', () => {
    const ip = ipOf('login-window');
    const r = req('/api/auth/callback/credentials', ip, { method: 'POST' });
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i += 1) {
      expect(authRateLimitVerdict('login', r, undefined, t0 + i).allowed).toBe(
        true,
      );
    }
    const denied = authRateLimitVerdict('login', r, undefined, t0 + 10);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(300);
  });

  it('🔒 封禁窗口内即使计数窗口已翻篇也照拒；封禁到期后恢复', () => {
    const ip = ipOf('login-block');
    const r = req('/api/auth/callback/credentials', ip, { method: 'POST' });
    const t0 = 1_800_000_000_000;
    for (let i = 0; i <= LOGIN_ATTEMPT_LIMIT; i += 1) {
      authRateLimitVerdict('login', r, undefined, t0 + i);
    }
    // 1 分钟计数窗口早过了，但封禁还在 → 仍拒（这是「封禁」区别于「限速」的地方）
    const during = authRateLimitVerdict('login', r, undefined, t0 + 61_000);
    expect(during.allowed).toBe(false);
    expect(during.reason).toBe('blocked');
    // 封禁到期 → 恢复
    expect(
      authRateLimitVerdict('login', r, undefined, t0 + LOGIN_BLOCK_MS + 1_000)
        .allowed,
    ).toBe(true);
  });

  it('不同 IP 互不影响（限速维度是 IP，clientIpOf 复用）', () => {
    const a = req('/api/auth/callback/credentials', ipOf('iso-a'), {
      method: 'POST',
    });
    const b = req('/api/auth/callback/credentials', ipOf('iso-b'), {
      method: 'POST',
    });
    const t0 = 1_800_000_000_000;
    for (let i = 0; i <= LOGIN_ATTEMPT_LIMIT; i += 1) {
      authRateLimitVerdict('login', a, undefined, t0 + i);
    }
    expect(authRateLimitVerdict('login', a, undefined, t0 + 10).allowed).toBe(
      false,
    );
    expect(authRateLimitVerdict('login', b, undefined, t0 + 10).allowed).toBe(
      true,
    );
  });
});

describe('🔒 fail-closed（与既有 fail-open 面的区别是显式设计）', () => {
  it('取不到客户端 IP → 拒绝（不是放行）', () => {
    const bare = new NextRequest(`${ORIGIN}/api/auth/callback/credentials`, {
      method: 'POST',
    } as never);
    const v = authRateLimitVerdict('login', bare);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('ip_unresolved');
  });

  it('🔒 限流器自身抛异常 → 拒绝（变异锚：改成 catch 后放行，本条红）', () => {
    const exploding: AuthRateLimiterDeps = {
      clientIpOf,
      blockStatus,
      blockKey,
      check: () => {
        throw new Error('注入的限流器故障');
      },
    };
    const v = authRateLimitVerdict(
      'login',
      req('/api/auth/callback/credentials', ipOf('boom'), { method: 'POST' }),
      exploding,
    );
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('limiter_error');
    expect(v.retryAfterSec).toBeGreaterThan(0);
  });

  it('🔒 无 escape hatch：DISABLE_GATE_RATELIMIT=true 时限速照常生效', () => {
    process.env.DISABLE_GATE_RATELIMIT = 'true';
    const ip = ipOf('no-escape');
    const r = req('/api/auth/register', ip, { method: 'POST' });
    const t0 = 1_800_000_000_000;
    for (let i = 0; i < REGISTER_ATTEMPT_LIMIT; i += 1) {
      expect(
        authRateLimitVerdict('register', r, undefined, t0 + i).allowed,
      ).toBe(true);
    }
    expect(authRateLimitVerdict('register', r, undefined, t0 + 5).allowed).toBe(
      false,
    );
  });
});

/* ================================================================== *
 * ② HTTP 层 + 留痕（真库）
 * ================================================================== */

/** 走一次真登录（csrf → 经**本批限速前置**的 route POST）。 */
async function loginViaRoute(
  ip: string,
  email: string,
  password: string,
): Promise<Response> {
  const csrfRes = await handlers.GET(
    new Request(`${ORIGIN}/api/auth/csrf`) as never,
  );
  const setCookie = csrfRes.headers.getSetCookie();
  const cookie = setCookie
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  return authRoutePost(
    req('/api/auth/callback/credentials', ip, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie,
      },
      body: new URLSearchParams({ csrfToken, email, password }).toString(),
    }),
  );
}

async function auditRows(where: { tenantId?: string; contains?: string }) {
  return prisma.operationLog.findMany({
    where: {
      ...(where.tenantId ? { tenantId: where.tenantId } : {}),
      ...(where.contains ? { summary: { contains: where.contains } } : {}),
      actor: AUTH_AUDIT_ACTOR,
    },
    select: { kind: true, summary: true, payloadJson: true, tenantId: true },
    orderBy: { createdAt: 'asc' },
  });
}

describe('登录留痕（成 / 败 / 限速）', () => {
  it('登录成功 → 该用户租户落一行 [auth] login ok', async () => {
    const before = (await auditRows({ tenantId })).length;
    const res = await loginViaRoute(ipOf('login-ok'), TEST_EMAIL, TEST_PASSWORD);
    expect(res.status).toBe(302);
    const rows = await auditRows({ tenantId });
    expect(rows.length).toBe(before + 1);
    expect(rows.at(-1)).toMatchObject({
      kind: 'auto',
      summary: `[auth] login ok domain=${PROBE_DOMAIN}`,
      tenantId,
    });
  });

  it('口令错 → 落在**被尝试账号所在租户**，kind=block', async () => {
    const before = (await auditRows({ tenantId })).length;
    const res = await loginViaRoute(
      ipOf('login-bad'),
      TEST_EMAIL,
      'WrongPassw0rd!',
    );
    expect(res.status).toBe(302); // Auth.js 协议：表单 POST 恒 302（spec 裁-1）
    const rows = await auditRows({ tenantId });
    expect(rows.length).toBe(before + 1);
    expect(rows.at(-1)).toMatchObject({
      kind: 'block',
      summary: `[auth] login invalid_credentials domain=${PROBE_DOMAIN}`,
    });
  });

  it('未知邮箱（扫号）→ 落审计占位租户，不落任何真实租户', async () => {
    const unknown = `${TAG}-nobody@${PROBE_DOMAIN}`;
    await loginViaRoute(ipOf('login-unknown'), unknown, 'WhateverPass1');

    const auditTenant = await prisma.tenant.findUnique({
      where: { slug: AUTH_AUDIT_TENANT_SLUG },
      select: { id: true },
    });
    expect(auditTenant).not.toBeNull();
    const rows = await auditRows({
      tenantId: auditTenant!.id,
      contains: PROBE_DOMAIN,
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.at(-1)!.summary).toBe(
      `[auth] login invalid_credentials domain=${PROBE_DOMAIN}`,
    );
    // 占位租户没有任何用户 → 任何会话的 tenantId 都不可能等于它
    expect(
      await prisma.user.count({ where: { tenantId: auditTenant!.id } }),
    ).toBe(0);
  });

  it('🔒 登录超限 → 429 + 可被 signIn() 解析的响应体 + 限速留痕', async () => {
    const ip = ipOf('login-429');
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i += 1) {
      await loginViaRoute(ip, TEST_EMAIL, 'WrongPassw0rd!');
    }
    const res = await loginViaRoute(ip, TEST_EMAIL, TEST_PASSWORD);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();

    // next-auth 客户端会 `new URL(data.url)` 并读 error/code —— 缺一个就退化成「登录失败」
    const body = (await res.json()) as { url?: string; code?: string };
    const url = new URL(body.url!);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('code')).toBe('rate_limited');

    const rows = await auditRows({ contains: PROBE_DOMAIN });
    expect(
      rows.some((r) => r.summary === `[auth] login rate_limited domain=${PROBE_DOMAIN}`),
    ).toBe(true);
    // 被限速的那一次**没有**走到凭据判定：正确口令也没换到会话
    expect(res.headers.getSetCookie().join()).not.toContain('session-token');
  });
});

describe('注册限速（3/min）', () => {
  const registerBody = (n: number) =>
    JSON.stringify({
      tenantName: `${TAG}-reg-${n}`,
      email: `${TAG}-reg-${n}@${PROBE_DOMAIN}`,
      password: `RegPassw0rd${process.pid}`,
    });

  it('🔒 第 4 次 → 429 + 用户可读文案 + Retry-After + 限速留痕', async () => {
    const ip = ipOf('register-429');
    for (let n = 0; n < REGISTER_ATTEMPT_LIMIT; n += 1) {
      const res = await registerPost(
        req('/api/auth/register', ip, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: registerBody(n),
        }),
      );
      expect(res.status).toBe(201);
      const { tenantId: newTenant } = (await res.json()) as {
        tenantId: string;
      };
      createdTenantIds.add(newTenant);
    }

    const res = await registerPost(
      req('/api/auth/register', ip, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: registerBody(99),
      }),
    );
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toBe(
      RATE_LIMITED_MESSAGE,
    );
    expect(res.headers.get('Retry-After')).toBeTruthy();
    // 被限速的那次没有落任何账号
    expect(
      await prisma.user.count({
        where: { email: `${TAG}-reg-99@${PROBE_DOMAIN}` },
      }),
    ).toBe(0);

    const rows = await auditRows({ contains: PROBE_DOMAIN });
    expect(
      rows.some(
        (r) => r.summary === `[auth] register rate_limited domain=${PROBE_DOMAIN}`,
      ),
    ).toBe(true);
  });
});

describe('🔒 留痕隐私（与 F005 同一条红线）', () => {
  it('全部认证留痕都不含口令 / 邮箱本地部分', async () => {
    const rows = await auditRows({ contains: PROBE_DOMAIN });
    expect(rows.length).toBeGreaterThan(0);
    const raw = JSON.stringify(rows);
    expect(raw, '留痕泄露了口令').not.toContain(TEST_PASSWORD);
    expect(raw, '留痕泄露了邮箱本地部分').not.toContain(`${TAG}-user`);
    expect(raw, '留痕泄露了口令摘要').not.toContain('$2b$');
    expect(raw).toContain(PROBE_DOMAIN);
  });
});
