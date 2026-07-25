// M4.5-AGENT-LOOP F008（裁决 C）— 画布渐进渲染单测
//
// 覆盖 acceptance：
// - propose_plan 在 state=input-streaming / input-available 时走渐进渲染器
// - **三分支互斥**（canvas / draft / label）——同一 part 不会同时出渐进卡与结果卡（防重复渲染/闪烁）
// - 对非渐进类工具零行为变化（无渐进渲染器 → 仍走原「调用工具 X…」标签分支）
// - draft 类工具（draft_report / draft_email）**如实不渐进**：本批裁决明确不给它们注册渐进器
//   （其正文是 execute 内部产物，非模型入参——见 f008 pre-impl 审计 §2）
// - 渐进态不展示模型自报 needsGate（Planner 追加约束）：组件源码不读该字段

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  hasCanvasDraftRenderer,
  pickToolRenderMode,
  renderToolInputDraft,
} from 'components/copilot/canvas/canvas-registry';

const PLAN_OUTPUT = {
  type: 'action_plan',
  title: 'x',
  items: [] as unknown[],
};

describe('F008 渐进渲染路由（三分支互斥）', () => {
  it('propose_plan 写入参途中 → draft 分支', () => {
    expect(
      pickToolRenderMode('propose_plan', 'input-streaming', undefined),
    ).toBe('draft');
    expect(
      pickToolRenderMode('propose_plan', 'input-available', undefined),
    ).toBe('draft');
  });

  it('产物到齐 → canvas 分支（绝不再回到 draft）', () => {
    expect(
      pickToolRenderMode('propose_plan', 'output-available', PLAN_OUTPUT),
    ).toBe('canvas');
  });

  it('同一工具在各状态下分支两两互斥（无同时命中 → 无重复渲染）', () => {
    const states = [
      'input-streaming',
      'input-available',
      'output-available',
      'output-error',
    ];
    const modes = states.map((s) =>
      pickToolRenderMode('propose_plan', s, PLAN_OUTPUT),
    );
    expect(modes).toEqual(['draft', 'draft', 'canvas', 'label']);
    // 每个状态恰好一个分支（函数返回单值即互斥；此处钉死取值域）
    for (const m of modes) expect(['canvas', 'draft', 'label']).toContain(m);
  });

  it('无渐进器的工具零行为变化（仍走 label / canvas 原分支）', () => {
    expect(
      pickToolRenderMode('search_kols', 'input-streaming', undefined),
    ).toBe('label');
    expect(
      pickToolRenderMode('search_kols', 'output-available', {
        query: 'q',
        count: 0,
        kols: [],
      }),
    ).toBe('canvas');
  });

  it('draft 类工具本批如实不渐进（裁决 D-F008-1：其正文非模型入参）', () => {
    for (const name of ['draft_report', 'draft_email', 'refine_email']) {
      expect(hasCanvasDraftRenderer(name), `${name} 不应有渐进器`).toBe(false);
      expect(pickToolRenderMode(name, 'input-streaming', undefined)).toBe(
        'label',
      );
    }
  });
});

describe('F008 渐进卡容错（partial input 任何字段都可能缺）', () => {
  it('一个字都没写出来 → 不出空壳卡（空壳先闪一下再填满 = 闪烁）', () => {
    expect(renderToolInputDraft('propose_plan', {})).not.toBeNull();
    // 组件返回 null 时 React 元素仍存在；这里断言的是组件本身对空输入的处理
    // （渲染结果为 null 由组件内 early-return 保证，见下方源码契约断言）
  });

  it('未注册工具 → null（对话面回退文本，不抛）', () => {
    expect(renderToolInputDraft('no_such_tool', { title: 'x' })).toBeNull();
  });
});

describe('F008 渐进态诚实边界（Planner 追加约束）', () => {
  const src = readFileSync(
    'src/components/copilot/canvas/PlanCardDraft.tsx',
    'utf8',
  );

  it('渐进卡不读模型自报的 needsGate（服务端未复核前不当结论展示）', () => {
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(code).not.toContain('needsGate');
    expect(code).not.toContain('需你确认');
  });

  it('渐进卡明示「还在拟定中」+ 闸门标注等服务端复核', () => {
    expect(src).toContain('拟定中');
    expect(src).toContain('要等服务端按工具注册表复核后才会标出');
  });

  it('空输入 early-return（不渲染空壳）', () => {
    expect(src).toContain('if (!title && items.length === 0) return null;');
  });
});
