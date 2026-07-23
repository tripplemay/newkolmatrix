// M2-B-CREATORS F002 — Kol 深字段契约位 zod（architecture §7.2.2 :826-838）。
//
// **:838 欠账兑现（FR-11.4「给分必给依据」）**：credibility.signals / brandSafety.flags
// 空依据的分数 = 应用层 refine 判非法——M2-A spec 明记归本批。
//
// 双形态（match.ts / knowledge.ts 先例）：
// - 读侧宽松 parse*：jsonb 脏数据 → null 不抛错（D2），页面按「待接入/待核」降级
// - 写侧严格 assert*：唯一写入点（F003 sync）把关，违规抛错不降级（半坏数据不入库）
//
// 本批数据源现实（spec §3 U1 复裁）：audienceDemo 仅 interests 有源（crawl 标签规则派生）
// ——分布三键（ageDist/genderDist/geoDist）无源可省（optional），schema 形状先立全量。
// brandSafety 本批无源不落库，契约先立：未来任何写入口（M5 数据管道）也必须过此门。

import { z } from 'zod';

// ───────────────────────── audienceDemo ─────────────────────────

/** 占比分布（键 → 0-100 占比；如 {"18-24": 42.5}）。 */
const distSchema = z.record(z.string(), z.number().min(0).max(100));

/**
 * `Kol.audienceDemo` 形状（§7.2.2：{ageDist, genderDist, geoDist, interests[]}）。
 * interests 写侧非空（评分层 extractInterests 只认非空 string[]——空数组等于没写）。
 */
export const audienceDemoSchema = z.object({
  ageDist: distSchema.nullish(),
  genderDist: distSchema.nullish(),
  geoDist: distSchema.nullish(),
  interests: z.array(z.string().min(1)).min(1),
});
export type AudienceDemo = z.infer<typeof audienceDemoSchema>;

/** 读侧宽松：脏数据 → null 不抛错（D2）。 */
export function parseAudienceDemo(raw: unknown): AudienceDemo | null {
  const r = audienceDemoSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** 写侧严格：唯一写入点（F003）把关，违规抛错。 */
export function assertAudienceDemo(value: AudienceDemo): AudienceDemo {
  return audienceDemoSchema.parse(value);
}

// ───────────────────────── credibility ─────────────────────────

/**
 * `Kol.credibility` 形状（§7.2.2：{score 0-100, method, signals[]（必带依据）, assessedAt}）。
 * refine：signals 空 = 非法（给分必给依据，FR-11.4）——zod .min(1) 即硬门，
 * 另加 refine 拒全空串（min(1) 管条数，refine 管内容非空皮）。
 */
export const credibilitySchema = z
  .object({
    score: z.number().min(0).max(100),
    method: z.string().min(1),
    signals: z.array(z.string().min(1)).min(1),
    /** ISO-8601（jsonb 存串，读写同形——project.ts 周期先例） */
    assessedAt: z.string().min(1),
  })
  .refine((v) => v.signals.some((s) => s.trim().length > 0), {
    message: '给分必给依据：signals 不得为空（FR-11.4）',
  });
export type Credibility = z.infer<typeof credibilitySchema>;

export function parseCredibility(raw: unknown): Credibility | null {
  const r = credibilitySchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function assertCredibility(value: Credibility): Credibility {
  return credibilitySchema.parse(value);
}

// ───────────────────────── brandSafety ─────────────────────────

/**
 * `Kol.brandSafety` 形状（§7.2.2：{rating safe/review/risk, flags[]（必带）, assessedAt}）。
 * 本批无源不落库（spec §6）；契约先立，未来写入口（M5）必须过此门。
 */
export const brandSafetySchema = z
  .object({
    rating: z.enum(['safe', 'review', 'risk']),
    flags: z.array(z.string().min(1)).min(1),
    assessedAt: z.string().min(1),
  })
  .refine((v) => v.flags.some((f) => f.trim().length > 0), {
    message: '给级必给依据：flags 不得为空（FR-11.4）',
  });
export type BrandSafety = z.infer<typeof brandSafetySchema>;

export function parseBrandSafety(raw: unknown): BrandSafety | null {
  const r = brandSafetySchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function assertBrandSafety(value: BrandSafety): BrandSafety {
  return brandSafetySchema.parse(value);
}
