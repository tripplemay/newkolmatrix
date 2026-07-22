// M1-D-KNOWLEDGE F001 — schemas/knowledge.ts 单测。
//
// 覆盖 acceptance 逐条：读侧宽松降级（脏数据 → null 不抛错，D2）· 写侧严格校验
// （LLM 产物不合形 → null）· hasAnyKnowledge 全空判定 · FR-11.9 溯源非空校验。

import { describe, it, expect } from 'vitest';
import {
  parseKnowledgeStructured,
  parseLlmOutput,
  hasAnyKnowledge,
  assertSourceMaterialIds,
  sourceMaterialIdsSchema,
  knowledgeKindSchema,
  materialTypeSchema,
  parseStatusSchema,
} from '../../src/lib/data/schemas/knowledge';

describe('parseKnowledgeStructured（读侧宽松降级，D2）', () => {
  it('三类 kind 各自的合法 structured 通过并保形', () => {
    expect(
      parseKnowledgeStructured('selling_point', { points: ['双武器切换'] }),
    ).toEqual({ points: ['双武器切换'] });
    expect(
      parseKnowledgeStructured('audience', {
        slices: [{ label: '硬核射击玩家', percent: 58 }],
      }),
    ).toEqual({ slices: [{ label: '硬核射击玩家', percent: 58 }] });
    expect(
      parseKnowledgeStructured('compliance_redline', {
        rules: ['必须标注 #ad'],
      }),
    ).toEqual({ rules: ['必须标注 #ad'] });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['裸字符串', 'garbage'],
    ['数字', 42],
    ['空对象', {}],
    ['错键', { wrong: ['x'] }],
    ['空数组载荷', { points: [] }],
    ['元素类型错', { points: [1, 2] }],
  ])('脏数据（%s）→ null 不抛错', (_label, raw) => {
    expect(() => parseKnowledgeStructured('selling_point', raw)).not.toThrow();
    expect(parseKnowledgeStructured('selling_point', raw)).toBeNull();
  });

  it('kind 与载荷形状交叉（audience 载荷塞给 selling_point）→ null', () => {
    expect(
      parseKnowledgeStructured('selling_point', {
        slices: [{ label: 'x', percent: 10 }],
      }),
    ).toBeNull();
  });

  it('percent 越界（>100 / 负数）→ null', () => {
    expect(
      parseKnowledgeStructured('audience', {
        slices: [{ label: 'x', percent: 101 }],
      }),
    ).toBeNull();
    expect(
      parseKnowledgeStructured('audience', {
        slices: [{ label: 'x', percent: -1 }],
      }),
    ).toBeNull();
  });
});

describe('parseLlmOutput（写侧严格校验）', () => {
  it('齐备产物通过并保形', () => {
    const out = parseLlmOutput({
      selling_points: ['卖点 A'],
      audience_slices: [{ label: '受众', percent: 60 }],
      compliance_redlines: ['红线'],
      confidence: 0.8,
    });
    expect(out).not.toBeNull();
    expect(out!.selling_points).toEqual(['卖点 A']);
    expect(out!.confidence).toBe(0.8);
  });

  it('缺省数组按 default 补空数组；confidence 可缺省', () => {
    const out = parseLlmOutput({ selling_points: ['仅卖点'] });
    expect(out).not.toBeNull();
    expect(out!.audience_slices).toEqual([]);
    expect(out!.compliance_redlines).toEqual([]);
  });

  it('不合形（裸数组 / 元素坏 / confidence 越界）→ null 不抛错', () => {
    expect(parseLlmOutput(['裸数组'])).toBeNull();
    expect(parseLlmOutput({ selling_points: [''] })).toBeNull();
    expect(
      parseLlmOutput({ selling_points: ['x'], confidence: 1.5 }),
    ).toBeNull();
    expect(() => parseLlmOutput('garbage')).not.toThrow();
  });

  it('hasAnyKnowledge：全空 = 无效产出；任一类非空 = 有效', () => {
    const empty = parseLlmOutput({})!;
    expect(hasAnyKnowledge(empty)).toBe(false);
    const only = parseLlmOutput({ compliance_redlines: ['红线'] })!;
    expect(hasAnyKnowledge(only)).toBe(true);
  });
});

describe('FR-11.9 溯源校验（应用层，违规抛错不降级）', () => {
  it('非空 id 列表通过', () => {
    expect(assertSourceMaterialIds(['m1', 'm2'])).toEqual(['m1', 'm2']);
  });

  it('空数组 / 空串元素 → 抛错（空则非法）', () => {
    expect(() => assertSourceMaterialIds([])).toThrow();
    expect(() => assertSourceMaterialIds([''])).toThrow();
    expect(sourceMaterialIdsSchema.safeParse([]).success).toBe(false);
  });
});

describe('枚举与 Prisma enum 逐字一致', () => {
  it('三个应用层枚举值域与 schema.prisma 声明一致', () => {
    expect(knowledgeKindSchema.options).toEqual([
      'selling_point',
      'audience',
      'compliance_redline',
    ]);
    expect(materialTypeSchema.options).toEqual([
      'lore',
      'art',
      'gameplay_doc',
      'review',
      'data',
      'video',
    ]);
    expect(parseStatusSchema.options).toEqual([
      'pending',
      'parsing',
      'parsed',
      'failed',
    ]);
  });
});
