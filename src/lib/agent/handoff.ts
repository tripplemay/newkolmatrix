// AGENT-FOUNDATION F006 — handoff 协议（架构稿 §5.4 信封格式）
//
// 创建 / 传递 / 接收 handoff：以信封格式落 F002 Handoff 表。
// 核心语义（§5.4）：handoff 只携带 artifact 引用 + 可审计摘要；接收方按自身 scope **重新读取**数据，
// 不信任发送方携带的金额 / 状态 / 权限结论。
//
// 【框架焊死】信封格式（HandoffEnvelope 字段）、createHandoff/receiveHandoff 机制稳定。
// 【EXTENSION POINT】messages 具体载荷结构、artifactType 扩充、receiveHandoff 里「按 scope 重读」的
//   真实读取逻辑（需各专家领域工具，M1-M4）——本批 receiveHandoff 返回重读指令 + 审计信封，不代读。

import { prisma } from 'lib/db/prisma';
import type { Prisma } from '@prisma/client';
import type { AgentId } from './registry';
import type { ToolContext } from './tools/types';

/** 交接物类型（架构稿 §5.4）。EXTENSION POINT：随领域实体扩充。 */
export type ArtifactType = 'brief' | 'match_plan' | 'outreach_thread' | 'deal' | 'report';

export interface HandoffMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
}

/** handoff 信封（§5.4）。 */
export interface HandoffEnvelope {
  projectId: string | null;
  fromAgent: AgentId;
  toAgent: AgentId;
  artifactType: ArtifactType;
  /** artifact 引用（接收方据此按自身 scope 重读，不信任下面的 summary 结论）。 */
  artifactRef: string;
  /** 可审计摘要（仅供人看 / 审计；非权威数据源）。 */
  summary: string;
  messages: HandoffMessage[];
}

/** 创建 handoff：落 F002 Handoff 表，返回持久化后的记录 id。 */
export async function createHandoff(
  ctx: ToolContext,
  envelope: HandoffEnvelope,
): Promise<{ id: string; createdAt: Date }> {
  const row = await prisma.handoff.create({
    data: {
      tenantId: ctx.tenantId,
      projectId: envelope.projectId,
      fromAgent: envelope.fromAgent,
      toAgent: envelope.toAgent,
      artifactType: envelope.artifactType,
      artifactRef: envelope.artifactRef,
      summary: envelope.summary,
      messagesJson: envelope.messages as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, createdAt: true },
  });
  return row;
}

export interface ReceivedHandoff {
  envelope: HandoffEnvelope & { id: string; createdAt: Date };
  /**
   * 重读指令：接收方**必须**用自己的工具按 artifactRef 重新读取真实数据，
   * 不得采信 envelope.summary 里的金额 / 状态 / 权限结论（§5.4 核心语义）。
   * EXTENSION POINT：真实重读由接收方领域工具执行（M1-M4）。
   */
  mustRereadBy: AgentId;
  rereadRef: string;
}

/**
 * 接收 handoff：按 id 读取信封，返回给接收方 + 重读指令。
 * 校验 toAgent 与声明的接收者一致（防串扰）。
 */
export async function receiveHandoff(
  ctx: ToolContext,
  handoffId: string,
  receivingAgent: AgentId,
): Promise<ReceivedHandoff> {
  const row = await prisma.handoff.findFirst({
    where: { id: handoffId, tenantId: ctx.tenantId },
  });
  if (!row) throw new Error(`[handoff] 未找到 handoff: ${handoffId}`);
  if (row.toAgent !== receivingAgent) {
    throw new Error(
      `[handoff] 接收者不匹配：handoff.toAgent=${row.toAgent} 但 ${receivingAgent} 尝试接收`,
    );
  }
  return {
    envelope: {
      id: row.id,
      createdAt: row.createdAt,
      projectId: row.projectId,
      fromAgent: row.fromAgent as AgentId,
      toAgent: row.toAgent as AgentId,
      artifactType: row.artifactType as ArtifactType,
      artifactRef: row.artifactRef ?? '',
      summary: row.summary ?? '',
      messages: (row.messagesJson as unknown as HandoffMessage[]) ?? [],
    },
    mustRereadBy: receivingAgent,
    rereadRef: row.artifactRef ?? '',
  };
}
