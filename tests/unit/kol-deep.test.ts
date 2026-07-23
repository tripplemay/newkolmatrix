// M2-B-CREATORS F002 — 深字段契约 + 派生纯函数单测。
//
// 验收锚点：
// - refine 空依据非法（:838 欠账兑现 FR-11.4）：credibility.signals / brandSafety.flags
// - 读侧宽松 parse* → null 不抛错（D2）/ 写侧 assert* 抛错双形态
// - 派生边界：tags 空/空串/YT qualityScore null/弱信号全缺 → null 不编造；
//   权重和 = 1；缺席因子重新归一化；分域钳制
// - 纯函数零 IO（本文件零 mock 零网络零库）

import { describe, expect, it } from 'vitest';
import {
  audienceDemoSchema,
  brandSafetySchema,
  credibilitySchema,
  parseAudienceDemo,
  parseBrandSafety,
  parseCredibility,
} from 'lib/data/schemas/kol-deep';
import {
  CREDIBILITY_METHOD,
  CREDIBILITY_WEIGHTS,
  INTERESTS_MAX,
  TIER_SCORE,
  deriveAudienceDemo,
  deriveCredibility,
  deriveFieldProvenance,
} from 'lib/kol-sync/derive';
import type { ApifyKolRow } from 'lib/apify/schemas';

/** 最小合法上游行（其余字段 nullish）。 */
function row(over: Partial<ApifyKolRow> = {}): ApifyKolRow {
  return {
    id: '1',
    platform: 'youtube',
    platformUserId: 'UC1',
    username: 'u1',
    ...over,
  } as ApifyKolRow;
}

describe('kol-deep zod 契约（读宽松/写严格 + refine 给分必给依据）', () => {
  it('credibility：signals 空数组 = 非法（FR-11.4）；非空合法', () => {
    const base = {
      score: 80,
      method: CREDIBILITY_METHOD,
      signals: ['平台认证 ✓'],
      assessedAt: '2026-07-23T00:00:00Z',
    };
    expect(credibilitySchema.safeParse(base).success).toBe(true);
    expect(
      credibilitySchema.safeParse({ ...base, signals: [] }).success,
    ).toBe(false);
    expect(
      credibilitySchema.safeParse({ ...base, signals: [''] }).success,
    ).toBe(false); // 空皮依据同拒
  });

  it('brandSafety：flags 空 = 非法；rating 枚举外拒', () => {
    const base = {
      rating: 'review',
      flags: ['争议内容历史待人工复核'],
      assessedAt: '2026-07-23T00:00:00Z',
    };
    expect(brandSafetySchema.safeParse(base).success).toBe(true);
    expect(brandSafetySchema.safeParse({ ...base, flags: [] }).success).toBe(false);
    expect(
      brandSafetySchema.safeParse({ ...base, rating: 'danger' }).success,
    ).toBe(false);
  });

  it('audienceDemo：interests 写侧非空；分布三键 optional；占比域 0-100', () => {
    expect(
      audienceDemoSchema.safeParse({ interests: ['fps'] }).success,
    ).toBe(true);
    expect(audienceDemoSchema.safeParse({ interests: [] }).success).toBe(false);
    expect(
      audienceDemoSchema.safeParse({
        interests: ['fps'],
        ageDist: { '18-24': 142 },
      }).success,
    ).toBe(false);
  });

  it('读侧宽松 parse* → 脏数据 null 不抛错（D2）', () => {
    for (const dirty of [null, undefined, 'broken', 42, { score: 'high' }]) {
      expect(parseAudienceDemo(dirty)).toBeNull();
      expect(parseCredibility(dirty)).toBeNull();
      expect(parseBrandSafety(dirty)).toBeNull();
    }
  });
});

describe('deriveAudienceDemo（标签归一派生）', () => {
  it('matchedTags + matchedKeywords + businessCategory 归一去重（大小写不敏感）', () => {
    const d = deriveAudienceDemo(
      row({
        matchedTags: ['Minecraft', 'gaming', ' minecraft '],
        matchedKeywords: ['Gaming', 'sandbox'],
        businessCategory: '电游玩家',
      }),
    );
    expect(d).not.toBeNull();
    expect(d!.interests).toEqual(['Minecraft', 'gaming', 'sandbox', '电游玩家']);
  });

  it('全空 / 空串 → null 不编造', () => {
    expect(deriveAudienceDemo(row())).toBeNull();
    expect(
      deriveAudienceDemo(
        row({ matchedTags: [], matchedKeywords: [], businessCategory: '' }),
      ),
    ).toBeNull();
    expect(deriveAudienceDemo(row({ businessCategory: '   ' }))).toBeNull();
  });

  it('上限截断 INTERESTS_MAX（去噪）', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag${i}`);
    const d = deriveAudienceDemo(row({ matchedTags: many }));
    expect(d!.interests.length).toBe(INTERESTS_MAX);
  });
});

describe('deriveCredibility（弱信号规则合成）', () => {
  const AT = '2026-07-23T00:00:00Z';

  it('权重和为 1（导出常量可测）', () => {
    expect(
      CREDIBILITY_WEIGHTS.verified +
        CREDIBILITY_WEIGHTS.quality +
        CREDIBILITY_WEIGHTS.tier,
    ).toBeCloseTo(1, 10);
  });

  it('三因子齐备：加权合成 + signals 逐条人话依据 + method/assessedAt', () => {
    const c = deriveCredibility(
      row({ verified: true, qualityScore: 0.8, tier: 'hot' }),
      AT,
    );
    expect(c).not.toBeNull();
    // 0.35*1 + 0.35*0.8 + 0.3*1 = 0.93 → 93
    expect(c!.score).toBe(93);
    expect(c!.signals).toEqual([
      '平台认证 ✓',
      '互动质量分 0.80（采集侧实测）',
      '热度分层 hot',
    ]);
    expect(c!.method).toBe(CREDIBILITY_METHOD);
    expect(c!.assessedAt).toBe(AT);
  });

  it('缺席因子重新归一化（YT qualityScore 恒 null 不被冤枉计 0）', () => {
    const c = deriveCredibility(row({ verified: true, tier: 'hot' }), AT);
    // quality 缺席：(0.35*1 + 0.3*1) / 0.65 = 1 → 100
    expect(c!.score).toBe(100);
    expect(c!.signals).toHaveLength(2);
  });

  it('弱信号全缺 → null 不编造；tier 枚举外按 cold 保守', () => {
    expect(deriveCredibility(row(), AT)).toBeNull();
    const c = deriveCredibility(row({ tier: 'legendary' }), AT);
    expect(c!.score).toBe(Math.round(TIER_SCORE.cold * 100));
  });

  it('qualityScore 越界钳制 [0,1]；verified=false 计 0 但 signal 仍在（诚实）', () => {
    const c = deriveCredibility(row({ verified: false, qualityScore: 1.7 }), AT);
    // (0.35*0 + 0.35*1)/0.7 = 0.5 → 50
    expect(c!.score).toBe(50);
    expect(c!.signals).toContain('平台认证 ✗');
  });
});

describe('deriveFieldProvenance（读写不对称）', () => {
  const AT = '2026-07-23T00:00:00Z';

  it('只为实际写入的字段标注；detail 明示派生非实测；source 六档内 crawl', () => {
    const demo = deriveAudienceDemo(row({ matchedTags: ['fps'] }));
    const cred = deriveCredibility(row({ verified: true }), AT);
    const fp = deriveFieldProvenance({
      audienceDemo: demo,
      credibility: cred,
      fetchedAt: AT,
    });
    expect(Object.keys(fp).sort()).toEqual(['audienceDemo', 'credibility']);
    expect(fp.audienceDemo).toMatchObject({ source: 'crawl', fetchedAt: AT });
    expect(fp.audienceDemo.detail).toContain('派生');
  });

  it('两字段全 null → 空对象（无值不标注）', () => {
    expect(
      deriveFieldProvenance({ audienceDemo: null, credibility: null, fetchedAt: AT }),
    ).toEqual({});
  });
});
