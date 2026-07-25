// M4.5-AGENT-LOOP verify-G5（Evaluator 产物，非产品代码）——dev 租户留痕快照器
//
// 用途：在跑 `npm run agentloop:e2e` 前后各拍一次快照，机械比对该脚本是否对 dev 租户
// 留下残留行（对照 framework/patterns/testing-env-patterns.md §9：mock 副作用的观测标记行
// 各有自己的 ref 语义，清态不能假设全挂在 PA.id 上）。
//
// 只读：本脚本自身不写任何一行（唯一例外是把快照 JSON 落到 /tmp）。
//
// 用法：node --env-file=.env --import tsx scripts/test/m45-g5-db-snapshot.ts <out.json>

import { prisma } from '../../src/lib/db/prisma';

async function main(): Promise<void> {
  const out = process.argv[2];
  if (!out) throw new Error('用法：... m45-g5-db-snapshot.ts <out.json>');

  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!tenant) throw new Error('dev 租户不存在');
  const tenantId = tenant.id;

  const [logs, pas, shares, handoffs, projects, tenants] = await Promise.all([
    prisma.operationLog.findMany({
      where: { tenantId },
      select: { id: true, kind: true, summary: true, ref: true, projectId: true },
      orderBy: { id: 'asc' },
    }),
    prisma.pendingAction.findMany({
      where: { tenantId },
      select: { id: true, toolName: true, status: true },
      orderBy: { id: 'asc' },
    }),
    prisma.shareLink.findMany({
      where: { tenantId },
      select: { id: true, gateLogId: true },
      orderBy: { id: 'asc' },
    }),
    prisma.handoff.findMany({
      where: { tenantId },
      select: { id: true, fromAgent: true, toAgent: true },
      orderBy: { id: 'asc' },
    }),
    prisma.project.findMany({
      where: { tenantId },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    }),
    prisma.tenant.findMany({ select: { id: true, slug: true } }),
  ]);

  const snap = {
    takenAt: new Date().toISOString(),
    tenantId,
    tenantSlug: tenant.slug,
    counts: {
      operationLog: logs.length,
      pendingAction: pas.length,
      shareLink: shares.length,
      handoff: handoffs.length,
      project: projects.length,
      tenantsTotal: tenants.length,
    },
    logs,
    pas,
    shares,
    handoffs,
    projects,
    tenants,
  };
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, JSON.stringify(snap, null, 2));
  console.log(
    `[snapshot] tenant=${tenant.slug} logs=${logs.length} pending=${pas.length} share=${shares.length} handoff=${handoffs.length} project=${projects.length} tenants=${tenants.length} → ${out}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
