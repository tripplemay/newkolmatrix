// M4.5-AGENT-LOOP F001 — loop 遥测（步数 / finishReason / 工具序列 → OperationLog）
//
// 目的（P2）：放开步数预算之前必须先能看见「实际跑了几步、撞没撞上限、调了哪些工具」，
// 否则 U2 的差异化预算无从校准。落一行 OperationLog(kind=auto, payloadJson) 即够。
//
// ── 隐私边界（P2，硬约束）──
// **只记元数据，不记正文**：不写消息内容、不写工具入参、不写工具产物。
// 理由有二：体积（长会话正文可达数十 KB × 每次会话）与隐私（消息里含 KOL 联系方式、报价）。
// buildLoopTelemetryPayload 的入参形状本身就不接受正文——不是靠调用方自觉过滤。
//
// ── 失败纪律（M3-A logEvent silent-fail 教训，database-patterns §6 同族）──
// 落库 fire-and-forget（不阻塞流式响应），但**失败必须 console.error**：静默吞掉的遥测
// 等于没有遥测，而且是「看起来有」的那种，比没有更坏。
//
// ── 注入缝 ──
// write writer 传入即无条件使用（测试注入失败/挂起 writer 覆盖异常分支）。

import { prisma } from 'lib/db/prisma';
import type { Prisma } from '@prisma/client';
import type { AgentId } from './registry';

/** 遥测行的 summary 前缀——查询锚点（`summary startsWith` 即可捞出全部 loop 遥测）。 */
export const LOOP_TELEMETRY_MARKER = 'agent_loop';

/** 载荷版本号：字段形状演进时 +1，历史行可按版本分支解析。 */
export const LOOP_TELEMETRY_VERSION = 1;

export interface LoopTelemetryUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

/** 落 payloadJson 的元数据（**不含任何正文**）。 */
export interface LoopTelemetryPayload {
  v: number;
  /** 起始人格（会话入口）。 */
  agentId: AgentId;
  /** 末步当值人格（F005 循环内接力后可能 ≠ agentId）。 */
  finalAgentId: AgentId;
  steps: number;
  /** 本次会话的步数预算（= persona.maxSteps）。 */
  maxSteps: number;
  /** true = 撞上限被截停（查询区分点，不必去解析 finishReason 语义）。 */
  budgetHit: boolean;
  finishReason: string;
  /** 工具调用名，**含重复且保序**（工具序列 = 循环形状的指纹）。 */
  toolNames: string[];
  toolCallCount: number;
  /** 循环内人格切换次数（F005 前恒 0）。 */
  personaSwitches: number;
  usage: LoopTelemetryUsage;
}

export interface LoopTelemetryInput {
  agentId: AgentId;
  finalAgentId?: AgentId;
  steps: number;
  maxSteps: number;
  finishReason: string;
  toolNames: string[];
  personaSwitches?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

function num(x: number | undefined): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

/** 纯函数：把一次会话的机械面事实装配成载荷（无 IO，可单测）。 */
export function buildLoopTelemetryPayload(
  input: LoopTelemetryInput,
): LoopTelemetryPayload {
  const inputTokens = num(input.usage?.inputTokens);
  const outputTokens = num(input.usage?.outputTokens);
  const totalTokens =
    num(input.usage?.totalTokens) ??
    (inputTokens === null && outputTokens === null
      ? null
      : (inputTokens ?? 0) + (outputTokens ?? 0));
  return {
    v: LOOP_TELEMETRY_VERSION,
    agentId: input.agentId,
    finalAgentId: input.finalAgentId ?? input.agentId,
    steps: input.steps,
    maxSteps: input.maxSteps,
    budgetHit: input.steps >= input.maxSteps,
    finishReason: input.finishReason,
    toolNames: [...input.toolNames],
    toolCallCount: input.toolNames.length,
    personaSwitches: input.personaSwitches ?? 0,
    usage: { inputTokens, outputTokens, totalTokens },
  };
}

/** 一行遥测的落库形状（与 OperationLog 列对齐）。 */
export interface LoopTelemetryRow {
  tenantId: string;
  projectId: string | null;
  actor: string;
  summary: string;
  payload: LoopTelemetryPayload;
}

export type LoopTelemetryWriter = (row: LoopTelemetryRow) => Promise<void>;

const defaultWriter: LoopTelemetryWriter = async (row) => {
  await prisma.operationLog.create({
    data: {
      tenantId: row.tenantId,
      kind: 'auto',
      actor: row.actor,
      summary: row.summary,
      projectId: row.projectId,
      payloadJson: row.payload as unknown as Prisma.InputJsonValue,
    },
  });
};

/** 人读摘要（同样只含元数据）。 */
export function telemetrySummary(payload: LoopTelemetryPayload): string {
  return `${LOOP_TELEMETRY_MARKER} ${payload.agentId} ${payload.steps}/${
    payload.maxSteps
  } 步 ${payload.finishReason}${payload.budgetHit ? ' 撞上限' : ''}`;
}

/**
 * 落一行 loop 遥测。**永不抛**（调用方 fire-and-forget），失败 console.error 不静默。
 * @returns true=已落库 / false=落库失败（已 log）
 */
export async function logLoopTelemetry(
  ctx: { tenantId: string; projectId?: string | null; agentId?: AgentId },
  payload: LoopTelemetryPayload,
  write: LoopTelemetryWriter = defaultWriter,
): Promise<boolean> {
  try {
    await write({
      tenantId: ctx.tenantId,
      projectId: ctx.projectId ?? null,
      actor: payload.agentId,
      summary: telemetrySummary(payload),
      payload,
    });
    return true;
  } catch (error) {
    console.error(
      `[agent/loop-telemetry] 遥测落库失败（不影响会话）: ${String(error)}`,
    );
    return false;
  }
}
