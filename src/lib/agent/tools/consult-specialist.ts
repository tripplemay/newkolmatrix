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

export interface ConsultSpecialistOutput {
  type: 'consultation';
  /** 实际作答的专家。 */
  agentId: string;
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
  const result: SpecialistLoopResult = await runSpecialistLoop({
    targetAgent: input.targetAgent,
    question: buildQuestion(input),
    ctx,
  });
  return {
    type: 'consultation',
    agentId: result.agentId,
    answer: result.text,
    toolNames: result.toolNames,
    steps: result.steps,
    budgetHit: result.budgetHit,
    insufficientEvidence: result.insufficientEvidence,
    insufficientReasons: result.insufficientReasons,
  };
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
