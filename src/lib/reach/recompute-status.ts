// M3-A-REACH-CRM F004 — 触达线程状态重算服务（crmInfer 物化的唯一写入口）
//
// 三处复用铁律（crm-infer.ts 文件头）：V6 页面 / reach 工具 / signals 例程都必须经
// `inferCrmStatus` 推断——本服务是「加载事实 → 推断 → 物化 + 留痕」这段舞步的单一实现，
// send_outreach（F003）/ signals 接入（F004）/ 人工覆盖（F009）共用，防止三处各抄一遍。
//
// 纯函数在 domain 层（crm-infer.ts，无 DB）；本文件是它的数据装配 + 物化壳（有 DB）。

import type { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import {
  inferCrmStatus,
  type CrmInferResult,
} from 'lib/domain/crm-infer';

export interface RecomputeCtx {
  tenantId: string;
  /** 执行事务客户端（闸门 execute 路径传入，与 executed+irrev 同事务）。 */
  db?: Prisma.TransactionClient;
  /** 留痕 actor（人格 id / 'operator' / 'system'）。 */
  actor?: string | null;
}

export interface RecomputeResult {
  threadId: string;
  /** 重算后的物化状态。 */
  status: CrmInferResult['status'];
  /** true = 本次重算发生了状态推进（已写 OperationLog 留痕）。 */
  changed: boolean;
  /** 推断完整结果（含 ignoredOverrides，调用方按需追加自己的留痕）。 */
  infer: CrmInferResult;
}

/**
 * 重算一个 thread 的 CRM 状态并物化到 OutreachThread.status。
 * 状态变化时写 OperationLog(kind:auto) 推进事件（ADR-21：Signal + OperationLog 承载领域事件；
 * ref 语义单一留给 PendingAction，线程上下文入 payloadJson）。
 */
export async function recomputeThreadStatus(
  threadId: string,
  ctx: RecomputeCtx,
): Promise<RecomputeResult> {
  const db = ctx.db ?? prisma;
  const thread = await db.outreachThread.findFirst({
    where: { id: threadId, tenantId: ctx.tenantId },
    select: { id: true, status: true, projectId: true },
  });
  if (!thread) throw new Error(`[reach] 触达线程不存在: ${threadId}`);

  const [messages, signals, quotes] = await Promise.all([
    db.outreachMessage.findMany({
      where: { threadId },
      select: { direction: true },
    }),
    db.signal.findMany({
      where: { threadId },
      select: { id: true, type: true, payloadJson: true, detectedAt: true },
    }),
    db.quote.findMany({ where: { threadId }, select: { status: true } }),
  ]);

  const infer = inferCrmStatus({
    messages,
    signals: signals.map((s) => ({
      id: s.id,
      type: s.type,
      payload: s.payloadJson,
      detectedAt: s.detectedAt,
    })),
    quotes,
  });

  const changed = infer.status !== thread.status;
  if (changed) {
    await db.outreachThread.update({
      where: { id: thread.id },
      data: { status: infer.status },
    });
    await db.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.actor ?? null,
        summary: `触达状态推进：${thread.status} → ${infer.status}`,
        projectId: thread.projectId,
        payloadJson: {
          threadId: thread.id,
          from: thread.status,
          to: infer.status,
        },
      },
    });
  }

  return { threadId: thread.id, status: infer.status, changed, infer };
}
