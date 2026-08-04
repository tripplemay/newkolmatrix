// M4.8-HARDEN F004 — 主 loop 超时的**失败留痕**（OperationLog 一行元数据）
//
// 目的（BL-LOOP-TIMEOUT-VISIBILITY 的运维半边）：撞 `LOOP_TIMEOUT_MS` 时此前
// **OperationLog 零行** —— 线上"用户说卡住了"与"没人报过障"之间没有任何可查的东西。
// 用户面那半边由流内 `data-timeout_notice` 承担（route.ts），这里只管留痕。
//
// ── 隐私边界（与 loop-telemetry.ts 同一条硬约束）──
// **只记元数据，不记正文**：不写消息内容、不写工具入参、不写工具产物、不写模型输出。
// `buildLoopTimeoutPayload` 的入参形状本身就不接受正文 —— 不靠调用方自觉过滤。
//
// ── 失败纪律（M3-A logEvent silent-fail 教训）──
// 落库 fire-and-forget（不阻塞响应），但**失败必须 console.error**：静默吞掉的留痕
// 比没有留痕更坏（"看起来有"）。
//
// ── 为什么 marker 不沿用 `agent_loop` 前缀 ──
// 遥测行的查询锚点是 `summary startsWith 'agent_loop'`（loop-telemetry.ts）。若超时行
// 写成 `agent_loop_timeout`，它会**静默混进**每一条既有遥测查询的结果集里，把
// "会话遥测计数"这类口径悄悄改掉。两类事实分属两个查询域，前缀就该互不包含。

import { prisma } from 'lib/db/prisma';
import type { Prisma } from '@prisma/client';
import type { AgentId } from './registry';

/** 超时留痕的 summary 前缀——查询锚点（`summary startsWith` 即可捞出全部超时行）。 */
export const LOOP_TIMEOUT_MARKER = 'agent_timeout';

/** 载荷版本号：字段形状演进时 +1，历史行可按版本分支解析。 */
export const LOOP_TIMEOUT_LOG_VERSION = 1;

/** 落 payloadJson 的元数据（**不含任何正文**）。 */
export interface LoopTimeoutPayload {
  v: number;
  /** 事实类型：与遥测行（会话结束）区分开——这一行代表"被墙钟掐断"。 */
  kind: 'loop_timeout';
  /** 被掐断时的当值人格。 */
  agentId: AgentId;
  /** 从 loop 起跑到被掐断经过了多久（毫秒）。 */
  elapsedMs: number;
  /** 被掐断时已经跑完几步。 */
  steps: number;
}

export interface LoopTimeoutInput {
  agentId: AgentId;
  elapsedMs: number;
  steps: number;
}

/** 纯函数：把一次超时的机械面事实装配成载荷（无 IO，可单测）。 */
export function buildLoopTimeoutPayload(
  input: LoopTimeoutInput,
): LoopTimeoutPayload {
  return {
    v: LOOP_TIMEOUT_LOG_VERSION,
    kind: 'loop_timeout',
    agentId: input.agentId,
    elapsedMs: input.elapsedMs,
    steps: input.steps,
  };
}

/** 人读摘要（同样只含元数据）。 */
export function loopTimeoutSummary(payload: LoopTimeoutPayload): string {
  return `${LOOP_TIMEOUT_MARKER} ${payload.agentId} ${payload.elapsedMs}ms ${payload.steps} 步 超时中断`;
}

/** 一行超时留痕的落库形状（与 OperationLog 列对齐）。 */
export interface LoopTimeoutRow {
  tenantId: string;
  projectId: string | null;
  actor: string;
  summary: string;
  payload: LoopTimeoutPayload;
}

export type LoopTimeoutWriter = (row: LoopTimeoutRow) => Promise<void>;

const defaultWriter: LoopTimeoutWriter = async (row) => {
  await prisma.operationLog.create({
    data: {
      tenantId: row.tenantId,
      // kind=auto：与 loop 遥测同族（机器写的观测行，不是人的操作）。
      kind: 'auto',
      actor: row.actor,
      summary: row.summary,
      projectId: row.projectId,
      payloadJson: row.payload as unknown as Prisma.InputJsonValue,
    },
  });
};

/**
 * 落一行超时留痕。**永不抛**（调用方 fire-and-forget），失败 console.error 不静默。
 *
 * @param scope 作用域（tenantId 必填 —— OperationLog 是租户作用域表）
 * @returns true=已落库 / false=落库失败（已 log）
 */
export async function logLoopTimeout(
  scope: { tenantId: string; projectId?: string | null },
  input: LoopTimeoutInput,
  write: LoopTimeoutWriter = defaultWriter,
): Promise<boolean> {
  const payload = buildLoopTimeoutPayload(input);
  try {
    await write({
      tenantId: scope.tenantId,
      projectId: scope.projectId ?? null,
      actor: payload.agentId,
      summary: loopTimeoutSummary(payload),
      payload,
    });
    return true;
  } catch (error) {
    console.error(
      `[agent/loop-timeout] 超时留痕落库失败（不影响会话）: ${String(error)}`,
    );
    return false;
  }
}
