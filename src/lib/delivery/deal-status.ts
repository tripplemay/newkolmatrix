// M3-B-DELIVERY F005 — Deal 状态推进服务（dealAdvance 物化的唯一写入口）。
//
// 纯状态机在 domain/deal-advance.ts（无 DB），本文件是它的落库壳。
// **任何调用方不得直接 `deal.update({ status })`**——绕过这里等于把状态机作废
// （F008 登记 refs / F005 放款 / F006 分发 都经本服务推进）。

import type { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import {
  DEAL_FLOW_ORDER,
  dealAdvance,
  hasReachedDealStage,
  nextDealStatus,
  type DealStatus,
} from 'lib/domain/deal-advance';

export type DealMainlineStage = (typeof DEAL_FLOW_ORDER)[number];

export class DealTransitionError extends Error {
  constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'DealTransitionError';
  }
}

export interface AdvanceDealCtx {
  tenantId: string;
  db?: Prisma.TransactionClient;
  actor?: string | null;
  /** 推进缘由（留痕用，如「登记托管单号」「放款完成」）。 */
  reason?: string;
}

export interface AdvanceDealResult {
  dealId: string;
  from: DealStatus;
  to: DealStatus;
  /** 途经的主线态（含目标态）；未推进时为空数组 */
  path: DealStatus[];
  /** false = 已达到或越过目标阶段（幂等 no-op，不写库不留痕） */
  changed: boolean;
}

/**
 * 把 Deal 推进到主线目标阶段（逐级走，不跳态）。
 *
 * - 已达到/越过目标 → no-op（幂等：重复登记同一单号不产生第二条留痕，也不倒流）
 * - 途中任一步不合法（如当前 blocked / defaulted）→ 抛 DealTransitionError，**不部分推进**
 * - 逐级 dealAdvance 校验：escrowed → completed 这种跨级请求会走 delivering 中转，
 *   每一步都过状态机；任何一步被拒则整体拒绝
 */
export async function advanceDealTo(
  dealId: string,
  target: DealMainlineStage,
  ctx: AdvanceDealCtx,
): Promise<AdvanceDealResult> {
  const db = ctx.db ?? prisma;
  const deal = await db.deal.findFirst({
    where: { id: dealId, tenantId: ctx.tenantId },
    select: { id: true, status: true, projectId: true },
  });
  if (!deal) throw new DealTransitionError('NOT_FOUND', `交易不存在: ${dealId}`);

  const from = deal.status as DealStatus;
  if (hasReachedDealStage(from, target)) {
    return { dealId, from, to: from, path: [], changed: false };
  }

  // 逐级校验（先全算一遍再写库——不产生「推进一半」的中间态）
  const path: DealStatus[] = [];
  let cursor: DealStatus = from;
  while (cursor !== target) {
    const next = nextDealStatus(cursor);
    if (next == null) {
      throw new DealTransitionError(
        'NO_MAINLINE_SUCCESSOR',
        `交易当前状态 ${cursor} 不在主线上（blocked 需先人工恢复，defaulted/completed 是终态），无法推进到 ${target}`,
      );
    }
    const step = dealAdvance(cursor, next);
    if (!step.allowed) {
      throw new DealTransitionError(
        step.reason,
        `交易状态流转被拒：${cursor} → ${next}（${step.reason}）`,
      );
    }
    path.push(next);
    cursor = next;
  }

  await db.deal.update({ where: { id: deal.id }, data: { status: target } });
  await db.operationLog.create({
    data: {
      tenantId: ctx.tenantId,
      kind: 'auto',
      actor: ctx.actor ?? null,
      summary: `交易状态推进：${from} → ${target}${
        ctx.reason ? `（${ctx.reason}）` : ''
      }`,
      projectId: deal.projectId,
      payloadJson: {
        dealId: deal.id,
        from,
        to: target,
        path,
        reason: ctx.reason ?? null,
      },
    },
  });

  return { dealId, from, to: target, path, changed: true };
}
