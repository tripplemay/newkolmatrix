// M4.5-AGENT-LOOP fixing round1 — agentloop:e2e 清理段卫生回归钉
//
// 触发源：首轮验收 F010 PARTIAL 缺陷 ①（对抗复核 UPHELD）。
// 原状：`pendingIds` 先 `createdPA.push(...)` 后才 assert；闸门红线一回归，
// pendingActionId 就是 undefined → finally 首句 deleteMany({ in: [undefined] })
// 被 Prisma 拒 → **整个清理段中断**，且原始 `ASSERT FAIL` 被这个二次抛错盖掉。
// 后果双杀：红灯指向错误的地方 + dev 库被污染（下一个隔离 evaluator 会把残留
// 当成产品回归——同 patterns/testing-env-patterns.md §9 的 M3-A「today feed
// 基线污染误判」族）。而 e2e 失败在 fixing 轮里是常态，正是清理最该生效的时刻。
//
// 【为什么是源码级断言而不是行为级】被测物是个顶层执行 main() 的脚本，import 即跑，
// 无法在单测里安全驱动；而它的失败路径只有在产品代码被变异（闸门失效）时才出现。
// 故这里钉的是**结构不变量**：清理段不许再抛、id 清单不许混进 undefined。
// 行为级证据由 fixing 轮的隔离 worktree 实测提供（失败路径残留归零 + 首因可见）。
//
// 【为什么用 readFileSync 而不是 git grep】`git grep` 只搜**已跟踪**文件，新文件未
// commit 时恒空绿（M4.5 building 期踩过，见 project-status.md 关键技术坑）。

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { cleanupStep } from '../../scripts/test/cleanup-step';

const PATH = 'scripts/test/agentloop-e2e.ts';
const SRC = readFileSync(PATH, 'utf8');

/** 取 `} finally {` 到函数结束之间的清理段正文。 */
function finallyBlock(src: string): string {
  const start = src.indexOf('} finally {');
  expect(start, `${PATH} 没有 finally 清理段（结构变更须同步本测试）`).toBeGreaterThan(-1);
  return src.slice(start);
}

describe('agentloop:e2e 清理段卫生（F010 缺陷① 回归钉）', () => {
  it('清理段里每条 deleteMany 都包在 cleanupStep 里（清理段自身绝不可再抛）', () => {
    const block = finallyBlock(SRC);
    const naked = block
      .split('\n')
      .map((l, i) => [i, l] as const)
      // 裸露写法 = `await prisma.x.deleteMany(` 直接出现，而非 `cleanupStep(..., () => prisma...)`
      .filter(([, l]) => /await\s+prisma\.\w+\.deleteMany\(/.test(l));
    expect(
      naked.map(([, l]) => l.trim()),
      '清理段出现未包 cleanupStep 的裸 deleteMany —— 它一抛就会掩盖主流程首因并跳过后续清理',
    ).toEqual([]);
    // 正向证据：清理段确实在用 cleanupStep（防「把 deleteMany 全删了」式的假通过）
    expect(block.match(/cleanupStep\(/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it('cleanupStep 吞掉自身异常且不再抛（catch 内不得有 throw）', () => {
    // M4.7 F011：定义已抽到 scripts/test/cleanup-step.ts（两个 e2e 共用，且可被
    // 行为级单测直接驱动——见文件末尾）。本条保留为可读性好的第一道，非唯一防线。
    const m = readFileSync('scripts/test/cleanup-step.ts', 'utf8').match(
      /export async function cleanupStep\([\s\S]*?\n\}\n/,
    );
    expect(m, 'cleanupStep 定义缺失（结构变更须同步本测试）').toBeTruthy();
    const body = m![0];
    expect(body, 'cleanupStep 必须 try/catch').toMatch(/try\s*\{[\s\S]*catch/);
    expect(
      body.replace(/\/\/[^\n]*/g, ''),
      'cleanupStep 的 catch 里不得再抛——一抛就等于没包',
    ).not.toMatch(/throw/);
  });

  it('入清理清单的 pendingAction id 必经过滤（undefined 进数组 = Prisma 拒绝 = 清理中断）', () => {
    // 结构不变量：push 进 createdPA 的那个变量，必须由 .filter( 产出。
    const push = SRC.match(/createdPA\.push\(\.\.\.(\w+)\)/);
    expect(push, 'createdPA.push(...) 写法变更，须同步本测试').toBeTruthy();
    const pushed = push![1];
    const decl = new RegExp(
      String.raw`const ${pushed}\s*=[\s\S]{0,400}?\.filter\(`,
    );
    expect(
      SRC,
      `${pushed} 未经 .filter( 就被 push 进 createdPA —— 闸门回归时会混进 undefined`,
    ).toMatch(decl);
    // 反向：不得再出现 `pendingActionId!` 这种非空断言（正是原缺陷的写法）
    expect(
      SRC,
      'pendingActionId 上的 `!` 非空断言把 undefined 伪装成 string，正是原缺陷成因',
    ).not.toMatch(/pendingActionId!/);
  });

  it('ShareLink 清理不依赖 gateLogId（闸门回归时该字段为 null，恰好在最该清时落空）', () => {
    const block = finallyBlock(SRC);
    expect(
      block,
      'ShareLink 清理仍只按 gateLogId —— quarterly 分享 projectId 恒 null、' +
        '闸门失效时 gateLogId 也为 null，两把键同时落空会漏掉真实产物',
    ).not.toMatch(/shareLink\.deleteMany\([\s\S]{0,200}gateLogId/);
    expect(block, 'ShareLink 应按跑前 id 基线差集清').toMatch(
      /shareLink\.deleteMany\([\s\S]{0,300}notIn/,
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// M4.7 F011 — S-RV1-1/2/3 收口：**行为级**断言
//
// 上面那几条是源码级正则。M4.6 复验实测：三条全部可被写法绕过，且绕过后行为
// 等价于原缺陷（catch 改 return Promise.reject / 跨行 deleteMany / filter(()=>true)）。
// 规律：源码级正则的强度取决于你能想到多少种写法；行为级断言天然免疫写法。
// 源码级那几条保留（它们读起来直观、失败信息友好），但**不再是唯一防线**。
// ────────────────────────────────────────────────────────────────────────────
describe('cleanupStep 行为契约（免疫写法绕过）', () => {
  it('喂一个必抛的 fn → 仍然正常 resolve（不向外抛）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(
        cleanupStep('必抛步骤', async () => {
          throw new Error('m47 模拟：DB 故障');
        }),
      ).resolves.toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });

  it('失败要喊出来（不静默吞——静默 = 残留无人知晓）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await cleanupStep('会失败的一步', async () => {
        throw new Error('m47 模拟：唯一约束冲突');
      });
      expect(spy).toHaveBeenCalled();
      const msg = spy.mock.calls.flat().join(' ');
      expect(msg, '要说清哪一步失败了').toContain('会失败的一步');
      expect(msg, '要带上原始错误信息').toContain('唯一约束冲突');
    } finally {
      spy.mockRestore();
    }
  });

  it('前一步失败不影响后一步执行（这才是"不中断后续清理"的实质）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ran: string[] = [];
    try {
      await cleanupStep('第一步', async () => {
        ran.push('first');
        throw new Error('boom');
      });
      await cleanupStep('第二步', async () => {
        ran.push('second');
      });
      expect(ran).toEqual(['first', 'second']);
    } finally {
      spy.mockRestore();
    }
  });

  it('正常步骤照常执行并 resolve', async () => {
    const ran: string[] = [];
    await cleanupStep('正常步骤', async () => {
      ran.push('ok');
    });
    expect(ran).toEqual(['ok']);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// M4.7 F011 — O-G3-3 收口：人格名单里的工具名必须真的存在
//
// 来源：M4.5 G3 观察——`toAiSdkTools` 对未知工具名是**静默 continue**，人格名单
// 写错名字不会报错，只会让模型"看不见"该工具。此前靠每件新工具各写一条同源断言
// 兜住；这里加一条通用的，新工具不必再各写一遍。
// ────────────────────────────────────────────────────────────────────────────
describe('全人格工具名必在注册表（O-G3-3 收口）', () => {
  it('每个人格声明的每个工具名都能在注册表里查到', async () => {
    const { listPersonas } = await import('../../src/lib/agent/registry');
    const { getNativeToolNames } = await import('../../src/lib/agent/tools');
    const registered = new Set(getNativeToolNames());
    expect(registered.size, '注册表为空则本断言毫无意义').toBeGreaterThan(10);
    for (const p of listPersonas()) {
      for (const name of p.tools) {
        expect(
          registered.has(name),
          `人格 ${p.id} 声明了不存在的工具「${name}」——模型只会静默看不见它`,
        ).toBe(true);
      }
    }
  });
});
