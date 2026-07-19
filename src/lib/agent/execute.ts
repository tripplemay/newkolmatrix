// AGENT-FOUNDATION F005 — 唯一工具执行入口 executeTool（柱二）
//
// 架构稿 §5.2：唯一执行入口，禁止 runTool/executeTool 双语义并存。
// 所有工具调用（HTTP route 的 streamText、未来 MCP server 适配层）都必须经此，
// 以保证 (1) zod 入参校验 (2) class 分流（outbound 门控挂载点，F009 落地）统一生效。

import { getTool } from './tools/registry';
import type { ToolContext, ToolResult } from './tools/types';

/** outbound 工具在服务端被强制门控前抛出的错误（F009 会替换为 403/pending + harm 结构体）。 */
export class OutboundGateError extends Error {
  constructor(public readonly toolName: string) {
    super(`[gate] outbound 工具 ${toolName} 需服务端签发的确认令牌才能执行（F009 落地）`);
    this.name = 'OutboundGateError';
  }
}

/**
 * 唯一执行入口。
 * @throws 工具不存在 / 入参 zod 校验失败 / outbound 未过闸门（F009）。
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

  // (2) class 分流：outbound 服务端强制门控挂载点。
  //     本批无 outbound 工具（search_kols/get_kol_detail 均 internal）；
  //     F009 在此实装「无确认令牌 → 不执行副作用、返回 403/pending + harm」。
  //     模型自主 loop 永远拿不到令牌，无法自我放行（PRD §10.4）。
  if (tool.class === 'outbound') {
    // EXTENSION POINT (F009)：此处替换为「检查 ctx 携带的服务端确认令牌」。
    throw new OutboundGateError(name);
  }

  const output = await tool.execute(parsed.data as never, ctx);
  return { toolName: name, output };
}
