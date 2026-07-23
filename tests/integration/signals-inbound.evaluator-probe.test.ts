// Evaluator 独立探针（M3-A-REACH-CRM F004 验收，非 Generator 产物）。
//
// 目的：用 Generator 套件之外的输入空间，独立复核 F004 acceptance 的硬判据：
//   (1) 验签 fail-closed 的完整拒绝面——错 secret 签名 / 过期时间戳重放 / 缺 svix 头，
//       Generator 套件只喂了「格式伪造签名」一种
//   (2) 401 拒绝路径零落库（不只是 400 路径）
//   (3) P9 限流 per-IP 隔离——A IP 打满 20 后 B IP 不受牵连（限流键确为 IP 而非全局）
//   (4) externalId 防重在【并发】重放下仍只落一行（Generator 只测了串行重放）
//   (5) opened / complained 两类事件端到端落库映射（Generator 集成层只落了 delivered/bounced）
//
// 断言一律验行为；夹具租户按 pid 隔离，与其余集成测试互不干扰。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Webhook } from 'svix';
import { prisma } from '../../src/lib/db/prisma';
import { POST } from '../../src/app/api/signals/inbound/route';
import { ingestDeliverySignal } from '../../src/lib/signals/ingest';
import { normalizeResendEvent } from '../../src/lib/signals/normalize';

const FIXTURE_SLUG = `test-tenant-m3a-signals-probe-${process.pid}`;
const SECRET = 'whsec_' + Buffer.alloc(32, 7).toString('base64');
const WRONG_SECRET = 'whsec_' + Buffer.alloc(32, 9).toString('base64');
const PROVIDER_MSG_ID = `re_m3a_probe_${process.pid}`;
const ORIGINAL_SECRET = process.env.RESEND_WEBHOOK_SECRET;

let tenantId: string;
let threadId: string;

function signedRequest(
  secret: string,
  body: unknown,
  opts: { ip?: string; signAt?: Date; svixId?: string } = {},
): Request {
  const wh = new Webhook(secret);
  const messageId =
    opts.svixId ?? 'msg_probe_' + Math.random().toString(36).slice(2);
  const payload = JSON.stringify(body);
  const signAt = opts.signAt ?? new Date();
  const sig = wh.sign(messageId, signAt, payload);
  return new Request('https://example.test/api/signals/inbound', {
    method: 'POST',
    headers: {
      'svix-id': messageId,
      'svix-timestamp': String(Math.floor(signAt.getTime() / 1000)),
      'svix-signature': sig,
      'content-type': 'application/json',
      'x-forwarded-for': opts.ip ?? '192.0.2.10',
    },
    body: payload,
  });
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3A signals evaluator 探针夹具' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'signals 探针项目' },
  });
  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3a-signals-probe-kol-${process.pid}`,
      displayName: 'signals 探针创作者',
    },
  });
  const thread = await prisma.outreachThread.create({
    data: { tenantId, projectId: p.id, kolId: k.id, status: 'sent' },
  });
  threadId = thread.id;
  await prisma.outreachMessage.create({
    data: {
      tenantId,
      threadId,
      direction: 'sent',
      body: '探针夹具已发消息',
      gateLogId: 'pa-probe-fixture',
      providerMessageId: PROVIDER_MSG_ID,
      sentAt: new Date(),
    },
  });
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});

afterAll(async () => {
  if (ORIGINAL_SECRET === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = ORIGINAL_SECRET;
  await prisma.signal.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('探针 (1)(2)：验签 fail-closed 完整拒绝面 + 拒绝路径零落库', () => {
  it('错 secret 的合法格式签名 → 401，零落库', async () => {
    const before = await prisma.signal.count({ where: { tenantId } });
    const res = await POST(
      signedRequest(
        WRONG_SECRET,
        { type: 'email.delivered', data: { email_id: PROVIDER_MSG_ID } },
        { ip: '192.0.2.21' },
      ),
    );
    expect(res.status).toBe(401);
    expect(await prisma.signal.count({ where: { tenantId } })).toBe(before);
  });

  it('过期时间戳重放（10 分钟前正确 secret 签名）→ 401（svix 时间容差生效）', async () => {
    const res = await POST(
      signedRequest(
        SECRET,
        { type: 'email.delivered', data: { email_id: PROVIDER_MSG_ID } },
        { ip: '192.0.2.22', signAt: new Date(Date.now() - 10 * 60 * 1000) },
      ),
    );
    expect(res.status).toBe(401);
  });

  it('缺 svix-signature 头 → 401', async () => {
    const payload = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: PROVIDER_MSG_ID },
    });
    const res = await POST(
      new Request('https://example.test/api/signals/inbound', {
        method: 'POST',
        headers: {
          'svix-id': 'msg_probe_nohdr',
          'svix-timestamp': String(Math.floor(Date.now() / 1000)),
          'x-forwarded-for': '192.0.2.23',
        },
        body: payload,
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('探针 (3)：P9 限流 per-IP 隔离', () => {
  it('A IP 打满 20 → 第 21 次 429；随后 B IP 首请求仍被受理（非全局限流）', async () => {
    const ipA = '192.0.2.31';
    let last: Response | null = null;
    for (let i = 0; i < 21; i++) {
      last = await POST(
        signedRequest(
          SECRET,
          { type: 'email.future_event', data: {} },
          { ip: ipA },
        ),
      );
    }
    expect(last?.status).toBe(429);

    const resB = await POST(
      signedRequest(
        SECRET,
        { type: 'email.future_event', data: {} },
        { ip: '192.0.2.32' },
      ),
    );
    expect(resB.status).toBe(200);
  });
});

describe('探针 (4)：externalId 防重在并发重放下仍只落一行', () => {
  it('同 svix-id 5 路并发 ingest → 恰 1 行落库，其余 duplicate=true，无抛错', async () => {
    const svixId = `svix_probe_concurrent_${process.pid}`;
    const out = normalizeResendEvent(
      {
        type: 'email.delivered',
        created_at: '2026-07-23T02:00:00.000Z',
        data: { email_id: PROVIDER_MSG_ID },
      },
      svixId,
    );
    if (!out.ok) throw new Error('normalize 应通过');

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        ingestDeliverySignal(out.signal, { tenantId }),
      ),
    );
    const rows = await prisma.signal.count({
      where: { tenantId, externalId: svixId },
    });
    expect(rows).toBe(1);
    const fresh = results.filter((r) => !r.duplicate);
    const dups = results.filter((r) => r.duplicate);
    expect(fresh).toHaveLength(1);
    expect(dups).toHaveLength(4);
    for (const r of results) expect(r.matched).toBe(1);
  });
});

describe('探针 (5)：opened / complained 落库映射（应用层直调——route 层租户解析走 dev tenant，夹具租户不可达，与 Generator 集成测同一下沉理由）', () => {
  it.each([
    ['email.opened', 'opened'],
    ['email.complained', 'complained'],
  ])('%s → Signal.payloadJson.event=%s + matched=1', async (type, expected) => {
    const svixId = `svix_probe_${expected}_${process.pid}`;
    const out = normalizeResendEvent(
      { type, data: { email_id: PROVIDER_MSG_ID } },
      svixId,
    );
    if (!out.ok) throw new Error('normalize 应通过');
    const r = await ingestDeliverySignal(out.signal, { tenantId });
    expect(r).toMatchObject({ matched: 1, duplicate: false, threadId });
    const sig = await prisma.signal.findUnique({
      where: { externalId: svixId },
    });
    expect(sig).not.toBeNull();
    expect(sig?.payloadJson).toMatchObject({ event: expected });
    expect(sig?.threadId).toBe(threadId);
  });
});
