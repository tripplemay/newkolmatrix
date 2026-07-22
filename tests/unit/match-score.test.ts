// M2-A-MATCH F002 — 可解释评分纯函数单测。
//
// 验收锚点（features.json F002 acceptance）：
// - 边界全覆盖：similarity 0/1、audienceDemo null 降级、知识画像有无、权重和为 1
// - 不打库不打网关（纯函数，本文件零 mock 零 IO）

import { describe, expect, it } from 'vitest';
import {
  MATCH_WEIGHTS,
  REASON_AUDIENCE_PENDING,
  REASON_KNOWLEDGE_AUDIENCE_PENDING,
  computeMatchScore,
} from 'lib/domain/match-score';
import type { AudienceSlice } from 'lib/data/schemas/knowledge';

const SLICES: AudienceSlice[] = [
  { label: 'FPS 玩家', percent: 60 },
  { label: '二次元', percent: 40 },
];

const DEMO_FPS = { interests: ['fps'] };

describe('MATCH_WEIGHTS（导出常量可测）', () => {
  it('权重和为 1', () => {
    expect(MATCH_WEIGHTS.similarity + MATCH_WEIGHTS.audience).toBe(1);
  });
});

describe('computeMatchScore — 降级路径（FR-11.6）', () => {
  it('audienceDemo null → 纯向量分 + pending=true + reason「受众数据待接入」', () => {
    const r = computeMatchScore({
      similarity: 0.83,
      audienceDemo: null,
      knowledgeAudience: SLICES,
    });
    expect(r.score).toBe(0.83);
    expect(r.pending).toBe(true);
    expect(r.reasons).toContain(REASON_AUDIENCE_PENDING);
  });

  it('知识受众画像 null / 空数组 → 纯向量分 + pending + 对应 reason', () => {
    for (const knowledgeAudience of [null, [] as AudienceSlice[]]) {
      const r = computeMatchScore({
        similarity: 0.5,
        audienceDemo: DEMO_FPS,
        knowledgeAudience,
      });
      expect(r.score).toBe(0.5);
      expect(r.pending).toBe(true);
      expect(r.reasons).toContain(REASON_KNOWLEDGE_AUDIENCE_PENDING);
    }
  });

  it('audienceDemo 形状提不出 interests 信号 → 视为缺失降级（D2 不抛错）', () => {
    for (const demo of ['broken', 42, {}, { interests: 'x' }, { interests: [] }, { interests: [1] }]) {
      const r = computeMatchScore({
        similarity: 0.6,
        audienceDemo: demo,
        knowledgeAudience: SLICES,
      });
      expect(r.pending).toBe(true);
      expect(r.score).toBe(0.6);
    }
  });

  it('similarity 边界：0 → score 0；1 → score 1（降级路径直通）', () => {
    const zero = computeMatchScore({
      similarity: 0,
      audienceDemo: null,
      knowledgeAudience: null,
    });
    expect(zero.score).toBe(0);
    const one = computeMatchScore({
      similarity: 1,
      audienceDemo: null,
      knowledgeAudience: null,
    });
    expect(one.score).toBe(1);
  });

  it('similarity 越界 / 非有限值钳到 [0,1]', () => {
    expect(
      computeMatchScore({ similarity: 1.7, audienceDemo: null, knowledgeAudience: null }).score,
    ).toBe(1);
    expect(
      computeMatchScore({ similarity: -0.3, audienceDemo: null, knowledgeAudience: null }).score,
    ).toBe(0);
    expect(
      computeMatchScore({ similarity: NaN, audienceDemo: null, knowledgeAudience: null }).score,
    ).toBe(0);
  });
});

describe('computeMatchScore — 加权组合路径', () => {
  it('两因子齐备 → similarity*0.7 + fit*0.3，pending=false', () => {
    // interests ['fps'] 命中「FPS 玩家」(60) 未命中「二次元」(40) → fit = 60/100 = 0.6
    const r = computeMatchScore({
      similarity: 0.8,
      audienceDemo: DEMO_FPS,
      knowledgeAudience: SLICES,
    });
    expect(r.pending).toBe(false);
    expect(r.score).toBeCloseTo(0.8 * MATCH_WEIGHTS.similarity + 0.6 * MATCH_WEIGHTS.audience, 10);
  });

  it('受众 reason 注明来源（游戏知识库受众画像）', () => {
    const r = computeMatchScore({
      similarity: 0.8,
      audienceDemo: DEMO_FPS,
      knowledgeAudience: SLICES,
    });
    expect(r.reasons.some((x) => x.includes('游戏知识库受众画像'))).toBe(true);
  });

  it('全切片命中 → fit=1；零命中 → fit=0（纯 similarity 加权项）', () => {
    const all = computeMatchScore({
      similarity: 0.5,
      audienceDemo: { interests: ['fps', '二次元'] },
      knowledgeAudience: SLICES,
    });
    expect(all.score).toBeCloseTo(0.5 * MATCH_WEIGHTS.similarity + 1 * MATCH_WEIGHTS.audience, 10);

    const none = computeMatchScore({
      similarity: 0.5,
      audienceDemo: { interests: ['烹饪' ] },
      knowledgeAudience: SLICES,
    });
    expect(none.pending).toBe(false); // 参与了加权，只是契合为 0——不是降级
    expect(none.score).toBeCloseTo(0.5 * MATCH_WEIGHTS.similarity, 10);
  });

  it('切片 percent 全 0 → fit=0 不除零', () => {
    const r = computeMatchScore({
      similarity: 0.5,
      audienceDemo: DEMO_FPS,
      knowledgeAudience: [{ label: 'FPS 玩家', percent: 0 }],
    });
    expect(r.pending).toBe(false);
    expect(r.score).toBeCloseTo(0.5 * MATCH_WEIGHTS.similarity, 10);
  });
});

describe('computeMatchScore — 可解释依据不变式', () => {
  it('任何路径 reasons 恒非空（PlanKol.reasons 写侧非空的上游保证）', () => {
    const cases = [
      { similarity: 0, audienceDemo: null, knowledgeAudience: null },
      { similarity: 1, audienceDemo: DEMO_FPS, knowledgeAudience: SLICES },
      { similarity: 0.4, audienceDemo: {}, knowledgeAudience: [] as AudienceSlice[] },
    ];
    for (const c of cases) {
      expect(computeMatchScore(c).reasons.length).toBeGreaterThan(0);
    }
  });

  it('score 恒在 [0,1]', () => {
    for (const sim of [0, 0.25, 0.5, 0.75, 1]) {
      for (const demo of [null, DEMO_FPS]) {
        for (const ka of [null, SLICES]) {
          const { score } = computeMatchScore({
            similarity: sim,
            audienceDemo: demo,
            knowledgeAudience: ka,
          });
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
