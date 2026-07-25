// M4.5-AGENT-LOOP F006 — 人格切换 UI 契约单测（P9）
//
// 覆盖 acceptance：
// - 当值人格从**流内 persona_switch 事件**解析（不是响应头——头是一次性的，承载不了切换史）
// - 无切换会话行为零变化（回落 context.agentId）
// - X-Agent-Id 语义 = 起始人格，且 route 源码里有明示注释（contract-surface，防语义悄悄漂移）
// - 边界卡文案与 registry 同源（前端不硬编码人格文案）

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  activeAgentFromMessages,
  PERSONA_SWITCH_PART,
} from 'components/copilot/CopilotPanel';
import { personaBoundary } from 'lib/agent/registry';

const msg = (parts: unknown[]) => ({ parts });

describe('F006 当值人格解析（流内事件优先）', () => {
  it('无切换事件 → 回落起始人格（零行为变化）', () => {
    expect(
      activeAgentFromMessages(
        [msg([{ type: 'text', text: '你好' }])],
        'orchestrator',
      ),
    ).toBe('orchestrator');
    expect(activeAgentFromMessages([], 'match')).toBe('match');
  });

  it('有切换事件 → 取最后一次的 to', () => {
    const messages = [
      msg([{ type: 'text', text: '交给洞察' }]),
      msg([
        { type: PERSONA_SWITCH_PART, data: { from: 'orchestrator', to: 'insight' } },
        { type: 'text', text: '我是洞察' },
      ]),
    ];
    expect(activeAgentFromMessages(messages, 'orchestrator')).toBe('insight');
  });

  it('多次切换取最后一次（不是第一次）', () => {
    const messages = [
      msg([
        { type: PERSONA_SWITCH_PART, data: { from: 'orchestrator', to: 'insight' } },
      ]),
      msg([
        { type: PERSONA_SWITCH_PART, data: { from: 'insight', to: 'delivery' } },
      ]),
    ];
    expect(activeAgentFromMessages(messages, 'orchestrator')).toBe('delivery');
  });

  it('非法 / 缺失 to 一律忽略（模型输出是不可信输入，NFR-S6）', () => {
    const messages = [
      msg([{ type: PERSONA_SWITCH_PART, data: { to: 'not_an_agent' } }]),
      msg([{ type: PERSONA_SWITCH_PART, data: {} }]),
      msg([{ type: PERSONA_SWITCH_PART }]),
    ];
    expect(activeAgentFromMessages(messages, 'orchestrator')).toBe(
      'orchestrator',
    );
  });
});

describe('F006 契约面（contract-surface：读源码防语义漂移）', () => {
  const routeSrc = readFileSync('src/app/api/agent/route.ts', 'utf8');

  it('route 往流里写 persona_switch data part（事件名两端同源）', () => {
    expect(routeSrc).toContain(PERSONA_SWITCH_PART);
    expect(routeSrc).toContain('onPersonaSwitch');
    expect(routeSrc).toContain('createUIMessageStream');
  });

  it('X-Agent-Id = 起始人格，且注释明示 P9 语义', () => {
    expect(routeSrc).toContain("'X-Agent-Id': startPersona.id");
    expect(routeSrc).toContain('起始人格');
  });

  it('边界卡数据源 = registry personaBoundary（非硬编码文案）', () => {
    const panelSrc = readFileSync(
      'src/components/copilot/PersonaSwitchNote.tsx',
      'utf8',
    );
    expect(panelSrc).toContain('personaBoundary');
    const insight = personaBoundary('insight')!;
    // 组件不得内联人格名/职责文案（只能来自 registry）
    expect(panelSrc).not.toContain(insight.duty);
    expect(panelSrc).not.toContain(insight.name);
  });
});
