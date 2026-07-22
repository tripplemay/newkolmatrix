// M2-A-MATCH F001 — 匹配平面的 jsonb / 数组列 zod 契约（architecture §5.2 :464-466）。
//
// 两类校验对象：
// 1. `MatchPlan.metrics` jsonb 列 + `MatchCandidate.doubts` 数组——读侧宽松降级：
//    脏数据 → null 不抛错（D2，与 parseProjectGoal / parseKnowledgeStructured 同一取向）；
// 2. `PlanKol.reasons`——写侧严格校验：可解释依据必带，空则非法
//    （沿 FR-11.9 assertSourceMaterialIds 先例，应用层把关 DB 层管不住的非空语义）。

import { z } from 'zod';

/** 与 Prisma enum MatchPlanStatus 逐字一致（状态机流转逻辑落 F003/F004，D20 变异测试）。 */
export const matchPlanStatusSchema = z.enum(['draft', 'approved', 'superseded']);
export type MatchPlanStatusValue = z.infer<typeof matchPlanStatusSchema>;

/** 与 Prisma enum CandidateVerdict 逐字一致（人工裁定写入口归 P8 后续批）。 */
export const candidateVerdictSchema = z.enum(['pending', 'kept', 'dropped']);
export type CandidateVerdictValue = z.infer<typeof candidateVerdictSchema>;

// ───────────────────────── MatchPlan.metrics（jsonb，读侧宽松）─────────────────────────

/**
 * `MatchPlan.metrics` 形状。
 * - reachTotal：Σfollowers 真值；组员全员 followers 缺失时 null（不编造）
 * - budgetUsd：P6 无价格数据源恒 null（显示层「待核」，归 M2-B/M3 CRM）
 * - risk：由 doubts 占比分档；不可判时 null
 * - people：组员数量（恒可数，非负整数）
 */
export const planMetricsSchema = z.object({
  reachTotal: z.number().nonnegative().nullable(),
  budgetUsd: z.number().nonnegative().nullable(),
  risk: z.enum(['low', 'mid', 'high']).nullable(),
  people: z.number().int().nonnegative(),
});
export type PlanMetrics = z.infer<typeof planMetricsSchema>;

/**
 * 从 jsonb 列宽松读取 metrics：形状不合法 → null，不抛错（D2）。
 * 页面拿到 null 时按「待核」占位降级，绝不让脏数据打死渲染。
 */
export function parsePlanMetrics(raw: unknown): PlanMetrics | null {
  const r = planMetricsSchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ───────────────────────── MatchCandidate.doubts（读侧宽松）─────────────────────────

/** doubts：规则化存疑原因清单（F003 生成）。 */
export const doubtsSchema = z.array(z.string());

/**
 * 宽松读取 doubts：形状不合法 → null，不抛错（D2）。
 * DB 列是 String[] 正常路径恒合法；此函数把关序列化边界（RSC prop / 工具出参）。
 */
export function parseDoubts(raw: unknown): string[] | null {
  const r = doubtsSchema.safeParse(raw);
  return r.success ? r.data : null;
}

// ───────────────────────── PlanKol.reasons（写侧严格，FR-11.9 先例）─────────────────────────

/**
 * reasons：可解释依据必带，空则非法。
 * DB 层 String[] 无非空约束（Prisma String[] 无 min 语义），故在唯一写入点
 * （F003 buildMatchPlans）用本 schema 把关——违规直接抛错，属编程错误而非脏数据，不降级。
 */
export const planKolReasonsSchema = z.array(z.string().min(1)).min(1);

export function assertPlanKolReasons(reasons: string[]): string[] {
  return planKolReasonsSchema.parse(reasons);
}
