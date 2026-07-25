// [EVALUATOR 独立验收产物 · M4-INSIGHT F005] compute_roi 委派证明（非 Generator 测试）
//
// 目的：Generator 的 compute-roi-tool.test.ts 用「与纯函数直算逐字相等」证明复用——
// 该断言无法区分「真委派」与「工具层内联重算出恰好相同的数」。本文件用桩替换两纯函数：
// 若工具层内联重算，输出就不会等于桩返回的哨兵值 → 内联重算必翻红。
//
// 零 DB / 零网关：project 查询走注入的假 db（ctx.db），spend 装配走桩。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

// vi.mock 工厂被提升到文件顶部 → 哨兵与桩必须走 vi.hoisted 才能在工厂里可见
const H = vi.hoisted(() => {
  const facts = {
    projectId: 'p-eval',
    spend: 777.77,
    currency: 'USD',
    spendSource: 'payout' as const,
    nonUsdExcluded: [{ currency: 'JPY', count: 2, amount: 12345.5 }],
    reach: null as number | null,
    conversions: null as number | null,
    roi: null as number | null,
  };
  // 哨兵：结构上是合法产物形状，但数值/标记不可能由任何真算式产出
  const roi = {
    roi: -12345.5,
    basis: 'SENTINEL_BASIS_NOT_A_REAL_VALUE',
    spend: 777.77,
    exposure: {
      target: 111,
      actual: 222,
      delta: 333,
      deltaRatio: 4.44,
      direction: 'SENTINEL_DIR',
    },
  };
  const gaps = {
    gaps: [
      {
        metric: 'spend',
        reason: 'SENTINEL_REASON',
        committed: { amount: 9.99, currency: 'EUR' },
      },
    ],
    byMetric: {
      spend: null as unknown,
      reach: null as unknown,
      conversions: null as unknown,
    },
    complete: false,
  };
  return {
    facts,
    roi,
    gaps,
    loadSpy: vi.fn(async () => facts),
    roiSpy: vi.fn(() => roi),
    gapsSpy: vi.fn(() => gaps),
  };
});

const SENTINEL_FACTS = H.facts;
const SENTINEL_ROI = H.roi;
const SENTINEL_GAPS = H.gaps;
const loadSpy = H.loadSpy;
const roiSpy = H.roiSpy;
const gapsSpy = H.gapsSpy;

vi.mock('../../src/lib/insight/metric-snapshot', async (orig) => {
  const actual = await orig<
    typeof import('../../src/lib/insight/metric-snapshot')
  >();
  return { ...actual, loadProjectSpend: H.loadSpy };
});
vi.mock('../../src/lib/domain/roi-compute', async (orig) => {
  const actual = await orig<
    typeof import('../../src/lib/domain/roi-compute')
  >();
  return { ...actual, computeRoi: H.roiSpy };
});
vi.mock('../../src/lib/domain/attribution-gaps', async (orig) => {
  const actual = await orig<
    typeof import('../../src/lib/domain/attribution-gaps')
  >();
  return { ...actual, attributionGaps: H.gapsSpy };
});

import { executeTool } from '../../src/lib/agent/execute';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const TARGET = 4_200_000;

const fakeDb = {
  project: {
    findFirst: vi.fn(async () => ({
      id: 'p-eval',
      name: '委派证明项目',
      goal: {
        targetExposure: TARGET,
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
      },
    })),
  },
} as unknown as Prisma.TransactionClient;

const ctx: ToolContext = {
  tenantId: 'tenant-eval-f005',
  agentId: 'insight',
  projectId: null,
  env: 'default',
  db: fakeDb,
};

beforeEach(() => {
  loadSpy.mockClear();
  roiSpy.mockClear();
  gapsSpy.mockClear();
});

describe('F005 委派证明（桩替换两纯函数）', () => {
  it('输出 roi/gaps 逐字等于纯函数桩返回值 → 工具层未内联重算', async () => {
    const result = await executeTool(
      'compute_roi',
      { projectId: 'p-eval' },
      ctx,
    );
    const out = result.output as Record<string, unknown>;

    expect(roiSpy).toHaveBeenCalledTimes(1);
    expect(gapsSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(out.roi).toEqual(SENTINEL_ROI);
    expect(out.gaps).toEqual(SENTINEL_GAPS);
    expect(out.facts).toEqual(SENTINEL_FACTS);
  });

  it('入参接线：spend/reach/conversions 取装配事实，actualExposure 恒 null，targetExposure 取 Project.goal', async () => {
    await executeTool('compute_roi', { projectId: 'p-eval' }, ctx);

    expect(roiSpy).toHaveBeenCalledWith({
      spend: SENTINEL_FACTS.spend,
      reach: null,
      conversions: null,
      actualExposure: null,
      targetExposure: TARGET,
    });
    expect(gapsSpy).toHaveBeenCalledWith({
      spend: SENTINEL_FACTS.spend,
      spendSource: SENTINEL_FACTS.spendSource,
      currency: SENTINEL_FACTS.currency,
      reach: null,
      conversions: null,
    });
  });

  it('租户隔离：project 查询带 tenantId 条件（不跨租户读）', async () => {
    await executeTool('compute_roi', { projectId: 'p-eval' }, ctx);
    const call = (
      fakeDb.project.findFirst as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls.at(-1)?.[0] as { where?: Record<string, unknown> };
    expect(call?.where).toMatchObject({
      id: 'p-eval',
      tenantId: 'tenant-eval-f005',
    });
  });
});
