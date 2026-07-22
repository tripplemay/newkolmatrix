import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const pa = await prisma.pendingAction.findMany();
  const ol = await prisma.operationLog.findMany();
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  console.log('Tenants:', JSON.stringify(tenants));
  console.log('PendingAction rows:', JSON.stringify(pa, null, 2));
  console.log('OperationLog rows:', JSON.stringify(ol, null, 2));
}

main().finally(() => prisma.$disconnect());
