// M3-A-REACH-CRM F003 — EmailSender 发信信道抽象（ops 层，architecture §10.4）
//
// P4：接口与错误形状 port 自旧项目 tripplemay/kolmatrix `src/lib/email/resend.ts`
//（BM2-F006 / BIx P1-9 已验证实现）；落库对象改为本项目 OutreachMessage/Signal，
// 旧 EmailLog/withTenant 多租户 RLS 不 port。
//
// 两实现：ResendEmailSender（真投递）/ MockEmailSender（SENT_MARKER 测试地面真值，P5）。
// 选择器 getEmailSender()（index.ts）：无 key dev 回落 mock，prod 无 key fail-fast 拒发。

import type { Prisma } from '@prisma/client';

export interface SendEmailInput {
  to: string;
  subject: string;
  /** 纯文本正文；Resend 仅给 text 时自动渲染 html。 */
  bodyText: string;
  /** 可选 HTML 正文（覆盖 text → html 自动渲染）。 */
  bodyHtml?: string;
  replyTo?: string;
  /**
   * 幂等键（P6）= PendingAction.id：执行事务失败重入 / crash 重放不双发
   *（Resend 侧 Idempotency-Key + 应用层 gateLogId 查重双保险）。
   */
  idempotencyKey: string;
}

/** 发信执行上下文（MockEmailSender 落 SENT_MARKER 留痕需要；ToolContext 结构性满足）。 */
export interface EmailSendContext {
  tenantId: string;
  /** 执行事务客户端（F002 ctx.db）；mock 留痕随事务提交/回滚。 */
  db?: Prisma.TransactionClient;
  agentId?: string;
}

export interface SendEmailResult {
  providerMessageId: string | null;
  /** true = MockEmailSender（未真实外呼）。 */
  mocked: boolean;
}

export class SendEmailError extends Error {
  constructor(
    public readonly code:
      | 'invalid_to'
      | 'timeout'
      | 'rate_limited'
      | 'provider_error'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'SendEmailError';
  }
}

export interface EmailSender {
  send(input: SendEmailInput, ctx: EmailSendContext): Promise<SendEmailResult>;
}
