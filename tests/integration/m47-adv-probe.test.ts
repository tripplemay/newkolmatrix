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
  DEFAULT_MAX_STEPS,
  FRONT_DESK_AGENT_ID,
  MAX_CONSULTS_PER_TURN,
  getPersona,
} from '../../src/lib/agent/registry';
import { executeTool } from '../../src/lib/agent/execute';
import type { ConsultSpecialistOutput } from '../../src/lib/agent/tools/consult-specialist';
import {
  installNoNetworkSentinel,
  runScriptedLoop,
  usagePart,
} from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';

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

  it('P3 真正的强制点在 route 层，而 frontdesk-e2e 从未加载 route 模块', async () => {
    const fs = await import('node:fs/promises');
    const e2e = await fs.readFile('scripts/test/frontdesk-e2e.ts', 'utf8');
    const routeSrc = await fs.readFile('src/app/api/agent/route.ts', 'utf8');
    const imports = [...e2e.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    ledger['C3.frontdeskE2eImports'] = imports;
    ledger['C3.e2eMentionsRoute'] = /api\/agent\/route|resolveContext/.test(e2e);
    ledger['C3.routeHardcodesFrontDesk'] =
      /agentId:\s*FRONT_DESK_AGENT_ID/.test(routeSrc);
    // 强制点确实在 route.ts；e2e 的 import 图里没有它 ⇒ 这条链根本没被 e2e 走过
    expect(ledger['C3.routeHardcodesFrontDesk']).toBe(true);
    expect(ledger['C3.e2eMentionsRoute']).toBe(false);
    expect(imports.some((i) => i.includes('api/agent/route'))).toBe(false);
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

  it('P7 撞顶事实只在服务端可查：流内无任何 budgetHit 载荷', async () => {
    const fs = await import('node:fs/promises');
    const routeSrc = await fs.readFile('src/app/api/agent/route.ts', 'utf8');
    const loopSrc = await fs.readFile('src/lib/agent/loop.ts', 'utf8');
    // route 只往流里写 persona_switch 一种 data part
    const dataParts = [...routeSrc.matchAll(/type:\s*'([^']*data-[^']*)'/g)].map(
      (m) => m[1],
    );
    ledger['C2.streamDataParts'] = dataParts;
    ledger['C2.loopHasBudgetHitCallback'] = /onBudgetHit|budgetHit/.test(
      loopSrc.split('onEnd')[0],
    );
    expect(dataParts).toEqual(['data-persona_switch']);
  });

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

/** 主 loop 正常出一次 consult 调用、其余步给文本；子 loop（doGenerate）永不返回。 */
function stallingSubLoopModel(): MockLanguageModelV4 {
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
    doGenerate: () => new Promise<LanguageModelV4GenerateResult>(() => {}),
  });
}

describe('C1 · 子 loop 超时闸', () => {
  it('P9 全仓 agent 栈无任何 abortSignal / 墙钟自限（chat 路径）', async () => {
    const fs = await import('node:fs/promises');
    const files = [
      'src/lib/agent/specialist-loop.ts',
      'src/lib/agent/tools/consult-specialist.ts',
      'src/lib/agent/loop.ts',
      'src/lib/ai/gateway.ts',
    ];
    const hits: Record<string, string[]> = {};
    for (const f of files) {
      const src = await fs.readFile(f, 'utf8');
      hits[f] = src
        .split('\n')
        .map((l, i) => ({ l, i: i + 1 }))
        .filter(({ l }) => /abortSignal|AbortSignal|Promise\.race/.test(l))
        .map(({ l, i }) => `${i}: ${l.trim()}`);
    }
    ledger['C1.abortSignalHits'] = hits;
    // 只有 embedText 那一处（gateway.ts），chat / 子 loop / 主 loop 全无
    expect(hits['src/lib/agent/specialist-loop.ts']).toEqual([]);
    expect(hits['src/lib/agent/tools/consult-specialist.ts']).toEqual([]);
    expect(hits['src/lib/agent/loop.ts']).toEqual([]);
    expect(hits['src/lib/ai/gateway.ts'].length).toBe(1);
  });

  it('P10 子 loop 挂死 → 整场会话跟着挂：前台拿不到发言机会', async () => {
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
      expect(winner.who).toBe('timer'); // 5s 内前台一个字都没说出来
      consume.catch(() => {});
    } finally {
      sentinel.restore();
    }
  }, 30_000);

  it('P11 主 loop 自己挂死也一样——超时缺口不是子 loop 专属', async () => {
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
    ledger['C1.selfHostNoPlatformCap'] =
      /self-host standalone 无平台上限/.test(routeSrc);
    ledger['C1.nextConfigMentionsTimeout'] =
      /maxDuration|timeout/i.test(nextCfg);
    expect(ledger['C1.maxDurationDeclared']).toBe(true);
    expect(ledger['C1.selfHostNoPlatformCap']).toBe(true);
  });
});
