// M2-C-AGENT-HONESTY F001 — create_project 工具契约面单测（无 DB；落库路径由集成测承担，
// compute-health-tool 先例：盯「注册对、契约对、挂载对」）。

import { describe, expect, it } from 'vitest';
import { createProjectTool } from 'lib/agent/tools/create-project';
import { getNativeToolNames } from 'lib/agent/tools';
import { getTool } from 'lib/agent/tools/registry';
import { getPersona, listPersonas } from 'lib/agent/registry';

describe('create_project 工具契约（D8）', () => {
  it('class=internal / source=native / 无 buildHarm（可逆内部动作，不过闸门 D27）', () => {
    expect(createProjectTool.name).toBe('create_project');
    expect(createProjectTool.class).toBe('internal');
    expect(createProjectTool.source).toBe('native');
    expect(createProjectTool.buildHarm).toBeUndefined();
  });

  it('输入契约：name 必填非空；game/market 可选；额外字段 strip', () => {
    expect(
      createProjectTool.inputSchema.safeParse({ name: '王者荣耀·东南亚推广' })
        .success,
    ).toBe(true);
    expect(createProjectTool.inputSchema.safeParse({ name: '' }).success).toBe(
      false,
    );
    expect(createProjectTool.inputSchema.safeParse({}).success).toBe(false);
    const parsed = createProjectTool.inputSchema.safeParse({
      name: 'p',
      market: '东南亚',
      budget: 99999, // 模型硬塞的未定义字段 → strip
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ name: 'p', market: '东南亚' });
  });

  it('已注册进 NATIVE_TOOLS / 工具注册表', () => {
    expect(getNativeToolNames()).toContain('create_project');
    expect(getTool('create_project')).toBeDefined();
  });

  it('【P2】挂载面收窄：仅 orchestrator + strategy；其余人格不挂（越界走指路）', () => {
    expect(getPersona('orchestrator').tools).toContain('create_project');
    expect(getPersona('strategy').tools).toContain('create_project');
    for (const p of listPersonas()) {
      if (p.id === 'orchestrator' || p.id === 'strategy') continue;
      expect(p.tools, `persona=${p.id}`).not.toContain('create_project');
    }
  });
});
