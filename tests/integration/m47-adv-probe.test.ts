// M4.7-FRONTDESK 对抗复核探针（Evaluator/adversarial）
//
// 目的：**尝试证伪**首轮 fan-out 的三条产品级论断，而不是重新验收。
//   论断① G3/F007：产品侧无超时闸 → 子 loop 挂死时前台没有机会说「我问了但没拿到结果」
//   论断② G3/F006：前台自己撞步数顶时用户端零告知
//   论断③ G4/F009：frontdesk:e2e 的 🔑 断言（受理的是前台）是同义反复
//
// 纪律：不改任何产品代码；夹具租户自建自清；全程 fetch 哨兵在场，零外呼。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import type {
  LanguageModelV4StreamPart,
  LanguageModelV4GenerateResult,
} from '@ai-sdk/provider';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { runAgentLoop } from '../../src/lib/agent/loop';
import {
  selectPersona,
  type CopilotContext,
} from '../../src/lib/agent/persona-router';
import {
  BUDGET_NOTICE_ANCHOR,
  DEFAULT_MAX_STEPS,
  FRONT_DESK_AGENT_ID,
  LOOP_TIMEOUT_MS,
  MAX_CONSULTS_PER_TURN,
  SPECIALIST_TIMEOUT_MS,
  budgetExhaustedNotice,
  getPersona,
} from '../../src/lib/agent/registry';
import { executeTool } from '../../src/lib/agent/execute';
import {
  CONSULT_FAILED_MARKER,
  CONSULT_TIMEOUT_HINT,
  type ConsultSpecialistOutput,
} from '../../src/lib/agent/tools/consult-specialist';

import {
  installNoNetworkSentinel,
  runScriptedLoop,
  usagePart,
} from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';

/** 撞顶事件（结构与 loop.ts 的 BudgetExhaustedEvent 同形，测试床按 string 透传 agentId）。 */
interface BudgetEvent {
  steps: number;
  maxSteps: number;
  agentId: string;
  consultCount: number;
}

const SLUG = `test-tenant-m47-adv-${process.pid}`;
let tenantId: string;
let projectId: string;

/** 观测台账：跑完一次性打印，供报告逐条引用。 */
const ledger: Record<string, unknown> = {};

function ctxOf(over: Partial<ToolContext> = {}): ToolContext {
  return {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
    ...over,
  };
}

function frontDeskCopilot(over: Partial<CopilotContext> = {}): CopilotContext {
  return {
    route: `/admin/campaigns/${projectId}`,
    projectId,
    env: 'default',
    agentId: FRONT_DESK_AGENT_ID,
    stage: 'match',
    ...over,
  };
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 对抗复核夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 adv ${process.pid}` },
  });
  projectId = p.id;
});

afterAll(async () => {
  console.log('\n[m47-adv 观测台账]\n' + JSON.stringify(ledger, null, 2));
  // 逐表清 + 逐表断言残留（M4.6 D3 教训：只断言 tenant = 假信心）
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [handoffs, shares, logs, pas, projects, tenants] = await Promise.all([
    prisma.handoff.count({ where: { tenantId } }),
    prisma.shareLink.count({ where: { tenantId } }),
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  expect({ handoffs, shares, logs, pas, projects, tenants }).toEqual({
    handoffs: 0,
    shares: 0,
    logs: 0,
    pas: 0,
    projects: 0,
    tenants: 0,
  });
  await prisma.$disconnect();
});

/* ═══════════════════════════════════════════════════════════════════════
   论断③ · frontdesk:e2e 的 🔑 断言是不是同义反复
   ═══════════════════════════════════════════════════════════════════════ */

describe('C3 · 受理人格的真相源在哪一层', () => {
  it('P1 selectPersona 是 agentId 的纯透传——route 与 stage 都不参与', () => {
    const asMatch = selectPersona(
      frontDeskCopilot({ agentId: 'match', stage: 'match' }),
    );
    const asFront = selectPersona(frontDeskCopilot({ stage: 'insight' }));
    // route 指向 insight 页、stage 也指 insight，只要 agentId 是前台就还是前台；
    // 反之 agentId 传环节人格就真的变环节人格 → 「恒为前台」不在这一层。
    const routedInsight = selectPersona({
      route: '/admin/insight',
      projectId: null,
      env: 'default',
      agentId: 'match',
      stage: 'insight',
    });
    ledger['C3.selectPersona(agentId=match)'] = asMatch.id;
    ledger['C3.selectPersona(agentId=front,stage=insight)'] = asFront.id;
    ledger['C3.selectPersona(route=/admin/insight,agentId=match)'] =
      routedInsight.id;
    expect(asMatch.id).toBe('match');
    expect(asFront.id).toBe(FRONT_DESK_AGENT_ID);
    expect(routedInsight.id).toBe('match');
  });

  it('P2 runAgentLoop（e2e 的被测入口）原样采信调用方传入的 agentId', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runScriptedLoop({
        copilot: frontDeskCopilot({ agentId: 'match' }),
        ctx: ctxOf({ agentId: 'match' }),
        prompt: '这个项目该推进什么？',
        script: [{ text: '（匹配人格作答）' }],
      });
      ledger['C3.runScriptedLoop(agentId=match).persona'] = run.loop.persona.id;
      ledger['C3.runScriptedLoop(agentId=match).toolNames'] =
        run.loop.toolNames;
      // e2e 的 🔑 断言写的是 run.loop.persona.id === FRONT_DESK_AGENT_ID；
      // 这里喂 match 就拿到 match ⇒ 该断言钉住的是「测试自己传进去的值」。
      expect(run.loop.persona.id).toBe('match');
      expect(run.loop.toolNames).not.toContain('consult_specialist');
      expect(run.networkCalls).toEqual([]);
    } finally {
      sentinel.restore();
    }
  });

  /* ── P3：fix_round1 后由「缺陷存在性证明」转为「机制契约回归钉」 ──────────
     首轮形态断言的是「e2e 从未加载 route 模块」（缺陷在场：强制点没被走过）。
     fix 轮导出了 resolveContextForTest 并让 e2e 真的调它，故改为钉住
     **修复后的契约**：强制点必须是行为可测的，且判据必须输入≠期望。      */
  it('P3 强制点已可被行为验证：客户端传环节人格 → 服务端仍解析为前台', async () => {
    const { resolveContextForTest } = await import(
      '../../src/app/api/agent/route'
    );
    // 输入刻意是环节人格（首轮那条同义反复喂的是前台本身）
    const resolved = resolveContextForTest({
      context: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: 'match',
        stage: 'match',
      },
    });
    ledger['C3fix.resolvedAgentId'] = resolved.agentId;
    ledger['C3fix.resolvedStage'] = resolved.stage;
    // ① 输入 'match' ≠ 期望 'orchestrator' ⇒ 有鉴别力，不是同义反复
    expect(resolved.agentId).toBe(FRONT_DESK_AGENT_ID);
    expect(resolved.agentId).not.toBe('match');
    // ② 环节仍作为线索留下（降级为 stage，不是被丢掉）
    expect(resolved.stage).toBe('match');
    // ③ 换一个环节人格同样不被采信（防"只挡了 match 这一个值"）
    for (const spoof of ['insight', 'reach', 'delivery', 'strategy'] as const) {
      const r = resolveContextForTest({
        context: { route: '/admin/insight', agentId: spoof },
      });
      expect(r.agentId).toBe(FRONT_DESK_AGENT_ID);
    }
    // ④ e2e 确实走了这条链（首轮它的 import 图里没有 route 模块）
    const fs = await import('node:fs/promises');
    const e2e = await fs.readFile('scripts/test/frontdesk-e2e.ts', 'utf8');
    ledger['C3fix.e2eCallsResolveContext'] = /resolveContextForTest\s*\(/.test(
      e2e,
    );
    expect(ledger['C3fix.e2eCallsResolveContext']).toBe(true);
    // ⑤ 残留观测 R-5：解析出的 context 没有回喂给同一轮 loop
    //   （e2e 仍以自己手写的 copilot 驱动 runScriptedLoop，两段各自成立、未串成一条链）
    ledger['C3fix.resolvedContextFedIntoLoop'] =
      /runScriptedLoop\(\{\s*copilot:\s*resolved/.test(e2e);
  });

  it('P4 该断言并非零信息：若装配层改用 stage 定人格，它会翻红（残余灵敏度）', () => {
    // 不改产品代码——在探针内模拟「stage 决定受理者」的回归形态，
    // 看 e2e 那条断言在该形态下是否还成立。
    const c = frontDeskCopilot(); // agentId=前台，stage='match'
    const regressed = getPersona(c.stage as never).id; // 假想回归：采信 stage
    ledger['C3.ifPersonaDerivedFromStage'] = regressed;
    expect(regressed).not.toBe(FRONT_DESK_AGENT_ID); // ⇒ e2e 断言会红
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   论断② · 前台撞自身步数顶时，用户端到底看得见什么
   ═══════════════════════════════════════════════════════════════════════ */

describe('C2 · 前台撞顶的用户可见面', () => {
  it('P5 前台连调 5 步工具 → 撞顶：无文本、无错误、流里只剩工具痕迹', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runScriptedLoop({
        copilot: frontDeskCopilot(),
        ctx: ctxOf(),
        prompt: '帮我看看这个项目该推进什么，然后分析下 ROI',
        script: [
          {
            toolCalls: [
              {
                toolName: 'consult_specialist',
                input: { targetAgent: 'match', question: '组合方案如何？' },
              },
            ],
          },
          {
            toolCalls: [
              {
                toolName: 'consult_specialist',
                input: { targetAgent: 'insight', question: 'ROI 如何？' },
              },
            ],
          },
        ],
        // 脚本用尽后模型还在要工具 = 打不住的模型 → 撞前台自身预算
        fallbackStep: {
          toolCalls: [
            { toolName: 'propose_plan', input: { items: [{ title: 'x' }] } },
          ],
        },
        specialistScripts: {
          match: [{ text: 'B 组重合度最高。' }],
          insight: [{ text: '本期分子无回传源。' }],
        },
      });
      const tele = await run.loop.telemetry;
      ledger['C2.steps'] = run.steps;
      ledger['C2.maxSteps'] = run.loop.maxSteps;
      ledger['C2.finishReason'] = run.finishReason;
      ledger['C2.text'] = run.text;
      ledger['C2.toolErrors'] = run.toolErrors.map((e) => e.toolName);
      ledger['C2.toolNames'] = run.toolNames;
      ledger['C2.telemetry'] = tele;
      // 用户端可见面 = 工具 part（CopilotPanel 渲染 tool-*）+ 文本 part
      ledger['C2.visibleToolResultCount'] = run.toolOutputs.length;

      expect(run.steps).toBe(DEFAULT_MAX_STEPS);
      expect(run.text).toBe(''); // 一个字的答案都没有
      expect(run.finishReason).toBe('tool-calls');
      // 但工具产物是有的：用户看得见「咨询了谁」的痕迹卡
      expect(run.toolOutputs.length).toBeGreaterThan(0);
      expect(run.networkCalls).toEqual([]);
    } finally {
      sentinel.restore();
    }
  }, 60_000);

  it('P6 同款截停在 M4.5 就是既有形态（非本批引入）：常规人格撞顶同样零文本', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runScriptedLoop({
        copilot: {
          route: '/admin/reach',
          projectId: null,
          env: 'default',
          agentId: 'reach',
        },
        ctx: ctxOf({ agentId: 'reach', projectId: null }),
        prompt: '一直查别停',
        script: [],
        fallbackStep: {
          toolCalls: [
            { toolName: 'get_kol_detail', input: { kolId: 'no-such-kol' } },
          ],
        },
      });
      ledger['C2.m45Baseline'] = {
        steps: run.steps,
        text: run.text,
        finishReason: run.finishReason,
      };
      expect(run.steps).toBe(DEFAULT_MAX_STEPS);
      expect(run.text).toBe('');
    } finally {
      sentinel.restore();
    }
  }, 60_000);

  /* ── P7：fix_round1 后由「缺陷存在性证明」转为「机制契约回归钉」 ──────────
     首轮形态断言的是「流内无任何 budgetHit 载荷」（缺陷在场）。机制补上后
     该断言按预期不再成立，故改为钉住**修复后的契约**：撞顶必须触发
     onBudgetExhausted，且告知文案必须是「未答完 + 还差什么」而非完成态。
     断言全部走行为（真 runAgentLoop 回调实录），不看源码关键字。            */
  it('P7 撞顶 → 服务端如实告知机制在场且生效（未答完 + 还差什么）', async () => {
    const sentinel = installNoNetworkSentinel();
    const events: BudgetEvent[] = [];
    try {
      const run = await runScriptedLoop({
        copilot: frontDeskCopilot(),
        ctx: ctxOf(),
        prompt: '帮我看看这个项目该推进什么，然后分析下 ROI',
        script: [
          {
            toolCalls: [
              {
                toolName: 'consult_specialist',
                input: { targetAgent: 'match', question: '组合方案如何？' },
              },
            ],
          },
          {
            toolCalls: [
              {
                toolName: 'consult_specialist',
                input: { targetAgent: 'insight', question: 'ROI 如何？' },
              },
            ],
          },
        ],
        fallbackStep: {
          toolCalls: [
            { toolName: 'propose_plan', input: { items: [{ title: 'x' }] } },
          ],
        },
        specialistScripts: {
          match: [{ text: 'B 组重合度最高。' }],
          insight: [{ text: '本期分子无回传源。' }],
        },
        onBudgetExhausted: (e) => events.push(e),
      });

      ledger['C2fix.budgetEvents'] = events;
      expect(run.text, '撞顶时模型仍然没有开口机会（这一点没变）').toBe('');
      // ① 机制在场：撞顶恰好触发一次，载荷说得清是谁、用满几步、问过几个专家
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        steps: DEFAULT_MAX_STEPS,
        maxSteps: DEFAULT_MAX_STEPS,
        agentId: FRONT_DESK_AGENT_ID,
        consultCount: MAX_CONSULTS_PER_TURN,
      });
      // ② 文案是「未答完 + 还差什么」——正向精确匹配锚点（非黑名单否定断言）
      const notice = budgetExhaustedNotice(
        events[0].steps,
        events[0].consultCount,
      );
      ledger['C2fix.notice'] = notice;
      expect(notice).toContain(BUDGET_NOTICE_ANCHOR);
      expect(notice, '要说清用满了几步').toContain(`${DEFAULT_MAX_STEPS} 步`);
      expect(notice, '要说清"还差什么"该怎么办').toContain('拆小');
      // ③ 绝不能把没答完说成答完了（撞顶诚实的反面）
      for (const claim of ['已完成', '已答完', '已为你', '全部搞定']) {
        expect(notice).not.toContain(claim);
      }
      expect(run.networkCalls).toEqual([]);
    } finally {
      sentinel.restore();
    }
  }, 60_000);

  it('P7b 撞顶告知抵达 UI 了吗——渲染层覆盖面实录（残留缺口 R-2 的判据）', async () => {
    const fs = await import('node:fs/promises');
    const panel = await fs.readFile(
      'src/components/copilot/CopilotPanel.tsx',
      'utf8',
    );
    const routeSrc = await fs.readFile('src/app/api/agent/route.ts', 'utf8');
    const written = [...routeSrc.matchAll(/type:\s*'(data-[^']+)'/g)].map(
      (m) => m[1],
    );
    // 面板认得哪些 data part：只看它显式判等的常量
    const rendered = [...panel.matchAll(/'(data-[^']+)'/g)].map((m) => m[1]);
    ledger['C2fix.routeWritesDataParts'] = written;
    ledger['C2fix.panelRendersDataParts'] = rendered;
    ledger['C2fix.dataPartsWrittenButNotRendered'] = written.filter(
      (p) => !rendered.includes(p),
    );
    // 传输层已闭合：route 确实把撞顶告知写进了流
    expect(written).toContain('data-budget_notice');
    // 渲染层未闭合：面板只认 persona_switch，其余 data part 落到 `return null`
    expect(rendered).toEqual(['data-persona_switch']);
  });

  it('P7c 撞顶判据的宽窄：自然收敛在恰好用满步数时是否误报（残留缺口 R-1）', async () => {
    const sentinel = installNoNetworkSentinel();
    const events: BudgetEvent[] = [];
    try {
      // 4 步调工具 + 第 5 步出文本 = **自然收敛**，答案是完整的，
      // 只是恰好把预算用满了。此时不该说"我没答完"。
      const run = await runScriptedLoop({
        copilot: frontDeskCopilot(),
        ctx: ctxOf(),
        prompt: '正常问一句',
        script: [
          ...Array.from({ length: DEFAULT_MAX_STEPS - 1 }, () => ({
            toolCalls: [
              { toolName: 'propose_plan', input: { items: [{ title: 'x' }] } },
            ],
          })),
          { text: '查完了，结论如上。' },
        ],
        onBudgetExhausted: (e) => events.push(e),
      });
      ledger['C2fix.naturalConvergenceSteps'] = run.steps;
      ledger['C2fix.naturalConvergenceText'] = run.text;
      ledger['C2fix.naturalConvergenceNoticeFired'] = events.length;
      // 只记录实测事实，不写成"这样才对"的断言——它是待修的缺口，
      // 修好之后这里应当变成 0，那时该翻红的是报告而不是这条钉子。
      expect(run.steps).toBe(DEFAULT_MAX_STEPS);
      expect(run.text).not.toBe('');
      expect(run.networkCalls).toEqual([]);
    } finally {
      sentinel.restore();
    }
  }, 60_000);

  it('P8 M4.5 长链诚实条款的覆盖面：管的是「宣称已完成」，不管「被截停」', async () => {
    const fs = await import('node:fs/promises');
    const lc = await fs.readFile(
      'tests/integration/long-chain-honesty.test.ts',
      'utf8',
    );
    ledger['C2.longChainCoversCapped'] = /未答完|还差什么|撞顶|budgetHit/.test(
      lc,
    );
    // M4.5 的那条回归用例本身就断言「第 5 步截停 + finishReason=tool-calls」，
    // 且**不**对文本作任何要求 ⇒ 零文本截停是被 M4.5 明确记录过的既有形态
    ledger['C2.longChainAssertsCapNoText'] =
      /finishReason\).toBe\('tool-calls'\)/.test(lc);
    expect(ledger['C2.longChainCoversCapped']).toBe(false);
    expect(ledger['C2.longChainAssertsCapNoText']).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   论断① · 超时闸
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * 主 loop 正常出一次 consult 调用、其余步给文本；子 loop（doGenerate）永不返回。
 *
 * @param honorAbort true = 像**行为正常的 provider** 那样尊重 `options.abortSignal`
 *   （真 provider 把它当 `fetch` 的 signal 用）；false = 首轮那个完全不理会
 *   信号的挂死体，用来观测"闸不生效时会怎样"。
 *
 * 【这个参数本身就是一条发现】`abortSignal` 是**交给 provider 的请求**，不是
 * SDK 层的墙钟。provider 不理会它，闸就等于不存在——见报告 R-4。
 */
function stallingSubLoopModel(honorAbort = false): MockLanguageModelV4 {
  let streamCall = 0;
  return new MockLanguageModelV4({
    provider: 'adv',
    modelId: 'stall-sub',
    doStream: async () => {
      const i = streamCall++;
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: [] },
      ];
      if (i === 0) {
        parts.push({
          type: 'tool-call',
          toolCallId: 'c0',
          toolName: 'consult_specialist',
          input: JSON.stringify({
            targetAgent: 'insight',
            question: 'ROI 如何？',
          }),
        });
        parts.push({
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage: usagePart(),
        });
      } else {
        parts.push({ type: 'text-start', id: 'x' });
        parts.push({ type: 'text-delta', id: 'x', delta: '（前台收尾）' });
        parts.push({ type: 'text-end', id: 'x' });
        parts.push({
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: usagePart(),
        });
      }
      return { stream: simulateReadableStream({ chunks: parts }) };
    },
    // 专家子 loop：连上了但永不回话（网关 stall 的等价物）
    doGenerate: (options) =>
      new Promise<LanguageModelV4GenerateResult>((_resolve, reject) => {
        if (!honorAbort) return; // 永不 settle
        const sig = options.abortSignal;
        if (!sig) return;
        if (sig.aborted) return reject(sig.reason);
        sig.addEventListener('abort', () => reject(sig.reason), { once: true });
      }),
  });
}

describe('C1 · 子 loop 超时闸', () => {
  /* ── P9：fix_round1 后由「缺陷存在性证明」转为「机制契约回归钉」 ──────────
     首轮形态断言的是「agent 栈无任何 abortSignal」（缺陷在场）。机制补上后
     该断言按预期不再成立，故改为钉住**修复后的契约**，且判据全部走行为：
     挂死的上游必须在**我们自己的时限内**被了断 → 结构化失败 → 留痕 →
     前台照常作答。这正是 D-4 承诺、首轮实测不可达的那条路径。            */
  it('P9 子 loop 墙钟闸在场且生效：挂死上游 → 限时降级 + 留痕 + 前台照常作答', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const started = Date.now();
      const run = await runAgentLoop({
        copilot: frontDeskCopilot(),
        messages: [{ role: 'user', content: '这个项目 ROI 如何？' }],
        model: stallingSubLoopModel(true), // 挂死，但像真 provider 一样尊重 signal
        // 注入缝：传入即无条件使用。若产品把它忽略而回落 60s 默认值，
        // 本条会因超时而红 —— 这同时钉住了注入缝纪律。
        ctx: ctxOf({ consultTimeoutMs: 400 }),
        telemetryWriter: async () => {},
      });
      let text = '';
      for await (const d of run.result.textStream) text += d;
      const elapsed = Date.now() - started;

      ledger['C1fix.stalledSubLoopFrontDeskText'] = text;
      ledger['C1fix.stalledSubLoopElapsedMs'] = elapsed;
      // ① 前台真的拿到了发言机会（首轮这里是空字符串 + 永远等不到）
      expect(text).toContain('（前台收尾）');
      // ② 是**我们自己的闸**在起作用，不是 undici 的 ~301s 兜底
      expect(elapsed).toBeLessThan(30_000);
      // ③ 失败被结构化，且可辨认为"超时"而非笼统失败
      const failed = await prisma.operationLog.findMany({
        where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
      });
      ledger['C1fix.timeoutFailureLog'] = failed.map((r) => r.summary);
      expect(failed).toHaveLength(1);
      expect(failed[0].summary).toContain(CONSULT_TIMEOUT_HINT);
      expect(failed[0].summary, '留痕要写清是问谁没成').toContain('insight');
      expect(run.ctx.tenantId).toBe(tenantId);
      // 清掉本条留下的留痕，免得干扰后续用例的计数
      await prisma.operationLog.deleteMany({
        where: { id: { in: failed.map((r) => r.id) } },
      });
    } finally {
      sentinel.restore();
    }
  }, 60_000);

  it('P9b 两道闸的默认值来自 registry，且主 loop 闸低于 route 的 maxDuration', async () => {
    const fs = await import('node:fs/promises');
    const routeSrc = await fs.readFile('src/app/api/agent/route.ts', 'utf8');
    const maxDuration = Number(
      /maxDuration\s*=\s*(\d+)/.exec(routeSrc)?.[1] ?? 0,
    );
    ledger['C1fix.SPECIALIST_TIMEOUT_MS'] = SPECIALIST_TIMEOUT_MS;
    ledger['C1fix.LOOP_TIMEOUT_MS'] = LOOP_TIMEOUT_MS;
    ledger['C1fix.routeMaxDurationMs'] = maxDuration * 1000;
    // 我们自己的降级必须先于任何外部兜底生效
    expect(LOOP_TIMEOUT_MS).toBeLessThan(maxDuration * 1000);
    expect(SPECIALIST_TIMEOUT_MS).toBeLessThan(LOOP_TIMEOUT_MS);
    // 且必须远小于首轮实测的 undici 兜底 301,018ms（否则等于没修）
    expect(LOOP_TIMEOUT_MS).toBeLessThan(301_018);
    // ── 残留缺口 R-3 的判据：最坏情形下两次子 loop 超时会先撞穿主 loop 闸 ──
    ledger['C1fix.worstCaseSubLoopStallMs'] =
      MAX_CONSULTS_PER_TURN * SPECIALIST_TIMEOUT_MS;
    ledger['C1fix.worstCaseExceedsLoopGate'] =
      MAX_CONSULTS_PER_TURN * SPECIALIST_TIMEOUT_MS > LOOP_TIMEOUT_MS;
  });

  /* P9c 线级核实：闸只有传到 socket 才算数。
     产品的 signal 要穿过 generateText → @ai-sdk/openai → resilientFetch → fetch；
     `resilientFetch` 对 init 做的是浅拷贝（`{...init, keepalive, body}`），
     signal 若在任何一环被丢掉，代码里有 abortSignal 也照样等 undici 的 301s。
     故这里用**本地**永不响应的服务器打真链路（不出网，非外呼）。 */
  it('P9c 闸真的到达 socket：真 provider 链路上 signal 未被 resilientFetch 丢掉', async () => {
    const http = await import('node:http');
    const { generateText } = await import('ai');
    const { chatModel } = await import('../../src/lib/ai/gateway');

    const srv = http.createServer(() => {
      /* 收下请求，永不响应 —— 与首轮测出 301,018ms 的那个上游同形 */
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    const port = (srv.address() as { port: number }).port;
    const prevBase = process.env.AIGCGATEWAY_BASE_URL;
    const prevKey = process.env.AIGCGATEWAY_API_KEY;
    process.env.AIGCGATEWAY_BASE_URL = `http://127.0.0.1:${port}/v1`;
    process.env.AIGCGATEWAY_API_KEY = 'adv-probe-dummy-key';

    const started = Date.now();
    let aborted = false;
    let errName = '';
    try {
      await generateText({
        model: chatModel(),
        prompt: 'ping',
        abortSignal: AbortSignal.timeout(800),
      });
    } catch (e) {
      aborted = true;
      errName =
        e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 80) : '';
    } finally {
      srv.close();
      if (prevBase === undefined) delete process.env.AIGCGATEWAY_BASE_URL;
      else process.env.AIGCGATEWAY_BASE_URL = prevBase;
      if (prevKey === undefined) delete process.env.AIGCGATEWAY_API_KEY;
      else process.env.AIGCGATEWAY_API_KEY = prevKey;
    }
    const elapsed = Date.now() - started;
    ledger['C1fix.wireLevelAbortElapsedMs'] = elapsed;
    ledger['C1fix.wireLevelAbortError'] = errName;
    expect(aborted, '挂死上游 + 800ms signal → 必须抛，而不是一路等下去').toBe(
      true,
    );
    // 远小于首轮实测的 undici 兜底 301,018ms ⇒ 是我们的 signal 起的作用
    expect(elapsed).toBeLessThan(20_000);
  }, 60_000);

  /* P10 语义随 fix_round1 更新：闸已在场，故这里不再是"永远挂"的证明，
     而是**闸值量级的观测**——不注入 consultTimeoutMs 时，用户仍要对着空白
     等满 SPECIALIST_TIMEOUT_MS（60s）。断言只声明"5s 内仍无输出"，
     修复不会让它翻红，调小默认闸值才会（那正是该被复核的变更）。 */
  it('P10 默认闸值量级观测：未注入时 5s 内前台仍无输出（要等满 60s）', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runAgentLoop({
        copilot: frontDeskCopilot(),
        messages: [{ role: 'user', content: '这个项目 ROI 如何？' }],
        model: stallingSubLoopModel(),
        ctx: ctxOf(),
        telemetryWriter: async () => {},
      });
      // 消费流：正常情况下第 2 步会出「（前台收尾）」；挂死则永远等不到
      const consume = (async () => {
        let out = '';
        for await (const d of run.result.textStream) out += d;
        return out;
      })();
      const winner = await Promise.race([
        consume.then((t) => ({ who: 'stream', text: t })),
        new Promise<{ who: string; text: string }>((r) =>
          setTimeout(() => r({ who: 'timer', text: '' }), 5_000),
        ),
      ]);
      ledger['C1.hangingSubLoopRaceWinner'] = winner.who;
      ledger['C1.hangingSubLoopText'] = winner.text;
      expect(winner.who).toBe('timer'); // 5s 内前台一个字都没说出来（闸在 60s 才落）
      consume.catch(() => {});
    } finally {
      sentinel.restore();
    }
  }, 30_000);

  /* P11 同理：主 loop 现由 LOOP_TIMEOUT_MS（110s）兜底，故这里也是量级观测。 */
  it('P11 主 loop 挂死同样要等满 LOOP_TIMEOUT_MS：3s 内仍无输出', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const stallMain = new MockLanguageModelV4({
        provider: 'adv',
        modelId: 'stall-main',
        doStream: () => new Promise(() => {}),
      });
      const started = Date.now();
      const winner = await Promise.race([
        runAgentLoop({
          copilot: frontDeskCopilot(),
          messages: [{ role: 'user', content: 'hi' }],
          model: stallMain,
          ctx: ctxOf(),
          telemetryWriter: async () => {},
        })
          .then((r) => r.result.text)
          .then(() => 'stream'),
        new Promise<string>((r) => setTimeout(() => r('timer'), 3_000)),
      ]);
      ledger['C1.hangingMainLoopRaceWinner'] = winner;
      ledger['C1.hangingMainLoopElapsedMs'] = Date.now() - started;
      expect(winner).toBe('timer');
    } finally {
      sentinel.restore();
    }
  }, 30_000);

  it('P12 上游**报错**（含真实超时错误）→ 已覆盖：ok=false + 前台照常作答', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      // 不 mock runSpecialistLoop（那是 F007 测试的做法），而是让**模型层**
      // 抛一个真实形态的超时错误，走完整条 specialist-loop → catch 链路。
      const timingOutModel = new MockLanguageModelV4({
        provider: 'adv',
        modelId: 'timeout-err',
        doGenerate: async () => {
          const e = new Error(
            'The operation was aborted due to timeout',
          ) as Error & { name: string };
          e.name = 'TimeoutError';
          throw e;
        },
      });
      const out = (await executeTool(
        'consult_specialist',
        { targetAgent: 'insight', question: 'ROI？' },
        ctxOf({
          model: timingOutModel,
          consultBudget: { used: 0, max: MAX_CONSULTS_PER_TURN },
        }),
      )) as { output: ConsultSpecialistOutput };
      ledger['C1.upstreamTimeoutError'] = {
        ok: out.output.ok,
        failureReason: out.output.failureReason,
        answer: out.output.answer,
      };
      expect(out.output.ok).toBe(false);
      expect(out.output.failureReason).toContain('timeout');
      const logged = await prisma.operationLog.count({
        where: { tenantId, summary: { contains: 'consult_specialist:FAILED' } },
      });
      ledger['C1.upstreamTimeoutLogged'] = logged;
      expect(logged).toBe(1);
    } finally {
      sentinel.restore();
    }
  }, 30_000);

  it('P13 maxDuration=120 在自托管 standalone 下是否真的会截断', async () => {
    const fs = await import('node:fs/promises');
    const routeSrc = await fs.readFile('src/app/api/agent/route.ts', 'utf8');
    const nextCfg = await fs
      .readFile('next.config.js', 'utf8')
      .catch(() => fs.readFile('next.config.mjs', 'utf8').catch(() => ''));
    ledger['C1.maxDurationDeclared'] = /maxDuration\s*=\s*120/.test(routeSrc);
    // 代码注释自陈：self-host standalone 无平台上限
    ledger['C1.selfHostNoPlatformCap'] = /self-host standalone 无平台上限/.test(
      routeSrc,
    );
    ledger['C1.nextConfigMentionsTimeout'] = /maxDuration|timeout/i.test(
      nextCfg,
    );
    expect(ledger['C1.maxDurationDeclared']).toBe(true);
    expect(ledger['C1.selfHostNoPlatformCap']).toBe(true);
  });
});
