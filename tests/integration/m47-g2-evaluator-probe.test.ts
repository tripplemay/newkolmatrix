// [Evaluator · M4.7-FRONTDESK G2] F003 / F004 独立取证探针
//
// 【为什么另起一个文件】验收不复用实现方交付的用例作为唯一证据（那等于让被测方
// 出示自己的成绩单）。本文件按 features.json 里 F003 / F004 的 acceptance **原文场景**
// 重新取证，尤其覆盖交付用例里没有断言的两处：
//   ① `OperationLog.actor` 记实际干活的专家（acceptance 与 PendingAction.agentId 并列写着，
//      交付的 provenance-attribution.test.ts 只断言了 PendingAction.agentId）
//   ② acceptance 原文的场景是「前台咨询**触达专家备一封邮件** → agentId = reach」，
//      交付用例换成了 insight + create_share_link，且是**服务层直调** runSpecialistLoop；
//      本文件走真前台 loop → consult_specialist → 子 loop → send_outreach 全链。
//   ③ O-G2-2「不能交接给自己」比对**当值人格**——交付用例零覆盖。
//
// 零外呼（testbed fetch 哨兵）、零真实副作用（outbound 一律停 pending）；
// 夹具租户带 G2 + pid 唯一前缀，afterAll 逐表清 + 逐表断言残留（软引用表不级联）。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  FRONT_DESK_AGENT_ID,
  getPersona,
} from '../../src/lib/agent/registry';
import { STAGE_AGENT, type Stage } from '../../src/lib/agent/stage-routing';
import { HANDOFF_SELF_MSG } from '../../src/lib/agent/tools/handoff-to';
import { toAiSdkTools } from '../../src/lib/agent/to-ai-sdk-tools';
import { STAGE_HINT_HEADING } from '../../src/lib/agent/stage-hint';
import { runScriptedLoop } from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG = `test-tenant-m47-g2-${process.pid}`;

let tenantId: string;
let projectId: string;
let kolId: string;
let frontDeskCtx: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 G2 验收夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 G2 项目 ${process.pid}` },
  });
  projectId = p.id;
  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m47-g2-${process.pid}`,
      displayName: `G2 探针创作者 ${process.pid}`,
      handle: `m47-g2-${process.pid}`,
      platform: 'youtube',
      // 夹具地址；本批全程 mock 发送 + outbound 停 pending，绝不外呼
      contactEmail: `m47-g2-${process.pid}@example.invalid`,
    },
  });
  kolId = k.id;
  frontDeskCtx = {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
  };
});

afterAll(async () => {
  // 软引用无 FK（OperationLog / Handoff 对 Tenant 只有 @@index）——删租户不级联，
  // 必须逐表清 + 逐表断言残留（只断言 tenant = 假信心）。
  await prisma.outreachMessage.deleteMany({ where: { tenantId } });
  await prisma.outreachThread.deleteMany({ where: { tenantId } });
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  const [logs, handoffs, pas, shares, msgs, threads, kols, projects, tenants] =
    await Promise.all([
      prisma.operationLog.count({ where: { tenantId } }),
      prisma.handoff.count({ where: { tenantId } }),
      prisma.pendingAction.count({ where: { tenantId } }),
      prisma.shareLink.count({ where: { tenantId } }),
      prisma.outreachMessage.count({ where: { tenantId } }),
      prisma.outreachThread.count({ where: { tenantId } }),
      prisma.kol.count({ where: { tenantId } }),
      prisma.project.count({ where: { tenantId } }),
      prisma.tenant.count({ where: { slug: SLUG } }),
    ]);
  expect(
    { logs, handoffs, pas, shares, msgs, threads, kols, projects, tenants },
    'G2 夹具残留（含软引用表）',
  ).toEqual({
    logs: 0,
    handoffs: 0,
    pas: 0,
    shares: 0,
    msgs: 0,
    threads: 0,
    kols: 0,
    projects: 0,
    tenants: 0,
  });
});

describe('[G2·F004] acceptance 原文场景：前台咨询触达专家备一封邮件', () => {
  let paId: string;

  it('全链（前台 loop → consult_specialist → 子 loop → send_outreach）→ pending.agentId = reach', async () => {
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
        stage: 'reach',
      },
      ctx: { ...frontDeskCtx },
      prompt: '帮我给这位创作者发一封邀约',
      script: [
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: {
                targetAgent: 'reach',
                question: '给这位创作者备一封邀约邮件',
              },
            },
          ],
        },
        { text: '已经让触达专家备好邮件，等你确认再发。' },
      ],
      specialistScripts: {
        reach: [
          {
            toolCalls: [
              {
                toolName: 'send_outreach',
                input: {
                  projectId,
                  kolId,
                  subject: 'G2 探针邀约',
                  body: '这是验收探针正文，不会真实发出（停在闸门前）。',
                },
              },
            ],
          },
          { text: '邮件已备好，等人确认。' },
        ],
      },
    });

    expect(run.networkCalls, '零外呼').toEqual([]);
    expect(run.toolErrors, '不应有工具错误').toEqual([]);
    expect(run.toolNames).toContain('consult_specialist');

    const pa = await prisma.pendingAction.findFirst({
      where: { tenantId, toolName: 'send_outreach' },
      orderBy: { createdAt: 'desc' },
    });
    expect(pa, 'outbound 必须停在 pending（闸门红线）').toBeTruthy();
    paId = pa!.id;
    expect(pa!.status).toBe('pending');
    expect(
      pa!.agentId,
      'acceptance 原文：该 pending 的 agentId = reach 而非 orchestrator',
    ).toBe('reach');
    expect(pa!.agentId).not.toBe(FRONT_DESK_AGENT_ID);

    // 红线复核：闸门前零真实副作用
    expect(await prisma.outreachMessage.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.outreachThread.count({ where: { tenantId } })).toBe(0);
  });

  it('OperationLog.actor 同样记 reach（acceptance 与 PendingAction.agentId 并列写着）', async () => {
    const log = await prisma.operationLog.findFirst({
      where: { tenantId, kind: 'gate', ref: paId },
    });
    expect(log, '闸门必须留痕').toBeTruthy();
    expect(
      log!.actor,
      'OperationLog.actor 必须是实际干活的专家（reach），不是受理会话的前台',
    ).toBe('reach');
  });

  it('雷达深链反查命中 reach 环节（不落 project.cur 回退分支）', async () => {
    const pa = await prisma.pendingAction.findUnique({ where: { id: paId } });
    const stage = (Object.keys(STAGE_AGENT) as Stage[]).find(
      (s) => STAGE_AGENT[s] === pa!.agentId,
    );
    expect(stage, 'agentId 不在 STAGE_AGENT 值域 = 深链落回退分支').toBe(
      'reach',
    );
    // 活性：前台身份确实不在值域内，否则本断言换成前台也会绿
    expect(
      (Object.keys(STAGE_AGENT) as Stage[]).find(
        (s) => STAGE_AGENT[s] === FRONT_DESK_AGENT_ID,
      ),
      '若前台也在 STAGE_AGENT 值域内，本断言没有分辨力',
    ).toBeUndefined();
  });
});

describe('[G2·F004] O-G2-2：「不能交接给自己」比对当值人格', () => {
  it('当值人格 = insight 时，handoff_to(insight) 被拒（起始人格仍是前台）', async () => {
    const tools = toAiSdkTools(['handoff_to'], { ...frontDeskCtx }, {
      isToolActive: () => true,
      currentAgentId: () => 'insight',
    });
    const before = await prisma.handoff.count({ where: { tenantId } });
    await expect(
      (tools.handoff_to as { execute: (i: unknown, o: unknown) => Promise<unknown> }).execute(
        {
          toAgent: 'insight',
          artifactType: 'report',
          artifactRef: 'g2-self-probe',
          summary: '探针：当值人格交接给自己',
        },
        {},
      ),
    ).rejects.toThrow(HANDOFF_SELF_MSG);
    expect(
      await prisma.handoff.count({ where: { tenantId } }),
      '被拒时不得留下 Handoff 行',
    ).toBe(before);
  });

  it('活性对照：不派生当值人格（M4.5 原状）时同一调用不被拒 —— 证明上条有分辨力', async () => {
    const tools = toAiSdkTools(['handoff_to'], { ...frontDeskCtx }, {
      isToolActive: () => true,
      // 不传 currentAgentId = M4.5 的原状（比对起始人格 orchestrator）
    });
    const before = await prisma.handoff.count({ where: { tenantId } });
    await (
      tools.handoff_to as { execute: (i: unknown, o: unknown) => Promise<unknown> }
    ).execute(
      {
        toAgent: 'insight',
        artifactType: 'report',
        artifactRef: 'g2-self-probe-control',
        summary: '对照：起始人格比对下不被拒',
      },
      {},
    );
    expect(
      await prisma.handoff.count({ where: { tenantId } }),
      'M4.5 原状下该调用会成功落行（这正是 O-G2-2 登记的漏洞）',
    ).toBe(before + 1);
  });
});

describe('[G2·F003] 页面不再决定谁来回答（独立复核，不复用交付用例）', () => {
  it('客户端指定 insight + 工作区层 insight 路由 → 受理人格仍是前台，且看得见 consult_specialist', async () => {
    const run = await runScriptedLoop({
      copilot: {
        route: '/admin/insight',
        projectId: null,
        env: 'default',
        // 客户端刻意指定专家人格：CopilotContext 层不再有人采信它决定权限
        agentId: FRONT_DESK_AGENT_ID,
      },
      ctx: { ...frontDeskCtx, projectId: null },
      prompt: '这个季度 ROI 怎么样？顺便看看还该推进什么',
      script: [{ text: '好的。' }],
    });
    expect(run.loop.persona.id).toBe(FRONT_DESK_AGENT_ID);
    expect(run.visibleToolsPerStep[0]).toContain('consult_specialist');
    expect(run.systemPerStep[0]).toContain(
      getPersona(FRONT_DESK_AGENT_ID).isolation,
    );
  });

  it('环节线索在**接力后**的目标人格 system 里仍在（线索不随换人丢失）', async () => {
    const run = await runScriptedLoop({
      copilot: {
        route: `/admin/campaigns/${projectId}`,
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
        stage: 'match',
      },
      ctx: { ...frontDeskCtx },
      prompt: '让洞察接手',
      script: [
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'insight',
                artifactType: 'report',
                artifactRef: 'g2-stage-probe',
                summary: '请洞察接手',
              },
            },
          ],
        },
        { text: '已交接。' },
      ],
    });
    expect(run.systemPerStep.length).toBeGreaterThan(1);
    expect(run.systemPerStep[0]).toContain(STAGE_HINT_HEADING);
    expect(
      run.systemPerStep[1],
      '接力后的人格同样应看得见"用户在哪个环节页"这条线索',
    ).toContain(STAGE_HINT_HEADING);
  });
});
