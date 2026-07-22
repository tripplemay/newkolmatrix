// M2-A-MATCH F007 — match_plan / evaluate_creator 工具契约面单测（无 DB；execute 的
// 落库/网关路径属 L2 留验收授权——本文件盯「注册对、契约对、映射对、prompt 注入对」，
// 沿 compute-health-tool.test.ts 先例）。

import { describe, expect, it } from 'vitest';
import { matchPlanTool } from 'lib/agent/tools/match-plan';
import { evaluateCreatorTool } from 'lib/agent/tools/evaluate-creator';
import { getNativeToolNames } from 'lib/agent/tools';
import { getTool } from 'lib/agent/tools/registry';
import { getPersona, listPersonas } from 'lib/agent/registry';
import {
  hasCanvasRenderer,
  registerCanvasRenderer,
  renderToolResult,
} from 'components/copilot/canvas/canvas-registry';

describe('match_plan 工具契约（D8）', () => {
  it('class=internal / source=native / 无 buildHarm（只读查询，不过闸门）', () => {
    expect(matchPlanTool.name).toBe('match_plan');
    expect(matchPlanTool.class).toBe('internal');
    expect(matchPlanTool.source).toBe('native');
    expect(matchPlanTool.buildHarm).toBeUndefined();
  });

  it('输入契约：projectId 必填非空；额外字段 strip', () => {
    expect(
      matchPlanTool.inputSchema.safeParse({ projectId: 'xg' }).success,
    ).toBe(true);
    expect(matchPlanTool.inputSchema.safeParse({ projectId: '' }).success).toBe(
      false,
    );
    expect(matchPlanTool.inputSchema.safeParse({}).success).toBe(false);
    const parsed = matchPlanTool.inputSchema.safeParse({
      projectId: 'xg',
      status: 'approved',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ projectId: 'xg' });
  });
});

describe('evaluate_creator 工具契约（D8）', () => {
  it('class=internal / source=native / 无 buildHarm（只读评估，不过闸门）', () => {
    expect(evaluateCreatorTool.name).toBe('evaluate_creator');
    expect(evaluateCreatorTool.class).toBe('internal');
    expect(evaluateCreatorTool.source).toBe('native');
    expect(evaluateCreatorTool.buildHarm).toBeUndefined();
  });

  it('输入契约：projectId + kolIdOrPublicId 双必填非空', () => {
    expect(
      evaluateCreatorTool.inputSchema.safeParse({
        projectId: 'xg',
        kolIdOrPublicId: 'k1',
      }).success,
    ).toBe(true);
    expect(
      evaluateCreatorTool.inputSchema.safeParse({ projectId: 'xg' }).success,
    ).toBe(false);
    expect(
      evaluateCreatorTool.inputSchema.safeParse({
        projectId: '',
        kolIdOrPublicId: 'k1',
      }).success,
    ).toBe(false);
  });
});

describe('注册表与人格映射（:1098 目标态兑现）', () => {
  it('两工具已注册进 NATIVE_TOOLS / 工具注册表', () => {
    for (const name of ['match_plan', 'evaluate_creator']) {
      expect(getNativeToolNames()).toContain(name);
      expect(getTool(name)).toBeDefined();
    }
  });

  it('match persona tools 扩为四件（registry.ts）', () => {
    expect(getPersona('match').tools).toEqual([
      'search_kols',
      'get_kol_detail',
      'match_plan',
      'evaluate_creator',
    ]);
  });

  it('其他人格未被误挂 match 域工具', () => {
    for (const p of listPersonas()) {
      if (p.id === 'match') continue;
      expect(p.tools, `persona=${p.id}`).not.toContain('match_plan');
      expect(p.tools, `persona=${p.id}`).not.toContain('evaluate_creator');
    }
  });
});

describe('uiSyntax 注入 prompt（:1032 欠账消解）', () => {
  it('每个人格的 systemPrompt 含「你的产出形态：{uiSyntax}」段（与 UI 卡同源）', () => {
    for (const p of listPersonas()) {
      expect(p.systemPrompt, `persona=${p.id}`).toContain(
        `你的产出形态：${p.uiSyntax}`,
      );
    }
  });

  it('match 人格注入的产出形态 = 对比矩阵（抽样锚定）', () => {
    expect(getPersona('match').systemPrompt).toContain(
      '你的产出形态：对比矩阵',
    );
  });
});

describe('canvas ADR-28（type 路由 + 受控 register API）', () => {
  it('match_plan 输出按结果 type 路由（type 优先于工具名）', () => {
    const output = { type: 'match_plan', found: true, plans: [] as unknown[] };
    expect(hasCanvasRenderer('match_plan', output)).toBe(true);
    // 即便工具名不同，携带 type 的输出仍路由到同一渲染器（多工具共用形态的能力）
    expect(hasCanvasRenderer('some_other_tool', output)).toBe(true);
    expect(renderToolResult('some_other_tool', output)).not.toBeNull();
  });

  it('search_kols 无 type 输出走工具名回退键（迁新 API 行为零变更）', () => {
    const output = { query: 'q', count: 0, kols: [] as unknown[] };
    expect(hasCanvasRenderer('search_kols', output)).toBe(true);
    expect(renderToolResult('search_kols', output)).not.toBeNull();
  });

  it('未注册键返回 null 不抛错（NFR-S6：模型输出是不可信输入）', () => {
    expect(hasCanvasRenderer('unknown_tool', { type: 'unknown_type' })).toBe(
      false,
    );
    expect(renderToolResult('unknown_tool', { anything: 1 })).toBeNull();
    expect(renderToolResult('unknown_tool', null)).toBeNull();
  });

  it('受控 register API：可注入新渲染器；重名即抛（禁止双语义并存）', () => {
    const Probe = ((): null => null) as unknown as Parameters<
      typeof registerCanvasRenderer
    >[1];
    registerCanvasRenderer('m2a_test_probe', Probe);
    expect(hasCanvasRenderer('any_tool', { type: 'm2a_test_probe' })).toBe(
      true,
    );
    expect(() => registerCanvasRenderer('m2a_test_probe', Probe)).toThrow();
    expect(() => registerCanvasRenderer('search_kols', Probe)).toThrow();
  });
});
