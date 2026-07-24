// M4-INSIGHT F003 — domain/attribution-gaps.ts 单测 + D20 变异测试。
//
// 变异测试纪律（D20 + 框架 v1.0.6，delivery-check.test.ts / crm-infer.test.ts 先例）：
// 断言验【行为】不验源码关键字，且必须证明检测器活性——破坏判定规则的变异体在同一组
// 断言下必须翻红。若变异体也能全过，说明这组断言根本没在测不变量。
//
// 本函数是「诚实归因边界」的判据（V8 证据缺口卡 / compute_roi / weekly-draft 三处复用，P2），
// 最要命的退化方向有两个：缺口被吞成空清单（假完整）、有缺口却强行标 complete（强行归因）——
// 变异体 A/B 专盯这两类；C/D/E 盯口径混同（承诺额冒充放款 / null 填 0 / 弱证据无证据压一码）。

import { describe, it, expect } from 'vitest';
import {
  attributionGaps,
  ATTRIBUTION_METRICS,
  type AttributionGap,
  type AttributionGapReason,
  type AttributionGapsInput,
  type AttributionGapsResult,
  type SpendSource,
} from '../../src/lib/domain/attribution-gaps';

// ───────────────────────── fixtures ─────────────────────────

/** 证据齐备基线：released 放款真源 + 曝光/转化均已回传。 */
function input(patch: Partial<AttributionGapsInput> = {}): AttributionGapsInput {
  return {
    spend: 1200.5,
    spendSource: 'payout',
    currency: 'USD',
    reach: 5420,
    conversions: 132,
    ...patch,
  };
}

/** spend 维度全矩阵：数额 × 口径 的所有组合 → 期望缺口码（null = 无缺口）。 */
const SPEND_CASES: readonly {
  label: string;
  spend: number | null;
  spendSource: SpendSource | null;
  expected: AttributionGapReason | null;
}[] = [
  { label: 'payout+数额（released 真源）', spend: 1200.5, spendSource: 'payout', expected: null },
  { label: 'quote+数额（仅承诺额）', spend: 800, spendSource: 'quote', expected: 'SPEND_COMMITTED_ONLY' },
  { label: 'none+数额（来源不可核，fail-safe 按缺）', spend: 800, spendSource: 'none', expected: 'SPEND_ABSENT' },
  { label: '口径缺失+数额（fail-safe 按缺）', spend: 800, spendSource: null, expected: 'SPEND_ABSENT' },
  { label: 'payout+null（值缺即缺）', spend: null, spendSource: 'payout', expected: 'SPEND_ABSENT' },
  { label: 'quote+null（值缺即缺）', spend: null, spendSource: 'quote', expected: 'SPEND_ABSENT' },
  { label: 'none+null（无真源）', spend: null, spendSource: 'none', expected: 'SPEND_ABSENT' },
  { label: '双缺失', spend: null, spendSource: null, expected: 'SPEND_ABSENT' },
] as const;

/** reach / conversions 三态：null 缺 · 0 真实回传 · 正数真实回传。 */
const NUMERATOR_CASES: readonly { label: string; value: number | null; absent: boolean }[] = [
  { label: 'null（未回传）', value: null, absent: true },
  { label: '0（真实回传零，非缺口）', value: 0, absent: false },
  { label: '正数', value: 5420, absent: false },
] as const;

// ───────────────────────── 契约与形状 ─────────────────────────

describe('attributionGaps：返回契约', () => {
  it('证据齐备 → gaps 空数组 + complete=true（诚实：不虚报缺口）', () => {
    const r = attributionGaps(input());
    expect(r.gaps).toEqual([]);
    expect(r.complete).toBe(true);
    expect(r.byMetric).toEqual({ spend: null, reach: null, conversions: null });
  });

  it('gaps 按漏斗序（spend → reach → conversions）稳定输出', () => {
    const r = attributionGaps(
      input({ spend: null, spendSource: 'none', reach: null, conversions: null }),
    );
    expect(r.gaps.map((g) => g.metric)).toEqual(['spend', 'reach', 'conversions']);
    expect(ATTRIBUTION_METRICS).toEqual(['spend', 'reach', 'conversions']);
  });

  it('byMetric 与 gaps 同源（页面按维度分支与清单渲染不会分叉）', () => {
    const r = attributionGaps(input({ reach: null, spendSource: 'quote' }));
    for (const gap of r.gaps) {
      expect(r.byMetric[gap.metric]).toBe(gap);
    }
    const listed = new Set(r.gaps.map((g) => g.metric));
    for (const metric of ATTRIBUTION_METRICS) {
      if (!listed.has(metric)) expect(r.byMetric[metric]).toBeNull();
    }
  });

  it('complete 恒等于 gaps 为空（不存在「有缺口但 complete」的第三态）', () => {
    for (const s of SPEND_CASES) {
      for (const n of NUMERATOR_CASES) {
        const r = attributionGaps(
          input({ spend: s.spend, spendSource: s.spendSource, reach: n.value, conversions: n.value }),
        );
        expect(r.complete).toBe(r.gaps.length === 0);
      }
    }
  });

  it('纯函数：不修改入参、同输入同输出、返回全新对象', () => {
    const arg = input({ spendSource: 'quote', reach: null });
    const snapshot = JSON.parse(JSON.stringify(arg));
    const a = attributionGaps(arg);
    const b = attributionGaps(arg);
    expect(JSON.parse(JSON.stringify(arg))).toEqual(snapshot);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.gaps).not.toBe(b.gaps);
  });

  it('committed 事实只在 SPEND_COMMITTED_ONLY 出现，其余缺口为 null（D2：无事实不冒充）', () => {
    const quote = attributionGaps(input({ spend: 800, spendSource: 'quote', currency: 'USD' }));
    expect(quote.byMetric.spend).toEqual({
      metric: 'spend',
      reason: 'SPEND_COMMITTED_ONLY',
      committed: { amount: 800, currency: 'USD' },
    });

    const absent = attributionGaps(
      input({ spend: null, spendSource: 'none', reach: null, conversions: null }),
    );
    for (const gap of absent.gaps) expect(gap.committed).toBeNull();
  });

  it('currency 缺失 → committed.currency=null（不填 "" 冒充，沿 M3-A budgetUsd 口径「待核」留给渲染方）', () => {
    const r = attributionGaps(input({ spend: 800, spendSource: 'quote', currency: null }));
    expect(r.byMetric.spend?.committed).toEqual({ amount: 800, currency: null });
  });
});

// ───────────────────────── 全矩阵：spend 口径 × 分子缺失组合 ─────────────────────────

describe('全矩阵：spend 数额 × 口径（P3 payout/quote/none）', () => {
  for (const c of SPEND_CASES) {
    it(`${c.label} → ${c.expected ?? '无缺口'}`, () => {
      const r = attributionGaps(input({ spend: c.spend, spendSource: c.spendSource }));
      if (c.expected == null) {
        expect(r.byMetric.spend).toBeNull();
        expect(r.gaps.some((g) => g.metric === 'spend')).toBe(false);
      } else {
        expect(r.byMetric.spend?.reason).toBe(c.expected);
        expect(r.gaps.some((g) => g.metric === 'spend' && g.reason === c.expected)).toBe(true);
        expect(r.complete).toBe(false);
      }
    });
  }

  it('🔒 弱证据与无证据不得压成一码：quote 与 none 在同一联合里可区分', () => {
    const committed = attributionGaps(input({ spend: 800, spendSource: 'quote' }));
    const absent = attributionGaps(input({ spend: null, spendSource: 'none' }));
    expect(committed.byMetric.spend?.reason).toBe('SPEND_COMMITTED_ONLY');
    expect(absent.byMetric.spend?.reason).toBe('SPEND_ABSENT');
    expect(committed.byMetric.spend?.reason).not.toBe(absent.byMetric.spend?.reason);
  });
});

describe('全矩阵：reach × conversions 三态组合（各分子缺失组合）', () => {
  for (const reach of NUMERATOR_CASES) {
    for (const conv of NUMERATOR_CASES) {
      const expected: AttributionGapReason[] = [
        ...(reach.absent ? (['REACH_ABSENT'] as const) : []),
        ...(conv.absent ? (['CONVERSIONS_ABSENT'] as const) : []),
      ];
      it(`reach=${reach.label} × conversions=${conv.label} → [${expected.join(', ') || '无分子缺口'}]`, () => {
        const r = attributionGaps(input({ reach: reach.value, conversions: conv.value }));
        expect(r.gaps.map((g) => g.reason)).toEqual(expected);
        expect(r.complete).toBe(expected.length === 0);
      });
    }
  }

  it('M5 前常态（reach/conversions 双缺 + payout 真源）→ 恰好两条分子缺口，逐条可分支', () => {
    const r = attributionGaps(input({ reach: null, conversions: null }));
    expect(r.gaps).toEqual([
      { metric: 'reach', reason: 'REACH_ABSENT', committed: null },
      { metric: 'conversions', reason: 'CONVERSIONS_ABSENT', committed: null },
    ]);
    expect(r.complete).toBe(false);
  });

  it('🔒 0 是真实回传值不是缺口（「上报为零」≠「未上报」，D2 诚实语义）', () => {
    const r = attributionGaps(input({ reach: 0, conversions: 0 }));
    expect(r.gaps).toEqual([]);
    expect(r.complete).toBe(true);
  });
});

describe('三维全缺（洞察域冷启动最坏形态）', () => {
  it('spend/reach/conversions 全无 → 三条缺口逐条列出，不是一句「证据不足」', () => {
    const r = attributionGaps({
      spend: null,
      spendSource: 'none',
      currency: null,
      reach: null,
      conversions: null,
    });
    expect(r.gaps).toEqual([
      { metric: 'spend', reason: 'SPEND_ABSENT', committed: null },
      { metric: 'reach', reason: 'REACH_ABSENT', committed: null },
      { metric: 'conversions', reason: 'CONVERSIONS_ABSENT', committed: null },
    ]);
    expect(r.complete).toBe(false);
  });
});

/* ────────────────────────────────────────────────────────────────
   变异测试（D20 / 框架 v1.0.6，acceptance）

   目的不是再测一遍判定，而是测【上面那些断言本身有没有检测力】。
   做法：把「诚实归因」不变量各造一个破坏判定规则的变异体，用同一组行为断言去跑——
   真实实现必须全过、每个变异体必须至少挂一条。变异体也全过 = 断言是死的。
   ──────────────────────────────────────────────────────────────── */

type GapsFn = (i: AttributionGapsInput) => AttributionGapsResult;

/** 同一组行为断言，可作用在任意「证据缺口清单」实现上。抛错即视为翻红。 */
function attributionBehaviourSuite(gapsOf: GapsFn): void {
  // 1) 正例：证据齐备 → 空清单 + complete（不虚报缺口）
  const full = gapsOf(input());
  if (full.gaps.length !== 0 || !full.complete) {
    throw new Error('证据齐备却虚报缺口 / 不标 complete');
  }
  // 2) reach 未回传 → 必须列 REACH_ABSENT（最要命的退化：缺口被吞成空清单）
  const noReach = gapsOf(input({ reach: null }));
  if (!noReach.gaps.some((g) => g.metric === 'reach' && g.reason === 'REACH_ABSENT')) {
    throw new Error('reach 缺失被吞，未列 REACH_ABSENT');
  }
  // 3) conversions 未回传 → 必须列 CONVERSIONS_ABSENT
  const noConv = gapsOf(input({ conversions: null }));
  if (!noConv.gaps.some((g) => g.metric === 'conversions' && g.reason === 'CONVERSIONS_ABSENT')) {
    throw new Error('conversions 缺失被吞，未列 CONVERSIONS_ABSENT');
  }
  // 4) 有缺口时绝不 complete（强行标 complete = 强行归因，P1 的反面）
  if (noReach.complete || noConv.complete) {
    throw new Error('有缺口却强行标 complete');
  }
  // 5) 仅承诺额 → SPEND_COMMITTED_ONLY（承诺额不得冒充实际放款）
  const quoted = gapsOf(input({ spend: 800, spendSource: 'quote' }));
  if (!quoted.gaps.some((g) => g.metric === 'spend' && g.reason === 'SPEND_COMMITTED_ONLY')) {
    throw new Error('quote 承诺额被当成 released 放款，未列 SPEND_COMMITTED_ONLY');
  }
  if (quoted.complete) {
    throw new Error('仅承诺额却标 complete');
  }
  // 6) 花费无真源 → SPEND_ABSENT，且与 SPEND_COMMITTED_ONLY 可区分（弱证据 ≠ 无证据）
  const absent = gapsOf(input({ spend: null, spendSource: 'none' }));
  const absentReason = absent.gaps.find((g) => g.metric === 'spend')?.reason;
  if (absentReason !== 'SPEND_ABSENT') {
    throw new Error('花费无真源未列 SPEND_ABSENT');
  }
  const quotedReason = quoted.gaps.find((g) => g.metric === 'spend')?.reason;
  if (quotedReason === absentReason) {
    throw new Error('SPEND_COMMITTED_ONLY 与 SPEND_ABSENT 被压成一码');
  }
  // 7) 0 是真实回传值：不得把「上报为零」当「未上报」虚报缺口
  const zeros = gapsOf(input({ reach: 0, conversions: 0 }));
  if (zeros.gaps.length !== 0 || !zeros.complete) {
    throw new Error('回传值 0 被虚报成缺口');
  }
  // 8) 多维同缺 → 逐条列出（调用方「缺什么显什么」，不是一句「证据不足」）
  const worst = gapsOf(
    input({ spend: null, spendSource: 'none', reach: null, conversions: null }),
  );
  if (worst.gaps.length !== 3 || worst.complete) {
    throw new Error('三维全缺未逐条列出三条缺口');
  }
  // 9) byMetric 与 gaps 不得分叉（两条渲染路径同一真相源）
  for (const gap of worst.gaps) {
    const indexed = worst.byMetric[gap.metric];
    if (indexed == null || indexed.reason !== gap.reason) {
      throw new Error('byMetric 与 gaps 分叉');
    }
  }
}

describe('D20 变异测试：破坏判定规则 → 同一组断言必须翻红', () => {
  it('真实实现通过整组行为断言', () => {
    expect(() => attributionBehaviourSuite(attributionGaps)).not.toThrow();
  });

  it('变异体 A：缺口被吞成空清单（假完整）→ 翻红', () => {
    // 变异：结论层直接清空 gaps 并标 complete——V8 证据缺口卡永远显示「无缺口」，
    // 诚实归因边界整个失效（acceptance 点名的第一退化方向）。
    const mutant: GapsFn = (i) => ({
      ...attributionGaps(i),
      gaps: [],
      byMetric: { spend: null, reach: null, conversions: null },
      complete: true,
    });
    expect(() => attributionBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 B：有缺口仍强行标 complete → 翻红', () => {
    // 变异：清单还在但 complete 恒 true——下游只看 complete 位的消费方
    // （compute_roi / weekly-draft）会强行归因（acceptance 点名的第二退化方向）。
    const mutant: GapsFn = (i) => ({ ...attributionGaps(i), complete: true });
    expect(() => attributionBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 C：quote 承诺额冒充 payout 放款 → 翻红', () => {
    // 变异：口径标注被抹平——仅承诺未放款的花费被当成 released 真源，
    // ROI 分母造假的最短路径。
    const mutant: GapsFn = (i) =>
      attributionGaps({
        ...i,
        spendSource: i.spendSource === 'quote' ? 'payout' : i.spendSource,
      });
    expect(() => attributionBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 D：缺失分子填 0（null → 0 强行归因）→ 翻红', () => {
    // 变异：P1 铁律「绝不填 0」的反面——未回传被填成 0，
    // 缺口消失且下游会用 0 分子算出假 ROI。
    const mutant: GapsFn = (i) =>
      attributionGaps({
        ...i,
        reach: i.reach ?? 0,
        conversions: i.conversions ?? 0,
      });
    expect(() => attributionBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 E：弱证据与无证据压成一码（COMMITTED_ONLY 并入 ABSENT）→ 翻红', () => {
    // 变异：二码压一码——「有承诺额待放款」与「完全没有花费证据」混为一谈，
    // 页面无从提示用户去完成放款闭环（渲染分支被删的典型简化）。
    const mutant: GapsFn = (i) => {
      const real = attributionGaps(i);
      const squash = (g: AttributionGap): AttributionGap =>
        g.reason === 'SPEND_COMMITTED_ONLY'
          ? { ...g, reason: 'SPEND_ABSENT', committed: null }
          : g;
      const gaps = real.gaps.map(squash);
      return {
        ...real,
        gaps,
        byMetric: {
          spend: real.byMetric.spend ? squash(real.byMetric.spend) : null,
          reach: real.byMetric.reach,
          conversions: real.byMetric.conversions,
        },
      };
    };
    expect(() => attributionBehaviourSuite(mutant)).toThrow();
  });

  it('变异体 F：byMetric 与 gaps 分叉（索引层吞缺口）→ 翻红', () => {
    // 变异：清单诚实但索引被清空——按维度分支渲染的页面看到「无缺口」，
    // 两条渲染路径出现两个真相。
    const mutant: GapsFn = (i) => ({
      ...attributionGaps(i),
      byMetric: { spend: null, reach: null, conversions: null },
    });
    expect(() => attributionBehaviourSuite(mutant)).toThrow();
  });
});
