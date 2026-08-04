// M4-INSIGHT F009 — Evaluator 独立探针（不复用 Generator 断言措辞，打真库）
//
// 验收角度（features.json F009 acceptance）：
// E1 三值三样式**可达性**：up / down / flat 三方向必须都能由真实数据产生（若恒 null，
//    「不得压二态」就是死代码——只有三值真能出现，渲染层三分支才有意义）
// E2 组装层不另判：direction/delta 与独立调用 compareGoal/computeRoi 的产物逐字相等
// E3 诚实降级：任何单元格不得出现 0 / $0.00 冒充「没有数」；分子无源恒「证据不足」
// E4 证据缺口 = attributionGaps 真值（含 quote-only 弱证据码、非 USD 排除后的 SPEND_ABSENT）
// E5 retro = 最新项目级 WeeklyReport 真值（adopted 随库；无 → null）
// E6 M5 图卡恒 null（结构保留、数据不编）
// E7 空态/降级：项目未命中 → EMPTY；库不可达 → loadInsightSurfaceData 降级 EMPTY 不抛

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import {
  assembleInsightSurface,
  loadInsightSurfaceData,
} from '../../src/lib/insight/surface-data';
import { compareGoal, computeRoi } from '../../src/lib/domain/roi-compute';
import { attributionGaps } from '../../src/lib/domain/attribution-gaps';
import { loadProjectSpend } from '../../src/lib/insight/metric-snapshot';
import {
  ATTRIBUTION_GAP_LABEL,
  EMPTY_INSIGHT_SURFACE,
  INSIGHT_INSUFFICIENT,
} from '../../src/lib/display/insight-format';

const SLUG = `test-tenant-m4-f009-eval-${process.pid}`;

let tenantId: string;
const P: Record<string, string> = {};

/** 造一个「项目 + released payout」组合（金额/币种可控）。 */
async function makeProject(
  key: string,
  opts: {
    budget?: number | null;
    payout?: { amount: number; currency: string }[];
    quote?: { amount: number; currency: string };
    targetExposure?: number;
  },
): Promise<string> {
  const project = await prisma.project.create({
    data: {
      tenantId,
      name: `F009 探针 ${key}`,
      budgetTotal: opts.budget ?? null,
      currency: 'USD',
      goal:
        opts.targetExposure == null
          ? undefined
          : ({
              targetExposure: opts.targetExposure,
              periodStart: '2026-07-01',
              periodEnd: '2026-07-31',
            } as unknown as Prisma.InputJsonValue),
    },
  });
  P[key] = project.id;

  if (opts.payout?.length) {
    const kol = await prisma.kol.create({
      data: { tenantId, canonicalHandle: `f009-eval-${key}-${process.pid}` },
    });
    await prisma.deal.create({
      data: {
        tenantId,
        projectId: project.id,
        kolId: kol.id,
        termsJson: {} as unknown as Prisma.InputJsonValue,
        payouts: {
          create: opts.payout.map((p, i) => ({
            tenantId,
            payee: `probe-${key}-${i}`,
            amount: p.amount,
            currency: p.currency,
            basis: '探针夹具',
            status: 'released',
          })),
        },
      },
    });
  }
  if (opts.quote) {
    const kol = await prisma.kol.create({
      data: {
        tenantId,
        canonicalHandle: `f009-eval-q-${key}-${process.pid}`,
      },
    });
    const thread = await prisma.outreachThread.create({
      data: { tenantId, projectId: project.id, kolId: kol.id },
    });
    await prisma.quote.create({
      data: {
        tenantId,
        threadId: thread.id,
        amount: opts.quote.amount,
        currency: opts.quote.currency,
        status: 'committed',
        deliverablesJson: {} as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return project.id;
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: 'F009 evaluator 探针租户' },
  });
  tenantId = t.id;

  // E1 三方向可达性夹具（花费行极性 higherIsBetter=false：低于预算 = up）
  await makeProject('under', {
    budget: 3000,
    payout: [{ amount: 1200.5, currency: 'USD' }],
    targetExposure: 3_000_000,
  }); // 期望 direction=up
  await makeProject('over', {
    budget: 1000,
    payout: [{ amount: 1500, currency: 'USD' }],
  }); // 期望 direction=down
  await makeProject('exact', {
    budget: 1000,
    payout: [
      { amount: 600, currency: 'USD' },
      { amount: 400, currency: 'USD' },
    ],
  }); // 期望 direction=flat（两笔合计 = 预算）

  // E4 弱证据 / 非 USD 排除
  await makeProject('quoteOnly', {
    budget: 2000,
    quote: { amount: 800, currency: 'USD' },
  });
  await makeProject('nonUsd', {
    budget: 2000,
    payout: [{ amount: 5000, currency: 'CNY' }],
  });

  // E5 retro：两条草案 + 一条已采纳项目
  await makeProject('retro', { budget: 500 });
  await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: P.retro,
      period: '2031-W01',
      draftContent: '探针·旧草案',
      createdAt: new Date('2031-01-01'),
    },
  });
  await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: P.retro,
      period: '2031-W02',
      draftContent: '探针·最新草案',
      adopted: true,
      adoptedAt: new Date('2031-01-09'),
      createdAt: new Date('2031-01-08'),
    },
  });
  // 干扰项：跨项目周报（projectId=null）不得被 V8 取用
  await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: null,
      period: '2031-W03',
      draftContent: '探针·跨项目周报（V12 用，V8 不得取）',
      createdAt: new Date('2031-01-20'),
    },
  });
});

afterAll(async () => {
  await prisma.weeklyReport.deleteMany({ where: { tenantId } });
  await prisma.quote.deleteMany({ where: { tenantId } });
  await prisma.outreachThread.deleteMany({ where: { tenantId } });
  await prisma.payout.deleteMany({ where: { tenantId } });
  await prisma.deal.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('E1 三值三样式可达性（真实数据能产出 up / down / flat 三方向）', () => {
  it('低于预算 → up；超预算 → down；持平 → flat（三值全部可达，非死代码）', async () => {
    const under = await assembleInsightSurface(P.under, tenantId);
    const over = await assembleInsightSurface(P.over, tenantId);
    const exact = await assembleInsightSurface(P.exact, tenantId);

    const spendRow = (s: Awaited<ReturnType<typeof assembleInsightSurface>>) =>
      s.recon.find((r) => r.metric.startsWith('花费'))!;

    expect(spendRow(under).direction).toBe('up');
    expect(spendRow(over).direction).toBe('down');
    expect(spendRow(exact).direction).toBe('flat');

    // 差异串符号与方向一致（up = 低于预算 → 负号；down = 超预算 → 正号；flat → +0%）
    expect(spendRow(under).delta).toBe('-60%');
    expect(spendRow(over).delta).toBe('+50%');
    expect(spendRow(exact).delta).toBe('+0%');

    // 三方向互不相同（压二态时此断言必红）
    const dirs = new Set([
      spendRow(under).direction,
      spendRow(over).direction,
      spendRow(exact).direction,
    ]);
    expect(dirs.size).toBe(3);
  });
});

describe('E2 组装层不另判（与纯函数直算逐字相等）', () => {
  it('花费行 = compareGoal(budget, spend, higherIsBetter:false) 真值', async () => {
    for (const key of ['under', 'over', 'exact']) {
      const s = await assembleInsightSurface(P[key], tenantId);
      const facts = await loadProjectSpend(P[key], { tenantId });
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: P[key] },
        select: { budgetTotal: true },
      });
      const cmp = compareGoal(Number(project.budgetTotal), facts.spend, {
        higherIsBetter: false,
      });
      const row = s.recon.find((r) => r.metric.startsWith('花费'))!;
      expect(row.direction).toBe(cmp.direction);
      const pct = Math.round(cmp.deltaRatio! * 100);
      expect(row.delta).toBe(`${pct >= 0 ? '+' : ''}${pct}%`);
    }
  });

  it('曝光行 = computeRoi(...).exposure 真值；ROI 行 = computeRoi 真值（本批恒证据不足）', async () => {
    const s = await assembleInsightSurface(P.under, tenantId);
    const facts = await loadProjectSpend(P.under, { tenantId });
    const roi = computeRoi({
      spend: facts.spend,
      reach: facts.reach,
      conversions: facts.conversions,
      actualExposure: null,
      targetExposure: 3_000_000,
    });
    expect(roi.basis).toBe('insufficient_evidence');
    const exposure = s.recon[0];
    expect(exposure.metric).toBe('目标曝光');
    expect(exposure.direction).toBe(roi.exposure.direction); // 两值皆 null（缺实际曝光）
    expect(exposure.target).toBe('300 万');
    expect(exposure.actual).toBe(INSIGHT_INSUFFICIENT);
    const roiRow = s.recon.find((r) => r.metric === 'ROI')!;
    expect(roiRow.actual).toBe(INSIGHT_INSUFFICIENT);
    expect(roi.roi).toBeNull();
  });
});

describe('E3 诚实降级（绝不用 0 冒充没有数）', () => {
  it('全部单元格：无源处一律「证据不足」/「—」，不得出现 0 或 $0.00', async () => {
    for (const key of Object.keys(P)) {
      const s = await assembleInsightSurface(P[key], tenantId);
      for (const row of s.recon) {
        for (const cell of [row.target, row.actual, row.delta]) {
          expect(cell).not.toBe('0');
          expect(cell).not.toBe('$0.00');
          expect(cell).not.toBe('0%');
        }
      }
      // reach/conversions/ROI 三行本批恒无源
      expect(s.recon.find((r) => r.metric === '有效转化')!.actual).toBe(
        INSIGHT_INSUFFICIENT,
      );
      expect(s.recon.find((r) => r.metric === 'ROI')!.actual).toBe(
        INSIGHT_INSUFFICIENT,
      );
    }
  });

  it('非 USD 唯一真源 → 花费实际显「证据不足」而非换汇后的数字', async () => {
    const s = await assembleInsightSurface(P.nonUsd, tenantId);
    const row = s.recon.find((r) => r.metric.startsWith('花费'))!;
    expect(row.actual).toBe(INSIGHT_INSUFFICIENT);
    expect(row.metric).toBe('花费 · 已放款'); // 口径标注仍如实（有 payout 源）
  });

  it('spendSource 口径后缀如实（payout/quote/none 三分支各不相同）', async () => {
    const payout = await assembleInsightSurface(P.under, tenantId);
    const quote = await assembleInsightSurface(P.quoteOnly, tenantId);
    const none = await assembleInsightSurface(P.retro, tenantId);
    expect(payout.recon[1].metric).toBe('花费 · 已放款');
    expect(quote.recon[1].metric).toBe('花费 · 承诺额');
    expect(none.recon[1].metric).toBe('花费');
  });
});

describe('E4 证据缺口 = attributionGaps 真值', () => {
  it('逐项目：gaps 与独立重算的标签序列逐字相等', async () => {
    for (const key of Object.keys(P)) {
      const s = await assembleInsightSurface(P[key], tenantId);
      const facts = await loadProjectSpend(P[key], { tenantId });
      const expected = attributionGaps({
        spend: facts.spend,
        spendSource: facts.spendSource,
        currency: facts.currency,
        reach: facts.reach,
        conversions: facts.conversions,
      }).gaps.map((g) => ATTRIBUTION_GAP_LABEL[g.reason]);
      expect(s.gaps).toEqual(expected);
    }
  });

  it('quote-only → 弱证据码 SPEND_COMMITTED_ONLY（不与 SPEND_ABSENT 压成一码）', async () => {
    const s = await assembleInsightSurface(P.quoteOnly, tenantId);
    expect(s.gaps).toContain(ATTRIBUTION_GAP_LABEL.SPEND_COMMITTED_ONLY);
    expect(s.gaps).not.toContain(ATTRIBUTION_GAP_LABEL.SPEND_ABSENT);
  });

  it('非 USD payout → spend 无 USD 值 → SPEND_ABSENT（不吞缺口）', async () => {
    const s = await assembleInsightSurface(P.nonUsd, tenantId);
    expect(s.gaps).toContain(ATTRIBUTION_GAP_LABEL.SPEND_ABSENT);
    expect(s.gaps).toHaveLength(3);
  });

  it('payout USD 真源 → 恰两条（reach/conversions），缺口计数 = 卡片 eyebrow 数字来源', async () => {
    const s = await assembleInsightSurface(P.under, tenantId);
    expect(s.gaps).toEqual([
      ATTRIBUTION_GAP_LABEL.REACH_ABSENT,
      ATTRIBUTION_GAP_LABEL.CONVERSIONS_ABSENT,
    ]);
  });
});

describe('E5 retro = 项目级 WeeklyReport 真值', () => {
  it('取最新项目级草案 + adopted 随库；跨项目周报（projectId=null）不得串入 V8', async () => {
    const s = await assembleInsightSurface(P.retro, tenantId);
    expect(s.retro?.body).toBe('探针·最新草案');
    expect(s.retro?.adopted).toBe(true);
    expect(s.retro?.body).not.toContain('跨项目');
  });

  it('无草案项目 → retro=null（空态诚实，不编草案）', async () => {
    const s = await assembleInsightSurface(P.under, tenantId);
    expect(s.retro).toBeNull();
  });

  it('跨租户隔离：他租户同 id 项目查不到（tenantId 参与 where）', async () => {
    const s = await assembleInsightSurface(P.retro, 'tenant-not-mine');
    expect(s).toEqual(EMPTY_INSIGHT_SURFACE);
  });
});

describe('E6 M5 图卡占位（结构保留、数据不编）', () => {
  it('channel/audience 在任何夹具下恒 null', async () => {
    for (const key of Object.keys(P)) {
      const s = await assembleInsightSurface(P[key], tenantId);
      expect(s.channel).toBeNull();
      expect(s.audience).toBeNull();
    }
  });
});

describe('E7 空态与降级', () => {
  it('项目未命中 → EMPTY_INSIGHT_SURFACE（不抛错）', async () => {
    const s = await assembleInsightSurface('no-such-project', tenantId);
    expect(s).toEqual(EMPTY_INSIGHT_SURFACE);
  });

  it('loadInsightSurfaceData 对未知项目降级空态（RSC 入口不抛）', async () => {
    // M5-AUTH-RLS F004：租户改由调用方显式传入（RSC 在降级 try 之外解析会话）
    await expect(
      loadInsightSurfaceData('no-such-project', { tenantId }),
    ).resolves.toEqual(EMPTY_INSIGHT_SURFACE);
  });
});
