// M2-A-MATCH F002 — 可解释匹配评分纯函数（architecture :526/:841，公式落点 :841）。
//
// 匹配% = embedding 余弦相似度 + 受众契合的加权组合分；受众侧任一数据缺失
// → 降级纯向量分 + pending=true（FR-11.6，显示层「待核」，裁决 #2）。
//
// 模块形态按 D7：kebab-case 文件名 + 具名导出（health.ts 先例）。
// 纯函数：不读 DB、不打网关、无副作用——可被单测穷举。
//
// **三处复用铁律（architecture :533）：** 页面数据通道（F005 RSC 组装）/ 工具层
// （F007 evaluate_creator）/ 例程（F006 nightly-screen 经 F003 服务）共用本函数——
// 单一真相源，后续 feature 不得内联重算评分。

import type { AudienceSlice } from 'lib/data/schemas/knowledge';

/**
 * 两因子权重（合计必须为 1，配单测断言）。
 * 示意值，上线以真实数据校准——故必须是可单独引用的导出常量，不得散落成魔数
 * （HEALTH_WEIGHTS 先例）。
 */
export const MATCH_WEIGHTS = {
  /** 向量相似度（项目画像 × 创作者画像 cosine） */
  similarity: 0.7,
  /** 受众契合（KOL audienceDemo × 游戏知识库受众画像） */
  audience: 0.3,
} as const;

/** FR-11.6 降级 reason canonical 文案（DB doubts / 页面「待核」判定同源引用）。 */
export const REASON_AUDIENCE_PENDING = '受众数据待接入';

/** 知识侧缺失的降级 reason（游戏受众画像未解析时同样无从算契合）。 */
export const REASON_KNOWLEDGE_AUDIENCE_PENDING = '游戏受众画像待接入';

/**
 * `computeMatchScore` 入参契约。
 *
 * - `similarity`：pgvector cosine 相似度（0-1，调用方从 `1 - (embedding <=> query)` 算出）。
 *   embedding 缺失的候选**不该调本函数**（MatchCandidate.matchScore = null 的 P2 定案
 *   由调用方 F003 承担），故此处收 number 而非 number|null。
 * - `audienceDemo`：Kol 深字段契约位（jsonb）。zod 定型归 M2-B 深字段批——本批收 unknown，
 *   函数内宽松提取可用信号（interests[]），提不出即视为缺失降级（D2 取向）。
 * - `knowledgeAudience`：游戏知识库受众画像链头（getKnowledgeHeads(['audience']) 产物）。
 */
export interface MatchScoreInput {
  similarity: number;
  audienceDemo: unknown | null;
  knowledgeAudience: AudienceSlice[] | null;
}

/** `computeMatchScore` 返回：组合分 + 可解释依据（必非空）+ 降级标记。 */
export interface MatchScoreResult {
  /** 0-1 组合分 */
  score: number;
  /** 可解释依据（恒 ≥1 条：至少含向量相似度来源）——PlanKol.reasons 的上游 */
  reasons: string[];
  /** true = 受众侧数据缺失、降级纯向量分（DB scorePending / 显示「待核」的判据） */
  pending: boolean;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function formatPct(x: number): string {
  return `${Math.round(clamp01(x) * 100)}%`;
}

/**
 * 从 audienceDemo（unknown）宽松提取兴趣标签信号。
 * 契约位 zod 定型归 M2-B；本批只认 `{interests: string[]}` 形状的可用子集，
 * 提不出 → null（视为受众数据缺失，降级）。不抛错（D2）。
 */
function extractInterests(audienceDemo: unknown): string[] | null {
  if (audienceDemo == null || typeof audienceDemo !== 'object') return null;
  const interests = (audienceDemo as { interests?: unknown }).interests;
  if (!Array.isArray(interests)) return null;
  const clean = interests.filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  return clean.length > 0 ? clean : null;
}

/**
 * 受众契合度：知识库受众切片中「被 KOL 兴趣标签命中」的占比加权和 / 全切片占比和。
 * 命中 = 标签互为子串（大小写不敏感）——规则化可解释（P1），不引入 LLM 打分。
 */
function audienceFit(interests: string[], slices: AudienceSlice[]): number {
  const total = slices.reduce((s, x) => s + Math.max(0, x.percent), 0);
  if (total <= 0) return 0;
  const lowered = interests.map((i) => i.toLowerCase());
  const matched = slices.reduce((s, x) => {
    const label = x.label.toLowerCase();
    const hit = lowered.some((i) => label.includes(i) || i.includes(label));
    return hit ? s + Math.max(0, x.percent) : s;
  }, 0);
  return clamp01(matched / total);
}

/**
 * 计算可解释匹配分（architecture :841）。
 *
 * 降级语义（FR-11.6）：受众侧任一输入缺失（audienceDemo 提不出信号 / 知识受众画像空）
 * → score = 纯向量分 + pending=true + 对应 reason；**不编造受众契合**。
 * 两因子齐备 → 加权组合，受众 reason 注明来源（游戏知识库受众画像）。
 */
export function computeMatchScore(input: MatchScoreInput): MatchScoreResult {
  const similarity = clamp01(input.similarity);
  const reasons: string[] = [
    `向量相似度 ${formatPct(similarity)}（项目画像 × 创作者画像）`,
  ];

  const interests = extractInterests(input.audienceDemo);
  const slices =
    input.knowledgeAudience != null && input.knowledgeAudience.length > 0
      ? input.knowledgeAudience
      : null;

  const missing: string[] = [];
  if (interests == null) missing.push(REASON_AUDIENCE_PENDING);
  if (slices == null) missing.push(REASON_KNOWLEDGE_AUDIENCE_PENDING);

  if (missing.length > 0) {
    return {
      score: similarity,
      reasons: [...reasons, ...missing],
      pending: true,
    };
  }

  const fit = audienceFit(interests, slices);
  const score = clamp01(
    similarity * MATCH_WEIGHTS.similarity + fit * MATCH_WEIGHTS.audience,
  );
  return {
    score,
    reasons: [
      ...reasons,
      `受众契合 ${formatPct(fit)}（来源：游戏知识库受众画像）`,
    ],
    pending: false,
  };
}
