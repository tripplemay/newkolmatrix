// M2-A-MATCH F001 — 匹配平面 zod 契约单测。
//
// 验收锚点（features.json F001 acceptance）：
// - metrics/doubts 读侧宽松降级：脏数据 → null 不抛错（D2）
// - PlanKol.reasons 写侧非空：空数组拒收（FR-11.9 先例）
// - 枚举与 Prisma enum 逐字一致

import { describe, expect, it } from 'vitest';
import {
  assertPlanKolReasons,
  candidateVerdictSchema,
  matchPlanStatusSchema,
  parseDoubts,
  parsePlanMetrics,
  planKolReasonsSchema,
  type PlanMetrics,
} from 'lib/data/schemas/match';

describe('matchPlanStatusSchema / candidateVerdictSchema（与 Prisma enum 逐字一致）', () => {
  it('MatchPlanStatus 三值合法', () => {
    for (const v of ['draft', 'approved', 'superseded']) {
      expect(matchPlanStatusSchema.parse(v)).toBe(v);
    }
  });

  it('CandidateVerdict 三值合法', () => {
    for (const v of ['pending', 'kept', 'dropped']) {
      expect(candidateVerdictSchema.parse(v)).toBe(v);
    }
  });

  it('未知值拒收', () => {
    expect(matchPlanStatusSchema.safeParse('published').success).toBe(false);
    expect(candidateVerdictSchema.safeParse('rejected').success).toBe(false);
  });
});

describe('parsePlanMetrics（读侧宽松降级 D2）', () => {
  it('合法形状 → 原样返回', () => {
    const m: PlanMetrics = {
      reachTotal: 2400000,
      budgetUsd: null,
      risk: 'mid',
      people: 8,
    };
    expect(parsePlanMetrics(m)).toEqual(m);
  });

  it('nullable 字段全 null 合法（P6 budgetUsd 恒 null；reachTotal/risk 不可判）', () => {
    const m: PlanMetrics = {
      reachTotal: null,
      budgetUsd: null,
      risk: null,
      people: 0,
    };
    expect(parsePlanMetrics(m)).toEqual(m);
  });

  it('脏数据 → null 不抛错：people 缺失', () => {
    expect(
      parsePlanMetrics({ reachTotal: 1, budgetUsd: null, risk: null }),
    ).toBeNull();
  });

  it('脏数据 → null 不抛错：risk 非法值', () => {
    expect(
      parsePlanMetrics({
        reachTotal: 1,
        budgetUsd: null,
        risk: 'extreme',
        people: 3,
      }),
    ).toBeNull();
  });

  it('脏数据 → null 不抛错：负数 reachTotal', () => {
    expect(
      parsePlanMetrics({
        reachTotal: -5,
        budgetUsd: null,
        risk: null,
        people: 3,
      }),
    ).toBeNull();
  });

  it('非对象输入（null / 串 / 数组）→ null 不抛错', () => {
    expect(parsePlanMetrics(null)).toBeNull();
    expect(parsePlanMetrics('broken')).toBeNull();
    expect(parsePlanMetrics([1, 2])).toBeNull();
    expect(parsePlanMetrics(undefined)).toBeNull();
  });
});

describe('parseDoubts（读侧宽松降级 D2）', () => {
  it('合法串数组 → 原样返回（空数组合法：无存疑）', () => {
    expect(parseDoubts(['受众数据待接入'])).toEqual(['受众数据待接入']);
    expect(parseDoubts([])).toEqual([]);
  });

  it('脏数据 → null 不抛错', () => {
    expect(parseDoubts([1, 2])).toBeNull();
    expect(parseDoubts('not-array')).toBeNull();
    expect(parseDoubts(null)).toBeNull();
  });
});

describe('assertPlanKolReasons（写侧非空，FR-11.9 先例）', () => {
  it('非空 reasons → 原样返回', () => {
    const r = ['matchScore 0.87', '入选规则：score 优先'];
    expect(assertPlanKolReasons(r)).toEqual(r);
  });

  it('空数组 → 抛错（可解释依据必带，空则非法）', () => {
    expect(() => assertPlanKolReasons([])).toThrow();
  });

  it('含空串条目 → 抛错', () => {
    expect(() => assertPlanKolReasons([''])).toThrow();
    expect(planKolReasonsSchema.safeParse(['ok', '']).success).toBe(false);
  });
});
