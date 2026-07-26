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
  FRONT_DESK_AGENT_ID,
  MAX_CONSULTS_PER_TURN,
  SPECIALIST_MAX_STEPS,
  getPersona,
} from '../../src/lib/agent/registry';
import { chainBudget } from '../../src/lib/agent/loop';
import { executeTool } from '../../src/lib/agent/execute';
import { CONSULT_BUDGET_EXHAUSTED_MSG } from '../../src/lib/agent/tools/consult-specialist';
import { scriptedGenerateModel } from '../support/scripted-generate-model';
import { installNoNetworkSentinel } from '../support/agent-loop-testbed';
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
