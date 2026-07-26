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
import { projectContextSection } from './project-context';
import { stageHintSection } from './stage-hint';
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
import {
  allPersonaToolNames,
  getPersona,
  isAgentId,
  MAX_CONSULTS_PER_TURN,
  NO_TOOL_CLAUSE,
  type AgentId,
  type AgentPersona,
} from './registry';
import { ensureNativeToolsRegistered } from './tools';
import { getTool } from './tools/registry';
import { HANDOFF_REREAD_CLAUSE } from './tools/handoff-to';
import type { ToolContext } from './tools/types';
import { toAiSdkTools } from './to-ai-sdk-tools';

/** 循环内接力工具名（仅 orchestrator 持有；见 tools/handoff-to.ts）。 */
const HANDOFF_TOOL = 'handoff_to';

/**
 * 从已完成步骤里解析「当值人格」（M4.5 F005）：取最后一次成功的 handoff_to 产物的 toAgent。
 * 无接力 → null（调用方回落起始人格，行为与 M4.5 前完全一致）。
 *
 * 以 steps 为真相源而非外部可变状态：prepareStep 可能被重放，读 steps 是幂等的。
 */
function latestHandoffTarget(
  steps: ReadonlyArray<{
    toolResults: ReadonlyArray<{ toolName: string; output?: unknown }>;
  }>,
): AgentId | null {
  for (let i = steps.length - 1; i >= 0; i--) {
    for (let j = steps[i].toolResults.length - 1; j >= 0; j--) {
      const r = steps[i].toolResults[j];
      if (r.toolName !== HANDOFF_TOOL) continue;
      const to = (r.output as { type?: string; toAgent?: string } | null)
        ?.toAgent;
      if (typeof to === 'string' && isAgentId(to)) return to;
    }
  }
  return null;
}

/**
 * 单次会话的步数预算（F002 / U2）：**唯一真相源是 registry 的 `AgentPersona.maxSteps`**。
 * 此处只做读取，不得出现任何数字字面量——全仓「第二处硬编码步数」由回归测试
 * `tests/unit/agent-step-budget.test.ts` 以 git grep 钉死。
 */
export function loopBudget(persona: AgentPersona): number {
  return persona.maxSteps;
}

/**
 * 链上最大档位（M4.7 F006 / D-3 裁决）。
 *
 * 【为什么不是"起始人格档位"】前台是常规档（5）；它接力/咨询到深链专家（insight，10）
 * 时若仍按 5 停，等于把深链分析截断在一半——用户看到的是"答到一半戛然而止"。
 * 【为什么不是"当值人格档位"】那会随接力往下跳（深链→常规 = 10 降到 5），
 * 可能当场截停。取最大值是两者里唯一不会中途缩水的口径。
 */
export function chainBudget(agentIds: Iterable<AgentId>): number {
  let max = 0;
  for (const id of agentIds) max = Math.max(max, getPersona(id).maxSteps);
  return max;
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
  /**
   * 人格切换回调（M4.5 F006 / P9）：循环内接力发生时触发一次。
   * route 用它往 UI 流里写 `data-persona_switch` 事件——响应头是一次性的，承载不了切换史。
   */
  onPersonaSwitch?: (event: PersonaSwitchEvent) => void;
}

/** 人格切换事件（P9 流内 data part 的载荷同源）。 */
export interface PersonaSwitchEvent {
  from: AgentId;
  to: AgentId;
  /** 第几步之后发生（0-based step 序） */
  atStep: number;
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

// buildLoopSystem 已抽到 ./system-assembly（断开 tools/index 循环，见该文件头注）。
// 此处**再导出**保持既有引用点不动（loop.ts 一直是它的公开出口）。
export { buildLoopSystem } from './system-assembly';
import { buildLoopSystem as assembleSystem } from './system-assembly';

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
  // M4.7 F001（D-6 裁决 A）：本次会话用的 model 下传进 ctx，供 consult_specialist
  // 起子 loop 时复用同一个——**这是唯一下传点**，别处不得再各自解析 model，
  // 否则测试注入的 mock 只覆盖其中一条路径，另一条静默真外呼。
  const model = params.model ?? chatModel();
  const baseCtx =
    params.ctx ??
    (await buildToolContext({
      agentId: copilot.agentId,
      projectId: copilot.projectId,
      env: copilot.env,
    }));
  // M4.7 F006：每轮一个咨询计数器（可变对象——ToolSet 捕获 ctx 一次，传数字则永不增）。
  const consultBudget = { used: 0, max: MAX_CONSULTS_PER_TURN };
  const ctx: ToolContext = { ...baseCtx, model, consultBudget };

  // 收窄工具子集 = 该人格绑定的工具（不同人格看到不同工具）。
  const toolNames = personaToolSubset(persona);

  // 人格轨迹（F005 循环内接力时由 prepareStep 更新；无接力的会话恒为起始人格、switches=0）。
  const track = { current: persona.id as AgentId, switches: 0 };

  // 循环内接力（F005 / P1 时刻隔离）：持有 handoff_to 的人格（仅 orchestrator）需要
  // ToolSet 承载多人格工具并列，再由 activeTools + 执行侧硬挡按步收窄到当值子集。
  // 其余人格的 ToolSet 仍只有自己的工具——行为与 M4.5 前完全一致。
  const canHandoff = toolNames.includes(HANDOFF_TOOL);
  const toolUniverse = canHandoff
    ? [...new Set([...allPersonaToolNames(), ...toolNames])]
    : toolNames;
  const tools = toAiSdkTools(toolUniverse, ctx, {
    // 视野收窄（activeTools）只影响模型看见什么；执行禁止必须自己挡——
    // 否则模型凭历史消息里的工具名照样能调到别的人格的工具。
    isToolActive: (name) => getPersona(track.current).tools.includes(name),
    // M4.7 F004（闭环 M4.5 O-G2-1）：接力后留痕归属跟着当值人格走。
    // 此前 PendingAction.agentId / OperationLog.actor 恒为**起始**人格 ——
    // insight 当值时备的 pending 记成 orchestrator，今天页雷达深链的
    // agentId→STAGE_AGENT 反查因此落回退分支。
    // 必须是函数：ToolSet 只在装配时构造一次，捕获快照等于永远记起始人格。
    currentAgentId: () => track.current,
  });

  // ⑤层知识注入（M1-D F005）：经 Project.gameId 查链头按 persona.knowledgeKinds 拼知识段；
  // ctx.projectId 为空 / 人格未声明 kinds / 无知识 → 空串跳过（不注水）。
  const knowledgeSection = copilot.projectId
    ? await gameKnowledgeSection(copilot.projectId, persona.knowledgeKinds)
    : '';

  // M4.6 F001：当前项目上下文（ctx 已有，此前从未进入 system 段 → 模型只能反问用户要）。
  // 查一次复用给接力后的目标人格——项目身份与人格无关，不必每次切换重查。
  const projectSection =
    (copilot.projectId ? await projectContextSection(copilot.projectId) : '') +
    // M4.7 F003：环节线索拼在项目上下文之后（同一段位置，同一条空值纪律）。
    // 明写"不限制你能做什么"——否则模型很可能又把位置读成权限边界。
    stageHintSection(copilot.stage);

  const system = assembleSystem(
    persona,
    toolNames,
    knowledgeSection,
    projectSection,
  );
  // 本轮预算：随接力/咨询把链上出现过的人格纳入，取最大档位（D-3 裁决）。
  const budgetChain = new Set<AgentId>([persona.id]);
  const maxSteps = loopBudget(persona);
  const currentBudget = () => chainBudget(budgetChain);

  // 目标人格 system 段缓存（接力后每步都要它；知识段现查一次即可，不必每步打库）
  const switchedSystemCache = new Map<AgentId, string>();
  async function systemForAgent(id: AgentId): Promise<string> {
    const cached = switchedSystemCache.get(id);
    if (cached) return cached;
    const target = getPersona(id);
    const knowledge = copilot.projectId
      ? await gameKnowledgeSection(copilot.projectId, target.knowledgeKinds)
      : '';
    // 接力后的目标人格同样要看得见当前项目（复用同一装配函数与同一 projectSection——
    // 不在这里另拼一份，否则两条路径必然漂移）。
    const built =
      assembleSystem(target, target.tools, knowledge, projectSection) +
      HANDOFF_REREAD_CLAUSE;
    switchedSystemCache.set(id, built);
    return built;
  }

  // 遥测句柄：会话结束后 resolve。**请求路径不得 await**（见 AgentLoopRun.telemetry 注释）。
  let settleTelemetry: (v: LoopTelemetryPayload | null) => void = () => {};
  const telemetry = new Promise<LoopTelemetryPayload | null>((resolve) => {
    settleTelemetry = resolve;
  });

  const result = streamText({
    // 注入缝：传入即无条件使用（不因凭据缺失改道）。与下传进 ctx 的是**同一个**
    // model 实例（上方单一解析点），保证前台与子 loop 用的是同一条注入缝。
    model,
    system,
    messages,
    tools,
    // 起始视野 = 起始人格子集（ToolSet 可能是并集，视野永远只有当值那一份）
    activeTools: toolNames,
    // 动态预算：stepCountIs 是静态的，而链上最大档位要随接力抬升，故用谓词。
    // 判据与 stepCountIs 同款（步数达上限即停），只是上限现算。
    stopWhen: ({ steps }) => steps.length >= currentBudget(),
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    // F005 循环内接力（P1 时刻隔离）：一旦发生过 handoff_to，后续每一步的 system 段与
    // 工具视野都切到目标人格。无接力 → 返回 undefined（沿用外层配置，零行为变化）。
    prepareStep: async ({ steps }) => {
      const target = latestHandoffTarget(steps) ?? persona.id;
      if (target !== track.current) {
        const from = track.current;
        track.current = target;
        track.switches += 1;
        budgetChain.add(target); // 接力进深链专家 → 本轮预算随之抬升（D-3）
        // P9：切换以流内事件标注（边界卡随之刷新）。回调失败不得打死会话。
        try {
          params.onPersonaSwitch?.({ from, to: target, atStep: steps.length });
        } catch (err) {
          console.error('[agent/loop] persona_switch 回调异常（已忽略）:', err);
        }
      }
      if (target === persona.id) return undefined;
      return {
        instructions: await systemForAgent(target),
        activeTools: getPersona(target).tools,
      };
    },
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
        // M4.7 F006：本轮咨询了几个专家（只记数量，不记问题正文）
        consultCount: consultBudget.used,
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
