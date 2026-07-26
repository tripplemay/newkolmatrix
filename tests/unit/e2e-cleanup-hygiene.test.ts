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
import { describe, expect, it } from 'vitest';

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
    const m = SRC.match(
      /async function cleanupStep\([\s\S]*?\n\}\n/,
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
