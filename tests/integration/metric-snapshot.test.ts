// M4-INSIGHT F004 — MetricSnapshot 装配服务集成测试（spend 真源聚合）
//
// 覆盖 acceptance：
// - 三种 spendSource 分支：released payout → 'payout' / 无 released 有 committed quote → 'quote'
//   / 两者皆无 → spend=null + 'none'
// - 仅 USD 计入：非 USD 不进 sum、按币种登记 nonUsdExcluded；全非 USD → spend=null 但源标注保留
//   （与「无源」可区分，P1 诚实降级）
// - reach/conversions/roi 恒 null（M5 前无分子，绝不填 0）
// - 跨项目聚合（V12）按项目分组
// - 表写入口最小实装（persistMetricSnapshot）
// - 夹具租户隔离（他租户数据不串）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import {
  loadProjectSpend,
  loadTenantProjectSpends,
  persistMetricSnapshot,
} from '../../src/lib/insight/metric-snapshot';

const FIXTURE_SLUG = `test-tenant-m4-snapshot-${process.pid}`;
const OTHER_SLUG = `test-tenant-m4-snapshot-other-${process.pid}`;

let tenantId: string;
let otherTenantId: string;
let projPayout: string; // released USD payouts（+杂音：prepared payout / 非 USD released / committed quote）
let projQuote: string; // 无 released，committed USD quotes（+杂音：proposed quote）
let projNone: string; // 什么都没有
let projNonUsd: string; // 只有非 USD released payout

const TERMS = {
  amount: 1000,
  currency: 'USD',
  deliverables: [] as string[],
  scope: null as string | null,
};

async function makeDealWithPayouts(
  tenant: string,
  project: string,
  handle: string,
  payouts: {
    amount: number;
    currency: string;
    status: 'prepared' | 'released' | 'blocked';
  }[],
): Promise<void> {
  const kol = await prisma.kol.create({
    data: { tenantId: tenant, canonicalHandle: `${handle}-${process.pid}` },
  });
  await prisma.deal.create({
    data: {
      tenantId: tenant,
      projectId: project,
      kolId: kol.id,
      termsJson: TERMS as unknown as Prisma.InputJsonValue,
      payouts: {
        create: payouts.map((p) => ({
          tenantId: tenant,
          payee: handle,
          amount: p.amount,
          currency: p.currency,
          basis: '夹具依据',
          status: p.status,
        })),
      },
    },
  });
}

async function makeThreadWithQuotes(
  tenant: string,
  project: string,
  handle: string,
  quotes: {
    amount: number;
    currency: string;
    status: 'proposed' | 'committed' | 'rejected';
  }[],
): Promise<void> {
  const kol = await prisma.kol.create({
    data: { tenantId: tenant, canonicalHandle: `${handle}-${process.pid}` },
  });
  await prisma.outreachThread.create({
    data: {
      tenantId: tenant,
      projectId: project,
      kolId: kol.id,
      quotes: {
        create: quotes.map((q) => ({
          tenantId: tenant,
          amount: q.amount,
          currency: q.currency,
          deliverablesJson: [] as unknown as Prisma.InputJsonValue,
          status: q.status,
        })),
      },
    },
  });
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4 snapshot 夹具租户' },
  });
  tenantId = t.id;
  const other = await prisma.tenant.create({
    data: { slug: OTHER_SLUG, name: 'M4 snapshot 他租户' },
  });
  otherTenantId = other.id;

  const mk = (name: string) =>
    prisma.project.create({ data: { tenantId, name } }).then((p) => p.id);
  projPayout = await mk('payout 分支');
  projQuote = await mk('quote 分支');
  projNone = await mk('空态');
  projNonUsd = await mk('非 USD only');

  // payout 分支：released USD 1400.50 + 600.25；prepared USD 999（不计）；
  // released EUR 500（不进 sum，登记 excluded）；committed quote 3000（有 payout 时不回落）
  await makeDealWithPayouts(tenantId, projPayout, 'PayoutKol', [
    { amount: 1400.5, currency: 'USD', status: 'released' },
    { amount: 600.25, currency: 'USD', status: 'released' },
    { amount: 999, currency: 'USD', status: 'prepared' },
    { amount: 500, currency: 'EUR', status: 'released' },
  ]);
  await makeThreadWithQuotes(tenantId, projPayout, 'PayoutKolQuote', [
    { amount: 3000, currency: 'USD', status: 'committed' },
  ]);

  // quote 分支：prepared payout（非 released，不构成 payout 源）；committed USD 800 + 450.75；proposed 9999（不计）
  await makeDealWithPayouts(tenantId, projQuote, 'QuoteKolDeal', [
    { amount: 777, currency: 'USD', status: 'prepared' },
  ]);
  await makeThreadWithQuotes(tenantId, projQuote, 'QuoteKol', [
    { amount: 800, currency: 'USD', status: 'committed' },
    { amount: 450.75, currency: 'USD', status: 'committed' },
    { amount: 9999, currency: 'USD', status: 'proposed' },
  ]);

  // 非 USD only：released JPY ×2（同币种合并计数）
  await makeDealWithPayouts(tenantId, projNonUsd, 'NonUsdKol', [
    { amount: 100000, currency: 'JPY', status: 'released' },
    { amount: 50000, currency: 'JPY', status: 'released' },
  ]);

  // 他租户：released USD payout（隔离断言：不得串入本租户任何聚合）
  const op = await prisma.project.create({
    data: { tenantId: otherTenantId, name: '他租户项目' },
  });
  await makeDealWithPayouts(otherTenantId, op.id, 'OtherTenantKol', [
    { amount: 123456, currency: 'USD', status: 'released' },
  ]);
});

afterAll(async () => {
  for (const tid of [tenantId, otherTenantId]) {
    await prisma.project.deleteMany({ where: { tenantId: tid } }); // cascade: deal/payout/thread/quote/snapshot
    await prisma.kol.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
});

describe('spendSource 三分支', () => {
  it('有 released payout → sum(USD released) + spendSource=payout；prepared/quote 不掺入', async () => {
    const facts = await loadProjectSpend(projPayout, { tenantId });
    expect(facts.spendSource).toBe('payout');
    expect(facts.spend).toBe(2000.75); // 1400.50 + 600.25，分整数累加无浮点漂移
    expect(facts.currency).toBe('USD');
    expect(facts.nonUsdExcluded).toEqual([
      { currency: 'EUR', count: 1, amount: 500 },
    ]);
  });

  it('无 released 有 committed quote → sum(USD committed) + spendSource=quote；proposed 不计', async () => {
    const facts = await loadProjectSpend(projQuote, { tenantId });
    expect(facts.spendSource).toBe('quote');
    expect(facts.spend).toBe(1250.75); // 800 + 450.75
    expect(facts.currency).toBe('USD');
    expect(facts.nonUsdExcluded).toEqual([]);
  });

  it('两者皆无 → spend=null + spendSource=none（空态诚实，不填 0）', async () => {
    const facts = await loadProjectSpend(projNone, { tenantId });
    expect(facts.spendSource).toBe('none');
    expect(facts.spend).toBeNull();
    expect(facts.currency).toBeNull();
    expect(facts.nonUsdExcluded).toEqual([]);
  });
});

describe('USD 口径与诚实降级', () => {
  it('全非 USD released → spend=null 但 spendSource=payout（有源无 USD 值 ≠ 无源）', async () => {
    const facts = await loadProjectSpend(projNonUsd, { tenantId });
    expect(facts.spendSource).toBe('payout'); // 源在场——与 projNone 的 'none' 可区分
    expect(facts.spend).toBeNull(); // 不换汇、不冒充 0
    expect(facts.currency).toBeNull();
    expect(facts.nonUsdExcluded).toEqual([
      { currency: 'JPY', count: 2, amount: 150000 },
    ]);
  });

  it('reach/conversions/roi 恒 null（M5 前无分子）', async () => {
    for (const pid of [projPayout, projQuote, projNone]) {
      const facts = await loadProjectSpend(pid, { tenantId });
      expect(facts.reach).toBeNull();
      expect(facts.conversions).toBeNull();
      expect(facts.roi).toBeNull();
    }
  });
});

describe('跨项目聚合（V12）', () => {
  it('按项目分组，各项目口径独立，且不串他租户数据', async () => {
    const all = await loadTenantProjectSpends({ tenantId });
    expect(all.map((f) => f.projectId).sort()).toEqual(
      [projPayout, projQuote, projNone, projNonUsd].sort(),
    );
    const byId = new Map(all.map((f) => [f.projectId, f]));
    expect(byId.get(projPayout)?.spend).toBe(2000.75);
    expect(byId.get(projQuote)?.spend).toBe(1250.75);
    expect(byId.get(projNone)?.spendSource).toBe('none');
    expect(byId.get(projNonUsd)?.spendSource).toBe('payout');
    // 他租户 released USD 123456 若串入，任何一行的 spend 都会被污染——总和断言兜底
    const total = all.reduce((s, f) => s + (f.spend ?? 0), 0);
    expect(total).toBe(2000.75 + 1250.75);
  });
});

describe('表写入口（最小实装）', () => {
  it('persistMetricSnapshot 落一行：spend/spendSource 同装配值，reach/conversions/roi 为 null', async () => {
    const { id, facts } = await persistMetricSnapshot(projPayout, { tenantId });
    const row = await prisma.metricSnapshot.findUniqueOrThrow({
      where: { id },
    });
    expect(row.projectId).toBe(projPayout);
    expect(row.spend?.toNumber()).toBe(2000.75);
    expect(row.spendSource).toBe('payout');
    expect(row.currency).toBe('USD');
    expect(row.reach).toBeNull();
    expect(row.conversions).toBeNull();
    expect(row.roi).toBeNull();
    expect(facts.spend).toBe(2000.75);
  });

  it('空态项目快照同样诚实：spend/currency/spendSource 落 null/none', async () => {
    const { id } = await persistMetricSnapshot(projNone, { tenantId });
    const row = await prisma.metricSnapshot.findUniqueOrThrow({
      where: { id },
    });
    expect(row.spend).toBeNull();
    expect(row.currency).toBeNull();
    expect(row.spendSource).toBe('none');
  });
});
