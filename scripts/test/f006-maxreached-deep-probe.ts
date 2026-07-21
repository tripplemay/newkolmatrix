// M1-A-BRIEF F006 — Evaluator 补测：maxReached 单调不减的「深度回退」场景。
//
// 背景：Generator 的 tests/integration/env-advance.test.ts 只测了 maxReached == to 的幂等
// （回退一格再推进），该夹具下 `raiseMaxReached(maxReached,to)` 与 `to` 等价，
// 因此变异体 M5（把取大者换成直接赋 to）能存活。本探针造 maxReached > to 的场景加以区分。
//
// 正确行为：cur=brief, maxReached=delivery，推进 brief→match 后
//          cur=match 且 maxReached 仍为 delivery（单调不减，D2）。
// 变异体行为：maxReached 回落为 match（不变量被破坏）。

import { prisma } from 'lib/db/prisma';

const SLUG = `evaluator-f006-deep-${process.pid}`;
const GOAL = {
  targetExposure: 1_000_000,
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
};

async function main() {
  const { advanceStage } = await import('lib/domain/env-advance');

  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: 'F006 deep probe' },
    select: { id: true },
  });
  const tenantId = tenant.id;
  const project = await prisma.project.create({
    data: {
      tenantId,
      name: '深度回退探针',
      cur: 'brief',
      maxReached: 'delivery', // 历史已解锁到 delivery，cur 已回退到 brief
      goal: GOAL,
    },
    select: { id: true },
  });

  try {
    const r = await advanceStage({ projectId: project.id, tenantId });
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      select: { cur: true, maxReached: true },
    });
    const log = r.logId
      ? await prisma.operationLog.findUniqueOrThrow({ where: { id: r.logId } })
      : null;

    console.log('前置：cur=brief maxReached=delivery（goal 已确认）');
    console.log('返回：', JSON.stringify(r));
    console.log('落库：', JSON.stringify(row));
    console.log('载荷：', JSON.stringify(log?.payloadJson));
    const ok = row.cur === 'match' && row.maxReached === 'delivery';
    console.log(
      ok
        ? 'PASS — maxReached 保持 delivery，单调不减成立'
        : `FAIL — maxReached 回落为 ${row.maxReached}，D2 单调不减被破坏`,
    );
    process.exitCode = ok ? 0 : 1;
  } finally {
    await prisma.operationLog.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
