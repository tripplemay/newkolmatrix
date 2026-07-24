// M4-INSIGHT F010 — V12 跨项目洞察页数据组装（RSC 侧；沿 F009 surface-data 同款分层）
//
// 数据源全为真值（mock/insight.ts 退役）：
// - KPI/表 = F004 跨项目 spend 真源聚合（loadTenantProjectSpends 按项目分组）
// - ROI 相关 = F002 roi.compute 产物——本批分子恒缺 → KPI/单元格显「证据不足」（P1 绝不填 0）；
//   ROI 走势 / 各项目 ROI 图无历史源 → null 占位（结构保留，M5 有真分子后填充）
// - retro 周报卡 = WeeklyReport(projectId=null) 跨项目周报真值（P10）
// 失败静默降级空态（CI 无库安全）。

import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { loadTenantProjectSpends } from 'lib/insight/metric-snapshot';
import { computeRoi } from 'lib/domain/roi-compute';
import {
  EMPTY_CROSS_INSIGHT,
  INSIGHT_INSUFFICIENT,
  type CrossInsightData,
  type CrossInsightKpi,
  type CrossInsightPortfolioRow,
} from 'lib/display/insight-format';

function usd(n: number): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * 装配核心（tenantId 显式传入——集成测试直测同一实现，F009 assembleInsightSurface 同款可测缝）。
 */
export async function assembleCrossInsight(
  tenantId: string,
): Promise<CrossInsightData> {
  const factsList = await loadTenantProjectSpends({ tenantId });
  const projects = await prisma.project.findMany({
    where: { tenantId },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  // 总花费 = 各项目 USD 口径之和；全无 → null（证据不足，不填 0）
  let totalSpend: number | null = null;
  for (const f of factsList) {
    if (f.spend != null) totalSpend = (totalSpend ?? 0) + f.spend;
  }

  const kpis: CrossInsightKpi[] = [
    // 触达/转化/综合 ROI：真回传源 M5——证据不足如实显示（P1），delta 无环比源恒 null
    {
      id: 'reach',
      name: '本季总触达',
      value: INSIGHT_INSUFFICIENT,
      delta: null,
    },
    {
      id: 'spend',
      name: '总花费',
      value: totalSpend == null ? INSIGHT_INSUFFICIENT : usd(totalSpend),
      delta: null, // 🔒 花费无 delta 形态保留（原型设计形态，接真后语义 = 无环比源）
    },
    { id: 'roi', name: '综合 ROI', value: INSIGHT_INSUFFICIENT, delta: null },
    {
      id: 'conversion',
      name: '有效转化',
      value: INSIGHT_INSUFFICIENT,
      delta: null,
    },
  ];

  const portfolio: CrossInsightPortfolioRow[] = factsList.map((f) => {
    // ROI 判定归 roi.compute（三处复用①）——本批分子恒缺 → roi=null → 中性「证据不足」
    const roi = computeRoi({
      spend: f.spend,
      reach: f.reach,
      conversions: f.conversions,
      actualExposure: null,
      targetExposure: null,
    });
    return {
      name: nameById.get(f.projectId) ?? f.projectId,
      spend: f.spend == null ? INSIGHT_INSUFFICIENT : usd(f.spend),
      reach: INSIGHT_INSUFFICIENT, // M5 回传源
      conv: INSIGHT_INSUFFICIENT, // M5 回传源
      roi: roi.roi == null ? INSIGHT_INSUFFICIENT : String(roi.roi),
      // 🔒 二色（good 绿 / low 琥珀）只对真值生效；null = 中性（证据不足不上色，不冒充判定）
      roiTone: null as CrossInsightPortfolioRow['roiTone'],
    };
  });

  // retro：最新跨项目周报草案（projectId=null，P10 跨项目态）
  const report = await prisma.weeklyReport.findFirst({
    where: { tenantId, projectId: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, draftContent: true, adopted: true },
  });

  return {
    kpis,
    // ROI 走势 / 各项目 ROI 图：无 ROI 历史与真值源（M5）——null 占位，结构保留不编数据
    roiTrend: null,
    projectRoi: null,
    portfolio,
    retro: report
      ? {
          reportId: report.id,
          body: report.draftContent,
          adopted: report.adopted,
        }
      : null,
  };
}

/** RSC 入口：dev tenant 解析 + 失败静默降级空态（CI 无库安全）。 */
export async function loadCrossInsightData(): Promise<CrossInsightData> {
  try {
    const tenantId = await getDevTenantId();
    return await assembleCrossInsight(tenantId);
  } catch (err) {
    console.error('[insight/cross-surface] 组装失败，降级空态:', err);
    return EMPTY_CROSS_INSIGHT;
  }
}
