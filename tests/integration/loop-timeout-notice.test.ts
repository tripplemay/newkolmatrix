// M4.8-HARDEN F004 — 主 loop 超时：onLoopTimeout 回调 + 流内告知 + OperationLog 留痕
//
// 【被测的是什么】闸（`AbortSignal.timeout(LOOP_TIMEOUT_MS)`）M4.7 就在了；缺的是
// **闸响了谁来说一声**：BL-LOOP-TIMEOUT-VISIBILITY 实测，撞闸时响应体只有
// start + abort + [DONE] —— 用户端零告知、OperationLog 零行。本文件钉三件事：
//   ① 回调只在**真 abort-by-timeout** 时响（三条负向：正常收敛 / 撞步数上限 / 非超时 abort）
//   ② route 把它写成流内 `data-timeout_notice`，文案取自 registry 单一真相源
//   ③ 落一行 OperationLog(kind=auto)，**只含元数据**（隐私哨兵串断言）
//
// 【判据纪律（D-4 / R-1 同款教训）】负向三条不是凑数：判据宽一格，用户就会在自己
// 关掉页面时收到一句"本次回答超时中断了"，或在答完两分钟后凭空多出一条超时留痕。
//
// 零外呼：模型全是 mock（stalling / scripted），route 用例全程挂 fetch 哨兵。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type { CopilotContext } from '../../src/lib/agent/persona-router';
import {
  installNoNetworkSentinel,
  scriptedModel,
} from '../support/agent-loop-testbed';
import { waitForLogSettle } from '../support/log-settle';

const seam = vi.hoisted(() => ({
  ctx: null as unknown,
  model: null as unknown,
  /** 生产默认闸缩到 2s —— route 用例走**默认路径**（不注入 signal）才测得到它。 */
  gateMs: 2_000,
}));

vi.mock('../../src/lib/agent/registry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/agent/registry')>();
  return { ...actual, LOOP_TIMEOUT_MS: seam.gateMs };
});

vi.mock('../../src/lib/ai/gateway', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/ai/gateway')>();
  return { ...actual, chatModel: () => seam.model };
});

vi.mock('../../src/lib/agent/context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/agent/context')>();
  return { ...actual, buildToolContext: async () => seam.ctx as ToolContext };
});

import { runAgentLoop, type LoopTimeoutEvent } from '../../src/lib/agent/loop';
import {
  FRONT_DESK_AGENT_ID,
  LOOP_TIMEOUT_NOTICE_ANCHOR,
  loopTimeoutNotice,
} from '../../src/lib/agent/registry';
import { LOOP_TIMEOUT_MARKER } from '../../src/lib/agent/loop-timeout-log';
import { POST } from '../../src/app/api/agent/route';

const SLUG = `test-tenant-m48-timeout-${process.pid}`;
/** 隐私哨兵：这句话是用户正文，**不得**出现在任何留痕里。 */
const PROMPT_SENTINEL = '超时哨兵原文-KOL联系方式-13800000000';

let tenantId: string;
let projectId: string;
let ctx: ToolContext;

const toolStep = {
  toolCalls: [
    {
      toolName: 'propose_plan',
      input: { title: 'm48', items: [{ title: 'm48-item', needsGate: false }] },
    },
  ],
};

/** 真的永不 resolve 的流式模型 —— 只在 abort 时才了断（这正是"挂死"的形状）。 */
function stallingStreamModel(afterSteps: number = 0): MockLanguageModelV4 {
  let calls = 0;
  return new MockLanguageModelV4({
    doStream: (options) => {
      const i = calls++;
      // 前 afterSteps 次正常出一个 tool-call 步（让"掐断时已跑完 N 步"非平凡）
      if (i < afterSteps) {
        return scriptedModel([toolStep]).doStream(options);
      }
      return new Promise((_resolve, reject) => {
        const sig = (options as { abortSignal?: AbortSignal }).abortSignal;
        if (!sig) return; // 无 signal = 真的永挂（这正是修复前的处境）
        if (sig.aborted) return reject(sig.reason);
        sig.addEventListener('abort', () => reject(sig.reason), { once: true });
      });
    },
  });
}

/** 与 `AbortSignal.timeout()` **同 reason** 的手动中止（DOMException TimeoutError）。 */
function timeoutReason(): DOMException {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError');
}

const copilot: CopilotContext = {
  route: '/admin',
  projectId: null,
  env: 'default',
  agentId: FRONT_DESK_AGENT_ID,
};

/** 跑一次 loop 并把流消费干净（abort 路径会抛，吞掉即可 —— 判据在回调上）。 */
async function drive(opts: {
  model: MockLanguageModelV4;
  abortSignal?: AbortSignal;
  onLoopTimeout: (e: LoopTimeoutEvent) => void;
}): Promise<{ steps: number; networkCalls: string[] }> {
  const sentinel = installNoNetworkSentinel();
  try {
    const loop = await runAgentLoop({
      copilot,
      messages: [{ role: 'user', content: PROMPT_SENTINEL }],
      model: opts.model,
      ctx: { ...ctx },
      abortSignal: opts.abortSignal,
      onLoopTimeout: opts.onLoopTimeout,
    });
    let steps = 0;
    try {
      for await (const _ of loop.result.fullStream) void _;
      steps = (await loop.result.steps).length;
      await loop.telemetry;
    } catch {
      /* abort 路径预期抛 —— 判据在回调，不在这里 */
    }
    return { steps, networkCalls: sentinel.calls };
  } finally {
    sentinel.restore();
  }
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.8 超时夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.8 超时项目 ${process.pid}` },
  });
  projectId = p.id;
  ctx = {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
    consultBudget: { used: 0, max: 2 },
  };
  seam.ctx = ctx;
});

afterAll(async () => {
  // 清理登记表（spec §4 纪律）：本文件触达 Tenant / Project / OperationLog / PendingAction
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [logs, pas, projects, tenants] = await Promise.all([
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  expect({ logs, pas, projects, tenants }).toEqual({
    logs: 0,
    pas: 0,
    projects: 0,
    tenants: 0,
  });
});

describe('F004 ① 回调：真超时才响', () => {
  it('🔑 注入 30ms 闸 + 挂死模型 → onLoopTimeout 恰好响一次（带 elapsedMs / agentId / steps）', async () => {
    const events: LoopTimeoutEvent[] = [];
    const t0 = Date.now();
    const r = await drive({
      model: stallingStreamModel(),
      abortSignal: AbortSignal.timeout(30),
      onLoopTimeout: (e) => events.push(e),
    });
    expect(r.networkCalls).toEqual([]);
    expect(events.length, '超时必须触发一次告知回调（此前用户端完全空白）').toBe(1);
    expect(events[0].agentId).toBe(FRONT_DESK_AGENT_ID);
    expect(events[0].steps, '挂在第一步 → 已跑完 0 步，如实报').toBe(0);
    expect(events[0].elapsedMs).toBeGreaterThan(0);
    expect(events[0].elapsedMs).toBeLessThan(Date.now() - t0 + 1);
    expect(events[0].tenantId, '留痕作用域要跟着 ctx 走').toBe(tenantId);
    expect(events[0].projectId).toBe(projectId);
  }, 20_000);

  it('🔒 负向①：正常收敛的会话 —— 闸事后到点也不得误响', async () => {
    // 【为什么必须有这一条】默认闸是一个 110s 的定时器：3 秒答完的会话在 107 秒后
    // 照样 abort。没有"会话已落定"这道判据，**每一次成功会话**都会在两分钟后凭空
    // 多出一条超时留痕 + 一句写进已关闭流的告知。
    const events: LoopTimeoutEvent[] = [];
    const controller = new AbortController();
    const r = await drive({
      model: scriptedModel([{ text: '答完了。' }]),
      abortSignal: controller.signal,
      onLoopTimeout: (e) => events.push(e),
    });
    expect(r.steps, '前提：会话确实正常跑完了').toBe(1);
    expect(events, '会话进行中不该有超时').toEqual([]);
    // 事后让闸到点（与 AbortSignal.timeout 同 reason，确定性、不睡秒）
    controller.abort(timeoutReason());
    await new Promise((res) => setTimeout(res, 20));
    expect(events, '会话已落定，闸到点也不得再报超时').toEqual([]);
  }, 20_000);

  it('🔒 负向②：撞步数上限截停 —— 不得被报成超时（两件事，两套归因）', async () => {
    const events: LoopTimeoutEvent[] = [];
    const budget: unknown[] = [];
    const controller = new AbortController();
    const sentinel = installNoNetworkSentinel();
    let steps = 0;
    try {
      const loop = await runAgentLoop({
        copilot,
        messages: [{ role: 'user', content: PROMPT_SENTINEL }],
        model: scriptedModel([], toolStep), // 打不住的模型 → 必然用满预算
        ctx: { ...ctx },
        abortSignal: controller.signal,
        onLoopTimeout: (e) => events.push(e),
        onBudgetExhausted: () => budget.push(1),
      });
      for await (const _ of loop.result.fullStream) void _;
      steps = (await loop.result.steps).length;
      await loop.telemetry;
    } finally {
      sentinel.restore();
    }
    expect(sentinel.calls).toEqual([]);
    expect(steps, '前提：确实撞了步数上限').toBeGreaterThanOrEqual(5);
    expect(budget.length, '前提：撞顶回调确实响了（否则本条负向没有分辨力）').toBe(1);
    expect(events, '撞步数上限 ≠ 超时').toEqual([]);
    controller.abort(timeoutReason());
    await new Promise((res) => setTimeout(res, 20));
    expect(events, '截停后闸到点也不得追认为超时').toEqual([]);
  }, 20_000);

  it('🔒 负向③：非超时 abort（用户主动中断 / 自定义 reason）不得误响', async () => {
    for (const reason of [undefined, new Error('用户关掉了页面')]) {
      const events: LoopTimeoutEvent[] = [];
      const controller = new AbortController();
      const model = stallingStreamModel();
      const sentinel = installNoNetworkSentinel();
      try {
        const loop = await runAgentLoop({
          copilot,
          messages: [{ role: 'user', content: PROMPT_SENTINEL }],
          model,
          ctx: { ...ctx },
          abortSignal: controller.signal,
          onLoopTimeout: (e) => events.push(e),
        });
        setTimeout(() => controller.abort(reason), 20);
        try {
          for await (const _ of loop.result.fullStream) void _;
        } catch {
          /* 中断路径预期抛 */
        }
      } finally {
        sentinel.restore();
      }
      expect(controller.signal.aborted, '前提：确实中断了（否则负向无意义）').toBe(
        true,
      );
      expect(
        events,
        `reason=${reason ? 'Error' : 'AbortError'} 不是超时 —— 误报会让用户在自己关页面时看到"超时中断"`,
      ).toEqual([]);
    }
  }, 20_000);

  it('回调抛错不打死会话（budget 同款纪律）', async () => {
    const r = await drive({
      model: stallingStreamModel(),
      abortSignal: AbortSignal.timeout(30),
      onLoopTimeout: () => {
        throw new Error('回调自爆');
      },
    });
    expect(r.networkCalls).toEqual([]);
    // 回调炸了不影响后续会话：紧接着跑一轮正常的，必须照常收敛
    const after = await drive({
      model: scriptedModel([{ text: '我还活着。' }]),
      onLoopTimeout: () => {},
    });
    expect(after.steps).toBe(1);
  }, 20_000);
});

describe('F004 ② 文案：registry 单一真相源，如实说没答完', () => {
  it('正向精确钉全串（语义 = 超时中断 + 已答部分 + 可重试）', () => {
    expect(loopTimeoutNotice(110_000, 3)).toBe(
      '本次回答超时中断了（等了 110 秒，跑了 3 步还没跑完）。' +
        '上面是我已经查到的部分；没有的话就是我还没来得及作答。' +
        '你可以把问题拆小一点，或者稍后再问我一次。',
    );
  });

  it('锚点 + 不假装答完', () => {
    const notice = loopTimeoutNotice(45_000, 2);
    expect(notice).toContain(LOOP_TIMEOUT_NOTICE_ANCHOR);
    expect(notice, '要给出补救指引').toContain('再问我一次');
    expect(
      notice,
      '不得出现"已完成/已为你办好"这类与超时相反的措辞',
    ).not.toMatch(/已(完成|为你|为您|全部|办好)/);
  });
});

describe('F004 ③ route：流内告知 + OperationLog 一行留痕', () => {
  it('🔑 走**生产默认闸**（不注入 signal）→ 响应体有 data-timeout_notice，留痕只含元数据', async () => {
    seam.model = stallingStreamModel(1); // 第 1 步正常跑完，第 2 步挂死
    const sentinel = installNoNetworkSentinel();
    let body: string;
    try {
      const res = await POST(
        new Request('http://localhost/api/agent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            prompt: PROMPT_SENTINEL,
            context: { route: '/admin', projectId, env: 'default' },
          }),
        }),
      );
      expect(res.status).toBe(200);
      body = await res.text();
    } finally {
      sentinel.restore();
    }
    expect(sentinel.calls, '零外呼').toEqual([]);

    // ── 用户面：告知真的进了流 ────────────────────────────────────────────
    expect(body, '超时必须往流里补一句（此前只有 start+abort+[DONE]）').toContain(
      'data-timeout_notice',
    );
    // 字面量锚点（刻意不 import 常量拼接 —— 两侧同源等于同义反复）
    expect(body).toContain('本次回答超时中断了');
    expect(body).toContain('再问我一次');
    expect(
      body.slice(body.indexOf('data-timeout_notice')),
      '不得出现与超时相反的完成态措辞',
    ).not.toMatch(/已(完成|为你|为您|全部|办好)/);

    // ── 运维面：一行留痕，只含元数据 ──────────────────────────────────────
    const rows = await pollTimeoutRows();
    expect(rows.length, '超时必须留痕一行（此前 OperationLog 零行）').toBe(1);
    expect(rows[0].kind).toBe('auto');
    expect(rows[0].actor).toBe(FRONT_DESK_AGENT_ID);
    const payload = rows[0].payloadJson as unknown as {
      agentId: string;
      elapsedMs: number;
      steps: number;
      kind: string;
    };
    expect(payload.agentId).toBe(FRONT_DESK_AGENT_ID);
    expect(payload.kind).toBe('loop_timeout');
    expect(payload.elapsedMs, '要记得等了多久（运维归因用）').toBeGreaterThan(0);
    expect(payload.steps, '第 1 步跑完了才挂死 —— 步数必须如实记 1').toBe(1);

    // 🔒 隐私哨兵：整行序列化后不得含用户正文 / 工具入参正文
    const rowJson = JSON.stringify(rows[0]);
    expect(rowJson, '留痕只记元数据，不得含消息正文').not.toContain(
      PROMPT_SENTINEL,
    );
    expect(rowJson, '不得含工具入参正文').not.toContain('m48-item');

    // 清理前等留痕/遥测都落完（S-RV2-10 同族：route 的两条写入都是 fire-and-forget，
    // 不等就删租户 → 慢机上要么被迟到的行打红，要么留下孤儿行）
    await waitForLogSettle(tenantId);
  }, 30_000);
});

/** 轮询超时留痕行（route 的落库是 fire-and-forget，响应体读完时可能还在路上）。 */
async function pollTimeoutRows() {
  for (let i = 0; i < 40; i++) {
    const rows = await prisma.operationLog.findMany({
      where: { tenantId, summary: { startsWith: LOOP_TIMEOUT_MARKER } },
    });
    if (rows.length > 0) return rows;
    await new Promise((res) => setTimeout(res, 50));
  }
  return [];
}
