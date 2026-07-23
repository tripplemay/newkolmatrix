// M3-A-REACH-CRM F009 — CRM 人工覆盖服务（U4 有限覆盖）
//
// 覆盖 = Signal(type=manual_override) 走同一推断管道（crmInfer → recomputeThreadStatus），
// **非直改列**——manual_override 只是又一条事实，最终状态仍由纯函数合成（三处复用铁律 ③）。
// U4 白名单：仅 sent / replied / negotiating 三态可断言（zod enum 硬闸——「已确认」在
// 输入 schema 层就不可达；confirmed 唯一路径 = commit_quote 闸门）。
// 留痕：OperationLog(kind:auto) 含操作者与前后态；状态实际推进时管道另有推进事件。

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import {
  MANUAL_OVERRIDE_SIGNAL_TYPE,
  OVERRIDABLE_STATUSES,
} from 'lib/domain/crm-infer';
import { REACH_STATUS_LABEL } from 'lib/display/reach-format';
import { recomputeThreadStatus } from './recompute-status';

/** U4：可人工断言的三态（同源 crm-infer.OVERRIDABLE_STATUSES；confirmed 不在其中）。 */
export const manualOverrideInputSchema = z.object({
  projectId: z.string().min(1),
  kolId: z.string().min(1),
  status: z.enum(OVERRIDABLE_STATUSES),
});

export type ManualOverrideInput = z.infer<typeof manualOverrideInputSchema>;

export interface ManualOverrideResult {
  threadId: string;
  signalId: string;
  asserted: ManualOverrideInput['status'];
  from: string;
  /** 推断管道合成后的最终状态（= max(事件面, 断言)，可能 ≠ asserted）。 */
  to: string;
  /** false = 断言落后于事件面事实，被事实追平（合成规则见 crm-infer 文件头）。 */
  effective: boolean;
}

export async function applyManualOverride(
  input: ManualOverrideInput,
  opts: { tenantId: string; actor: string },
): Promise<ManualOverrideResult> {
  const kol = await prisma.kol.findFirst({
    where: { id: input.kolId, tenantId: opts.tenantId },
    select: { id: true },
  });
  if (!kol) throw new Error(`[reach/override] 创作者不存在: ${input.kolId}`);
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, tenantId: opts.tenantId },
    select: { id: true },
  });
  if (!project) {
    throw new Error(`[reach/override] 项目不存在: ${input.projectId}`);
  }

  const thread = await prisma.outreachThread.upsert({
    where: {
      projectId_kolId: { projectId: input.projectId, kolId: input.kolId },
    },
    create: {
      tenantId: opts.tenantId,
      projectId: input.projectId,
      kolId: input.kolId,
      status: 'pending_send',
    },
    update: {},
  });
  const from = thread.status;

  const now = new Date();
  const signal = await prisma.signal.create({
    data: {
      tenantId: opts.tenantId,
      type: MANUAL_OVERRIDE_SIGNAL_TYPE,
      source: 'user',
      externalId: `manual:${randomUUID()}`, // 防重键占位（人工事件天然唯一）
      kolId: input.kolId,
      projectId: input.projectId,
      threadId: thread.id,
      payloadJson: { status: input.status } as Prisma.InputJsonValue, // F005 窄化契约 {status}
      detectedAt: now,
    },
    select: { id: true },
  });
  await prisma.outreachThread.update({
    where: { id: thread.id },
    data: { lastSignalAt: now },
  });

  // 同一推断管道重算（覆盖不直改列；状态实际推进时 recompute 自写推进事件留痕）
  const rec = await recomputeThreadStatus(thread.id, {
    tenantId: opts.tenantId,
    actor: opts.actor,
  });
  const effective = rec.infer.override?.signalId === signal.id && rec.infer.override.effective;

  // 覆盖动作留痕（含操作者与前后态——acceptance 硬项；与推进事件分立：一为人的动作，一为状态事件）
  await prisma.operationLog.create({
    data: {
      tenantId: opts.tenantId,
      kind: 'auto',
      actor: opts.actor,
      summary: `人工覆盖触达状态：断言「${REACH_STATUS_LABEL[input.status]}」（${from} → ${rec.status}）`,
      projectId: input.projectId,
      payloadJson: {
        threadId: thread.id,
        signalId: signal.id,
        asserted: input.status,
        from,
        to: rec.status,
        effective,
      },
    },
  });

  return {
    threadId: thread.id,
    signalId: signal.id,
    asserted: input.status,
    from,
    to: rec.status,
    effective,
  };
}
