// AGENT-FOUNDATION F009 — AI→人闸门服务（PRD §10.4 / 架构稿 §8）
//
// 核心不变量：outbound 动作，模型自主 loop 永远拿不到确认令牌 → 只能停在「pending」，无法自我放行。
// 真正执行只发生在操盘手显式确认（/api/gate/confirm，服务端）后：签发令牌 → 执行 → 同事务写 irrev 留痕。
//
// - createPendingAction：outbound 未过闸门时落 PendingAction（inputJson + harm + payloadHash，status=pending）
//   + 写 OperationLog kind:gate（拦截留痕）；返回 pending 信封（含 harm，无令牌）
// - confirmPendingAction：校验 pending + 未过期(TTL) + 单次 → 签发令牌(只存 hash，绑 payloadHash)
//   → 经唯一执行入口 executeTool（ctx 带令牌）执行副作用 → 同事务 status=executed + 写 OperationLog kind:irrev
// - rejectPendingAction：失效该 PA + 写 OperationLog kind:block

import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import { getTool } from '../tools/registry';
import { executeTool } from '../execute';
import type { ToolContext } from '../tools/types';
import {
  HARM_LABEL,
  harmSchema,
  type Harm,
  type PendingActionEnvelope,
} from './harm';

const TOKEN_TTL_MS = 15 * 60 * 1000; // 确认令牌短 TTL（15 分钟）

/** 稳定序列化（递归排序 object key）——JSONB 存储会重排 key，故 payloadHash 必须 order-independent。 */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys
    .map(
      (k) =>
        `${JSON.stringify(k)}:${stableStringify(
          (v as Record<string, unknown>)[k],
        )}`,
    )
    .join(',')}}`;
}

/** payloadHash = sha256(toolName + 稳定序列化 input + tenantId)，绑定确认与确切载荷（防篡改，抗 JSONB 重排）。 */
export function payloadHashOf(
  toolName: string,
  input: unknown,
  tenantId: string,
): string {
  return createHash('sha256')
    .update(`${toolName}\n${stableStringify(input)}\n${tenantId}`)
    .digest('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** outbound 未过闸门 → 落 PendingAction + gate 留痕，返回 pending 信封（无令牌）。 */
export async function createPendingAction(
  toolName: string,
  input: unknown,
  harm: Harm,
  ctx: ToolContext,
): Promise<PendingActionEnvelope> {
  const payloadHash = payloadHashOf(toolName, input, ctx.tenantId);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  // 以闸门 TTL 覆盖 harm.expiresAt，保证披露的过期时间与 PendingAction 一致；强制红标。
  const parsedHarm = harmSchema.parse({
    ...harm,
    label: HARM_LABEL,
    expiresAt: expiresAt.toISOString(),
  });
  const pa = await prisma.pendingAction.create({
    data: {
      tenantId: ctx.tenantId,
      kind: 'gate',
      toolName,
      payloadHash,
      inputJson: input as Prisma.InputJsonValue,
      harmJson: parsedHarm as unknown as Prisma.InputJsonValue,
      status: 'pending',
      expiresAt,
    },
    select: { id: true },
  });
  await prisma.operationLog.create({
    data: {
      tenantId: ctx.tenantId,
      kind: 'gate',
      actor: ctx.agentId,
      summary: `闸门拦截 outbound「${toolName}」，停在确认前待人拍板`,
      ref: pa.id,
    },
  });
  return {
    status: 'pending',
    pendingActionId: pa.id,
    toolName,
    harm: parsedHarm,
  };
}

/** 人确认 → 签发令牌 → 执行 → 同事务 executed + irrev 留痕。 */
export async function confirmPendingAction(
  pendingActionId: string,
  ctx: ToolContext,
): Promise<{ executed: true; output: unknown }> {
  const pa = await prisma.pendingAction.findFirst({
    where: { id: pendingActionId, tenantId: ctx.tenantId },
  });
  if (!pa) throw new Error('[gate] 未找到待确认动作');
  if (pa.status !== 'pending')
    throw new Error('[gate] 该动作已处理（单次使用，不可重复确认）');
  if (pa.expiresAt && pa.expiresAt.getTime() < Date.now()) {
    throw new Error('[gate] 确认已过期（TTL），请重新发起');
  }
  const tool = getTool(pa.toolName);
  if (!tool) throw new Error(`[gate] 工具已不存在: ${pa.toolName}`);

  // 二次校验 payloadHash（防 inputJson 被篡改）
  if (
    payloadHashOf(pa.toolName, pa.inputJson, ctx.tenantId) !== pa.payloadHash
  ) {
    throw new Error('[gate] payloadHash 不匹配，拒绝执行');
  }

  // 签发确认令牌（只存 hash，短 TTL 已由 expiresAt 保证，单次由 status 保证，绑 payloadHash）。
  const token = randomBytes(32).toString('hex');
  const confirmationTokenHash = hashToken(token);

  // 经唯一执行入口执行（ctx 携令牌 → executeTool 放行 outbound 副作用）。
  const result = await executeTool(pa.toolName, pa.inputJson, {
    ...ctx,
    confirmationToken: token,
  });

  // 同事务：标记 executed（含 token hash）+ 写不可逆留痕（G5：确认与留痕同事务，可查可按类型筛）。
  await prisma.$transaction([
    prisma.pendingAction.update({
      where: { id: pa.id },
      data: { status: 'executed', confirmationTokenHash },
    }),
    prisma.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'irrev',
        actor: ctx.agentId,
        summary: `已确认并执行不可逆 outbound「${pa.toolName}」`,
        ref: pa.id,
      },
    }),
  ]);

  return {
    executed: true,
    output: 'output' in result ? result.output : result,
  };
}

/** 拒绝 → 失效该 PA + block 留痕。 */
export async function rejectPendingAction(
  pendingActionId: string,
  ctx: ToolContext,
): Promise<{ rejected: true }> {
  const pa = await prisma.pendingAction.findFirst({
    where: { id: pendingActionId, tenantId: ctx.tenantId },
  });
  if (!pa) throw new Error('[gate] 未找到待确认动作');
  if (pa.status !== 'pending') throw new Error('[gate] 该动作已处理');
  await prisma.$transaction([
    prisma.pendingAction.update({
      where: { id: pa.id },
      data: { expiresAt: new Date(0) },
    }),
    prisma.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'block',
        actor: ctx.agentId,
        summary: `操盘手拒绝 outbound「${pa.toolName}」`,
        ref: pa.id,
      },
    }),
  ]);
  return { rejected: true };
}
