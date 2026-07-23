// AGENT-FOUNDATION F005 — 工具层类型（柱一）
//
// 工具二分（§3.1 D27/D28 闸门技术基础）：
//   class: internal（AI 直接执行，无确认框）| outbound（服务端强制停在确认前，F009 落地）
// 工具来源抽象（§3.2 D-ORCH）：
//   source: native（本批实装）| mcp（已规划扩展点：注册表结构支持 MCP 桥接，本批不实装 MCP client）

import type { z } from 'zod';
import type { Prisma } from '@prisma/client';
import type { AgentId } from '../registry';
import type { Harm } from '../gate/harm';

export type ToolClass = 'internal' | 'outbound';
export type ToolSource = 'native' | 'mcp';

/**
 * 工具执行上下文——传输无关（D-INTEROP）。
 * 由调用方（HTTP route / 未来 MCP server / agent API 适配层）构造后传给 executeTool，
 * 工具本身不假设调用方是内部 useChat//api/agent。
 * EXTENSION POINT：actor / requestId 随后续充实。
 */
export interface ToolContext {
  tenantId: string;
  /** 当前人格身份（F006 persona router 注入；架构稿 §5.2 ToolContext.agentId）。 */
  agentId: AgentId;
  /** 当前项目（单角色单租户下可空；架构稿 §4.3）。 */
  projectId?: string | null;
  /** 运行环境（架构稿 §4.3）。 */
  env?: 'default' | 'sandbox' | 'production';
  /**
   * 服务端签发的确认令牌（F009 → M3-A F002 两步票据）。**只由 gate.executePendingAction
   * 在消费执行票后于服务端进程内注入**（不出进程，ADR-25）——模型自主 loop 的 ctx 永远
   * 没有此字段，故 outbound 只能停在 pending，无法自我放行。
   */
  confirmationToken?: string;
  /**
   * 执行事务客户端（M3-A F002，§9.3.2 事务语义）：execute 消费票后，工具的业务态变更
   * 与 executed + irrev 留痕在**同一事务**提交。工具内 DB 写入应使用 `ctx.db ?? prisma`。
   */
  db?: Prisma.TransactionClient;
  /**
   * 闸门动作 id（= PendingAction.id，M3-A F002）。外部副作用（真实发信等，无法进 DB 事务）
   * 以此为幂等键（P6 / §9.8）：crash 后重放不重复发信——日志至少一次、副作用恰好一次。
   */
  gateActionId?: string;
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
  /**
   * outbound 工具必须提供：由入参构造 harm 利害结构（F009 闸门如实披露）。
   * internal 工具无需（不过闸门）。
   */
  buildHarm?: (input: TInput, ctx: ToolContext) => Harm;
  /** 唯一执行体。只应经 executeTool 调用，不得被其它路径直接触发（架构稿 §5.2）。 */
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export interface ToolResult<TOutput = unknown> {
  toolName: string;
  output: TOutput;
}
