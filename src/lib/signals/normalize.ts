// M3-A-REACH-CRM F004 — Resend webhook 事件 normalize（signals 接入层，architecture §5.5）
//
// P4：事件形状 port 自旧项目 webhooks/resend/handler.ts（BL-035-F006 已验证）。
// 覆盖四类投递状态事件（spec F004）：delivered / bounced / complained / opened
// → Signal(type='email_delivery_status')。其余类型（clicked / 未来新增）诚实忽略不落库。
// P2：投递状态 ≠ 回复——crmInfer 对 email_delivery_status 不推进 CRM 状态（有负例测试）；
// 真入站收信 → M3-B+。

import { z } from 'zod';

/** Resend webhook 事件 zod schema（验签只证真伪，形状仍须校验——坏 payload 400 不落库）。 */
export const resendWebhookEventSchema = z.object({
  type: z.string().min(1),
  created_at: z.string().optional(),
  data: z
    .object({
      email_id: z.string().optional(),
      bounce: z
        .object({ type: z.string(), reason: z.string().optional() })
        .passthrough()
        .optional(),
    })
    .passthrough(),
});

export type ResendWebhookEvent = z.infer<typeof resendWebhookEventSchema>;

/** Signal.type 常量（crmInfer 同口径：email_delivery_status 不推进状态）。 */
export const EMAIL_DELIVERY_SIGNAL_TYPE = 'email_delivery_status';

/** 四类投递状态事件 → 语义状态映射（旧项目 STATUS_BY_EVENT_TYPE 同款，clicked 本批不收）。 */
const STATUS_BY_EVENT_TYPE: Record<string, string | undefined> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.opened': 'opened',
};

export interface NormalizedDeliverySignal {
  type: typeof EMAIL_DELIVERY_SIGNAL_TYPE;
  source: 'resend';
  /** 防重键（Signal.externalId @unique）= svix-id：同一事件重投（Resend 重试）id 不变。 */
  externalId: string;
  /** Resend 消息 id → 关联 OutreachMessage.providerMessageId。 */
  providerMessageId: string;
  detectedAt: Date;
  payload: {
    event: string;
    providerMessageId: string;
    bounce?: { type: string; reason?: string };
  };
}

export type NormalizeOutcome =
  | { ok: true; signal: NormalizedDeliverySignal }
  | { ok: false; reason: 'ignored_event_type' | 'missing_email_id' };

/**
 * 事件 → 标准化 Signal 载荷。非四类事件 / 缺 email_id → 诚实忽略（调用方 200 matched=0，
 * 不落库不报错——旧项目「unknown type 不破坏响应形状」语义保留）。
 */
export function normalizeResendEvent(
  event: ResendWebhookEvent,
  svixMessageId: string,
): NormalizeOutcome {
  const status = STATUS_BY_EVENT_TYPE[event.type];
  if (!status) return { ok: false, reason: 'ignored_event_type' };
  const providerMessageId = event.data.email_id ?? '';
  if (!providerMessageId) return { ok: false, reason: 'missing_email_id' };

  const detectedAt = event.created_at ? new Date(event.created_at) : new Date();
  return {
    ok: true,
    signal: {
      type: EMAIL_DELIVERY_SIGNAL_TYPE,
      source: 'resend',
      externalId: svixMessageId,
      providerMessageId,
      detectedAt: Number.isNaN(detectedAt.getTime()) ? new Date() : detectedAt,
      payload: {
        event: status,
        providerMessageId,
        ...(event.data.bounce
          ? {
              bounce: {
                type: event.data.bounce.type,
                ...(event.data.bounce.reason
                  ? { reason: event.data.bounce.reason }
                  : {}),
              },
            }
          : {}),
      },
    },
  };
}
