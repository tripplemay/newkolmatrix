// M1-B-BRIEF F001 — 项目字段的展示层格式化（D9）。
//
// 为什么在展示层而非 domain：这些是「怎么念给人听」的问题（货币符号、万位缩写、
// 周期串法），不是业务判定。domain 保持无 i18n / 无文案耦合（D6 同一取向）。
//
// 纯函数：null 入参一律返回 null，由页面渲染「待补充」占位（D2 渲染契约），绝不抛错。

import type { ProjectGoal } from 'lib/data/schemas/project';

/**
 * 货币金额 → 显示串（详情页 pmeta 预算位）。
 *
 * `budgetTotal` 在库里是 Decimal(14,2)，调用方（RSC）先 `Number()` 再传入。
 * USD 18000 → `$18,000`（与原 mock 的 budget 串同形，最小化视觉漂移）；
 * 非法 currency 代码退回 `18,000 USD` 而非抛错。
 */
export function formatBudget(
  amount: number | null,
  currency: string | null,
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const plain = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (!currency) return plain;
  try {
    return amount.toLocaleString('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  } catch {
    // ISO 4217 之外的脏值：宽松降级，不让整页崩（D2）
    return `${plain} ${currency}`;
  }
}

/** 曝光量 → 中文习惯缩写：整万取「N 万」，其余原样千分位。 */
export function formatExposure(n: number): string {
  if (Number.isInteger(n) && n > 0 && n % 10_000 === 0) {
    return `${(n / 10_000).toLocaleString('en-US')} 万`;
  }
  return n.toLocaleString('en-US');
}

/**
 * goal jsonb → 展示串（D9：从结构化字段合成，不再用整句 mock 散文）。
 *
 * `{targetExposure: 3_000_000, periodStart: '2026-07-01', periodEnd: '2026-07-31'}`
 * → `目标曝光 300 万 · 周期 2026-07-01 ～ 2026-07-31`
 *
 * goal 解析失败（null）→ null（页面渲染「待补充」）。
 */
export function formatGoalText(goal: ProjectGoal | null): string | null {
  if (goal == null) return null;
  return `目标曝光 ${formatExposure(goal.targetExposure)} · 周期 ${goal.periodStart} ～ ${goal.periodEnd}`;
}
