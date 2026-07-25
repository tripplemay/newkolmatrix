// M4.5-AGENT-LOOP F009 — agent loop 装配（从 /api/agent route 抽出，带模型 / 上下文注入缝）
//
// 抽出缘由（P5）：loop 的机械面——步数上限截停、工具子集收窄、outbound pending 停驻、
// 人格接力切换——必须能在不打真网关的前提下被测试驱动。route 只留 HTTP 边界（解析请求、
// 响应头、错误处理），loop 装配集中在此；测试床注入 mock LanguageModel 走**同一条装配路径**，
// 「与 /api/agent 同款 loop」由共用同一函数保证，而不是在测试里复刻一份（复刻必漂移）。
//
// 【注入缝纪律】（M4 实证教训，project-status「关键技术坑」）：model / ctx 一旦传入就
// **无条件使用**——不得因凭据缺失把注入的 model 改道回默认 caller，否则无凭据环境（CI）下
// mock 测试会静默走进降级分支，测的不是被测对象。

import {
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import {
  chatModel,
  describeGatewayError,
  DEFAULT_MAX_OUTPUT_TOKENS,
} from 'lib/ai/gateway';
import { buildToolContext } from './context';
import { gameKnowledgeSection } from './knowledge-context';
import {
  buildLoopTelemetryPayload,
  logLoopTelemetry,
  type LoopTelemetryPayload,
  type LoopTelemetryWriter,
} from './loop-telemetry';
import {
  personaToolSubset,
  selectPersona,
  type CopilotContext,
} from './persona-router';
import { NO_TOOL_CLAUSE, type AgentPersona } from './registry';
import { ensureNativeToolsRegistered } from './tools';
import { getTool } from './tools/registry';
import type { ToolContext } from './tools/types';
import { toAiSdkTools } from './to-ai-sdk-tools';

/** 单次会话的步数上限（F002 起改为按人格预算 AgentPersona.maxSteps，registry 单一真相源）。 */
const MAX_STEPS = 5;

export function loopBudget(_persona: AgentPersona): number {
  return MAX_STEPS;
}

export interface AgentLoopParams {
  copilot: CopilotContext;
  messages: ModelMessage[];
  /** 注入缝（F009 测试床）：给了就无条件用。缺省 = 真网关 chatModel()。 */
  model?: LanguageModel;
  /** 注入缝（F009 测试床）：给了就无条件用（夹具租户）。缺省 = buildToolContext（dev 租户）。 */
  ctx?: ToolContext;
  /** 注入缝（F001 遥测测试）：给了就无条件用。缺省 = 落 OperationLog。 */
  telemetryWriter?: LoopTelemetryWriter;
}

export interface AgentLoopRun {
  persona: AgentPersona;
  ctx: ToolContext;
  /** 拼好的 system 段（人格 + ⑤层知识 + 工具指引）——测试可直接断言，无需复刻拼接。 */
  system: string;
  /** 本次会话可见的工具名子集（人格收窄后）。 */
  toolNames: string[];
  /** 本次会话的步数预算（= persona.maxSteps）。 */
  maxSteps: number;
  result: ReturnType<typeof streamText<ToolSet>>;
  /**
   * 遥测句柄（F001）：会话结束后落库尝试的结果。
   * **调用方不需要 await**——落库本身是 fire-and-forget，此 promise 只为测试可确定性等待
   *（以及未来需要「会话结束回调」的编排面）。会话异常中断时可能永不 resolve，故不得在
   * 请求路径上 await 它。
   */
  telemetry: Promise<LoopTelemetryPayload | null>;
}

/**
 * 系统提示 = 人格（身份 + 职责 + 否定式护栏）+ ⑤层知识段 + 该人格可用工具的使用指引。
 * 无工具人格走 NO_TOOL_CLAUSE 分支（M2-C F003：明示「未执行任何动作」+ 指路，防幻觉执行）。
 */
export function buildLoopSystem(
  persona: AgentPersona,
  toolNames: string[],
  knowledgeSection: string,
): string {
  const toolLines = toolNames
    .map((name) => {
      const t = getTool(name);
      return t ? `- ${name}: ${t.description}` : null;
    })
    .filter(Boolean);
  return (
    persona.systemPrompt +
    knowledgeSection +
    (toolLines.length
      ? `\n\n你可调用的工具（需要时主动调用，基于返回的真实数据作答）：\n${toolLines.join(
          '\n',
        )}`
      : NO_TOOL_CLAUSE)
  );
}

/**
 * 装配并启动一次 agent loop。返回 streamText 结果 + 装配产物（人格 / ctx / system / 工具子集），
 * 供 route 转 HTTP 流、供测试床直接断言机械面。
 */
export async function runAgentLoop(
  params: AgentLoopParams,
): Promise<AgentLoopRun> {
  ensureNativeToolsRegistered(); // 确保 native 工具已注册（getTool/toAiSdkTools 依赖）

  const { copilot, messages } = params;
  const persona = selectPersona(copilot);
  const ctx =
    params.ctx ??
    (await buildToolContext({
      agentId: copilot.agentId,
      projectId: copilot.projectId,
      env: copilot.env,
    }));

  // 收窄工具子集 = 该人格绑定的工具（不同人格看到不同工具）。
  const toolNames = personaToolSubset(persona);
  const tools = toAiSdkTools(toolNames, ctx);

  // ⑤层知识注入（M1-D F005）：经 Project.gameId 查链头按 persona.knowledgeKinds 拼知识段；
  // ctx.projectId 为空 / 人格未声明 kinds / 无知识 → 空串跳过（不注水）。
  const knowledgeSection = copilot.projectId
    ? await gameKnowledgeSection(copilot.projectId, persona.knowledgeKinds)
    : '';

  const system = buildLoopSystem(persona, toolNames, knowledgeSection);
  const maxSteps = loopBudget(persona);

  // 人格轨迹（F005 循环内接力时由 prepareStep 更新；无接力的会话恒为起始人格、switches=0）。
  const track = { current: persona.id, switches: 0 };

  // 遥测句柄：会话结束后 resolve。**请求路径不得 await**（见 AgentLoopRun.telemetry 注释）。
  let settleTelemetry: (v: LoopTelemetryPayload | null) => void = () => {};
  const telemetry = new Promise<LoopTelemetryPayload | null>((resolve) => {
    settleTelemetry = resolve;
  });

  const result = streamText({
    // 注入缝：传入即无条件使用（不因凭据缺失改道）。
    model: params.model ?? chatModel(),
    system,
    messages,
    tools,
    stopWhen: stepCountIs(maxSteps),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    onError: ({ error }) => {
      console.error('[agent/loop]', describeGatewayError(error));
    },
    // F001 遥测：会话结束落一行元数据（**不含正文**，见 loop-telemetry.ts 隐私边界）。
    onEnd: (event) => {
      const usage = event.usage as {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      };
      const payload = buildLoopTelemetryPayload({
        agentId: persona.id,
        finalAgentId: track.current,
        steps: event.steps.length,
        maxSteps,
        finishReason: String(event.finishReason),
        // 工具序列含重复且保序——循环形状的指纹（只取名字，不取入参）
        toolNames: event.steps.flatMap((s) =>
          s.toolCalls.map((c) => c.toolName),
        ),
        personaSwitches: track.switches,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
        },
      });
      // fire-and-forget：不 await（不阻塞流式响应）；失败在 logLoopTelemetry 内 console.error。
      void logLoopTelemetry(ctx, payload, params.telemetryWriter).then(() =>
        settleTelemetry(payload),
      );
    },
  });

  return { persona, ctx, system, toolNames, maxSteps, result, telemetry };
}
