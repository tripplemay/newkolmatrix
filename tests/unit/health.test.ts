// M1-A-BRIEF F004 — domain/health.ts 单测。
//
// 覆盖 acceptance 逐条：三档 · 分档边界 55/80 的两侧 · 零阻塞/多阻塞 ·
// 周期未开始/已结束 · 除零防护 · D15 的「null 因子按 0 分计入」。

import { describe, it, expect } from 'vitest';
import {
  computeHealth,
  computeHealthBreakdown,
  resolveBand,
  HEALTH_WEIGHTS,
  HEALTH_THRESHOLDS,
  BLOCKER_SATURATION,
  type HealthInput,
} from '../../src/lib/domain/health';

const NOW = new Date('2026-07-22T00:00:00Z');

/** 一份四因子齐备的健康基线；各用例只覆写关心的字段。 */
function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    targetExposure: 1_000_000,
    actualExposure: 1_000_000,
    budgetTotal: 10_000,
    budgetSpent: 5_000,
    periodStart: new Date('2026-07-01T00:00:00Z'),
    periodEnd: new Date('2026-07-31T00:00:00Z'),
    now: NOW,
    blockerCount: 0,
    ...over,
  };
}

describe('常量：权重与阈值是可引用的导出常量，非函数体内魔数', () => {
  it('四因子权重合计为 1', () => {
    const sum =
      HEALTH_WEIGHTS.exposure +
      HEALTH_WEIGHTS.budget +
      HEALTH_WEIGHTS.time +
      HEALTH_WEIGHTS.blockers;
    expect(sum).toBeCloseTo(1, 10);
  });

  it('阈值为 PRD :373 的 80 / 55', () => {
    expect(HEALTH_THRESHOLDS.gd).toBe(80);
    expect(HEALTH_THRESHOLDS.wn).toBe(55);
  });
});

describe('resolveBand：分档边界 55 / 80 的两侧（三态不得压成二态）', () => {
  // 80 边界
  it('79 → wn（下侧）', () => expect(resolveBand(79)).toBe('wn'));
  it('80 → gd（边界值本身归上档）', () => expect(resolveBand(80)).toBe('gd'));
  it('81 → gd（上侧）', () => expect(resolveBand(81)).toBe('gd'));

  // 55 边界
  it('54 → cr（下侧）', () => expect(resolveBand(54)).toBe('cr'));
  it('55 → wn（边界值本身归上档）', () => expect(resolveBand(55)).toBe('wn'));
  it('56 → wn（上侧）', () => expect(resolveBand(56)).toBe('wn'));

  it('三档各自可达，未被压成二态', () => {
    const bands = new Set([resolveBand(100), resolveBand(60), resolveBand(0)]);
    expect(bands).toEqual(new Set(['gd', 'wn', 'cr']));
  });

  it('极值也落在三档内', () => {
    expect(resolveBand(0)).toBe('cr');
    expect(resolveBand(100)).toBe('gd');
  });
});

describe('computeHealth：score 与 band 同源产出、一一映射', () => {
  it('band 恒等于 resolveBand(score)——不存在两处各算', () => {
    const cases: HealthInput[] = [
      input(),
      input({ actualExposure: 0 }),
      input({ blockerCount: 3 }),
      input({ actualExposure: null, budgetSpent: null }),
      input({ periodStart: null, periodEnd: null }),
      input({ actualExposure: 250_000, budgetSpent: 9_000, blockerCount: 2 }),
    ];
    for (const c of cases) {
      const r = computeHealth(c);
      expect(r.band).toBe(resolveBand(r.score));
    }
  });

  it('score 恒为 0–100 的整数', () => {
    const cases: HealthInput[] = [
      input(),
      input({ actualExposure: 99_999_999 }), // 远超目标 → 仍应钳在 100
      input({ blockerCount: 999 }),
      input({ targetExposure: null, budgetTotal: null }),
    ];
    for (const c of cases) {
      const { score } = computeHealth(c);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('三档在端到端计算下均可达（不只 resolveBand 单测可达）', () => {
    // 全项健康 → gd
    const gd = computeHealth(input());
    // 中间态 → wn
    const wn = computeHealth(
      input({ actualExposure: 620_000, budgetSpent: 6_200, blockerCount: 1 }),
    );
    // 全无实测 → cr
    const cr = computeHealth(
      input({ actualExposure: null, budgetSpent: null }),
    );
    expect(gd.band).toBe('gd');
    expect(wn.band).toBe('wn');
    expect(cr.band).toBe('cr');
  });
});

describe('D15：null 因子按 0 分计入加权（不退出加权、不归一化、无空态）', () => {
  it('exposure 的任一输入为 null → 该因子 0 分', () => {
    expect(computeHealthBreakdown(input({ actualExposure: null })).exposure).toBe(0);
    expect(computeHealthBreakdown(input({ targetExposure: null })).exposure).toBe(0);
  });

  it('budget 的任一输入为 null → 该因子 0 分', () => {
    expect(computeHealthBreakdown(input({ budgetSpent: null })).budget).toBe(0);
    expect(computeHealthBreakdown(input({ budgetTotal: null })).budget).toBe(0);
  });

  it('period 的任一端为 null → 时间因子 0 分', () => {
    expect(computeHealthBreakdown(input({ periodStart: null })).time).toBe(0);
    expect(computeHealthBreakdown(input({ periodEnd: null })).time).toBe(0);
  });

  it('null 因子不改变其余因子的权重（非归一化）', () => {
    // 只留 blockers 满分、其余全 null：score 必须恰好等于 blockers 的权重份额，
    // 若实现改成「退出加权后归一化」，此值会变成 100，本条即翻红。
    const r = computeHealth(
      input({
        targetExposure: null,
        actualExposure: null,
        budgetTotal: null,
        budgetSpent: null,
        periodStart: null,
        periodEnd: null,
        blockerCount: 0,
      }),
    );
    expect(r.score).toBe(Math.round(HEALTH_WEIGHTS.blockers * 100));
    expect(r.band).toBe('cr');
  });

  it('返回类型无空态：全 null 输入仍产出数值 score 与三档之一', () => {
    const r = computeHealth(
      input({
        targetExposure: null,
        actualExposure: null,
        budgetTotal: null,
        budgetSpent: null,
        periodStart: null,
        periodEnd: null,
      }),
    );
    expect(typeof r.score).toBe('number');
    expect(['gd', 'wn', 'cr']).toContain(r.band);
  });

  it('已知后果实证：seed 形态（有目标有周期、无实测曝光与消耗）落 cr', () => {
    // 对应 spec D15 记录在案的后果——本条是它的护栏：
    // 若有人给算法打「无实测就当达标」的补丁让 seed 变绿，此条会翻红。
    const seedShaped = computeHealth(
      input({
        targetExposure: 3_000_000,
        actualExposure: null, // 库里无存处
        budgetTotal: 18_000,
        budgetSpent: null, // 库里无存处
        periodStart: new Date('2026-07-01T00:00:00Z'),
        periodEnd: new Date('2026-07-31T00:00:00Z'),
        blockerCount: 0,
      }),
    );
    expect(seedShaped.band).toBe('cr');
  });
});

describe('阻塞项因子：零阻塞 / 多阻塞', () => {
  it('零阻塞 → 满分', () => {
    expect(computeHealthBreakdown(input({ blockerCount: 0 })).blockers).toBe(100);
  });

  it('阻塞数越多分越低（单调递减）', () => {
    const scores = [0, 1, 2, 3, 4, 5].map(
      (n) => computeHealthBreakdown(input({ blockerCount: n })).blockers,
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThan(scores[i - 1]);
    }
  });

  it('达到饱和数即触底 0 分，且再多也不为负', () => {
    expect(
      computeHealthBreakdown(input({ blockerCount: BLOCKER_SATURATION })).blockers,
    ).toBe(0);
    expect(computeHealthBreakdown(input({ blockerCount: 999 })).blockers).toBe(0);
  });

  it('负数阻塞数按 0 处理（不产出 >100 的分）', () => {
    expect(computeHealthBreakdown(input({ blockerCount: -3 })).blockers).toBe(100);
  });
});

describe('时间因子：周期未开始 / 进行中 / 已结束', () => {
  it('周期未开始 → 不算落后（满分）', () => {
    const r = computeHealthBreakdown(
      input({
        now: new Date('2026-06-01T00:00:00Z'), // 早于 periodStart
        actualExposure: 0,
      }),
    );
    expect(r.time).toBe(100);
  });

  it('周期已结束且零成果 → 时间因子触底', () => {
    const r = computeHealthBreakdown(
      input({
        now: new Date('2026-09-01T00:00:00Z'), // 晚于 periodEnd
        actualExposure: 0,
      }),
    );
    expect(r.time).toBe(0);
  });

  it('周期已结束但目标达成 → 时间因子不扣分', () => {
    const r = computeHealthBreakdown(
      input({
        now: new Date('2026-09-01T00:00:00Z'),
        actualExposure: 1_000_000, // = target
      }),
    );
    expect(r.time).toBe(100);
  });

  it('进行中：成果落后于时间 → 分数介于两端之间', () => {
    const r = computeHealthBreakdown(
      input({
        now: new Date('2026-07-16T00:00:00Z'), // 半程
        actualExposure: 0,
      }),
    );
    expect(r.time).toBeGreaterThan(0);
    expect(r.time).toBeLessThan(100);
  });
});

describe('除零防护', () => {
  it('targetExposure 为 0 → 达成度因子 0 分，不产生 NaN/Infinity', () => {
    const b = computeHealthBreakdown(
      input({ targetExposure: 0, actualExposure: 500 }),
    );
    expect(b.exposure).toBe(0);
    expect(Number.isFinite(b.exposure)).toBe(true);
  });

  it('budgetTotal 为 0 → 预算因子 0 分，不产生 NaN/Infinity', () => {
    const b = computeHealthBreakdown(
      input({ budgetTotal: 0, budgetSpent: 100 }),
    );
    expect(b.budget).toBe(0);
    expect(Number.isFinite(b.budget)).toBe(true);
  });

  it('周期起止同一时刻 → 时间因子 0 分，不产生 NaN/Infinity', () => {
    const same = new Date('2026-07-01T00:00:00Z');
    const b = computeHealthBreakdown(
      input({ periodStart: same, periodEnd: same }),
    );
    expect(b.time).toBe(0);
    expect(Number.isFinite(b.time)).toBe(true);
  });

  it('周期倒挂（止早于起）→ 时间因子 0 分', () => {
    const b = computeHealthBreakdown(
      input({
        periodStart: new Date('2026-07-31T00:00:00Z'),
        periodEnd: new Date('2026-07-01T00:00:00Z'),
      }),
    );
    expect(b.time).toBe(0);
  });

  it('任何输入组合下 score 都不是 NaN', () => {
    const weird: HealthInput[] = [
      input({ targetExposure: 0, budgetTotal: 0 }),
      input({ actualExposure: -100 }),
      input({ budgetSpent: -1 }),
      input({ blockerCount: Number.MAX_SAFE_INTEGER }),
    ];
    for (const w of weird) {
      expect(Number.isNaN(computeHealth(w).score)).toBe(false);
    }
  });
});
