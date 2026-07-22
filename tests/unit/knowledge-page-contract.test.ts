// M1-D-KNOWLEDGE F004 — page-contract 展示映射单测（服务端/客户端共用的单点口径）。
//
// 覆盖：DB MaterialType 六值 → 四图标槽映射 · parseStatus 四态 → 三态视图 ·
// toMaterialView 组装（相对时间/来源占位/parseError 透传）· provenanceLabel 两口径 ·
// findKnowledgeGame D2 回退 · 调色板确定性分配。

import { describe, it, expect } from 'vitest';
import {
  GAME_COLOR_PALETTE,
  findKnowledgeGame,
  gameColorForIndex,
  materialIconKind,
  materialStatusView,
  provenanceLabel,
  toMaterialView,
  type KnowledgeGameData,
} from '../../src/lib/knowledge/page-contract';
import type { MaterialDto } from '../../src/lib/knowledge/dto';

const NOW = new Date('2026-07-22T12:00:00Z');

function dto(over: Partial<MaterialDto> = {}): MaterialDto {
  return {
    id: 'm1',
    publicId: 'p1',
    gameId: 'g1',
    type: 'lore',
    source: '你上传',
    fileName: '设定集.txt',
    mimeType: 'text/plain',
    sizeBytes: 10,
    parseStatus: 'pending',
    parseError: null,
    parsedAt: null,
    createdAt: '2026-07-22T11:30:00Z',
    ...over,
  };
}

function game(id: string): KnowledgeGameData {
  return {
    id,
    name: `游戏${id}`,
    color: '#422afb',
    materials: [],
    analysis: { sell: [], aud: [], rules: [], sourceCount: 0 },
    dataSource: 'user_upload',
    fieldProvenance: {},
  };
}

describe('materialIconKind（DB 六值 → 四图标槽，🔒 不得合并）', () => {
  it.each([
    ['lore', 'doc'],
    ['gameplay_doc', 'doc'],
    ['review', 'doc'],
    ['art', 'image'],
    ['data', 'data'],
    ['video', 'video'],
  ])('%s → %s', (db, icon) => {
    expect(materialIconKind(db)).toBe(icon);
  });

  it('未知值宽松回落 doc（D2 不抛错）', () => {
    expect(materialIconKind('bogus')).toBe('doc');
  });
});

describe('materialStatusView（四态 → 三态视图）', () => {
  it.each([
    ['parsed', 'done'],
    ['pending', 'analyzing'],
    ['parsing', 'analyzing'],
    ['failed', 'failed'],
  ])('%s → %s', (db, view) => {
    expect(materialStatusView(db)).toBe(view);
  });
});

describe('toMaterialView（行组装）', () => {
  it('齐备行：相对时间 + 来源 + 状态', () => {
    const v = toMaterialView(dto(), NOW);
    expect(v).toEqual({
      id: 'm1',
      name: '设定集.txt',
      icon: 'doc',
      src: '你上传',
      date: '30 分钟前',
      status: 'analyzing',
      parseError: null,
    });
  });

  it('failed 行：parseError 透传（红态明示，D2）；source 空 → —', () => {
    const v = toMaterialView(
      dto({ parseStatus: 'failed', parseError: '类型暂不支持解析', source: null }),
      NOW,
    );
    expect(v.status).toBe('failed');
    expect(v.parseError).toBe('类型暂不支持解析');
    expect(v.src).toBe('—');
  });
});

describe('provenanceLabel（kb-prov 两口径）', () => {
  it('有产物 → 基于 N 份素材分析', () => {
    expect(
      provenanceLabel({ sell: ['x'], aud: [], rules: [], sourceCount: 3 }),
    ).toBe('策略 Agent 基于 3 份素材分析');
  });

  it('无产物 → 待解析口径', () => {
    expect(
      provenanceLabel({ sell: [], aud: [], rules: [], sourceCount: 0 }),
    ).toContain('待解析');
  });
});

describe('findKnowledgeGame（?game= D2 回退）', () => {
  const games = [game('a'), game('b')];

  it('合法 id 命中', () => {
    expect(findKnowledgeGame(games, 'b')!.id).toBe('b');
  });

  it('非法 / 缺失 → 首个游戏（不抛错）', () => {
    expect(findKnowledgeGame(games, 'nope')!.id).toBe('a');
    expect(findKnowledgeGame(games, undefined)!.id).toBe('a');
  });

  it('空列表 → null（页面渲染空态）', () => {
    expect(findKnowledgeGame([], 'a')).toBeNull();
  });
});

describe('gameColorForIndex（确定性调色板）', () => {
  it('按序取色并循环；前 4 色沿原型调色板', () => {
    expect(gameColorForIndex(0)).toBe('#422afb');
    expect(gameColorForIndex(3)).toBe('#e89a1c');
    expect(gameColorForIndex(4)).toBe(GAME_COLOR_PALETTE[0]);
  });
});
