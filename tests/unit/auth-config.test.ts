// M5-AUTH-RLS F001 — Auth.js 配置 / AUTH_SECRET / JWT 载荷 / dev seed 守门（spec D-1、§5）。
//
// 变异对照：
//   1. resolveAuthSecret 在生产缺 secret 时改成回落 dev 常量 → 「生产缺失即抛错」红
//   2. jwt callback 不写 tenantId → 「JWT 携带 userId+tenantId」红
//   3. session callback 不透出 → 「session 透出」红
//   4. session.strategy 改 database / pages.signIn 改别处 → 对应断言红
//   5. dev-user seed 去掉生产守门 → 「NODE_ENV=production 抛错」红

import { describe, it, expect } from 'vitest';
import {
  authBaseConfig,
  resolveAuthSecret,
  DEV_AUTH_SECRET_FALLBACK,
  LOGIN_PATH,
  SIGNUP_PATH,
  SESSION_MAX_AGE_SEC,
} from 'lib/auth/config';
import {
  assertDevSeedAllowed,
  resolveDevTestUserCredentials,
  DEV_TEST_USER_EMAIL,
  DEFAULT_DEV_TEST_USER_PASSWORD,
} from 'lib/auth/dev-seed';

describe('M5-AUTH-RLS F001 — AUTH_SECRET 解析', () => {
  it('显式配置优先', () => {
    expect(resolveAuthSecret({ AUTH_SECRET: 'real-secret' })).toBe('real-secret');
  });

  it('生产环境缺失 → 抛错停机（**不得**静默回落 dev 常量：那等于任何人可自签会话）', () => {
    expect(() =>
      resolveAuthSecret({ NODE_ENV: 'production' }),
    ).toThrow(/AUTH_SECRET/);
    expect(() =>
      resolveAuthSecret({
        NODE_ENV: 'production',
        AUTH_SECRET: '   ',
      }),
    ).toThrow(/AUTH_SECRET/);
  });

  it('非生产缺失 → 回落 dev 常量（本机零配置可跑）', () => {
    expect(resolveAuthSecret({})).toBe(
      DEV_AUTH_SECRET_FALLBACK,
    );
    expect(
      resolveAuthSecret({ NODE_ENV: 'development' }),
    ).toBe(DEV_AUTH_SECRET_FALLBACK);
  });
});

describe('M5-AUTH-RLS F001 — Auth.js 基座配置', () => {
  it('会话策略 = JWT（spec D-1 无 adapter 表）', () => {
    expect(authBaseConfig.session.strategy).toBe('jwt');
    expect(authBaseConfig.session.maxAge).toBe(SESSION_MAX_AGE_SEC);
  });

  it('未登录落点 = /login（与 F003 middleware 同一常量）', () => {
    expect(LOGIN_PATH).toBe('/login');
    expect(SIGNUP_PATH).toBe('/signup');
    expect(authBaseConfig.pages.signIn).toBe(LOGIN_PATH);
  });

  it('edge-safe：基座零 provider（middleware 侧不得把 Prisma/bcrypt 拖进 edge bundle）', () => {
    expect(authBaseConfig.providers).toEqual([]);
  });

  it('jwt callback 把 { userId, tenantId } 钉进 token；后续请求原样透传', () => {
    const jwt = authBaseConfig.callbacks.jwt;
    const first = jwt({
      token: { sub: 'user-1' },
      user: { id: 'user-1', email: 'a@b.co', tenantId: 'tenant-alpha' },
    } as never) as Record<string, unknown>;
    expect(first.userId).toBe('user-1');
    expect(first.tenantId).toBe('tenant-alpha');

    const later = jwt({ token: first, user: undefined } as never) as Record<
      string,
      unknown
    >;
    expect(later.userId).toBe('user-1');
    expect(later.tenantId).toBe('tenant-alpha');
  });

  it('JWT 载荷不含任何口令材料（JWT 对持有者可读）', () => {
    const token = authBaseConfig.callbacks.jwt({
      token: {},
      user: {
        id: 'user-1',
        email: 'a@b.co',
        tenantId: 'tenant-alpha',
        passwordHash: '$2b$12$should-never-be-copied',
      },
    } as never) as Record<string, unknown>;
    expect(JSON.stringify(token)).not.toContain('$2b$');
    expect(token.passwordHash).toBeUndefined();
  });

  it('session callback 透出 userId / tenantId（F004 租户注入的取数点）', () => {
    const session = authBaseConfig.callbacks.session({
      session: { user: { email: 'a@b.co' }, expires: '' },
      token: { userId: 'user-1', tenantId: 'tenant-alpha' },
    } as never) as { user: { id: string; tenantId: string } };
    expect(session.user.id).toBe('user-1');
    expect(session.user.tenantId).toBe('tenant-alpha');
  });
});

describe('M5-AUTH-RLS F001 — dev 测试用户 seed 守门（spec §5）', () => {
  it('NODE_ENV=production → 抛错（已知公开凭据禁止进生产库，无 escape hatch）', () => {
    expect(() =>
      assertDevSeedAllowed({ NODE_ENV: 'production' }),
    ).toThrow(/生产环境禁止/);
    // 试图用别的开关绕过也不行：判定只看 NODE_ENV
    expect(() =>
      assertDevSeedAllowed({
        NODE_ENV: 'production',
        ALLOW_DEV_USER: 'true',
        FORCE: '1',
      }),
    ).toThrow(/生产环境禁止/);
  });

  it('dev / test / CI（NODE_ENV 未设）→ 放行', () => {
    expect(() => assertDevSeedAllowed({})).not.toThrow();
    expect(() =>
      assertDevSeedAllowed({ NODE_ENV: 'development' }),
    ).not.toThrow();
    expect(() =>
      assertDevSeedAllowed({ NODE_ENV: 'test' }),
    ).not.toThrow();
  });

  it('默认凭据：dev 租户既有邮箱 + 满足 D-4 强度的口令（≥10 位含字母数字）', () => {
    const creds = resolveDevTestUserCredentials({});
    expect(creds.email).toBe(DEV_TEST_USER_EMAIL);
    expect(creds.password).toBe(DEFAULT_DEV_TEST_USER_PASSWORD);
    expect(creds.password.length).toBeGreaterThanOrEqual(10);
    expect(/[A-Za-z]/.test(creds.password)).toBe(true);
    expect(/\d/.test(creds.password)).toBe(true);
  });

  it('env 可覆盖，且邮箱规范化为小写', () => {
    const creds = resolveDevTestUserCredentials({
      DEV_TEST_USER_EMAIL: '  QA@Example.COM ',
      DEV_TEST_USER_PASSWORD: 'AnotherPass2026',
    });
    expect(creds.email).toBe('qa@example.com');
    expect(creds.password).toBe('AnotherPass2026');
  });
});
