// M4.5-AGENT-LOOP F001 — loop 遥测集成测试（经 F009 测试床驱动真 loop）
//
// 覆盖 acceptance：
// - 每次会话结束落一行遥测：agentId / steps / finishReason / toolNames[]（含重复序）/
//   usage tokens / personaSwitches（F005 前恒 0）
// - 撞步数上限的会话可经查询区分（budgetHit 标记 + finishReason）
// - **不记录任何消息正文与工具入参正文**（哨兵串断言）
// - fire-and-forget：落库失败不影响会话，且 console.error 不静默
// - 三分支：正常收敛 / 撞上限 / 落库失败

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  buildLoopTelemetryPayload,
  LOOP_TELEMETRY_MARKER,
  type LoopTelemetryPayload,
} from '../../src/lib/agent/loop-telemetry';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type { CopilotContext } from '../../src/lib/agent/persona-router';
import { runScriptedLoop } from '../support/agent-loop-testbed';

const FIXTURE_SLUG = `test-tenant-m45-telemetry-${process.pid}`;

let tenantId: string;
let ctx: ToolContext;

const copilot: CopilotContext = {
  route: '/admin/insight',
  projectId: null,
  env: 'default',
  agentId: 'insight',
};

const shareCall = {
  toolCalls: [{ toolName: 'create_share_link', input: { scope: 'quarterly' } }],
};

/** 捞出本租户的遥测行（summary 以 marker 起头）。 */
async function telemetryRows() {
  return prisma.operationLog.findMany({
    where: { tenantId, kind: 'auto', summary: { startsWith: LOOP_TELEMETRY_MARKER } },
    orderBy: { createdAt: 'asc' },
  });
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4.5 遥测夹具租户' },
  });
  tenantId = t.id;
  ctx = { tenantId, agentId: 'insight', projectId: null, env: 'default' };
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('F001 分支① 正常收敛：落一行元数据', () => {
  it('会话结束落一行 OperationLog(kind=auto)，含步数/finishReason/工具序列/用量', async () => {
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: '把季度汇总备一份',
      script: [shareCall, { text: '已备好，等你确认。' }],
    });
    const payload = await run.loop.telemetry;

    expect(payload).toBeTruthy();
    expect(payload!.agentId).toBe('insight');
    expect(payload!.finalAgentId).toBe('insight');
    expect(payload!.steps).toBe(2);
    expect(payload!.finishReason).toBe('stop');
    expect(payload!.toolNames).toEqual(['create_share_link']);
    expect(payload!.toolCallCount).toBe(1);
    expect(payload!.personaSwitches).toBe(0); // F005 前恒 0
    expect(payload!.budgetHit).toBe(false);
    expect(payload!.usage.inputTokens).toBeGreaterThan(0);
    expect(payload!.usage.outputTokens).toBeGreaterThan(0);
    expect(payload!.usage.totalTokens).toBe(
      payload!.usage.inputTokens! + payload!.usage.outputTokens!,
    );

    const rows = await telemetryRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe('insight');
    expect(rows[0].payloadJson).toMatchObject({
      agentId: 'insight',
      steps: 2,
      finishReason: 'stop',
      budgetHit: false,
    });
  });

  it('工具序列含重复且保序（循环形状的指纹，不去重）', async () => {
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: '备两份',
      script: [shareCall, shareCall, { text: '两份都备好了。' }],
    });
    const payload = await run.loop.telemetry;
    expect(payload!.toolNames).toEqual([
      'create_share_link',
      'create_share_link',
    ]);
    expect(payload!.toolCallCount).toBe(2);
  });
});

describe('F001 分支② 撞步数上限可查询区分', () => {
  it('打不住的模型 → budgetHit=true + steps=预算 + finishReason=tool-calls', async () => {
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: '一直干别停',
      script: [],
      fallbackStep: shareCall,
    });
    const payload = await run.loop.telemetry;

    expect(payload!.steps).toBe(run.loop.maxSteps);
    expect(payload!.maxSteps).toBe(run.loop.maxSteps);
    expect(payload!.budgetHit).toBe(true);
    expect(payload!.finishReason).toBe('tool-calls');

    // 查询面：撞上限的会话可被单独捞出（不必解析 finishReason 语义）
    const hit = await prisma.operationLog.findMany({
      where: {
        tenantId,
        kind: 'auto',
        summary: { startsWith: LOOP_TELEMETRY_MARKER },
        payloadJson: { path: ['budgetHit'], equals: true },
      },
    });
    expect(hit.length).toBeGreaterThanOrEqual(1);
    for (const row of hit) {
      expect((row.payloadJson as { budgetHit: boolean }).budgetHit).toBe(true);
    }
  });
});

describe('F001 分支③ 落库失败：不静默、不影响会话', () => {
  it('writer 抛错 → 会话照常结束 + console.error 报出（fire-and-forget）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = (await telemetryRows()).length;
    try {
      const run = await runScriptedLoop({
        copilot,
        ctx,
        prompt: '落库会失败但会话要正常',
        script: [shareCall, { text: '会话正常结束。' }],
        telemetryWriter: async () => {
          throw new Error('模拟 DB 故障');
        },
      });
      const payload = await run.loop.telemetry;

      // 会话本身不受影响
      expect(run.text).toContain('会话正常结束');
      expect(run.finishReason).toBe('stop');
      expect(payload!.steps).toBe(2);

      // 失败被喊出来，不是静默吞
      const logged = spy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('[agent/loop-telemetry]');
      expect(logged).toContain('遥测落库失败');

      // 注入的 writer 被无条件使用 → 真库无新增行
      expect((await telemetryRows()).length).toBe(before);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('F001 隐私边界：只记元数据，不记正文', () => {
  const PROMPT_SENTINEL = 'SENTINEL-PROMPT-kol-contact@example.com';
  const INPUT_SENTINEL = 'SENTINEL-INPUT-project-xyz';

  it('载荷与落库行都不含消息正文 / 工具入参正文', async () => {
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: `请联系 ${PROMPT_SENTINEL} 谈报价`,
      script: [
        {
          toolCalls: [
            { toolName: 'compute_roi', input: { projectId: INPUT_SENTINEL } },
          ],
        },
        { text: `查不到 ${INPUT_SENTINEL}，无法给结论。` },
      ],
    });
    const payload = await run.loop.telemetry;

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain(PROMPT_SENTINEL);
    expect(serialized).not.toContain(INPUT_SENTINEL);
    expect(payload!.toolNames).toEqual(['compute_roi']); // 只留名字

    const rows = await telemetryRows();
    const last = rows[rows.length - 1];
    const rowText = JSON.stringify(last);
    expect(rowText).not.toContain(PROMPT_SENTINEL);
    expect(rowText).not.toContain(INPUT_SENTINEL);
  });
});

describe('F001 载荷装配（纯函数）', () => {
  it('budgetHit = steps >= maxSteps；usage 缺失如实为 null（不填 0）', () => {
    const hit: LoopTelemetryPayload = buildLoopTelemetryPayload({
      agentId: 'orchestrator',
      steps: 5,
      maxSteps: 5,
      finishReason: 'tool-calls',
      toolNames: ['a', 'b', 'a'],
    });
    expect(hit.budgetHit).toBe(true);
    expect(hit.toolNames).toEqual(['a', 'b', 'a']);
    expect(hit.usage).toEqual({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
    expect(hit.finalAgentId).toBe('orchestrator');

    const notHit = buildLoopTelemetryPayload({
      agentId: 'insight',
      steps: 2,
      maxSteps: 10,
      finishReason: 'stop',
      toolNames: [],
      usage: { inputTokens: 7, outputTokens: 3 },
    });
    expect(notHit.budgetHit).toBe(false);
    expect(notHit.usage.totalTokens).toBe(10); // 缺 total 时由分项求和
  });
});
