// M4.5-AGENT-LOOP F003 — compute_roi_portfolio 工具 + 洞察归因追问条款集成测试
//
// 覆盖 acceptance：
// - 注册且挂 insight 人格（同源断言）；class=internal 无 buildHarm（直调不产生 PendingAction）
// - 输出 = 既有装配 + 两纯函数产物组合（与直算逐字相等 + 源码 grep 证不内联重算）
// - 每项目含 roi（分子缺 → insufficient_evidence 诚实透传）+ gaps + spend 口径
// - 输出 JSON 往返无损
// - 输入契约：可选 projectIds 过滤 / 空 = 全项目 / 不存在的 id 如实回报不静默丢
// - insight systemPrompt 含归因追问条款（文案锚点钉死）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import {
  INSIGHT_ATTRIBUTION_CLAUSE,
  listPersonas,
} from '../../src/lib/agent/registry';
import { computeRoi } from '../../src/lib/domain/roi-compute';
import { attributionGaps } from '../../src/lib/domain/attribution-gaps';
import { loadTenantProjectSpends } from '../../src/lib/insight/metric-snapshot';
import {
  PORTFOLIO_NOT_RANKABLE_MSG,
  type ComputeRoiPortfolioOutput,
} from '../../src/lib/agent/tools/compute-roi-portfolio';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m45-portfolio-${process.pid}`;
const TARGET_EXPOSURE = 1_200_000;

let tenantId: string;
let projPaid: string; // 有 released payout（spendSource=payout）
let projEmpty: string; // 无任何金额（spendSource=none）
let ctx: ToolContext;

async function run(
  input: Record<string, unknown>,
): Promise<ComputeRoiPortfolioOutput> {
  const r = await executeTool('compute_roi_portfolio', input, ctx);
  return r.output as ComputeRoiPortfolioOutput;
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4.5 组合对比夹具租户' },
  });
  tenantId = t.id;
  ctx = { tenantId, agentId: 'insight', projectId: null, env: 'default' };

  const a = await prisma.project.create({
    data: {
      tenantId,
      name: '有花费项目',
      goal: {
        targetExposure: TARGET_EXPOSURE,
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
      } as unknown as Prisma.InputJsonValue,
    },
  });
  projPaid = a.id;
  const b = await prisma.project.create({
    data: { tenantId, name: '零花费项目' },
  });
  projEmpty = b.id;

  // spend 真源：released USD payout（经 Deal 归属项目）——与 compute_roi 夹具同款路径
  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `portfolio-kol-${process.pid}` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId: projPaid,
      kolId: kol.id,
      termsJson: { amount: 880 } as unknown as Prisma.InputJsonValue,
      payouts: {
        create: [
          {
            tenantId,
            payee: 'PortfolioKol',
            amount: 880,
            currency: 'USD',
            basis: '夹具依据',
            status: 'released',
          },
        ],
      },
    },
  });
});

afterAll(async () => {
  await prisma.payout.deleteMany({ where: { tenantId } });
  await prisma.deal.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与人格绑定（同源断言）', () => {
  it('注册在 native 工具表，class=internal 且无 buildHarm', () => {
    expect(getNativeToolNames()).toContain('compute_roi_portfolio');
    const def = getTool('compute_roi_portfolio')!;
    expect(def.class).toBe('internal');
    expect(def.buildHarm).toBeUndefined();
    expect(def.source).toBe('native');
  });

  it('挂 insight 人格，且不出现在其他人格子集里', () => {
    for (const p of listPersonas()) {
      const has = p.tools.includes('compute_roi_portfolio');
      expect(has, `persona=${p.id}`).toBe(p.id === 'insight');
    }
  });

  it('internal 直调不产生 PendingAction（不过闸门）', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    await run({});
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before,
    );
  });
});

describe('输出 = 既有装配 + 纯函数产物组合（不内联重算）', () => {
  it('每个项目的 facts/roi/gaps 与直算逐字相等', async () => {
    const out = await run({});
    const expectedFacts = await loadTenantProjectSpends({ tenantId });
    const byId = new Map(expectedFacts.map((f) => [f.projectId, f]));

    expect(out.projects.length).toBe(expectedFacts.length);
    for (const row of out.projects) {
      const facts = byId.get(row.projectId)!;
      expect(row.facts).toEqual(facts);
      expect(row.roi).toEqual(
        computeRoi({
          spend: facts.spend,
          reach: facts.reach,
          conversions: facts.conversions,
          actualExposure: null,
          targetExposure: row.targetExposure,
        }),
      );
      expect(row.gaps).toEqual(
        attributionGaps({
          spend: facts.spend,
          spendSource: facts.spendSource,
          currency: facts.currency,
          reach: facts.reach,
          conversions: facts.conversions,
        }),
      );
    }
  });

  it('源码 grep 证：复用共享实现，无自建金额聚合', () => {
    const src = readFileSync(
      'src/lib/agent/tools/compute-roi-portfolio.ts',
      'utf8',
    );
    expect(src).toContain('loadTenantProjectSpends');
    expect(src).toContain('computeRoi(');
    expect(src).toContain('attributionGaps(');
    // 自建聚合的特征（自己查 payout/quote 或自己做 Decimal 换算）一律不得出现
    expect(src).not.toMatch(/prisma\.payout|\.payout\.findMany|\.aggregate\(/);
    expect(src).not.toContain('Decimal');
  });
});

describe('诚实透传：分子缺 → 证据不足，且不可横向排名', () => {
  it('有花费项目也算不出 ROI（basis=insufficient_evidence，roi=null）', async () => {
    const out = await run({});
    const paid = out.projects.find((p) => p.projectId === projPaid)!;
    expect(paid.facts.spend).toBe(880);
    expect(paid.facts.spendSource).toBe('payout');
    expect(paid.roi.roi).toBeNull();
    expect(paid.roi.basis).toBe('insufficient_evidence');
    expect(paid.gaps.gaps.length).toBeGreaterThan(0);
    expect(paid.targetExposure).toBe(TARGET_EXPOSURE);
  });

  it('零花费项目 spend=null（不填 0），口径标 none', async () => {
    const out = await run({});
    const empty = out.projects.find((p) => p.projectId === projEmpty)!;
    expect(empty.facts.spend).toBeNull();
    expect(empty.facts.spendSource).toBe('none');
    expect(empty.facts.currency).toBeNull();
  });

  it('summary：rankable=false + 原因如实说明（不按花费假装排效果）', async () => {
    const out = await run({});
    expect(out.summary.projectCount).toBe(2);
    expect(out.summary.withSpend).toBe(1);
    expect(out.summary.totalSpend).toBe(880);
    expect(out.summary.roiComputable).toBe(0);
    expect(out.summary.rankable).toBe(false);
    expect(out.summary.notRankableReason).toBe(PORTFOLIO_NOT_RANKABLE_MSG);
    expect(out.summary.notRankableReason).toContain('强行');
  });
});

describe('输入契约', () => {
  it('空入参 = 全项目（scope=all）', async () => {
    const out = await run({});
    expect(out.scope).toBe('all');
    expect(out.requestedProjectIds).toBeNull();
    expect(out.projects.map((p) => p.projectId).sort()).toEqual(
      [projPaid, projEmpty].sort(),
    );
  });

  it('projectIds 过滤生效（scope=filtered，按请求序）', async () => {
    const out = await run({ projectIds: [projEmpty, projPaid] });
    expect(out.scope).toBe('filtered');
    expect(out.projects.map((p) => p.projectId)).toEqual([projEmpty, projPaid]);
    expect(out.missingProjectIds).toEqual([]);
  });

  it('不存在 / 跨租户的 id 如实回报，不静默丢', async () => {
    const out = await run({ projectIds: [projPaid, 'no-such-project'] });
    expect(out.projects.map((p) => p.projectId)).toEqual([projPaid]);
    expect(out.missingProjectIds).toEqual(['no-such-project']);
  });

  it('坏入参被拒（projectIds 元素须为非空串）', async () => {
    await expect(run({ projectIds: [''] })).rejects.toThrow(/入参校验失败/);
  });

  it('输出 JSON 往返无损（供画布渲染）', async () => {
    const out = await run({});
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});

describe('洞察归因追问条款（F-A 指引面）', () => {
  it('条款三要素在 insight systemPrompt 中（文案锚点钉死）', () => {
    const insight = listPersonas().find((p) => p.id === 'insight')!;
    expect(insight.systemPrompt).toContain('归因追问纪律');
    expect(insight.systemPrompt).toContain('证据不足就说证据不足');
    expect(insight.systemPrompt).toContain('不强行归因');
    expect(insight.systemPrompt).toContain('凑一个数');
    expect(insight.systemPrompt).toContain(INSIGHT_ATTRIBUTION_CLAUSE);
  });

  it('该条款只挂洞察，不污染其他人格（人格专属）', () => {
    for (const p of listPersonas()) {
      const has = p.systemPrompt.includes('归因追问纪律');
      expect(has, `persona=${p.id}`).toBe(p.id === 'insight');
    }
  });
});
