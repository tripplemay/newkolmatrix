// M1-D-KNOWLEDGE F001 — 游戏知识平面的 jsonb / 深字段 zod 契约（architecture §7.6）。
//
// 两类校验对象：
// 1. `GameKnowledge.structured` 列（按 kind 定型的结构化载荷）——读时宽松降级：
//    脏数据 → null 不抛错（D2，与 parseProjectGoal 同一取向）；
// 2. LLM 解析产物（F003 generateText 输出）——写入前严格校验：不合形 → 本次解析 failed
//    （状态机内消化，不产出半坏知识）。
// 另含 FR-11.9 应用层校验：sourceMaterialIds 非空即知识溯源，空则非法。

import { z } from 'zod';

/** 与 Prisma enum MaterialType 逐字一致（那边是 DB 完整性约束，这边是应用层值域）。 */
export const materialTypeSchema = z.enum([
  'lore',
  'art',
  'gameplay_doc',
  'review',
  'data',
  'video',
]);
export type MaterialTypeValue = z.infer<typeof materialTypeSchema>;

/** 与 Prisma enum ParseStatus 逐字一致（状态机 ⑤，architecture §5.3）。 */
export const parseStatusSchema = z.enum([
  'pending',
  'parsing',
  'parsed',
  'failed',
]);
export type ParseStatusValue = z.infer<typeof parseStatusSchema>;

/** 与 Prisma enum KnowledgeKind 逐字一致。 */
export const knowledgeKindSchema = z.enum([
  'selling_point',
  'audience',
  'compliance_redline',
]);
export type KnowledgeKindValue = z.infer<typeof knowledgeKindSchema>;

// ───────────────────────── structured 列（按 kind 定型）─────────────────────────

/** 受众切片（沿 mock AudienceSlice 契约：label + percent，页面 Progress 条直接消费）。 */
export const audienceSliceSchema = z.object({
  label: z.string().min(1),
  /** 占比（0-100，页面进度条语义） */
  percent: z.number().min(0).max(100),
});
export type AudienceSlice = z.infer<typeof audienceSliceSchema>;

/** kind=selling_point 的 structured：卖点清单。 */
export const sellingPointStructuredSchema = z.object({
  points: z.array(z.string().min(1)).min(1),
});
export type SellingPointStructured = z.infer<
  typeof sellingPointStructuredSchema
>;

/** kind=audience 的 structured：受众切片列表。 */
export const audienceStructuredSchema = z.object({
  slices: z.array(audienceSliceSchema).min(1),
});
export type AudienceStructured = z.infer<typeof audienceStructuredSchema>;

/** kind=compliance_redline 的 structured：红线规则清单。 */
export const complianceStructuredSchema = z.object({
  rules: z.array(z.string().min(1)).min(1),
});
export type ComplianceStructured = z.infer<typeof complianceStructuredSchema>;

const STRUCTURED_SCHEMAS = {
  selling_point: sellingPointStructuredSchema,
  audience: audienceStructuredSchema,
  compliance_redline: complianceStructuredSchema,
} as const;

export type KnowledgeStructured =
  | SellingPointStructured
  | AudienceStructured
  | ComplianceStructured;

/**
 * 从 jsonb 列宽松读取 structured：形状不合法 → null，不抛错（D2）。
 * 页面 / 注入层拿到 null 时按「待解析」占位降级，绝不让脏数据打死渲染。
 */
export function parseKnowledgeStructured(
  kind: KnowledgeKindValue,
  raw: unknown,
): KnowledgeStructured | null {
  const r = STRUCTURED_SCHEMAS[kind].safeParse(raw);
  return r.success ? r.data : null;
}

// ───────────────────────── LLM 解析产物（F003 写入前严格校验）─────────────────────────

/**
 * 策略 Agent 解析一份素材的完整产物（generateText JSON 输出的目标形状）。
 * 三个数组允许为空（单份素材未必覆盖三类知识），但至少一类非空才算有效产出
 * （由 `hasAnyKnowledge` 判定；全空 → F003 置 failed 明示「未能提炼出知识」）。
 */
export const llmParseOutputSchema = z.object({
  /** 卖点（触达 Agent 消费） */
  selling_points: z.array(z.string().min(1)).max(20).default([]),
  /** 受众切片（匹配 Agent 消费） */
  audience_slices: z.array(audienceSliceSchema).max(20).default([]),
  /** 合规红线（合规 Agent 消费） */
  compliance_redlines: z.array(z.string().min(1)).max(20).default([]),
  /** LLM 自报置信度 0-1（展示按保守下限 ai_estimate 档） */
  confidence: z.number().min(0).max(1).nullish(),
});
export type LlmParseOutput = z.infer<typeof llmParseOutputSchema>;

/**
 * 严格解析 LLM 输出：不合形 → null（调用方置 failed + parseError，状态机内消化）。
 * 与读侧宽松降级不同，写侧 null 意味着本次解析作废——半坏知识不入库。
 */
export function parseLlmOutput(raw: unknown): LlmParseOutput | null {
  const r = llmParseOutputSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** 解析产物是否含任何一类知识（全空 = 无效产出，F003 置 failed）。 */
export function hasAnyKnowledge(out: LlmParseOutput): boolean {
  return (
    out.selling_points.length > 0 ||
    out.audience_slices.length > 0 ||
    out.compliance_redlines.length > 0
  );
}

// ───────────────────────── FR-11.9 溯源校验（应用层）─────────────────────────

/**
 * sourceMaterialIds：非空即知识溯源，空则非法（FR-11.9）。
 * DB 层 text[] 不便加非空约束（Prisma String[] 无 min 语义），故在唯一写入点
 * （F003 解析管道）用本 schema 把关——违规直接抛错，属编程错误而非脏数据，不降级。
 */
export const sourceMaterialIdsSchema = z.array(z.string().min(1)).min(1);

export function assertSourceMaterialIds(ids: string[]): string[] {
  return sourceMaterialIdsSchema.parse(ids);
}
