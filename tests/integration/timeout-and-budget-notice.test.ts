// M4.7-FRONTDESK fix_round1 — F007 真超时闸 + F006 撞顶告知
//
// 【这两条为什么是产品机制而非断言问题】
//   F007：首轮验收实测，上游"连上但永不回响应头"时产品侧**全链无自限**，只能等
//         undici 的 ~301s 兜底（自托管 standalone 下 maxDuration=120 是死配置，
//         不构成截断）。在那之前用户端空转、前台也没机会说"我问了但没拿到结果"——
//         D-4 承诺的降级在挂死场景根本不可达。
//   F006：撞顶时模型**没有开口的机会**（loop 直接停），用户端拿到完全空白的回复。
//         任何写在 system 里的条款都救不了，只能由服务端在流里补一句。
//
// 【测试自身的教训】上一版所谓"超时支"是 `mockRejectedValue` —— 与抛错支是同一条
// catch，只是 Error message 改了个名。这一版用**真的永不 resolve 的模型** + 极短
// abortSignal 驱动，测的是真超时路径。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  BUDGET_NOTICE_ANCHOR,
  FRONT_DESK_AGENT_ID,
  LOOP_TIMEOUT_MS,
  SPECIALIST_TIMEOUT_MS,
  budgetExhaustedNotice,
} from '../../src/lib/agent/registry';
import { runSpecialistLoop } from '../../src/lib/agent/specialist-loop';
import { runAgentLoop } from '../../src/lib/agent/loop';
import { executeTool } from '../../src/lib/agent/execute';
import {
  CONSULT_FAILED_MARKER,
  CONSULT_TIMEOUT_HINT,
  type ConsultSpecialistOutput,
} from '../../src/lib/agent/tools/consult-specialist';
import { runScriptedLoop } from '../support/agent-loop-testbed';
import { installNoNetworkSentinel } from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG = `test-tenant-m47-timeout-${process.pid}`;
let tenantId: string;
let projectId: string;
let ctx: ToolContext;

/** 真的永不 resolve 的模型——只在 abort 时才了断。 */
function stallingModel(): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: (options) =>
      new Promise<LanguageModelV4GenerateResult>((_resolve, reject) => {
        const signal = (options as { abortSignal?: AbortSignal }).abortSignal;
        if (!signal) return; // 无 signal = 真的永挂（这正是修复前的处境）
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      }),
  });
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 timeout 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 timeout 项目 ${process.pid}` },
  });
  projectId = p.id;
  ctx = {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
    consultBudget: { used: 0, max: 2 },
  };
});

afterAll(async () => {
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [logs, handoffs, pas, projects, tenants] = await Promise.all([
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.handoff.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  expect({ logs, handoffs, pas, projects, tenants }).toEqual({
    logs: 0,
    handoffs: 0,
    pas: 0,
    projects: 0,
    tenants: 0,
  });
});

describe('F007 — 真超时闸（不是抛错支改名）', () => {
  it('🔒 R-3：允许的咨询次数内连续挂死也撞不穿主闸', async () => {
    // 对抗复核残留缺口 R-3：2 × 60s > 110s 时，两次连续挂死会先撞穿主 loop 闸，
    // 前台照样说不出话——子闸等于白设。不等式必须成立。
    const { MAX_CONSULTS_PER_TURN } = await import(
      '../../src/lib/agent/registry'
    );
    expect(
      MAX_CONSULTS_PER_TURN * SPECIALIST_TIMEOUT_MS,
      `${MAX_CONSULTS_PER_TURN} 次 × ${SPECIALIST_TIMEOUT_MS}ms 必须 < 主闸 ${LOOP_TIMEOUT_MS}ms`,
    ).toBeLessThan(LOOP_TIMEOUT_MS);
  });

  it('常量在场且低于 route 的 maxDuration（我们的降级要先于外部兜底）', () => {
    expect(SPECIALIST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(
      LOOP_TIMEOUT_MS,
      'route.ts 的 maxDuration=120s；主 loop 闸必须在它之下才轮得到我们自己的降级',
    ).toBeLessThan(120_000);
    expect(SPECIALIST_TIMEOUT_MS).toBeLessThan(LOOP_TIMEOUT_MS);
  });

  it('🔒 RV-2：**生产默认路径**真的带闸（不注入任何 signal）', async () => {
    // 【复验 RV-2】本批头号产品机制的**生产路径**此前零机械覆盖：摘掉
    // specialist-loop 与 loop 的两个默认 AbortSignal.timeout（保留测试注入缝）后
    // **1414 条全绿**——仓内每条超时用例都注入短闸，没有一条走生产默认。
    //
    // 【怎么在不等 45 秒的前提下验生产默认】让 mock 模型把它**实际收到的**
    // abortSignal 捕获下来：不注入时它必须非空（= 默认闸真的挂上了），
    // 然后手动 abort 让用例秒结束。断言的是"生产路径确实传了一个会超时的 signal"。
    let captured: AbortSignal | null = null;
    const model = new MockLanguageModelV4({
      doGenerate: (options) =>
        new Promise<LanguageModelV4GenerateResult>((_res, rej) => {
          const sig = (options as { abortSignal?: AbortSignal }).abortSignal;
          captured = sig ?? null;
          if (!sig) return rej(new Error('生产默认路径没有传 abortSignal'));
          sig.addEventListener('abort', () => rej(sig.reason), { once: true });
          // 立刻手动中止，避免真等 SPECIALIST_TIMEOUT_MS
          setTimeout(() => (sig as AbortSignal & { _t?: unknown }) && rej(new Error('手动结束')), 50);
        }),
    });
    await expect(
      runSpecialistLoop({
        targetAgent: 'insight',
        question: 'ROI？',
        // **不传 abortSignal、不设 ctx.consultTimeoutMs** —— 走生产默认
        ctx: { tenantId, agentId: FRONT_DESK_AGENT_ID, projectId, env: 'default' },
        model,
      }),
    ).rejects.toThrow();
    expect(
      captured,
      '生产默认路径必须给模型一个 abortSignal —— 没有它就只能等 undici 的 ~301s',
    ).not.toBeNull();
  });

  it('🔒 RV-2c：**主 loop** 生产默认路径真的带闸（不注入任何 signal）', async () => {
    // 【复验轮二 §13.2】上一版只补了子 loop 那一条：摘掉 loop.ts:294 的默认
    // AbortSignal.timeout（保留 params.abortSignal 注入缝）后**1418 条全绿**——
    // 主 loop 的生产默认闸此前零覆盖。而挂死暴露**不是子 loop 专属**
    //（registry.ts:87-88 已如实登记），主 loop 同样无自限。
    //
    // 手法同 RV-2：让 mock 把它**实际收到的** abortSignal 捕获下来，不注入时必须非空，
    // 然后手动了断，避免真等 LOOP_TIMEOUT_MS（110s）。
    let captured: AbortSignal | null = null;
    const model = new MockLanguageModelV4({
      doStream: async (options) => {
        captured = (options as { abortSignal?: AbortSignal }).abortSignal ?? null;
        if (!captured) throw new Error('主 loop 生产默认路径没有传 abortSignal');
        throw new Error('手动结束（signal 已捕获）');
      },
    });
    const sentinel = installNoNetworkSentinel();
    try {
      const loop = await runAgentLoop({
        copilot: {
          route: '/admin',
          projectId,
          env: 'default',
          agentId: FRONT_DESK_AGENT_ID,
        },
        messages: [{ role: 'user', content: '挂着别回' }],
        model,
        ctx: { tenantId, agentId: FRONT_DESK_AGENT_ID, projectId, env: 'default' },
        // **不传 abortSignal** —— 走生产默认
      });
      // 模型这一步就抛，流以 error 片了断。这里只负责把它消费干净——
      // 判据是「模型收到的 signal」，不是抛不抛。
      // （不 await loop.telemetry：onEnd 在异常路径不触发，那个 promise 永不 resolve，
      //   loop.ts:166-168 的注释正是为此写的。同理也不会落遥测行，无孤儿风险。）
      try {
        for await (const _ of loop.result.fullStream) void _;
      } catch {
        /* 预期内 */
      }
    } finally {
      sentinel.restore();
    }
    expect(
      captured,
      '主 loop 生产默认路径必须给模型一个 abortSignal —— 没有它挂死时只能等 undici 的 ~301s',
    ).not.toBeNull();
  }, 30_000);

  it('🔒 RV-2b（重写）：默认闸的时限真的**读常量**（写死数字 → 本条红）', async () => {
    // 【为什么重写】上一版判据是 `captured.aborted === false` + `elapsed < 常量`，
    // 而用例 ~30ms 就手动结束——任何 ≥50ms 的默认闸都满足它，包括写死的 45s、
    // 写死的 5s、以及被改小的常量。复验轮二实测：写死 45_000 与常量改 3s **双双全绿**，
    // 它比 RV-2 多提供的信息量是零（`captured` 非空 RV-2 已经断言过）。
    //
    // 【真双向绑定】把常量本身换成 30ms 再走生产默认路径：闸若读常量，模型 30ms 后
    // 被 abort、用例毫秒级结束；闸若写死数字（不读常量），这里会一直挂到用例超时。
    vi.resetModules();
    vi.doMock('../../src/lib/agent/registry', async () => {
      const actual = await vi.importActual<
        typeof import('../../src/lib/agent/registry')
      >('../../src/lib/agent/registry');
      return { ...actual, SPECIALIST_TIMEOUT_MS: 30 };
    });
    try {
      const { runSpecialistLoop: freshRun } = await import(
        '../../src/lib/agent/specialist-loop'
      );
      const t0 = Date.now();
      await expect(
        freshRun({
          targetAgent: 'insight',
          question: 'ROI？',
          // 不注入 abortSignal、不设 ctx.consultTimeoutMs —— 时限只能来自常量
          ctx: {
            tenantId,
            agentId: FRONT_DESK_AGENT_ID,
            projectId,
            env: 'default',
          },
          model: stallingModel(), // 只在 abort 时才了断
        }),
        '常量被换成 30ms 后仍未在秒级内 abort = 默认闸没读常量（写死数字）',
      ).rejects.toThrow();
      expect(
        Date.now() - t0,
        '闸的时限必须跟着常量走',
      ).toBeLessThan(5_000);
    } finally {
      vi.doUnmock('../../src/lib/agent/registry');
      vi.resetModules();
    }
  }, 20_000);

  it('🔒 RV-2d：常量取值的**下界**也有钉（收紧方向此前完全不设防）', () => {
    // 【复验轮二 §13.2】唯一守住取值的是 R-3 不等式（MAX_CONSULTS × 子闸 < 主闸），
    // 它只挡**放大**方向；把 45s 改成 3s 全绿。而 BL-AGENT-COST-CALIBRATE 指向的
    // 正是"上线后要调这个值"——调错方向没有任何钉子会响，代价是把「挂死不降级」
    // 换成「正常请求被误判超时」（registry.ts:93-95 已如实登记这层风险）。
    //
    // 【下界怎么来的】它同样**不是实测值**，是一道护栏：子 loop 允许 3 步
    //（SPECIALIST_MAX_STEPS），低于本值意味着平均每步不到几秒就掐断，正常请求几乎必被
    // 误判。真要往下调，必须先有真实延迟样本 → BL-AGENT-COST-CALIBRATE，并同步改这里。
    const FLOOR_MS = 20_000;
    expect(
      SPECIALIST_TIMEOUT_MS,
      `子闸 ${SPECIALIST_TIMEOUT_MS}ms 低于护栏 ${FLOOR_MS}ms —— 收紧到这个量级会把正常请求判成超时；` +
        '如确需下调，请带上实测延迟数据一并改本护栏（BL-AGENT-COST-CALIBRATE）',
    ).toBeGreaterThanOrEqual(FLOOR_MS);
    // 上界仍由 R-3 不等式那条用例守（放大方向），此处只补下界，两边合起来才是一个区间。
  });

  it('子 loop 真挂死 → 在时限内被 abort（不是等 undici 的 ~301s）', async () => {
    const started = Date.now();
    await expect(
      runSpecialistLoop({
        targetAgent: 'insight',
        question: 'ROI？',
        ctx,
        model: stallingModel(),
        abortSignal: AbortSignal.timeout(300), // 注入缝：不必真等 60s
      }),
    ).rejects.toThrow();
    const elapsed = Date.now() - started;
    expect(elapsed, '必须由我们的闸了断，而不是挂到天荒地老').toBeLessThan(5_000);
  });

  it('🔑 挂死经工具层 → 前台拿到结构化失败并能分辨是超时（D-4 承诺在挂死场景真的可达）', async () => {
    const before = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
    });
    const sentinel = installNoNetworkSentinel();
    let out: ConsultSpecialistOutput;
    try {
      const res = (await executeTool(
        'consult_specialist',
        { targetAgent: 'insight', question: 'ROI？' },
        {
          ...ctx,
          model: stallingModel(),
          // 走工具层时用 ctx 上的短闸（生产路径读 registry 常量 SPECIALIST_TIMEOUT_MS）
          consultTimeoutMs: 300,
          consultBudget: { used: 0, max: 2 },
        },
      )) as { output: ConsultSpecialistOutput };
      out = res.output;
    } finally {
      sentinel.restore();
    }
    expect(out.ok, '挂死必须降级成结构化失败，不是把会话拖死').toBe(false);
    expect(
      out.failureReason,
      '要能分辨"没等到"与"工具报错"——线上归因时是两码事',
    ).toContain(CONSULT_TIMEOUT_HINT);
    expect(out.answer, '拿不到就是空，不许编').toBe('');
    const after = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
    });
    expect(after, '超时同样要留痕').toBe(before + 1);
  });
});

describe('F006 — 撞顶时用户端拿得到「未答完 + 还差什么」', () => {
  it('文案锚点钉死：不得被改成"已为你完成"之类', () => {
    const notice = budgetExhaustedNotice(5, 2);
    expect(notice).toContain(BUDGET_NOTICE_ANCHOR);
    expect(notice, '要说清还差什么、怎么办').toContain('剩下的没来得及查');
    expect(notice, '咨询过几位专家要如实带上').toContain('2 位专家');
    expect(
      notice,
      '不得出现"已完成/已为你办好"这类与撞顶相反的措辞',
    ).not.toMatch(/已(完成|为你|全部)/);
  });

  it('🔑 撞顶时回调真被触发（此前用户端完全空白）', async () => {
    const events: Array<{ steps: number; consultCount: number }> = [];
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: { ...ctx },
      prompt: '一直查下去',
      // 打不住的模型：恒调 propose_plan（前台真持有），必然用满预算
      script: [],
      fallbackStep: {
        toolCalls: [
          {
            toolName: 'propose_plan',
            input: {
              title: '撞顶夹具',
              items: [{ title: '继续', needsGate: false }],
            },
          },
        ],
      },
      onBudgetExhausted: (e) => events.push(e),
    });
    expect(run.networkCalls).toEqual([]);
    expect(events.length, '撞顶必须触发一次告知回调').toBe(1);
    expect(events[0].steps).toBe(run.steps);
    // 告知文案由服务端据此生成——用户端因此不再是空白
    expect(budgetExhaustedNotice(events[0].steps, events[0].consultCount)).toContain(
      BUDGET_NOTICE_ANCHOR,
    );
  });

  it('🔒 R-1：自然收敛恰好用满步数时**不得**误报「我没答完」', async () => {
    // 对抗复核实测：判据只看步数时，末步出文本的自然收敛也会 fired=1 —— 用户看到
    // 一句莫名其妙的"我没答完"。正确判据是"步数用满**且末步仍在要工具**"，
    // specialist-loop 早就是这么写的，主 loop 当时没沿用。
    const events: unknown[] = [];
    const front = (await import('../../src/lib/agent/registry')).getPersona(
      FRONT_DESK_AGENT_ID,
    );
    const script = Array.from({ length: front.maxSteps - 1 }, () => ({
      toolCalls: [
        {
          toolName: 'propose_plan',
          input: { title: 'x', items: [{ title: 'y', needsGate: false }] },
        },
      ],
    }));
    const run = await runScriptedLoop({
      copilot: {
        route: '/admin',
        projectId: null,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: { ...ctx },
      prompt: '恰好用满但自然收敛',
      // 前 n-1 步调工具，末步出文本 → 步数恰好用满，但是自然收敛
      script: [...script, { text: '答完了。' }],
      onBudgetExhausted: () => events.push(1),
    });
    expect(run.steps, '前提：确实用满了预算').toBe(front.maxSteps);
    expect(events, '自然收敛不该被当成"没答完"').toEqual([]);
  });

  it('🔒 R-6：遥测与用户面同口径（自然收敛用满时两边都不算撞顶）', async () => {
    // 对抗复核残留缺口 R-6：用户面改严判据后，遥测仍是宽判据（只看步数）——
    // 同一事实两个消费者口径分歧，线上按遥测算"撞顶率"会系统性偏高。
    // 【本条是补上的】修完 R-6 时我一度没写断言，变异"遥测退回宽判据"全绿 =
    // 等于没修（实测踩到）。
    const events: unknown[] = [];
    const front = (await import('../../src/lib/agent/registry')).getPersona(
      FRONT_DESK_AGENT_ID,
    );
    const script = Array.from({ length: front.maxSteps - 1 }, () => ({
      toolCalls: [
        {
          toolName: 'propose_plan',
          input: { title: 'x', items: [{ title: 'y', needsGate: false }] },
        },
      ],
    }));
    const run = await runScriptedLoop({
      copilot: {
        route: '/admin',
        projectId: null,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: { ...ctx },
      prompt: '恰好用满但自然收敛',
      script: [...script, { text: '答完了。' }],
      onBudgetExhausted: () => events.push(1),
    });
    const tele = await run.loop.telemetry;
    expect(run.steps, '前提：确实用满了预算').toBe(front.maxSteps);
    expect(events, '用户面：自然收敛不告知').toEqual([]);
    expect(
      tele!.budgetHit,
      '遥测必须与用户面同口径 —— 不然线上撞顶率系统性偏高',
    ).toBe(false);
    expect(tele!.budgetHitScope).toBe('none');
  });

  it('未撞顶的会话不触发（不打扰正常动线）', async () => {
    const events: unknown[] = [];
    await runScriptedLoop({
      copilot: {
        route: '/admin',
        projectId: null,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: { ...ctx },
      prompt: '你好',
      script: [{ text: '你好。' }],
      onBudgetExhausted: () => events.push(1),
    });
    expect(events).toEqual([]);
  });
});

describe('R-2 — 告知必须真的渲染到用户眼前（写进流 ≠ 看得见）', () => {
  it('CopilotPanel 有 data-budget_notice 的渲染分支', () => {
    // 对抗复核残留缺口 R-2：服务端写了、面板没有分支 → 告知到不了用户眼前，
    // 论断②（用户端零告知）因此**并未闭合**。这条钉住渲染侧。
    const src = readFileSync('src/components/copilot/CopilotPanel.tsx', 'utf8');
    expect(src).toContain('BUDGET_NOTICE_PART');
    expect(src).toContain("'data-budget_notice'");
    expect(src, '要真的渲染出 notice 文本，不能只是接住事件').toContain(
      'data-testid="budget-notice"',
    );
  });

  it('route 写入的载荷字段与面板读取的字段同名（两侧对得上）', () => {
    const route = readFileSync('src/app/api/agent/route.ts', 'utf8');
    const panel = readFileSync(
      'src/components/copilot/CopilotPanel.tsx',
      'utf8',
    );
    expect(route, 'route 侧写 notice 字段').toMatch(/notice:\s*budgetExhaustedNotice/);
    expect(panel, '面板侧读同一个字段').toMatch(/\{\s*notice\?:\s*string\s*\}/);
  });
});
