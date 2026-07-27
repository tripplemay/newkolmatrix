// M4.7-FRONTDESK 对抗复核 · fix_round2 —— 撞顶告知的**真 route 行为核实**
//
// 【为什么单独一个文件】本文件用 vi.mock 在模块层替换 chatModel / buildToolContext，
// 会影响整个文件的模块初始化；m47-adv-probe.test.ts 里的 P9c 要用**真** chatModel
// 打本地挂死服务器，两者放一起会互相污染。（同 project-context-route.test.ts 的分文件理由。）
//
// 【补的是哪一层】fix_round2 给 R-2 的收口是两条**源码级**断言（面板有分支 +
// 两侧字段同名）。它们挡得住"分支被删/字段改名"，但挡不住一件更要命的事：
//
//   `onBudgetExhausted` 是在 streamText 的 `onEnd` 里触发的，而 route 的
//   `execute` 早就 `writer.merge(...)` 返回了 —— 若 UI message stream 此刻
//   已经关闭，`writer.write()` 就是个 no-op，回调调了、part 却进不了响应体。
//
// 这正是本组一路在追的同一条纪律的下一层：
//   「写进流 ≠ 用户看得见」→ 现在是「回调被调用 ≠ part 进了响应体」。
// 故这里断言的对象是**真 POST 的响应体字节**，不是任何中间产物。
//
// 零外呼：模型是 mock，fetch 哨兵全程在场。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  BUDGET_NOTICE_ANCHOR,
  DEFAULT_MAX_STEPS,
  FRONT_DESK_AGENT_ID,
} from '../../src/lib/agent/registry';
import { LOOP_TELEMETRY_MARKER } from '../../src/lib/agent/loop-telemetry';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import {
  installNoNetworkSentinel,
  scriptedModel,
  type ScriptedStep,
} from '../support/agent-loop-testbed';

/** vi.mock 工厂被提升到文件顶部 → 支点必须走 vi.hoisted。 */
const seam = vi.hoisted(() => ({
  ctx: null as unknown,
  script: [] as unknown[],
  fallback: null as unknown,
}));

// route → runAgentLoop 不带 model / ctx（那正是真实请求路径），故从模块层替换。
// 被测对象仍是产品的 route + loop 装配本体。
vi.mock('../../src/lib/ai/gateway', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/lib/ai/gateway')
  >();
  return {
    ...actual,
    chatModel: () =>
      scriptedModel(
        seam.script as ScriptedStep[],
        (seam.fallback as ScriptedStep) ?? { text: '（脚本用尽）' },
      ),
  };
});

vi.mock('../../src/lib/agent/context', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/lib/agent/context')
  >();
  return { ...actual, buildToolContext: async () => seam.ctx as ToolContext };
});

import { POST } from '../../src/app/api/agent/route';
// 面板声明的常量——两侧比对时用它，而不是在测试里再抄一遍字面量
import { BUDGET_NOTICE_PART } from '../../src/components/copilot/CopilotPanel';

const SLUG = `test-tenant-m47-advroute-${process.pid}`;
let tenantId: string;
let projectId: string;

const ledger: Record<string, unknown> = {};

/**
 * 本文件一共打了几次 POST。
 *
 * 每次 POST 结束都会落**一行** loop 遥测，且那行是 fire-and-forget 写入
 *（见 afterAll 的根因说明）——清理前要等的就是这几行。用计数器而不是写死 3，
 * 这样 `vitest -t` 只跑其中一条时也不会白等到超时。
 */
let postCount = 0;

async function postAgent(
  script: ScriptedStep[],
  fallback?: ScriptedStep,
): Promise<{ status: number; body: string; networkCalls: string[] }> {
  seam.script = script;
  seam.fallback = fallback ?? null;
  postCount += 1;
  const sentinel = installNoNetworkSentinel();
  try {
    const res = await POST(
      new Request('http://localhost/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: '帮我看看这个项目该推进什么',
          context: {
            route: `/admin/campaigns/${projectId}`,
            projectId,
            env: 'default',
            agentId: 'match', // 刻意传环节人格：服务端不得采信
            stage: 'match',
          },
        }),
      }),
    );
    return {
      status: res.status,
      body: await res.text(), // 读完 = 流走完
      networkCalls: sentinel.calls,
    };
  } finally {
    sentinel.restore();
  }
}

/** 一步"还在要工具"的脚本步（用于把预算烧到撞顶）。 */
const toolStep: ScriptedStep = {
  toolCalls: [
    {
      toolName: 'propose_plan',
      input: { title: 'x', items: [{ title: 'y', needsGate: false }] },
    },
  ],
};

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 对抗复核 route 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 advroute ${process.pid}` },
  });
  projectId = p.id;
  seam.ctx = {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
  } satisfies ToolContext;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 逐表清（这份表清单就是残留断言的鉴别力所在——少写一张，那张就归不了零）。 */
async function purge(): Promise<void> {
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

/** 逐表点数（断言对象）。 */
async function census(): Promise<Record<string, number>> {
  const [handoffs, shares, logs, pas, projects, tenants] = await Promise.all([
    prisma.handoff.count({ where: { tenantId } }),
    prisma.shareLink.count({ where: { tenantId } }),
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  return { handoffs, shares, logs, pas, projects, tenants };
}

/**
 * 等 fire-and-forget 的 loop 遥测落齐（有界）。
 * 返回观测值而不是抛错——等不齐也照样往下走，由后面的"二次清"兜底。
 */
async function waitForTelemetry(
  expected: number,
  timeoutMs = 15_000,
): Promise<{ rows: number; waitedMs: number; timedOut: boolean }> {
  const t0 = Date.now();
  let rows = 0;
  while (Date.now() - t0 < timeoutMs) {
    rows = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: LOOP_TELEMETRY_MARKER } },
    });
    if (rows >= expected) {
      return { rows, waitedMs: Date.now() - t0, timedOut: false };
    }
    await sleep(50);
  }
  return { rows, waitedMs: Date.now() - t0, timedOut: true };
}

/*
 * ── 清理段 ──────────────────────────────────────────────────────────────
 * 【CI 假红根因（本机实测复现，非猜测）】loop 遥测是 fire-and-forget
 *（`loop.ts` 的 `void logLoopTelemetry(...)`，`AgentLoopRun.telemetry` 注释亦
 * 明写"调用方不需要 await"）。它那行 OperationLog 的写入落在 `res.text()`
 * resolve **之后的几毫秒内**——本机通常抢在 deleteMany 之前，CI 慢机常落在
 * 之后，于是残留断言看到 logs:1 假红。
 *
 * 诊断实测（临时诊断件，用完即删）：连打 5 次 POST，每次在读完响应体后立刻
 * 点数 → 删 → 静置 300ms 再点数。5 次里 4 次"立刻点数"为 0，且删后静置仍为 0
 *（说明那行恰好落在"点数与删除之间"被删掉了）；而中途**不穿插删除**时，
 * 5 行遥测在最后一次响应读完时已全部在库。⇒ 竞态确凿，且就在 ms 级窗口上。
 *
 * 【修法不是放宽断言】而是等该落的都落完再删：
 *   ① 每次 POST 必落一行遥测、行数已知（= postCount）→ 有界轮询等它落齐；
 *   ② 清；③ 静置后再清一次（兜住 ① 超时后的迟到行）；④ 逐表断言为 0。
 * 断言本身一个字没放宽：`purge()` 的表清单没变，漏清哪张表，
 * census 里那张表就归不了零 —— 鉴别力（"你到底清了哪几张表"）原样保留。
 */
afterAll(async () => {
  const tele = await waitForTelemetry(postCount);
  ledger['cleanup.postCount'] = postCount;
  ledger['cleanup.telemetryWait'] = tele;

  await purge();
  await sleep(200); // 给 ① 超时后可能迟到的写入留一个窗口
  await purge();

  const leftover = await census();
  ledger['cleanup.leftover'] = leftover;
  console.log('\n[m47-adv-route 观测台账]\n' + JSON.stringify(ledger, null, 2));

  expect(leftover).toEqual({
    handoffs: 0,
    shares: 0,
    logs: 0,
    pas: 0,
    projects: 0,
    tenants: 0,
  });
  // $disconnect 保留：vitest 默认 isolate + 每文件独立 worker，
  // 各文件各自持有 prisma 模块实例，断开不会波及其他文件
  //（同仓先例：consult-failure / long-chain-honesty / m47-adv-probe 都这么写，
  //  且 m47-adv-probe 已随 9d8c202 进 CI 并在本次 run 里 118 passed 中通过）。
  await prisma.$disconnect();
});

describe('R-2 收口的行为核实：撞顶告知真的进了 HTTP 响应体', () => {
  it('PR1 🔑 撞顶 → 响应体里真的有 budget_notice part + 告知正文', async () => {
    // 打不住的模型：每步都还在要工具 → 用满 5 步且末步仍在要工具 = 真被截停
    const r = await postAgent([], toolStep);
    ledger['PR1.status'] = r.status;
    ledger['PR1.bodyHasNoticePart'] = r.body.includes(BUDGET_NOTICE_PART);
    ledger['PR1.bodyHasAnchor'] = r.body.includes(BUDGET_NOTICE_ANCHOR);
    ledger['PR1.bodyBytes'] = r.body.length;

    expect(r.status).toBe(200);
    expect(r.networkCalls).toEqual([]);
    // ① part 的 type 用**面板声明的常量**比，不在测试里另抄字面量
    expect(
      r.body,
      'onEnd 里的 writer.write 若晚于流关闭，这里就会缺 —— 回调被调用 ≠ part 进了响应体',
    ).toContain(BUDGET_NOTICE_PART);
    // ② 告知正文真的随 part 一起到了客户端（不是只有一个空壳 type）
    expect(r.body).toContain(BUDGET_NOTICE_ANCHOR);
    // ③ 说清用满了几步
    expect(r.body).toContain(`${DEFAULT_MAX_STEPS} 步`);
  }, 60_000);

  it('PR2 自然收敛（恰好用满、末步出文本）→ 响应体里没有 budget_notice', async () => {
    // R-1 的用户面终点核实：判据改严之后，这条链路上确实不再误报
    const script: ScriptedStep[] = [
      ...Array.from({ length: DEFAULT_MAX_STEPS - 1 }, () => toolStep),
      { text: '查完了，结论如上。' },
    ];
    const r = await postAgent(script);
    ledger['PR2.bodyHasNoticePart'] = r.body.includes(BUDGET_NOTICE_PART);
    ledger['PR2.bodyHasAnchor'] = r.body.includes(BUDGET_NOTICE_ANCHOR);

    expect(r.status).toBe(200);
    expect(r.body, '答案完整时不得对用户说"我没答完"').not.toContain(
      BUDGET_NOTICE_PART,
    );
    expect(r.body).not.toContain(BUDGET_NOTICE_ANCHOR);
    // 正向：答案本身是到了的（证明这条负向断言不是因为整条链没跑起来）
    expect(r.body).toContain('查完了');
    expect(r.networkCalls).toEqual([]);
  }, 60_000);

  it('PR3 未撞顶的普通会话 → 同样没有 budget_notice（不打扰正常动线）', async () => {
    const r = await postAgent([{ text: '好的。' }]);
    ledger['PR3.bodyHasNoticePart'] = r.body.includes(BUDGET_NOTICE_PART);
    expect(r.body).not.toContain(BUDGET_NOTICE_PART);
    expect(r.body).toContain('好的');
  }, 60_000);
});
