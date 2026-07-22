// M1-B-BRIEF F003 — compute_health 工具契约面单测（无 DB；execute 的落库路径由
// agent:smoke 走 executeTool 直调实测——本文件盯的是「注册对、契约对、同源」）。

import { describe, expect, it } from 'vitest';
import { computeHealthTool } from 'lib/agent/tools/compute-health';
import { getNativeToolNames } from 'lib/agent/tools';
import { getTool } from 'lib/agent/tools/registry';
import { getPersona } from 'lib/agent/registry';

describe('compute_health 工具契约（D8）', () => {
  it('class=internal / source=native / 无 buildHarm（纯计算只读，不过闸门）', () => {
    expect(computeHealthTool.name).toBe('compute_health');
    expect(computeHealthTool.class).toBe('internal');
    expect(computeHealthTool.source).toBe('native');
    expect(computeHealthTool.buildHarm).toBeUndefined();
  });

  it('输入契约 = projectId-only：模型不得传因子（不应编造实测，D8/D2 同根）', () => {
    expect(
      computeHealthTool.inputSchema.safeParse({ projectId: 'xg' }).success,
    ).toBe(true);
    expect(computeHealthTool.inputSchema.safeParse({ projectId: '' }).success).toBe(
      false,
    );
    // 传入额外因子字段：zod object 默认 strip——即便模型硬塞 actualExposure
    // 也不会进入 execute（解析结果只剩 projectId）。
    const parsed = computeHealthTool.inputSchema.safeParse({
      projectId: 'xg',
      actualExposure: 999999,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ projectId: 'xg' });
  });

  it('已注册进 NATIVE_TOOLS / 工具注册表', () => {
    expect(getNativeToolNames()).toContain('compute_health');
    expect(getTool('compute_health')).toBeDefined();
  });

  it('挂 strategy 人格（duty 含健康度监测）', () => {
    expect(getPersona('strategy').tools).toContain('compute_health');
  });
});
