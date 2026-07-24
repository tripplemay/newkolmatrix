// M3-B-DELIVERY F008 — Evaluator 独立验收探针（打真库 + 走完整 HTTP route 路径）
//
// 独立视角：Generator 自己的 delivery-registry.test.ts 把业务断言下沉到服务层，
// route 层只测「tenant 解析之前」（400/429）。本探针相反——因本机 dev tenant 已 seed，
// 我直接**穿过完整 route 边界**（Request → route handler → getDevTenantId → 服务 → 真库），
// 独立复核 F008 acceptance 的端到端闭环，而非只信服务层。
//
// 覆盖 acceptance：
//  1. 三端点 nodejs runtime（import 断言）
//  2. POST /refs：登记 → Deliverable met + Deal 推进（signed/escrowed）+ OperationLog（route 路径）
//  3. PATCH /deliverables：人工核验 met/missing/na + evidenceRef + verifiedBy（route 路径）
//  4. deliveryCheck 重算联动：全齐 → ready 翻 true；撤回 → ready 回落 + 缺口清单
//  5. na 三态不被压成二态（key na cell='na'）
//  6. POST /keys：key 池登记（幂等 + 明文守卫）（route 路径）
//  7. zod 坏入参 400 逐字段明示（三端点各一）
//  8. P9 限流 30/min/IP fail-open + escape hatch（独立 IP，与 generator 不同域桶）
//  9. XFF 可信段取法（M3-A F002-XFF soft-watch 转正）：左侧伪造段不改限流分桶

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { getDevTenantId } from '../../src/lib/agent/context';
import { resetRateLimit, clientIpOf } from '../../src/lib/http/rate-limit';
import { POST as postRefs, runtime as refsRuntime } from '../../src/app/api/delivery/deals/[id]/refs/route';
import { POST as postKeys, runtime as keysRuntime } from '../../src/app/api/delivery/deals/[id]/keys/route';
import { PATCH as patchDeliverable, runtime as delivRuntime } from '../../src/app/api/delivery/deliverables/[id]/route';

const HANDLE_PREFIX = `m3b-f008-probe-${process.pid}`;
let tenantId: string;
let projectId: string;

async function makeDealUnderDevTenant(handle: string) {
  const kol = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `${HANDLE_PREFIX}-${handle}`,
      displayName: `${HANDLE_PREFIX}-${handle}`,
    },
  });
  const deal = await prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: kol.id,
      status: 'negotiating',
      termsJson: {
        amount: 2000,
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
          { tenantId, kind: 'ad_disclosure', required: true, status: 'pending' },
        ],
      },
    },
    select: { id: true },
  });
  return deal.id;
}

const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });
const jsonReq = (method: string, url: string, body: unknown, ip = '198.51.100.42') =>
  new Request(url, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  // 全程走 dev tenant（route handler 硬解析 slug='dev'），本机已 seed
  tenantId = await getDevTenantId();
  const p = await prisma.project.create({
    data: { tenantId, name: `${HANDLE_PREFIX}-project` },
  });
  projectId = p.id;
});

afterAll(async () => {
  // 只删本探针自建数据（dev tenant 是共享租户，绝不整租户清）
  await prisma.operationLog.deleteMany({ where: { tenantId, projectId } });
  await prisma.project.delete({ where: { id: projectId } }); // cascade → deal → deliverable/gamekey/payout
  await prisma.kol.deleteMany({
    where: { tenantId, canonicalHandle: { startsWith: HANDLE_PREFIX } },
  });
  await prisma.$disconnect();
});

beforeEach(() => {
  resetRateLimit();
  delete process.env.DISABLE_GATE_RATELIMIT;
});

describe('0. 三端点 nodejs runtime（Prisma 要求）', () => {
  it('refs / deliverables / keys 均 export runtime = nodejs', () => {
    expect(refsRuntime).toBe('nodejs');
    expect(delivRuntime).toBe('nodejs');
    expect(keysRuntime).toBe('nodejs');
  });
});

describe('1. POST /refs 完整 route 路径：登记 → met + Deal 推进 + 留痕', () => {
  it('contractRef+escrowRef 一次到 escrowed（途经 signed，不跳态）+ 条件 met + 留痕', async () => {
    const dealId = await makeDealUnderDevTenant('refs');
    const res = await postRefs(
      jsonReq('POST', `http://x/api/delivery/deals/${dealId}/refs`, {
        contractRef: 'evtest-sign-001',
        escrowRef: 'evtest-esc-001',
      }),
      routeParams(dealId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dealStatus: string;
      metKinds: string[];
      check: { ready: boolean; byKind: Record<string, { cell: string; evidenceRef: string | null }> };
    };
    expect(body.dealStatus).toBe('escrowed');
    expect(body.metKinds.sort()).toEqual(['contract', 'escrow']);
    expect(body.check.byKind.contract.cell).toBe('ok');
    expect(body.check.byKind.contract.evidenceRef).toBe('evtest-sign-001');
    expect(body.check.byKind.escrow.cell).toBe('ok');
    expect(body.check.ready).toBe(false); // content/#ad 未齐

    // 真库校验
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.status).toBe('escrowed');
    expect(deal?.contractRef).toBe('evtest-sign-001');
    expect(deal?.escrowRef).toBe('evtest-esc-001');

    // 逐级留痕（signed → escrowed）
    const advLog = await prisma.operationLog.findFirst({
      where: { tenantId, projectId, summary: { contains: '状态推进' } },
      orderBy: { createdAt: 'desc' },
    });
    expect((advLog?.payloadJson as { path?: string[] }).path).toEqual(['signed', 'escrowed']);
    const regLog = await prisma.operationLog.findFirst({
      where: { tenantId, projectId, summary: { contains: '交付登记' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(regLog).not.toBeNull();
  });
});

describe('2. PATCH /deliverables + 3. deliveryCheck 重算联动（route 路径）', () => {
  it('逐条核验到齐 → ready 翻 true；撤回 → ready 回落 + 缺口 MISSING', async () => {
    const dealId = await makeDealUnderDevTenant('verify');
    await postRefs(
      jsonReq('POST', `http://x/api/delivery/deals/${dealId}/refs`, {
        contractRef: 'c1',
        escrowRef: 'e1',
      }),
      routeParams(dealId),
    );
    const rows = await prisma.deliverable.findMany({ where: { dealId } });
    const content = rows.find((d) => d.kind === 'content')!;
    const ad = rows.find((d) => d.kind === 'ad_disclosure')!;

    // 核验 content（带 evidenceRef + verifiedBy）
    const r1 = await patchDeliverable(
      jsonReq('PATCH', `http://x/api/delivery/deliverables/${content.id}`, {
        status: 'met',
        evidenceRef: 'https://video/final',
        verifiedBy: 'qa-andy',
      }),
      routeParams(content.id),
    );
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { check: { ready: boolean } };
    expect(b1.check.ready).toBe(false); // #ad 还没核

    const savedContent = await prisma.deliverable.findUnique({ where: { id: content.id } });
    expect(savedContent?.status).toBe('met');
    expect(savedContent?.verifiedBy).toBe('qa-andy');
    expect(savedContent?.evidenceRef).toBe('https://video/final');

    // 核验 #ad → 全齐 → ready 翻 true
    const r2 = await patchDeliverable(
      jsonReq('PATCH', `http://x/api/delivery/deliverables/${ad.id}`, {
        status: 'met',
        evidenceRef: 'ad-shot.png',
      }),
      routeParams(ad.id),
    );
    const b2 = (await r2.json()) as { check: { ready: boolean } };
    expect(b2.check.ready).toBe(true);

    // 撤回 content（missing + 显式 null 撤证据）→ ready 回落 + 缺口逐条
    const r3 = await patchDeliverable(
      jsonReq('PATCH', `http://x/api/delivery/deliverables/${content.id}`, {
        status: 'missing',
        evidenceRef: null,
        note: '终稿被撤回',
      }),
      routeParams(content.id),
    );
    const b3 = (await r3.json()) as {
      check: { ready: boolean; gaps: { kind: string | null; reason: string; note: string | null }[] };
    };
    expect(b3.check.ready).toBe(false);
    expect(b3.check.gaps).toContainEqual({ kind: 'content', reason: 'MISSING', note: '终稿被撤回' });
    const afterRevoke = await prisma.deliverable.findUnique({ where: { id: content.id } });
    expect(afterRevoke?.evidenceRef).toBeNull(); // 显式 null = 撤回

    // 核验留痕
    const vLog = await prisma.operationLog.findFirst({
      where: { tenantId, projectId, summary: { contains: '交付核验' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(vLog).not.toBeNull();
  });

  it('na 三态不被压成二态：key(na/非必需) cell=na 且不阻断 ready', async () => {
    const dealId = await makeDealUnderDevTenant('na');
    await postRefs(
      jsonReq('POST', `http://x/api/delivery/deals/${dealId}/refs`, { contractRef: 'c', escrowRef: 'e' }),
      routeParams(dealId),
    );
    const rows = await prisma.deliverable.findMany({ where: { dealId } });
    for (const kind of ['content', 'ad_disclosure']) {
      const row = rows.find((d) => d.kind === kind)!;
      await patchDeliverable(
        jsonReq('PATCH', `http://x/api/delivery/deliverables/${row.id}`, { status: 'met', evidenceRef: 'ok' }),
        routeParams(row.id),
      );
    }
    const keyRow = rows.find((d) => d.kind === 'key')!;
    const res = await patchDeliverable(
      jsonReq('PATCH', `http://x/api/delivery/deliverables/${keyRow.id}`, { status: 'na' }),
      routeParams(keyRow.id),
    );
    const body = (await res.json()) as {
      check: { ready: boolean; byKind: Record<string, { cell: string }> };
    };
    expect(body.check.byKind.key.cell).toBe('na'); // 三态未被压成 miss
    expect(body.check.ready).toBe(true); // na 非必需不阻断
  });
});

describe('4. POST /keys 完整 route 路径：key 池登记', () => {
  it('登记 → reserved + 幂等重入不重复建 + 留痕', async () => {
    const dealId = await makeDealUnderDevTenant('keys');
    const r1 = await postKeys(
      jsonReq('POST', `http://x/api/delivery/deals/${dealId}/keys`, { keyRefs: ['evpool-a', 'evpool-b'] }),
      routeParams(dealId),
    );
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { registered: number; available: number };
    expect(b1.registered).toBe(2);
    expect(b1.available).toBe(2);

    const r2 = await postKeys(
      jsonReq('POST', `http://x/api/delivery/deals/${dealId}/keys`, { keyRefs: ['evpool-b', 'evpool-c'] }),
      routeParams(dealId),
    );
    const b2 = (await r2.json()) as { registered: number; skipped: string[] };
    expect(b2.registered).toBe(1);
    expect(b2.skipped).toEqual(['evpool-b']);
    expect(await prisma.gameKey.count({ where: { dealId } })).toBe(3);
    expect(await prisma.gameKey.count({ where: { dealId, status: 'reserved' } })).toBe(3);

    const kLog = await prisma.operationLog.findFirst({
      where: { tenantId, projectId, summary: { contains: 'key 池登记' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(kLog).not.toBeNull();
    // 留痕不含明文 key 值（只存引用）
    expect(JSON.stringify(kLog?.payloadJson)).not.toContain('AAAAA');
  });

  it('明文激活码形状 → 400（route 边界；不入库）', async () => {
    const dealId = await makeDealUnderDevTenant('keys-plain');
    const res = await postKeys(
      jsonReq('POST', `http://x/api/delivery/deals/${dealId}/keys`, { keyRefs: ['ABCDE-12345-XYZ99'] }),
      routeParams(dealId),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.error).toMatch(/只存引用不存明文/);
    expect(await prisma.gameKey.count({ where: { dealId } })).toBe(0);
  });
});

describe('5. defaulted / 不存在 交易的 route 边界', () => {
  it('不存在的 deal → 404（route → 服务 → envelope）', async () => {
    const res = await postRefs(
      jsonReq('POST', 'http://x/api/delivery/deals/nonexistent/refs', { contractRef: 'x' }),
      routeParams('nonexistent'),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  it('defaulted 交易登记 → 409 冲突（终态不接受登记）', async () => {
    const dealId = await makeDealUnderDevTenant('defaulted');
    await prisma.deal.update({ where: { id: dealId }, data: { status: 'defaulted' } });
    const res = await postRefs(
      jsonReq('POST', `http://x/api/delivery/deals/${dealId}/refs`, { contractRef: 'x' }),
      routeParams(dealId),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('CONFLICT');
  });
});

describe('6. zod 坏入参 400 逐字段明示（三端点各一）', () => {
  it('refs：两个单号都不给 → 400 且 issues 逐字段', async () => {
    const res = await postRefs(
      jsonReq('POST', 'http://x/api/delivery/deals/d1/refs', {}),
      routeParams('d1'),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; issues: { path: string; message: string }[] };
    expect(body.code).toBe('INVALID_INPUT');
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('deliverables：status=pending（核验不接受）→ 400', async () => {
    const res = await patchDeliverable(
      jsonReq('PATCH', 'http://x/api/delivery/deliverables/x', { status: 'pending' }),
      routeParams('x'),
    );
    expect(res.status).toBe(400);
  });

  it('deliverables：evidenceRef 超长（>200）→ 400 明示', async () => {
    const res = await patchDeliverable(
      jsonReq('PATCH', 'http://x/api/delivery/deliverables/x', {
        status: 'met',
        evidenceRef: 'x'.repeat(201),
      }),
      routeParams('x'),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues: { message: string }[] };
    expect(body.issues.some((i) => /过长/.test(i.message))).toBe(true);
  });

  it('keys：空清单 → 400', async () => {
    const res = await postKeys(
      jsonReq('POST', 'http://x/api/delivery/deals/d1/keys', { keyRefs: [] }),
      routeParams('d1'),
    );
    expect(res.status).toBe(400);
  });

  it('非法 JSON body → 400（不 500）', async () => {
    const res = await postRefs(
      new Request('http://x/api/delivery/deals/d1/refs', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.42' },
        body: '{ broken',
      }),
      routeParams('d1'),
    );
    expect(res.status).toBe(400);
  });
});

describe('7. P9 限流 30/min/IP fail-open + escape hatch', () => {
  it('同 IP 第 31 次 → 429 + Retry-After（前 30 次放行到 zod=400）', async () => {
    const ip = '203.0.113.201';
    const call = () =>
      postKeys(
        jsonReq('POST', 'http://x/api/delivery/deals/d1/keys', { keyRefs: [] }, ip),
        routeParams('d1'),
      );
    for (let i = 0; i < 30; i += 1) {
      const res = await call();
      expect(res.status).toBe(400); // 未限流：走到 zod
    }
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
  });

  it('escape hatch：DISABLE_GATE_RATELIMIT=true → 从不 429', async () => {
    process.env.DISABLE_GATE_RATELIMIT = 'true';
    const ip = '203.0.113.202';
    for (let i = 0; i < 35; i += 1) {
      const res = await postKeys(
        jsonReq('POST', 'http://x/api/delivery/deals/d1/keys', { keyRefs: [] }, ip),
        routeParams('d1'),
      );
      expect(res.status).toBe(400);
    }
  });

  it('fail-open：无 x-forwarded-for → 放行（不因缺头拒人）', async () => {
    const res = await postKeys(
      new Request('http://x/api/delivery/deals/d1/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyRefs: [] }),
      }),
      routeParams('d1'),
    );
    expect(res.status).toBe(400); // 放行到 zod，而非 429
  });
});

describe('8. XFF 可信段取法（M3-A F002-XFF soft-watch 转正）', () => {
  it('取右起首个非代理段：左侧伪造段不改分桶 key', () => {
    // 攻击者伪造左段并逐次旋转，右侧公网段（反代实测对端）恒定 → 应归同一桶
    const forged1 = new Request('http://x', {
      headers: { 'x-forwarded-for': '9.9.9.9, 203.0.113.5' },
    });
    const forged2 = new Request('http://x', {
      headers: { 'x-forwarded-for': '8.8.8.8, 203.0.113.5' },
    });
    expect(clientIpOf(forged1)).toBe('203.0.113.5');
    expect(clientIpOf(forged2)).toBe('203.0.113.5'); // 与 forged1 同桶 → 无法旋转绕限流
  });

  it('跳过右侧内网/回环段，取第一个公网段', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.3, 127.0.0.1' },
    });
    expect(clientIpOf(req)).toBe('203.0.113.9');
  });

  it('全内网段（本地 dev / 容器直连）→ 退化取最右段（不炸）', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' },
    });
    expect(clientIpOf(req)).toBe('192.168.1.1');
  });

  it('无 XFF 有 x-real-ip → 回落 x-real-ip；都无 → null（fail-open 依据）', () => {
    const withReal = new Request('http://x', { headers: { 'x-real-ip': '203.0.113.77' } });
    expect(clientIpOf(withReal)).toBe('203.0.113.77');
    const bare = new Request('http://x');
    expect(clientIpOf(bare)).toBeNull();
  });
});
