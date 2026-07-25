// M4.5-AGENT-LOOP F004 — 计划认可服务（internal，U3）
//
// 「认可」= 人对一份 propose_plan 计划表个态，落一行留痕。**它不解锁任何执行权**：
// 计划里标了「需你确认」的每一步，之后照旧逐个走两步票据闸门（回归测试钉死）。
// 这条边界是刻意的——一次点击认可 N 个不可逆动作，正是闸门要防的东西。
//
// 幂等：同一计划重复认可不重复留痕（alreadyAcknowledged 如实返回）。
// OperationLog.ref 语义单一（→ PendingAction.id，D13），故计划关联走 payloadJson.planId。

import { prisma } from 'lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { PLAN_PROPOSED_MARKER } from './tools/propose-plan';

/** 认可留痕 summary 前缀——查询锚点。 */
export const PLAN_ACK_MARKER = 'agent_plan_acked';

export const PLAN_NOT_FOUND_MSG = '计划不存在';

export interface PlanAckResult {
  planId: string;
  planTitle: string;
  acknowledged: true;
  /** true = 幂等重入（此前已认可过，未重复留痕） */
  alreadyAcknowledged: boolean;
  acknowledgedAt: string;
  /** 认可留痕行 id */
  logId: string;
  /** 边界如实告知：认可不等于确认（前端展示同源，防另写一套弱化措辞） */
  note: string;
}

export const PLAN_ACK_NOTE =
  '已记下你认可了这份计划。需要确认的动作仍会逐个停在你面前——认可不代表已确认、更不代表已执行。';

export interface PlanAckCtx {
  tenantId: string;
  actor?: string;
}

/** 认可一份计划（幂等）。计划不存在 → 明示抛错（不静默造一条留痕）。 */
export async function acknowledgePlan(
  planId: string,
  ctx: PlanAckCtx,
): Promise<PlanAckResult> {
  const plan = await prisma.operationLog.findFirst({
    where: {
      id: planId,
      tenantId: ctx.tenantId,
      kind: 'auto',
      summary: { startsWith: PLAN_PROPOSED_MARKER },
    },
    select: { id: true, summary: true, projectId: true, payloadJson: true },
  });
  if (!plan) {
    throw new Error(`[plan-ack] ${PLAN_NOT_FOUND_MSG}: ${planId}`);
  }
  const planTitle =
    (plan.payloadJson as { title?: string } | null)?.title ?? plan.summary ?? '';

  // 幂等：同计划已有认可留痕 → 不重复落行
  const existing = await prisma.operationLog.findFirst({
    where: {
      tenantId: ctx.tenantId,
      kind: 'auto',
      summary: { startsWith: PLAN_ACK_MARKER },
      payloadJson: { path: ['planId'], equals: planId },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true },
  });
  if (existing) {
    return {
      planId,
      planTitle,
      acknowledged: true,
      alreadyAcknowledged: true,
      acknowledgedAt: existing.createdAt.toISOString(),
      logId: existing.id,
      note: PLAN_ACK_NOTE,
    };
  }

  const row = await prisma.operationLog.create({
    data: {
      tenantId: ctx.tenantId,
      kind: 'auto',
      actor: ctx.actor ?? 'human',
      summary: `${PLAN_ACK_MARKER} ${planTitle}`,
      projectId: plan.projectId,
      payloadJson: { planId } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, createdAt: true },
  });

  return {
    planId,
    planTitle,
    acknowledged: true,
    alreadyAcknowledged: false,
    acknowledgedAt: row.createdAt.toISOString(),
    logId: row.id,
    note: PLAN_ACK_NOTE,
  };
}
