// AGENT-FOUNDATION F005 — 注册表 → Vercel AI SDK ToolSet 桥接（柱二）
//
// 把内部工具注册表映射为 streamText 可用的 ToolSet。关键：每个 AI SDK 工具的 execute
// 都委托给唯一执行入口 executeTool——保证模型自主发起的每次工具调用都统一经过
// zod 入参校验 + class 分流（outbound 门控挂载点，F009）。模型不能绕过 executeTool。

import { tool, type ToolSet } from 'ai';
import { executeTool } from './execute';
import { getTool } from './tools/registry';
import type { ToolContext } from './tools/types';

/**
 * 按工具名子集构造 ToolSet。F006 persona router 传入按人格收窄后的子集；
 * 未知工具名跳过（不抛，容忍人格声明与注册表暂时不同步）。
 */
export function toAiSdkTools(toolNames: string[], ctx: ToolContext): ToolSet {
  const set: ToolSet = {};
  for (const name of toolNames) {
    const def = getTool(name);
    if (!def) continue;
    set[name] = tool({
      description: def.description,
      inputSchema: def.inputSchema,
      execute: async (input: unknown) => {
        const result = await executeTool(name, input, ctx);
        return result.output;
      },
    });
  }
  return set;
}
