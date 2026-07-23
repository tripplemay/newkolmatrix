// M3-A-REACH-CRM F003 — MockEmailSender（P5：SENT_MARKER 转正为 EmailSender 实现）
//
// SENT_MARKER 是刻意的测试地面真值（architecture :1393）：gate-smoke / D20 变异测试以
// 「含此标记的 OperationLog 行数」观测副作用是否发生——观测点零迁移（F003 acceptance）。
// CI 与本地默认走本实现（无 RESEND_API_KEY 即回落，index.ts 选择器），不外呼。

import { prisma } from 'lib/db/prisma';
import type {
  EmailSendContext,
  EmailSender,
  SendEmailInput,
  SendEmailResult,
} from './types';

/** mock 副作用的可观测标记（原 send-outreach.ts 同名常量转正迁入，语义不变）。 */
export const SENT_MARKER = 'send_outreach:SENT';

export class MockEmailSender implements EmailSender {
  async send(
    input: SendEmailInput,
    ctx: EmailSendContext,
  ): Promise<SendEmailResult> {
    // mock「发送」副作用：写一条 SENT 标记的 OperationLog 代表已对外发生。
    // 经闸门 execute 进入时 ctx.db = 执行事务——留痕与 executed+irrev 同一事务（F002）。
    await (ctx.db ?? prisma).operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.agentId ?? null,
        summary: `${SENT_MARKER} 已向 ${input.to} 发送邮件「${input.subject}」（mock 未外呼）`,
        ref: null,
      },
    });
    return { providerMessageId: null, mocked: true };
  }
}
