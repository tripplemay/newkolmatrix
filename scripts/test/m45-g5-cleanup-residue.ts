// M4.5-AGENT-LOOP verify-G5（Evaluator 产物，非产品代码）——精确回删本次验收在 dev 租户留下的残留行
//
// 背景：`npm run agentloop:e2e` 的 finally 清理段按 {ref ∈ createdPA} / {id ∈ createdLogs} /
// {projectId = 夹具项目} 三键删除，但 mock 分享通道的 SHARE_CREATED 标记行 ref=null、
// projectId=null（三键全不命中）→ 每跑净增 2 行留在 dev 租户。
// 对照 framework/patterns/testing-env-patterns.md §9（清态必须按业务标记清，不能只按 ref=PA.id 清）。
//
// 本脚本只删**显式传入的 id**（由 before/after 快照 diff 得出），不做任何模式匹配删除。
//
// 用法：node --env-file=.env --import tsx scripts/test/m45-g5-cleanup-residue.ts <id> [<id>...]

import { prisma } from '../../src/lib/db/prisma';

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  if (ids.length === 0) throw new Error('需传入待删除的 OperationLog id');
  const rows = await prisma.operationLog.findMany({
    where: { id: { in: ids } },
    select: { id: true, kind: true, summary: true },
  });
  for (const r of rows) console.log(`[del] ${r.id} ${r.kind} ${r.summary.slice(0, 60)}`);
  const res = await prisma.operationLog.deleteMany({ where: { id: { in: ids } } });
  console.log(`[cleanup] deleted=${res.count} requested=${ids.length}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
