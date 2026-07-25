// M4-INSIGHT F010 — Evaluator 独立探针（跨项目洞察装配层，打真库）。
//
// 与 Generator 的 insight-cross-surface.test.ts 断言角度**不复用**：本探针
// ① 用「独立重算」核对聚合值（不抄实现常量，自行从 Payout/Quote 行重算 USD 口径）
// ② 覆盖 quote 回落 / 非 USD 排除 / 多行累加 / 无源四种真源分支的跨项目组合
// ③ 零冒充扫描（任何单元格不得出现 0 / $0.00 / 0%）
// ④ retro 取数：跨项目态过滤 + 最新一条 + 租户隔离 + adopted 事实态透传
// ⑤ 采纳链路（服务层）：置 adopted + 幂等 + 越租户拒绝
// ⑥ 降级：不存在的租户不抛错（RSC 兜底语义）
//
// 只读产品代码，不修改；夹具租户按 pid 隔离并在 afterAll 清理。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { assembleCrossInsight } from '../../src/lib/insight/cross-surface-data';
import { adoptWeeklyReport } from '../../src/lib/insight/weekly-report';
import { INSIGHT_INSUFFICIENT } from '../../src/lib/display/insight-format';

const SLUG = `test-tenant-m4f010-eval-${process.pid}`;
const SLUG_OTHER = `test-tenant-m4f010-other-${process.pid}`;

let tenantId: string;
let otherTenantId: string;
const proj: Record<string, string> = {};
let crossReportOldId = '';
let crossReportNewId = '';
let projectReportId = '';

async function mkProject(name: string): Promise<string> {
  const p = await prisma.project.create({ data: { tenantId, name } });
  proj[name] = p.id;
  return p.id;
}

async function mkPayout(
  projectId: string,
  amount: number,
  currency: string,
  status: 'released' | 'prepared',
): Promise<void> {
  const kol = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `f010-eval-${process.pid}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: kol.id,
      termsJson: { amount } as unknown as Prisma.InputJsonValue,
      payouts: {
        create: [
          {
            tenantId,
            payee: 'EvalPayee',
            amount,
            currency,
            basis: 'evaluator 夹具',
            status,
          },
        ],
      },
    },
  });
}

async function mkQuote(
  projectId: string,
  amount: number,
  currency: string,
  status: 'committed' | 'proposed',
): Promise<void> {
  const kol = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `f010-evalq-${process.pid}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    },
  });
  const th = await prisma.outreachThread.create({
    data: { tenantId, projectId, kolId: kol.id },
  });
  await prisma.quote.create({
    data: {
      tenantId,
      threadId: th.id,
      amount,
      currency,
      deliverablesJson: [] as unknown as Prisma.InputJsonValue,
      status,
      gateLogId: status === 'committed' ? 'eval-fixture-gate' : null,
    },
  });
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: 'F010 evaluator 夹具' },
  });
  tenantId = t.id;
  const t2 = await prisma.tenant.create({
    data: { slug: SLUG_OTHER, name: 'F010 evaluator 邻租户' },
  });
  otherTenantId = t2.id;

  // P-payout：两行 released USD（多行累加 + 分级精度）+ 一行 prepared（不得计入）
  const pPayout = await mkProject('E10-payout多行');
  await mkPayout(pPayout, 500.5, 'USD', 'released');
  await mkPayout(pPayout, 249.75, 'USD', 'released');
  await mkPayout(pPayout, 9999, 'USD', 'prepared'); // 未放款，不得计入

  // P-quote：无 released，committed quote 回落（proposed 不得计入）
  const pQuote = await mkProject('E10-quote回落');
  await mkQuote(pQuote, 300, 'USD', 'committed');
  await mkQuote(pQuote, 777, 'USD', 'proposed');

  // P-eur：唯一真源为非 USD（不换汇 → spend null，但不得写 0）
  const pEur = await mkProject('E10-非USD');
  await mkPayout(pEur, 888, 'EUR', 'released');

  // P-none：无任何金额源
  await mkProject('E10-无源');

  // 周报：跨项目两条（取最新）+ 项目级一条（不得混入）+ 邻租户一条（不得越租户）
  const older = await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: null,
      period: '2031-W01',
      draftContent: '旧跨项目草案（不应展示）',
      createdAt: new Date('2031-01-05T00:00:00Z'),
    },
  });
  crossReportOldId = older.id;
  const newer = await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: null,
      period: '2031-W02',
      draftContent: '最新跨项目草案 · evaluator 锚点',
      createdAt: new Date('2031-01-12T00:00:00Z'),
    },
  });
  crossReportNewId = newer.id;
  const projReport = await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: proj['E10-payout多行'],
      period: '2031-W02',
      draftContent: '项目级复盘（V8 专用，V12 不得展示）',
      createdAt: new Date('2031-01-20T00:00:00Z'), // 比跨项目那条更新——若漏过滤必被抓
    },
  });
  projectReportId = projReport.id;
  await prisma.weeklyReport.create({
    data: {
      tenantId: otherTenantId,
      projectId: null,
      period: '2031-W02',
      draftContent: '邻租户跨项目草案（越租户即泄漏）',
      createdAt: new Date('2031-02-01T00:00:00Z'),
    },
  });
});

afterAll(async () => {
  for (const tid of [tenantId, otherTenantId]) {
    await prisma.weeklyReport.deleteMany({ where: { tenantId: tid } });
    await prisma.quote.deleteMany({ where: { tenantId: tid } });
    await prisma.outreachThread.deleteMany({ where: { tenantId: tid } });
    await prisma.payout.deleteMany({ where: { tenantId: tid } });
    await prisma.deal.deleteMany({ where: { tenantId: tid } });
    await prisma.project.deleteMany({ where: { tenantId: tid } });
    await prisma.kol.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
});

/** 独立重算：直接从库行按 USD 口径重算每项目 spend（不引用被测实现） */
async function recomputeSpend(projectId: string): Promise<number | null> {
  const payouts = await prisma.payout.findMany({
    where: { tenantId, status: 'released', deal: { projectId } },
    select: { amount: true, currency: true },
  });
  const quotes = await prisma.quote.findMany({
    where: { tenantId, status: 'committed', thread: { projectId } },
    select: { amount: true, currency: true },
  });
  const rows = payouts.length > 0 ? payouts : quotes;
  const usd = rows.filter((r) => r.currency === 'USD');
  if (usd.length === 0) return null;
  return (
    usd.reduce((acc, r) => acc + Math.round(r.amount.toNumber() * 100), 0) / 100
  );
}

describe('E1 跨项目聚合 = 独立重算真值（不抄实现）', () => {
  it('每行 spend 与自行重算逐项目相等；prepared/proposed 不计入', async () => {
    const d = await assembleCrossInsight(tenantId);
    const byName = new Map(d.portfolio.map((r) => [r.name, r]));
    for (const [name, pid] of Object.entries(proj)) {
      const expected = await recomputeSpend(pid);
      const cell = byName.get(name)!.spend;
      if (expected == null) {
        expect(cell).toBe(INSIGHT_INSUFFICIENT);
      } else {
        expect(cell).toBe(
          `$${expected.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
        );
      }
    }
    // 750.25 = 500.50 + 249.75（9999 prepared 被排除，否则数值必不符）
    expect(byName.get('E10-payout多行')!.spend).toBe('$750.25');
    // quote 回落只取 committed（777 proposed 被排除）
    expect(byName.get('E10-quote回落')!.spend).toBe('$300.00');
  });

  it('KPI 总花费 = 各项目 USD 之和（跨项目求和口径）', async () => {
    const d = await assembleCrossInsight(tenantId);
    let sum = 0;
    for (const pid of Object.values(proj)) {
      const v = await recomputeSpend(pid);
      if (v != null) sum += v;
    }
    const spendKpi = d.kpis.find((k) => k.id === 'spend')!;
    expect(sum).toBeCloseTo(1050.25, 2);
    expect(spendKpi.value).toBe('$1,050.25');
    expect(spendKpi.delta).toBeNull(); // 🔒 花费 KPI 无 delta 形态
  });
});

describe('E2 诚实降级：非 USD / 无源不得被 0 冒充', () => {
  it('非 USD 唯一真源 → 证据不足（不是 $0.00 / 不是 $888）', async () => {
    const d = await assembleCrossInsight(tenantId);
    const row = d.portfolio.find((r) => r.name === 'E10-非USD')!;
    expect(row.spend).toBe(INSIGHT_INSUFFICIENT);
    expect(row.spend).not.toContain('888');
  });

  it('全表零冒充扫描：无任何 0 / $0.00 / 0% 单元', async () => {
    const d = await assembleCrossInsight(tenantId);
    const cells = [
      ...d.kpis.map((k) => k.value),
      ...d.portfolio.flatMap((r) => [r.spend, r.reach, r.conv, r.roi]),
    ];
    for (const c of cells) {
      expect(c).not.toBe('0');
      expect(c).not.toBe('$0.00');
      expect(c).not.toBe('0%');
      expect(c).not.toBe('0.0');
    }
  });

  it('reach/转化/ROI 三列恒证据不足 + roiTone 中性（真值才上二色）', async () => {
    const d = await assembleCrossInsight(tenantId);
    for (const r of d.portfolio) {
      expect(r.reach).toBe(INSIGHT_INSUFFICIENT);
      expect(r.conv).toBe(INSIGHT_INSUFFICIENT);
      expect(r.roi).toBe(INSIGHT_INSUFFICIENT);
      expect(r.roiTone).toBeNull();
    }
    for (const id of ['reach', 'roi', 'conversion'] as const) {
      expect(d.kpis.find((k) => k.id === id)!.value).toBe(INSIGHT_INSUFFICIENT);
    }
  });
});

describe('E3 表结构：真项目行 + 顺序 + 图卡占位', () => {
  it('行数 = 租户项目数，名称取 Project.name 真值，createdAt 升序', async () => {
    const d = await assembleCrossInsight(tenantId);
    const dbProjects = await prisma.project.findMany({
      where: { tenantId },
      select: { name: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(d.portfolio.map((r) => r.name)).toEqual(dbProjects.map((p) => p.name));
    expect(d.portfolio).toHaveLength(4);
  });

  it('KPI 恰 4 张、id 集合固定；ROI 走势/各项目 ROI 两图恒 null（M5 占位）', async () => {
    const d = await assembleCrossInsight(tenantId);
    expect(d.kpis.map((k) => k.id)).toEqual([
      'reach',
      'spend',
      'roi',
      'conversion',
    ]);
    expect(d.roiTrend).toBeNull();
    expect(d.projectRoi).toBeNull();
  });
});

describe('E4 retro：跨项目态过滤 + 最新 + 租户隔离', () => {
  it('取 projectId=null 的最新一条；项目级复盘（更新）不得顶替', async () => {
    const d = await assembleCrossInsight(tenantId);
    expect(d.retro?.reportId).toBe(crossReportNewId);
    expect(d.retro?.body).toBe('最新跨项目草案 · evaluator 锚点');
    expect(d.retro?.reportId).not.toBe(projectReportId);
    expect(d.retro?.body).not.toContain('项目级复盘');
    expect(d.retro?.body).not.toContain('旧跨项目草案');
  });

  it('邻租户草案不得越租户展示', async () => {
    const d = await assembleCrossInsight(tenantId);
    expect(d.retro?.body).not.toContain('邻租户');
    const other = await assembleCrossInsight(otherTenantId);
    expect(other.retro?.body).toBe('邻租户跨项目草案（越租户即泄漏）');
    expect(other.portfolio).toHaveLength(0);
  });

  it('adopted 事实态透传（false → 采纳钮；true → 已采纳）', async () => {
    const before = await assembleCrossInsight(tenantId);
    expect(before.retro?.adopted).toBe(false);
    await adoptWeeklyReport(crossReportNewId, { tenantId });
    const after = await assembleCrossInsight(tenantId);
    expect(after.retro?.adopted).toBe(true);
    // 复原（后续用例依赖 false 态）
    await prisma.weeklyReport.update({
      where: { id: crossReportNewId },
      data: { adopted: false, adoptedAt: null },
    });
  });
});

describe('E5 采纳链路（internal 服务层）', () => {
  it('置 adopted=true + adoptedAt；重复采纳幂等且 adoptedAt 不被改写', async () => {
    const r1 = await adoptWeeklyReport(crossReportOldId, { tenantId });
    expect(r1.adopted).toBe(true);
    expect(r1.alreadyAdopted).toBe(false);
    const row1 = await prisma.weeklyReport.findUnique({
      where: { id: crossReportOldId },
      select: { adopted: true, adoptedAt: true },
    });
    expect(row1?.adopted).toBe(true);
    expect(row1?.adoptedAt).not.toBeNull();

    const r2 = await adoptWeeklyReport(crossReportOldId, { tenantId });
    expect(r2.alreadyAdopted).toBe(true);
    expect(r2.adoptedAt.toISOString()).toBe(row1!.adoptedAt!.toISOString());
  });

  it('越租户采纳被拒（邻租户 id 不可采纳本租户报告）', async () => {
    await expect(
      adoptWeeklyReport(crossReportNewId, { tenantId: otherTenantId }),
    ).rejects.toThrow(/不存在/);
    const row = await prisma.weeklyReport.findUnique({
      where: { id: crossReportNewId },
      select: { adopted: true },
    });
    expect(row?.adopted).toBe(false); // 未被越权改写
  });
});

describe('E6 空态 / 降级语义', () => {
  it('无项目无周报的租户 → 空表 + retro null + KPI 仍诚实（不抛错）', async () => {
    const empty = await prisma.tenant.create({
      data: { slug: `${SLUG}-empty`, name: 'F010 空租户' },
    });
    try {
      const d = await assembleCrossInsight(empty.id);
      expect(d.portfolio).toEqual([]);
      expect(d.retro).toBeNull();
      expect(d.kpis.find((k) => k.id === 'spend')?.value).toBe(
        INSIGHT_INSUFFICIENT,
      );
    } finally {
      await prisma.tenant.delete({ where: { id: empty.id } });
    }
  });

  it('不存在的租户 id → 空态而非异常（RSC 兜底前提）', async () => {
    const d = await assembleCrossInsight('tenant-does-not-exist-f010');
    expect(d.portfolio).toEqual([]);
    expect(d.retro).toBeNull();
  });
});
