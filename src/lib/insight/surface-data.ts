// M4-INSIGHT F009 — V8 对照账本数据组装（RSC 侧；沿 M3-B loadDeliverySurfaceData 先例）
//
// 数据源全为真值（env-insight.ts mock 退役）：
// - 对照表 = F004 spend 真源装配 + F002 roi.compute/compareGoal 产物（三处复用铁律①：
//   页面显示的 ROI/差异/方向与 compute_roi 工具是同一纯函数判定，不在此另判）
// - 证据缺口 = F003 attribution.gaps 真值（诚实归因边界：缺什么显什么，不强行归因）
// - retro 卡 = WeeklyReport 项目级复盘草案真值（P10 非空 projectId 态）
// 诚实语义（P1）：分子无源 → 「证据不足」占位，绝不填 0；方向无法判断 → null（≠flat）。
// 失败静默降级空态（CI 无库安全，delivery/reach/match 先例同款）。

import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { parseProjectGoal } from 'lib/data/schemas/project';
import { loadProjectSpend } from 'lib/insight/metric-snapshot';
import { computeRoi, compareGoal } from 'lib/domain/roi-compute';
import { attributionGaps } from 'lib/domain/attribution-gaps';
import { formatExposure } from 'lib/display/project-format';
import {
  ATTRIBUTION_GAP_LABEL,
  EMPTY_INSIGHT_SURFACE,
  INSIGHT_INSUFFICIENT,
  type InsightReconRow,
  type InsightSurfaceData,
} from 'lib/display/insight-format';

/** 金额展示（USD 口径；null → 占位由调用行决定）。 */
function usd(n: number): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 差异比率 → ±% 串（无法比较 → '—'）。 */
function deltaText(ratio: number | null): string {
  if (ratio == null) return '—';
  const pct = Math.round(ratio * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

/**
 * 装配核心（tenantId 显式传入——集成测试直测同一实现，不复制映射逻辑）。
 * 项目未命中 → 空态；其余异常向上抛（由 loadInsightSurfaceData 统一降级）。
 */
export async function assembleInsightSurface(
  projectId: string,
  tenantId: string,
): Promise<InsightSurfaceData> {
  {
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true, goal: true, budgetTotal: true },
    });
    if (!project) return EMPTY_INSIGHT_SURFACE;

    const goal = parseProjectGoal(project.goal);
    const facts = await loadProjectSpend(project.id, { tenantId });
    const roi = computeRoi({
      spend: facts.spend,
      reach: facts.reach,
      conversions: facts.conversions,
      actualExposure: null, // M5 前无真实曝光回传源（不猜）
      targetExposure: goal?.targetExposure ?? null,
    });
    const gaps = attributionGaps({
      spend: facts.spend,
      spendSource: facts.spendSource,
      currency: facts.currency,
      reach: facts.reach,
      conversions: facts.conversions,
    });

    // 花费行：目标 = 项目预算（budgetTotal），实际 = spend 真源；
    // 极性 higherIsBetter=false（低于预算为正向）——判定归 compareGoal（F002），不在此另判
    const budget =
      project.budgetTotal == null ? null : Number(project.budgetTotal);
    const spendCmp = compareGoal(budget, facts.spend, {
      higherIsBetter: false,
    });

    const recon: InsightReconRow[] = [
      {
        metric: '目标曝光',
        target: goal ? formatExposure(goal.targetExposure) : '—',
        actual: INSIGHT_INSUFFICIENT, // 真实曝光回传源 M5（P1：不猜不填 0）
        delta: deltaText(roi.exposure.deltaRatio),
        direction: roi.exposure.direction,
      },
      {
        metric:
          facts.spendSource === 'payout'
            ? '花费 · 已放款'
            : facts.spendSource === 'quote'
            ? '花费 · 承诺额'
            : '花费',
        target: budget == null ? '—' : usd(budget),
        actual: facts.spend == null ? INSIGHT_INSUFFICIENT : usd(facts.spend),
        delta: deltaText(spendCmp.deltaRatio),
        direction: spendCmp.direction,
      },
      {
        metric: '有效转化',
        target: '—', // 转化目标无存处（M5 回传源接入后再立目标口径，不预测焊死）
        actual: INSIGHT_INSUFFICIENT,
        delta: '—',
        direction: null,
      },
      {
        metric: 'ROI',
        target: '—',
        actual: roi.roi == null ? INSIGHT_INSUFFICIENT : String(roi.roi), // 本批分子恒缺 → 恒「证据不足」
        delta: '—',
        direction: null,
      },
    ];

    // retro：最新项目级复盘草案（P10 非空 projectId 态；无 → null 空态诚实）
    const report = await prisma.weeklyReport.findFirst({
      where: { tenantId, projectId: project.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, draftContent: true, adopted: true },
    });

    return {
      recon,
      gaps: gaps.gaps.map((g) => ATTRIBUTION_GAP_LABEL[g.reason] ?? g.reason),
      // 渠道/受众数据源 = 平台回传（M5 入站）——本批无真源恒 null（占位，不编数据）
      channel: null,
      audience: null,
      retro: report
        ? {
            reportId: report.id,
            body: report.draftContent,
            adopted: report.adopted,
          }
        : null,
    };
  }
}

/** RSC 入口：dev tenant 解析 + 失败静默降级空态（CI 无库安全，delivery/reach/match 先例同款）。 */
export async function loadInsightSurfaceData(
  projectId: string,
): Promise<InsightSurfaceData> {
  try {
    const tenantId = await getDevTenantId();
    return await assembleInsightSurface(projectId, tenantId);
  } catch (err) {
    console.error('[insight/surface] 组装失败，降级空态:', err);
    return EMPTY_INSIGHT_SURFACE;
  }
}
