// M2-A-MATCH F005 — match 语法面展示串格式化单点（spec §2 F005）。
//
// 视图契约沿 mock/env-match.ts（已退役）的形状逐字保持：CompareMatrix / 待裁定表
// 消费的字段语义零变更（布局保护规则）——变的只是供给侧（mock 常量 → RSC 真数据）。
// 所有「数字 → 展示串」的口径都收敛在本文件，页面 / 组件不得内联重算（单点纪律）。
//
// 「待核」口径（裁决 #2）：唯一触发条件 = 字段缺失 / 契约层 null（PENDING_TEXT.verify）
// ——budgetUsd 恒 null（P6 无价格数据源）、reachTotal 全员 followers 缺失时 null。

import { z } from 'zod';
import { PENDING_TEXT } from 'lib/data/provenance';
import { parsePlanMetrics } from 'lib/data/schemas/match';

/* ------------------------------------------------------------------ *
 * 视图契约（原 mock/env-match.ts schema 逐字迁移，D2 序列化边界校验）
 * ------------------------------------------------------------------ */

export const matchPlanViewSchema = z.object({
  /** MatchPlan.id（「批准这组」approve API 的入参） */
  id: z.string(),
  /** 组合名（col-h 主行 + 批准 toast 点名） */
  name: z.string(),
  /** ★ Agent 推荐位：仅 1 组 best（= MatchPlan.recommended） */
  best: z.boolean(),
  /** 指标行 ×4（展示串：触达 / 预算 / 风险 / 规模） */
  reach: z.string(),
  cost: z.string(),
  risk: z.string(),
  people: z.string(),
  /** 🔒 minibars 6 根迷你柱档位（0-9；P5：组内 PlanKol top6 matchScore 归一） */
  bars: z.array(z.number().min(0).max(9)).length(6),
  /** 🔒 「依据」推荐理由段（= MatchPlan.rationale） */
  basis: z.string(),
});
export type MatchPlanView = z.infer<typeof matchPlanViewSchema>;

/** 矩阵固定 130px 行标 + 3 组合列（V5），schema 锁 3 组（沿 mock .length(3) 先例） */
export const matchPlanViewListSchema = z.array(matchPlanViewSchema).length(3);

export const matchCandidateViewSchema = z.object({
  /** MatchCandidate.id（F006 裁定写入口 verdict API 的入参） */
  id: z.string(),
  name: z.string(),
  /** who 副行：平台 · 粉丝（展示串） */
  plat: z.string(),
  /**
   * 受众匹配展示值二形态（🔒 裁决 #2）：null = scorePending（受众数据缺失降级）
   * → 「待核」（isPendingVerification 判定，低置信度不显裸分）；有值即显（'74%'）。
   */
  match: z.string().nullable(),
  /** 存疑原因（灰字，= MatchCandidate.doubts 拼接） */
  why: z.string(),
  /** 初判 pill 三态（高 gd / 中 wn / ? nu，不得合并；= MatchCandidate.preJudge） */
  fit: z.enum(['高', '中', '?']),
});
export type MatchCandidateView = z.infer<typeof matchCandidateViewSchema>;

export const matchCandidateViewListSchema = z.array(matchCandidateViewSchema);

/** RSC → MatchEnv 的 match 面数据（可序列化，campaigns/[id] 组装）。 */
export interface MatchSurfaceData {
  /** 现行轮组合（恒 0 或 3 条；0 = 未生成 / lazy 降级 → 空态占位） */
  plans: MatchPlanView[];
  /** 待裁定候选（verdict=pending 且有存疑原因，matchScore 降序） */
  candidates: MatchCandidateView[];
}

/* ------------------------------------------------------------------ *
 * 展示串格式化（单点）
 * ------------------------------------------------------------------ */

/** 万级串：2_400_000 → '240万'；<1 万显原值；null → 「待核」。 */
export function formatWan(n: number | null): string {
  if (n == null) return PENDING_TEXT.verify;
  if (n < 10_000) return `${n}`;
  return `${Math.round(n / 10_000)}万`;
}

/** 预算串：P6 无价格数据源恒 null → 「待核」（不编造成本数）。 */
export function formatBudgetUsd(n: number | null): string {
  if (n == null) return PENDING_TEXT.verify;
  return `$${n.toLocaleString('en-US')}`;
}

/** 风险分档 → 中文（低/中/高）；null → 「待核」。 */
export function formatRisk(risk: 'low' | 'mid' | 'high' | null): string {
  if (risk == null) return PENDING_TEXT.verify;
  return { low: '低', mid: '中', high: '高' }[risk];
}

/** 平台标签（mock plat 串语义：'YouTube · 42万'）。 */
const PLATFORM_LABEL: Record<string, string> = {
  youtube: 'YouTube',
  twitch: 'Twitch',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

export function formatPlat(
  platform: string | null,
  followers: number | null,
): string {
  const label = platform ? PLATFORM_LABEL[platform] ?? platform : '—';
  return `${label} · ${formatWan(followers)}`;
}

/**
 * 🔒 minibars 派生（P5）：组内 PlanKol top6 matchScore（0-1）归一到 0-9 档位；
 * 不足 6 人以 0 档补齐（空柱），保持原型 6 根结构。
 */
export function deriveBars(topScores: number[]): number[] {
  const bars = topScores
    .slice(0, 6)
    .map((s) => Math.max(0, Math.min(9, Math.round(s * 9))));
  while (bars.length < 6) bars.push(0);
  return bars;
}

/* ------------------------------------------------------------------ *
 * DB 行 → 视图（纯函数，surface-data.ts 组装层调用）
 * ------------------------------------------------------------------ */

/** toPlanView 入参（prisma 行的纯数据子集，便于单测不打库）。 */
export interface PlanRowLike {
  id: string;
  name: string;
  recommended: boolean;
  rationale: string;
  /** jsonb 原值（宽松降级 D2：脏数据 → 各指标「待核」） */
  metrics: unknown;
  /** 组内成员 matchScore 降序 top6（bars 派生源） */
  topScores: number[];
}

export function toPlanView(row: PlanRowLike): MatchPlanView {
  const metrics = parsePlanMetrics(row.metrics);
  return {
    id: row.id,
    name: row.name,
    best: row.recommended,
    reach: formatWan(metrics?.reachTotal ?? null),
    cost: formatBudgetUsd(metrics?.budgetUsd ?? null),
    risk: formatRisk(metrics?.risk ?? null),
    people: metrics != null ? `${metrics.people} 人` : PENDING_TEXT.verify,
    bars: deriveBars(row.topScores),
    basis: row.rationale,
  };
}

/** toCandidateView 入参（MatchCandidate + Kol 展示子集）。 */
export interface CandidateRowLike {
  /** MatchCandidate.id（F006 裁定入参） */
  id: string;
  displayName: string | null;
  platform: string | null;
  followers: number | null;
  matchScore: number | null;
  /** true = 受众数据缺失降级 → 「受众匹配」列显「待核」（裁决 #2） */
  scorePending: boolean;
  doubts: string[];
  preJudge: string;
}

export function toCandidateView(row: CandidateRowLike): MatchCandidateView {
  return {
    id: row.id,
    name: row.displayName ?? PENDING_TEXT.fill,
    plat: formatPlat(row.platform, row.followers),
    // 裁决 #2：scorePending / 分缺失 → null → 显示层「待核」，不显裸分
    match:
      row.scorePending || row.matchScore == null
        ? null
        : `${Math.round(row.matchScore * 100)}%`,
    why: row.doubts.join('；'),
    fit: row.preJudge === '高' || row.preJudge === '中' ? row.preJudge : '?',
  };
}
