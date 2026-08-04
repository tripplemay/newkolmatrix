// M5-AUTH-RLS F001 — 凭据判定行为级测试（spec D-1）。
//
// 全部走真 bcrypt（cost 12，故本文件比一般单测慢 ~1s；这是刻意的：换成 mock 比对就测不出
// 「authorize 改明文比对」这类变异）。用户查询以 deps 注入的假仓库驱动，不需要活 DB。
//
// 变异对照（每条断言先想清楚「什么改动应该让它红」）：
//   1. authorizeCredentials 改成 `password === user.passwordHash` 明文比对 → 「正确口令登录成功」红
//   2. 未命中分支去掉等时比对 → 「不存在用户也跑一次比对」红
//   3. 「用户不存在」返回不同错误/文案 → 「三条失败路径同一对外结果」红
//   4. BCRYPT_COST 调低 → 「摘要 cost 前缀 = 12」红

import { describe, it, expect, vi } from 'vitest';
import {
  authorizeCredentials,
  normalizeEmail,
  credentialsInputSchema,
  INVALID_CREDENTIALS_MESSAGE,
  type AuthUserRecord,
  type AuthorizeDeps,
} from 'lib/auth/credentials';
import {
  hashPassword,
  verifyPassword,
  BCRYPT_COST,
  TIMING_EQUALIZER_HASH,
} from 'lib/auth/password';

const GOOD_PASSWORD = 'CorrectHorse2026';
const TENANT_ID = 'tenant-alpha';

async function makeUser(
  overrides: Partial<AuthUserRecord> = {},
): Promise<AuthUserRecord> {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    tenantId: TENANT_ID,
    passwordHash: await hashPassword(GOOD_PASSWORD),
    ...overrides,
  };
}

function makeDeps(user: AuthUserRecord | null): AuthorizeDeps & {
  findUserByEmail: ReturnType<typeof vi.fn>;
  verifyPassword: ReturnType<typeof vi.fn>;
} {
  return {
    findUserByEmail: vi.fn(async (email: string) =>
      user && user.email === email ? user : null,
    ),
    verifyPassword: vi.fn(verifyPassword),
  };
}

describe('M5-AUTH-RLS F001 — bcrypt 口令摘要', () => {
  it('cost 固定为 12，且摘要串本身带 $2b$12$ 前缀（调低 cost 即红）', async () => {
    expect(BCRYPT_COST).toBe(12);
    const hash = await hashPassword(GOOD_PASSWORD);
    expect(hash.startsWith('$2b$12$')).toBe(true);
  });

  it('摘要不可逆：库里存的绝不是明文', async () => {
    const hash = await hashPassword(GOOD_PASSWORD);
    expect(hash).not.toContain(GOOD_PASSWORD);
    expect(await verifyPassword(GOOD_PASSWORD, hash)).toBe(true);
    expect(await verifyPassword('CorrectHorse2027', hash)).toBe(false);
  });

  it('空摘要 / 非法摘要 → false，不抛', async () => {
    expect(await verifyPassword(GOOD_PASSWORD, '')).toBe(false);
    expect(await verifyPassword(GOOD_PASSWORD, 'not-a-bcrypt-hash')).toBe(false);
  });

  it('等时靶子不是任何真实口令的摘要', async () => {
    expect(await verifyPassword(GOOD_PASSWORD, TIMING_EQUALIZER_HASH)).toBe(
      false,
    );
    expect(TIMING_EQUALIZER_HASH.startsWith('$2b$12$')).toBe(true);
  });
});

describe('M5-AUTH-RLS F001 — authorizeCredentials 行为', () => {
  it('正确邮箱+口令 → 返回 { id, email, tenantId }（明文比对变异在此翻红）', async () => {
    const user = await makeUser();
    const deps = makeDeps(user);
    const result = await authorizeCredentials(
      { email: 'alice@example.com', password: GOOD_PASSWORD },
      deps,
    );
    expect(result).toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      tenantId: TENANT_ID,
    });
  });

  it('邮箱大小写 / 空格变体同样登录成功（规范化统一入口）', async () => {
    const user = await makeUser();
    const deps = makeDeps(user);
    const result = await authorizeCredentials(
      { email: '  Alice@Example.COM ', password: GOOD_PASSWORD },
      deps,
    );
    expect(result?.id).toBe('user-1');
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
  });

  it('错口令 → null', async () => {
    const user = await makeUser();
    const deps = makeDeps(user);
    expect(
      await authorizeCredentials(
        { email: 'alice@example.com', password: 'WrongPassword2026' },
        deps,
      ),
    ).toBeNull();
  });

  it('不存在的用户 → null，且与错口令**完全同一对外结果**（不泄露用户存在性）', async () => {
    const user = await makeUser();
    const wrongPasswordResult = await authorizeCredentials(
      { email: 'alice@example.com', password: 'WrongPassword2026' },
      makeDeps(user),
    );
    const unknownUserResult = await authorizeCredentials(
      { email: 'nobody@example.com', password: GOOD_PASSWORD },
      makeDeps(user),
    );
    expect(unknownUserResult).toStrictEqual(wrongPasswordResult);
    expect(unknownUserResult).toBeNull();
    // 单一文案常量：任何按分支分文案的改动都得先删掉这条断言
    expect(INVALID_CREDENTIALS_MESSAGE).toBe('邮箱或密码不正确');
  });

  it('不存在的用户也跑一次口令比对（等时，防用户名枚举）', async () => {
    const deps = makeDeps(null);
    await authorizeCredentials(
      { email: 'nobody@example.com', password: GOOD_PASSWORD },
      deps,
    );
    expect(deps.verifyPassword).toHaveBeenCalledTimes(1);
    expect(deps.verifyPassword.mock.calls[0][1]).toBe(TIMING_EQUALIZER_HASH);
  });

  it('老用户（passwordHash 为 null，expand 迁移不动的既有行）→ null，不得当作空口令放行', async () => {
    const user = await makeUser({ passwordHash: null });
    const deps = makeDeps(user);
    expect(
      await authorizeCredentials(
        { email: 'alice@example.com', password: '' },
        deps,
      ),
    ).toBeNull();
    expect(
      await authorizeCredentials(
        { email: 'alice@example.com', password: GOOD_PASSWORD },
        deps,
      ),
    ).toBeNull();
  });

  it('畸形入参（缺字段 / 非字符串 / 超长）→ null，且不打 DB', async () => {
    const deps = makeDeps(await makeUser());
    for (const bad of [
      undefined,
      null,
      {},
      { email: 'alice@example.com' },
      { email: 123, password: GOOD_PASSWORD },
      { email: 'alice@example.com', password: 'x'.repeat(201) },
      { email: 'a'.repeat(321), password: GOOD_PASSWORD },
    ]) {
      expect(await authorizeCredentials(bad, deps)).toBeNull();
    }
    expect(deps.findUserByEmail).not.toHaveBeenCalled();
  });

  it('zod schema 直核：口令长度上限 200（bcrypt DoS 面收口）', () => {
    expect(
      credentialsInputSchema.safeParse({
        email: 'a@b.co',
        password: 'x'.repeat(200),
      }).success,
    ).toBe(true);
    expect(
      credentialsInputSchema.safeParse({
        email: 'a@b.co',
        password: 'x'.repeat(201),
      }).success,
    ).toBe(false);
  });
});
