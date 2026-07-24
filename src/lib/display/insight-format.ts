// M4-INSIGHT F009 — V8 洞察面（对照账本）可序列化视图契约（沿 delivery-format.ts 先例）。
//
// RSC 组装（lib/insight/surface-data.ts）→ client 组件（components/envs/insight）之间的
// 数据形状。全字段可序列化（server→client prop 硬要求）。
// 诚实语义（P1/P7）：分子缺 → 单元格显「证据不足」占位串，绝不填 0；
// 差异列 direction 三值（up/down/flat）+ null（无法判断）——渲染层三值三样式不得压二态。

import type { AttributionGapReason } from 'lib/domain/attribution-gaps';

/** 对照表行（V8 #1-#4 四列）。direction：up 绿 / down 红 / flat·null 中性（三值三样式）。 */
export interface InsightReconRow {
  metric: string;
  /** 原目标展示串（无目标 → '—'） */
  target: string;
  /** 实际展示串（无源 → INSIGHT_INSUFFICIENT 占位，D2 不填 0） */
  actual: string;
  /** 差异展示串（无法比较 → '—'） */
  delta: string;
  /** 达成方向（roi.compute/compareGoal 真值）；null = 数据缺，无法判断（≠flat） */
  direction: 'up' | 'down' | 'flat' | null;
}

/** retro 复盘草案卡数据（WeeklyReport 项目级复盘真值，P10 非空 projectId 态）。 */
export interface InsightRetro {
  reportId: string;
  body: string;
  adopted: boolean;
}

/** 受众段 tone（原 mock env-insight 契约延续；组件映射图色与 legend 色块）。 */
export type InsightAudienceTone = 'brand' | 'green' | 'orange' | 'blue';

/** 渠道 chartcard 视图（V8 #7-#10）。本批无真源恒 null（M5 平台回传接真），结构保留。 */
export interface InsightChannelChart {
  sub: string;
  big: string;
  badge: string;
  bars: { label: string; value: number; hi: boolean }[];
}

/** 受众构成视图（V8 #11-#14：donut + 🔒 中心叠加读数 + legend）。本批恒 null（M5）。 */
export interface InsightAudience {
  center: { value: string; label: string };
  segments: { tone: InsightAudienceTone; pct: number; label: string }[];
}

export interface InsightSurfaceData {
  recon: InsightReconRow[];
  /** 证据缺口人类可读行（attribution.gaps 真值渲染；空数组 = 无缺口） */
  gaps: string[];
  /** 渠道分布（M5 回传源接真前恒 null → 占位；不编数据不删区块） */
  channel: InsightChannelChart | null;
  /** 受众构成（M5，同上） */
  audience: InsightAudience | null;
  /** 最新项目级复盘草案；null = 尚无草案（空态诚实） */
  retro: InsightRetro | null;
}

/** 空态（D2 降级 / 项目未命中 / CI 无库）。 */
export const EMPTY_INSIGHT_SURFACE: InsightSurfaceData = {
  recon: [],
  gaps: [],
  channel: null,
  audience: null,
  retro: null,
};

/** 「证据不足”占位串（对照表单元 + 基线硬断言锚点共用；绝不用 0 冒充）。 */
export const INSIGHT_INSUFFICIENT = '证据不足';

/** 对照表空态文案（基线硬断言锚点：数据源整个消失时超时硬红，不静默拍空白）。 */
export const INSIGHT_RECON_EMPTY_TEXT =
  '还没有度量事实——放款或承诺报价后自动生成对照账本';

/** retro 空态文案（草案未生成时的诚实占位）。 */
export const INSIGHT_RETRO_EMPTY_TEXT =
  '暂无复盘草案——可在对话里让洞察 Agent 起草，或等待每周例程生成';

/* ------------------------------------------------------------------ *
 * V12 跨项目洞察页视图（M4 F010）
 * ------------------------------------------------------------------ */

/** KPI 卡（V12 #3 ×4；delta null = 无环比形态——原型「总花费」无 delta 是设计形态）。 */
export interface CrossInsightKpi {
  id: 'reach' | 'spend' | 'roi' | 'conversion';
  name: string;
  /** 展示值；无源 → INSIGHT_INSUFFICIENT（绝不填 0/编造） */
  value: string;
  delta: string | null;
}

/** 表 5 列行（V12 #7-#9）。roiTone：good 绿 / low 琥珀（🔒 二色非红）/ null 中性（证据不足）。 */
export interface CrossInsightPortfolioRow {
  name: string;
  spend: string;
  reach: string;
  conv: string;
  roi: string;
  roiTone: 'good' | 'low' | null;
}

/** ROI 走势 chartcard（V12 #4）。本批无 ROI 历史源恒 null（M5），结构保留。 */
export interface CrossInsightRoiTrend {
  sub: string;
  big: string;
  badge: string;
  points: number[];
}

/** 各项目 ROI chartcard（V12 #5，🔒 badge 文字型）。本批恒 null（M5）。 */
export interface CrossInsightProjectRoi {
  sub: string;
  big: string;
  badge: string;
  bars: { label: string; value: number; hi: boolean }[];
}

export interface CrossInsightData {
  kpis: CrossInsightKpi[];
  roiTrend: CrossInsightRoiTrend | null;
  projectRoi: CrossInsightProjectRoi | null;
  portfolio: CrossInsightPortfolioRow[];
  /** 最新跨项目周报草案（WeeklyReport projectId=null，P10）；null = 尚无（空态诚实） */
  retro: InsightRetro | null;
}

/** V12 空态（D2 降级 / CI 无库）。 */
export const EMPTY_CROSS_INSIGHT: CrossInsightData = {
  kpis: [],
  roiTrend: null,
  projectRoi: null,
  portfolio: [],
  retro: null,
};

/** V12 周报卡空态文案。 */
export const CROSS_RETRO_EMPTY_TEXT =
  '本周暂无周报草案——每周一由 weekly-draft 例程生成，也可在对话里让洞察 Agent 起草';

/**
 * 证据缺口原因码 → 人类可读行（V8 gaprow / 周报事实段共用——单一文案源，
 * weekly-report.ts 的草案缺口行也取自此表）。
 */
export const ATTRIBUTION_GAP_LABEL: Record<AttributionGapReason, string> = {
  REACH_ABSENT: '触达（reach）无回传源，本期无法计入',
  CONVERSIONS_ABSENT: '转化（conversions）无回传源，本期无法计入',
  SPEND_COMMITTED_ONLY: '花费为报价承诺额（尚未实际放款），非实际支出',
  SPEND_ABSENT: '花费无可核真源（无已放款项与承诺报价）',
};
