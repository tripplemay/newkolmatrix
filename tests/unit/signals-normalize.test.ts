// M3-A-REACH-CRM F004 — normalize 管道单测（四类事件映射 + 忽略语义 + zod 形状）

import { describe, expect, it } from 'vitest';
import {
  EMAIL_DELIVERY_SIGNAL_TYPE,
  normalizeResendEvent,
  resendWebhookEventSchema,
} from '../../src/lib/signals/normalize';

const SVIX_ID = 'msg_svix_abc123';

describe('四类投递状态事件映射', () => {
  it.each([
    ['email.delivered', 'delivered'],
    ['email.bounced', 'bounced'],
    ['email.complained', 'complained'],
    ['email.opened', 'opened'],
  ])('%s → payload.event=%s', (type, expected) => {
    const out = normalizeResendEvent(
      { type, data: { email_id: 're_1' } },
      SVIX_ID,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error('unreachable');
    expect(out.signal.type).toBe(EMAIL_DELIVERY_SIGNAL_TYPE);
    expect(out.signal.source).toBe('resend');
    expect(out.signal.externalId).toBe(SVIX_ID); // 防重键 = svix-id
    expect(out.signal.providerMessageId).toBe('re_1');
    expect(out.signal.payload.event).toBe(expected);
  });

  it('bounce 载荷如实入 payload（type + reason）', () => {
    const out = normalizeResendEvent(
      {
        type: 'email.bounced',
        data: {
          email_id: 're_2',
          bounce: { type: 'permanent', reason: 'DMARC policy reject' },
        },
      },
      SVIX_ID,
    );
    if (!out.ok) throw new Error('预期 ok');
    expect(out.signal.payload.bounce).toEqual({
      type: 'permanent',
      reason: 'DMARC policy reject',
    });
  });

  it('created_at 合法 → detectedAt 取事件时刻；非法 → 回落当前时间不炸', () => {
    const ok = normalizeResendEvent(
      {
        type: 'email.delivered',
        created_at: '2026-07-23T00:00:00.000Z',
        data: { email_id: 're_3' },
      },
      SVIX_ID,
    );
    if (!ok.ok) throw new Error('预期 ok');
    expect(ok.signal.detectedAt.toISOString()).toBe('2026-07-23T00:00:00.000Z');

    const bad = normalizeResendEvent(
      {
        type: 'email.delivered',
        created_at: 'not-a-date',
        data: { email_id: 're_3' },
      },
      SVIX_ID,
    );
    if (!bad.ok) throw new Error('预期 ok');
    expect(Number.isNaN(bad.signal.detectedAt.getTime())).toBe(false);
  });
});

describe('忽略语义（诚实不落库）', () => {
  it('非四类事件（clicked / 未来类型）→ ignored_event_type', () => {
    for (const type of ['email.clicked', 'email.sent', 'email.future_event']) {
      const out = normalizeResendEvent({ type, data: { email_id: 'x' } }, SVIX_ID);
      expect(out).toEqual({ ok: false, reason: 'ignored_event_type' });
    }
  });

  it('缺 email_id → missing_email_id', () => {
    const out = normalizeResendEvent(
      { type: 'email.delivered', data: {} },
      SVIX_ID,
    );
    expect(out).toEqual({ ok: false, reason: 'missing_email_id' });
  });
});

describe('zod 形状校验（坏 payload 400 的判据）', () => {
  it('合法事件形状通过（data 宽容 passthrough）', () => {
    expect(
      resendWebhookEventSchema.safeParse({
        type: 'email.delivered',
        created_at: '2026-07-23T00:00:00Z',
        data: { email_id: 're_1', extra_field: true },
      }).success,
    ).toBe(true);
  });

  it('缺 type / data 非对象 → 拒绝', () => {
    expect(resendWebhookEventSchema.safeParse({ data: {} }).success).toBe(false);
    expect(
      resendWebhookEventSchema.safeParse({ type: 'email.delivered', data: 3 })
        .success,
    ).toBe(false);
    expect(resendWebhookEventSchema.safeParse('nonsense').success).toBe(false);
  });
});
