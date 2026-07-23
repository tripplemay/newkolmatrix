// AGENT-FOUNDATION F009 → M3-A-REACH-CRM F002 — AI→人闸门服务（两步票据 + 7 态，§9.3.2 全量）
//
// 核心不变量：outbound 动作，模型自主 loop 永远拿不到确认令牌 → 只能停在「pending」，无法自我放行。
// 两步票据（消 R15 并发双确认）：
//   confirm = 签票：校验 pending + 未过期 + payloadHash → 原子条件 UPDATE（WHERE status='pending'，
//     败者 409）→ status=confirmed + 只存 ticketHash + gate 留痕；**执行票明文仅在 confirm 响应
//     出现一次**，DB 只存 hash（ADR-25：内部 confirmationToken 则完全不出服务端进程）。
//   execute = 消费票：校验票 hash + 未过期 → 原子条件 UPDATE（WHERE status='confirmed' AND
//     ticketUsedAt IS NULL AND ticketExpiresAt > now()，败者 409）→ executing → 副作用 →
//     **同一事务** executed + irrev 留痕 + 业务态变更（ctx.db 注入）；失败 → failed、无 irrev 行。
//   reject = 真实 rejected 态（清 v0 的 expiresAt=epoch 债）+ block 留痕。
// 7 态：pending → confirmed → executing → executed / failed；pending → rejected；
//       pending / confirmed → expired（超时，lazy 翻转）。
// HTTP 分码（GateError.code）：403 GATE_TOKEN_INVALID / 404 GATE_NOT_FOUND /
//   409 GATE_ALREADY_DECIDED / 410 GATE_EXPIRED——route 层按 httpStatus 映射 envelope。

import { createHash, randomBytes } from 'node:crypto';
import type { PendingAction, Prisma } from '@prisma/client';
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

const CONFIRM_TTL_MS = 15 * 60 * 1000; // pending 确认窗口（15 分钟）
const TICKET_TTL_MS = 5 * 60 * 1000; // 执行票短 TTL（5 分钟）——签票后须尽快消费

// ── 错误分码（§9.3.2 envelope，G 系测试断言引用）──

export type GateErrorCode =
  | 'GATE_TOKEN_INVALID'
  | 'GATE_NOT_FOUND'
  | 'GATE_ALREADY_DECIDED'
  | 'GATE_EXPIRED';

const GATE_HTTP_STATUS: Record<GateErrorCode, 403 | 404 | 409 | 410> = {
  GATE_TOKEN_INVALID: 403,
  GATE_NOT_FOUND: 404,
  GATE_ALREADY_DECIDED: 409,
  GATE_EXPIRED: 410,
};

export class GateError extends Error {
  readonly code: GateErrorCode;
  readonly httpStatus: 403 | 404 | 409 | 410;

  constructor(code: GateErrorCode, message: string) {
    super(message);
    this.name = 'GateError';
    this.code = code;
    this.httpStatus = GATE_HTTP_STATUS[code];
  }
}

// ── 哈希工具 ──

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

// ── 创建（outbound 拦截落点，语义不变）──

/** outbound 未过闸门 → 落 PendingAction + gate 留痕，返回 pending 信封（无令牌、无票）。 */
export async function createPendingAction(
  toolName: string,
  input: unknown,
  harm: Harm,
  ctx: ToolContext,
): Promise<PendingActionEnvelope> {
  const payloadHash = payloadHashOf(toolName, input, ctx.tenantId);
  const expiresAt = new Date(Date.now() + CONFIRM_TTL_MS);
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
      // M1-C F002（D-A）：只填不判——雷达要能指回项目与提案人格；null 合法
      projectId: ctx.projectId ?? null,
      agentId: ctx.agentId,
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

// ── 查询（GET /api/actions/[id]，确认卡刷新 / 跨会话恢复）──

export interface PendingActionDetail {
  id: string;
  toolName: string;
  kind: string;
  status: PendingAction['status'];
  harm: unknown;
  projectId: string | null;
  agentId: string | null;
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
  ticketExpiresAt: string | null;
  ticketUsedAt: string | null;
}

/** 惰性过期翻转：pending 过确认窗 / confirmed 过票窗 → expired（原子条件 UPDATE，幂等）。 */
async function lazyExpire(pa: PendingAction): Promise<PendingAction> {
  const now = Date.now();
  const confirmWindowPassed =
    pa.status === 'pending' && !!pa.expiresAt && pa.expiresAt.getTime() < now;
  const ticketWindowPassed =
    pa.status === 'confirmed' &&
    !!pa.ticketExpiresAt &&
    pa.ticketExpiresAt.getTime() < now;
  if (!confirmWindowPassed && !ticketWindowPassed) return pa;
  await prisma.pendingAction.updateMany({
    where: { id: pa.id, status: pa.status }, // 条件写：并发下已流转则不动
    data: { status: 'expired' },
  });
  const fresh = await prisma.pendingAction.findUnique({ where: { id: pa.id } });
  return fresh ?? { ...pa, status: 'expired' };
}

/** 详情（脱敏：不含 inputJson / 各类 hash——披露以 harm 为准，凭据不出闸门服务）。 */
export async function getPendingActionDetail(
  pendingActionId: string,
  ctx: ToolContext,
): Promise<PendingActionDetail> {
  const found = await prisma.pendingAction.findFirst({
    where: { id: pendingActionId, tenantId: ctx.tenantId },
  });
  if (!found) throw new GateError('GATE_NOT_FOUND', '未找到该待确认动作');
  const pa = await lazyExpire(found);
  return {
    id: pa.id,
    toolName: pa.toolName,
    kind: pa.kind,
    status: pa.status,
    harm: pa.harmJson,
    projectId: pa.projectId,
    agentId: pa.agentId,
    createdAt: pa.createdAt.toISOString(),
    expiresAt: pa.expiresAt?.toISOString() ?? null,
    decidedAt: pa.decidedAt?.toISOString() ?? null,
    ticketExpiresAt: pa.ticketExpiresAt?.toISOString() ?? null,
    ticketUsedAt: pa.ticketUsedAt?.toISOString() ?? null,
  };
}

// ── 第一步：confirm = 签票 ──

export interface ConfirmResult {
  confirmed: true;
  pendingActionId: string;
  /** 一次性执行票——**仅在本响应出现一次**，DB 只存 hash；过期须重新发起整个动作。 */
  ticket: string;
  ticketExpiresAt: string;
}

/** 人确认 → 签发一次性执行票（原子条件 UPDATE WHERE status='pending'，并发败者 409）。不执行副作用。 */
export async function confirmPendingAction(
  pendingActionId: string,
  ctx: ToolContext,
): Promise<ConfirmResult> {
  const pa = await prisma.pendingAction.findFirst({
    where: { id: pendingActionId, tenantId: ctx.tenantId },
  });
  if (!pa) throw new GateError('GATE_NOT_FOUND', '未找到该待确认动作');
  if (pa.status === 'expired') {
    throw new GateError('GATE_EXPIRED', '确认已过期，请重新发起该动作');
  }
  if (pa.status !== 'pending') {
    throw new GateError('GATE_ALREADY_DECIDED', '该动作已处理（不可重复确认）');
  }
  if (pa.expiresAt && pa.expiresAt.getTime() < Date.now()) {
    await lazyExpire(pa);
    throw new GateError('GATE_EXPIRED', '确认已过期（TTL），请重新发起该动作');
  }
  // payloadHash 复核（防 inputJson 被篡改）
  if (
    payloadHashOf(pa.toolName, pa.inputJson, ctx.tenantId) !== pa.payloadHash
  ) {
    throw new GateError('GATE_TOKEN_INVALID', 'payloadHash 不匹配，拒绝确认');
  }

  const ticket = randomBytes(32).toString('hex');
  const ticketExpiresAt = new Date(Date.now() + TICKET_TTL_MS);

  await prisma.$transaction(async (tx) => {
    // 原子条件 UPDATE #1（消 R15）：并发双确认只有一方 count=1，败者 409。
    const r = await tx.pendingAction.updateMany({
      where: { id: pa.id, tenantId: ctx.tenantId, status: 'pending' },
      data: {
        status: 'confirmed',
        ticketHash: hashToken(ticket), // 明文不落库（ADR-25）
        ticketExpiresAt,
        decidedAt: new Date(),
      },
    });
    if (r.count === 0) {
      throw new GateError('GATE_ALREADY_DECIDED', '该动作已被并发处理（单次确认）');
    }
    // 确认 = 签票（写 gate 日志，§9.3.2）；与状态流转同事务。
    await tx.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'gate',
        actor: ctx.agentId,
        summary: `操盘手确认 outbound「${pa.toolName}」，已签发执行票（待消费）`,
        ref: pa.id,
      },
    });
  });

  return {
    confirmed: true,
    pendingActionId: pa.id,
    ticket,
    ticketExpiresAt: ticketExpiresAt.toISOString(),
  };
}

// ── 第二步：execute = 消费票 → 副作用 → 同一事务收尾 ──

/**
 * 消费执行票并执行副作用。
 * 原子条件 UPDATE #2：WHERE status='confirmed' AND ticketUsedAt IS NULL AND
 * ticketExpiresAt > now() → executing（重放 / 并发败者 409）。
 * 副作用成功 → **同一事务** executed + irrev 留痕 + 业务态变更（工具经 ctx.db 写入）；
 * 失败 → failed、无 irrev 行（业务写入随事务回滚）。外部副作用（真实发信）无法进 DB
 * 事务——适配器以 ctx.gateActionId 为幂等键（P6），crash 重放不重复发信。
 */
export async function executePendingAction(
  pendingActionId: string,
  ticket: string,
  ctx: ToolContext,
): Promise<{ executed: true; output: unknown }> {
  const pa = await prisma.pendingAction.findFirst({
    where: { id: pendingActionId, tenantId: ctx.tenantId },
  });
  if (!pa) throw new GateError('GATE_NOT_FOUND', '未找到该待确认动作');

  switch (pa.status) {
    case 'pending':
      // 未确认先执行（分码表 403 行）
      throw new GateError('GATE_TOKEN_INVALID', '尚未确认，无执行票可消费');
    case 'expired':
      throw new GateError('GATE_EXPIRED', '已过期，请重新发起该动作');
    case 'confirmed':
      break;
    default:
      // executing / executed / failed / rejected
      throw new GateError('GATE_ALREADY_DECIDED', '该动作已处理（票已消费或已终态）');
  }

  if (!ticket || !pa.ticketHash || hashToken(ticket) !== pa.ticketHash) {
    throw new GateError('GATE_TOKEN_INVALID', '执行票无效');
  }
  if (pa.ticketExpiresAt && pa.ticketExpiresAt.getTime() < Date.now()) {
    await lazyExpire(pa);
    throw new GateError('GATE_EXPIRED', '执行票已过期（TTL），请重新发起该动作');
  }
  // payloadHash 复核（防 inputJson 被篡改）
  if (
    payloadHashOf(pa.toolName, pa.inputJson, ctx.tenantId) !== pa.payloadHash
  ) {
    throw new GateError('GATE_TOKEN_INVALID', 'payloadHash 不匹配，拒绝执行');
  }
  const tool = getTool(pa.toolName);
  if (!tool) throw new Error(`[gate] 工具已不存在: ${pa.toolName}`);

  // 原子条件 UPDATE #2（消 R15）：并发双消费 / 票重放只有一方 count=1，败者 409。
  const claimed = await prisma.pendingAction.updateMany({
    where: {
      id: pa.id,
      tenantId: ctx.tenantId,
      status: 'confirmed',
      ticketUsedAt: null,
      ticketExpiresAt: { gt: new Date() },
    },
    data: { status: 'executing', ticketUsedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new GateError('GATE_ALREADY_DECIDED', '执行票已被消费（并发或重放）');
  }

  // 内部确认令牌：服务端进程内生成 → ctx 注入 → executeTool 放行 outbound。不出进程（ADR-25）。
  const token = randomBytes(32).toString('hex');
  const confirmationTokenHash = hashToken(token);

  try {
    const output = await prisma.$transaction(
      async (tx) => {
        // 副作用 + 业务态变更（工具内 DB 写入走 ctx.db = tx，与收尾同一事务）。
        const result = await executeTool(pa.toolName, pa.inputJson, {
          ...ctx,
          confirmationToken: token,
          gateActionId: pa.id,
          db: tx,
        });
        // 同事务收尾：executed + irrev 留痕（G5：要么都成功要么都回滚，不得漏记）。
        await tx.pendingAction.update({
          where: { id: pa.id },
          data: { status: 'executed', confirmationTokenHash },
        });
        await tx.operationLog.create({
          data: {
            tenantId: ctx.tenantId,
            kind: 'irrev',
            actor: ctx.agentId,
            summary: `已确认并执行不可逆 outbound「${pa.toolName}」`,
            ref: pa.id,
          },
        });
        return 'output' in result ? result.output : result;
      },
      // 外部副作用（真实发信 30s abort + 冷重试，F003）在事务窗口内先行——放宽超时。
      { timeout: 90_000, maxWait: 5_000 },
    );
    return { executed: true, output };
  } catch (err) {
    // 副作用失败 → failed、无 irrev 行（业务写入已随事务回滚）；留 auto 痕便于排查。
    await prisma.pendingAction.update({
      where: { id: pa.id },
      data: { status: 'failed' },
    });
    await prisma.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.agentId,
        summary: `执行 outbound「${pa.toolName}」失败：${
          err instanceof Error ? err.message.slice(0, 200) : String(err)
        }`,
        ref: pa.id,
      },
    });
    throw err;
  }
}

// ── 拒绝 ──

/** 拒绝 → 真实 rejected 态（原子条件 UPDATE，清 v0 expiresAt=epoch 债）+ block 留痕。 */
export async function rejectPendingAction(
  pendingActionId: string,
  ctx: ToolContext,
): Promise<{ rejected: true }> {
  const pa = await prisma.pendingAction.findFirst({
    where: { id: pendingActionId, tenantId: ctx.tenantId },
  });
  if (!pa) throw new GateError('GATE_NOT_FOUND', '未找到该待确认动作');
  if (pa.status === 'expired') {
    throw new GateError('GATE_EXPIRED', '已过期，无需拒绝');
  }
  if (pa.status !== 'pending') {
    throw new GateError('GATE_ALREADY_DECIDED', '该动作已处理');
  }
  await prisma.$transaction(async (tx) => {
    const r = await tx.pendingAction.updateMany({
      where: { id: pa.id, tenantId: ctx.tenantId, status: 'pending' },
      data: { status: 'rejected', decidedAt: new Date() },
    });
    if (r.count === 0) {
      throw new GateError('GATE_ALREADY_DECIDED', '该动作已被并发处理');
    }
    await tx.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'block',
        actor: ctx.agentId,
        summary: `操盘手拒绝 outbound「${pa.toolName}」`,
        ref: pa.id,
      },
    });
  });
  return { rejected: true };
}
