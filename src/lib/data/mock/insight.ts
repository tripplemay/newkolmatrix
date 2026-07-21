// ARCH-M05 F015 — 洞察页（跨项目，ui-inventory V12）mock 数据。
// D2 渲染契约：页面经 lib/data/provenance.readContractSlot 读取本文件 raw 导出，
// 校验失败/缺失 → null → 占位渲染（绝不抛错/填 0）。数值与文案逐字对照原型
// docs/product/interaction-prototype-v2.html：KPI L865 / ROI_TREND L651 / ROI_BARS L652 /
// PORTFOLIO L645-650 / 周报草案 L876-877 / 分享闸门 harm 行 L1003（scope 按裁决 #3 调整）。

import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * KPI ×4（V12：花费无 delta 形态保留）
 * ------------------------------------------------------------------ */

export const insightKpiSchema = z.object({
  id: z.enum(['reach', 'spend', 'roi', 'conversion']),
  name: z.string(),
  value: z.string(),
  /** null = 该指标本无环比形态（原型「总花费」无 delta）——是设计形态，非数据缺失 */
  delta: z.string().nullable(),
});
export const insightKpiListSchema = z.array(insightKpiSchema).length(4);
export type InsightKpi = z.infer<typeof insightKpiSchema>;

export const mockInsightKpis: unknown = [
  { id: 'reach', name: '本季总触达', value: '24.6M', delta: '+14%' },
  { id: 'spend', name: '总花费', value: '$41.2k', delta: null },
  { id: 'roi', name: '综合 ROI', value: '3.8x', delta: '+0.1' },
  { id: 'conversion', name: '有效转化', value: '23.1k', delta: '+9%' },
];

/* ------------------------------------------------------------------ *
 * ROI 走势 chartcard（V12：LineAreaChart 8 点）
 * ------------------------------------------------------------------ */

export const roiTrendSchema = z.object({
  sub: z.string(),
  big: z.string(),
  /** 绿 badge 文案（趋势图标由页面渲染） */
  badge: z.string(),
  /** 8 点周序列（原型 ROI_TREND） */
  points: z.array(z.number()).length(8),
});
export type RoiTrend = z.infer<typeof roiTrendSchema>;

export const mockRoiTrend: unknown = {
  sub: '本季综合 ROI 走势（周）',
  big: '3.8x',
  badge: '+58%',
  points: [2.4, 2.6, 2.9, 3.1, 3.4, 3.5, 3.7, 3.8],
};

/* ------------------------------------------------------------------ *
 * 各项目 ROI chartcard（V12：🔒 badge 文字型 + BarChart 4 柱）
 * ------------------------------------------------------------------ */

export const projectRoiBarSchema = z.object({
  label: z.string(),
  value: z.number(),
  /** 主推柱（原型 hi：料理次元 brand 高亮，其余 brand-50 淡紫） */
  hi: z.boolean(),
});
export type ProjectRoiBar = z.infer<typeof projectRoiBarSchema>;

export const projectRoiSchema = z.object({
  sub: z.string(),
  big: z.string(),
  /** 🔒 badge 文字型「料理次元领先」——不得改成数字型（ui-inventory V12） */
  badge: z.string(),
  bars: z.array(projectRoiBarSchema).length(4),
});
export type ProjectRoi = z.infer<typeof projectRoiSchema>;

export const mockProjectRoi: unknown = {
  sub: '各项目 ROI（倍）',
  big: '4.6x',
  badge: '料理次元领先',
  bars: [
    { label: '料理次元', value: 4.6, hi: true },
    { label: '星轨协议', value: 3.1, hi: false },
    { label: '暗域拓荒', value: 2.8, hi: false },
    { label: '萌宠农场', value: 2.1, hi: false },
  ],
};

/* ------------------------------------------------------------------ *
 * 各项目 ROI 表（V12：DataTable 5 列，原型 PORTFOLIO 4 行）
 * ------------------------------------------------------------------ */

export const portfolioRowSchema = z.object({
  name: z.string(),
  spend: z.string(),
  reach: z.string(),
  conv: z.string(),
  roi: z.string(),
  /** 🔒 ROI 二色开关：true=绿（达标）/ false=琥珀（偏低）——低 ROI 是「偏低」不是「错误」，非红 */
  up: z.boolean(),
});
export const portfolioListSchema = z.array(portfolioRowSchema);
export type PortfolioRow = z.infer<typeof portfolioRowSchema>;

export const mockPortfolio: unknown = [
  { name: '星轨协议', spend: '$11.5k', reach: '194万', conv: '6.2k', roi: '3.1x', up: true },
  { name: '料理次元', spend: '$8.4k', reach: '268万', conv: '9.1k', roi: '4.6x', up: true },
  { name: '暗域拓荒', spend: '$6.9k', reach: '88万', conv: '2.4k', roi: '2.8x', up: true },
  { name: '萌宠农场', spend: '$7.2k', reach: '142万', conv: '5.4k', roi: '2.1x', up: false },
];

/* ------------------------------------------------------------------ *
 * retro 周报卡（V12：渐变淡紫 dlbl + 正文）
 * ------------------------------------------------------------------ */

export const weeklyDraftSchema = z.object({
  label: z.string(),
  body: z.string(),
});
export type WeeklyDraft = z.infer<typeof weeklyDraftSchema>;

export const mockWeeklyDraft: unknown = {
  label: '洞察 Agent · 本周周报草案',
  body: '本季综合 ROI 3.8x（环比 +0.1），4 个项目均正向。料理次元 4.6x 最高，建议追加预算；萌宠农场 2.1x 偏低，7 日留存弱、北美安卓归因缺失，暂不加投。',
};

/* ------------------------------------------------------------------ *
 * 🚪 对外分享闸门（scope=quarterly，裁决 #3）
 *
 * 与项目内 Insight 环节（F012，scope='project'，数据范围「仅汇总指标 · 不含联系方式」）
 * 区分：同一 create_share_link 工具、UI 传不同 scope，harm 行如实披露各自数据范围
 * （闸门如实披露原则，ADR-08）。本页 = 跨项目季度汇总。
 * ------------------------------------------------------------------ */

export const shareGateSchema = z.object({
  scope: z.literal('quarterly'),
  title: z.string(),
  body: z.string(),
  /** 🔒 harm 利害清单行（GateConfirm harmRows 直传） */
  harmRows: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
  /** 🔒 不可逆红标行 */
  irrev: z.string(),
  confirmText: z.string(),
  /** 确认后的 mock 反馈（D6 stub：真实 create_share_link 归 M4） */
  successToast: z.string(),
});
export type ShareGate = z.infer<typeof shareGateSchema>;

export const mockShareGate: unknown = {
  scope: 'quarterly',
  title: '确认对外分享',
  body: '生成对外分享链接，将暴露项目数据。',
  harmRows: [
    { label: '数据范围', value: '季度汇总指标 · 不含联系方式' },
    { label: '有效期', value: '14 天' },
  ],
  irrev: '对外 · 链接生成后数据可能被转发',
  confirmText: '生成链接',
  successToast: '分享链接已生成（mock）',
};
