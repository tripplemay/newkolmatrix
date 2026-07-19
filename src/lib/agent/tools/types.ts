// AGENT-FOUNDATION F005 — 工具层类型（柱一）
//
// 工具二分（§3.1 D27/D28 闸门技术基础）：
//   class: internal（AI 直接执行，无确认框）| outbound（服务端强制停在确认前，F009 落地）
// 工具来源抽象（§3.2 D-ORCH）：
//   source: native（本批实装）| mcp（已规划扩展点：注册表结构支持 MCP 桥接，本批不实装 MCP client）

import type { z } from 'zod';

export type ToolClass = 'internal' | 'outbound';
export type ToolSource = 'native' | 'mcp';

/**
 * 工具执行上下文——传输无关（D-INTEROP）。
 * 由调用方（HTTP route / 未来 MCP server / agent API 适配层）构造后传给 executeTool，
 * 工具本身不假设调用方是内部 useChat//api/agent。
 * EXTENSION POINT：actor / requestId / persona scope / 确认令牌 随 F006/F009 充实。
 */
export interface ToolContext {
  tenantId: string;
}

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  /** 闸门二分：internal（直接执行）/ outbound（F009 服务端强制门控）。 */
  class: ToolClass;
  /** 工具来源：native（本批）/ mcp（扩展点，本批不实装）。 */
  source: ToolSource;
  /** 入参 zod schema（executeTool 与 AI SDK 均用它校验）。 */
  inputSchema: z.ZodType<TInput>;
  /** 唯一执行体。只应经 executeTool 调用，不得被其它路径直接触发（架构稿 §5.2）。 */
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export interface ToolResult<TOutput = unknown> {
  toolName: string;
  output: TOutput;
}
