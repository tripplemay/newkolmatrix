// M4.8-HARDEN F006 — budgetHitScope 四象限（S-M47-G3-5 兑现）
//
// 【被修的是什么】M4.7 的 scope 只有 `'front' | 'none'`：专家子 loop 撞顶只记在
// consultation 产物的 `budgetHit` 上，那东西只活在流里，**落库层查不到**。
// 线上因此答不出一个很基本的问题：「这次答得不完整，是前台没跑完，还是被咨询的
// 专家没跑完？」——两者的处置完全不同（前者调前台步数预算，后者调子 loop 预算/时限）。
//
// 【为什么是四象限而不是三条】两层是**独立**事实，不是一个布尔的两种说法：
// 前台撞 × 专家撞 = 2×2。四格各钉一条，且每格都同时断言**另一维不被误报**
//（M4.7 规律 1：正反两方向都要，只钉"该响的响了"挡不住"不该响的也响"）。
//
// 全程 mock 模型 + fetch 哨兵：零外呼。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  FRONT_DESK_AGENT_ID,
  SPECIALIST_MAX_STEPS,
  getPersona,
} from '../../src/lib/agent/registry';
import {
  buildLoopTelemetryPayload,
  LOOP_TELEMETRY_MARKER,
} from '../../src/lib/agent/loop-telemetry';
import {
  installNoNetworkSentinel,
  runScriptedLoop,
  type ScriptedStep,
} from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type { CopilotContext } from '../../src/lib/agent/persona-router';

const SLUG = `test-tenant-m48-scope-${process.pid}`;
let tenantId: string;
let projectId: string;

const copilot = (): CopilotContext => ({
  route: '/admin',
  projectId,
  env: 'default',
  agentId: FRONT_DESK_AGENT_ID,
});

const ctx = (): ToolContext => ({
  tenantId,
  agentId: FRONT_DESK_AGENT_ID,
  projectId,
  env: 'default',
  consultBudget: { used: 0, max: 2 },
});

/** 一步 propose_plan（前台与 insight 都持有它 —— 主 loop / 子 loop 通用的"再干一步"）。 */
const keepWorking: ScriptedStep = {
  toolCalls: [
    {
      toolName: 'propose_plan',
      input: { title: 'scope', items: [{ title: '继续', needsGate: false }] },
    },
  ],
};

const consultStep: ScriptedStep = {
  toolCalls: [
    {
      toolName: 'consult_specialist',
      input: { targetAgent: 'insight', question: '这个项目的 ROI 怎么样？' },
    },
  ],
};

/** 让专家子 loop **撞满**自己的上限：步步要工具，末步仍在要 → budgetHit=true。 */
const specialistTruncated: ScriptedStep[] = Array.from(
  { length: SPECIALIST_MAX_STEPS },
  () => keepWorking,
);
/** 专家自然收敛：末步出文本。 */
const specialistConverges: ScriptedStep[] = [{ text: '本期分子无回传源。' }];

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.8 scope 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.8 scope 项目 ${process.pid}` },
  });
  projectId = p.id;
});

afterAll(async () => {
  // 清理登记表（spec §4）：Tenant / Project / OperationLog / PendingAction / Handoff
  //（consult_specialist 经 createHandoff 落 Handoff 行）
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [handoffs, logs, pas, projects, tenants] = await Promise.all([
    prisma.handoff.count({ where: { tenantId } }),
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  expect({ handoffs, logs, pas, projects, tenants }).toEqual({
    handoffs: 0,
    logs: 0,
    pas: 0,
    projects: 0,
    tenants: 0,
  });
});

describe('F006 四象限：撞顶发生在哪一层，落库层答得出来', () => {
  it('象限① none —— 两层都没撞（正常收敛）', async () => {
    const run = await runScriptedLoop({
      copilot: copilot(),
      ctx: ctx(),
      prompt: '你好',
      script: [{ text: '你好，有什么可以帮你？' }],
    });
    const tele = await run.loop.telemetry;
    expect(run.networkCalls).toEqual([]);
    expect(tele!.budgetHitScope).toBe('none');
    expect(tele!.budgetHit).toBe(false);
  }, 60_000);

  it('象限② front —— 只有前台撞顶（本轮没咨询任何专家）', async () => {
    const run = await runScriptedLoop({
      copilot: copilot(),
      ctx: ctx(),
      prompt: '一直查下去',
      script: [],
      fallbackStep: keepWorking, // 打不住的模型 → 用满前台预算
    });
    const tele = await run.loop.telemetry;
    expect(run.steps, '前提：确实撞了前台上限').toBe(
      getPersona(FRONT_DESK_AGENT_ID).maxSteps,
    );
    expect(tele!.budgetHitScope).toBe('front');
    expect(tele!.budgetHit).toBe(true);
    expect(tele!.consultCount, '前提：本轮没咨询过专家').toBe(0);
  }, 60_000);

  it('🔑 象限③ specialist —— 只有专家撞顶（前台自然收敛，此前落库层完全看不见）', async () => {
    const run = await runScriptedLoop({
      copilot: copilot(),
      ctx: ctx(),
      prompt: '帮我问问洞察这个项目的 ROI',
      script: [consultStep, { text: '洞察那边没查完，我先把已知的说给你。' }],
      specialistScripts: { insight: specialistTruncated },
    });
    const tele = await run.loop.telemetry;
    expect(run.networkCalls).toEqual([]);
    // 前提活性：咨询确实发生了，且产物确实标着"专家撞顶"
    const consultation = run.toolOutputs.find(
      (o) => o.toolName === 'consult_specialist',
    )?.output as { ok?: boolean; budgetHit?: boolean } | undefined;
    expect(consultation?.ok, '前提：咨询成功返回（否则本条测的是失败降级）').toBe(
      true,
    );
    expect(consultation?.budgetHit, '前提：专家确实撞了子 loop 上限').toBe(true);

    expect(
      tele!.budgetHitScope,
      '专家撞顶必须落到会话级遥测 —— 只记在流内的产物上等于线上查不到',
    ).toBe('specialist');
    // 双向：前台没撞，会话级 budgetHit 不得被专家的撞顶带翻
    expect(
      tele!.budgetHit,
      'budgetHit 是"前台被截停"的口径，与用户面 budget_notice 同源（R-6）',
    ).toBe(false);
  }, 60_000);

  it('象限④ both —— 两层都撞', async () => {
    const run = await runScriptedLoop({
      copilot: copilot(),
      ctx: ctx(),
      prompt: '问完洞察还要一直查下去',
      script: [consultStep],
      fallbackStep: keepWorking, // 咨询完继续打不住 → 前台也用满
      specialistScripts: { insight: specialistTruncated },
    });
    const tele = await run.loop.telemetry;
    expect(run.steps, '前提：前台确实撞顶').toBe(
      getPersona(FRONT_DESK_AGENT_ID).maxSteps,
    );
    expect(tele!.budgetHitScope).toBe('both');
    expect(tele!.budgetHit).toBe(true);
  }, 60_000);

  it('🔒 反方向：专家**没**撞顶时不得误报 specialist（咨询发生 ≠ 专家撞顶）', async () => {
    const run = await runScriptedLoop({
      copilot: copilot(),
      ctx: ctx(),
      prompt: '帮我问问洞察这个项目的 ROI',
      script: [consultStep, { text: '洞察说本期分子无回传源。' }],
      specialistScripts: { insight: specialistConverges },
    });
    const tele = await run.loop.telemetry;
    const consultation = run.toolOutputs.find(
      (o) => o.toolName === 'consult_specialist',
    )?.output as { ok?: boolean; budgetHit?: boolean } | undefined;
    expect(consultation?.ok, '前提：咨询确实发生了').toBe(true);
    expect(consultation?.budgetHit, '前提：专家自然收敛').toBe(false);
    expect(
      tele!.budgetHitScope,
      '咨询过就报 specialist = 把"问过专家"当成"专家没答完"',
    ).toBe('none');
  }, 60_000);

  it('🔒 反方向：咨询产物**不得**被算进前台的撞顶（scope 与 budgetHit 各管一层）', async () => {
    // 变异「把咨询也计入 front」若发生，象限③ 会变成 'front' 或 'both' —— 这条从
    // 落库行的角度再钉一次：只专家撞顶的会话，查询 budgetHit=true 时不该捞到它。
    const rows = await prisma.operationLog.findMany({
      where: {
        tenantId,
        kind: 'auto',
        summary: { startsWith: LOOP_TELEMETRY_MARKER },
        payloadJson: { path: ['budgetHitScope'], equals: 'specialist' },
      },
    });
    expect(rows.length, '象限③ 的那一行必须真的落库了（不是只在内存里对）').toBe(
      1,
    );
    const payload = rows[0].payloadJson as unknown as {
      budgetHit: boolean;
      v: number;
    };
    expect(payload.budgetHit).toBe(false);
    // 【不与常量比】`toBe(LOOP_TELEMETRY_VERSION)` 是同源自证（改常量两边一起变）。
    // 钉的是**下界**：v1 的 `'none'` 只表示"前台没撞顶"，与四值化后的 `'none'`
    // （两层都没撞）不是同一个事实；四值化的行再写 v1 会让历史行无法被排除。
    expect(payload.v, '四值化的载荷不得再标 v1').toBeGreaterThanOrEqual(2);
  }, 60_000);
});

describe('F006 纯函数派生（四格穷举，无 IO）', () => {
  const base = {
    agentId: FRONT_DESK_AGENT_ID,
    steps: 3,
    maxSteps: 5,
    finishReason: 'stop',
    toolNames: [] as string[],
  };
  it('front × specialist 的四种组合各得其所', () => {
    const scope = (truncated: boolean, specialistBudgetHit: boolean) =>
      buildLoopTelemetryPayload({ ...base, truncated, specialistBudgetHit })
        .budgetHitScope;
    expect(scope(false, false)).toBe('none');
    expect(scope(true, false)).toBe('front');
    expect(scope(false, true)).toBe('specialist');
    expect(scope(true, true)).toBe('both');
  });

  it('旧调用点（不传 specialistBudgetHit）行为不变：只会是 front / none', () => {
    const sentinel = installNoNetworkSentinel();
    sentinel.restore(); // 纯函数不出网，装了就撤——只为与本文件其余用例同一纪律
    expect(
      buildLoopTelemetryPayload({ ...base, steps: 5 }).budgetHitScope,
    ).toBe('front');
    expect(buildLoopTelemetryPayload({ ...base }).budgetHitScope).toBe('none');
  });
});
