// M4.7-FRONTDESK F002 — consult_specialist（internal/native，**仅前台持有**）
//
// 单一前台的核心动作：前台不把对话让给专家，而是**在内部咨询专家**，拿回结构化
// 结果后用一个声音作答。用户全程只跟一个助手说话，不再被内部的人格分区绊住。
//
// ── 与 M4.5 handoff_to 的区别（两者并存，语义不同）──
//   handoff_to  ：把对话**交出去**，后续步由目标人格接管，用户看得见身份切换
//   consult_specialist：把问题**问出去**，专家答完即回，对话身份自始至终是前台
//
// ── 红线 ──
// 子 loop 走的还是同一个 executeTool：outbound 一律停 pending（不因"内部调用"放行），
// 目标人格只看得见自己的工具，且不继承前台的 confirmationToken。详见 specialist-loop.ts。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { createHandoff } from '../handoff';
import {
  ALL_AGENT_IDS,
  FRONT_DESK_AGENT_ID,
  MAX_CONSULTS_PER_TURN,
  type AgentId,
} from '../registry';
import {
  runSpecialistLoop,
  type SpecialistLoopResult,
} from '../specialist-loop';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  targetAgent: z
    .enum(ALL_AGENT_IDS as [AgentId, ...AgentId[]])
    .describe('要咨询哪位专家（必须是名册里的合法专家，且不能是你自己）'),
  question: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      '要问什么。用你自己的话把问题说清楚——专家会按自己的职责重新读真实数据，' +
        '不会采信你转述里的结论',
    ),
  refs: z
    .array(z.string().min(1).max(200))
    .max(10)
    .nullish()
    .describe('可选：相关引用（项目/组合/报告等的标识），给专家指路用'),
});

export type ConsultSpecialistInput = z.infer<typeof inputSchema>;

/** 咨询自己被拒时的消息（测试与前台文案共用锚点）。 */
export const CONSULT_SELF_MSG = '不能咨询你自己';

/** 咨询次数用尽时的消息。**如实拒绝**，不静默吞、不假装咨询过。 */
export const CONSULT_BUDGET_EXHAUSTED_MSG =
  '本轮咨询次数已用尽（上限由 MAX_CONSULTS_PER_TURN 决定）——请用已拿到的结果作答，并如实告诉用户还有哪些没问到';

/** 超时失败的可辨前缀（前台据此如实转达"没等到"，而非笼统说"失败"）。 */
export const CONSULT_TIMEOUT_HINT = '专家未在时限内返回';

/** 咨询失败留痕标记（线上归因用；测试与查询共用锚点）。 */
export const CONSULT_FAILED_MARKER = 'consult_specialist:FAILED';

export interface ConsultSpecialistOutput {
  type: 'consultation';
  /**
   * 咨询是否拿到结果（M4.7 F007 / D-4 裁决 A）。
   *
   * false 时 `answer` 为空、`failureReason` 说明原因。前台必须**如实说没问到**，
   * 不得用自己的猜测填补、不得宣称咨询过并得到结论——静默降级成"前台自己编"
   * 是本批最不能接受的失败模式（用户只听得见前台的声音，无从分辨）。
   */
  ok: boolean;
  /** 失败原因（ok=false 时非空）。原样透传，不美化。 */
  failureReason?: string;
  /** 实际作答的专家。 */
  agentId: string;
  /**
   * 前台问出去的原话（M4.7 fix_round1 / F008）。
   * 痕迹要展示「问了什么」——只说"咨询了某专家"而不说问了什么，
   * 用户无从判断这次咨询是否问对了地方。
   */
  question: string;
  /** 专家的结论正文（前台可组织语言转述，但不得改写其中的结论性内容）。 */
  answer: string;
  /** 专家实际调用的工具序列（可解释性：让人看得见结论是从哪读出来的）。 */
  toolNames: string[];
  steps: number;
  /** 专家没说完（撞了步数上限）——前台必须如实转达，不得假装答完。 */
  budgetHit: boolean;
  /**
   * 专家的数据不足以支撑数值结论（M4.7 F005）。为真时前台**不得给出任何数值结论**
   *（registry 的 FRONT_DESK_HONESTY_CLAUSE 明写，e2e 机械断言）。
   */
  insufficientEvidence: boolean;
  /** 证据缺在哪——原样透传专家给的原话，不概括不改写。 */
  insufficientReasons: string[];
}

async function run(
  input: ConsultSpecialistInput,
  ctx: ToolContext,
): Promise<ConsultSpecialistOutput> {
  if (input.targetAgent === FRONT_DESK_AGENT_ID) {
    throw new Error(`[consult-specialist] ${CONSULT_SELF_MSG}`);
  }
  // 每轮咨询次数硬上限（M4.7 F006 / D-3）。计数器由 runAgentLoop 挂在 ctx 上，
  // 一轮一个；**用尽即如实拒绝**——静默降级成"前台自己编"是本批最不能接受的失败模式。
  const budget = ctx.consultBudget;
  if (budget && budget.used >= budget.max) {
    throw new Error(`[consult-specialist] ${CONSULT_BUDGET_EXHAUSTED_MSG}`);
  }
  if (budget) budget.used += 1;
  let result: SpecialistLoopResult;
  try {
    result = await runSpecialistLoop({
      targetAgent: input.targetAgent,
      question: buildQuestion(input),
      ctx,
    });
  } catch (err) {
    // 【不抛穿】子 loop 炸了不该把整场会话带走（同知识段 D2 纪律：增强性能力
    // 失败不打死主链路）。返回结构化失败，让前台如实转达。
    // 超时与一般失败要能分辨——线上归因时"网关挂死"和"工具报错"是两码事。
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' ||
        err.name === 'AbortError' ||
        /timeout|aborted/i.test(err.message));
    const reason = isTimeout
      ? `咨询超时（${CONSULT_TIMEOUT_HINT}）：${err instanceof Error ? err.message : String(err)}`
      : err instanceof Error
        ? err.message
        : String(err);
    await logConsultFailure(input.targetAgent, reason, ctx);
    return {
      type: 'consultation',
      ok: false,
      failureReason: reason,
      agentId: input.targetAgent,
      question: input.question,
      answer: '',
      toolNames: [],
      steps: 0,
      budgetHit: false,
      insufficientEvidence: false,
      insufficientReasons: [],
    };
  }
  // D-5 裁决 A：咨询也落 Handoff 行——该表语义由「交接」扩为「协作」，
  // 成为协作痕迹的统一数据源（跨会话可查，不只活在这一轮的流里）。
  await logConsultHandoff(input, result, ctx);
  return {
    type: 'consultation',
    ok: true,
    agentId: result.agentId,
    question: input.question,
    answer: result.text,
    toolNames: result.toolNames,
    steps: result.steps,
    budgetHit: result.budgetHit,
    insufficientEvidence: result.insufficientEvidence,
    insufficientReasons: result.insufficientReasons,
  };
}

/**
 * 咨询落 Handoff 行（fromAgent=前台 / toAgent=专家）。
 * 落行失败不得打死咨询本身——痕迹是增强，不是主链路（同知识段 D2 纪律）。
 */
async function logConsultHandoff(
  input: ConsultSpecialistInput,
  result: SpecialistLoopResult,
  ctx: ToolContext,
): Promise<void> {
  try {
    await createHandoff(ctx, {
      projectId: ctx.projectId ?? null,
      fromAgent: FRONT_DESK_AGENT_ID,
      toAgent: input.targetAgent,
      artifactType: 'report',
      artifactRef: input.refs?.[0] ?? (ctx.projectId ?? 'consultation'),
      summary: `咨询${input.targetAgent}：${input.question.slice(0, 160)}`,
      messages: [],
    });
  } catch (e) {
    console.error('[consult-specialist] 协作痕迹落库失败（已忽略）:', e);
  }
}

/**
 * 咨询失败必须留痕——否则线上只看得到"前台说没问到"，无从归因是哪一步炸的。
 * 留痕本身失败不得再抛（fire-and-forget 语义，同 loop 遥测）。
 */
async function logConsultFailure(
  targetAgent: string,
  reason: string,
  ctx: ToolContext,
): Promise<void> {
  try {
    const db = ctx.db ?? prisma;
    await db.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.agentId,
        summary: `${CONSULT_FAILED_MARKER} 咨询 ${targetAgent} 未拿到结果：${reason.slice(0, 200)}`,
        projectId: ctx.projectId ?? null,
      },
    });
  } catch (e) {
    console.error('[consult-specialist] 失败留痕落库失败（已忽略）:', e);
  }
}

/** 把引用拼进问题——专家据此定位数据，但仍要自己去读。 */
function buildQuestion(input: ConsultSpecialistInput): string {
  const refs = input.refs?.filter(Boolean) ?? [];
  if (refs.length === 0) return input.question;
  return `${input.question}\n\n相关引用（请自行核实，勿采信转述）：${refs.join('、')}`;
}

export const consultSpecialistTool: ToolDefinition<
  ConsultSpecialistInput,
  ConsultSpecialistOutput
> = {
  name: 'consult_specialist',
  description:
    '把一个专业问题交给对应的专家，拿回他的结论。你负责受理与综合，不亲自做专家的活。' +
    '专家会用自己的工具重新读真实数据——**他的结论你可以组织语言转述，但不得改写其中的' +
    '数值、状态与证据充分性判断**。他说证据不足，你就照实说证据不足。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: run,
};
