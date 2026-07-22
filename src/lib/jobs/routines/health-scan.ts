// M1-C F004 — health-scan 例程（architecture.md:1170 规划 5 条例程中本批唯一可实装的一条）。
//
// 主动式 Agent 的最小闭环（§8.10）：读 tenant 全部 Project → computeHealth →
// 每项目写一条 OperationLog(kind=auto, actor=strategy)。纯计算不调网关（:1180），
// 无 outbound 动作不涉闸门（:1182）。产出经今天页 feed 与「Agent 今日完成」KPI 呈现（F003 已接真）。
//
// 幂等语义：留痕是 append-only 快照（每次巡检各留一条是设计而非缺陷——巡检历史
// 即 OperationLog 按 actor/kind 过滤，architecture.md:1598）；重跑不炸、不去重。

import { prisma } from 'lib/db/prisma';
import { computeHealth } from 'lib/domain/health';
import { parseProjectGoal } from 'lib/data/schemas/project';
import { HEALTH_LABEL } from 'lib/display/health-label';

export interface HealthScanResult {
  scanned: number;
  logged: number;
}

/**
 * 对单个 tenant 执行一轮健康度巡检。
 * `now` 由调用方注入（scheduler / 手动触发口），保持与页面/工具同一纯度取向。
 */
export async function runHealthScan(
  tenantId: string,
  now: Date,
): Promise<HealthScanResult> {
  const rows = await prisma.project.findMany({
    where: { tenantId },
    select: { id: true, name: true, goal: true, budgetTotal: true },
  });

  let logged = 0;
  for (const row of rows) {
    const goal = parseProjectGoal(row.goal);
    // 与 [id]/page.tsx / compute-health 工具同一 HealthInput 组装口径（D2/D15）
    const health = computeHealth({
      targetExposure: goal?.targetExposure ?? null,
      actualExposure: null,
      budgetTotal: row.budgetTotal == null ? null : Number(row.budgetTotal),
      budgetSpent: null,
      periodStart: goal ? new Date(goal.periodStart) : null,
      periodEnd: goal ? new Date(goal.periodEnd) : null,
      now,
      blockerCount: 0,
    });
    await prisma.operationLog.create({
      data: {
        tenantId,
        kind: 'auto',
        actor: 'strategy',
        projectId: row.id,
        summary: `例程巡检：《${row.name}》健康度 ${HEALTH_LABEL[health.band]}（${health.score} 分）`,
        payloadJson: { routine: 'health-scan', score: health.score, band: health.band },
      },
    });
    logged += 1;
  }

  return { scanned: rows.length, logged };
}
