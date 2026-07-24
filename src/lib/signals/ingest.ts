// M3-A-REACH-CRM F004 — 投递状态信号落库管道（normalize 之后的应用侧）
//
// 流程：providerMessageId 关联 OutreachMessage（取 thread/kol/project 上下文）→
// Signal 落库（externalId @unique 防重：重放/并发重投只落一行）→ thread.lastSignalAt →
// crmInfer 重算（共享重算服务，三处复用铁律 ③）→ OperationLog(kind:auto) 留痕。
//
// 未匹配到本项目消息的事件（如共享 Resend 账号下旧项目 kolmatrix 的发信事件）→
// matched=0 不落库——防止 Signal 表被他项目事件灌噪（旧项目 handler 同语义）。

import { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import { recomputeThreadStatus } from 'lib/reach/recompute-status';
import type { NormalizedDeliverySignal } from './normalize';

export interface IngestResult {
  /** 1 = 事件命中本项目消息并已应用；0 = 未匹配 / 重放去重。 */
  matched: 0 | 1;
  /** true = externalId 已存在（同事件重放，未落第二行）。 */
  duplicate: boolean;
  threadId: string | null;
  /** 重算后的线程状态（matched 时）。 */
  status: string | null;
}

/** 应用一条标准化投递信号（webhook 主管道；幂等：重放安全）。 */
export async function ingestDeliverySignal(
  normalized: NormalizedDeliverySignal,
  ctx: { tenantId: string },
): Promise<IngestResult> {
  // 关联本项目消息（providerMessageId 是 Resend 消息 id，F003 发送时落库）
  const message = await prisma.outreachMessage.findFirst({
    where: {
      tenantId: ctx.tenantId,
      providerMessageId: normalized.providerMessageId,
    },
    select: {
      threadId: true,
      thread: { select: { kolId: true, projectId: true } },
    },
  });
  if (!message) {
    return { matched: 0, duplicate: false, threadId: null, status: null };
  }

  // M3-B F008 顺手项（M3-A F004-low soft-watch）：落库 → lastSignalAt → 重算 → 留痕
  // 四步收进**同一事务**（与交付登记同款范式）——中途失败不留「信号落了但状态没算」的半成品。
  // 防重：externalId @unique——create 撞 P2002 即同事件重放，事务回滚后走去重分支，不报错。
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.signal.create({
        data: {
          tenantId: ctx.tenantId,
          type: normalized.type,
          source: normalized.source,
          externalId: normalized.externalId,
          kolId: message.thread.kolId,
          projectId: message.thread.projectId,
          threadId: message.threadId,
          payloadJson: normalized.payload as Prisma.InputJsonValue,
          detectedAt: normalized.detectedAt,
        },
      });

      await tx.outreachThread.update({
        where: { id: message.threadId },
        data: { lastSignalAt: normalized.detectedAt },
      });

      // crmInfer 重算（共享服务；投递状态本身不推进 CRM 态——P2，但管道统一走推断）
      const recompute = await recomputeThreadStatus(message.threadId, {
        tenantId: ctx.tenantId,
        db: tx,
        actor: 'system',
      });

      // 信号接入留痕（OperationLog kind:auto；ref 语义单一留给 PA，上下文入 payloadJson）
      await tx.operationLog.create({
        data: {
          tenantId: ctx.tenantId,
          kind: 'auto',
          actor: 'system',
          summary: `信号接入：email_delivery_status(${normalized.payload.event})`,
          projectId: message.thread.projectId,
          payloadJson: {
            threadId: message.threadId,
            externalId: normalized.externalId,
            event: normalized.payload.event,
            providerMessageId: normalized.providerMessageId,
          },
        },
      });

      return {
        matched: 1 as const,
        duplicate: false,
        threadId: message.threadId,
        status: recompute.status,
      };
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const existing = await prisma.outreachThread.findFirst({
        where: { id: message.threadId, tenantId: ctx.tenantId },
        select: { status: true },
      });
      return {
        matched: 1,
        duplicate: true,
        threadId: message.threadId,
        status: existing?.status ?? null,
      };
    }
    throw err;
  }
}
