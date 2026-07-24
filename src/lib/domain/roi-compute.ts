// M4-INSIGHT F002 — ROI 计算纯函数（架构口径的 `roi.compute` = 本文件 `computeRoi`）。
//
// 输入 = 花费 + 分子证据（reach / conversions / actualExposure）+ 曝光目标（调用方查好后传入），
// 输出 = roi（或诚实降级）+ 目标差异 + 达成方向三值。
// 纯函数：不读 DB、不打网关、无副作用、不 import prisma client——可被单测穷举
// （delivery-check / crm-infer / env-guards / match-score 先例，D7 形态：kebab-case 文件名 + 具名导出）。
//
// **三处复用铁律（spec §3 P2 · F002 acceptance）：**
// ① V8 项目级对照账本 / V12 跨项目洞察页（F009/F010 接真：RSC 装配处的 ROI 与差异表数据源）
// ② `compute_roi` 内部工具（F005：输出即本函数产物，不得内联重算）
// ③ `weekly-draft` 例程（F011：周报起草前的跨项目汇总走同一函数）
// 三处必须复用本函数——单一真相源。UI / 工具 / 例程不得各算一次。
//
// ── 诚实降级铁律（spec §3 P1 / 裁决 U1 / D2）──
//
// roi 判定（自上而下，先命中先定）：
//   分子证据（reach / conversions / actualExposure）任一缺失或非法
//                            → roi=null + basis='insufficient_evidence'（绝不填 0 / 不猜）
//   spend=null（无花费证据）  → roi=null + basis='insufficient_evidence'（分母同样是证据）
//   spend=0（确知零花费）     → roi=null + basis='zero_spend'（除零无定义；与「花费未知」可区分——
//                              绝不 `spend ?? 0`，那会把「不知道」伪造成「确知为零」）
//   分子齐 + spend>0          → roi = conversions / spend + basis='computed'
//
//   conversions=0（真测得零）→ roi=0 + basis='computed'：这是**有证据的零**，
//   与「缺证据填 0」以 basis 区分——降级是否诚实看 basis，不是看数值。
//   非法值（负数 / NaN / ±Infinity）一律按证据无效处理（fail-safe 方向恒为「不出数」：
//   宁可显「证据不足」让人补数据，不出可疑数字）。
//
// ── roi 数值口径（本批）──
// roi = conversions / spend（每 USD 有效转化数）。货币化回报倍数（V12「3.1x」形态）需要
// 单位转化价值模型——那归 M5 真回传，本批不猜估值（EXTENSION POINT，沿 delivery-check
// 「不预测形状、不留空转字段」先例，D2 不猜）。reach / actualExposure 不进公式，但任一缺失
// 意味着回传链路不完整、conversions 数字不可信（attribution.gaps 会逐条列缺）——
// 证据不齐就不出数，正是「如实标注、不强行归因」（architecture §5.4）。
// 本批 reach/conversions 恒 null（M5 回传，spec §1），生产路径下 roi 恒为
// insufficient_evidence——这是设计本意（spec §7），不是缺陷。
//
// ── 目标差异 + 达成方向（V8 三值三样式数据源）──
// direction 三值：'up'（超出目标，正向绿）/ 'down'（未达，红）/ 'flat'（持平，中性）——
// 不得压二态（现行 mock env-insight.ts 的 `up: boolean` 随 F009 退役，UI 按三值渲染）。
// `higherIsBetter=false` 支持「越低越好」指标（单次安装成本类，V8 对照表第 3 行形态）：
// actual < target 也是达成（up）。target / actual 任一缺失或非法 → delta=null + direction=null
// （缺数据不判方向，不默认 up / flat——「无法判断」与「持平」是两回事）。
// V8 对照表除曝光外的行由调用方用 `compareGoal` 逐对计算（极性按指标定义传入）。

/** roi 结论依据（字面量联合，调用方逐值可分支渲染——自由文本不可分支）。 */
export type RoiBasis =
  /** 分子齐 + spend>0，roi 为真算得的数 */
  | 'computed'
  /** 分子任一缺 / spend 未知——证据不足，roi=null（绝不填 0） */
  | 'insufficient_evidence'
  /** spend 确知为 0，倍率无定义——与「spend 未知」语义可区分 */
  | 'zero_spend';

/** 达成方向三值（V8 差异列三样式数据源；缺数据时为 null，不落任何一值）。 */
export type GoalDirection = 'up' | 'down' | 'flat';

/** `computeRoi` 入参：调用方（装配服务 F004 / 工具 F005 / 例程 F011）查好后传入，函数不读 DB。 */
export interface RoiComputeInput {
  /** 花费（USD 聚合额）：null = 无花费证据；0 = 确知零花费——两者语义不同，不得互相坍缩 */
  spend: number | null;
  /** ROI 分子证据三项（M5 平台/partner 回传前恒 null） */
  reach: number | null;
  conversions: number | null;
  actualExposure: number | null;
  /** 曝光目标（brief 侧，调用方从 Project.goal 读出传入）；缺 → 只影响差异，不影响 roi */
  targetExposure: number | null;
}

/** 单指标「目标 vs 实际」对比结果（V8 对照表一行的完整渲染依据）。 */
export interface GoalComparison {
  /** 目标值；缺失或非法 → null */
  target: number | null;
  /** 实际值；缺失或非法 → null */
  actual: number | null;
  /** actual − target；任一缺 → null（D2：不填 0 冒充「持平」） */
  delta: number | null;
  /** delta / target（相对差异）；任一缺或 target=0 → null（不除零） */
  deltaRatio: number | null;
  /** 达成方向三值；任一缺 → null（缺数据不判方向） */
  direction: GoalDirection | null;
}

export interface CompareGoalOptions {
  /** 指标极性：true（默认）= 越高越好（曝光/转化）；false = 越低越好（单次安装成本类） */
  higherIsBetter?: boolean;
}

/** `computeRoi` 返回：roi + 依据 + spend 回显 + 曝光目标差异。纯数据、可 JSON 序列化（F005 画布契约）。 */
export interface RoiComputeResult {
  /** 每 USD 有效转化数（口径见文件头）；证据不足 / 零花费 → null */
  roi: number | null;
  basis: RoiBasis;
  /** spend 规范化回显（null=未知 / 0=确知为零——「缺失 vs 零」可区分的显式面；非法值按未知记 null） */
  spend: number | null;
  /** 曝光「目标 vs 实际」差异 + 达成方向（V8 对照表曝光行数据源） */
  exposure: GoalComparison;
}

/** 计数/金额证据规范化：有限且非负才算有效，否则视为无证据（null）。 */
function normCount(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/** 目标对比的数值合法性（standalone 用途允许任意有限数；非有限 → 视为缺失）。 */
function normFinite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 单指标「目标 vs 实际」对比（文件头「目标差异 + 达成方向」段 = 完整规则）。
 *
 * 纯函数：不修改入参、同输入必同输出；返回全新对象。
 * delta=0 恒判 'flat'，与极性无关（持平就是持平）。
 */
export function compareGoal(
  target: number | null,
  actual: number | null,
  options: CompareGoalOptions = {},
): GoalComparison {
  const higherIsBetter = options.higherIsBetter ?? true;
  const t = normFinite(target);
  const a = normFinite(actual);

  if (t == null || a == null) {
    // 缺数据：差异与方向一律 null——不填 0、不默认 flat/up（D2 诚实语义）
    return { target: t, actual: a, delta: null, deltaRatio: null, direction: null };
  }

  const delta = a - t;
  const deltaRatio = t === 0 ? null : delta / t;
  const direction: GoalDirection =
    delta === 0 ? 'flat' : delta > 0 === higherIsBetter ? 'up' : 'down';

  return { target: t, actual: a, delta, deltaRatio, direction };
}

/**
 * ROI 计算（文件头注释 = 完整规则；判定优先级见「诚实降级铁律」段）。
 *
 * 纯函数：不修改入参、无 IO、同输入必同输出；返回全新对象。
 */
export function computeRoi(input: RoiComputeInput): RoiComputeResult {
  const spend = normCount(input.spend);
  const reach = normCount(input.reach);
  const conversions = normCount(input.conversions);
  const actualExposure = normCount(input.actualExposure);

  // 曝光是计数指标：目标与实际都走计数规范化后再对比（极性=越高越好）
  const exposure = compareGoal(normCount(input.targetExposure), actualExposure);

  // 1) 分子任一缺 → 证据不足（acceptance 硬性：绝不填 0 / 不猜）
  if (reach == null || conversions == null || actualExposure == null) {
    return { roi: null, basis: 'insufficient_evidence', spend, exposure };
  }
  // 2) spend 未知 → 同为证据不足（但与 spend=0 泾渭分明，见下）
  if (spend == null) {
    return { roi: null, basis: 'insufficient_evidence', spend: null, exposure };
  }
  // 3) spend 确知为 0 → 倍率无定义，单列 basis（不与「未知」共用）
  if (spend === 0) {
    return { roi: null, basis: 'zero_spend', spend: 0, exposure };
  }
  // 4) 分子齐 + spend>0 → 真算（conversions=0 时 roi=0 是有证据的零）
  return { roi: conversions / spend, basis: 'computed', spend, exposure };
}
