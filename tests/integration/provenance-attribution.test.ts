// M4.7-FRONTDESK F004 — 留痕归属：记实际干活的人格
//
// 【欠了两批的账】M4.5 soft-watch O-G2-1：`gate.ts` 用 `ctx.agentId` 写
// `PendingAction.agentId`，而接力**不更新** ctx.agentId → insight 当值时备的
// pending 记成 orchestrator；今天页雷达深链靠 `agentId → STAGE_AGENT` 反查，
// 而 orchestrator 不在 STAGE_AGENT 值域 → 全线落回退分支 `project.cur`。
// 单一前台把这个错标放大到**每一条** pending（前台受理一切），故本批必须还。
//
// 同时闭环 O-G2-2：`handoff_to` 的「不能交接给自己」原先比对**起始**人格；
// ctx.agentId 按当值派生后，该校验自动变成比对当值人格（登记时写的触发条件
// 「一旦给第二个人格发接力权或放开链式接力」已被单一前台命中）。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { FRONT_DESK_AGENT_ID } from '../../src/lib/agent/registry';
import { STAGE_AGENT, type Stage } from '../../src/lib/agent/stage-routing';
import { runScriptedLoop } from '../support/agent-loop-testbed';
import { runSpecialistLoop } from '../../src/lib/agent/specialist-loop';
import { scriptedGenerateModel } from '../support/scripted-generate-model';
import { installNoNetworkSentinel } from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG = `test-tenant-m47-f004-${process.pid}`;

let tenantId: string;
let projectId: string;
let frontDeskCtx: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 F004 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 F004 项目 ${process.pid}` },
  });
  projectId = p.id;
  frontDeskCtx = {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
  };
});

afterAll(async () => {
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [logs, handoffs, pas, shares, projects, tenants] = await Promise.all([
    prisma.operationLog.count({ where: { tenantId } }),
    prisma.handoff.count({ where: { tenantId } }),
    prisma.pendingAction.count({ where: { tenantId } }),
    prisma.shareLink.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.tenant.count({ where: { slug: SLUG } }),
  ]);
  expect({ logs, handoffs, pas, shares, projects, tenants }).toEqual({
    logs: 0,
    handoffs: 0,
    pas: 0,
    shares: 0,
    projects: 0,
    tenants: 0,
  });
});

describe('子 loop 内的动作归属专家（不是前台）', () => {
  it('前台咨询洞察 → 洞察备的 pending 记 agentId=insight', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      await runSpecialistLoop({
        targetAgent: 'insight',
        question: '备一份季度分享',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel([
          { toolName: 'create_share_link', input: { scope: 'quarterly' } },
          { text: '已备好，等你确认。' },
        ]),
      });
    } finally {
      sentinel.restore();
    }
    const pa = await prisma.pendingAction.findFirst({
      where: { tenantId, toolName: 'create_share_link' },
      orderBy: { createdAt: 'desc' },
    });
    expect(pa, '应落一条 pending').toBeTruthy();
    expect(
      pa!.agentId,
      '记的必须是实际干活的专家，不是受理会话的前台',
    ).toBe('insight');
    expect(pa!.agentId).not.toBe(FRONT_DESK_AGENT_ID);
  });

  it('OperationLog.actor 同样记专家（留痕两个字段都要锁，N-1 = 静默门）', async () => {
    // 【首轮验收 F004-D1】acceptance 把 PendingAction.agentId **与**
    // OperationLog.actor 并列写为「记实际干活的专家」，但交付物只给前者上了钉子。
    // 变异实证：gate.ts 的 actor 写死为前台后，全仓 1341 条测试无一翻红——
    // 违反的正是本批 spec §6.3 自己立的「机械钉覆盖面必须与它守护的那句话逐项对齐」。
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, actor: { not: FRONT_DESK_AGENT_ID } },
      orderBy: { createdAt: 'desc' },
    });
    expect(log, '专家干的活应留下 actor≠前台 的日志行').toBeTruthy();
    expect(log!.actor, 'actor 必须是实际干活的专家').toBe('insight');
  });

  it('雷达深链反查不再落回退分支（agentId → STAGE_AGENT 命中）', async () => {
    const pa = await prisma.pendingAction.findFirst({
      where: { tenantId, toolName: 'create_share_link' },
      orderBy: { createdAt: 'desc' },
    });
    const stage = (Object.keys(STAGE_AGENT) as Stage[]).find(
      (s) => STAGE_AGENT[s] === pa!.agentId,
    );
    expect(
      stage,
      'agentId 不在 STAGE_AGENT 值域 = 深链落回退分支（正是 O-G2-1 的后果）',
    ).toBe('insight');
    // 活性：确认前台身份**确实**不在值域内——否则本断言换成前台也会绿
    const frontStage = (Object.keys(STAGE_AGENT) as Stage[]).find(
      (s) => STAGE_AGENT[s] === FRONT_DESK_AGENT_ID,
    );
    expect(frontStage, '若前台也在值域内，上面那条断言就没有分辨力').toBeUndefined();
  });
});

describe('M4.5 接力路径同样派生（O-G2-1 闭环）', () => {
  it('接力到洞察后备的 pending 记 insight，而非起始人格 orchestrator', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: { ...frontDeskCtx },
      prompt: '让洞察接手并备一份分享',
      script: [
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'insight',
                artifactType: 'report',
                artifactRef: 'f004-fixture',
                summary: '请洞察接手',
              },
            },
          ],
        },
        {
          toolCalls: [
            { toolName: 'create_share_link', input: { scope: 'quarterly' } },
          ],
        },
        { text: '已备好。' },
      ],
    });
    expect(run.networkCalls, '零外呼').toEqual([]);
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before + 1,
    );
    const pa = await prisma.pendingAction.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    expect(
      pa!.agentId,
      '接力后当值人格是 insight —— 记成起始人格就是 O-G2-1 的原状',
    ).toBe('insight');
  });
});
