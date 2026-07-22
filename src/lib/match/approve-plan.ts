// M2-A-MATCH F004 — 组合批准服务（S10 消解：advanceStage 首个生产消费者）。
//
// 批准 = **internal 动作**（FR-7.19/D27/D16「选了就生效」）：不产生 PendingAction、
// 无确认弹窗——architecture :1352 双边铁律：internal 一个确认框都不加，
// outbound 一个都不少。K10=0（假闸门计数）双边守恒。
//
// 事务语义（P3 单选）：目标 plan → approved + approvedBy/At，同项目其余 draft →
// superseded，同一事务原子落库。随后 advanceStage(projectId,'reach')——
// **advance 失败不回滚批准**（如项目已在 reach / goal 缺失），结果原样带回响应注明。

import { prisma } from 'lib/db/prisma';
import { advanceStage, type AdvanceResult } from 'lib/domain/env-advance';

export type ApprovePlanResult =
  | {
      ok: true;
      /** true = 该 plan 此前已是 approved（幂等重放：不改写 approvedAt、不重复 advance） */
      already: boolean;
      planId: string;
      planName: string;
      projectId: string;
      /** S10 推进结果；already=true 时为 null（首次批准时已推进过） */
      advance: AdvanceResult | null;
    }
  | { ok: false; code: 'NOT_FOUND' | 'PLAN_SUPERSEDED' };

export interface ApprovePlanOpts {
  tenantId: string;
  /** 批准人（单角色 dev：'operator'） */
  actor?: string;
}

/**
 * 批准一组组合方案。planIdOrPublicId 双口径（沿 Project 三口径先例的子集）。
 *
 * 状态分支（D20 变异测试锚点，tests/integration/match-approve.test.ts）：
 * - draft → 批准事务 + advance
 * - approved → 幂等重放（ok:true, already:true，行原样不动）
 * - superseded → 拒（409 语义：过时方案不可批准，请刷新取现行组合）
 */
export async function approvePlan(
  planIdOrPublicId: string,
  opts: ApprovePlanOpts,
): Promise<ApprovePlanResult> {
  const { tenantId, actor = 'operator' } = opts;

  const plan = await prisma.matchPlan.findFirst({
    where: {
      tenantId,
      OR: [{ id: planIdOrPublicId }, { publicId: planIdOrPublicId }],
    },
  });
  if (!plan) return { ok: false, code: 'NOT_FOUND' };

  if (plan.status === 'superseded') {
    return { ok: false, code: 'PLAN_SUPERSEDED' };
  }

  if (plan.status === 'approved') {
    // 幂等：重复批准不改写 approvedBy/At（审计链首次批准时点为准）、不重复推进
    return {
      ok: true,
      already: true,
      planId: plan.id,
      planName: plan.name,
      projectId: plan.projectId,
      advance: null,
    };
  }

  // P3 单选语义：批准 + 其余 draft 出局，同事务原子
  await prisma.$transaction([
    prisma.matchPlan.update({
      where: { id: plan.id },
      data: {
        status: 'approved',
        approvedBy: actor,
        approvedAt: new Date(),
      },
    }),
    prisma.matchPlan.updateMany({
      where: { projectId: plan.projectId, status: 'draft', id: { not: plan.id } },
      data: { status: 'superseded' },
    }),
  ]);

  // S10：cur='match' 的项目推进到 reach（守卫经 hasApprovedMatchPlan 放行）。
  // advance 被拒（已在 reach / 越过 match 等）不回滚批准——批准本身已生效，
  // 推进失败是独立事实，由调用方注明呈现。
  const advance = await advanceStage({
    projectId: plan.projectId,
    tenantId,
    actor,
  });

  return {
    ok: true,
    already: false,
    planId: plan.id,
    planName: plan.name,
    projectId: plan.projectId,
    advance,
  };
}
