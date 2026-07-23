// M1-A-BRIEF F001 — 渲染契约层单测（自 scripts/test/provenance-smoke.ts 改写，原脚本删除）。
//
// 原脚本是全仓唯一的纯函数单测，但自建 expect + 手工计数 + process.exit，未进 package.json、CI 不跑。
// 本文件是 vitest 地基的首个样板：断言语义与原脚本逐条对应，改用 vitest 的 describe/it/expect。
//
// 覆盖：A readContractSlot 三态（null / 有值 / 降级）+ 绝不填 0
//       B isPendingVerification「待核」判定（ARCH-M05 裁决 #2 口径）
//       C resolveProvenance 三级回退（字段级 → 实体级 → 保守下限）
//       D 读写不对称 sanity（architecture §7.5.2）
//       E ProvenanceTag 双通道完备性（六档来源 图标+文字 全覆盖）

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  dataSourceSchema,
  fieldProvenanceEntrySchema,
  fieldProvenanceSchema,
  isPendingVerification,
  readContractSlot,
  resolveProvenance,
} from '../../src/lib/data/provenance';
import { SOURCE_META } from '../../src/components/common/ProvenanceTag';

const fieldEntry = {
  source: 'crawl',
  fetchedAt: '2026-07-17T00:00:00Z',
  confidence: 'high',
};

describe('A. readContractSlot 三态（null / 有值 / 降级）', () => {
  it('A1 null 槽 → null（「待接入」语义，不抛错）', () => {
    expect(readContractSlot(z.number(), null, 'test.null')).toBeNull();
  });

  it('A2 undefined 槽 → null（缺失即缺失）', () => {
    expect(readContractSlot(z.number(), undefined, 'test.undef')).toBeNull();
  });

  it('A3 有值且合法 → 原样解析返回', () => {
    const raw = {
      source: 'crawl',
      fetchedAt: '2026-07-17',
      confidence: 'high',
    };
    const v = readContractSlot(fieldProvenanceEntrySchema, raw, 'test.valid');
    expect(v).not.toBeNull();
    expect(v!.source).toBe('crawl');
    expect(v!.confidence).toBe('high');
  });

  it('A4 脏数据（形状不合法）→ 降级 null，不抛错', () => {
    const dirty = { source: 'hacked_source', confidence: 42 };
    expect(
      readContractSlot(fieldProvenanceEntrySchema, dirty, 'test.dirty'),
    ).toBeNull();
  });

  it('A5 数值槽缺失 → null，绝不合成 0 冒充实测', () => {
    const v = readContractSlot(z.number(), null, 'test.followers');
    expect(v).toBeNull();
    // 显式区分 null 与 0：契约层的核心纪律是「缺失不得被 0 冒充」
    expect(v).not.toBe(0);
  });
});

describe('B. isPendingVerification（字段缺失 / 契约层 null → 待核）', () => {
  it('B1 值为 null → 待核', () => {
    expect(isPendingVerification(null)).toBe(true);
  });

  it('B2 值为 undefined → 待核', () => {
    expect(isPendingVerification(undefined)).toBe(true);
  });

  it('B3 有值（含 0 / 空串等 falsy 实测值）→ 非待核，有值即显', () => {
    expect(isPendingVerification(0)).toBe(false); // 实测 0 是合法值
    expect(isPendingVerification('')).toBe(false); // 空串是值，非缺失
    expect(isPendingVerification({ geoDist: [] })).toBe(false);
  });

  it('B4 有值但溯源链空（FR-11.9 空依据非法）→ 待核', () => {
    expect(isPendingVerification('卖点文本', [])).toBe(true);
    expect(isPendingVerification('卖点文本', null)).toBe(true);
  });

  it('B5 有值且溯源链非空 → 非待核', () => {
    expect(isPendingVerification('卖点文本', ['mat-1'])).toBe(false);
  });
});

describe('C. resolveProvenance 三级回退（字段级 → 实体级 → 保守下限）', () => {
  it('C1 ① 字段级覆盖命中 → resolvedFrom=field，值取自条目', () => {
    const p = resolveProvenance(
      {
        dataSource: 'platform_api',
        fieldProvenance: { 'audienceDemo.geoDist': fieldEntry },
      },
      'audienceDemo.geoDist',
    );
    expect(p.resolvedFrom).toBe('field');
    expect(p.source).toBe('crawl');
    expect(p.confidence).toBe('high');
  });

  it('C2 ② 字段级未命中 → 行级 dataSource（confidence/fetchedAt 置 null）', () => {
    const p = resolveProvenance(
      { dataSource: 'purchased', fieldProvenance: { followers: fieldEntry } },
      'engagementRate',
    );
    expect(p.resolvedFrom).toBe('row');
    expect(p.source).toBe('purchased');
    expect(p.confidence).toBeNull();
    expect(p.fetchedAt).toBeNull();
  });

  it('C3 ③ 双空 → fallback ai_estimate（保守下限，绝不冒充实测）', () => {
    const p = resolveProvenance(
      { dataSource: null, fieldProvenance: null },
      'followers',
    );
    expect(p.resolvedFrom).toBe('fallback');
    expect(p.source).toBe('ai_estimate');
  });

  it('C4 脏 fieldProvenance → 降级走行级，不抛错', () => {
    const p = resolveProvenance(
      { dataSource: 'optin', fieldProvenance: 'not-an-object' },
      'followers',
    );
    expect(p.resolvedFrom).toBe('row');
    expect(p.source).toBe('optin');
  });

  it('C5 脏 dataSource + 无字段级 → 降级到 fallback，不抛错', () => {
    const p = resolveProvenance(
      { dataSource: 'made_up_source', fieldProvenance: null },
      'followers',
    );
    expect(p.resolvedFrom).toBe('fallback');
    expect(p.source).toBe('ai_estimate');
  });
});

describe('D. 读写不对称（值缺失→待核占位；值在溯源空→ai_estimate 徽标）', () => {
  it('D1 字段值 null → 待核占位（无数据点、无徽标）', () => {
    const audienceDemo: Record<string, unknown> | null = null;
    expect(isPendingVerification(audienceDemo)).toBe(true);
  });

  it('D2 字段值存在、溯源链空 → 数据点 + ai_estimate 徽标（永不裸展示）', () => {
    const followers = 182000; // 值存在 → 渲染数据点
    expect(isPendingVerification(followers)).toBe(false);
    const p = resolveProvenance(
      { dataSource: null, fieldProvenance: null },
      'followers',
    );
    // 徽标强制降到最低可信档（FR-11.19）
    expect(p.source).toBe('ai_estimate');
  });
});

describe('E. ProvenanceTag 来源双通道（图标+文字，七档全覆盖）', () => {
  it('E1 SOURCE_META 覆盖全部 DataSource 且每档 图标+文字 齐备', () => {
    const sources = dataSourceSchema.options;
    // 6 → 7：M3-A F007 扩 user_input（contactEmail 人工录入档）
    expect(sources).toHaveLength(7);
    for (const s of sources) {
      const meta = SOURCE_META[s];
      expect(meta, `${s} 缺 SOURCE_META 条目`).toBeTruthy();
      expect(meta.label.length, `${s} 缺文字通道`).toBeGreaterThan(0);
      expect(typeof meta.Icon, `${s} 缺图标通道`).toBe('function');
    }
  });

  it('E2 fieldProvenanceSchema 可整表解析（多字段 map）', () => {
    const map = readContractSlot(
      fieldProvenanceSchema,
      {
        followers: {
          source: 'platform_api',
          fetchedAt: null,
          confidence: null,
        },
        'audienceDemo.geoDist': fieldEntry,
      },
      'test.map',
    );
    expect(map).not.toBeNull();
    expect(Object.keys(map!)).toHaveLength(2);
  });
});
