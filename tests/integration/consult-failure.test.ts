// M4.7-FRONTDESK F007 — 咨询失败降级：如实说，不假装
//
// 【最不能接受的失败模式】子 loop 炸了，前台静默降级成自己编一个答案。
// 单一前台之后用户**只听得见前台的声音**——他无从分辨这句话是专家读了真数据说的，
// 还是前台在专家挂掉后自己圆的。所以：失败必须结构化透传 + 必须留痕。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  FRONT_DESK_AGENT_ID,
  FRONT_DESK_HONESTY_CLAUSE,
  MAX_CONSULTS_PER_TURN,
} from '../../src/lib/agent/registry';
import { executeTool } from '../../src/lib/agent/execute';
import {
  CONSULT_FAILED_MARKER,
  type ConsultSpecialistOutput,
} from '../../src/lib/agent/tools/consult-specialist';
import * as specialistLoop from '../../src/lib/agent/specialist-loop';
import { scriptedGenerateModel } from '../support/scripted-generate-model';
import { installNoNetworkSentinel } from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG = `test-tenant-m47-f007-${process.pid}`;
let tenantId: string;
let projectId: string;

function ctxOf(): ToolContext {
  return {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
    consultBudget: { used: 0, max: MAX_CONSULTS_PER_TURN },
    model: scriptedGenerateModel([{ text: 'ok' }]),
  };
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 F007 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 F007 项目 ${process.pid}` },
  });
  projectId = p.id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  // 【清态】咨询成功会落一行协作痕迹（F008 / D-5）。软引用无 FK，删租户不级联——
  // 漏清即留孤儿行。本文件跑了咨询用例，必须逐表清 + 逐表断言。
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

describe('子 loop 抛错 → 结构化失败，不抛穿', () => {
  it('返回 ok=false + 原因，且不把整场会话带走', async () => {
    vi.spyOn(specialistLoop, 'runSpecialistLoop').mockRejectedValue(
      new Error('m47 模拟：网关连不上'),
    );
    const sentinel = installNoNetworkSentinel();
    try {
      const res = (await executeTool(
        'consult_specialist',
        { targetAgent: 'insight', question: 'ROI？' },
        ctxOf(),
      )) as { output: ConsultSpecialistOutput };
      expect(res.output.ok, '失败必须如实标出').toBe(false);
      expect(res.output.failureReason).toContain('网关连不上');
      expect(res.output.answer, '拿不到结论就是空，不许编').toBe('');
      // 结构完整——前台读到的字段形状与成功时一致，不会因缺字段而"自由发挥"
      expect(res.output.insufficientEvidence).toBe(false);
      expect(res.output.toolNames).toEqual([]);
    } finally {
      sentinel.restore();
      vi.restoreAllMocks();
    }
  });

  it('失败必须落 OperationLog（否则线上无从归因）', async () => {
    vi.spyOn(specialistLoop, 'runSpecialistLoop').mockRejectedValue(
      new Error('m47 模拟：专家超时'),
    );
    const before = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
    });
    const sentinel = installNoNetworkSentinel();
    try {
      await executeTool(
        'consult_specialist',
        { targetAgent: 'match', question: '组合？' },
        ctxOf(),
      );
    } finally {
      sentinel.restore();
      vi.restoreAllMocks();
    }
    const after = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
    });
    expect(after, '失败留痕缺失 = 线上只看得到「前台说没问到」').toBe(
      before + 1,
    );
    const row = await prisma.operationLog.findFirst({
      where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row!.summary, '留痕要写清是问谁、为什么没成').toContain('match');
    expect(row!.summary).toContain('专家超时');
  });
});

describe('前台条款', () => {
  it('明写「不得用猜测填补」「不得宣称咨询过并得到结论」（字面锚点）', () => {
    // 钉字面量而非引用常量自证（M4.6 与本批 F003 各栽过一次）
    expect(FRONT_DESK_HONESTY_CLAUSE).toContain('不得用自己的猜测填补');
    expect(FRONT_DESK_HONESTY_CLAUSE).toContain('不得宣称咨询过并得到结论');
    expect(
      FRONT_DESK_HONESTY_CLAUSE,
      '不得出现"失败了就自己判断/照常给结论"这类措辞',
    ).not.toMatch(/失败.{0,8}(自行|自己)(判断|作答|给出结论)/);
  });
});

describe('契约类错误仍然抛（不与执行失败混为一谈）', () => {
  it('咨询自己 → 抛错而非 ok=false（这是模型用错工具，该让它看见错误）', async () => {
    await expect(
      executeTool(
        'consult_specialist',
        { targetAgent: FRONT_DESK_AGENT_ID, question: 'x' },
        ctxOf(),
      ),
    ).rejects.toThrow();
  });
});
