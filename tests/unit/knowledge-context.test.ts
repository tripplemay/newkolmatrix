// M1-D-KNOWLEDGE F005 — ⑤层知识注入单测（纯函数 + registry 映射，不打库不打网关）。
//
// 覆盖 acceptance：prompt 拼接产物含知识段 · persona knowledgeKinds 映射正确
// （strategy 三类全量 / match=audience / reach=selling_point / compliance=redline）·
// 无知识返回空串不注水。

import { describe, it, expect } from 'vitest';
import { renderKnowledgeSection } from '../../src/lib/agent/knowledge-context';
import { getPersona } from '../../src/lib/agent/registry';

const HEADS = [
  {
    kind: 'selling_point' as const,
    content: '双武器切换；赛季通行证',
    sourceMaterialIds: ['m1', 'm2'],
  },
  {
    kind: 'audience' as const,
    content: '硬核射击 58%；竞技向 24%',
    sourceMaterialIds: ['m1'],
  },
  {
    kind: 'compliance_redline' as const,
    content: '#ad 披露；实机须真实版本',
    sourceMaterialIds: ['m2'],
  },
];

describe('renderKnowledgeSection（纯渲染）', () => {
  it('空 heads → 空串（不注水）', () => {
    expect(renderKnowledgeSection('星轨协议', [])).toBe('');
  });

  it('知识段含游戏名 + 溯源计数（去重并集）+ 三类标签与内容', () => {
    const s = renderKnowledgeSection('星轨协议', HEADS);
    expect(s).toContain('【游戏知识');
    expect(s).toContain('游戏：星轨协议');
    expect(s).toContain('基于 2 份素材解析'); // m1/m2 去重 = 2
    expect(s).toContain('- 卖点：双武器切换；赛季通行证');
    expect(s).toContain('- 目标受众：硬核射击 58%');
    expect(s).toContain('- 合规红线：#ad 披露');
    expect(s).toContain('不编造');
  });

  it('游戏名缺失 → 不渲染游戏名段（结构仍完整）', () => {
    const s = renderKnowledgeSection(null, HEADS.slice(0, 1));
    expect(s).toContain('【游戏知识');
    expect(s).not.toContain('游戏：');
  });
});

describe('persona.knowledgeKinds 映射（FR-8.4.8，architecture :907）', () => {
  it('strategy = 三类全量', () => {
    expect(getPersona('strategy').knowledgeKinds).toEqual([
      'selling_point',
      'audience',
      'compliance_redline',
    ]);
  });

  it('match = [audience]；reach = [selling_point]；compliance = [compliance_redline]', () => {
    expect(getPersona('match').knowledgeKinds).toEqual(['audience']);
    expect(getPersona('reach').knowledgeKinds).toEqual(['selling_point']);
    expect(getPersona('compliance').knowledgeKinds).toEqual([
      'compliance_redline',
    ]);
  });

  it('orchestrator / delivery / insight 不声明（本批不消费知识）', () => {
    expect(getPersona('orchestrator').knowledgeKinds).toBeUndefined();
    expect(getPersona('delivery').knowledgeKinds).toBeUndefined();
    expect(getPersona('insight').knowledgeKinds).toBeUndefined();
  });
});

describe('prompt 拼接产物（route 装配语义：persona.systemPrompt + 知识段）', () => {
  it('拼接后同时含人格边界与知识段（知识注入不覆盖人格）', () => {
    const persona = getPersona('match');
    const section = renderKnowledgeSection('星轨协议', [HEADS[1]]);
    const system = persona.systemPrompt + section;
    expect(system).toContain('匹配 Agent'); // 人格身份仍在
    expect(system).toContain('只做发现与匹配'); // 否定式护栏仍在
    expect(system).toContain('- 目标受众：硬核射击 58%'); // 知识段已注入
  });

  it('无知识 → 拼接产物与原 systemPrompt 逐字一致（空串无副作用）', () => {
    const persona = getPersona('reach');
    expect(persona.systemPrompt + renderKnowledgeSection('x', [])).toBe(
      persona.systemPrompt,
    );
  });
});
