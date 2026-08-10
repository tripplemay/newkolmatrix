// M5.2-TENANT-COVERAGE F004 acceptance ② — signals/inbound 这条**无会话面 webhook** 的
// 租户来源与「解析不出 tenantId」时的 fail-closed 行为。
//
// 【为什么这条要单独钉】其余 9 条入口的租户来自登录会话，middleware 已经保证「没会话进不来」。
// 这一条是自鉴权 webhook（svix 签名）、没有浏览器会话，租户只能显式解析。于是它多出一条
// 别的入口没有的失败模式：**解析不出租户时，把信号写进某个碰巧存在的租户**——那种写入
// 不报错、不留痕、事后无从发现，正是 spec D-3 对「回落」的判定所要杜绝的。
//
// 【判据的强度取在哪】不是断言「返回了 500」（那对「先写进别人名下再报错」同样成立），
// 而是断言**全库范围内**这条 externalId 一行都没有。Signal.externalId 是 @unique 的防重键，
// 按它全表查即可越过租户维度 —— 这正是「不得回落到任意租户」该有的量法。

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Webhook } from 'svix';

/**
 * 租户解析注入缝。两个用途：
 *  1. `unresolvable=true` 模拟「slug 解析不出租户」——与 tenantIdBySlug 查不到时同形：**抛**，
 *     不返回任何回落值；
 *  2. 正常时返回**本文件自建的夹具租户**，而不是真的 dev 租户——signals 的落库前提是
 *     providerMessageId 能关联到一条 OutreachMessage（matched=0 不落库，ingest.ts:8），
 *     那需要 thread/message 夹具；建在自己的租户里，不往 dev 租户塞测试行。
 */
const tenantSeam = vi.hoisted(() => ({ unresolvable: false, tenantId: '' }));
vi.mock('lib/agent/context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/agent/context')>();
  return {
    ...actual,
    systemTenantId: async (slug: string) => {
      if (tenantSeam.unresolvable) {
        throw new Error(`[agent] 未找到 tenant（slug=${slug}）`);
      }
      return tenantSeam.tenantId;
    },
  };
});

import { POST } from '../../src/app/api/signals/inbound/route';
import { privilegedDb } from '../../src/lib/db/privileged';

const SECRET = 'whsec_' + Buffer.alloc(32, 2).toString('base64');
const ORIGINAL_SECRET = process.env.RESEND_WEBHOOK_SECRET;
const ORIGINAL_SWITCH = process.env.DB_APP_ROLE_RUNTIME;
const TAG = `m52f004-${process.pid}`;
const PROVIDER_MSG_ID = `re_${TAG}`;

let tenantId = '';
const svixIds: string[] = [];

function signedRequest(body: unknown, svixId: string): Request {
  const payload = JSON.stringify(body);
  const sig = new Webhook(SECRET).sign(svixId, new Date(), payload);
  return new Request('https://example.test/api/signals/inbound', {
    method: 'POST',
    headers: {
      'svix-id': svixId,
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': sig,
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.77',
    },
    body: payload,
  });
}

function deliveredEvent() {
  return {
    type: 'email.delivered',
    created_at: new Date().toISOString(),
    data: { email_id: PROVIDER_MSG_ID, to: ['m52f004@test.invalid'] },
  };
}

/** 全库范围（跨租户）按防重键查这条事件落了几行。 */
async function rowsAnywhere(svixId: string): Promise<number> {
  return privilegedDb.signal.count({ where: { externalId: svixId } });
}

beforeAll(async () => {
  delete process.env.DB_APP_ROLE_RUNTIME; // 本文件断言的是租户来源与 fail-closed，与 RLS 无关
  process.env.RESEND_WEBHOOK_SECRET = SECRET;

  const tenant = await privilegedDb.tenant.create({
    data: { slug: `${TAG}-tenant`, name: `${TAG}-tenant` },
    select: { id: true },
  });
  tenantId = tenant.id;
  tenantSeam.tenantId = tenantId;

  const project = await privilegedDb.project.create({
    data: { tenantId, name: `${TAG}-project` },
    select: { id: true },
  });
  const kol = await privilegedDb.kol.create({
    data: {
      tenantId,
      canonicalHandle: `${TAG}-kol`,
      displayName: `${TAG}-kol`,
      contactEmail: 'm52f004@test.invalid',
    },
    select: { id: true },
  });
  const thread = await privilegedDb.outreachThread.create({
    data: { tenantId, projectId: project.id, kolId: kol.id, status: 'sent' },
    select: { id: true },
  });
  // 关联锚点：ingest 靠 providerMessageId 找到这条消息，找不到就 matched=0 不落库
  await privilegedDb.outreachMessage.create({
    data: {
      tenantId,
      threadId: thread.id,
      direction: 'sent',
      subject: '夹具已发消息',
      body: '正文',
      gateLogId: `${TAG}-pa`,
      providerMessageId: PROVIDER_MSG_ID,
      sentAt: new Date(),
    },
  });
});

afterEach(() => {
  tenantSeam.unresolvable = false;
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
});

afterAll(async () => {
  for (const step of [
    () => privilegedDb.signal.deleteMany({ where: { externalId: { in: svixIds } } }),
    () => privilegedDb.signal.deleteMany({ where: { tenantId } }),
    () => privilegedDb.operationLog.deleteMany({ where: { tenantId } }),
    () => privilegedDb.outreachMessage.deleteMany({ where: { tenantId } }),
    () => privilegedDb.outreachThread.deleteMany({ where: { tenantId } }),
    () => privilegedDb.project.deleteMany({ where: { tenantId } }),
    () => privilegedDb.kol.deleteMany({ where: { tenantId } }),
    () => privilegedDb.tenant.deleteMany({ where: { id: tenantId } }),
  ]) {
    try {
      await step();
    } catch (err) {
      console.warn('[M5.2-F004] 清理步骤失败（继续）:', err);
    }
  }
  if (ORIGINAL_SECRET === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_SWITCH === undefined) delete process.env.DB_APP_ROLE_RUNTIME;
  else process.env.DB_APP_ROLE_RUNTIME = ORIGINAL_SWITCH;
});

describe('§1 租户来源：显式解析，落到写明的那个租户', () => {
  it('🔒 正常路径 → 200，且信号落在**显式解析出的那个**租户名下', async () => {
    const svixId = `msg_${TAG}_ok`;
    svixIds.push(svixId);

    const res = await POST(signedRequest(deliveredEvent(), svixId));
    expect(res.status).toBe(200);

    const row = await privilegedDb.signal.findUnique({
      where: { externalId: svixId },
      select: { tenantId: true },
    });
    expect(row, '信号没落库 —— 正向路径都不通，下面那条负向断言就没有意义').not.toBeNull();
    expect(row!.tenantId).toBe(tenantId);
  });
});

describe('§2 解析不出 tenantId → fail-closed，一行都不许落', () => {
  it('🔒 租户解析抛错 → 非 2xx，且**全库**这条 externalId 零行', async () => {
    const svixId = `msg_${TAG}_unresolvable`;
    svixIds.push(svixId);
    tenantSeam.unresolvable = true;

    const res = await POST(signedRequest(deliveredEvent(), svixId));

    // 返回码只是表象：Resend 按 at-least-once 重投，不能是 2xx（那等于「收下了」）
    expect(res.ok).toBe(false);

    // 判据本体：**跨租户**零行。断言写成全库计数而不是「dev 租户里没有」——
    // 后者对「回落到别的租户」恰好视而不见，而那正是本用例要防的那件事。
    expect(
      await rowsAnywhere(svixId),
      '解析不出租户却把信号写进了某个租户 —— 回落发生了',
    ).toBe(0);
  });

  it('🔒 对照：同一条事件在解析正常时**是会落库的**（证明上一条的零不是「压根没走到」）', async () => {
    const svixId = `msg_${TAG}_contrast`;
    svixIds.push(svixId);

    // 没有这一条，上一条的「零行」与「这条 payload 本来就不落库」在观测上完全一样
    const res = await POST(signedRequest(deliveredEvent(), svixId));
    expect(res.status).toBe(200);
    expect(await rowsAnywhere(svixId)).toBe(1);
  });
});
