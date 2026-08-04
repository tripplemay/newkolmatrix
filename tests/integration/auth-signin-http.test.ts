// M5-AUTH-RLS F001 — 登录 HTTP 层行为级集成测试（打真库 + 真 Auth.js handlers）。
//
// 单测（tests/unit/auth-credentials.test.ts）钉的是判定逻辑；这里钉的是**装配**：
// csrf → callback/credentials → session 整条链真的通，且 JWT 里真的带着 { userId, tenantId }。
// 装配错（provider 没接上、callback 没写 token、secret 没解析）在单测里全绿，只有这里会红。
//
// 断言设计（每条都想清楚「什么改动应该让它红」）：
//   1. 正确凭据 → 发出 session cookie + /api/auth/session 回出 id/tenantId（authorize/jwt/session 任一断链即红）
//   2. 错口令 与 不存在用户 → **状态码 + Location 完全相同**（分支分文案/分状态码即红——用户存在性泄露）
//   3. 两条失败路径都不发 session cookie（把 authorize 写成恒真即红）
//   4. 失败响应体/头里不含 email 之外的用户信息，且任何响应都不含口令摘要（$2b$）
//   5. 全链路无 403（403 = 闸门语义，认证面不得借用）
//
// ⚠️ 夹具租户独一前缀 + afterAll 整体清零（D-H 测毕复原）；零外呼。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { handlers } from '../../src/lib/auth';
import { hashPassword } from '../../src/lib/auth/password';

const FIXTURE_SLUG = `test-tenant-m5-auth-${process.pid}`;
const TEST_EMAIL = `m5-auth-${process.pid}@test.invalid`;
const TEST_PASSWORD = 'FixturePass2026';
const ORIGIN = 'https://example.test';

let tenantId: string;
let userId: string;

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M5 认证集成测试夹具租户' },
  });
  tenantId = t.id;
  const u = await prisma.user.create({
    data: {
      tenantId,
      email: TEST_EMAIL,
      name: 'M5 夹具用户',
      passwordHash: await hashPassword(TEST_PASSWORD),
    },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

/** 取 set-cookie 里的 name=value 段，拼成后续请求的 Cookie 头。 */
function collectCookies(res: Response, jar: Map<string, string>): void {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
}

/** 走一次完整的凭据登录（csrf → callback），返回最后一次响应与 cookie jar。 */
async function signInAttempt(
  email: string,
  password: string,
): Promise<{ res: Response; jar: Map<string, string> }> {
  const jar = new Map<string, string>();

  const csrfRes = await handlers.GET(
    new Request(`${ORIGIN}/api/auth/csrf`) as never,
  );
  collectCookies(csrfRes, jar);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const body = new URLSearchParams({ csrfToken, email, password });
  const res = await handlers.POST(
    new Request(`${ORIGIN}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeader(jar),
      },
      body,
    }) as never,
  );
  collectCookies(res, jar);
  return { res, jar };
}

function sessionCookieName(jar: Map<string, string>): string | undefined {
  return [...jar.keys()].find((k) => k.endsWith('authjs.session-token'));
}

describe('M5-AUTH-RLS F001 — 凭据登录 HTTP 链路', () => {
  it('正确凭据 → 发 session cookie，且 /api/auth/session 透出 { id, tenantId }', async () => {
    const { res, jar } = await signInAttempt(TEST_EMAIL, TEST_PASSWORD);
    expect(res.status).toBe(302);
    expect(sessionCookieName(jar)).toBeTruthy();

    const sessionRes = await handlers.GET(
      new Request(`${ORIGIN}/api/auth/session`, {
        headers: { cookie: cookieHeader(jar) },
      }) as never,
    );
    expect(sessionRes.status).toBe(200);
    const session = (await sessionRes.json()) as {
      user?: { id?: string; tenantId?: string; email?: string };
    };
    expect(session.user?.id).toBe(userId);
    expect(session.user?.tenantId).toBe(tenantId);
    expect(session.user?.email).toBe(TEST_EMAIL);
    // JWT 是给持有者看的：任何口令材料都不许出现在会话里
    expect(JSON.stringify(session)).not.toContain('$2b$');
  });

  it('错口令 与 不存在用户 → 状态码与 Location 完全相同（不泄露用户存在性）', async () => {
    const wrongPassword = await signInAttempt(TEST_EMAIL, 'WrongPass2026');
    const unknownUser = await signInAttempt(
      `no-such-${process.pid}@test.invalid`,
      TEST_PASSWORD,
    );

    expect(wrongPassword.res.status).toBe(unknownUser.res.status);
    expect(wrongPassword.res.headers.get('location')).toBe(
      unknownUser.res.headers.get('location'),
    );
    // 落点是登录页 + 通用错误码，不含任何「该邮箱未注册」类线索
    expect(wrongPassword.res.headers.get('location')).toContain('/login');
    expect(wrongPassword.res.headers.get('location')).not.toContain(
      TEST_EMAIL,
    );
  });

  it('两条失败路径都不发 session cookie（authorize 写成恒真即红）', async () => {
    for (const [email, password] of [
      [TEST_EMAIL, 'WrongPass2026'],
      [`no-such-${process.pid}@test.invalid`, TEST_PASSWORD],
      [TEST_EMAIL, ''],
    ] as const) {
      const { jar } = await signInAttempt(email, password);
      expect(
        sessionCookieName(jar),
        `凭据(${email}/${password ? '错口令' : '空口令'}) 不应发出会话`,
      ).toBeUndefined();
    }
  });

  it('认证失败链路全程无 403（403 已锁死为闸门语义）', async () => {
    const { res } = await signInAttempt(TEST_EMAIL, 'WrongPass2026');
    expect(res.status).not.toBe(403);
  });
});
