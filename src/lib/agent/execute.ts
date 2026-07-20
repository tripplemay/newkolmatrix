// AGENT-FOUNDATION F005 — 唯一工具执行入口 executeTool（柱二）
//
// 架构稿 §5.2：唯一执行入口，禁止 runTool/executeTool 双语义并存。
// 所有工具调用（HTTP route 的 streamText、未来 MCP server 适配层）都必须经此，
// 以保证 (1) zod 入参校验 (2) class 分流（outbound 门控挂载点，F009 落地）统一生效。

import { getTool } from './tools/registry';
import { createPendingAction } from './gate/gate';
import type { ToolContext, ToolResult } from './tools/types';

/**
 * 唯一执行入口（架构稿 §5.2）。
 * @throws 工具不存在 / 入参 zod 校验失败。
 * outbound 未过闸门时**不抛错**，而是返回 output=PendingActionEnvelope（403/pending + harm，F009）。
 */
export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    throw new Error(`[tools] 未知工具: ${name}`);
  }

  // (1) zod 入参校验（校验在边界，失败快、错误清晰）
  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new Error(`[tools] ${name} 入参校验失败: ${parsed.error.message}`);
  }

  // (2) class 分流：outbound 服务端强制门控（F009，PRD §10.4）。
  //     outbound 且 ctx 无服务端签发的确认令牌 → 不执行副作用，落 PendingAction 并返回 pending + harm。
  //     模型自主 loop 的 ctx 永远没有 confirmationToken（buildToolContext 不设），故无法自我放行。
  //     真正执行只发生在 gate.confirmPendingAction（人确认后）以带令牌的 ctx 再次进入本入口。
  if (tool.class === 'outbound' && !ctx.confirmationToken) {
    if (!tool.buildHarm) {
      throw new Error(
        `[gate] outbound 工具 ${name} 未声明 buildHarm，无法披露利害`,
      );
    }
    const harm = tool.buildHarm(parsed.data as never, ctx);
    const envelope = await createPendingAction(name, parsed.data, harm, ctx);
    return { toolName: name, output: envelope };
  }

  const output = await tool.execute(parsed.data as never, ctx);
  return { toolName: name, output };
}
