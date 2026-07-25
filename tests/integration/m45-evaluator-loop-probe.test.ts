// M4.5-AGENT-LOOP 验收探针（Evaluator G1 组：F001 遥测 / F009 测试床）
//
// 独立于 Generator 自带用例，补三处未被覆盖的取证面：
// ① F001 acceptance 写的是「每次 **/api/agent** 会话结束落一行遥测」，但既有集成测全部
//    直接驱动 runAgentLoop，**没有任何用例经过真正的 route handler**（createUIMessageStream
//    包装 + toUIMessageStream 合流这条路径上 onEnd 是否照常触发、defaultWriter 是否真落库，
//    此前无证据）。这里用 mock 模型 + 夹具租户 ctx 打真 POST。
// ② F001「fire-and-forget 不阻塞流式响应」：既有用例只证了「落库失败不影响会话」，
//    未证「落库慢/挂起时会话照常结束」。这里注入永不 resolve 的 writer 做正面证明。
// ③ F009「零外呼哨兵」属扫描类断言 —— 恒空绿必须先证明检测器活着（role-context/evaluator.md
//    「0 findings 必须配检测器活性证明」）。这里对哨兵本身做活性探针。
//
// 全程零外呼、零真实副作用：模型是 mock，outbound 工具停在 pending 信封，夹具租户按 pid 隔离并清理。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { LOOP_TELEMETRY_MARKER } from '../../src/lib/agent/loop-telemetry';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type { CopilotContext } from '../../src/lib/agent/persona-router';
import {
  installNoNetworkSentinel,
  runScriptedLoop,
  scriptedModel,
  type ScriptedStep,
} from '../support/agent-loop-testbed';

/** 被 mock 工厂引用的可变支点（vi.mock 提升，故走 vi.hoisted 持有）。 */
const seam = vi.hoisted(() => ({
  ctx: null as unknown,
  script: [] as ScriptedStep[],
  fallback: undefined as ScriptedStep | undefined,
}));

// 注入缝：route → runAgentLoop 不带 model/ctx 参数（真实请求路径），故从模块层替换
// chatModel 与 buildToolContext——被测对象仍是产品的 route + loop 装配本体。
vi.mock('../../src/lib/ai/gateway', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/ai/gateway')>();
  return {
    ...actual,
    chatModel: () =>
      scriptedModel(seam.script, seam.fallback ?? { text: '（脚本用尽）' }),
  };
});

vi.mock('../../src/lib/agent/context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/agent/context')>();
  return {
    ...actual,
    buildToolContext: async () => seam.ctx as ToolContext,
  };
});

import { POST } from '../../src/app/api/agent/route';

const FIXTURE_SLUG = `test-tenant-m45-evalprobe-${process.pid}`;

let tenantId: string;
let ctx: ToolContext;

const shareCall: ScriptedStep = {
  toolCalls: [{ toolName: 'create_share_link', input: { scope: 'quarterly' } }],
};

async function telemetryRows() {
  return prisma.operationLog.findMany({
    where: {
      tenantId,
      kind: 'auto',
      summary: { startsWith: LOOP_TELEMETRY_MARKER },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** 打一次真 /api/agent（脚本经 seam 注入），读完流后返回响应元信息。 */
async function postAgent(
  body: unknown,
  script: ScriptedStep[],
  fallback?: ScriptedStep,
) {
  seam.script = script;
  seam.fallback = fallback;
  const sentinel = installNoNetworkSentinel();
  try {
    const res = await POST(
      new Request('http://localhost/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    const text = await res.text(); // 读完 = 流走完 = onEnd 该触发了
    return {
      status: res.status,
      agentIdHeader: res.headers.get('X-Agent-Id'),
      text,
      networkCalls: sentinel.calls,
    };
  } finally {
    sentinel.restore();
  }
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M4.5 Evaluator 探针夹具租户' },
  });
  tenantId = t.id;
  ctx = { tenantId, agentId: 'insight', projectId: null, env: 'default' };
  seam.ctx = ctx;
});

afterAll(async () => {
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('[Evaluator] F001 — 真 /api/agent 请求路径落遥测', () => {
  const PROMPT_SENTINEL = 'EVALPROBE-PROMPT-kol@example.com';

  it('POST /api/agent 走完流后，恰好落一行遥测元数据（且不含 prompt 正文）', async () => {
    const before = (await telemetryRows()).length;
    const res = await postAgent(
      {
        prompt: `把季度汇总分享给 ${PROMPT_SENTINEL}`,
        context: { route: '/admin/insight', agentId: 'insight' },
      },
      [shareCall, { text: '已备好，等你确认。' }],
    );

    expect(res.status).toBe(200);
    expect(res.agentIdHeader).toBe('insight');
    expect(res.networkCalls).toEqual([]); // 真 route 路径同样零外呼

    // fire-and-forget：落库在响应之后，用轮询而非直接断言（testing-env-patterns §2）
    await vi.waitFor(
      async () => expect((await telemetryRows()).length).toBe(before + 1),
      { timeout: 5000, interval: 100 },
    );

    const row = (await telemetryRows())[before];
    expect(row.kind).toBe('auto');
    expect(row.actor).toBe('insight');
    const payload = row.payloadJson as Record<string, unknown>;
    expect(payload.agentId).toBe('insight');
    expect(payload.steps).toBe(2);
    expect(payload.finishReason).toBe('stop');
    expect(payload.toolNames).toEqual(['create_share_link']);
    expect(payload.personaSwitches).toBe(0);
    expect(payload.budgetHit).toBe(false);
    const usage = payload.usage as Record<string, number | null>;
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);

    // 隐私边界：整行序列化后不含 prompt 正文采样串
    expect(JSON.stringify(row)).not.toContain(PROMPT_SENTINEL);

    // 闸门在真 route 路径上照旧：只落 PendingAction，不落业务实体
    expect(await prisma.shareLink.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.pendingAction.count({
        where: { tenantId, toolName: 'create_share_link', status: 'pending' },
      }),
    ).toBeGreaterThan(0);
  });

  it('撞步数上限的会话在真 route 路径上可经 payloadJson.budgetHit 查询捞出', async () => {
    const before = (await telemetryRows()).length;
    await postAgent(
      { prompt: '一直干别停', context: { agentId: 'insight' } },
      [],
      shareCall, // 打不住的模型
    );
    await vi.waitFor(
      async () => expect((await telemetryRows()).length).toBe(before + 1),
      { timeout: 5000, interval: 100 },
    );

    const hit = await prisma.operationLog.findMany({
      where: {
        tenantId,
        kind: 'auto',
        summary: { startsWith: LOOP_TELEMETRY_MARKER },
        payloadJson: { path: ['budgetHit'], equals: true },
      },
    });
    expect(hit).toHaveLength(1);
    const payload = hit[0].payloadJson as Record<string, unknown>;
    expect(payload.steps).toBe(payload.maxSteps);
    expect(payload.finishReason).toBe('tool-calls');
    expect((payload.toolNames as string[]).length).toBe(payload.steps);
  });
});

describe('[Evaluator] F001 — 落库挂起不阻塞会话（fire-and-forget 正面证明）', () => {
  it('writer 永不 resolve 时，会话流照常走完并拿到最终文本', async () => {
    const copilot: CopilotContext = {
      route: '/admin/insight',
      projectId: null,
      env: 'default',
      agentId: 'insight',
    };
    const run = await runScriptedLoop({
      copilot,
      ctx,
      prompt: '落库会挂住但会话要走完',
      script: [shareCall, { text: '会话照常结束。' }],
      telemetryWriter: () => new Promise<void>(() => {}), // 永不 resolve
    });

    expect(run.text).toContain('会话照常结束');
    expect(run.finishReason).toBe('stop');

    // 遥测句柄仍悬挂（证明「会话结束」不依赖落库完成）
    const settled = await Promise.race([
      run.loop.telemetry.then(() => 'settled'),
      new Promise((r) => setTimeout(() => r('pending'), 300)),
    ]);
    expect(settled).toBe('pending');
  });
});

describe('[Evaluator] F009 — 零外呼哨兵的活性证明', () => {
  it('哨兵在场时任何出网都被记录且抛错；restore 后 fetch 复原', async () => {
    const original = globalThis.fetch;
    const sentinel = installNoNetworkSentinel();
    let threw = false;
    try {
      await globalThis.fetch('http://127.0.0.1:9/should-never-happen');
    } catch {
      threw = true;
    } finally {
      sentinel.restore();
    }
    expect(threw).toBe(true);
    expect(sentinel.calls).toEqual(['http://127.0.0.1:9/should-never-happen']);
    expect(globalThis.fetch).toBe(original); // 不留污染给后续用例
  });
});

describe('[Evaluator] F009 — 测试床跑的是真执行链（不是桩）', () => {
  it('脚本让 insight 调 delivery 独占工具 payout → 被拒且零副作用', async () => {
    const run = await runScriptedLoop({
      copilot: {
        route: '/admin/insight',
        projectId: null,
        env: 'default',
        agentId: 'insight',
      },
      ctx,
      prompt: '直接给他打钱',
      script: [
        { toolCalls: [{ toolName: 'payout', input: { amount: 999 } }] },
        { text: '（不该走到这里也没关系，重点是上一步被拒）' },
      ],
    });

    expect(run.toolErrors.length).toBeGreaterThan(0);
    expect(run.toolOutputs).toHaveLength(0);
    expect(run.visibleToolsPerStep[0]).not.toContain('payout');
    expect(
      await prisma.pendingAction.count({
        where: { tenantId, toolName: 'payout' },
      }),
    ).toBe(0);
    expect(run.networkCalls).toEqual([]);
  });
});
