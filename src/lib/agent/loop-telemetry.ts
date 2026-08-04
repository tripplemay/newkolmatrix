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

/**
 * 载荷版本号：字段形状演进时 +1，历史行可按版本分支解析。
 *
 * 【v1 → v2（M4.8 F006）】`budgetHitScope` 从二值扩到四值。**必须 bump 的理由不是
 * "多了两个取值"，而是 `'none'` 这个取值的含义变了**：v1 的 `'none'` 只表示"前台没撞顶"
 * ——它对专家撞没撞顶一无所知（子 loop 的 budgetHit 当时只记在 consultation 产物里）；
 * v2 的 `'none'` 表示"前台和专家都没撞"。同一个字面值，两种事实：线上按 scope 统计
 * "专家撞顶率"时，若把 v1 的 `'none'` 行与 v2 的一起算，分母会把一批**未知**当成**否**。
 * 版本号在这里的作用就是让那批历史行可以被显式排除。
 */
export const LOOP_TELEMETRY_VERSION = 2;

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
  /** 本轮咨询了几个专家（M4.7 F006）。只记数量，不记问题正文。 */
  consultCount?: number;
  /**
   * 撞顶发生在哪一层（M4.8 F006 扩四值）。
   * 'front' 只前台撞 / 'specialist' 只专家撞 / 'both' 都撞 / 'none' 都没撞。
   */
  budgetHitScope: BudgetHitScope;
  usage: LoopTelemetryUsage;
}

/** 撞顶层级（M4.8 F006 / D-6：S-M47-G3-5 兑现）。 */
export type BudgetHitScope = 'front' | 'specialist' | 'both' | 'none';

export interface LoopTelemetryInput {
  agentId: AgentId;
  finalAgentId?: AgentId;
  steps: number;
  maxSteps: number;
  finishReason: string;
  toolNames: string[];
  personaSwitches?: number;
  /** M4.7 F006：本轮咨询专家次数（只记数量）。 */
  consultCount?: number;
  /**
   * M4.7 fix_round1（R-6）：是否**真被截停**。
   *
   * 【为什么要调用方传而不是这里算】判据是「步数用满**且末步仍在要工具**」——
   * 末步信息只有 loop 那一层有。此前这里只按 `steps >= maxSteps` 算，于是
   * 自然收敛恰好用满时：用户面（严判据）不告知、遥测（宽判据）却记 budgetHit=true
   * ——同一事实两个消费者口径分歧，线上按遥测算"撞顶率"会系统性偏高。
   */
  truncated?: boolean;
  /**
   * M4.8 F006（D-6 / S-M47-G3-5）：本轮的**咨询产物里有没有专家撞顶**。
   *
   * 【它替换了什么陈述】此处原文写着「子 loop 的撞顶记在各自 consultation 产物的
   * `budgetHit` 上，不混进会话级遥测」——那是 M4.7 的实物，也是 M4.7 签收时挂着的
   * 缺口（S-M47-G3-5）：产物只活在流里，**落库层查不到**，线上因此无从回答
   * 「这次答得不完整，是前台没跑完还是专家没跑完」。现在由主 loop 在 onEnd 聚合
   * 一次（结构判据：consultation 产物的 budgetHit），落进会话级遥测的 scope 里。
   *
   * 【为什么不混进 `budgetHit`】`budgetHit` 是**会话级**「前台被截停」的口径，
   * 用户面的 budget_notice 与它同源（R-6 钉死）。专家撞顶不该让它翻真——
   * 那会让"用户看到了未答完告知"与"遥测记了撞顶"再次分家。分层只进 scope。
   */
  specialistBudgetHit?: boolean;
  /**
   * M4.7 fix_round1 / M4.8 F006：撞顶发生在哪一层。
   * 'front' = 只有前台自己用满步数（用户端会收到 budget_notice）；
   * 'specialist' = 只有被咨询的专家撞了子 loop 上限（前台自然收敛，用户端**无**告知，
   *   但答案里那段专家结论是截断的——这正是此前落库层看不见的那一类）；
   * 'both' = 两层都撞；'none' = 都没撞。
   * 调用方不传（旧调用点）时由 `truncated` / `specialistBudgetHit` 派生。
   */
  budgetHitScope?: BudgetHitScope;
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
  // R-6：与用户面同一判据（步数用满**且末步仍在要工具**）。旧调用点未传 truncated 时
  // 退回步数判据并保持原语义。
  const frontHit = input.truncated ?? input.steps >= input.maxSteps;
  const specialistHit = input.specialistBudgetHit ?? false;
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
    // R-6：与用户面同一判据（会话级 = 前台那一层，不含专家）。
    budgetHit: frontHit,
    finishReason: input.finishReason,
    toolNames: [...input.toolNames],
    toolCallCount: input.toolNames.length,
    personaSwitches: input.personaSwitches ?? 0,
    consultCount: input.consultCount ?? 0,
    // M4.8 F006：四象限。显式给了 scope 就用给的（留给未来的非 loop 调用点），
    // 否则由两层各自的判据派生——两层是**独立**事实，不是一个布尔的两种说法。
    budgetHitScope:
      input.budgetHitScope ??
      (frontHit && specialistHit
        ? 'both'
        : frontHit
        ? 'front'
        : specialistHit
        ? 'specialist'
        : 'none'),
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
