// M4.5-AGENT-LOOP F009 — loop 测试床（mock LanguageModel 注入缝）
//
// 用途（P5）：脚本化指定「模型逐步发起哪些 tool-call」，驱动 **/api/agent 同款 loop**
// （lib/agent/loop.ts runAgentLoop，真 executeTool 链、真闸门、真人格子集），断言 loop 的
// 机械面——步数上限截停 / 工具子集收窄 / outbound pending 停驻 / 人格接力切换。
//
// 为什么不 mock 网关 HTTP 层：streamText 的连接池与流语义在 HTTP mock 下会失真（M3 实测过
// undici 连接污染类问题）。AI SDK 官方 `ai/test` 的 MockLanguageModelV4 是唯一正解——
// 它替换的是「模型」这一层，loop 装配、工具执行、闸门全是真的。
//
// 零外呼：runScriptedLoop 全程装 fetch 哨兵，任何出网请求都会被记录并使断言翻红
//（模型不出网 = mock；工具若出网 = 违反本批「零新增对外副作用」前提）。
//
// 用法：
//   const run = await runScriptedLoop({
//     copilot: { route: '/admin', projectId: null, env: 'default', agentId: 'insight' },
//     prompt: '帮我看看 ROI',
//     ctx,                                   // 夹具租户 ToolContext
//     script: [
//       { toolCalls: [{ toolName: 'compute_roi', input: { projectId } }] },
//       { text: '结论……' },                  // 末步无 tool call → loop 天然收敛
//     ],
//   });
//   expect(run.toolNames).toEqual(['compute_roi']);
//
// 后续批次扩展：往 ScriptedStep 加字段（如 reasoning / 多工具并发）即可，无需改动被测代码。

import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { runAgentLoop, type AgentLoopRun } from '../../src/lib/agent/loop';
import type { LoopTelemetryWriter } from '../../src/lib/agent/loop-telemetry';
import type { PersonaSwitchEvent } from '../../src/lib/agent/loop';
import type { CopilotContext } from '../../src/lib/agent/persona-router';
import type { ToolContext } from '../../src/lib/agent/tools/types';

/** 脚本化的一步：模型这一步说了什么、调了哪些工具。 */
export interface ScriptedStep {
  /** 本步模型发起的工具调用（按序）。省略/空数组 = 纯文本步 → loop 天然收敛。 */
  toolCalls?: Array<{ toolName: string; input?: unknown }>;
  /** 本步模型输出的文本。 */
  text?: string;
  /** 本步 token 用量（默认 in=10 / out=5，便于遥测断言累加）。 */
  usage?: { input?: number; output?: number };
}

export interface ScriptedLoopResult {
  /** 实际执行的步数（= streamText steps 长度）。 */
  steps: number;
  finishReason: string;
  /** 最终文本（末步）。 */
  text: string;
  /** 全程工具调用名，**含重复且保序**（遥测 toolNames 口径同源）。 */
  toolNames: string[];
  /** 全程工具产物（真 executeTool 输出，如 outbound 的 pending 信封）。 */
  toolOutputs: Array<{ toolName: string; output: unknown }>;
  /** 工具错误（如调了本步不可见的工具 → NoSuchTool）。 */
  toolErrors: Array<{ toolName: string; error: string }>;
  /** 模型每步「看得见」的工具名集合（doStreamCalls 实录 —— 子集收窄的唯一硬证据）。 */
  visibleToolsPerStep: string[][];
  /** 每步实际发给模型的 system 段（prepareStep 切换后会变——人格接力的硬证据）。 */
  systemPerStep: string[];
  /** 出网记录（应恒为空；非空 = 零外呼断言失败）。 */
  networkCalls: string[];
  /** 循环内人格切换事件（F006 / P9：route 据此往 UI 流写 data part）。 */
  personaSwitches: PersonaSwitchEvent[];
  /** 装配产物（persona / ctx / system / toolNames / maxSteps）。 */
  loop: AgentLoopRun;
}

export interface RunScriptedLoopOptions {
  copilot: CopilotContext;
  prompt: string;
  script: ScriptedStep[];
  /** 夹具租户 ToolContext（注入缝：传入即无条件使用）。 */
  ctx?: ToolContext;
  /** 注入缝（F001 遥测测试）：给了就无条件用（覆盖落库失败分支）。 */
  telemetryWriter?: LoopTelemetryWriter;
  /**
   * 脚本跑完后模型仍被调用时的兜底步（默认纯文本，让 loop 收敛）。
   * 设为「继续调工具」可造「打不住的模型」来验步数上限截停。
   */
  fallbackStep?: ScriptedStep;
}

function usagePart(step: ScriptedStep): LanguageModelV4Usage {
  const input = step.usage?.input ?? 10;
  const output = step.usage?.output ?? 5;
  return {
    inputTokens: {
      total: input,
      noCache: input,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

/** 把一个脚本步编译成 provider 层的流片段序列。 */
function compileStep(
  step: ScriptedStep,
  stepIndex: number,
): LanguageModelV4StreamPart[] {
  const parts: LanguageModelV4StreamPart[] = [
    { type: 'stream-start', warnings: [] },
  ];
  if (step.text) {
    const id = `t${stepIndex}`;
    parts.push({ type: 'text-start', id });
    parts.push({ type: 'text-delta', id, delta: step.text });
    parts.push({ type: 'text-end', id });
  }
  const calls = step.toolCalls ?? [];
  calls.forEach((c, i) => {
    parts.push({
      type: 'tool-call',
      toolCallId: `call-${stepIndex}-${i}`,
      toolName: c.toolName,
      input: JSON.stringify(c.input ?? {}),
    });
  });
  const finishReason: LanguageModelV4FinishReason = {
    unified: calls.length ? 'tool-calls' : 'stop',
    raw: undefined,
  };
  parts.push({ type: 'finish', finishReason, usage: usagePart(step) });
  return parts;
}

/** 取一次 provider 调用里模型可见的工具名（activeTools 收窄后的实录）。 */
function visibleTools(options: LanguageModelV4CallOptions): string[] {
  return (options.tools ?? []).map((t) => t.name);
}

/** 取一次 provider 调用里的 system 段（prompt 首条 system 消息）。 */
function systemOf(options: LanguageModelV4CallOptions): string {
  const first = options.prompt.find((m) => m.role === 'system');
  if (!first) return '';
  const content = (first as { content: unknown }).content;
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/**
 * fetch 哨兵：任何出网都被记录并抛错（模型是 mock，工具若出网即违反本批零外呼前提）。
 * 返回 restore 以便 finally 恢复——绝不留污染给后续用例。
 */
export function installNoNetworkSentinel(): {
  calls: string[];
  restore: () => void;
} {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, ...rest: unknown[]) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    calls.push(url);
    void rest;
    throw new Error(`[testbed] 零外呼哨兵拦截出网请求: ${url}`);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** 构造一个脚本化 mock 模型（可单独使用，如需自定义驱动方式）。 */
export function scriptedModel(
  script: ScriptedStep[],
  fallbackStep: ScriptedStep = { text: '（脚本已用尽）' },
): MockLanguageModelV4 {
  let cursor = 0;
  return new MockLanguageModelV4({
    provider: 'testbed',
    modelId: 'scripted-mock',
    doStream: async () => {
      const step = script[cursor] ?? fallbackStep;
      const index = cursor;
      cursor += 1;
      return {
        stream: simulateReadableStream({
          chunks: compileStep(step, index),
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
        }),
      };
    },
  });
}

/**
 * 用脚本驱动一次真实 agent loop，收集机械面证据。
 * 全程零外呼（fetch 哨兵）；工具链、闸门、人格子集全部是产品代码本体。
 */
export async function runScriptedLoop(
  opts: RunScriptedLoopOptions,
): Promise<ScriptedLoopResult> {
  const model = scriptedModel(opts.script, opts.fallbackStep);
  const sentinel = installNoNetworkSentinel();
  try {
    const personaSwitches: PersonaSwitchEvent[] = [];
    const loop = await runAgentLoop({
      copilot: opts.copilot,
      messages: [{ role: 'user', content: opts.prompt }],
      model,
      ctx: opts.ctx,
      telemetryWriter: opts.telemetryWriter,
      onPersonaSwitch: (e) => personaSwitches.push(e),
    });

    const toolErrors: Array<{ toolName: string; error: string }> = [];
    // 逐片消费流（不 consumeStream：错误片需要被看见，不能被静默吞）。
    for await (const part of loop.result.fullStream) {
      if (part.type === 'tool-error') {
        toolErrors.push({
          toolName: (part as { toolName?: string }).toolName ?? '(unknown)',
          error: String((part as { error?: unknown }).error),
        });
      }
    }

    const steps = await loop.result.steps;
    const toolNames = steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
    const toolResults = await loop.result.toolResults;

    return {
      steps: steps.length,
      finishReason: await loop.result.finishReason,
      text: await loop.result.text,
      toolNames,
      toolOutputs: toolResults.map((r) => ({
        toolName: r.toolName,
        output: r.output,
      })),
      toolErrors,
      visibleToolsPerStep: model.doStreamCalls.map(visibleTools),
      systemPerStep: model.doStreamCalls.map(systemOf),
      networkCalls: sentinel.calls,
      personaSwitches,
      loop,
    };
  } finally {
    sentinel.restore();
  }
}
