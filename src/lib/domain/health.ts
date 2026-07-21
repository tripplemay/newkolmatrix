// M1-A-BRIEF F004 — 项目健康度纯函数（architecture.md:525 登记为 M1 交付，
// 消费方 = Brief 画布的半环仪表与今天页雷达）。
//
// 模块形态按 D7：kebab-case 文件名 + 具名导出，不用 namespace object。
// （架构 :525 表格写的 `health.compute` 是注册表标签，不是模块路径；
//   实装对齐项目既有惯例 lib/agent/stage-routing.ts 的全具名导出。）
//
// 纯函数：不读 DB、不读时钟（`now` 由调用方注入）、无副作用。
// 这样它可被单测穷举，也可被 Agent 工具层与页面层同源调用（M1-B 的 compute_health 工具是它的薄封装）。

import type { ProjectHealth } from 'lib/data/mock/projects';

/** 健康度三档。复用 mock/projects.ts 的既有类型，避免同一概念出现第二套取值。 */
export type HealthBand = ProjectHealth; // 'gd' | 'wn' | 'cr'

/**
 * 分档阈值（PRD :373）。
 *
 * PRD 原文：「权重与阈值为示意，上线以真实数据校准」——故必须是可单独引用的导出常量，
 * 不得散落成函数体内的魔数，否则校准时要满代码库找数字。
 */
export const HEALTH_THRESHOLDS = {
  /** ≥ 此分为「达标」 */
  gd: 80,
  /** ≥ 此分为「注意」，低于则「风险」 */
  wn: 55,
} as const;

/**
 * 四因子权重（PRD :373：目标达成度 · 预算消耗率 · 时间进度 · 阻塞项数）。合计必须为 1。
 * 同上，为示意值，上线以真实数据校准。
 */
export const HEALTH_WEIGHTS = {
  exposure: 0.4,
  budget: 0.2,
  time: 0.2,
  blockers: 0.2,
} as const;

/**
 * 阻塞项饱和数：达到此条数时阻塞因子触底（0 分）。
 * 独立成常量而非写死在公式里，理由同上。
 */
export const BLOCKER_SATURATION = 5;

/**
 * `computeHealth` 的入参契约（D16）。
 *
 * 四个因子的「分子」（实际曝光 / 已消耗预算）在 M1-A 阶段【库里没有存处】——
 * 指标表未建、`Deal` 归 M3。故一律由调用方显式提供，本函数不去猜。
 */
export interface HealthInput {
  /** 目标曝光量。null = 未设目标 */
  targetExposure: number | null;
  /** 实际曝光量。null = 无实测 */
  actualExposure: number | null;
  /** 总预算 */
  budgetTotal: number | null;
  /** 已消耗预算。null = 无实测 */
  budgetSpent: number | null;
  /** 周期起 */
  periodStart: Date | null;
  /** 周期止 */
  periodEnd: Date | null;
  /** 评估时点。显式注入而非函数内取 `new Date()`——否则本函数不再是纯函数、无法穷举测试 */
  now: Date;
  /** 阻塞项数。无阻塞源时调用方传 0（本批无阻塞表，M1-B 页面层接入） */
  blockerCount: number;
}

/** `computeHealth` 的返回（D15：无空态，`score` 与 `band` 一一映射且同源产出）。 */
export interface HealthResult {
  /** 0–100 整数 */
  score: number;
  band: HealthBand;
}

/** 各因子的 0–100 分项（供调试与 M1-B 展示层拆解，不改变 score 的单一真相地位）。 */
export interface HealthBreakdown {
  exposure: number;
  budget: number;
  time: number;
  blockers: number;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * 分数 → 分档的**唯一**映射（acceptance：不得两处各算）。
 * 导出供展示层复用；`computeHealth` 自身也只走这一条路径。
 */
export function resolveBand(score: number): HealthBand {
  if (score >= HEALTH_THRESHOLDS.gd) return 'gd';
  if (score >= HEALTH_THRESHOLDS.wn) return 'wn';
  return 'cr';
}

/**
 * 目标达成度：实际曝光 / 目标曝光，越高越健康。
 * 目标为 0 或负 → 无从计算达成度（除零防护），按 D15 记 0。
 */
function exposureScore(input: HealthInput): number {
  const { targetExposure, actualExposure } = input;
  if (targetExposure == null || actualExposure == null) return 0; // D15
  if (targetExposure <= 0) return 0; // 除零防护
  return clamp01(actualExposure / targetExposure) * 100;
}

/**
 * 预算消耗率：口径为「预算效率」——花掉的每一分预算是否换来等比例的达成度。
 * 达成率 ÷ 消耗率，钳到 [0,1]。
 * 尚未动用预算（消耗率 0）时不在预算维度扣分（记满分）——没花钱本就不该罚预算分。
 */
function budgetScore(input: HealthInput): number {
  const { budgetTotal, budgetSpent, targetExposure, actualExposure } = input;
  if (budgetTotal == null || budgetSpent == null) return 0; // D15
  if (budgetTotal <= 0) return 0; // 除零防护
  const spendRatio = clamp01(budgetSpent / budgetTotal);
  if (spendRatio === 0) return 100;
  const attainRatio =
    targetExposure == null || actualExposure == null || targetExposure <= 0
      ? 0
      : clamp01(actualExposure / targetExposure);
  return clamp01(attainRatio / spendRatio) * 100;
}

/**
 * 时间进度：时间本身走得快慢不等于健康，健康与否看**成果有没有跟上时间**。
 * 故取「时间已用比例超出达成比例的部分」作为落后量，越落后分越低。
 * 周期未开始 → 不算落后（满分）；周期长度 <= 0 → 除零防护，按 D15 记 0。
 */
function timeScore(input: HealthInput): number {
  const { periodStart, periodEnd, now, targetExposure, actualExposure } = input;
  if (periodStart == null || periodEnd == null) return 0; // D15
  const span = periodEnd.getTime() - periodStart.getTime();
  if (span <= 0) return 0; // 除零防护（起止同日或倒挂）
  const elapsed = now.getTime() - periodStart.getTime();
  if (elapsed <= 0) return 100; // 周期未开始
  const timeRatio = clamp01(elapsed / span);
  const attainRatio =
    targetExposure == null || actualExposure == null || targetExposure <= 0
      ? 0
      : clamp01(actualExposure / targetExposure);
  return clamp01(1 - Math.max(0, timeRatio - attainRatio)) * 100;
}

/** 阻塞项：越少越健康，到 `BLOCKER_SATURATION` 条触底。负数按 0 处理。 */
function blockerScore(input: HealthInput): number {
  const n = Math.max(0, input.blockerCount);
  return clamp01(1 - n / BLOCKER_SATURATION) * 100;
}

/** 拆解各因子分项。主要给测试与 M1-B 展示层用。 */
export function computeHealthBreakdown(input: HealthInput): HealthBreakdown {
  return {
    exposure: exposureScore(input),
    budget: budgetScore(input),
    time: timeScore(input),
    blockers: blockerScore(input),
  };
}

/**
 * 计算项目健康度（PRD :373）。
 *
 * **D15 空值语义：** 任一因子的输入为 `null`（无实测）时，该因子按 **0 分**计入加权——
 * 不退出加权、不重新归一化、不返回空态。
 *
 * 已知后果（记录在 spec D15，非缺陷）：`actualExposure` 与 `budgetSpent` 在 M1-A 阶段
 * 全库无存处，故四条 seed 项目会一律落 `cr`。这是**数据可得性**的事实，M1-B 接真实指标后消解。
 * **不得**为了让 seed 好看而给本函数打「无实测就当达标」之类的补丁——
 * 那正是 PRD :129 点名的反模式（只有文案的门）。
 */
export function computeHealth(input: HealthInput): HealthResult {
  const b = computeHealthBreakdown(input);
  const raw =
    b.exposure * HEALTH_WEIGHTS.exposure +
    b.budget * HEALTH_WEIGHTS.budget +
    b.time * HEALTH_WEIGHTS.time +
    b.blockers * HEALTH_WEIGHTS.blockers;
  const score = Math.round(clamp01(raw / 100) * 100);
  // band 只从 score 推导：保证百分比与分档一一映射、不会两处各算出不一致的结果。
  return { score, band: resolveBand(score) };
}
