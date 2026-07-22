import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [
    tenant,
    project,
    kol,
    kolEmb,
    matchPlan,
    planKol,
    matchCandidate,
    pendingAction,
    operationLog,
    handoff,
    material,
    gameKnowledge,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.project.count(),
    prisma.kol.count(),
    prisma.$queryRaw`SELECT count(*)::int AS c FROM "Kol" WHERE embedding IS NOT NULL` as Promise<
      Array<{ c: number }>
    >,
    prisma.matchPlan.count(),
    prisma.planKol.count(),
    prisma.matchCandidate.count(),
    prisma.pendingAction.count(),
    prisma.operationLog.count(),
    prisma.handoff.count(),
    prisma.material.count(),
    prisma.gameKnowledge.count(),
  ]);
  console.log(
    JSON.stringify(
      {
        Tenant: tenant,
        Project: project,
        Kol: kol,
        KolEmbedding: kolEmb[0].c,
        MatchPlan: matchPlan,
        PlanKol: planKol,
        MatchCandidate: matchCandidate,
        PendingAction: pendingAction,
        OperationLog: operationLog,
        Handoff: handoff,
        Material: material,
        GameKnowledge: gameKnowledge,
      },
      null,
      2,
    ),
  );
  if (handoff > 0) {
    const rows = await prisma.handoff.findMany({
      select: { id: true, fromAgent: true, toAgent: true },
    });
    console.log('Handoff rows:', JSON.stringify(rows));
  }
}

main().finally(() => prisma.$disconnect());
