// M3-A-REACH-CRM F004 — /api/signals/inbound 集成测试（旧项目 handler 测试样例回放 + 本项目语义）
//
// 回放来源：旧项目 tripplemay/kolmatrix `webhooks/resend/__tests__/route.test.ts`
//（BL-035-F006）。结构同款两层：HTTP 层（真 svix 签名 → POST route）+ 应用层直调
//（ingestDeliverySignal，无 HTTP）。适配点：EmailLog → OutreachMessage/Signal；
// 旧「hard bounce 清 Kol.email」不在本批 spec（bounce 载荷全量入 Signal.payloadJson 留证）。
//
// 覆盖 acceptance：验签失败 401 / 限流 429+fail-closed 403 / 坏 payload 400 不落库 /
// externalId 防重 / 四类映射 + 重算 + 留痕 / P2 负例（投递状态不推进 CRM 态）。

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Webhook } from 'svix';
import { prisma } from '../../src/lib/db/prisma';
import { POST } from '../../src/app/api/signals/inbound/route';
import { ingestDeliverySignal } from '../../src/lib/signals/ingest';
import { normalizeResendEvent } from '../../src/lib/signals/normalize';

const FIXTURE_SLUG = `test-tenant-m3a-signals-${process.pid}`;
const SECRET = 'whsec_' + Buffer.alloc(32, 1).toString('base64');
const PROVIDER_MSG_ID = `re_m3a_test_${process.pid}`;
const ORIGINAL_SECRET = process.env.RESEND_WEBHOOK_SECRET;

let tenantId: string;
let projectId: string;
let kolId: string;
let threadId: string;

/** 真 svix 签名请求（旧项目 buildSignedRequest 同款；xff 过 P9 fail-closed 闸）。 */
function buildSignedRequest(
  secret: string,
  body: unknown,
  opts: { svixId?: string; ip?: string } = {},
): Request {
  const wh = new Webhook(secret);
  const messageId = opts.svixId ?? 'msg_' + Math.random().toString(36).slice(2);
  const payload = JSON.stringify(body);
  const sig = wh.sign(messageId, new Date(), payload);
  return new Request('https://example.test/api/signals/inbound', {
    method: 'POST',
    headers: {
      'svix-id': messageId,
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': sig,
      'content-type': 'application/json',
      'x-forwarded-for': opts.ip ?? '198.51.100.10',
    },
    body: payload,
  });
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3A signals 集成测试夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'signals 夹具项目' },
  });
  projectId = p.id;
  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3a-signals-kol-${process.pid}`,
      displayName: 'signals 夹具创作者',
      contactEmail: 'm3a-signals@test.invalid',
    },
  });
  kolId = k.id;
  const thread = await prisma.outreachThread.create({
    data: { tenantId, projectId, kolId, status: 'sent' },
  });
  threadId = thread.id;
  await prisma.outreachMessage.create({
    data: {
      tenantId,
      threadId,
      direction: 'sent',
      subject: '夹具已发消息',
      body: '正文',
      gateLogId: 'pa-fixture',
      providerMessageId: PROVIDER_MSG_ID,
      sentAt: new Date(),
    },
  });
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});

afterAll(async () => {
  if (ORIGINAL_SECRET === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = ORIGINAL_SECRET;
  await prisma.signal.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } }); // 级联 thread/message
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('HTTP 层（旧项目样例回放）', () => {
  it('验签失败 → 401 拒绝（fail-closed），不触库', async () => {
    const req = new Request('https://example.test/api/signals/inbound', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_x',
        'svix-timestamp': '0',
        'svix-signature': 'v1,bogus',
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.11',
      },
      body: JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 'x' },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('RESEND_WEBHOOK_SECRET 未配置 → 500（不得静默接受）', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await POST(
      buildSignedRequest(SECRET, {
        type: 'email.delivered',
        data: { email_id: 'x' },
      }),
    );
    expect(res.status).toBe(500);
  });

  it('验签通过但坏 payload（缺 type）→ 400 不落库', async () => {
    const before = await prisma.signal.count({ where: { tenantId } });
    const res = await POST(
      buildSignedRequest(
        SECRET,
        { data: { email_id: 'x' } },
        { ip: '198.51.100.12' },
      ),
    );
    expect(res.status).toBe(400);
    expect(await prisma.signal.count({ where: { tenantId } })).toBe(before);
  });

  it('unknown 事件类型 → 200 matched=0（响应形状不破，旧项目同语义）', async () => {
    const res = await POST(
      buildSignedRequest(
        SECRET,
        { type: 'email.future_event', data: { email_id: 'x' } },
        { ip: '198.51.100.13' },
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, matched: 0 });
  });

  it('providerMessageId 未匹配本项目消息 → matched=0 不落库（应用层直调：route 依赖 dev tenant，CI 库无 seed）', async () => {
    const before = await prisma.signal.count({ where: { tenantId } });
    const out = normalizeResendEvent(
      { type: 'email.opened', data: { email_id: 'someone-elses-message' } },
      'svix_unmatched_1',
    );
    if (!out.ok) throw new Error('normalize 应通过');
    const r = await ingestDeliverySignal(out.signal, { tenantId });
    expect(r).toMatchObject({ matched: 0, duplicate: false });
    expect(await prisma.signal.count({ where: { tenantId } })).toBe(before);
  });

  it('P9 fail-closed：无反代 IP 头 → 403 拒绝', async () => {
    const wh = new Webhook(SECRET);
    const payload = JSON.stringify({ type: 'email.delivered', data: {} });
    const req = new Request('https://example.test/api/signals/inbound', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_noip',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': wh.sign('msg_noip', new Date(), payload),
      },
      body: payload,
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('P9 限流：同 IP 第 21 次 → 429 + Retry-After', async () => {
    const ip = '203.0.113.77';
    let last: Response | null = null;
    for (let i = 0; i < 21; i++) {
      last = await POST(
        buildSignedRequest(
          SECRET,
          { type: 'email.future_event', data: {} },
          { ip },
        ),
      );
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('应用层直调（无 HTTP，落库 + 重算 + 留痕 + 防重）', () => {
  const normalized = (
    svixId: string,
    event = 'email.delivered',
    bounce?: { type: string; reason?: string },
  ) => {
    const out = normalizeResendEvent(
      {
        type: event,
        created_at: '2026-07-23T01:00:00.000Z',
        data: { email_id: PROVIDER_MSG_ID, ...(bounce ? { bounce } : {}) },
      },
      svixId,
    );
    if (!out.ok) throw new Error('normalize 应通过');
    return out.signal;
  };

  it('delivered → Signal 落库（关联 thread/kol/project）+ lastSignalAt + 留痕', async () => {
    const r = await ingestDeliverySignal(normalized('svix_apply_1'), {
      tenantId,
    });
    expect(r).toMatchObject({ matched: 1, duplicate: false, threadId });

    const sig = await prisma.signal.findUnique({
      where: { externalId: 'svix_apply_1' },
    });
    expect(sig).toMatchObject({
      type: 'email_delivery_status',
      source: 'resend',
      kolId,
      projectId,
      threadId,
    });
    const thread = await prisma.outreachThread.findUnique({
      where: { id: threadId },
    });
    expect(thread?.lastSignalAt?.toISOString()).toBe(
      '2026-07-23T01:00:00.000Z',
    );
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, kind: 'auto', summary: { contains: '信号接入' } },
    });
    expect(log?.payloadJson).toMatchObject({ threadId, event: 'delivered' });
  });

  it('P2 负例：投递状态信号不推进 CRM 态（thread 仍为 sent）', async () => {
    const thread = await prisma.outreachThread.findUnique({
      where: { id: threadId },
    });
    expect(thread?.status).toBe('sent');
  });

  it('externalId 防重：同 svix-id 重放只落一行（duplicate=true）', async () => {
    const before = await prisma.signal.count({ where: { tenantId } });
    const r = await ingestDeliverySignal(normalized('svix_apply_1'), {
      tenantId,
    });
    expect(r).toMatchObject({ matched: 1, duplicate: true });
    expect(await prisma.signal.count({ where: { tenantId } })).toBe(before);
  });

  it('hard bounce → bounce 载荷（type+reason）如实入 payloadJson（不清 contactEmail——本批 spec 外）', async () => {
    const r = await ingestDeliverySignal(
      normalized('svix_apply_2', 'email.bounced', {
        type: 'permanent',
        reason: 'DMARC policy reject',
      }),
      { tenantId },
    );
    expect(r.matched).toBe(1);
    const sig = await prisma.signal.findUnique({
      where: { externalId: 'svix_apply_2' },
    });
    expect(sig?.payloadJson).toMatchObject({
      event: 'bounced',
      bounce: { type: 'permanent', reason: 'DMARC policy reject' },
    });
    // 旧项目「清 Kol.email」行为不 port：contactEmail 保持不动
    const kol = await prisma.kol.findUnique({ where: { id: kolId } });
    expect(kol?.contactEmail).toBe('m3a-signals@test.invalid');
  });

  it('soft bounce（transient）同样只落 Signal 不动 KOL（旧样例语义保留）', async () => {
    const r = await ingestDeliverySignal(
      normalized('svix_apply_3', 'email.bounced', {
        type: 'transient',
        reason: 'mailbox temporarily full',
      }),
      { tenantId },
    );
    expect(r.matched).toBe(1);
    const kol = await prisma.kol.findUnique({ where: { id: kolId } });
    expect(kol?.contactEmail).toBe('m3a-signals@test.invalid');
  });
});
