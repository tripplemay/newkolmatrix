// M2-C-AGENT-HONESTY F003/F004 — 诚实护栏 + 编队名册注入单测（prompt 拼接断言，
// uiSyntax 注入断言先例；真对话行为属 L2 留验收授权）。
//
// 触发源：用户实证幻觉编排事故（user_report M2C-agent-honesty-2026-07-23）——
// 模型声称「已编排任务雷达」但零落库，并杜撰 6 个名册外专家。

import { describe, expect, it } from 'vitest';
import { listPersonas } from 'lib/agent/registry';

describe('F003 行动承诺诚实条款（产品级，全人格生效）', () => {
  it('三要素在每个人格的 systemPrompt：真实返回才可声称已执行 / 超能力明说+指路 / 建议禁包装', () => {
    for (const p of listPersonas()) {
      const s = p.systemPrompt;
      expect(s, `persona=${p.id} 要素(a)`).toContain('工具真实返回成功');
      expect(s, `persona=${p.id} 要素(b)`).toContain('当前版本还不支持');
      expect(s, `persona=${p.id} 要素(c)`).toContain('建议就是建议');
      expect(s, `persona=${p.id} 禁虚构执行态`).toContain('不得虚构任务表');
    }
  });
});

describe('F004 编队名册注入（listPersonas 同源，禁杜撰）', () => {
  it('全人格 prompt 含 7 人格全名册（同源断言：逐个真实人格名在场，不 pin 硬名单）', () => {
    const personas = listPersonas();
    expect(personas).toHaveLength(7);
    for (const p of personas) {
      for (const teammate of personas) {
        expect(p.systemPrompt, `persona=${p.id} 应含队友 ${teammate.name}`).toContain(
          teammate.name,
        );
      }
    }
  });

  it('禁杜撰条款在场（含用户实证过的杜撰角色反例点名）', () => {
    for (const p of listPersonas()) {
      expect(p.systemPrompt).toContain('唯一合法名册');
      expect(p.systemPrompt).toContain('不得杜撰任何名册外角色');
    }
  });

  it('名册段与 duty 同源：任一人格的 duty 文本出现在所有人格的名册段中', () => {
    const personas = listPersonas();
    const orchestrator = personas.find((p) => p.id === 'orchestrator')!;
    for (const p of personas) {
      expect(p.systemPrompt).toContain(orchestrator.duty); // 同源自动跟随（P6）
    }
  });
});
