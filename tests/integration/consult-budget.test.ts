// M4.7-FRONTDESK F006 — 成本硬上限 + 撞顶诚实告知
//
// 【为什么要有硬上限】嵌套 loop 让 token 与延迟成倍：一个问题可能烧掉十几次模型
// 调用。三个上限都收在 registry（单一真相源），且**数字是猜的**——全批验收皆 mock，
// 无真实延迟数据（spec D-3 如实登记）。故本文件除了钉行为，还钉「改常量 → 行为同步改」
// 这条双向绑定：上线拿到真实数据后改一处即可，不必翻代码。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  DEFAULT_MAX_STEPS,
  EXTENDED_MAX_STEPS,
  FRONT_DESK_AGENT_ID,
  MAX_CONSULTS_PER_TURN,
  SPECIALIST_MAX_STEPS,
  getPersona,
} from '../../src/lib/agent/registry';
import { chainBudget } from '../../src/lib/agent/loop';
import { executeTool } from '../../src/lib/agent/execute';
import { CONSULT_BUDGET_EXHAUSTED_MSG } from '../../src/lib/agent/tools/consult-specialist';
import { scriptedGenerateModel } from '../support/scripted-generate-model';
import {
  installNoNetworkSentinel,
  runScriptedLoop,
} from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG = `test-tenant-m47-f006-${process.pid}`;
let tenantId: string;
let projectId: string;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 F006 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 F006 项目 ${process.pid}` },
  });
  projectId = p.id;
});

afterAll(async () => {
  // 【首轮验收指出本文件泄漏 Handoff】咨询成功会落一行协作痕迹（F008 / D-5），
  // 本文件跑了多次咨询却没清它——违反的正是本批 spec §6 自己立的清态纪律。
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

function ctxWithBudget(): ToolContext {
  return {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
    consultBudget: { used: 0, max: MAX_CONSULTS_PER_TURN },
    model: scriptedGenerateModel([{ text: '答完了。' }]),
  };
}

describe('单一真相源（无第二处硬编码）', () => {
  it('三个上限都从 registry 出，其余文件不得再写这些数字', () => {
    expect(MAX_CONSULTS_PER_TURN).toBeGreaterThan(0);
    expect(SPECIALIST_MAX_STEPS).toBeGreaterThan(0);
    expect(getPersona(FRONT_DESK_AGENT_ID).maxSteps).toBeGreaterThan(0);
    // specialist-loop 只**再导出**，不得自己定义数字
    const sub = readFileSync('src/lib/agent/specialist-loop.ts', 'utf8');
    expect(sub, 'specialist-loop 不得重新定义步数上限').not.toMatch(
      /const SPECIALIST_MAX_STEPS\s*=\s*\d/,
    );
    expect(sub).toContain("export { SPECIALIST_MAX_STEPS } from './registry'");
    const tool = readFileSync(
      'src/lib/agent/tools/consult-specialist.ts',
      'utf8',
    );
    expect(tool, '咨询次数上限必须读常量而非写死').toContain(
      'MAX_CONSULTS_PER_TURN',
    );
    expect(tool).not.toMatch(/used\s*>=\s*\d/);
  });

  it('改常量 → 行为同步改（双向绑定，非文档自证）', async () => {
    // 用一个自定义 max 的预算对象模拟"常量被改小"，验证判据读的是预算而非写死的 2
    const ctx = { ...ctxWithBudget(), consultBudget: { used: 0, max: 1 } };
    const sentinel = installNoNetworkSentinel();
    try {
      await executeTool(
        'consult_specialist',
        { targetAgent: 'insight', question: 'q1' },
        ctx,
      );
      await expect(
        executeTool(
          'consult_specialist',
          { targetAgent: 'match', question: 'q2' },
          ctx,
        ),
        'max=1 时第二次就该被拒 —— 若判据写死 2 则此处不会红',
      ).rejects.toThrow(CONSULT_BUDGET_EXHAUSTED_MSG);
    } finally {
      sentinel.restore();
    }
  });
});

describe('每轮咨询次数上限', () => {
  it(`用满 ${MAX_CONSULTS_PER_TURN} 次后如实拒绝（不静默吞、不假装咨询过）`, async () => {
    const ctx = ctxWithBudget();
    const sentinel = installNoNetworkSentinel();
    try {
      for (let i = 0; i < MAX_CONSULTS_PER_TURN; i++) {
        await executeTool(
          'consult_specialist',
          { targetAgent: 'insight', question: `q${i}` },
          ctx,
        );
      }
      expect(ctx.consultBudget!.used).toBe(MAX_CONSULTS_PER_TURN);
      await expect(
        executeTool(
          'consult_specialist',
          { targetAgent: 'match', question: '再问一个' },
          ctx,
        ),
      ).rejects.toThrow(CONSULT_BUDGET_EXHAUSTED_MSG);
    } finally {
      sentinel.restore();
    }
  });

  it('拒绝消息告诉模型该怎么办（用已有结果作答 + 如实说还有什么没问到）', () => {
    // 正向精确匹配语义核心——只说"超限"而不说"该怎么办"，模型很可能就地编一个答案
    expect(CONSULT_BUDGET_EXHAUSTED_MSG).toContain('用已拿到的结果作答');
    expect(CONSULT_BUDGET_EXHAUSTED_MSG).toContain('如实告诉用户还有哪些没问到');
  });
});

/* ── 复验轮二 RV-4 收尾：把「接力抬预算 / 咨询不抬」钉成行为，不再只是注释 ────────
   轮一 §9 点名的那句反向陈述（registry 注释 + architecture.md 两处）已更正为与实物
   一致。但「改完文档」不等于「这句话被守住」——实测：删掉 `loop.ts` 接力分支里的
   `budgetChain.add(target)`，全量套件**无一条会红**（chainBudget 的函数级用例只证明
   函数本身对，证明不了它被接在接力分支上）。故补下面这对**对称**的 loop 级用例：
   两个方向各一条，任一方向被改都当场翻红。                                       */
describe('接力抬预算 / 咨询不抬（RV-4 行为绑定，非文档自证）', () => {
  /** 打不住的模型：脚本用尽后仍要工具 → 逼 loop 撞自己的预算上限。 */
  const keepCalling = (toolName: string, input: unknown) => ({
    toolCalls: [{ toolName, input }],
  });

  it('接力到深链专家（insight）→ 本轮预算抬到深链档，loop 跑满 10 步才停', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runScriptedLoop({
        copilot: {
          route: '/admin',
          projectId,
          env: 'default',
          agentId: FRONT_DESK_AGENT_ID,
        },
        ctx: ctxWithBudget(),
        prompt: '这个项目的 ROI 复盘交给洞察，别停',
        script: [
          keepCalling('handoff_to', {
            toAgent: 'insight',
            artifactType: 'report',
            artifactRef: projectId,
            summary: '请洞察接手做 ROI 复盘',
          }),
        ],
        // 接力后当值人格是 insight，兜底步只能调它视野内的工具
        fallbackStep: keepCalling('compute_roi_portfolio', {}),
      });
      await run.loop.telemetry; // 遥测 fire-and-forget，等它落完再进 afterAll 清理

      // 装配时的静态预算仍是前台档（5）——抬升发生在运行时的 currentBudget()
      expect(run.loop.maxSteps).toBe(DEFAULT_MAX_STEPS);
      expect(
        run.steps,
        '接力进深链后仍按前台 5 步停 = budgetChain 没接上接力分支（深链分析被腰斩）',
      ).toBe(EXTENDED_MAX_STEPS);
      expect(run.networkCalls).toEqual([]);
    } finally {
      sentinel.restore();
    }
  }, 60_000);

  it('咨询同一位深链专家 → 预算**不**抬，前台仍在第 5 步停', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runScriptedLoop({
        copilot: {
          route: '/admin',
          projectId,
          env: 'default',
          agentId: FRONT_DESK_AGENT_ID,
        },
        ctx: ctxWithBudget(),
        prompt: '帮我问问洞察这个项目的 ROI，别停',
        script: [
          keepCalling('consult_specialist', {
            targetAgent: 'insight',
            question: 'ROI 如何？',
          }),
        ],
        fallbackStep: keepCalling('propose_plan', {
          items: [{ title: '继续查' }],
        }),
        specialistScripts: { insight: [{ text: '本期分子无回传源。' }] },
      });
      await run.loop.telemetry;

      expect(
        run.steps,
        '咨询把预算抬到了深链档 = 前台背上了它不该背的爆炸半径（咨询开销在子 loop 内已自限）',
      ).toBe(DEFAULT_MAX_STEPS);
      expect(run.networkCalls).toEqual([]);
    } finally {
      sentinel.restore();
    }
  }, 60_000);
});

describe('链上最大档位（D-3 裁决）', () => {
  it('前台单独 = 常规档；链上含深链专家 → 抬到深链档', () => {
    const front = getPersona(FRONT_DESK_AGENT_ID).maxSteps;
    const deep = getPersona('insight').maxSteps;
    expect(deep, '前提：insight 确为深链档，否则本用例没有分辨力').toBeGreaterThan(
      front,
    );
    expect(chainBudget([FRONT_DESK_AGENT_ID])).toBe(front);
    expect(chainBudget([FRONT_DESK_AGENT_ID, 'insight'])).toBe(deep);
    // 往下跳也不缩水（深链→常规仍取最大，否则接力回常规专家会当场截停）
    expect(chainBudget([FRONT_DESK_AGENT_ID, 'insight', 'reach'])).toBe(deep);
  });
});
