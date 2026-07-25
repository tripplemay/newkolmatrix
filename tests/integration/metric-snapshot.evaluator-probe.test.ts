// M4-INSIGHT F004 — Evaluator 独立探针（不复用 Generator 夹具，独立建租户/项目/金额行）。
//
// 目的：Generator 自带集成测（tests/integration/metric-snapshot.test.ts）覆盖了三分支 + 空态 + 隔离，
// 但存在几处「断言通过但未真正证伪」的空白，本文件补齐——每条探针都设计为在实现退化时必翻红：
//
// P1 精度：Generator 用 1400.50 + 600.25（二进制可精确表示，朴素浮点相加同样得 2000.75，
//          证不了「分整数累加」这一实现声明）。本探针用 0.10 + 0.20 + 0.30 ——
//          朴素浮点得 0.6000000000000001，只有真按分累加才得 0.6。
// P2 状态过滤完备性：Generator 只证了 prepared / proposed 不计。本探针补 blocked / rejected。
// P3 反向租户越权：Generator 证了「他租户数据不串入本租户」，未证反向
//          （拿他租户 tenantId 去读本租户项目 → 必须读不到）。
// P4 跨 Deal / 跨 Thread 聚合：单项目多 Deal、多 Thread 的求和。
// P5 同租户兄弟项目不互串（Generator 用总和兜底，未逐项目证「B 的钱不进 A」）。
// P6 loadTenantProjectSpends 排序契约（实现声明 createdAt 升序稳定；Generator 用 sort() 后比集合，
//          排序退化不会被发现）。
// P7 persistMetricSnapshot 的 tenantId 落列 + 显式 date 生效 + 可重复追加（快照语义非 upsert）。
//
// 只读产品代码，零外部副作用（纯本地 dev DB，夹具按 pid 隔离并在 afterAll 清理）。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import {
  loadProjectSpend,
  loadTenantProjectSpends,
  persistMetricSnapshot,
} from '../../src/lib/insight/metric-snapshot';

const SLUG_A = `test-tenant-m4-f004-probe-a-${process.pid}`;
const SLUG_B = `test-tenant-m4-f004-probe-b-${process.pid}`;

const TERMS = {
  amount: 1,
  currency: 'USD',
  deliverables: [] as string[],
  scope: null as string | null,
} as unknown as Prisma.InputJsonValue;

let tenantA = '';
let tenantB = '';

// tenantA 下的项目
let pCents = ''; // 三笔 released USD：0.10 / 0.20 / 0.30（精度探针）
let pBlocked = ''; // blocked payout + rejected quote + committed quote（状态过滤探针）
let pMultiDeal = ''; // 两个 Deal 各一笔 released USD + 两个 Thread 各一笔 committed（跨父行聚合）
let pSibling = ''; // 空项目，用于证兄弟项目的钱不串进来
let pB = ''; // tenantB 下的项目（反向越权探针）

let seq = 0;
async function newKol(tenantId: string): Promise<string> {
  seq += 1;
  const kol = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `f004probe-${process.pid}-${seq}`,
    },
  });
  return kol.id;
}

async function addPayouts(
  tenantId: string,
  projectId: string,
  rows: { amount: number; currency: string; status: 'prepared' | 'released' | 'blocked' }[],
): Promise<void> {
  const kolId = await newKol(tenantId);
  await prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId,
      termsJson: TERMS,
      payouts: {
        create: rows.map((r) => ({
          tenantId,
          payee: 'probe',
          amount: r.amount,
          currency: r.currency,
          basis: '探针依据',
          status: r.status,
        })),
      },
    },
  });
}

async function addQuotes(
  tenantId: string,
  projectId: string,
  rows: { amount: number; currency: string; status: 'proposed' | 'committed' | 'rejected' }[],
): Promise<void> {
  const kolId = await newKol(tenantId);
  await prisma.outreachThread.create({
    data: {
      tenantId,
      projectId,
      kolId,
      quotes: {
        create: rows.map((r) => ({
          tenantId,
          amount: r.amount,
          currency: r.currency,
          deliverablesJson: [] as unknown as Prisma.InputJsonValue,
          status: r.status,
        })),
      },
    },
  });
}

beforeAll(async () => {
  tenantA = (
    await prisma.tenant.create({
      data: { slug: SLUG_A, name: 'F004 探针租户 A' },
    })
  ).id;
  tenantB = (
    await prisma.tenant.create({
      data: { slug: SLUG_B, name: 'F004 探针租户 B' },
    })
  ).id;

  // 顺序建项目 —— P6 排序探针依赖 createdAt 的建表先后
  const mk = async (tenantId: string, name: string): Promise<string> =>
    (await prisma.project.create({ data: { tenantId, name } })).id;
  pCents = await mk(tenantA, '1-精度');
  pBlocked = await mk(tenantA, '2-状态过滤');
  pMultiDeal = await mk(tenantA, '3-跨父行聚合');
  pSibling = await mk(tenantA, '4-兄弟空项目');
  pB = await mk(tenantB, 'B-租户项目');

  // P1：朴素浮点 0.1+0.2+0.3 = 0.6000000000000001
  await addPayouts(tenantA, pCents, [
    { amount: 0.1, currency: 'USD', status: 'released' },
    { amount: 0.2, currency: 'USD', status: 'released' },
    { amount: 0.3, currency: 'USD', status: 'released' },
  ]);

  // P2：blocked 不构成 payout 源；rejected 不计入 quote 和
  await addPayouts(tenantA, pBlocked, [
    { amount: 5000, currency: 'USD', status: 'blocked' },
  ]);
  await addQuotes(tenantA, pBlocked, [
    { amount: 7000, currency: 'USD', status: 'rejected' },
    { amount: 120.4, currency: 'USD', status: 'committed' },
  ]);

  // P4：两个 Deal 各一笔 released（跨 Deal 求和）+ 两个 Thread 的 committed（有 payout 时恒不参与）
  await addPayouts(tenantA, pMultiDeal, [
    { amount: 10.05, currency: 'USD', status: 'released' },
  ]);
  await addPayouts(tenantA, pMultiDeal, [
    { amount: 20.07, currency: 'USD', status: 'released' },
  ]);
  await addQuotes(tenantA, pMultiDeal, [
    { amount: 999, currency: 'USD', status: 'committed' },
  ]);
  await addQuotes(tenantA, pMultiDeal, [
    { amount: 888, currency: 'USD', status: 'committed' },
  ]);

  // P3：tenantB 侧真金额（反向越权探针的诱饵）
  await addPayouts(tenantB, pB, [
    { amount: 654321, currency: 'USD', status: 'released' },
  ]);
});

afterAll(async () => {
  for (const tid of [tenantA, tenantB]) {
    if (!tid) continue;
    await prisma.project.deleteMany({ where: { tenantId: tid } });
    await prisma.kol.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
});

describe('P1 金额精度（分整数累加，非浮点串加）', () => {
  it('0.10 + 0.20 + 0.30 === 0.6（朴素浮点会得 0.6000000000000001）', async () => {
    const facts = await loadProjectSpend(pCents, { tenantId: tenantA });
    expect(facts.spendSource).toBe('payout');
    expect(facts.spend).toBe(0.6);
    // 反向自检：确认该组合确实能证伪朴素浮点实现
    expect(0.1 + 0.2 + 0.3).not.toBe(0.6);
  });
});

describe('P2 状态过滤完备性（Generator 未覆盖的 blocked / rejected）', () => {
  it('blocked payout 不构成 payout 源 → 回落 quote；rejected quote 不计入和', async () => {
    const facts = await loadProjectSpend(pBlocked, { tenantId: tenantA });
    expect(facts.spendSource).toBe('quote'); // blocked 未把源锁死在 payout
    expect(facts.spend).toBe(120.4); // 7000（rejected）未混入
  });
});

describe('P3 反向租户越权（拿 B 的 tenantId 读 A 的项目）', () => {
  it('他租户视角读本租户项目 → 空态事实，绝不泄露金额', async () => {
    const leak = await loadProjectSpend(pMultiDeal, { tenantId: tenantB });
    expect(leak.spend).toBeNull();
    expect(leak.spendSource).toBe('none');
    // 同一 projectId 在正确租户下是有值的 —— 证明上面的 null 来自租户过滤而非项目本身没数据
    const own = await loadProjectSpend(pMultiDeal, { tenantId: tenantA });
    expect(own.spend).toBe(30.12);
  });

  it('跨项目装配只返回本租户项目（B 的项目不出现在 A 的清单里）', async () => {
    const listA = await loadTenantProjectSpends({ tenantId: tenantA });
    expect(listA.map((f) => f.projectId)).not.toContain(pB);
    const listB = await loadTenantProjectSpends({ tenantId: tenantB });
    expect(listB.map((f) => f.projectId)).toEqual([pB]);
    expect(listB[0]?.spend).toBe(654321);
  });
});

describe('P4/P5 跨父行聚合与兄弟项目隔离', () => {
  it('单项目跨多个 Deal 求和；有 released payout 时多个 Thread 的 committed 全不参与', async () => {
    const facts = await loadProjectSpend(pMultiDeal, { tenantId: tenantA });
    expect(facts.spendSource).toBe('payout');
    expect(facts.spend).toBe(30.12); // 10.05 + 20.07，999/888 未混入
  });

  it('同租户兄弟项目的金额不串入空项目', async () => {
    const facts = await loadProjectSpend(pSibling, { tenantId: tenantA });
    expect(facts.spendSource).toBe('none');
    expect(facts.spend).toBeNull();
    expect(facts.currency).toBeNull();
  });
});

describe('P6 跨项目装配的排序契约（createdAt 升序）', () => {
  it('返回顺序 = 项目创建先后，且逐项目口径互不干扰', async () => {
    const list = await loadTenantProjectSpends({ tenantId: tenantA });
    expect(list.map((f) => f.projectId)).toEqual([
      pCents,
      pBlocked,
      pMultiDeal,
      pSibling,
    ]);
    expect(list.map((f) => f.spendSource)).toEqual([
      'payout',
      'quote',
      'payout',
      'none',
    ]);
    expect(list.map((f) => f.spend)).toEqual([0.6, 120.4, 30.12, null]);
    // reach/conversions/roi 在跨项目路径同样恒 null
    for (const f of list) {
      expect(f.reach).toBeNull();
      expect(f.conversions).toBeNull();
      expect(f.roi).toBeNull();
    }
  });
});

describe('P7 表写入口语义', () => {
  it('tenantId 落列、显式 date 生效、重复调用追加两行（快照语义非 upsert）', async () => {
    const at = new Date('2026-07-01T00:00:00.000Z');
    const first = await persistMetricSnapshot(pCents, { tenantId: tenantA }, at);
    const second = await persistMetricSnapshot(pCents, { tenantId: tenantA });
    expect(first.id).not.toBe(second.id);

    const rows = await prisma.metricSnapshot.findMany({
      where: { projectId: pCents },
      orderBy: { date: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.tenantId === tenantA)).toBe(true);
    expect(rows[0]?.date.toISOString()).toBe(at.toISOString());
    expect(rows[0]?.spend?.toNumber()).toBe(0.6);
    expect(rows[0]?.spendSource).toBe('payout');
    expect(rows.every((r) => r.reach === null && r.conversions === null && r.roi === null)).toBe(
      true,
    );
  });
});
