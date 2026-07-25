// Evaluator G3 一次性取证脚本（不入库、不作为回归资产）：
// ① check_compliance 是否尊重 ctx.db（事务客户端）
// ② 项目 gameId 指向别租户 Game 时，链头读取器是否会跨租户吐红线
import { prisma } from '../../src/lib/db/prisma';

async function main() {
  const { executeTool } = await import(
    '../../src/lib/agent/execute'
  );
  const TAG = `g3scratch-${process.pid}`;
  const a = await prisma.tenant.create({
    data: { slug: `${TAG}-a`, name: 'A' },
  });
  const b = await prisma.tenant.create({
    data: { slug: `${TAG}-b`, name: 'B' },
  });
  const gameA = await prisma.game.create({
    data: { tenantId: a.id, name: `${TAG}-gameA` },
  });
  const gameB = await prisma.game.create({
    data: { tenantId: b.id, name: `${TAG}-gameB` },
  });
  await prisma.gameKnowledge.create({
    data: {
      tenantId: b.id,
      gameId: gameB.id,
      kind: 'compliance_redline',
      content: 'B 租户机密红线',
      sourceMaterialIds: [],
    },
  });
  const projA = await prisma.project.create({
    data: { tenantId: a.id, name: `${TAG}-projA`, gameId: gameA.id },
  });
  // 数据完整性异常：A 租户项目指向 B 租户的 Game（应用层正常不会造出来）
  const projCross = await prisma.project.create({
    data: { tenantId: a.id, name: `${TAG}-cross`, gameId: gameB.id },
  });

  const ctx = {
    tenantId: a.id,
    agentId: 'compliance' as const,
    projectId: null,
    env: 'default' as const,
  };

  // ① 事务可见性
  await prisma
    .$transaction(async (tx) => {
      await tx.gameKnowledge.create({
        data: {
          tenantId: a.id,
          gameId: gameA.id,
          kind: 'compliance_redline',
          content: '事务内新建红线',
          sourceMaterialIds: [],
        },
      });
      const r = await executeTool(
        'check_compliance',
        { projectId: projA.id },
        { ...ctx, db: tx },
      );
      const out = r.output as { items: { content: string }[] };
      console.log(
        '① ctx.db 事务内新建红线可见?',
        out.items.some((i) => i.content === '事务内新建红线'),
        '| items=',
        out.items.map((i) => i.content),
      );
      throw new Error('rollback');
    })
    .catch(() => undefined);

  // ② 跨租户 Game 指向
  const r2 = await executeTool(
    'check_compliance',
    { projectId: projCross.id },
    ctx,
  );
  const out2 = r2.output as { items: { content: string }[]; note: string };
  console.log(
    '② A 租户视角读到 B 租户红线?',
    out2.items.some((i) => i.content === 'B 租户机密红线'),
    '| items=',
    out2.items.map((i) => i.content),
  );

  for (const t of [a.id, b.id]) {
    await prisma.gameKnowledge.deleteMany({ where: { tenantId: t } });
    await prisma.project.deleteMany({ where: { tenantId: t } });
    await prisma.game.deleteMany({ where: { tenantId: t } });
    await prisma.tenant.deleteMany({ where: { id: t } });
  }
  const left = await prisma.tenant.count({
    where: { slug: { contains: TAG } },
  });
  console.log('清理残留 tenant 数 =', left);
  await prisma.$disconnect();
}

main();
