// M1-A-BRIEF F006 — Evaluator 独立探针（不复用 Generator 的测试断言）。
//
// 目的：绕开 tests/integration/env-advance.test.ts 的断言，直接驱动 advanceStage 打真库，
// 把落库的 OperationLog 原始行整行打印出来，由 Evaluator 肉眼核对 D10 + D13 取值：
//   kind='auto' · projectId 填新列 · 载荷四字段落 payloadJson · summary 是人话 · ref 为空。
// 并独立复核「守卫拒绝零写入」与「maxReached 抬升幂等」。
//
// 自建自清夹具（slug 带 pid），不碰 seed 数据、不碰其他 tenant。

import { prisma } from 'lib/db/prisma';

const SLUG = `evaluator-f006-probe-${process.pid}`;
const GOAL = {
  targetExposure: 1_000_000,
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
};

type Stage = 'brief' | 'match' | 'reach' | 'delivery' | 'insight';

async function main() {
  const { advanceStage } = await import('lib/domain/env-advance');

  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: 'F006 evaluator probe' },
    select: { id: true },
  });
  const tenantId = tenant.id;
  const project = await prisma.project.create({
    data: {
      tenantId,
      name: '探针项目',
      cur: 'brief',
      maxReached: 'brief',
      goal: GOAL,
    },
    select: { id: true },
  });
  const projectId = project.id;

  const logCount = () => prisma.operationLog.count({ where: { tenantId } });

  try {
    // ── 1. 成功推进：整行 dump
    const r1 = await advanceStage({ projectId, tenantId });
    console.log('[1] advanceStage 返回：', JSON.stringify(r1));
    console.log('[1] 日志条数：', await logCount());
    const row = await prisma.operationLog.findFirstOrThrow({
      where: { tenantId },
    });
    console.log('[1] OperationLog 原始行：');
    console.log(JSON.stringify(row, null, 2));

    // 用原生 SQL 再读一次，排除 Prisma 层加工
    const raw = await prisma.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(`SELECT id, kind::text AS kind, actor, summary, ref, "projectId", "payloadJson" FROM "OperationLog" WHERE "tenantId" = $1`, tenantId);
    console.log('[1] 原生 SQL 读回：', JSON.stringify(raw, null, 2));

    // ── 2. 守卫拒绝零写入（逐种情形，各自清零后重试）
    const rejectCases: Array<[string, Stage, Stage, boolean]> = [
      ['goal 未确认 brief→match', 'brief', 'brief', false],
      ['D9 match→reach', 'match', 'match', true],
      ['D9 reach→delivery', 'reach', 'reach', true],
      ['D9 delivery→insight', 'delivery', 'delivery', true],
      ['末环节 insight', 'insight', 'insight', true],
    ];
    for (const [label, cur, maxReached, withGoal] of rejectCases) {
      await prisma.operationLog.deleteMany({ where: { tenantId } });
      await prisma.project.update({
        where: { id: projectId },
        data: withGoal
          ? { cur, maxReached, goal: GOAL }
          : { cur, maxReached, goal: { set: null } },
      });
      const r = await advanceStage({ projectId, tenantId });
      console.log(
        `[2] ${label} → ok=${r.ok} reason=${r.reason} logId=${r.logId} 写入条数=${await logCount()}`,
      );
    }

    // 不变量破坏
    await prisma.operationLog.deleteMany({ where: { tenantId } });
    await prisma.project.update({
      where: { id: projectId },
      data: { cur: 'insight', maxReached: 'brief', goal: GOAL },
    });
    const rInv = await advanceStage({ projectId, tenantId });
    console.log(
      `[2] 不变量破坏(cur>maxReached) → ok=${rInv.ok} reason=${rInv.reason} 写入条数=${await logCount()}`,
    );

    // 项目不存在 / 跨租户
    const rNo = await advanceStage({ projectId: 'nope', tenantId });
    console.log(`[2] 项目不存在 → ok=${rNo.ok} reason=${rNo.reason}`);
    const rX = await advanceStage({ projectId, tenantId: 'other-tenant' });
    console.log(`[2] 跨租户 → ok=${rX.ok} reason=${rX.reason}`);

    // ── 3. maxReached 抬升幂等
    await prisma.operationLog.deleteMany({ where: { tenantId } });
    await prisma.project.update({
      where: { id: projectId },
      data: { cur: 'brief', maxReached: 'brief', goal: GOAL },
    });
    await advanceStage({ projectId, tenantId });
    await prisma.project.update({
      where: { id: projectId },
      data: { cur: 'brief' },
    });
    const r3 = await advanceStage({ projectId, tenantId });
    const after = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { cur: true, maxReached: true },
    });
    const log3 = await prisma.operationLog.findUniqueOrThrow({
      where: { id: r3.logId! },
    });
    console.log(
      `[3] 回退后再推进 → cur=${after.cur} maxReached=${after.maxReached} 总日志=${await logCount()}`,
    );
    console.log('[3] 第二条日志载荷：', JSON.stringify(log3.payloadJson));

    // ── 4. append-only：产品代码是否存在 update/delete 路径（此处只验运行时行为不适用，见 grep）
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
