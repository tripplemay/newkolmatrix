// M2-B-CREATORS F004 — 创作者视图契约单测（kolToCreatorView 映射 + 分级阈值）。
//
// 验收锚点：
// - P5：库级 match 恒 null（待核，不编造）；reuse null（无 CRM 源）
// - cred ← credibility.score 分级（阈值常量导出）；脏 credibility → null 待核
// - ad ← brandSafety：safe → ok；null/review/risk → warn（待核）
// - deep：interests 真值入 aud；分布三键 null；无 interests → aud null；
//   real ring ← credibility.score；契约位脏数据不抛错（D2）

import { describe, expect, it } from 'vitest';
import {
  CRED_GRADE_THRESHOLDS,
  kolToCreatorView,
  resolveCredGrade,
  type KolRowLike,
} from 'lib/display/creator-format';

function kol(over: Partial<KolRowLike> = {}): KolRowLike {
  return {
    id: 'k1',
    publicId: 'pk1',
    displayName: '测试创作者',
    handle: 'tester',
    platform: 'youtube',
    followers: 420_000,
    categories: ['gaming', 'fps'],
    audienceDemo: null,
    credibility: null,
    brandSafety: null,
    dataSource: 'crawl',
    fieldProvenance: null,
    ...over,
  } as KolRowLike;
}

const CRED = {
  score: 93,
  method: 'rule-derived-from-crawl',
  signals: ['平台认证 ✓'],
  assessedAt: '2026-07-23T00:00:00Z',
};

describe('resolveCredGrade（阈值常量导出）', () => {
  it('≥A 阈值 → A；≥B → B；其余 C', () => {
    expect(resolveCredGrade(CRED_GRADE_THRESHOLDS.A)).toBe('A');
    expect(resolveCredGrade(CRED_GRADE_THRESHOLDS.B)).toBe('B');
    expect(resolveCredGrade(CRED_GRADE_THRESHOLDS.B - 1)).toBe('C');
  });
});

describe('kolToCreatorView — 列映射', () => {
  it('P5：match 恒 null（库级待核）；reuse null（无 CRM）', () => {
    const v = kolToCreatorView(kol({ credibility: CRED }));
    expect(v.match).toBeNull();
    expect(v.reuse).toBeNull();
  });

  it('cred 分级：93 → A；脏 credibility → null（D2 不抛错）', () => {
    expect(kolToCreatorView(kol({ credibility: CRED })).cred).toBe('A');
    expect(kolToCreatorView(kol({ credibility: 'broken' })).cred).toBeNull();
    expect(kolToCreatorView(kol()).cred).toBeNull();
  });

  it('ad：brandSafety safe → ok；null / review → warn（待核）', () => {
    const safe = {
      rating: 'safe',
      flags: ['近 90 天披露完整'],
      assessedAt: '2026-07-23T00:00:00Z',
    };
    expect(kolToCreatorView(kol({ brandSafety: safe })).ad).toBe('ok');
    expect(
      kolToCreatorView(kol({ brandSafety: { ...safe, rating: 'review' } })).ad,
    ).toBe('warn');
    expect(kolToCreatorView(kol()).ad).toBe('warn');
  });

  it('name 回退链：displayName → handle → 占位；plat/fans 走 match-format 单点', () => {
    expect(kolToCreatorView(kol({ displayName: null })).name).toBe('tester');
    expect(
      kolToCreatorView(kol({ displayName: null, handle: null })).name,
    ).toBe('（未命名）');
    const v = kolToCreatorView(kol());
    expect(v.plat).toBe('YouTube · 42万');
    expect(v.fans).toBe('42万');
    expect(v.genre).toBe('gaming');
  });
});

describe('kolToCreatorView — 抽屉 deep 面', () => {
  it('interests 真值入 aud（分布三键 null 子降级）；real ring ← credibility.score', () => {
    const v = kolToCreatorView(
      kol({
        audienceDemo: { interests: ['fps', 'sandbox'] },
        credibility: CRED,
      }),
    );
    expect(v.deep.aud).toEqual({
      interests: ['fps', 'sandbox'],
      region: null,
      age: null,
      games: null,
      gender: null,
    });
    expect(v.deep.real).toBe(93);
    expect(v.deep.risk.safety).toBe('A');
  });

  it('无 interests → aud null（整区待核占位）；无源区诚实 null/空', () => {
    const v = kolToCreatorView(kol());
    expect(v.deep.aud).toBeNull();
    expect(v.deep.real).toBeNull();
    expect(v.deep.perf).toBeNull();
    expect(v.deep.price).toBeNull();
    expect(v.deep.samples).toBeNull();
    expect(v.deep.collab).toEqual([]);
    expect(v.deep.risk.ad).toBeNull();
    expect(v.deep.judge.reach).toBeNull();
    expect(v.deep.judge.match).toContain('待核');
  });

  it('brandSafety 有值 → risk.ad 描述 + adWarn 语义（safe 不警示）', () => {
    const safe = kolToCreatorView(
      kol({
        brandSafety: {
          rating: 'safe',
          flags: ['近 90 天披露完整'],
          assessedAt: '2026-07-23T00:00:00Z',
        },
      }),
    );
    expect(safe.deep.risk.ad).toContain('safe');
    expect(safe.deep.risk.adWarn).toBe(false);
    const risk = kolToCreatorView(
      kol({
        brandSafety: {
          rating: 'risk',
          flags: ['披露缺失 2 次'],
          assessedAt: '2026-07-23T00:00:00Z',
        },
      }),
    );
    expect(risk.deep.risk.adWarn).toBe(true);
  });

  it('契约位脏数据全程不抛错（D2）', () => {
    expect(() =>
      kolToCreatorView(
        kol({ audienceDemo: 42, credibility: [], brandSafety: 'x' }),
      ),
    ).not.toThrow();
  });
});
