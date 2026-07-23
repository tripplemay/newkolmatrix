// M2-B-CREATORS F002 — 深字段规则派生纯函数（U1 复裁：规则派生填充）。
//
// 【P9】派生规则透明可复算：无 LLM、权重/阈值常量导出可测（HEALTH_WEIGHTS 先例）。
// 纯函数：无 IO、不读时钟（assessedAt 由调用方注入——health.ts `now` 先例）。
//
// 诚实边界（D2）：
// - interests ← 创作者标签（matchedTags/matchedKeywords/businessCategory）——这是
//   **创作者侧标签的规则派生**，不是受众实测分布；fieldProvenance.detail 明示派生语义，
//   ProvenanceTag 如实标 crawl 派生。全空 → null 不编造。
// - credibility ← 弱信号规则合成（verified/qualityScore/tier/followers）；
//   signals 逐条人话依据（给分必给依据 FR-11.4）；弱信号全缺 → null 不编造。
// - brandSafety：本批无任何源，不派生不落库（spec §6）。

import type { ApifyKolRow } from 'lib/apify/schemas';
import {
  assertAudienceDemo,
  assertCredibility,
  type AudienceDemo,
  type Credibility,
} from 'lib/data/schemas/kol-deep';

// ───────────────────────── audienceDemo 派生 ─────────────────────────

/** interests 上限（去噪：上游 tags 可达数十条，取前 N 保留信息密度）。 */
export const INTERESTS_MAX = 12;

/** 标签归一：trim + lowercase 去重（保留首次出现的原始大小写形态展示）。
 *  导出供 F003 sync 复用（categories←matchedTags 同一归一口径）。 */
export function normalizeTags(
  sources: Array<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of sources) {
    if (typeof raw !== 'string') continue;
    const display = raw.trim();
    if (!display) continue;
    const key = display.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(display);
    if (out.length >= INTERESTS_MAX) break;
  }
  return out;
}

/**
 * audienceDemo 派生：interests ← matchedTags + matchedKeywords + businessCategory。
 * 全空 → null（不编造受众画像）；分布三键无源不写（schema optional）。
 */
export function deriveAudienceDemo(row: ApifyKolRow): AudienceDemo | null {
  const interests = normalizeTags([
    ...(row.matchedTags ?? []),
    ...(row.matchedKeywords ?? []),
    row.businessCategory,
  ]);
  if (interests.length === 0) return null;
  return assertAudienceDemo({ interests });
}

// ───────────────────────── credibility 派生 ─────────────────────────

/**
 * 弱信号权重（合计 = 1，配单测断言）。示意值，上线以真实数据校准——
 * 故必须是可单独引用的导出常量（HEALTH_WEIGHTS 先例）。
 */
export const CREDIBILITY_WEIGHTS = {
  /** 平台认证（verified === true → 满分） */
  verified: 0.35,
  /** 上游互动质量分（0-1 直通；YT 恒 null → 该因子缺席） */
  quality: 0.35,
  /** 上游热度分层（hot=1 / warm=0.6 / cold=0.2） */
  tier: 0.3,
} as const;

/** tier → 0-1 档位（上游枚举外取值按 cold 保守计）。 */
export const TIER_SCORE: Record<string, number> = {
  hot: 1,
  warm: 0.6,
  cold: 0.2,
};

export const CREDIBILITY_METHOD = 'rule-derived-from-crawl';

/**
 * credibility 派生：verified / qualityScore / tier 加权合成 0-100 分 + 逐条人话依据。
 *
 * 缺席因子**重新归一化**（与 health D15「缺席记 0」刻意不同——那边缺席=业务事实上的
 * 未达标，这边缺席=信号不可得，把不可得当 0 分会系统性冤枉 YT（qualityScore 恒 null））。
 * 三因子全缺 → null 不编造。
 */
export function deriveCredibility(
  row: ApifyKolRow,
  /** 评估时点（ISO-8601），调用方注入保持纯度 */
  assessedAt: string,
): Credibility | null {
  const parts: Array<{ weight: number; value: number; signal: string }> = [];

  if (typeof row.verified === 'boolean') {
    parts.push({
      weight: CREDIBILITY_WEIGHTS.verified,
      value: row.verified ? 1 : 0,
      signal: row.verified ? '平台认证 ✓' : '平台认证 ✗',
    });
  }
  if (typeof row.qualityScore === 'number') {
    const q = Math.max(0, Math.min(1, row.qualityScore));
    parts.push({
      weight: CREDIBILITY_WEIGHTS.quality,
      value: q,
      signal: `互动质量分 ${q.toFixed(2)}（采集侧实测）`,
    });
  }
  if (typeof row.tier === 'string' && row.tier.trim() !== '') {
    const t = TIER_SCORE[row.tier] ?? TIER_SCORE.cold;
    parts.push({
      weight: CREDIBILITY_WEIGHTS.tier,
      value: t,
      signal: `热度分层 ${row.tier}`,
    });
  }

  if (parts.length === 0) return null; // 弱信号全缺 → 不编造

  const weightSum = parts.reduce((s, p) => s + p.weight, 0);
  const raw = parts.reduce((s, p) => s + p.weight * p.value, 0) / weightSum;
  const score = Math.round(Math.max(0, Math.min(1, raw)) * 100);

  return assertCredibility({
    score,
    method: CREDIBILITY_METHOD,
    signals: parts.map((p) => p.signal),
    assessedAt,
  });
}

// ───────────────────────── fieldProvenance 派生 ─────────────────────────

/** 字段级溯源条目（provenance.ts fieldProvenanceEntrySchema 同形）。 */
interface ProvenanceEntry {
  source: 'crawl';
  fetchedAt: string;
  detail: string;
}

/**
 * fieldProvenance 派生：为实际写入的深字段逐字段标注出处（六档内 'crawl'，
 * detail 明示「规则派生」非实测——ProvenanceTag 展示层如实呈现）。
 * 未写入的字段不标注（读写不对称 §7.5.2：无值不渲染徽标）。
 */
export function deriveFieldProvenance(opts: {
  audienceDemo: AudienceDemo | null;
  credibility: Credibility | null;
  /** 上游行的抓取时间（lastScrapedAt；缺失时调用方传同步时点） */
  fetchedAt: string;
}): Record<string, ProvenanceEntry> {
  const out: Record<string, ProvenanceEntry> = {};
  if (opts.audienceDemo) {
    out.audienceDemo = {
      source: 'crawl',
      fetchedAt: opts.fetchedAt,
      detail: '由创作者标签规则派生（非受众实测分布）',
    };
  }
  if (opts.credibility) {
    out.credibility = {
      source: 'crawl',
      fetchedAt: opts.fetchedAt,
      detail: '由采集弱信号规则合成（verified/互动质量/热度分层）',
    };
  }
  return out;
}
