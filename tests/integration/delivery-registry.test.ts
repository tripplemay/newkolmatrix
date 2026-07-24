// M3-B-DELIVERY F008 — 交付登记集成测试（打真库）
//
// 覆盖 acceptance：
// - 三端点服务层：登记 refs → 条件置 met → Deal 推进（signed/escrowed）→ deliveryCheck 重算联动
// - 人工核验 met/missing/na + evidenceRef + verifiedBy（撤回证据 → ready 回落）
// - key 池登记（幂等、明文 key 拒）
// - 三个动作均写 OperationLog 留痕
// - route 层：zod 坏入参 400 明示 + 限流 30/min/IP fail-open + escape hatch
//
// 分层理由（M3-A 教训）：CI 库无 dev tenant seed，route 走 getDevTenantId 会炸——
// 故业务断言下沉服务层 + 夹具租户；route 只测「tenant 解析之前」的契约（400 / 429），
// 这两条恰好是本 feature 的 route 层职责。

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import {
  registerDealRefs,
  registerKeyPool,
  verifyDeliverable,
  DeliveryRegisterError,
} from '../../src/lib/delivery/register';
import { loadDeliveryCheck } from '../../src/lib/delivery/check';
import { resetRateLimit } from '../../src/lib/http/rate-limit';
import { POST as postRefs } from '../../src/app/api/delivery/deals/[id]/refs/route';
import { POST as postKeys } from '../../src/app/api/delivery/deals/[id]/keys/route';
import { PATCH as patchDeliverable } from '../../src/app/api/delivery/deliverables/[id]/route';

const FIXTURE_SLUG = `test-tenant-m3b-registry-${process.pid}`;

let tenantId: string;
let projectId: string;

async function makeDeal(handle: string, opts?: { status?: 'negotiating' | 'blocked' | 'defaulted' }) {
  const kol = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `${handle}-${process.pid}`,
      displayName: handle,
    },
  });
  const deal = await prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: kol.id,
      status: opts?.status ?? 'negotiating',
      termsJson: {
        amount: 1200,
        currency: 'USD',
        deliverables: ['1 条长视频'],
        scope: null,
      } as unknown as Prisma.InputJsonValue,
      deliverables: {
        create: [
          { tenantId, kind: 'content', required: true, status: 'pending' },
          { tenantId, kind: 'key', required: false, status: 'na' },
          { tenantId, kind: 'contract', required: true, status: 'pending' },
          { tenantId, kind: 'escrow', required: true, status: 'pending' },
          {
            tenantId,
            kind: 'ad_disclosure',
            required: true,
            status: 'pending',
          },
        ],
      },
    },
    select: { id: true },
  });
  return deal.id;
}

const ctx = () => ({ tenantId, actor: 'operator' });
const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B registry 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'M3B registry 夹具项目' },
  });
  projectId = p.id;
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('① 登记 contract / escrow 单号 → 条件 met + Deal 推进', () => {
  it('登记 contractRef → contract 置 met + Deal negotiating→signed + 留痕', async () => {
    const dealId = await makeDeal('RegContract');
    const r = await registerDealRefs(dealId, { contractRef: 'sign-777' }, ctx());
    expect(r.dealStatus).toBe('signed');
    expect(r.metKinds).toEqual(['contract']);
    expect(r.check.byKind.contract.cell).toBe('ok');
    expect(r.check.byKind.contract.evidenceRef).toBe('sign-777');
    expect(r.check.ready).toBe(false); // 其它条件还没齐

    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.contractRef).toBe('sign-777');
    expect(deal?.status).toBe('signed');

    const logs = await prisma.operationLog.findMany({
      where: { tenantId, projectId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    expect(logs.some((l) => (l.summary ?? '').includes('合同'))).toBe(true);
    expect(logs.some((l) => (l.summary ?? '').includes('状态推进'))).toBe(true);
  });

  it('两个单号一起登记 → 一次推进到 escrowed（途经 signed，不跳态）', async () => {
    const dealId = await makeDeal('RegBoth');
    const r = await registerDealRefs(
      dealId,
      { contractRef: 'sign-1', escrowRef: 'esc-1' },
      ctx(),
    );
    expect(r.dealStatus).toBe('escrowed');
    expect(r.metKinds).toEqual(['contract', 'escrow']);
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, summary: { contains: '状态推进' } },
      orderBy: { createdAt: 'desc' },
    });
    const payload = log?.payloadJson as { path?: string[] };
    expect(payload.path).toEqual(['signed', 'escrowed']); // 逐级留痕
  });

  it('重复登记不倒流（幂等）：已 escrowed 再登记 contractRef 仍是 escrowed', async () => {
    const dealId = await makeDeal('RegIdem');
    await registerDealRefs(dealId, { escrowRef: 'esc-2' }, ctx());
    const r = await registerDealRefs(dealId, { contractRef: 'sign-2' }, ctx());
    expect(r.dealStatus).toBe('escrowed');
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.status).toBe('escrowed');
    expect(deal?.contractRef).toBe('sign-2');
  });

  it('blocked 的交易：登记条件但不替人恢复状态（D2 不替人决定）', async () => {
    const dealId = await makeDeal('RegBlocked', { status: 'blocked' });
    const r = await registerDealRefs(dealId, { contractRef: 'sign-3' }, ctx());
    expect(r.dealStatus).toBe('blocked');
    expect(r.check.byKind.contract.cell).toBe('ok');
  });

  it('defaulted 的交易 → 409 冲突（终态不接受登记）', async () => {
    const dealId = await makeDeal('RegDefaulted', { status: 'defaulted' });
    await expect(
      registerDealRefs(dealId, { contractRef: 'x' }, ctx()),
    ).rejects.toThrowError(DeliveryRegisterError);
  });

  it('交易不存在 → NOT_FOUND', async () => {
    await expect(
      registerDealRefs('nope', { contractRef: 'x' }, ctx()),
    ).rejects.toThrowError(/交易不存在/);
  });
});

describe('② Deliverable 人工核验 → deliveryCheck 重算联动', () => {
  it('逐条核验到齐 → ready 由 false 翻 true', async () => {
    const dealId = await makeDeal('VerifyAll');
    await registerDealRefs(
      dealId,
      { contractRef: 'sign-9', escrowRef: 'esc-9' },
      ctx(),
    );
    const rows = await prisma.deliverable.findMany({ where: { dealId } });
    const content = rows.find((d) => d.kind === 'content')!;
    const ad = rows.find((d) => d.kind === 'ad_disclosure')!;

    const afterContent = await verifyDeliverable(
      content.id,
      { status: 'met', evidenceRef: 'https://video/1', verifiedBy: 'operator' },
      ctx(),
    );
    expect(afterContent.check.ready).toBe(false); // #ad 还没核

    const afterAd = await verifyDeliverable(
      ad.id,
      { status: 'met', evidenceRef: 'ad-shot.png' },
      ctx(),
    );
    expect(afterAd.check.ready).toBe(true); // 全齐
    const saved = await prisma.deliverable.findUnique({
      where: { id: ad.id },
    });
    expect(saved?.verifiedBy).toBe('operator');
    expect(saved?.evidenceRef).toBe('ad-shot.png');
  });

  it('撤回证据（missing + evidenceRef=null）→ ready 回落 false，缺口逐条列出', async () => {
    const dealId = await makeDeal('VerifyRevoke');
    await registerDealRefs(
      dealId,
      { contractRef: 's', escrowRef: 'e' },
      ctx(),
    );
    const rows = await prisma.deliverable.findMany({ where: { dealId } });
    for (const kind of ['content', 'ad_disclosure']) {
      const row = rows.find((d) => d.kind === kind)!;
      await verifyDeliverable(row.id, { status: 'met', evidenceRef: 'ok' }, ctx());
    }
    const contentRow = rows.find((d) => d.kind === 'content')!;
    const revoked = await verifyDeliverable(
      contentRow.id,
      { status: 'missing', evidenceRef: null, note: '终稿被撤回' },
      ctx(),
    );
    expect(revoked.check.ready).toBe(false);
    expect(revoked.check.gaps).toContainEqual({
      kind: 'content',
      reason: 'MISSING',
      note: '终稿被撤回',
    });
    const saved = await prisma.deliverable.findUnique({
      where: { id: contentRow.id },
    });
    expect(saved?.evidenceRef).toBeNull(); // 显式 null = 撤回，不是「保持原值」
  });

  it('人工核验可纠正 F003 的 key 判定（na → met/required 由人说了算）', async () => {
    const dealId = await makeDeal('VerifyKey');
    const keyRow = await prisma.deliverable.findFirst({
      where: { dealId, kind: 'key' },
    });
    expect(keyRow?.status).toBe('na');
    const r = await verifyDeliverable(
      keyRow!.id,
      { status: 'met', evidenceRef: 'keys:pool-1' },
      ctx(),
    );
    expect(r.check.byKind.key.cell).toBe('ok');
  });

  it('核验写 OperationLog（from → to 可追溯）', async () => {
    const dealId = await makeDeal('VerifyLog');
    const row = await prisma.deliverable.findFirst({
      where: { dealId, kind: 'escrow' },
    });
    await verifyDeliverable(row!.id, { status: 'met' }, ctx());
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, summary: { contains: '交付核验' } },
      orderBy: { createdAt: 'desc' },
    });
    const payload = log?.payloadJson as { from?: string; to?: string };
    expect(payload.from).toBe('pending');
    expect(payload.to).toBe('met');
  });

  it('条件不存在 → NOT_FOUND', async () => {
    await expect(
      verifyDeliverable('nope', { status: 'met' }, ctx()),
    ).rejects.toThrowError(/交付条件不存在/);
  });
});

describe('③ key 池登记', () => {
  it('登记 → reserved 条目 + 可用计数 + 留痕', async () => {
    const dealId = await makeDeal('KeysReg');
    const r = await registerKeyPool(
      dealId,
      { keyRefs: ['pool-a', 'pool-b'] },
      ctx(),
    );
    expect(r.registered).toBe(2);
    expect(r.available).toBe(2);
    const keys = await prisma.gameKey.findMany({ where: { dealId } });
    expect(keys.every((k) => k.status === 'reserved')).toBe(true);
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, summary: { contains: 'key 池登记' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
  });

  it('重复引用跳过不重复建（幂等）', async () => {
    const dealId = await makeDeal('KeysIdem');
    await registerKeyPool(dealId, { keyRefs: ['k1', 'k2'] }, ctx());
    const r = await registerKeyPool(dealId, { keyRefs: ['k2', 'k3'] }, ctx());
    expect(r.registered).toBe(1);
    expect(r.skipped).toEqual(['k2']);
    expect(await prisma.gameKey.count({ where: { dealId } })).toBe(3);
  });

  it('明文激活码形状 → 拒绝入库（P8 写入口守卫）', async () => {
    const dealId = await makeDeal('KeysPlain');
    await expect(
      registerKeyPool(dealId, { keyRefs: ['ABCDE-12345-XYZ99'] }, ctx()),
    ).rejects.toThrowError(/只存引用不存明文/);
    expect(await prisma.gameKey.count({ where: { dealId } })).toBe(0);
  });
});

describe('route 契约层（tenant 解析之前的职责）', () => {
  beforeEach(() => {
    resetRateLimit();
    delete process.env.DISABLE_GATE_RATELIMIT;
  });

  const post = (url: string, body: unknown) =>
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
      body: JSON.stringify(body),
    });

  it('refs：两个单号都不给 → 400 且逐字段明示', async () => {
    const res = await postRefs(
      post('http://x/api/delivery/deals/d1/refs', {}),
      routeParams('d1'),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; issues: unknown[] };
    expect(body.code).toBe('INVALID_INPUT');
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('refs：非法 JSON body → 400 而不是 500', async () => {
    const res = await postRefs(
      new Request('http://x/api/delivery/deals/d1/refs', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.9' },
        body: '{ not json',
      }),
      routeParams('d1'),
    );
    expect(res.status).toBe(400);
  });

  it('deliverables PATCH：非法状态值 → 400', async () => {
    const res = await patchDeliverable(
      new Request('http://x/api/delivery/deliverables/x', {
        method: 'PATCH',
        headers: { 'x-forwarded-for': '198.51.100.9' },
        body: JSON.stringify({ status: 'pending' }), // 核验不接受 pending
      }),
      routeParams('x'),
    );
    expect(res.status).toBe(400);
  });

  it('keys：空清单 → 400', async () => {
    const res = await postKeys(
      post('http://x/api/delivery/deals/d1/keys', { keyRefs: [] }),
      routeParams('d1'),
    );
    expect(res.status).toBe(400);
  });

  it('P9 限流：同 IP 第 31 次 → 429 + Retry-After', async () => {
    const ip = '203.0.113.77';
    const req = () =>
      new Request('http://x/api/delivery/deals/d1/keys', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip },
        body: JSON.stringify({ keyRefs: [] }), // 400（但限流在校验之前）
      });
    for (let i = 0; i < 30; i += 1) {
      const res = await postKeys(req(), routeParams('d1'));
      expect(res.status).toBe(400); // 未限流：走到 zod
    }
    const limited = await postKeys(req(), routeParams('d1'));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
  });

  it('escape hatch：DISABLE_GATE_RATELIMIT=true 时不限流', async () => {
    process.env.DISABLE_GATE_RATELIMIT = 'true';
    const ip = '203.0.113.78';
    for (let i = 0; i < 35; i += 1) {
      const res = await postKeys(
        new Request('http://x/api/delivery/deals/d1/keys', {
          method: 'POST',
          headers: { 'x-forwarded-for': ip },
          body: JSON.stringify({ keyRefs: [] }),
        }),
        routeParams('d1'),
      );
      expect(res.status).toBe(400); // 始终走到 zod，从不 429
    }
    delete process.env.DISABLE_GATE_RATELIMIT;
  });

  it('fail-open：取不到 IP 时放行（不因缺头拒绝人操作）', async () => {
    const res = await postKeys(
      new Request('http://x/api/delivery/deals/d1/keys', {
        method: 'POST',
        body: JSON.stringify({ keyRefs: [] }),
      }),
      routeParams('d1'),
    );
    expect(res.status).toBe(400); // 放行到 zod，而非 403/429
  });
});
