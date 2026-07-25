// M4.5-AGENT-LOOP F009 — loop 测试床自身的验收测试
//
// 覆盖 acceptance：
// - 测试床可脚本化指定逐步 tool-call 序列驱动 /api/agent 同款 loop（真 executeTool 链）
// - 零外呼（fetch 哨兵恒空）
// - 三场景夹具可复用：① 步数上限截停 ② outbound pending 停驻 ③ 工具子集收窄（F005 接力断言的底座）
//
// 说明：本文件既是 F009 的验收，也是后续 feature（F002 长链诚实回归 / F005 接力负向断言 /
// F007 批量 pending）复用测试床的样例——脚本形状在此定型。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getPersona } from '../../src/lib/agent/registry';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type { CopilotContext } from '../../src/lib/agent/persona-router';
import { runScriptedLoop } from '../support/agent-loop-testbed';

const FIXTURE_SLUG = `test-tenant-m45-testbed-${process.pid}`;

let tenantId: string;
let ctx: ToolContext;

const copilot: CopilotContext = {
  route: '/admin/insight',
  projectId: null,
  env: 'default',
  agentId: 'insight',
};

/** 一步 outbound 调用（quarterly 分享无需项目，harm 不读 DB —— 最轻的 outbound 夹具）。 */
const shareCall = {
  toolCalls: [
    { toolName: 'create_share_link', input: { scope: 'quarterly' } },
  ],
};

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4.5 loop 测试床夹具租户' },
  });
  tenantId = t.id;
  ctx = { tenantId, agentId: 'insight', projectId: null, env: 'default' };
});

afterAll(async () => {
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('F009 场景① 步数上限截停', () => {
  it('模型不肯收手时，loop 恰在预算步截停（不是无限跑）', async () => {
    // 脚本为空 + fallback 恒调工具 = 「打不住的模型」
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: '一直干活别停',
      script: [],
      fallbackStep: shareCall,
    });

    expect(run.steps).toBe(run.loop.maxSteps);
    expect(run.toolNames).toHaveLength(run.loop.maxSteps);
    expect(run.finishReason).toBe('tool-calls'); // 截停 ≠ 天然收敛（后者是 'stop'）
    expect(run.networkCalls).toEqual([]);
  });

  it('末步无 tool call → loop 天然收敛（不跑满预算）', async () => {
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: '看一眼就好',
      script: [shareCall, { text: '已备好，等你确认。' }],
    });

    expect(run.steps).toBe(2);
    expect(run.steps).toBeLessThan(run.loop.maxSteps);
    expect(run.finishReason).toBe('stop');
    expect(run.text).toContain('等你确认');
  });
});

describe('F009 场景② outbound pending 停驻', () => {
  it('模型自主调 outbound 工具只拿到 pending 信封，副作用零发生', async () => {
    const before = await prisma.shareLink.count({ where: { tenantId } });
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: '把季度汇总分享出去',
      script: [shareCall, { text: '已经准备好，需要你确认后才会生成。' }],
    });

    expect(run.toolOutputs).toHaveLength(1);
    const output = run.toolOutputs[0].output as {
      status?: string;
      pendingActionId?: string;
      harm?: { irreversible?: boolean };
    };
    expect(output.status).toBe('pending');
    expect(output.pendingActionId).toBeTruthy();
    expect(output.harm?.irreversible).toBe(true);

    // 停驻 = 只落 PendingAction，不落业务实体（零真实公开暴露）
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(before);
    expect(
      await prisma.pendingAction.count({
        where: { tenantId, toolName: 'create_share_link', status: 'pending' },
      }),
    ).toBeGreaterThan(0);
    expect(run.networkCalls).toEqual([]);
  });
});

describe('F009 场景③ 工具子集收窄（人格隔离的硬证据）', () => {
  it('模型每步看见的工具 = 当值人格子集，别的人格独占工具不在其中', async () => {
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: '看看洞察面',
      script: [{ text: '好的。' }],
    });

    const insight = getPersona('insight');
    expect(run.visibleToolsPerStep[0].sort()).toEqual([...insight.tools].sort());
    // delivery 独占的 payout 不在 insight 视野内（负向断言）
    expect(run.visibleToolsPerStep[0]).not.toContain('payout');
    expect(run.loop.persona.id).toBe('insight');
  });

  it('每步的 system 段来自当值人格（非硬编码，registry 同源）', async () => {
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: '你是谁',
      script: [{ text: '我是洞察 Agent。' }],
    });

    const insight = getPersona('insight');
    expect(run.systemPerStep[0]).toContain(insight.duty);
    expect(run.systemPerStep[0]).toContain(insight.isolation);
  });
});
