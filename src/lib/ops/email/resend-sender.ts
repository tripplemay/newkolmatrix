// M3-A-REACH-CRM F003 — ResendEmailSender（P4：port 旧项目 resend.ts 已验证模式）
//
// port 来源：tripplemay/kolmatrix `src/lib/email/resend.ts`（BM2-F006 + BIx P1-9 + BL-035 AI-H3）。
// 保留：30s abort 超时 + 一次冷重试（transient：rate_limit / 5xx / timeout / network）+
// 发信域 kolquest.com（verified，ap-northeast-1，U2 核证 2026-07-23）。
// 新增：Idempotency-Key（P6，幂等键 = PendingAction.id）——Resend 侧防重放双保险。
// 不 port：EmailLog / withTenant 多租户 RLS（本项目落库对象 = OutreachMessage/Signal）。

import { Resend } from 'resend';
import {
  SendEmailError,
  type EmailSendContext,
  type EmailSender,
  type SendEmailInput,
  type SendEmailResult,
} from './types';

/** 发信地址（旧项目 ADR-010 沿用；kolquest.com 域已 verified，与旧项目共享 Resend 账号）。 */
export const FROM_ADDRESS = 'marketer@kolquest.com';

const SEND_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        t = setTimeout(
          () => reject(new SendEmailError('timeout', 'resend 发送超时（30s）')),
          ms,
        );
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(
    input: SendEmailInput,
    _ctx: EmailSendContext,
  ): Promise<SendEmailResult> {
    if (!/^.+@.+\..+$/.test(input.to)) {
      throw new SendEmailError('invalid_to', `非法收件地址: ${input.to}`);
    }

    const doSend = () =>
      this.client.emails.send(
        {
          from: FROM_ADDRESS,
          to: input.to,
          subject: input.subject,
          text: input.bodyText,
          ...(input.bodyHtml ? { html: input.bodyHtml } : {}),
          ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        },
        // P6：幂等键 = PendingAction.id——执行事务失败重入 / crash 重放，Resend 侧不双发。
        { idempotencyKey: input.idempotencyKey },
      );

    // 一次冷重试（旧项目同款）：仅 transient 错误（rate_limit / 5xx / timeout / network）重试一次。
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { data, error } = await withTimeout(doSend(), SEND_TIMEOUT_MS);
        if (error) {
          const name = error.name ?? '';
          const retryable = /rate_limit|internal_server|timeout|network/i.test(
            name,
          );
          if (!retryable || attempt === 1) {
            throw new SendEmailError(
              name === 'rate_limit_exceeded' ? 'rate_limited' : 'provider_error',
              `resend 错误: ${name} ${error.message}`,
            );
          }
          continue;
        }
        return { providerMessageId: data?.id ?? null, mocked: false };
      } catch (err) {
        if (err instanceof SendEmailError) {
          if (err.code === 'timeout' && attempt === 0) continue; // 冷重试
          throw err;
        }
        if (attempt === 1) {
          throw new SendEmailError(
            'unknown',
            `resend 发送失败: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    throw new SendEmailError('unknown', 'resend 重试耗尽');
  }
}
