// AGENT-FOUNDATION F009 — send_outreach 工具（outbound/native，闸门演示）
//
// 批量发邀约：class:outbound（对外·不可撤销）→ 服务端强制停在确认前。
// buildHarm 如实列全部收件人（不折叠）；execute 是 mock 副作用（真实发信 → M3），
// 以「写一条 OperationLog kind:auto（SENT 标记）」代表已发送，供闸门/变异测试观测副作用是否发生。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import type { ToolContext, ToolDefinition } from './types';
import { HARM_LABEL, type Harm } from '../gate/harm';

const inputSchema = z.object({
  recipients: z.array(z.string().min(1)).min(1).describe('收件人全名单（如 KOL handle/邮箱）'),
  message: z.string().min(1).describe('邀约正文'),
  projectId: z.string().optional(),
});

type SendOutreachInput = z.infer<typeof inputSchema>;

/** mock 副作用的可观测标记（变异测试据此判断「副作用是否被执行」）。 */
export const SENT_MARKER = 'send_outreach:SENT';

function buildHarm(input: SendOutreachInput, _ctx: ToolContext): Harm {
  return {
    action: 'send_outreach',
    summary: `批量发送邀约给 ${input.recipients.length} 位创作者`,
    targets: input.recipients, // 全名单，不折叠
    quantity: input.recipients.length,
    irreversible: true,
    evidence: `邀约正文：${input.message.slice(0, 60)}${input.message.length > 60 ? '…' : ''}`,
    expiresAt: new Date().toISOString(), // gate 会以其 TTL 覆盖为准
    label: HARM_LABEL,
  };
}

async function run(
  input: SendOutreachInput,
  ctx: ToolContext,
): Promise<{ sent: true; count: number; recipients: string[] }> {
  // mock「发送」副作用：真实发信 → M3。此处写一条 SENT 标记的 OperationLog 代表已对外发生。
  await prisma.operationLog.create({
    data: {
      tenantId: ctx.tenantId,
      kind: 'auto',
      actor: ctx.agentId,
      summary: `${SENT_MARKER} 已向 ${input.recipients.length} 位收件人发送邀约`,
      ref: input.projectId ?? null,
    },
  });
  return { sent: true, count: input.recipients.length, recipients: input.recipients };
}

export const sendOutreachTool: ToolDefinition<
  SendOutreachInput,
  { sent: true; count: number; recipients: string[] }
> = {
  name: 'send_outreach',
  description:
    '批量向创作者发送邀约（对外·不可撤销）。这是 outbound 动作——服务端会强制停在你确认前，不会由 AI 直接发出。',
  class: 'outbound',
  source: 'native',
  inputSchema,
  buildHarm,
  execute: run,
};
