// M4.8-HARDEN 复验：孤儿行取证（只读）
import { prisma } from '../../src/lib/db/prisma';
async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  const ids = new Set(tenants.map((t) => t.id));
  const rows = await prisma.operationLog.findMany({
    select: { id: true, tenantId: true, kind: true, actor: true, summary: true, createdAt: true, payloadJson: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const r of rows.filter((r) => !ids.has(r.tenantId))) {
    console.log(JSON.stringify({ createdAt: r.createdAt.toISOString(), kind: r.kind, actor: r.actor, summary: r.summary, payload: r.payloadJson }, null, 0));
  }
  await prisma.$disconnect();
}
main();
