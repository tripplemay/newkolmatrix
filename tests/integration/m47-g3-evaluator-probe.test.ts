// M4.7-FRONTDESK · Evaluator G3 独立探针（F005 / F006 / F007）
//
// 归属：Evaluator 测试产物（不是产品代码，不参与 CI 门禁语义）。
// 目的：**不复用实现者的断言**，从链路侧独立取证三条 feature 的机械面事实：
//   F005 诚实透传   —— 专家的 insufficientEvidence 是否原样到达前台可见的工具产物
//   F006 成本硬上限 —— 三个上限是否真的由 registry 常量驱动行为（双向绑定）
//   F007 失败降级   —— 子 loop 失败是否结构化返回 + 是否留痕 + 是否不抛穿
//
// 并行纪律：夹具租户 slug 带 `m47g3` + pid；OperationLog / Handoff 对 Tenant 软引用无 FK，
// 逐表清 + 逐表断言零残留。
//
// 零外呼：模型全程 mock，testbed 装 fetch 哨兵。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { executeTool } from '../../src/lib/agent/execute';
import {
  FRONT_DESK_AGENT_ID,
  FRONT_DESK_HONESTY_CLAUSE,
  MAX_CONSULTS_PER_TURN,
  SPECIALIST_MAX_STEPS,
  getPersona,
} from '../../src/lib/agent/registry';
import {
  CONSULT_BUDGET_EXHAUSTED_MSG,
  CONSULT_FAILED_MARKER,
  type ConsultSpecialistOutput,
} from '../../src/lib/agent/tools/consult-specialist';
import * as specialistLoop from '../../src/lib/agent/specialist-loop';
import { detectInsufficientEvidence } from '../../src/lib/agent/specialist-loop';
import { LOOP_TELEMETRY_MARKER } from '../../src/lib/agent/loop-telemetry';
import {
  runScriptedLoop,
  installNoNetworkSentinel,
} from '../support/agent-loop-testbed';
import { scriptedGenerateModel } from '../support/scripted-generate-model';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const TAG = `m47g3-${process.pid}`;
const SLUG = `test-tenant-${TAG}`;
/** 隐私哨兵串：塞进咨询问题正文，用来证明遥测/留痕不落正文。 */
const BODY_SENTINEL = `ZZ-BODY-SENTINEL-${TAG}`;

let tenantId: string;
let projectId: string;

/** 观测台账：探针把实测到的数字写这里，报告直接引用。 */
const observed: Record<string, unknown> = {};

function baseCtx(): ToolContext {
  return {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
  };
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 G3 evaluator 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 G3 项目 ${process.pid}` },
  });
  projectId = p.id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  // 软引用表逐表清（OperationLog / Handoff / PendingAction 对 Tenant 无 FK，不级联）
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [handoffs, logs, pas, shares, projects, tenants] = await Promise.all([
    prisma.handoff.count({ where: { tenantId } }),
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.shareLink.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  expect({ handoffs, logs, pas, shares, projects, tenants }).toEqual({
    handoffs: 0,
    logs: 0,
    pas: 0,
    shares: 0,
    projects: 0,
    tenants: 0,
  });
  console.log('[G3 观测台账]', JSON.stringify(observed, null, 2));
  await prisma.$disconnect();
});

/* ══════════════ F005 · 诚实透传 ══════════════ */

describe('[F005] 专家结论到达前台的链路事实', () => {
  it('P1 · 专家证据不足 → 前台可见的工具产物里 insufficientEvidence=true（链上实证）', async () => {
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
        stage: 'insight',
      },
      ctx: baseCtx(),
      prompt: '这个项目 ROI 怎么样',
      script: [
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: {
                targetAgent: 'insight',
                question: `ROI 如何？${BODY_SENTINEL}`,
              },
            },
          ],
        },
        { text: '洞察说本期分子无回传源，ROI 算不出来。' },
      ],
      specialistScripts: {
        insight: [
          { toolCalls: [{ toolName: 'compute_roi', input: { projectId } }] },
          { text: '分子无回传源，算不出 ROI。' },
        ],
      },
    });

    expect(run.networkCalls, '零外呼').toEqual([]);
    const consult = run.toolOutputs.find(
      (o) => o.toolName === 'consult_specialist',
    )?.output as ConsultSpecialistOutput | undefined;
    expect(consult, '前台确实拿到了 consult_specialist 产物').toBeTruthy();
    observed['F005.chainConsultOutput'] = consult;
    expect(consult!.ok).toBe(true);
    expect(
      consult!.insufficientEvidence,
      '专家侧 basis=insufficient_evidence 必须原样到达前台可见的产物',
    ).toBe(true);
    expect(consult!.insufficientReasons.length).toBeGreaterThan(0);
    expect(consult!.answer, '专家原话原样透传').toBe(
      '分子无回传源，算不出 ROI。',
    );
    // 前台 system 段带诚实条款（正向精确匹配）
    expect(run.systemPerStep[0]).toContain('不得给出任何数值结论');
    expect(run.systemPerStep[0]).toContain('不得改写');
  });

  it('P2 · 前台若照样吐数值结论，链上无任何机械拦截（L1 只到 prompt 层，如实登记）', async () => {
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
        stage: 'insight',
      },
      ctx: baseCtx(),
      prompt: '这个项目 ROI 怎么样',
      script: [
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'insight', question: 'ROI？' },
            },
          ],
        },
        // 刻意让前台把证据不足圆成数值 —— 正是 D-2 要防的形态
        { text: 'ROI 大约 1.8x，表现不错。' },
      ],
      specialistScripts: {
        insight: [
          { toolCalls: [{ toolName: 'compute_roi', input: { projectId } }] },
          { text: '分子无回传源，算不出 ROI。' },
        ],
      },
    });
    const consult = run.toolOutputs.find(
      (o) => o.toolName === 'consult_specialist',
    )?.output as ConsultSpecialistOutput;
    observed['F005.frontDeskRoundedText'] = run.text;
    observed['F005.frontDeskRoundedBlocked'] = false;
    // 事实登记：产物字段仍然诚实，但前台文本被原样放行（无服务端断言/拦截）
    expect(consult.insufficientEvidence).toBe(true);
    expect(run.text, '前台圆掉后的文本被链路原样放行').toMatch(/1\.8x/);
    expect(run.toolErrors, '没有任何机制把它标红').toEqual([]);
  });

  it('P3 · 检出器活性 + 深度上限（walkAny depth>8 不再下探）', () => {
    // 活性：正样本命中
    expect(
      detectInsufficientEvidence([
        { roi: { basis: 'insufficient_evidence' }, gaps: ['缺分子'] },
      ]).flag,
    ).toBe(true);
    // 负控：computed / zero_spend 不误报
    expect(detectInsufficientEvidence([{ basis: 'computed' }]).flag).toBe(
      false,
    );
    // 深度上限实测：逐层加深，找到第一个漏检的深度
    const nest = (depth: number): unknown => {
      let node: unknown = { basis: 'insufficient_evidence' };
      for (let i = 0; i < depth; i++) node = { w: node };
      return node;
    };
    let firstMiss: number | null = null;
    for (let d = 0; d <= 14; d++) {
      if (!detectInsufficientEvidence([nest(d)]).flag) {
        firstMiss = d;
        break;
      }
    }
    observed['F005.detectorFirstMissDepth'] = firstMiss;
    expect(
      firstMiss,
      '存在一个深度阈值，超过即漏检（登记为已知边界）',
    ).not.toBe(null);
  });

  it('P4 · 真实 compute_roi 产物的嵌套深度（是否逼近检出器上限）', async () => {
    const out = (await executeTool(
      'compute_roi',
      { projectId },
      baseCtx(),
    )) as { output: unknown };
    const depthOfBasis = (node: unknown, d = 0): number | null => {
      if (node === null || typeof node !== 'object') return null;
      if (Array.isArray(node)) {
        for (const x of node) {
          const r = depthOfBasis(x, d + 1);
          if (r !== null) return r;
        }
        return null;
      }
      const o = node as Record<string, unknown>;
      if (o.basis === 'insufficient_evidence') return d;
      for (const v of Object.values(o)) {
        const r = depthOfBasis(v, d + 1);
        if (r !== null) return r;
      }
      return null;
    };
    const depth = depthOfBasis(out.output, 1); // outputs 数组本身占 1 层
    observed['F005.realComputeRoiBasisDepth'] = depth;
    expect(
      depth,
      'compute_roi 真产物里确有 insufficient_evidence 标记',
    ).not.toBe(null);
  });
});

/* ══════════════ F006 · 成本硬上限 ══════════════ */

describe('[F006] 三个上限的行为绑定', () => {
  it('P5 · 一轮内咨询 3 次：前 N 次成功、第 N+1 次被如实拒绝且不打死会话', async () => {
    const run = await runScriptedLoop({
      copilot: {
        route: '/admin/default',
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: baseCtx(),
      prompt: '连问三位专家',
      script: [
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'match', question: 'q1' },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'insight', question: 'q2' },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'reach', question: 'q3' },
            },
          ],
        },
        { text: '问不动了，还差触达那一问没问到。' },
      ],
      specialistScripts: {
        match: [{ text: 'B 组最好。' }],
        insight: [{ text: '数据待补。' }],
        reach: [{ text: '不该被跑到。' }],
      },
    });
    const okCount = run.toolOutputs.filter(
      (o) =>
        o.toolName === 'consult_specialist' &&
        (o.output as ConsultSpecialistOutput).ok,
    ).length;
    observed['F006.successfulConsultsInOneTurn'] = okCount;
    observed['F006.MAX_CONSULTS_PER_TURN'] = MAX_CONSULTS_PER_TURN;
    observed['F006.toolErrors'] = run.toolErrors;
    // 双向绑定：成功次数必须等于常量值（改常量 → 此处观测值同步改）
    expect(okCount).toBe(MAX_CONSULTS_PER_TURN);
    expect(
      run.toolErrors.some((e) =>
        e.error.includes(CONSULT_BUDGET_EXHAUSTED_MSG),
      ),
      '超限必须如实拒绝（把原因给模型看），不是静默吞',
    ).toBe(true);
    expect(run.text, '会话没被打死，仍然收敛出文本').toBeTruthy();
  });

  it('P6 · 专家子 loop 步数上限：脚本给 5 步，实际截停在常量值 + budgetHit 透传', async () => {
    const run = await runScriptedLoop({
      copilot: {
        route: '/admin/default',
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: baseCtx(),
      prompt: '让专家一直查',
      script: [
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'insight', question: '一直查' },
            },
          ],
        },
        { text: '专家没答完。' },
      ],
      specialistScripts: {
        insight: Array.from({ length: 5 }, () => ({
          toolCalls: [{ toolName: 'compute_roi', input: { projectId } }],
        })),
      },
    });
    const consult = run.toolOutputs.find(
      (o) => o.toolName === 'consult_specialist',
    )?.output as ConsultSpecialistOutput;
    observed['F006.specialistStepsObserved'] = consult.steps;
    observed['F006.SPECIALIST_MAX_STEPS'] = SPECIALIST_MAX_STEPS;
    observed['F006.specialistBudgetHit'] = consult.budgetHit;
    expect(consult.steps).toBe(SPECIALIST_MAX_STEPS);
    expect(consult.budgetHit, '撞顶必须如实透传给前台').toBe(true);
  });

  it('P7 · 前台步数上限：咨询深链专家后本轮预算是否被抬升（总顶 11 的前提）', async () => {
    const run = await runScriptedLoop({
      copilot: {
        route: '/admin/default',
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: baseCtx(),
      prompt: '不停地问',
      script: [
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'insight', question: 'q1' },
            },
          ],
        },
      ],
      // 脚本用尽后仍不停调工具 → 只能靠步数上限截停
      fallbackStep: {
        toolCalls: [
          {
            toolName: 'consult_specialist',
            input: { targetAgent: 'insight', question: 'more' },
          },
        ],
      },
      specialistScripts: { insight: [{ text: '待补。' }] },
    });
    observed['F006.frontDeskStepsWhenConsultingDeepPersona'] = run.steps;
    // 撞前台自身上限时，用户听得见什么？（「诚实告知未答完」是否成立的直接证据）
    observed['F006.frontDeskTextWhenCapped'] = run.text;
    observed['F006.frontDeskFinishReasonWhenCapped'] = run.finishReason;
    const cappedTele = await run.loop.telemetry;
    observed['F006.frontDeskTelemetryWhenCapped'] = {
      steps: (cappedTele as { steps?: number })?.steps,
      maxSteps: (cappedTele as { maxSteps?: number })?.maxSteps,
      budgetHit: (cappedTele as { budgetHit?: boolean })?.budgetHit,
      consultCount: (cappedTele as { consultCount?: number })?.consultCount,
    };
    observed['F006.frontDeskPersonaMaxSteps'] =
      getPersona(FRONT_DESK_AGENT_ID).maxSteps;
    observed['F006.insightPersonaMaxSteps'] = getPersona('insight').maxSteps;
    observed['F006.totalStepCeilingObserved'] =
      run.steps + MAX_CONSULTS_PER_TURN * SPECIALIST_MAX_STEPS;
    // 只登记事实，不预设结论：断言"确实被上限截停了"
    expect(run.steps).toBeGreaterThan(0);
    expect(run.finishReason).toBeTruthy();
  });

  it('P8 · 遥测：consultCount 落库 + 不含问题正文（隐私哨兵串）', async () => {
    const before = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: LOOP_TELEMETRY_MARKER } },
    });
    const run = await runScriptedLoop({
      copilot: {
        route: '/admin/default',
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: baseCtx(),
      prompt: '问两位',
      script: [
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: {
                targetAgent: 'match',
                question: `组合？${BODY_SENTINEL}`,
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: {
                targetAgent: 'insight',
                question: `ROI？${BODY_SENTINEL}`,
              },
            },
          ],
        },
        { text: '综合如下。' },
      ],
      specialistScripts: {
        match: [{ text: 'B 组。' }],
        insight: [{ text: '待补。' }],
      },
    });
    const tele = await run.loop.telemetry;
    observed['F006.telemetryPayload'] = tele;
    expect(tele).not.toBe(null);
    expect((tele as { consultCount?: number }).consultCount).toBe(2);
    const after = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: LOOP_TELEMETRY_MARKER } },
    });
    expect(after, '遥测确实落了一行 OperationLog').toBe(before + 1);
    const row = await prisma.operationLog.findFirst({
      where: { tenantId, summary: { contains: LOOP_TELEMETRY_MARKER } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row!.kind).toBe('auto');
    expect(
      JSON.stringify(row!.payloadJson),
      '隐私哨兵串不得出现在遥测载荷里',
    ).not.toContain(BODY_SENTINEL);
    expect(row!.summary).not.toContain(BODY_SENTINEL);
    // 事实登记：子 loop 撞顶是否在 OperationLog 里可区分
    const subLoopRows = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: 'specialist' } },
    });
    observed['F006.subLoopTelemetryRows'] = subLoopRows;
  });

  it('P9 · 全仓第二处数字字面量独立扫描（不复用实现者的断言）', () => {
    const files = [
      'src/lib/agent/loop.ts',
      'src/lib/agent/specialist-loop.ts',
      'src/lib/agent/tools/consult-specialist.ts',
      'src/lib/agent/registry.ts',
    ];
    const hits: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      src.split('\n').forEach((line, i) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        if (/stepCountIs\(\s*\d/.test(line)) hits.push(`${f}:${i + 1} ${line}`);
        if (/max:\s*\d/.test(line) && !line.includes('MAX_CONSULTS_PER_TURN'))
          hits.push(`${f}:${i + 1} ${line}`);
        if (/maxSteps:\s*\d/.test(line)) hits.push(`${f}:${i + 1} ${line}`);
        if (/used\s*>=\s*\d/.test(line)) hits.push(`${f}:${i + 1} ${line}`);
      });
    }
    observed['F006.secondLiteralHits'] = hits;
    expect(hits).toEqual([]);
  });
});

/* ══════════════ F007 · 咨询失败降级 ══════════════ */

describe('[F007] 失败如实说 + 留痕 + 不抛穿', () => {
  it('P10 · 真实失败路径（深度守卫）→ ok=false + 结构完整 + 落 OperationLog', async () => {
    const before = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
    });
    const sentinel = installNoNetworkSentinel();
    let out: ConsultSpecialistOutput;
    try {
      const res = (await executeTool(
        'consult_specialist',
        { targetAgent: 'insight', question: `ROI？${BODY_SENTINEL}` },
        {
          ...baseCtx(),
          consultDepth: 1, // 造真实失败：专家不得再咨询专家
          consultBudget: { used: 0, max: MAX_CONSULTS_PER_TURN },
          model: scriptedGenerateModel([{ text: 'x' }]),
        },
      )) as { output: ConsultSpecialistOutput };
      out = res.output;
    } finally {
      sentinel.restore();
    }
    observed['F007.depthGuardFailure'] = out;
    expect(out.ok).toBe(false);
    expect(out.answer, '拿不到结论就是空').toBe('');
    expect(out.failureReason).toBeTruthy();
    expect(out.insufficientEvidence).toBe(false);
    expect(out.budgetHit).toBe(false);
    const after = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
    });
    expect(after, '失败必须留痕').toBe(before + 1);
    const row = await prisma.operationLog.findFirst({
      where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row!.kind).toBe('auto');
    expect(row!.actor).toBe(FRONT_DESK_AGENT_ID);
    expect(row!.summary).toContain('insight');
    observed['F007.failureLogSummary'] = row!.summary;
    // 留痕会带上失败原因原文；哨兵串在 question 里，不该被写进 summary
    expect(row!.summary).not.toContain(BODY_SENTINEL);
  });

  it('P11 · 链上失败不抛穿：前台照常走完本轮并作答', async () => {
    vi.spyOn(specialistLoop, 'runSpecialistLoop').mockRejectedValue(
      new Error('m47g3 模拟：专家侧异常'),
    );
    try {
      const run = await runScriptedLoop({
        copilot: {
          route: '/admin/default',
          projectId,
          env: 'default',
          agentId: FRONT_DESK_AGENT_ID,
        },
        ctx: baseCtx(),
        prompt: '问洞察',
        script: [
          {
            toolCalls: [
              {
                toolName: 'consult_specialist',
                input: { targetAgent: 'insight', question: 'ROI？' },
              },
            ],
          },
          { text: '我问了洞察但没拿到结果。' },
        ],
      });
      const consult = run.toolOutputs.find(
        (o) => o.toolName === 'consult_specialist',
      )?.output as ConsultSpecialistOutput;
      observed['F007.chainFailureOutput'] = consult;
      expect(consult.ok).toBe(false);
      expect(consult.failureReason).toContain('专家侧异常');
      expect(
        run.toolErrors,
        '失败被结构化承接，不以 tool-error 形态炸出来',
      ).toEqual([]);
      expect(run.text).toBeTruthy();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('P12 · 超时是否有独立实现（事实登记：有无 abort/race 机制）', () => {
    const sub = readFileSync('src/lib/agent/specialist-loop.ts', 'utf8');
    const tool = readFileSync(
      'src/lib/agent/tools/consult-specialist.ts',
      'utf8',
    );
    const hasAbort = /AbortSignal|abortSignal|Promise\.race|setTimeout/.test(
      sub + tool,
    );
    observed['F007.subLoopHasOwnTimeout'] = hasAbort;
    expect(typeof hasAbort).toBe('boolean');
  });

  it('P14 · 子 loop 挂死（不返回）时，consult_specialist 有没有自己的超时闸', async () => {
    // 造一个**永不返回**的模型：D-4 承诺「抛错/超时 → 前台如实说没拿到结果」。
    // 抛错支已证；本条专测「超时」支——若无内部超时闸，工具会一直挂着，
    // 前台永远等不到那句"没拿到结果"。
    let release: () => void = () => {};
    const hung = new Promise<never>((_, reject) => {
      release = () => reject(new Error('probe-release'));
    });
    const hangingModel = {
      specificationVersion: 'v4' as const,
      provider: 'probe',
      modelId: 'hanging',
      supportedUrls: {},
      doGenerate: async () => hung,
      doStream: async () => hung,
    };
    const sentinel = installNoNetworkSentinel();
    let winner = 'unknown';
    try {
      const call: Promise<string> = executeTool(
        'consult_specialist',
        { targetAgent: 'insight', question: '挂住' },
        {
          ...baseCtx(),
          consultBudget: { used: 0, max: MAX_CONSULTS_PER_TURN },
          model: hangingModel as never,
        },
      ).then((): string => 'tool-returned');
      // 释放后必然 reject，先接住免得 unhandled（吞掉的只是我们自己造的 release 错）
      void call.catch((): void => undefined);
      const timer = new Promise<string>((r) =>
        setTimeout(() => r('timer-won'), 1200),
      );
      winner = await Promise.race([call, timer]);
    } finally {
      release();
      sentinel.restore();
    }
    observed['F007.hangingSubLoopRaceWinner'] = winner;
    // 只登记事实：timer-won = 1.2s 内工具没有自我了断（无内部超时闸）
    expect(['tool-returned', 'timer-won']).toContain(winner);
  });

  it('P13 · 前台失败条款正向锚点（字面精确匹配）', () => {
    expect(FRONT_DESK_HONESTY_CLAUSE).toContain('不得用自己的猜测填补');
    expect(FRONT_DESK_HONESTY_CLAUSE).toContain('不得宣称咨询过并得到结论');
    expect(FRONT_DESK_HONESTY_CLAUSE).toContain('我问了但没拿到结果');
  });
});
