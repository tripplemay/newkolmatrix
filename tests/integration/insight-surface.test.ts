// M4-INSIGHT F009 — V8 对照账本数据组装集成测试（assembleInsightSurface，打真库）
//
// 覆盖 acceptance：
// - ROI/差异/方向 = roi.compute/compareGoal 真值（组装层不另判——与纯函数直算逐字相等）
// - 差异列 direction 三值 + null（数据缺）；分子无源 → 「证据不足」占位（绝不填 0）
// - 证据缺口 = attribution.gaps 真值渲染（缺什么显什么；payout 源在场时无 SPEND 缺口）
// - retro = WeeklyReport 项目级复盘真值（最新一条；无 → null 空态诚实）
// - channel/audience 本批恒 null（M5 回传源，结构保留占位不编数据）
// - 空态语义（项目未命中 → EMPTY；空项目 → 4 行诚实占位 + 三缺口）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { assembleInsightSurface } from '../../src/lib/insight/surface-data';
import { compareGoal } from '../../src/lib/domain/roi-compute';
import {
  ATTRIBUTION_GAP_LABEL,
  EMPTY_INSIGHT_SURFACE,
  INSIGHT_INSUFFICIENT,
} from '../../src/lib/display/insight-format';

const FIXTURE_SLUG = `test-tenant-m4-insight-surface-${process.pid}`;
const TARGET_EXPOSURE = 3_000_000;
const BUDGET = 3000;
const SPEND = 1200.5;

let tenantId: string;
let projFull: string; // goal + budget + released payout + 项目级周报草案
let projEmpty: string; // 什么都没有

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4 insight-surface 夹具租户' },
  });
  tenantId = t.id;

  const p1 = await prisma.project.create({
    data: {
      tenantId,
      name: '对照账本夹具项目',
      budgetTotal: BUDGET,
      currency: 'USD',
      goal: {
        targetExposure: TARGET_EXPOSURE,
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
      } as unknown as Prisma.InputJsonValue,
    },
  });
  projFull = p1.id;
  const p2 = await prisma.project.create({
    data: { tenantId, name: '空态项目' },
  });
  projEmpty = p2.id;

  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `surface-kol-${process.pid}` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId: projFull,
      kolId: kol.id,
      termsJson: { amount: SPEND } as unknown as Prisma.InputJsonValue,
      payouts: {
        create: [
          {
            tenantId,
            payee: 'SurfaceKol',
            amount: SPEND,
            currency: 'USD',
            basis: '夹具依据',
            status: 'released',
          },
        ],
      },
    },
  });

  // 两条项目级草案：retro 应取最新（createdAt desc）
  await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: projFull,
      period: '2030-W01',
      draftContent: '旧草案',
      createdAt: new Date('2030-01-01'),
    },
  });
  await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: projFull,
      period: '2030-W02',
      draftContent: '最新复盘草案正文',
      createdAt: new Date('2030-01-08'),
    },
  });
});

afterAll(async () => {
  await prisma.weeklyReport.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('对照表（真值 + 诚实降级）', () => {
  it('4 行结构：花费行 = spend 真源 + compareGoal 真值；无源行显「证据不足」', async () => {
    const s = await assembleInsightSurface(projFull, tenantId);
    expect(s.recon.map((r) => r.metric)).toEqual([
      '目标曝光',
      '花费 · 已放款',
      '有效转化',
      'ROI',
    ]);

    const [exposure, spend, conv, roi] = s.recon;
    // 目标曝光：目标在场、实际无源（M5）→ 证据不足 + 方向 null（无法判断 ≠ flat）
    expect(exposure.target).not.toBe('—');
    expect(exposure.actual).toBe(INSIGHT_INSUFFICIENT);
    expect(exposure.direction).toBeNull();

    // 花费：真源真值 + 三处复用（方向/差异与 compareGoal 直算逐字相等，组装层不另判）
    expect(spend.target).toBe('$3,000.00');
    expect(spend.actual).toBe('$1,200.50');
    const cmp = compareGoal(BUDGET, SPEND, { higherIsBetter: false });
    expect(spend.direction).toBe(cmp.direction);
    expect(cmp.direction).not.toBeNull(); // 两值齐备必可判——三值之一
    expect(spend.delta).toBe(
      `${Math.round(cmp.deltaRatio! * 100) >= 0 ? '+' : ''}${Math.round(
        cmp.deltaRatio! * 100,
      )}%`,
    );

    // 转化 / ROI：分子恒缺 → 证据不足（绝不填 0）
    expect(conv.actual).toBe(INSIGHT_INSUFFICIENT);
    expect(roi.actual).toBe(INSIGHT_INSUFFICIENT);
    expect(roi.direction).toBeNull();
  });

  it('空项目：4 行诚实占位（目标 —，实际证据不足），花费行无口径后缀', async () => {
    const s = await assembleInsightSurface(projEmpty, tenantId);
    expect(s.recon).toHaveLength(4);
    expect(s.recon[1].metric).toBe('花费'); // spendSource=none → 无口径后缀
    expect(s.recon[1].target).toBe('—');
    expect(s.recon[1].actual).toBe(INSIGHT_INSUFFICIENT);
    for (const row of s.recon) expect(row.direction).toBeNull();
  });
});

describe('证据缺口（attribution.gaps 真值渲染）', () => {
  it('payout 源在场 → 恰 reach/conversions 两缺口（缺什么显什么）', async () => {
    const s = await assembleInsightSurface(projFull, tenantId);
    expect(s.gaps).toEqual([
      ATTRIBUTION_GAP_LABEL.REACH_ABSENT,
      ATTRIBUTION_GAP_LABEL.CONVERSIONS_ABSENT,
    ]);
  });

  it('空项目 → 三缺口含 SPEND_ABSENT（不吞不虚报）', async () => {
    const s = await assembleInsightSurface(projEmpty, tenantId);
    expect(s.gaps).toContain(ATTRIBUTION_GAP_LABEL.SPEND_ABSENT);
    expect(s.gaps).toHaveLength(3);
  });
});

describe('retro 卡 + M5 图卡占位', () => {
  it('retro = 最新项目级草案真值；channel/audience 恒 null（结构保留占位）', async () => {
    const s = await assembleInsightSurface(projFull, tenantId);
    expect(s.retro?.body).toBe('最新复盘草案正文');
    expect(s.retro?.adopted).toBe(false);
    expect(s.channel).toBeNull();
    expect(s.audience).toBeNull();
  });

  it('无草案项目 → retro null（空态诚实，不编草案）', async () => {
    const s = await assembleInsightSurface(projEmpty, tenantId);
    expect(s.retro).toBeNull();
  });
});

describe('空态语义', () => {
  it('项目未命中 → EMPTY_INSIGHT_SURFACE（不抛错）', async () => {
    const s = await assembleInsightSurface('nonexistent', tenantId);
    expect(s).toEqual(EMPTY_INSIGHT_SURFACE);
  });
});
