// M4.7-FRONTDESK — 脚本化 doGenerate mock（供子 loop / consult_specialist 测试共用）
//
// 与 agent-loop-testbed 的 scriptedModel 分工：那个驱动 streamText（前台主 loop），
// 这个驱动 generateText（专家子 loop，非流式）。两者共用 usagePart，避免 usage
// 形状各写一份——它随 SDK 版本变过（inputTokens/outputTokens 是对象不是数字），
// 写错只会在 tsc 里炸，但两处漂移会更难查。

import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { usagePart } from './agent-loop-testbed';

export type GenerateScriptStep =
  | { toolName: string; input?: unknown }
  | { text: string };

/** 每次 doGenerate 被调用时，模型实际收到的东西（断言对象应当是它，而非我们以为发出去的）。 */
export interface SeenCall {
  system: string;
  tools: string[];
}

/**
 * 逐步产出脚本指定的 tool-call，用尽后出一段文本。
 * @param seen 传入一个数组，每步把模型收到的 system / 工具清单记进去。
 */
export function scriptedGenerateModel(
  script: GenerateScriptStep[],
  seen: SeenCall[] = [],
) {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async (options): Promise<LanguageModelV4GenerateResult> => {
      seen.push({
        system:
          options.prompt.find((m) => m.role === 'system')?.content?.toString() ??
          '',
        tools: (options.tools ?? []).map(
          (t) => (t as { name: string }).name ?? '',
        ),
      });
      const step = script[i] ?? { text: '（脚本用尽）' };
      i += 1;
      if ('text' in step) {
        return {
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage: usagePart(),
          content: [{ type: 'text', text: step.text }],
          warnings: [],
        };
      }
      return {
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage: usagePart(),
        content: [
          {
            type: 'tool-call',
            toolCallId: `call-${i}`,
            toolName: step.toolName,
            input: JSON.stringify(step.input ?? {}),
          },
        ],
        warnings: [],
      };
    },
  });
}
