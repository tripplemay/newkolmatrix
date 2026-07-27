import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const t = await prisma.tenant.findMany({ select: { id: true, slug: true } });
const dev = t.find(x => x.slug === 'dev');
const ids = new Set(t.map(x => x.id));
const out = { tenants: t.map(x=>x.slug) };
if (dev) {
  out.dev = {
    project: await prisma.project.count({ where: { tenantId: dev.id } }),
    handoff: await prisma.handoff.count({ where: { tenantId: dev.id } }),
    shareLink: await prisma.shareLink.count({ where: { tenantId: dev.id } }),
    operationLog: await prisma.operationLog.count({ where: { tenantId: dev.id } }),
    pending: await prisma.pendingAction.count({ where: { tenantId: dev.id, status: 'pending' } }),
    pendingAll: await prisma.pendingAction.count({ where: { tenantId: dev.id } }),
  };
}
// orphans: rows whose tenantId not in tenant table
const orph = {};
for (const [name, model] of [['handoff', prisma.handoff], ['operationLog', prisma.operationLog], ['pendingAction', prisma.pendingAction], ['shareLink', prisma.shareLink], ['project', prisma.project]]) {
  const rows = await model.findMany({ select: { id: true, tenantId: true } });
  orph[name] = rows.filter(r => !ids.has(r.tenantId)).length;
}
out.orphans = orph;
console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
