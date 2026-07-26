// M4.7-FRONTDESK 验收（G4）— dev 库逐表普查（Evaluator 产物，只读）
//
// 用途：在跑 e2e 之前/之后各拍一张逐表快照，用于核证 F009 acceptance 里
// 「软引用表（OperationLog / Handoff）逐表清 + 逐表断言残留」这一条到底成立与否。
//
// 只读：不写任何行。输出 JSON 到 stdout。
//   node --env-file=.env --import tsx scripts/test/m47-g4-db-census.ts <label>

import { prisma } from '../../src/lib/db/prisma';

async function main(): Promise<void> {
  const label = process.argv[2] ?? '(no-label)';
  const dev = await prisma.tenant.findFirst({ where: { slug: 'dev' } });
  const tenantId = dev?.id ?? '__none__';
  const census = {
    label,
    at: new Date().toISOString(),
    devTenantId: tenantId,
    tenants: await prisma.tenant.count(),
    project: await prisma.project.count({ where: { tenantId } }),
    handoff: await prisma.handoff.count({ where: { tenantId } }),
    operationLog: await prisma.operationLog.count({ where: { tenantId } }),
    pendingActionTotal: await prisma.pendingAction.count({
      where: { tenantId },
    }),
    pendingActionPending: await prisma.pendingAction.count({
      where: { tenantId, status: 'pending' },
    }),
    shareLink: await prisma.shareLink.count({ where: { tenantId } }),
    weeklyReport: await prisma.weeklyReport.count({ where: { tenantId } }),
    // 本轮验收关心的三类留痕标记
    shareCreatedMarks: await prisma.operationLog.count({
      where: {
        tenantId,
        summary: { contains: 'create_share_link:SHARE_CREATED' },
      },
    }),
    consultFailedMarks: await prisma.operationLog.count({
      where: { tenantId, summary: { contains: 'consult_specialist:FAILED' } },
    }),
    // 疑似夹具残留（本批两个 e2e 的命名前缀）
    e2eProjects: await prisma.project.count({
      where: { tenantId, name: { contains: 'e2e' } },
    }),
  };
  console.log(JSON.stringify(census, null, 2));
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
