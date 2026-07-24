// M4-INSIGHT F010 — V12 跨项目洞察数据组装集成测试（assembleCrossInsight，打真库）
//
// 覆盖 acceptance：
// - 跨项目 ROI = F004 聚合真值（按项目分组；spend 真源；总花费 = USD 口径之和）
// - KPI ×4：花费真值 + 无 delta 形态；触达/ROI/转化无源 → 证据不足（绝不填 0）
// - 表 5 列：项目名真值 + spend 真值 + 证据不足单元；roiTone null（真值才上二色）
// - 周报卡 = WeeklyReport(projectId=null) 真值（最新；项目级复盘不得混入）；无则 null 空态诚实
// - ROI 走势 / 各项目 ROI 图：本批恒 null（M5 无历史源，结构保留占位）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { assembleCrossInsight } from '../../src/lib/insight/cross-surface-data';
import { INSIGHT_INSUFFICIENT } from '../../src/lib/display/insight-format';

const FIXTURE_SLUG = `test-tenant-m4-cross-${process.pid}`;

let tenantId: string;
let projA: string; // released USD 500
let projB: string; // 无金额源

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4 cross-surface 夹具租户' },
  });
  tenantId = t.id;
  const a = await prisma.project.create({
    data: { tenantId, name: '跨项目夹具A' },
  });
  projA = a.id;
  const b = await prisma.project.create({
    data: { tenantId, name: '跨项目夹具B' },
  });
  projB = b.id;

  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `cross-kol-${process.pid}` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId: projA,
      kolId: kol.id,
      termsJson: { amount: 500 } as unknown as Prisma.InputJsonValue,
      payouts: {
        create: [
          {
            tenantId,
            payee: 'CrossKol',
            amount: 500,
            currency: 'USD',
            basis: '夹具依据',
            status: 'released',
          },
        ],
      },
    },
  });

  // 跨项目周报（projectId=null，应入 retro）+ 项目级复盘（不得混入）
  await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: null,
      period: '2030-W20',
      draftContent: '跨项目周报草案正文',
    },
  });
  await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: projA,
      period: '2030-W20',
      draftContent: '项目级复盘（不应出现在 V12）',
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

describe('KPI ×4（诚实降级）', () => {
  it('总花费 = USD 真源之和 + delta null；触达/ROI/转化证据不足', async () => {
    const d = await assembleCrossInsight(tenantId);
    const byId = new Map(d.kpis.map((k) => [k.id, k]));
    expect(byId.get('spend')?.value).toBe('$500.00');
    expect(byId.get('spend')?.delta).toBeNull(); // 🔒 花费无 delta 形态
    for (const id of ['reach', 'roi', 'conversion'] as const) {
      expect(byId.get(id)?.value).toBe(INSIGHT_INSUFFICIENT);
      expect(byId.get(id)?.delta).toBeNull();
    }
  });
});

describe('表 5 列（按项目分组真值）', () => {
  it('项目名 + spend 真值/证据不足；roiTone null（真值才上二色）', async () => {
    const d = await assembleCrossInsight(tenantId);
    expect(d.portfolio.map((r) => r.name)).toEqual([
      '跨项目夹具A',
      '跨项目夹具B',
    ]);
    const [a, b] = d.portfolio;
    expect(a.spend).toBe('$500.00');
    expect(b.spend).toBe(INSIGHT_INSUFFICIENT);
    for (const row of d.portfolio) {
      expect(row.reach).toBe(INSIGHT_INSUFFICIENT);
      expect(row.conv).toBe(INSIGHT_INSUFFICIENT);
      expect(row.roi).toBe(INSIGHT_INSUFFICIENT);
      expect(row.roiTone).toBeNull();
    }
  });
});

describe('周报卡 + M5 图卡占位', () => {
  it('retro = 跨项目周报真值（项目级复盘不混入）；两图卡恒 null', async () => {
    const d = await assembleCrossInsight(tenantId);
    expect(d.retro?.body).toBe('跨项目周报草案正文');
    expect(d.retro?.adopted).toBe(false);
    expect(d.roiTrend).toBeNull();
    expect(d.projectRoi).toBeNull();
  });
});
