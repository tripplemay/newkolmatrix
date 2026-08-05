// M5-AUTH-RLS F010（spec D-3 无会话面）— scheduler / scripts 的租户收敛**终态普查**。
//
// 本文件回答一个问题：仓里还有没有「跑起来才知道作用在哪个租户上」的代码？
// D-3 的要求是双路收敛后不留第三条路——HTTP 面走会话，无会话面**显式指名租户**。
// 于是这里钉三件事：
//   ① 例程注册表每条都在**注册处**声明 tenantSlug（读注册表就知道谁作用于谁）
//   ② scheduler 与 scripts 里不再有 getDevTenantId 调用（把租户藏进函数名的那种写法）
//   ③ scripts 里凡是要租户 id 的，都经 systemContext / systemTenantId 显式路径
//
// 【为什么源码普查这种弱断言也留着】它挡的不是逻辑错误，是**回潮**：下一个人想在
// scheduler 里加一条例程时最省事的写法就是抄一份旧的。行为级证据另有其文
//（tests/integration/routine-tenant-explicit.test.ts：拿不到显式租户就抛，不回落 dev）。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_TENANT_SLUG } from '../../src/lib/agent/context';
import { ROUTINES } from '../../src/lib/jobs/scheduler';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

const scriptFiles = walk('scripts');

/**
 * 两个**只读快照/普查器**，文件头自述「Evaluator 产物，非产品代码」。
 *
 * 它们各自直接查库拿 dev 租户（一个按 slug、一个取最早创建的那条），既不经显式解析器、
 * 也不建租户，因此会落进下面那条断言的网里。**本域（Generator）刻意不改它们**：
 * 跨角色产物的所有权归 Evaluator，静默改别人的取证工具比留一条登记在册的豁免更糟。
 * 影响面也确实止于诊断——它们只读、不参与任何产品代码路径。
 *
 * 豁免写死在这里 = 它是可见的、要动必须改这个数组；已在 F010 handoff 里报给 Planner/Evaluator
 * 决定是否随后收编（`m45-g5-db-snapshot.ts` 的「最早创建的租户」才是真正的隐式取法）。
 */
const EXEMPT_EVALUATOR_SNAPSHOTS = [
  'scripts/test/m45-g5-db-snapshot.ts',
  'scripts/test/m47-g4-db-census.ts',
];

describe('F010 ① 例程注册表：租户写在注册处', () => {
  it('每条例程都声明了非空 tenantSlug', () => {
    expect(ROUTINES.length).toBeGreaterThanOrEqual(4);
    const missing = ROUTINES.filter((r) => !r.tenantSlug?.trim()).map((r) => r.name);
    expect(missing).toEqual([]);
  });

  it('当前四条例程均作用于 dev 租户（现语义的显式写明；改这里 = 语义变更）', () => {
    expect(ROUTINES.map((r) => `${r.name}:${r.tenantSlug}`).sort()).toEqual(
      ['health-scan', 'kol-sync', 'nightly-screen', 'weekly-draft']
        .map((n) => `${n}:${DEV_TENANT_SLUG}`)
        .sort(),
    );
  });

  it('run 的入参签名带 tenantSlug —— 执行体拿不到"默认租户"，只能用调度层给的那个', () => {
    // 函数 arity：() => ... 是 0，(tenantSlug) => ... 是 1。
    // 这条断言的鉴别力在于：把某条例程改回 `run: async () => { ... getDevTenantId() }`
    // 时它当场红（arity 掉回 0）。
    expect(ROUTINES.map((r) => r.run.length)).toEqual(ROUTINES.map(() => 1));
  });
});

describe('F010 ② 终态普查：getDevTenantId 调用点', () => {
  it('scheduler 与 scripts 下零调用点', () => {
    const callers = [...walk('src'), ...scriptFiles].filter((f) =>
      /\bgetDevTenantId\s*\(/.test(readFileSync(f, 'utf8')),
    );
    // 只允许定义自身（@deprecated，仅为既有测试夹具保留）
    expect(callers.filter((f) => f !== 'src/lib/agent/context.ts')).toEqual([]);
  });
});

describe('F010 ③ scripts 的租户来源只有显式一条', () => {
  it('scripts 一律不再 import getDevTenantId（比调用面早一步的拦截）', () => {
    const offenders = scriptFiles.filter((f) =>
      /import[^;]*\bgetDevTenantId\b[^;]*from/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('凡解析租户的脚本，要么走显式解析器，要么自己建租户（白名单显式登记）', () => {
    /**
     * 「解析租户」判据 = 把租户 id 绑到变量上（`const tenantId = ...`）。刻意不匹配
     * `tenantId: true` 这类 select 投影——普查类脚本（m48-eval-*）读的是全租户的
     * tenantId 列，它们不解析租户（初版正则误伤过这两个文件，已收窄）。
     *
     * 放行的两类：
     *   ① 走显式解析器：systemContext / systemTenantId / tenantIdBySlug
     *   ② 自己建租户：夹具脚本 tenant.create / tenant.upsert 后拿 .id —— 租户就是它造的，
     *      不存在"从哪继承来的"问题
     * 其余一律进 offenders：**要新增一种租户来源，必须改这条断言**，不能悄悄加。
     */
    const offenders = scriptFiles.filter((f) => {
      if (EXEMPT_EVALUATOR_SNAPSHOTS.includes(f)) return false;
      const src = readFileSync(f, 'utf8');
      if (!/\b(?:const|let|var)\s+tenantId\s*=/.test(src)) return false;
      const explicitResolver = /\b(systemContext|systemTenantId|tenantIdBySlug)\s*\(/.test(src);
      const buildsOwnTenant = /\btenant\.(create|upsert)\s*\(/.test(src);
      return !explicitResolver && !buildsOwnTenant;
    });
    expect(offenders).toEqual([]);
  });

  it('scripts 里没有裸 buildToolContext()（无会话进程里它必抛，等于把脚本写成必炸）', () => {
    const offenders = scriptFiles.filter((f) =>
      /\bbuildToolContext\s*\(\s*\)/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
