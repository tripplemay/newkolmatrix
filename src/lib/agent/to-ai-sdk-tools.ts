// AGENT-FOUNDATION F005 — 注册表 → Vercel AI SDK ToolSet 桥接（柱二）
//
// 把内部工具注册表映射为 streamText 可用的 ToolSet。关键：每个 AI SDK 工具的 execute
// 都委托给唯一执行入口 executeTool——保证模型自主发起的每次工具调用都统一经过
// zod 入参校验 + class 分流（outbound 门控挂载点，F009）。模型不能绕过 executeTool。

import { tool, type ToolSet } from 'ai';
import { executeTool } from './execute';
import { getTool } from './tools/registry';
import type { ToolContext } from './tools/types';

export interface ToAiSdkToolsOpts {
  /**
   * 当值人格的工具子集判定（M4.5 F005 时刻隔离）。
   *
   * 循环内人格接力（handoff_to）要求 ToolSet 承载多个人格的工具并列，靠 `activeTools`
   * 按步收窄模型视野。但**视野收窄不等于执行禁止**——模型仍可能发出子集外的工具调用
   *（历史消息里见过的工具名、幻觉），那时若无服务端硬挡，隔离就只是「不告诉它有」而已。
   * 故执行侧再挡一道：不在当值子集内一律拒绝执行。
   *
   * 缺省（不传）= 不做子集判定，行为与 M4.5 前完全一致。
   */
  isToolActive?: (name: string) => boolean;
}

/** 越权调用的明示拒绝文案锚点（负向断言引用）。 */
export const TOOL_NOT_IN_SUBSET_MSG = '不在当值人格的工具子集内';

/**
 * 按工具名子集构造 ToolSet。F006 persona router 传入按人格收窄后的子集；
 * 未知工具名跳过（不抛，容忍人格声明与注册表暂时不同步）。
 */
export function toAiSdkTools(
  toolNames: string[],
  ctx: ToolContext,
  opts: ToAiSdkToolsOpts = {},
): ToolSet {
  const set: ToolSet = {};
  for (const name of toolNames) {
    const def = getTool(name);
    if (!def) continue;
    set[name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input: unknown) => {
        if (opts.isToolActive && !opts.isToolActive(name)) {
          throw new Error(`[persona] 工具 ${name} ${TOOL_NOT_IN_SUBSET_MSG}`);
        }
        const result = await executeTool(name, input, ctx);
        return result.output;
      },
    });
  }
  return set;
}
