import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const dev = await prisma.tenant.findFirst({ where: { slug: 'dev' } });
const start = new Date(); start.setHours(0,0,0,0);
const autoToday = await prisma.operationLog.count({ where: { tenantId: dev.id, kind: 'auto', createdAt: { gte: start } } });
const markerToday = await prisma.operationLog.count({ where: { tenantId: dev.id, kind: 'auto', createdAt: { gte: start }, summary: { contains: 'SHARE_CREATED' } } });
console.log(JSON.stringify({ autoToday, markerToday, nonMarkerToday: autoToday - markerToday }));
await prisma.$disconnect();
