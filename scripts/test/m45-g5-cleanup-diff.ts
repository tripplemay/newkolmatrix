// M4.5-AGENT-LOOP verify-G5（Evaluator 产物，非产品代码）——按 before/after 快照差集精确回删
//
// 只删「after 有、before 没有」的行（id 显式列举，无模式匹配、无 where 通配），删完复拍快照核证归零。
// 用途：变异测试（/tmp/m45-mut-G5 worktree）跑失败的 e2e 会在 finally 里二次抛错 → 清理段整体
// 中断 → dev 租户留下夹具行；本脚本按差集把它们精确清回去。
//
// 用法：node --env-file=.env --import tsx scripts/test/m45-g5-cleanup-diff.ts <before.json> <after.json>

import { readFileSync } from 'node:fs';
import { prisma } from '../../src/lib/db/prisma';

interface Snap {
  logs: Array<{ id: string }>;
  pas: Array<{ id: string }>;
  shares: Array<{ id: string }>;
  handoffs: Array<{ id: string }>;
  projects: Array<{ id: string }>;
}

function added(before: Array<{ id: string }>, after: Array<{ id: string }>): string[] {
  const b = new Set(before.map((x) => x.id));
  return after.filter((x) => !b.has(x.id)).map((x) => x.id);
}

async function main(): Promise<void> {
  const [beforePath, afterPath] = process.argv.slice(2);
  const before = JSON.parse(readFileSync(beforePath, 'utf8')) as Snap;
  const after = JSON.parse(readFileSync(afterPath, 'utf8')) as Snap;

  const logIds = added(before.logs, after.logs);
  const shareIds = added(before.shares, after.shares);
  const handoffIds = added(before.handoffs, after.handoffs);
  const paIds = added(before.pas, after.pas);
  const projectIds = added(before.projects, after.projects);

  console.log(
    `[diff] logs=${logIds.length} shares=${shareIds.length} handoffs=${handoffIds.length} pending=${paIds.length} projects=${projectIds.length}`,
  );

  // 先删子表再删父表（外键顺序）
  const s = await prisma.shareLink.deleteMany({ where: { id: { in: shareIds } } });
  const l = await prisma.operationLog.deleteMany({ where: { id: { in: logIds } } });
  const h = await prisma.handoff.deleteMany({ where: { id: { in: handoffIds } } });
  const p = await prisma.pendingAction.deleteMany({ where: { id: { in: paIds } } });
  const pr = await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  console.log(
    `[deleted] shares=${s.count} logs=${l.count} handoffs=${h.count} pending=${p.count} projects=${pr.count}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
