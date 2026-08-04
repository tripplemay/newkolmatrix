// M4.8-HARDEN 复验：dev 库副作用普查（Evaluator 产物，只读）
// 口径：① 残留 test-tenant-* 租户 ② 各软引用表的孤儿行（tenantId 指向已不存在的租户）
import { prisma } from '../../src/lib/db/prisma';

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  const ids = new Set(tenants.map((t) => t.id));
  const testTenants = tenants.filter((t) => t.slug.startsWith('test-tenant-'));

  const tables: Array<[string, () => Promise<Array<{ tenantId: string; id: string; createdAt?: Date }>>]> = [
    ['operationLog', () => prisma.operationLog.findMany({ select: { id: true, tenantId: true, createdAt: true } })],
    ['handoff', () => prisma.handoff.findMany({ select: { id: true, tenantId: true, createdAt: true } })],
    ['pendingAction', () => prisma.pendingAction.findMany({ select: { id: true, tenantId: true, createdAt: true } })],
    ['shareLink', () => prisma.shareLink.findMany({ select: { id: true, tenantId: true, createdAt: true } })],
    ['project', () => prisma.project.findMany({ select: { id: true, tenantId: true, createdAt: true } })],
    ['game', () => prisma.game.findMany({ select: { id: true, tenantId: true, createdAt: true } })],
    ['gameKnowledge', () => prisma.gameKnowledge.findMany({ select: { id: true, tenantId: true, createdAt: true } })],
  ];

  const out: Record<string, unknown> = {
    tenantsTotal: tenants.length,
    testTenantsLeft: testTenants.map((t) => t.slug),
  };
  for (const [name, q] of tables) {
    const rows = await q();
    const orphans = rows.filter((r) => !ids.has(r.tenantId));
    out[`${name}.total`] = rows.length;
    out[`${name}.orphans`] = orphans.length;
    if (orphans.length) {
      out[`${name}.orphanDates`] = orphans.map((o) => (o.createdAt ? o.createdAt.toISOString() : '?'));
    }
  }
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}
main();
