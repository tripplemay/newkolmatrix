// M5-AUTH-RLS F004（spec D-3）— 会话租户注入的**负向断言 + 全仓普查钉**。
//
// 本文件守两件事，失效模式刻意不重叠：
//   ① 行为层：租户只能来自「登录会话」或「显式传入」，两者皆无 → **抛错**。
//      变异锚（acceptance 明列）：给无会话路径加回落 dev → 本文件第一组用例全红。
//   ② 源码层：HTTP 面（src/app/**）不得自己指定租户——普查扫全仓，新写的 route
//      无需登记在任何清单里就会被扫到。绕过会话的两种写法各有一条钉：
//        a. `buildToolContext({ tenantId: ... })`（把租户交给调用方 → 入参来自用户请求）
//        b. `systemContext('dev')` / `getDevTenantId()`（换个函数名回到硬编码租户）
//
// 【为什么行为层不 mock session-tenant 而是 mock `auth()`】mock 掉 session-tenant 等于
// 把被测对象本身换成假的：那样测的是「假模块抛错时 context 会抛错」，而不是
// 「没有会话时这条链会抛错」。这里只替换最外层的 next-auth `auth()`（真会话读不到 cookie
// 时返回什么，由 Auth.js 决定，不是本仓的行为），链上的 session-tenant → context 全是真的。

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 可变支点：模拟 `auth()` 的返回（null = 未登录）。vi.mock 提升 → 必须 vi.hoisted。 */
const authSeam = vi.hoisted(() => ({
  session: null as { user?: Record<string, unknown> } | null,
}));

vi.mock('../../src/lib/auth/index', () => ({
  auth: async () => authSeam.session,
}));

import {
  buildToolContext,
  systemContext,
  DEV_TENANT_SLUG,
} from '../../src/lib/agent/context';
import {
  MissingSessionTenantError,
  readSessionIdentity,
  requireSessionTenantId,
} from '../../src/lib/auth/session-tenant';

/* ================================================================== *
 * ① 行为层：租户来源只有两条路
 * ================================================================== */

describe('会话 → 租户解析（lib/auth/session-tenant）', () => {
  beforeEach(() => {
    authSeam.session = null;
  });

  it('未登录（auth() → null）→ readSessionIdentity 为 null，require* 抛 MissingSessionTenantError', async () => {
    expect(await readSessionIdentity()).toBeNull();
    await expect(requireSessionTenantId()).rejects.toBeInstanceOf(
      MissingSessionTenantError,
    );
  });

  it('会话带 tenantId → 解析出 { tenantId, actor=登录邮箱 }（spec D-3）', async () => {
    authSeam.session = {
      user: { id: 'u-1', email: 'Ops@Example.com', tenantId: 't-session' },
    };
    expect(await readSessionIdentity()).toEqual({
      tenantId: 't-session',
      actor: 'Ops@Example.com',
    });
  });

  it('会话无邮箱 → actor 回落 user:<id>（留痕永远有个人，不留空）', async () => {
    authSeam.session = { user: { id: 'u-2', tenantId: 't-session' } };
    expect((await readSessionIdentity())?.actor).toBe('user:u-2');
  });

  it('会话在但 tenantId 为空 → 视同无会话（JWT 缺租户不得当作有效会话，fail-closed）', async () => {
    authSeam.session = { user: { id: 'u-3', email: 'a@b.com', tenantId: '' } };
    expect(await readSessionIdentity()).toBeNull();
    await expect(requireSessionTenantId()).rejects.toBeInstanceOf(
      MissingSessionTenantError,
    );
  });
});

describe('buildToolContext 的租户来源（spec D-3 双路收敛）', () => {
  beforeEach(() => {
    authSeam.session = null;
  });

  it('🔒 无会话且未显式传租户 → 抛 MissingSessionTenantError，**不回落 dev 租户**', async () => {
    // 变异锚：把 catch → getDevTenantId() 的回落加回去，这条立刻红
    //（回落会返回一个合法 ctx，既不是抛错、更不是这个错误类型）
    await expect(buildToolContext()).rejects.toBeInstanceOf(
      MissingSessionTenantError,
    );
    await expect(buildToolContext({ agentId: 'orchestrator' })).rejects.toBeInstanceOf(
      MissingSessionTenantError,
    );
  });

  it('有会话 → ctx.tenantId / ctx.actor 来自会话（EXTENSION POINT 兑现）', async () => {
    authSeam.session = {
      user: { id: 'u-9', email: 'pm@kolmatrix.local', tenantId: 't-from-session' },
    };
    const ctx = await buildToolContext({ agentId: 'reach', projectId: 'p-1' });
    expect(ctx.tenantId).toBe('t-from-session');
    expect(ctx.actor).toBe('pm@kolmatrix.local');
    expect(ctx.agentId).toBe('reach');
    expect(ctx.projectId).toBe('p-1');
  });

  it('显式传租户 → **无条件使用**，即使当前有会话也不改道（注入缝纪律）', async () => {
    authSeam.session = {
      user: { id: 'u-9', email: 'pm@kolmatrix.local', tenantId: 't-from-session' },
    };
    const ctx = await buildToolContext({ tenantId: 't-explicit' });
    expect(ctx.tenantId).toBe('t-explicit');
    // actor 未给 → 显式路径不冒用会话身份（留痕如实标为系统）
    expect(ctx.actor).toBe('system');
  });

  it('显式传租户 + 无会话 → 不查会话即可成立（scheduler / scripts / seed 的那条路）', async () => {
    const ctx = await buildToolContext({ tenantId: 't-x', actor: 'system:job' });
    expect(ctx).toMatchObject({ tenantId: 't-x', actor: 'system:job' });
  });

  it('systemContext(slug) 对不存在的 slug 抛错并指名 slug（不静默给空租户）', async () => {
    const missing = `__no_such_tenant_${process.pid}__`;
    await expect(systemContext(missing)).rejects.toThrow(missing);
  });
});

/* ================================================================== *
 * ② 源码层普查（不从 F004 的修复点清单派生：自己扫全仓）
 * ================================================================== */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** 取 `fn(` 之后配平括号内的实参原文（用于判断有没有把租户传进去）。 */
function callArgsOf(src: string, fnName: string): string[] {
  const args: string[] = [];
  const needle = `${fnName}(`;
  let i = src.indexOf(needle);
  while (i !== -1) {
    let depth = 0;
    let j = i + needle.length - 1;
    for (; j < src.length; j += 1) {
      if (src[j] === '(') depth += 1;
      else if (src[j] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    args.push(src.slice(i + needle.length, j));
    i = src.indexOf(needle, j);
  }
  return args;
}

describe('普查钉：HTTP 面不得自己指定租户', () => {
  const appFiles = walk('src/app');

  it('模块级租户缓存 `_devTenantId` 已从全仓删除（串数据风险点，侦察点名）', () => {
    const hits = walk('src')
      .filter((f) => readFileSync(f, 'utf8').includes('_devTenantId'))
      .concat(
        walk('scripts').filter((f) =>
          readFileSync(f, 'utf8').includes('_devTenantId'),
        ),
      );
    expect(hits).toEqual([]);
  });

  it('src/app/** 不得给 buildToolContext 传 tenantId（租户不能由调用方决定）', () => {
    const offenders: string[] = [];
    for (const f of appFiles) {
      for (const args of callArgsOf(readFileSync(f, 'utf8'), 'buildToolContext')) {
        if (/\btenantId\b/.test(args)) offenders.push(`${f} → ${args.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('src/app/** 的显式租户路径只有一处豁免（webhook 自鉴权），其余必须走会话', () => {
    /**
     * 豁免清单**写死在这里**：要新增一个「不走会话」的 HTTP 面，必须改这个数组并写明理由。
     * 唯一在册者 = Resend webhook（svix 签名自鉴权、middleware 豁免、无浏览器会话）。
     */
    const EXEMPT = ['src/app/api/signals/inbound/route.ts'];
    const offenders = appFiles.filter((f) => {
      if (EXEMPT.includes(f)) return false;
      const src = readFileSync(f, 'utf8');
      return /\b(systemContext|systemTenantId|getDevTenantId)\s*\(/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('getDevTenantId 在 src/ 的调用点 ⊆ 已登记清单（F010 已收口：只剩定义处）', () => {
    /**
     * F004 口径：HTTP 面已全部收敛，剩下的都是**无会话面**。
     * **F010 已把 scheduler 的 4 处清掉**（改为注册表声明 tenantSlug + systemTenantId），
     * 故此处清单从 2 项收紧到 1 项——留下的那个就是函数定义自身。
     * 仍用**子集**断言而不是相等：将来若把这个 @deprecated 函数彻底删掉，本钉不会因此假红。
     */
    const ALLOWED = new Set(['src/lib/agent/context.ts']);
    const callers = walk('src').filter((f) =>
      /\bgetDevTenantId\s*\(/.test(readFileSync(f, 'utf8')),
    );
    expect(callers.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  it('DEV_TENANT_SLUG 仍是 dev（显式路径的入参口径，改动即语义变更）', () => {
    expect(DEV_TENANT_SLUG).toBe('dev');
  });
});
