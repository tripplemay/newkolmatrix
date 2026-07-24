// M4-INSIGHT F003 — 证据缺口清单纯函数（架构口径的 `attribution.gaps` = 本文件 `attributionGaps`）。
//
// 输入 = 一份度量快照事实（spend/spendSource/reach/conversions，调用方查好后结构化传入），
// 输出 = 证据缺口清单（逐条可分支渲染「缺什么显什么」）+ `complete`（证据是否齐备）。
// 纯函数：不读 DB、不打网关、无副作用、不 import prisma client——可被单测穷举
// （delivery-check / crm-infer / env-guards 先例，D7 形态：kebab-case 文件名 + 具名导出）。
//
// **三处复用铁律（spec §3 P2 · F003 acceptance）：**
// ① V8 项目级对照账本「证据缺口卡」/ V12 跨项目洞察页（F009/F010 接真：gaprow ×N = 本函数产物渲染）
// ② `compute_roi` 内部工具（F005：缺口输出即本函数产物，不得内联重算）
// ③ `weekly-draft` 例程（F011：周报草案里的归因限制段落数据源）
// 三处必须复用本函数——单一真相源。页面与工具不得各判一次缺口。
//
// ── 判定规则（spec §3 P1/P3 · 裁决 U1「诚实标注、不强行归因」）──
//
// spend（P3 口径 payout/quote/none）：
//   spend=null（不论 source）           → SPEND_ABSENT（值缺即缺——quote/payout 标注也救不回来）
//   spendSource='none' / null           → SPEND_ABSENT（无真源；即便带了数值，来源不可核 →
//                                          fail-safe 按缺处理，不把无源数字当已核实花费）
//   spendSource='quote' + spend 非空    → SPEND_COMMITTED_ONLY（仅承诺额，非实际放款——
//                                          「弱证据」缺口，与「无证据」SPEND_ABSENT 可区分，不得压成一码）
//   spendSource='payout' + spend 非空   → 无缺口（released 放款真源）
//
// reach / conversions（M5 平台/partner 回传前恒 null）：
//   null → REACH_ABSENT / CONVERSIONS_ABSENT；**0 是真实回传值，不是缺口**
//   （「上报为零」≠「未上报」——D2 诚实语义，两者混同会把真实差数据吞成证据不足）。
//
// `complete`：恒等于 `gaps.length === 0`。true 才允许下游把 ROI 视为可归因；
// 本函数**只列缺口、不下归因结论**（不算 ROI、不猜 ROI、不填 0）——「不强行归因」
// 的实现就是：缺什么列什么，结论留给拿到完整证据的那一天（M5）。
// fail-safe 方向恒为「多列不吞」：宁可把可疑证据标成缺口让人补数据，不可静默放行假完整。

/** spend 口径标注（与 MetricSnapshot.spendSource 列口径一致，P3）。 */
export type SpendSource = 'payout' | 'quote' | 'none';

/** 缺口指向的度量维度，漏斗序（花费 → 曝光 → 转化）= 输出清单的稳定序。 */
export const ATTRIBUTION_METRICS = ['spend', 'reach', 'conversions'] as const;
export type AttributionMetric = (typeof ATTRIBUTION_METRICS)[number];

/** 缺口原因码（字符串字面量联合，DeliveryGapReason 先例——调用方要分支渲染「缺什么显什么」，自由文本不可分支）。 */
export type AttributionGapReason =
  /** 曝光回传缺失（M5 平台回传前的常态） */
  | 'REACH_ABSENT'
  /** 转化回传缺失（M5 partner 回传前的常态） */
  | 'CONVERSIONS_ABSENT'
  /** 花费仅有承诺额（Quote committed），实际放款未发生——弱证据非无证据 */
  | 'SPEND_COMMITTED_ONLY'
  /** 花费无真源（无 released payout 也无 committed quote，或数值来源不可核） */
  | 'SPEND_ABSENT';

/** 缺口条目（调用方据此逐条分支渲染；不含任何归因结论）。 */
export interface AttributionGap {
  metric: AttributionMetric;
  reason: AttributionGapReason;
  /**
   * SPEND_COMMITTED_ONLY 时库内仍可见的承诺额事实（供渲染「仅承诺 $X，放款未发生」）；
   * 其余缺口为 null（D2：无事实不填 0/'' 冒充）。
   */
  committed: { amount: number; currency: string | null } | null;
}

/** `attributionGaps` 入参：一份快照的度量事实，调用方查好传入（函数不读 DB）。 */
export interface AttributionGapsInput {
  /** 真源聚合花费（Decimal 由调用方转 number）；无 payout/quote → null */
  spend: number | null;
  /** spend 口径标注（payout/quote/none）；快照列可空，null 按 'none' fail-safe 处理 */
  spendSource: SpendSource | null;
  /** 币种（ISO 4217），无则 null；仅透传进 committed 事实，不参与判定 */
  currency?: string | null;
  /** 平台回传曝光；未回传 → null（0 = 真实回传值，非缺口） */
  reach: number | null;
  /** partner 回传转化；未回传 → null（0 同上） */
  conversions: number | null;
}

/** `attributionGaps` 返回：缺口清单 + 按维度索引 + 证据齐备位。 */
export interface AttributionGapsResult {
  /** 缺口清单，按 `ATTRIBUTION_METRICS` 漏斗序（每维度至多一条）；无缺口 → 空数组 */
  gaps: AttributionGap[];
  /** 同上，按维度索引（无缺口的维度为 null——页面按维度分支渲染更直接） */
  byMetric: Record<AttributionMetric, AttributionGap | null>;
  /** 证据齐备 = gaps 为空；true 才允许下游把 ROI 视为可归因（本函数不下结论） */
  complete: boolean;
}

/** spend 维度的缺口判定（文件头规则表）；无缺口 → null。 */
function spendGapOf(input: AttributionGapsInput): AttributionGap | null {
  const { spend, spendSource } = input;

  // 值缺即缺：不论口径标注怎么写，没有数额就没有花费证据。
  if (spend == null) {
    return { metric: 'spend', reason: 'SPEND_ABSENT', committed: null };
  }
  // 无真源（'none' / 标注缺失）：数值来源不可核，fail-safe 按缺处理，不吞。
  if (spendSource == null || spendSource === 'none') {
    return { metric: 'spend', reason: 'SPEND_ABSENT', committed: null };
  }
  // 仅承诺额：列为「弱证据」缺口，并把承诺额事实带给渲染方。
  if (spendSource === 'quote') {
    return {
      metric: 'spend',
      reason: 'SPEND_COMMITTED_ONLY',
      committed: { amount: spend, currency: input.currency ?? null },
    };
  }
  // payout + 数额：released 真源，无缺口。
  return null;
}

/**
 * 证据缺口清单（文件头注释 = 完整规则）。
 *
 * 纯函数：不修改入参、无 IO、同输入必同输出；返回全新对象。
 * 只列缺口、不下归因结论——ROI 的计算与「证据不足」降级归 `roi.compute`（F002），
 * 两者共同构成 V8/V12 的诚实归因边界。
 */
export function attributionGaps(
  input: AttributionGapsInput,
): AttributionGapsResult {
  const byMetric: Record<AttributionMetric, AttributionGap | null> = {
    spend: spendGapOf(input),
    reach:
      input.reach == null
        ? { metric: 'reach', reason: 'REACH_ABSENT', committed: null }
        : null,
    conversions:
      input.conversions == null
        ? {
            metric: 'conversions',
            reason: 'CONVERSIONS_ABSENT',
            committed: null,
          }
        : null,
  };

  const gaps = ATTRIBUTION_METRICS.map((m) => byMetric[m]).filter(
    (g): g is AttributionGap => g != null,
  );

  return {
    gaps,
    byMetric,
    complete: gaps.length === 0,
  };
}
