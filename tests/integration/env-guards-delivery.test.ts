// M3-B-DELIVERY F010 — →delivery / →insight 真判定集成测试（打真库，走 advanceStage 全链）
//
// 覆盖 acceptance：
// - 无 Deal → reach→delivery 拒（NO_DEAL_YET），零写入、游标不动
// - 建 Deal 后 → 放行，游标推进
// - 仍有未收尾 Deal → delivery→insight 拒（DEALS_NOT_SETTLED）
// - 全部 Deal completed（或 defaulted）→ 放行
// - P12 空态诚实：零 Deal 项目不被 →insight 阻断

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { advanceStage } from '../../src/lib/domain/env-advance';
import { ENV_GUARD_MESSAGE } from '../../src/lib/display/env-guard-messages';
import type { Stage } from '../../src/lib/agent/stage-routing';

const FIXTURE_SLUG = `test-tenant-m3b-guards-${process.pid}`;
const GOAL = {
  targetExposure: 1_000_000,
  periodStart: '2026-07-01',
  periodEnd: '2026-08-31',
};

let tenantId: string;
let projectId: string;
let kolId: string;

async function resetProject(cur: Stage, maxReached: Stage) {
  await prisma.project.update({
    where: { id: projectId },
    data: { cur, maxReached, goal: GOAL as unknown as Prisma.InputJsonValue },
  });
}

let dealSeq = 0;

/** 每笔 Deal 用独立 KOL（@@unique[projectId,kolId]：一人一 Deal）。 */
async function makeDeal(status: 'delivering' | 'completed' | 'defaulted') {
  dealSeq += 1;
  const kol = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3b-guards-${process.pid}-${dealSeq}`,
      displayName: `GuardKol${dealSeq}`,
    },
  });
  return prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: kol.id,
      status,
      termsJson: {
        amount: 1000,
        currency: 'USD',
        deliverables: [],
        scope: null,
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B guards 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: {
      tenantId,
      name: 'M3B guards 夹具项目',
      goal: GOAL as unknown as Prisma.InputJsonValue,
    },
  });
  projectId = p.id;
  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3b-guards-${process.pid}`,
      displayName: 'GuardKol',
    },
  });
  kolId = k.id;
});

beforeEach(async () => {
  await prisma.deal.deleteMany({ where: { projectId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('→delivery：判据 = ≥1 Deal', () => {
  it('无 Deal → 拒（NO_DEAL_YET），零写入且游标不动', async () => {
    await resetProject('reach', 'reach');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('NO_DEAL_YET');
    expect(r.logId).toBeNull();
    expect(await prisma.operationLog.count({ where: { tenantId } })).toBe(0);
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(row.cur).toBe('reach');
  });

  it('建 Deal 后 → 放行，游标推进到 delivery', async () => {
    await resetProject('reach', 'reach');
    await makeDeal('delivering');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(true);
    expect(r.cur).toBe('delivery');
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(row.cur).toBe('delivery');
    expect(row.maxReached).toBe('delivery');
  });

  it('他项目的 Deal 不算数（判据按项目过滤）', async () => {
    const other = await prisma.project.create({
      data: { tenantId, name: '他项目' },
    });
    await prisma.deal.create({
      data: {
        tenantId,
        projectId: other.id,
        kolId,
        status: 'delivering',
        termsJson: {} as unknown as Prisma.InputJsonValue,
      },
    });
    await resetProject('reach', 'reach');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('NO_DEAL_YET');
    await prisma.project.delete({ where: { id: other.id } });
  });
});

describe('→insight：判据 = 全部 Deal 收尾（或零 Deal）', () => {
  it('仍有未收尾 Deal → 拒（DEALS_NOT_SETTLED）', async () => {
    await resetProject('delivery', 'delivery');
    await makeDeal('delivering');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('DEALS_NOT_SETTLED');
    expect(await prisma.operationLog.count({ where: { tenantId } })).toBe(0);
  });

  it('部分收尾也不放行（一个 completed + 一个 delivering）', async () => {
    await resetProject('delivery', 'delivery');
    await makeDeal('completed');
    await makeDeal('delivering');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('DEALS_NOT_SETTLED');
  });

  it('全部 completed → 放行', async () => {
    await resetProject('delivery', 'delivery');
    await makeDeal('completed');
    await makeDeal('completed');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(true);
    expect(r.cur).toBe('insight');
  });

  it('completed + defaulted（显式收尾）→ 放行', async () => {
    await resetProject('delivery', 'delivery');
    await makeDeal('completed');
    await makeDeal('defaulted');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(true);
    expect(r.cur).toBe('insight');
  });

  it('P12 空态诚实：零 Deal 项目不被 →insight 阻断', async () => {
    await resetProject('delivery', 'delivery');
    const r = await advanceStage({ projectId, tenantId });
    expect(r.ok).toBe(true);
    expect(r.cur).toBe('insight');
  });
});

describe('文案映射齐备（新 reason 码可念给人听）', () => {
  it('两个新 reason 都有用户可读文案且非占位', () => {
    expect(ENV_GUARD_MESSAGE.NO_DEAL_YET).toContain('交易');
    expect(ENV_GUARD_MESSAGE.DEALS_NOT_SETTLED).toContain('收尾');
    for (const msg of Object.values(ENV_GUARD_MESSAGE)) {
      expect(msg.length).toBeGreaterThan(6);
      expect(msg).not.toContain('尚未接入'); // D9 占位文案已随理由退役
    }
  });
});
