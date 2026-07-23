// ARCH-M05 F004 — mock 渲染契约层：统一深字段读取入口 + 溯源解析（architecture.md §6.7 / §7.5）。
//
// 三条铁则（D2 / FR-11.17 / FR-11.18 / 裁决 #2）：
//   1. null / 缺失 / 校验失败 → 返回 null（「待接入 / 待补充 / 待核」占位语义），绝不抛错；
//   2. 绝不填 0 / 空串冒充实测——缺失就是缺失，由 UI 渲染占位文案；
//   3. 「待核」唯一触发条件 = 字段缺失 / 契约层返回 null（可机械判定，见 isPendingVerification）。
//
// 读写不对称（§7.5.2）：字段值为 null → 渲染占位、无数据点、无溯源徽标；
// 字段值存在但溯源链空 → 正常渲染数据点 + ai_estimate 徽标（保守下限，永不出现裸数据点，FR-11.19）。
// M0.5 各页 mock（src/lib/data/mock/）与 M2 真数据共用本层，数据到位 UI 零返工。

import { z } from 'zod';
import type { ZodType } from 'zod';

/* ------------------------------------------------------------------ *
 * 契约位 schema 与类型（§7.5：dataSource 行级 × fieldProvenance 字段级）
 * ------------------------------------------------------------------ */

/** 来源枚举，可信度从高到低（§7.5）；ai_estimate = 最低档「AI 估算·未验证」 */
export const dataSourceSchema = z.enum([
  'platform_api', // 平台一方 API ✓
  'optin', // 主动入驻
  'purchased', // 外购评估
  'crawl', // Apify 采集
  'user_upload', // 用户上传
  'user_input', // 人工录入（M3-A F007：contactEmail 抽屉录入口；与 user_upload 同档人源）
  'ai_estimate', // AI 估算·未验证（保守下限）
]);
export type DataSource = z.infer<typeof dataSourceSchema>;

export const confidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof confidenceSchema>;

/** 字段级溯源条目：FieldProvenance{source, fetchedAt, confidence}（fetchedAt null = 新鲜度未知，FR-11.8） */
export const fieldProvenanceEntrySchema = z.object({
  source: dataSourceSchema,
  fetchedAt: z.string().nullable().default(null),
  confidence: confidenceSchema.nullable().default(null),
  detail: z.string().optional(),
});
export type FieldProvenance = z.infer<typeof fieldProvenanceEntrySchema>;

/** 字段级覆盖表：key = 字段路径字面量（'followers' | 'audienceDemo.geoDist' …） */
export const fieldProvenanceSchema = z.record(
  z.string(),
  fieldProvenanceEntrySchema,
);
export type FieldProvenanceMap = z.infer<typeof fieldProvenanceSchema>;

/** 携带溯源契约位的实体形状（Kol as-built 两列；mock 实体同形，§7.5） */
export type ProvenanceCarrier = {
  dataSource: unknown;
  fieldProvenance: unknown;
};

/* ------------------------------------------------------------------ *
 * 占位语义（D2：null → 待接入 / 待补充 / 待核，绝不抛错、绝不填 0）
 * ------------------------------------------------------------------ */

export const PENDING_TEXT = {
  /** 数据源未接通（如平台 API 未开） */
  connect: '待接入',
  /** 人工待填（如商务档期未录入） */
  fill: '待补充',
  /** 字段缺失 / 契约层返回 null（裁决 #2 唯一触发条件） */
  verify: '待核',
} as const;

/* ------------------------------------------------------------------ *
 * readContractSlot — 统一深字段读取入口（NFR-S6 读侧应用）
 * ------------------------------------------------------------------ */

/**
 * 读取契约位（jsonb / mock 深字段）：契约位是外部或历史数据，读时校验失败**降级不抛错**，
 * 返回 null（走占位渲染或下一级溯源回退），保证脏数据不打死页面。
 *
 * - raw 为 null / undefined → null（「待接入」语义）
 * - schema 校验失败 → null（降级，开发态告警一次）
 * - 绝不抛错、绝不合成 0 / '' 等冒充实测的默认值
 */
export function readContractSlot<T>(
  schema: ZodType<T>,
  raw: unknown,
  slot: string,
): T | null {
  if (raw === null || raw === undefined) return null;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== 'production') {
      const first = parsed.error.issues[0];
      console.warn(
        `[contract-slot] ${slot} 校验失败，已降级为 null（不抛错）：${
          first
            ? `${first.path.join('.') || '(root)'} ${first.message}`
            : 'invalid'
        }`,
      );
    }
    return null;
  }
  return parsed.data;
}

/* ------------------------------------------------------------------ *
 * isPendingVerification — 「待核」机械判定（裁决 #2 口径）
 * ------------------------------------------------------------------ */

/**
 * 「待核」判定：字段值缺失（null / undefined，含契约层降级后的 null），
 * 或显式传入的溯源链（如 GameKnowledge.sourceMaterialIds，FR-11.9「空依据非法」）为空。
 *
 * 注意与 §7.5.2 读写不对称的边界：值存在而 dataSource/fieldProvenance 皆空**不是**待核——
 * resolveProvenance 会回退到 ai_estimate 徽标正常渲染。sourceChain 仅用于
 * 「值本身就是由溯源链生成」的场景（知识条目等），不要把 fieldProvenance 传进来。
 */
export function isPendingVerification(
  value: unknown,
  sourceChain?: readonly unknown[] | null,
): boolean {
  if (value === null || value === undefined) return true;
  if (sourceChain !== undefined) {
    return sourceChain === null || sourceChain.length === 0;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * resolveProvenance — 三级回退（§7.5.1，FR-11.7；ProvenanceTag 的唯一数据源）
 * ------------------------------------------------------------------ */

export type ResolvedProvenance = {
  source: DataSource;
  confidence: Confidence | null;
  fetchedAt: string | null; // null = 新鲜度未知
  detail?: string;
  /** 展开明细时说明溯源层级（FR-8.3.11） */
  resolvedFrom: 'field' | 'row' | 'fallback';
};

/**
 * 三级回退：① 字段级 fieldProvenance[field] 覆盖 → ② 行级 dataSource →
 * ③ 皆空视为 ai_estimate（保守下限，绝不冒充实测）。
 * 每级读取都经 readContractSlot：脏契约位降级走下一级，绝不抛错。
 */
export function resolveProvenance(
  entity: ProvenanceCarrier,
  field: string, // 'followers' | 'audienceDemo.geoDist' …
): ResolvedProvenance {
  const fp = readContractSlot(
    fieldProvenanceSchema,
    entity.fieldProvenance,
    'fieldProvenance',
  );
  const entry = fp?.[field];
  if (entry) return { ...entry, resolvedFrom: 'field' }; // ① 字段级

  const row = readContractSlot(
    dataSourceSchema,
    entity.dataSource,
    'dataSource',
  );
  if (row) {
    return {
      source: row,
      confidence: null,
      fetchedAt: null,
      resolvedFrom: 'row',
    }; // ② 行级
  }

  return {
    source: 'ai_estimate',
    confidence: null,
    fetchedAt: null,
    resolvedFrom: 'fallback', // ③ 保守下限
  };
}
