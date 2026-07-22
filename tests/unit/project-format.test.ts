// M1-B-BRIEF F001 — 展示层格式化 helper 单测（货币串 + D9 goal 合成串）。
//
// 关注两条纪律：
//   1. USD 整数额与原 mock budget 串同形（'$18,000'）——最小化视觉漂移；
//   2. null/脏值一律降级不抛错（D2 渲染契约）。

import { describe, expect, it } from 'vitest';
import {
  formatBudget,
  formatExposure,
  formatGoalText,
} from 'lib/display/project-format';

describe('formatBudget', () => {
  it('USD 整数额与原 mock budget 串同形', () => {
    expect(formatBudget(18000, 'USD')).toBe('$18,000');
    expect(formatBudget(7500, 'USD')).toBe('$7,500');
  });

  it('带分位金额保留小数（Decimal(14,2) 的合法取值）', () => {
    expect(formatBudget(18000.5, 'USD')).toBe('$18,000.5');
  });

  it('currency 缺失 → 纯千分位串', () => {
    expect(formatBudget(12000, null)).toBe('12,000');
  });

  it('非法 currency 代码 → 宽松降级不抛错（D2）', () => {
    expect(formatBudget(9000, 'NOT_A_CODE')).toBe('9,000 NOT_A_CODE');
  });

  it('金额 null / 非有限值 → null（页面渲染「待补充」）', () => {
    expect(formatBudget(null, 'USD')).toBeNull();
    expect(formatBudget(Number.NaN, 'USD')).toBeNull();
  });
});

describe('formatExposure', () => {
  it('整万 → 「N 万」', () => {
    expect(formatExposure(3_000_000)).toBe('300 万');
    expect(formatExposure(10_000)).toBe('1 万');
  });

  it('非整万 → 千分位原样', () => {
    expect(formatExposure(1_234_567)).toBe('1,234,567');
  });

  it('零 / 负数不套万缩写', () => {
    expect(formatExposure(0)).toBe('0');
  });
});

describe('formatGoalText', () => {
  it('从结构化 goal 合成展示串（D9，不再用整句 mock）', () => {
    expect(
      formatGoalText({
        targetExposure: 3_000_000,
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
      }),
    ).toBe('目标曝光 300 万 · 周期 2026-07-01 ～ 2026-07-31');
  });

  it('goal null（jsonb 解析失败/缺失）→ null', () => {
    expect(formatGoalText(null)).toBeNull();
  });
});
