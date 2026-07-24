// M4-INSIGHT F002 — domain/roi-compute.ts 单测 + D20 变异测试。
//
// 变异测试纪律（D20 + 框架 v1.0.6，delivery-check.test.ts / crm-infer.test.ts 先例）：
// 断言验【行为】不验源码关键字，且必须证明检测器活性——破坏判定规则的变异体在同一组
// 断言下必须翻红。若变异体也能全过，说明这组断言根本没在测不变量。
//
// 本函数是「ROI 诚实降级铁律」（spec §3 P1 / 裁决 U1）的判据，
// 最要命的退化方向是【缺证据时编一个数】（分子缺 → roi=0/正数）与
// 【达成方向恒 up / 三值压二态】——变异体 A/B/D/E 专盯这一类。

import { describe, it, expect } from 'vitest';
import {
  computeRoi,
  compareGoal,
  type CompareGoalOptions,
  type GoalComparison,
  type GoalDirection,
  type RoiComputeInput,
  type RoiComputeResult,
} from '../../src/lib/domain/roi-compute';

// ───────────────────────── fixtures ─────────────────────────

/** ROI 分子证据三项（acceptance：任一缺 → insufficient_evidence）。 */
const NUMERATOR_KEYS = ['reach', 'conversions', 'actualExposure'] as const;
type NumeratorKey = (typeof NUMERATOR_KEYS)[number];

/** 分子齐 + spend>0 的可算基线：roi = 250 / 1000 = 0.25（每 USD 转化数口径）。 */
function input(patch: Partial<RoiComputeInput> = {}): RoiComputeInput {
  return {
    spend: 1000,
    reach: 50_000,
    conversions: 250,
    actualExposure: 120_000,
    targetExposure: 100_000,
    ...patch,
  };
}

// ───────────────────────── 契约与形状 ─────────────────────────

describe('computeRoi：返回契约', () => {
  it('分子齐 + spend>0 → basis=computed，roi=conversions/spend（0.25）', () => {
    const r = computeRoi(input());
    expect(r.basis).toBe('computed');
    expect(r.roi).toBe(0.25);
    expect(r.spend).toBe(1000);
  });

  it('纯函数：不修改入参、同输入同输出、返回全新对象', () => {
    const arg = input();
    const snapshot = JSON.parse(JSON.stringify(arg));
    const a = computeRoi(arg);
    const b = computeRoi(arg);
    expect(JSON.parse(JSON.stringify(arg))).toEqual(snapshot);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.exposure).not.toBe(b.exposure);
  });

  it('输出纯数据、可 JSON 序列化往返（F005 画布契约）', () => {
    const r = computeRoi(input());
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    const degraded = computeRoi(input({ reach: null, spend: null }));
    expect(JSON.parse(JSON.stringify(degraded))).toEqual(degraded);
  });
});

// ─────────────────── 全矩阵：分子齐/缺组合（2³）───────────────────

describe('全矩阵：分子三项 present/missing 组合（spend=1000 固定）', () => {
  for (let mask = 0; mask < 8; mask++) {
    const missing = NUMERATOR_KEYS.filter((_, i) => (mask & (1 << i)) !== 0);
    const complete = missing.length === 0;
    const label = complete ? '全齐' : `缺 ${missing.join('+')}`;

    it(`分子${label} → ${complete ? 'roi=0.25 · computed' : 'roi=null · insufficient_evidence'}`, () => {
      const patch: Partial<RoiComputeInput> = {};
      for (const key of missing) patch[key] = null;
      const r = computeRoi(input(patch));

      if (complete) {
        expect(r.roi).toBe(0.25);
        expect(r.basis).toBe('computed');
      } else {
        expect(r.roi).toBeNull(); // 严格 null——绝不填 0 / 不猜
        expect(r.roi).not.toBe(0);
        expect(r.basis).toBe('insufficient_evidence');
      }
    });
  }

  it('分子缺时 spend 照常回显（缺的是分子不是分母，证据面各自如实）', () => {
    const r = computeRoi(input({ reach: null }));
    expect(r.spend).toBe(1000);
    expect(r.basis).toBe('insufficient_evidence');
  });

  it('分子非法值（负数 / NaN / Infinity）按证据无效 → insufficient_evidence', () => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const key of NUMERATOR_KEYS) {
        const r = computeRoi(input({ [key]: bad }));
        expect(r.roi).toBeNull();
        expect(r.basis).toBe('insufficient_evidence');
      }
    }
  });
});

// ─────────────────── spend 语义：缺失 ≠ 0 ───────────────────

describe('spend 语义可区分（acceptance 4）', () => {
  it('spend=null（无花费证据）→ roi=null · insufficient_evidence · 回显 null', () => {
    const r = computeRoi(input({ spend: null }));
    expect(r.roi).toBeNull();
    expect(r.basis).toBe('insufficient_evidence');
    expect(r.spend).toBeNull();
  });

  it('spend=0（确知零花费）→ roi=null · zero_spend · 回显 0', () => {
    const r = computeRoi(input({ spend: 0 }));
    expect(r.roi).toBeNull();
    expect(r.basis).toBe('zero_spend');
    expect(r.spend).toBe(0);
  });

  it('🔒 两者 basis 与 spend 回显都不同——「不知道」不得伪造成「确知为零」', () => {
    const unknown = computeRoi(input({ spend: null }));
    const zero = computeRoi(input({ spend: 0 }));
    expect(unknown.basis).not.toBe(zero.basis);
    expect(unknown.spend).not.toBe(zero.spend);
  });

  it('分子缺 + spend=0 → 分子缺优先（insufficient_evidence，acceptance 硬性在前）', () => {
    const r = computeRoi(input({ conversions: null, spend: 0 }));
    expect(r.basis).toBe('insufficient_evidence');
    expect(r.roi).toBeNull();
  });

  it('spend 非法（负数 / NaN）→ 按无证据处理：insufficient_evidence · 回显 null', () => {
    for (const bad of [-500, Number.NaN]) {
      const r = computeRoi(input({ spend: bad }));
      expect(r.roi).toBeNull();
      expect(r.basis).toBe('insufficient_evidence');
      expect(r.spend).toBeNull();
    }
  });

  it('conversions=0 真测得零 → roi=0 · computed（有证据的零 ≠ 缺证据填零，以 basis 区分）', () => {
    const r = computeRoi(input({ conversions: 0 }));
    expect(r.roi).toBe(0);
    expect(r.basis).toBe('computed');
  });
});

// ─────────────────── 达成方向三值（V8 三值三样式数据源）───────────────────

describe('computeRoi.exposure：目标差异 + 达成方向三值', () => {
  it('实际超目标 → up，delta/deltaRatio 为正（120k vs 100k）', () => {
    const r = computeRoi(input());
    expect(r.exposure.direction).toBe('up');
    expect(r.exposure.delta).toBe(20_000);
    expect(r.exposure.deltaRatio).toBe(0.2);
  });

  it('实际未达 → down，delta 为负（80k vs 100k）', () => {
    const r = computeRoi(input({ actualExposure: 80_000 }));
    expect(r.exposure.direction).toBe('down');
    expect(r.exposure.delta).toBe(-20_000);
    expect(r.exposure.deltaRatio).toBe(-0.2);
  });

  it('持平 → flat（100k vs 100k，三值缺一不可）', () => {
    const r = computeRoi(input({ actualExposure: 100_000 }));
    expect(r.exposure.direction).toBe('flat');
    expect(r.exposure.delta).toBe(0);
    expect(r.exposure.deltaRatio).toBe(0);
  });

  it('🔒 三值逐值可分支：up / down / flat 在同类输入下两两可区分', () => {
    const dirs = new Set<GoalDirection | null>([
      computeRoi(input()).exposure.direction,
      computeRoi(input({ actualExposure: 80_000 })).exposure.direction,
      computeRoi(input({ actualExposure: 100_000 })).exposure.direction,
    ]);
    expect(dirs).toEqual(new Set<GoalDirection | null>(['up', 'down', 'flat']));
  });

  it('目标缺失 → 差异/方向全 null，但 roi 照算（目标不在 ROI 分子中）', () => {
    const r = computeRoi(input({ targetExposure: null }));
    expect(r.exposure.direction).toBeNull();
    expect(r.exposure.delta).toBeNull();
    expect(r.exposure.deltaRatio).toBeNull();
    expect(r.roi).toBe(0.25);
    expect(r.basis).toBe('computed');
  });

  it('actualExposure 缺失 → 方向 null 且 roi 也降级（它同时是分子证据）', () => {
    const r = computeRoi(input({ actualExposure: null }));
    expect(r.exposure.direction).toBeNull();
    expect(r.exposure.actual).toBeNull();
    expect(r.roi).toBeNull();
    expect(r.basis).toBe('insufficient_evidence');
  });
});

describe('compareGoal（standalone：V8 对照表其余行逐对复用同一映射）', () => {
  it('默认极性（越高越好）：超出 up / 未达 down / 持平 flat', () => {
    expect(compareGoal(5000, 5420).direction).toBe('up');
    expect(compareGoal(5000, 4200).direction).toBe('down');
    expect(compareGoal(5000, 5000).direction).toBe('flat');
  });

  it('极性反转（越低越好，单次安装成本行形态）：实际低于目标 = 达成 up', () => {
    const opts: CompareGoalOptions = { higherIsBetter: false };
    expect(compareGoal(1.5, 1.4, opts).direction).toBe('up');
    expect(compareGoal(1.5, 1.6, opts).direction).toBe('down');
    expect(compareGoal(1.5, 1.5, opts).direction).toBe('flat');
  });

  it('delta=0 恒 flat，与极性无关（持平就是持平）', () => {
    expect(compareGoal(32, 32, { higherIsBetter: false }).direction).toBe('flat');
    expect(compareGoal(32, 32, { higherIsBetter: true }).direction).toBe('flat');
  });

  it('任一端缺失 → delta/deltaRatio/direction 全 null（不编造持平/达成）', () => {
    for (const [t, a] of [
      [null, 5000],
      [5000, null],
      [null, null],
    ] as const) {
      const r = compareGoal(t, a);
      expect(r.delta).toBeNull();
      expect(r.deltaRatio).toBeNull();
      expect(r.direction).toBeNull();
    }
  });

  it('非法值（NaN / Infinity）按缺失处理且不透传', () => {
    const r = compareGoal(Number.NaN, Number.POSITIVE_INFINITY);
    expect(r.target).toBeNull();
    expect(r.actual).toBeNull();
    expect(r.direction).toBeNull();
  });

  it('target=0 → deltaRatio=null（不除零），delta 与方向照常', () => {
    const r = compareGoal(0, 120);
    expect(r.delta).toBe(120);
    expect(r.deltaRatio).toBeNull();
    expect(r.direction).toBe('up');
  });
});

/* ────────────────────────────────────────────────────────────────
   变异测试（D20 / 框架 v1.0.6，acceptance 6）

   目的不是再测一遍判定，而是测【上面那些断言本身有没有检测力】。
   做法：把诚实降级不变量各造一个「破坏判定规则」的变异体，用同一组行为断言去跑——
   真实实现必须全过、每个变异体必须至少挂一条。变异体也全过 = 断言是死的。
   ──────────────────────────────────────────────────────────────── */

type RoiFn = (i: RoiComputeInput) => RoiComputeResult;
type CompareFn = (
  target: number | null,
  actual: number | null,
  options?: CompareGoalOptions,
) => GoalComparison;

/** 同一组行为断言，可作用在任意「roi.compute」实现对上。抛错即视为翻红。 */
function roiBehaviourSuite(compute: RoiFn, compare: CompareFn): void {
  // 1) 分子齐 + spend>0 → 必须按口径真算（不许一律降级躲测试）
  const ok = compute(input());
  if (ok.basis !== 'computed' || ok.roi !== 0.25) {
    throw new Error('分子齐且 spend>0 未按 conversions/spend 口径算出 roi');
  }
  // 2) 真测得 conversions=0 → roi=0 是有证据的零（basis 仍是 computed）
  const zeroConv = compute(input({ conversions: 0 }));
  if (zeroConv.roi !== 0 || zeroConv.basis !== 'computed') {
    throw new Error('真测得 conversions=0 未返回 roi=0 + computed');
  }
  // 3) 分子任一缺 → roi 必须 null + insufficient_evidence（最要命的退化：缺证据编数）
  for (const key of NUMERATOR_KEYS) {
    const r = compute(input({ [key]: null }));
    if (r.roi !== null) {
      throw new Error(`分子 ${key} 缺失仍返回了 roi=${r.roi}（缺证据编数）`);
    }
    if (r.basis !== 'insufficient_evidence') {
      throw new Error(`分子 ${key} 缺失时 basis=${r.basis}，不是 insufficient_evidence`);
    }
  }
  // 4) spend 缺失 ≠ spend=0：前者证据不足、后者零花费无定义，不得互相坍缩
  const noSpend = compute(input({ spend: null }));
  const zeroSpend = compute(input({ spend: 0 }));
  if (noSpend.roi !== null || noSpend.basis !== 'insufficient_evidence') {
    throw new Error('spend=null 未按证据不足降级（可能被 ?? 0 伪造成零花费）');
  }
  if (zeroSpend.roi !== null || zeroSpend.basis !== 'zero_spend') {
    throw new Error('spend=0 未按 zero_spend 单列（与 spend 未知混为一谈）');
  }
  // 5) 达成方向三值逐值：up / down / flat 各就各位
  if (compute(input()).exposure.direction !== 'up') {
    throw new Error('实际超目标未判 up');
  }
  if (compute(input({ actualExposure: 80_000 })).exposure.direction !== 'down') {
    throw new Error('实际未达目标未判 down（方向恒 up？）');
  }
  if (compute(input({ actualExposure: 100_000 })).exposure.direction !== 'flat') {
    throw new Error('持平未判 flat（三值被压成二态？）');
  }
  // 6) 缺数据不判方向（null ≠ flat，「无法判断」不得编造成「持平」）
  if (compute(input({ targetExposure: null })).exposure.direction !== null) {
    throw new Error('目标缺失仍给出了达成方向（编造结论）');
  }
  // 7) 极性：越低越好指标下，实际低于目标 = 达成（up）
  if (compare(1.5, 1.4, { higherIsBetter: false }).direction !== 'up') {
    throw new Error('越低越好指标的达成被判反（极性被忽略）');
  }
  if (compare(1.5, 1.6, { higherIsBetter: false }).direction !== 'down') {
    throw new Error('越低越好指标的超支未判 down');
  }
}

describe('D20 变异测试：破坏诚实降级 → 同一组断言必须翻红', () => {
  it('真实实现通过整组行为断言', () => {
    expect(() => roiBehaviourSuite(computeRoi, compareGoal)).not.toThrow();
  });

  it('变异体 A：分子缺时强行返 roi=0（缺证据填零）→ 翻红', () => {
    // 变异：insufficient_evidence 被「兜底成 0」——ROI 造假的最典型形态（P1 的反面）。
    const mutant: RoiFn = (i) => {
      const real = computeRoi(i);
      return real.basis === 'insufficient_evidence'
        ? { ...real, roi: 0, basis: 'computed' }
        : real;
    };
    expect(() => roiBehaviourSuite(mutant, compareGoal)).toThrow();
  });

  it('变异体 B：分子缺时猜一个正数 roi → 翻红', () => {
    // 变异：拿历史均值/拍脑袋数糊弄——比填 0 更隐蔽的造假。
    const mutant: RoiFn = (i) => {
      const real = computeRoi(i);
      return real.roi === null ? { ...real, roi: 1.2 } : real;
    };
    expect(() => roiBehaviourSuite(mutant, compareGoal)).toThrow();
  });

  it('变异体 C：spend ?? 0（把「花费未知」伪造成「确知零花费」）→ 翻红', () => {
    // 变异：最容易在重构中悄悄发生的 falsy 坍缩——两种语义并成一种。
    const mutant: RoiFn = (i) => computeRoi({ ...i, spend: i.spend ?? 0 });
    expect(() => roiBehaviourSuite(mutant, compareGoal)).toThrow();
  });

  it('变异体 D：达成方向恒 up → 翻红', () => {
    // 变异：V8 差异列全绿——未达目标也报喜。
    const mutant: RoiFn = (i) => {
      const real = computeRoi(i);
      return {
        ...real,
        exposure: { ...real.exposure, direction: 'up' as const },
      };
    };
    expect(() => roiBehaviourSuite(mutant, compareGoal)).toThrow();
  });

  it('变异体 E：三值压二态（delta≥0 → up，flat 消失）→ 翻红', () => {
    // 变异：V8 §2.3 明令禁止的简化——「持平」被并入「达成」。
    const mutant: RoiFn = (i) => {
      const real = computeRoi(i);
      const { delta } = real.exposure;
      const direction =
        delta === null ? null : delta >= 0 ? ('up' as const) : ('down' as const);
      return { ...real, exposure: { ...real.exposure, direction } };
    };
    expect(() => roiBehaviourSuite(mutant, compareGoal)).toThrow();
  });

  it('变异体 F：缺数据时方向默认 flat（编造持平）→ 翻红', () => {
    // 变异：null 被「美化」成中性值——「无法判断」与「持平」是两回事。
    const mutant: RoiFn = (i) => {
      const real = computeRoi(i);
      const direction = real.exposure.direction ?? ('flat' as const);
      return { ...real, exposure: { ...real.exposure, direction } };
    };
    expect(() => roiBehaviourSuite(mutant, compareGoal)).toThrow();
  });

  it('变异体 G：极性被忽略（越低越好指标按数值方向判）→ 翻红', () => {
    // 变异：成本类指标省钱被判「未达」——V8 单次安装成本行渲染反色。
    const mutant: CompareFn = (t, a) => compareGoal(t, a);
    expect(() => roiBehaviourSuite(computeRoi, mutant)).toThrow();
  });
});
