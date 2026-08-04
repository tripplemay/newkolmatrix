// M5-AUTH-RLS F012 — 测试面登录态的行为级钉 + 前置链结构钉。
//
// 【为什么必须有这一层】F003 之后「没登录」不再是一个抽象风险，而是 23 条 playwright
// 用例当场 307 的既成事实。修法（storageState / e2e 登录步）本身很容易在后续批次被
// 顺手拆掉——拆掉之后最坏的形态不是红，而是**静默空跑**：登录失败仍写出一个 cookies: []
// 的 storageState、e2e 仍拿到一个「能用」的 dev 租户 ctx，然后所有断言在没有登录态的
// 前提下继续通过。故这里同时钉三样：
//   ① 失败路径必须抛且必须带可执行指引（行为级，注入假依赖直驱）
//   ② 两套 e2e 的登录步必须在建夹具**之前**（结构不变量，源码级 —— 脚本 import 即跑，
//      无法在单测里安全驱动，同 e2e-cleanup-hygiene.test.ts 的既定口径）
//   ③ CI 的前置链（seed 测试用户 + AUTH_SECRET）必须在 workflow 里真实存在（M4.7 规律 3：
//      「改了 yml」这句话必须有实读核证，故把核证做成断言）

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AuthorizeDeps, AuthUserRecord } from '../../src/lib/auth/credentials';
import {
  E2ESessionError,
  LOGIN_FAILED_PREFIX,
  SESSION_COOKIE_NAMES,
  STORAGE_STATE_PATH,
  assertSessionTenant,
  hasSessionCookie,
  loginE2ESession,
  loginFailureHint,
} from '../support/auth-session';

const USER: AuthUserRecord = {
  id: 'user-1',
  email: 'dev@newkolmatrix.local',
  tenantId: 'tenant-dev',
  passwordHash: '$2b$12$fixture',
};

/** 假依赖：找不找得到人、比对过不过，两个开关直驱四条失败/成功路径。 */
function deps(
  user: AuthUserRecord | null,
  passwordOk: boolean,
): AuthorizeDeps {
  return {
    findUserByEmail: async () => user,
    verifyPassword: async () => passwordOk,
  };
}

const ENV = {
  DEV_TEST_USER_EMAIL: 'dev@newkolmatrix.local',
  DEV_TEST_USER_PASSWORD: 'DevPassw0rd2026',
};

describe('loginE2ESession（e2e 的登录步）', () => {
  it('凭据正确 → 返回会话身份（userId / email / tenantId）', async () => {
    const session = await loginE2ESession({ deps: deps(USER, true), env: ENV });
    expect(session).toEqual({
      userId: 'user-1',
      email: 'dev@newkolmatrix.local',
      tenantId: 'tenant-dev',
    });
  });

  it('用户不存在 → 抛 E2ESessionError，且指引里有 seed 命令（不是一句 undefined）', async () => {
    const err = await loginE2ESession({ deps: deps(null, false), env: ENV }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(E2ESessionError);
    expect(err.message).toContain(LOGIN_FAILED_PREFIX);
    expect(
      err.message,
      '失败信息必须可执行：告诉人「跑 npm run seed:dev-user」，而不是只说失败',
    ).toContain('npm run seed:dev-user');
  });

  it('口令不匹配 → 同样抛（不得把「登录失败」降级成 warning 后继续跑）', async () => {
    const err = await loginE2ESession({ deps: deps(USER, false), env: ENV }).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(E2ESessionError);
  });

  it('老用户无口令摘要 → 抛（passwordHash 为 null 是 seed 没跑的典型形态）', async () => {
    const err = await loginE2ESession({
      deps: deps({ ...USER, passwordHash: null }, true),
      env: ENV,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(E2ESessionError);
  });

  it('依赖自身抛错（如 DB 连不上）→ 包成同族错误并带原因，不裸抛 Prisma 栈', async () => {
    const err = await loginE2ESession({
      deps: {
        findUserByEmail: async () => {
          throw new Error("Can't reach database server");
        },
        verifyPassword: async () => false,
      },
      env: ENV,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(E2ESessionError);
    expect(err.message).toContain("Can't reach database server");
    expect(err.message).toContain('AUTH_SECRET');
  });

  it('任何失败文案都不得含口令本体（D-4：口令任何形态都不进日志）', async () => {
    const secret = 'SuperSecret12345';
    const err = await loginE2ESession({
      deps: deps(null, false),
      env: { ...ENV, DEV_TEST_USER_PASSWORD: secret },
    }).catch((e) => e);
    expect(err.message).not.toContain(secret);
    expect(loginFailureHint('a@b.c')).not.toContain(secret);
  });
});

describe('hasSessionCookie（挡的是「登录失败但 storageState 照样写出来」）', () => {
  it('有非空会话 cookie → true', () => {
    expect(
      hasSessionCookie({ cookies: [{ name: SESSION_COOKIE_NAMES[0], value: 'jwt' }] }),
    ).toBe(true);
    expect(
      hasSessionCookie({ cookies: [{ name: SESSION_COOKIE_NAMES[1], value: 'jwt' }] }),
    ).toBe(true);
  });

  it('空 cookies / 空值 / 无关 cookie → false', () => {
    expect(hasSessionCookie({ cookies: [] })).toBe(false);
    expect(hasSessionCookie(null)).toBe(false);
    expect(
      hasSessionCookie({ cookies: [{ name: SESSION_COOKIE_NAMES[0], value: '' }] }),
      '空串 cookie 等于没登上',
    ).toBe(false);
    expect(
      hasSessionCookie({ cookies: [{ name: 'authjs.csrf-token', value: 'x' }] }),
      'csrf token 不是会话——认它就等于认了「未登录」',
    ).toBe(false);
  });
});

describe('assertSessionTenant（会话租户 ≠ ctx 租户即无效结论）', () => {
  it('一致 → 放行', () => {
    expect(() =>
      assertSessionTenant(
        { userId: 'u', email: 'e', tenantId: 't' },
        't',
      ),
    ).not.toThrow();
  });
  it('不一致 → 抛', () => {
    expect(() =>
      assertSessionTenant({ userId: 'u', email: 'e', tenantId: 't' }, 'other'),
    ).toThrow(E2ESessionError);
  });
});

/* ── ② 两套 e2e 的登录步：结构不变量 ─────────────────────────────────────── */

const E2E_SCRIPTS = [
  'scripts/test/agentloop-e2e.ts',
  'scripts/test/frontdesk-e2e.ts',
];

describe('e2e 脚本的登录步（拆掉即静默空跑，故钉结构）', () => {
  for (const path of E2E_SCRIPTS) {
    const src = readFileSync(path, 'utf8');

    it(`${path} 调用 loginE2ESession（登录步在场）`, () => {
      expect(
        src,
        '登录步被摘掉 = 脚本在没有登录态的前提下跑完并全绿',
      ).toMatch(/await\s+loginE2ESession\(/);
    });

    it(`${path} 的登录步在建夹具之前（先登录再动数据）`, () => {
      const login = src.indexOf('await loginE2ESession(');
      const fixture = src.indexOf('prisma.project.create(');
      expect(login, '未找到登录步').toBeGreaterThan(-1);
      expect(fixture, '未找到夹具创建（结构变更须同步本测试）').toBeGreaterThan(-1);
      expect(
        login,
        '登录失败时不得已经建过夹具——否则失败路径会在库里留下没人清的行',
      ).toBeLessThan(fixture);
    });

    it(`${path} 断言会话租户 = 执行上下文租户`, () => {
      expect(src).toMatch(/assertSessionTenant\(/);
    });
  }
});

/* ── ③ playwright / CI 前置链：实读核证 ─────────────────────────────────── */

describe('playwright storageState 前置链', () => {
  const config = readFileSync('playwright.config.ts', 'utf8');

  it('根配置引用共享的 storageState 路径常量（不另抄一个字面量）', () => {
    expect(config).toMatch(/STORAGE_STATE_PATH/);
    expect(config).toMatch(/storageState/);
  });

  it('主项目依赖 setup 项目（登录一次在所有用例之前）', () => {
    expect(config).toMatch(/dependencies:\s*\[\s*'setup'\s*\]/);
  });

  it('setup 项目自身不带登录态（否则登录用例在「已登录」下跑，等于自证）', () => {
    const setup = readFileSync('tests/visual/auth.setup.ts', 'utf8');
    expect(setup).toMatch(/storageState\(/);
    expect(setup, 'setup 必须校验 cookie 真的落下来了').toMatch(
      /hasSessionCookie\(/,
    );
  });

  it('storageState 落点已被 .gitignore 登记（生成产物不入库）', () => {
    expect(STORAGE_STATE_PATH).toMatch(/^tests\/\.auth\//);
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/\/tests\/\.auth\//);
  });
});

describe('CI 前置链（M4.7 规律 3：「已改 yml」必须有实读核证）', () => {
  const WORKFLOWS = [
    '.github/workflows/ci.yml',
    '.github/workflows/update-visual-baselines.yml',
  ];

  for (const wf of WORKFLOWS) {
    const yml = readFileSync(wf, 'utf8');

    it(`${wf} 跑视觉套件的 job 有 seed 测试用户步`, () => {
      expect(
        yml,
        'CI 没有测试用户 → storageState setup 登录失败 → 视觉门整体红',
      ).toMatch(/scripts\/seed\/dev-user\.ts/);
    });

    it(`${wf} 配了 AUTH_SECRET（standalone 恒 NODE_ENV=production，缺它登录必 500）`, () => {
      expect(yml).toMatch(/AUTH_SECRET:/);
    });
  }
});
