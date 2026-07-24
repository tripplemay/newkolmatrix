// M3-B-DELIVERY F010 — Evaluator 独立集成探针（非 Generator 产物）。
//
// 独立视角补强：Generator 的 env-guards-delivery.test.ts 对「未收尾」路径只喂了
// `delivering` 一态。若有人误把 signed/escrowed/blocked 等非终态并进「已收尾」集合，
// Generator 套件抓不到。本探针穷举 DealStatus 全部【非收尾】取值，逐态断言 →insight 被拒，
// 且逐态断言这些 Deal 都算「≥1 Deal」故 →delivery 放行——两条判据的边界各自独立守住。
//
// 断言一律验行为（走 advanceStage 打真库全链），不读源码关键字（D20）。
// 夹具自建租户 + afterAll 自清理，不依赖 seed。

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { advanceStage } from '../../src/lib/domain/env-advance';
import type { Stage } from '../../src/lib/agent/stage-routing';

const FIXTURE_SLUG = `test-tenant-m3b-f010-eval-${process.pid}`;
const GOAL = {
  targetExposure: 1_000_000,
  periodStart: '2026-07-01',
  periodEnd: '2026-08-31',
};

// DealStatus 全集（schema.prisma:484-491）。settled = completed | defaulted；其余五态非收尾。
const NON_SETTLED = [
  'negotiating',
  'signed',
  'escrowed',
  'delivering',
  'blocked',
] as const;
const SETTLED = ['completed', 'defaulted'] as const;

type DealStatus = (typeof NON_SETTLED)[number] | (typeof SETTLED)[number];

let tenantId: string;
let projectId: string;
let kolSeq = 0;

async function resetProject(cur: Stage, maxReached: Stage) {
  await prisma.project.update({
    where: { id: projectId },
    data: { cur, maxReached, goal: GOAL as unknown as Prisma.InputJsonValue },
  });
}

/** 每笔 Deal 独立 KOL（@@unique[projectId,kolId]）。 */
async function makeDeal(status: DealStatus) {
  kolSeq += 1;
  const kol = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3b-f010-eval-${process.pid}-${kolSeq}`,
      displayName: `EvalKol${kolSeq}`,
    },
  });
  return prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: kol.id,
      status,
      termsJson: {
        amount: 500,
        currency: 'USD',
        deliverables: [],
        scope: null,
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, status: true },
  });
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B F010 eval 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: {
      tenantId,
      name: 'M3B F010 eval 夹具项目',
      goal: GOAL as unknown as Prisma.InputJsonValue,
    },
  });
  projectId = p.id;
});

beforeEach(async () => {
  await prisma.deal.deleteMany({ where: { projectId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.deal.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('→delivery：任何 DealStatus 都算「≥1 Deal」（判据是存在性，不看状态）', () => {
  for (const status of [...NON_SETTLED, ...SETTLED] as DealStatus[]) {
    it(`单笔 ${status} Deal → reach→delivery 放行`, async () => {
      await resetProject('reach', 'reach');
      await makeDeal(status);
      const r = await advanceStage({ projectId, tenantId });
      expect(r.ok, `status=${status}`).toBe(true);
      expect(r.cur).toBe('delivery');
    });
  }
});

describe('→insight：全部【非收尾】DealStatus 都必须阻断（穷举边界）', () => {
  for (const status of NON_SETTLED) {
    it(`单笔 ${status} Deal → delivery→insight 拒（DEALS_NOT_SETTLED），零写入`, async () => {
      await resetProject('delivery', 'delivery');
      await makeDeal(status);
      const r = await advanceStage({ projectId, tenantId });
      expect(r.ok, `status=${status}`).toBe(false);
      expect(r.reason, `status=${status}`).toBe('DEALS_NOT_SETTLED');
      expect(r.logId).toBeNull();
      const logs = await prisma.operationLog.count({ where: { tenantId } });
      expect(logs).toBe(0);
      // 游标不动
      const row = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
      });
      expect(row.cur).toBe('delivery');
    });
  }

  it('混合：completed + blocked → 仍拒（一颗非收尾即阻断）', async () => {
    await resetProject('delivery', 'delivery');
    await makeDeal('completed');
    await makeDeal('blocked');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('DEALS_NOT_SETTLED');
  });

  it('全 settled（completed + defaulted）→ 放行且留痕一条', async () => {
    await resetProject('delivery', 'delivery');
    await makeDeal('completed');
    await makeDeal('defaulted');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(true);
    expect(r.cur).toBe('insight');
    expect(r.logId).not.toBeNull();
    const logs = await prisma.operationLog.count({ where: { tenantId } });
    expect(logs).toBe(1);
  });
});

describe('P12 空态诚实（独立复核）：零 Deal 不阻断 →insight，且写痕', () => {
  it('零 Deal delivery→insight 放行 + OperationLog 落一条', async () => {
    await resetProject('delivery', 'delivery');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(true);
    expect(r.cur).toBe('insight');
    expect(r.logId).not.toBeNull();
  });
});
