// AGENT-FOUNDATION F005 — 工具层类型（柱一）
//
// 工具二分（§3.1 D27/D28 闸门技术基础）：
//   class: internal（AI 直接执行，无确认框）| outbound（服务端强制停在确认前，F009 落地）
// 工具来源抽象（§3.2 D-ORCH）：
//   source: native（本批实装）| mcp（已规划扩展点：注册表结构支持 MCP 桥接，本批不实装 MCP client）

import type { z } from 'zod';
import type { LanguageModel } from 'ai';
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
  /**
   * 操作者标识（M5-AUTH-RLS F004 / spec D-3）：会话面 = 登录邮箱，无会话面 = system:<slug>。
   * **只用于留痕**（OperationLog.actor），不参与任何权限判定——认证 ≠ 授权（D26 延续无 RBAC）。
   */
  actor?: string;
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
  /**
   * 注入缝：本次会话使用的语言模型（M4.7 F001，D-6 裁决 A）。
   *
   * 由 `runAgentLoop` 下传，供 `consult_specialist` 起子 loop 时复用同一个 model。
   * **传入即无条件使用**——不得因凭据缺失改道回默认 caller（M4 教训：那会让
   * 无凭据环境下的 mock 注入被静默改道，测的不是被测对象）。
   *
   * 为什么不让子 loop 直接 `chatModel()`：那样 L1 无法注入 mock，子 loop 只能
   * 真外呼才测得到，等于放弃离线覆盖（spec D-6 的 B 方案，已否决）。
   */
  model?: LanguageModel;
  /**
   * 子 loop 嵌套深度（M4.7 F001）。前台为 0/空，专家子 loop 内为 1。
   * `runSpecialistLoop` 据此拒绝二次嵌套——专家不能再咨询专家。
   */
  consultDepth?: number;
  /**
   * 本轮咨询次数预算（M4.7 F006）。由 `runAgentLoop` 每轮新建一个挂上来，
   * `consult_specialist` 每次成功进入即 +1，用尽后如实拒绝。
   *
   * 【为什么是可变对象而不是数字】ToolSet 在装配时构造一次并捕获 ctx；
   * 传数字等于每次都拿到初始值，计数永远不增（同 F004 的 currentAgentId 教训）。
   */
  consultBudget?: { used: number; max: number };
  /**
   * 注入缝（M4.7 fix_round1 / F007）：覆盖专家子 loop 的墙钟闸。
   * 缺省读 registry 的 `SPECIALIST_TIMEOUT_MS`。测真超时时给一个极短值，
   * 不必让 CI 真等 60 秒——**传入即无条件使用**，同 model 注入缝纪律。
   */
  consultTimeoutMs?: number;
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
   * outbound 工具必须提供：构造 harm 利害结构（F009 闸门如实披露）。
   * M3-A F003 起支持 async——**从 DB 读真实名单/金额，不信任模型转述**（§9.5）；
   * 无法如实披露时（如收件人未录联系方式）应抛出明示错误 → 动作在落 PendingAction
   * **之前**被拒（P3 明示拒绝不猜）。internal 工具无需（不过闸门）。
   */
  buildHarm?: (input: TInput, ctx: ToolContext) => Harm | Promise<Harm>;
  /** 唯一执行体。只应经 executeTool 调用，不得被其它路径直接触发（架构稿 §5.2）。 */
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>;
}

export interface ToolResult<TOutput = unknown> {
  toolName: string;
  output: TOutput;
}
