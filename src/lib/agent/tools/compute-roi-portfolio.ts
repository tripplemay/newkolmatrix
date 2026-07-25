// M4.5-AGENT-LOOP F003 — compute_roi_portfolio 工具（internal/native，只读跨项目对比）
//
// F-A「洞察深度追问」的数据面：把 compute_roi 的单项目对账扩到组合层，让洞察 Agent 能在
// 一次循环里「先看全局 → 再挑一个深挖」，而不是逼用户逐个项目问。
//
// **三处复用铁律②**（domain/roi-compute.ts / domain/attribution-gaps.ts 文件头 ①②③）：
// 本文件不内联重算任何金额聚合或 ROI 判定——
//   spend 真源 = `loadTenantProjectSpends`（F004 装配，批量一次读）
//   ROI 判定  = `computeRoi`（F002 纯函数）
//   证据缺口  = `attributionGaps`（F003 纯函数）
// 三者的产物原样组合成输出。页面、单项目工具、组合工具三处口径永远同一份实现。
//
// ── 诚实语义（P1 延续）──
// 分子（触达/转化/曝光）本期无回传源 → 每个项目的 roi 恒 null + basis=insufficient_evidence。
// 因此**跨项目 ROI 不可横向排名**，输出以 `summary.rankable=false` + 原因如实标注——
// 不按花费大小假装排出「谁的 ROI 更好」（那是最典型的强行归因）。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { parseProjectGoal } from 'lib/data/schemas/project';
import {
  loadTenantProjectSpends,
  type ProjectMetricFacts,
} from 'lib/insight/metric-snapshot';
import { computeRoi, type RoiComputeResult } from 'lib/domain/roi-compute';
import {
  attributionGaps,
  type AttributionGapsResult,
} from 'lib/domain/attribution-gaps';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  projectIds: z
    .array(z.string().min(1))
    .nullish()
    .describe('可选：只对比这些项目 id；留空 = 本租户全部项目'),
});

type ComputeRoiPortfolioInput = z.infer<typeof inputSchema>;

/** 组合中的一行（字段语义与 compute_roi 单项目输出一致，便于「先全局再深挖」无缝衔接）。 */
export interface PortfolioProjectRow {
  projectId: string;
  projectName: string;
  /** F004 装配事实（spend 真源 + 口径标注 + 非 USD 排除清单） */
  facts: ProjectMetricFacts;
  /** roi.compute 产物（分子缺 → roi=null + insufficient_evidence，透传不伪造） */
  roi: RoiComputeResult;
  /** attribution.gaps 产物（证据缺口逐条可分支） */
  gaps: AttributionGapsResult;
  /** Project.goal.targetExposure（未确认目标 → null） */
  targetExposure: number | null;
}

export interface PortfolioSummary {
  projectCount: number;
  /** 有 spend 真源的项目数（spendSource ≠ 'none'） */
  withSpend: number;
  /** spend 合计（USD 口径）；全无真源 → null（**不填 0**，缺失与零必须可区分） */
  totalSpend: number | null;
  /** ROI 真能算出来的项目数（本批分子恒缺 → 恒 0） */
  roiComputable: number;
  /** 是否可横向排名（需要至少 2 个项目的 ROI 都算得出来） */
  rankable: boolean;
  /** 不可排名的原因（rankable=true 时为 null）——如实说明，不留空让模型自行脑补 */
  notRankableReason: string | null;
}

export interface ComputeRoiPortfolioOutput {
  scope: 'all' | 'filtered';
  /** 请求过滤的 id 原样回显（未过滤 → null） */
  requestedProjectIds: string[] | null;
  /** 请求了但不属于本租户 / 不存在的 id——如实回报，不静默丢 */
  missingProjectIds: string[];
  projects: PortfolioProjectRow[];
  summary: PortfolioSummary;
}

/** 不可排名原因文案锚点（测试钉死；同时是给模型看的如实说明）。 */
export const PORTFOLIO_NOT_RANKABLE_MSG =
  'ROI 分子（触达/转化/曝光）本期无回传源，跨项目 ROI 算不出来——只能比花费口径，不能比效果。强行按花费排名等于编造归因。';

export async function computeRoiPortfolio(
  input: ComputeRoiPortfolioInput,
  ctx: ToolContext,
): Promise<ComputeRoiPortfolioOutput> {
  const db = ctx.db ?? prisma;

  // spend 真源：一次批量装配（不逐项目重查，也不在此重算金额）
  const allFacts = await loadTenantProjectSpends({
    tenantId: ctx.tenantId,
    db: ctx.db,
  });
  const factsById = new Map(allFacts.map((f) => [f.projectId, f]));

  const requested =
    input.projectIds && input.projectIds.length > 0 ? input.projectIds : null;
  const selectedIds = requested
    ? requested.filter((id) => factsById.has(id))
    : allFacts.map((f) => f.projectId);
  const missingProjectIds = requested
    ? requested.filter((id) => !factsById.has(id))
    : [];

  const metaRows = await db.project.findMany({
    where: { tenantId: ctx.tenantId, id: { in: selectedIds } },
    select: { id: true, name: true, goal: true },
  });
  const metaById = new Map(metaRows.map((p) => [p.id, p]));

  const projects: PortfolioProjectRow[] = selectedIds.map((id) => {
    const facts = factsById.get(id)!;
    const meta = metaById.get(id);
    const goal = parseProjectGoal(meta?.goal);
    return {
      projectId: id,
      projectName: meta?.name ?? '(项目已删除)',
      facts,
      roi: computeRoi({
        spend: facts.spend,
        reach: facts.reach,
        conversions: facts.conversions,
        actualExposure: null, // M5 前无真实曝光回传源（不猜）
        targetExposure: goal?.targetExposure ?? null,
      }),
      gaps: attributionGaps({
        spend: facts.spend,
        spendSource: facts.spendSource,
        currency: facts.currency,
        reach: facts.reach,
        conversions: facts.conversions,
      }),
      targetExposure: goal?.targetExposure ?? null,
    };
  });

  const spends = projects
    .map((p) => p.facts.spend)
    .filter((s): s is number => s != null);
  const roiComputable = projects.filter((p) => p.roi.roi != null).length;
  const rankable = roiComputable >= 2;

  return {
    scope: requested ? 'filtered' : 'all',
    requestedProjectIds: requested,
    missingProjectIds,
    projects,
    summary: {
      projectCount: projects.length,
      withSpend: projects.filter((p) => p.facts.spendSource !== 'none').length,
      totalSpend: spends.length ? spends.reduce((a, b) => a + b, 0) : null,
      roiComputable,
      rankable,
      notRankableReason: rankable ? null : PORTFOLIO_NOT_RANKABLE_MSG,
    },
  };
}

export const computeRoiPortfolioTool: ToolDefinition<
  ComputeRoiPortfolioInput,
  ComputeRoiPortfolioOutput
> = {
  name: 'compute_roi_portfolio',
  description:
    '跨项目 ROI 对比：一次拿到多个项目的 spend 真源口径 + ROI 判定 + 证据缺口清单，用于「先看全局再挑一个深挖」。' +
    '不填 projectIds = 本租户全部项目。分子无回传源时如实标注「证据不足」并说明为什么不能横向排名——绝不按花费假装排效果。只读，不改任何数据。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: computeRoiPortfolio,
};
