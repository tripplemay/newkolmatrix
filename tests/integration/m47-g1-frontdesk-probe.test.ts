// M4.7-FRONTDESK · Evaluator G1 独立探针（F001 / F002）
//
// 【为什么另起一份，而不是采信 Generator 的用例】验收要基于实物与实测，不基于
// 「测试文件里写了这条断言」。本文件对 acceptance 的每一条另行取证，且**判据挑
// 能真正翻红的那一种**——变异实测证明：既有用例里「越权调用不落 PendingAction」
// 在时刻隔离双防线**全部摘掉**时照样全绿（payout 因自身前置条件不满足而失败，
// 与"被隔离拦下"无法区分），故本文件改用「会成功执行的工具 + 行级证据」做判据。
//
// 全程零外呼（fetch 哨兵）；夹具租户带 G1 前缀 + pid，逐表清 + 逐表断言残留。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import {
  FRONT_DESK_AGENT_ID,
  MAX_CONSULTS_PER_TURN,
  SPECIALIST_MAX_STEPS,
  getPersona,
  listPersonas,
} from '../../src/lib/agent/registry';
import {
  CONSULT_DEPTH_EXCEEDED_MSG,
  SPECIALIST_SCOPE_CLAUSE,
  runSpecialistLoop,
} from '../../src/lib/agent/specialist-loop';
import {
  CONSULT_FAILED_MARKER,
  type ConsultSpecialistOutput,
} from '../../src/lib/agent/tools/consult-specialist';
import { executeTool } from '../../src/lib/agent/execute';
import { FRONT_DESK_HONESTY_CLAUSE } from '../../src/lib/agent/registry';
import {
  installNoNetworkSentinel,
  runScriptedLoop,
} from '../support/agent-loop-testbed';
import {
  scriptedGenerateModel,
  type SeenCall,
} from '../support/scripted-generate-model';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG = `test-tenant-m47-G1-${process.pid}`;
const MARK = `G1-${process.pid}`;

let tenantId: string;
let projectId: string;
let frontDeskCtx: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 Evaluator G1 夹具 ${MARK}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `G1 探针项目 ${MARK}` },
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
  // 软引用表（OperationLog / Handoff）对 Tenant 无 FK，删租户不级联：逐表清 + 逐表断言。
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.shareLink.deleteMany({ where: { tenantId } });
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

describe('[G1·F001] 时刻隔离——判据必须能与"工具自身失败"区分', () => {
  it('越权调用被真正拦下：洞察硬调 create_project（本会成功的工具）→ 零行落库', async () => {
    // 【为什么换成 create_project】变异实测：双防线全摘时 payout 照样不落
    // PendingAction（它自身前置条件不满足就先炸了），既有用例因此恒绿。
    // create_project 是 internal 且在本夹具下必定成功——一旦隔离被击穿，
    // 库里就会多出一行，本断言当场翻红（变异 MUT-5 已实证）。
    const rogueName = `越权造的项目-${MARK}`;
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    let run;
    try {
      run = await runSpecialistLoop({
        targetAgent: 'insight', // insight 无 create_project
        question: '帮我开个新项目',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel(
          [
            { toolName: 'create_project', input: { name: rogueName } },
            { text: '好了。' },
          ],
          seen,
        ),
      });
    } finally {
      sentinel.restore();
    }
    expect(sentinel.calls, '零外呼').toEqual([]);
    expect(run.toolNames, '调用确实发生了（否则断言无意义）').toContain(
      'create_project',
    );
    expect(
      await prisma.project.count({ where: { tenantId, name: rogueName } }),
      '越权工具一旦真被执行，这里就会多一行',
    ).toBe(0);
    expect(seen[0].tools, '模型视野里不该有越权工具').not.toContain(
      'create_project',
    );
  });

  it('子 loop 的 system = 目标人格装配 + 咨询条款，且不含前台专属条款', async () => {
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    try {
      await runSpecialistLoop({
        targetAgent: 'insight',
        question: 'ROI？',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel([{ text: 'x' }], seen),
      });
    } finally {
      sentinel.restore();
    }
    const sys = seen[0].system;
    expect(sys).toContain(getPersona('insight').isolation);
    expect(sys, '缺重读条款').toContain(
      SPECIALIST_SCOPE_CLAUSE.trim().split('\n')[0],
    );
    expect(sys, '前台的转述纪律不该出现在专家 system 里').not.toContain(
      FRONT_DESK_HONESTY_CLAUSE.trim().split('\n')[0],
    );
    expect(sys, '专家不该看见前台独占工具').not.toContain('consult_specialist');
    expect([...seen[0].tools].sort()).toEqual(
      [...getPersona('insight').tools].sort(),
    );
  });

  it('🔒 闸门：子 loop 内 outbound 停 pending，副作用零发生（前台带令牌亦然）', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      await runSpecialistLoop({
        targetAgent: 'insight',
        question: '生成分享链接',
        ctx: { ...frontDeskCtx, confirmationToken: `G1-FAKE-${MARK}` },
        model: scriptedGenerateModel([
          { toolName: 'create_share_link', input: { scope: 'quarterly' } },
          { text: '备好了。' },
        ]),
      });
    } finally {
      sentinel.restore();
    }
    const pending = await prisma.pendingAction.findMany({
      where: { tenantId, toolName: 'create_share_link' },
      select: { status: true, agentId: true },
    });
    expect(pending.length, 'outbound 必须落 pending').toBe(1);
    expect(pending[0].status).toBe('pending');
    // D-1 裁决 A 的连带证据：留痕记的是实际干活的专家，不是前台
    expect(pending[0].agentId).toBe('insight');
    expect(
      await prisma.shareLink.count({ where: { tenantId } }),
      '真实副作用必须零发生',
    ).toBe(0);
  });
});

describe('[G1·F001] 深度守卫（走工具真实路径，不只是直调）', () => {
  it('深度已为 1 时再咨询：不静默——返回 ok=false 且落失败留痕', async () => {
    const res = (await executeTool(
      'consult_specialist',
      { targetAgent: 'insight', question: '再问一层' },
      { ...frontDeskCtx, consultDepth: 1 },
    )) as { output: ConsultSpecialistOutput };
    expect(res.output.ok, '不得假装咨询成功').toBe(false);
    expect(res.output.failureReason).toContain(CONSULT_DEPTH_EXCEEDED_MSG);
    expect(res.output.answer, '失败时不得编造结论').toBe('');
    const logs = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
    });
    expect(logs, '失败必须留痕（否则线上无法归因）').toBeGreaterThan(0);
  });

  it('步数上限读 registry 常量：撞顶步数 = SPECIALIST_MAX_STEPS', async () => {
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runSpecialistLoop({
        targetAgent: 'insight',
        question: 'ROI？',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel(
          Array.from({ length: 12 }, () => ({
            toolName: 'compute_roi',
            input: { projectId },
          })),
        ),
      });
      expect(run.steps).toBe(SPECIALIST_MAX_STEPS);
      expect(run.budgetHit).toBe(true);
    } finally {
      sentinel.restore();
    }
  });
});

describe('[G1·F001] 注入缝：ctx.model 经真实 runAgentLoop 下传到子 loop', () => {
  it('前台 loop 注入 mock → 子 loop 用的是同一个 mock（零外呼、无凭据照样跑通）', async () => {
    const saved = process.env.AIGCGATEWAY_API_KEY;
    delete process.env.AIGCGATEWAY_API_KEY;
    try {
      const res = await runScriptedLoop({
        copilot: {
          route: '/admin/today',
          projectId,
          env: 'default',
          agentId: FRONT_DESK_AGENT_ID,
        },
        prompt: '这个项目 ROI 如何？',
        ctx: frontDeskCtx,
        telemetryWriter: async () => {},
        script: [
          {
            toolCalls: [
              {
                toolName: 'consult_specialist',
                input: { targetAgent: 'insight', question: 'ROI 如何？' },
              },
            ],
          },
          { text: '洞察专家说：证据不足。' },
        ],
        specialistScripts: {
          insight: [{ text: '证据不足，缺转化分子。' }],
        },
      });
      expect(res.networkCalls, '零外呼——回落真 caller 会出网').toEqual([]);
      expect(res.toolNames).toContain('consult_specialist');
      const out = res.toolOutputs.find(
        (o) => o.toolName === 'consult_specialist',
      )?.output as ConsultSpecialistOutput | undefined;
      expect(out?.ok, `子 loop 未跑通：${JSON.stringify(out)}`).toBe(true);
      expect(out?.agentId).toBe('insight');
      expect(out?.answer).toBe('证据不足，缺转化分子。');
      expect(res.toolErrors).toEqual([]);
    } finally {
      if (saved !== undefined) process.env.AIGCGATEWAY_API_KEY = saved;
    }
  });
});

describe('[G1·F002] consult_specialist 契约与前台工具面', () => {
  it('注册形状：internal + native + 无 buildHarm', () => {
    const def = getTool('consult_specialist')!;
    expect(def).toBeDefined();
    expect(def.class).toBe('internal');
    expect(def.source).toBe('native');
    expect(def.buildHarm).toBeUndefined();
  });

  it('仅前台持有 + 前台工具面恰等于枚举清单 + 无 outbound', () => {
    for (const p of listPersonas()) {
      expect(
        p.tools.includes('consult_specialist'),
        `${p.id} 持有情况不符`,
      ).toBe(p.id === FRONT_DESK_AGENT_ID);
    }
    expect([...getPersona(FRONT_DESK_AGENT_ID).tools].sort()).toEqual(
      [
        'confirm_brief_goal',
        'consult_specialist',
        'create_project',
        'handoff_to',
        'propose_plan',
      ].sort(),
    );
    const outbound = getPersona(FRONT_DESK_AGENT_ID).tools.filter(
      (n) => getTool(n)?.class === 'outbound',
    );
    expect(outbound).toEqual([]);
  });

  it('前台文案：duty/isolation 已是受理与综合语义，且 system 段挂了转述纪律', () => {
    const front = getPersona(FRONT_DESK_AGENT_ID);
    expect(front.duty).toContain('受理与综合');
    expect(front.isolation).toContain('可转述不可改写');
    expect(front.systemPrompt).toContain(front.duty);
  });

  it('入参契约：非法专家 / 空问题 / 咨询自己 三条负向', async () => {
    await expect(
      executeTool(
        'consult_specialist',
        { targetAgent: 'nobody', question: 'x' },
        frontDeskCtx,
      ),
    ).rejects.toThrow(/入参校验失败/);
    await expect(
      executeTool(
        'consult_specialist',
        { targetAgent: 'insight', question: '' },
        frontDeskCtx,
      ),
    ).rejects.toThrow(/入参校验失败/);
    await expect(
      executeTool(
        'consult_specialist',
        { targetAgent: FRONT_DESK_AGENT_ID, question: 'x' },
        frontDeskCtx,
      ),
    ).rejects.toThrow(/不能咨询你自己/);
  });

  it('结构化产物：字段齐全 + JSON 往返无损 + 咨询落 Handoff 协作痕迹', async () => {
    const sentinel = installNoNetworkSentinel();
    let out: ConsultSpecialistOutput;
    try {
      const res = (await executeTool(
        'consult_specialist',
        {
          targetAgent: 'match',
          question: '有哪些候选组合？',
          refs: [projectId],
        },
        {
          ...frontDeskCtx,
          model: scriptedGenerateModel([{ text: '三组候选。' }]),
        },
      )) as { output: ConsultSpecialistOutput };
      out = res.output;
    } finally {
      sentinel.restore();
    }
    expect(out.type).toBe('consultation');
    expect(out.ok).toBe(true);
    expect(out.agentId).toBe('match');
    expect(out.answer).toBe('三组候选。');
    expect(out.insufficientEvidence).toBe(false);
    expect(Array.isArray(out.insufficientReasons)).toBe(true);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    const handoffs = await prisma.handoff.findMany({
      where: { tenantId },
      select: { fromAgent: true, toAgent: true },
    });
    expect(
      handoffs.some(
        (h) => h.fromAgent === FRONT_DESK_AGENT_ID && h.toAgent === 'match',
      ),
      'D-5 裁决 A：咨询也落 Handoff 行',
    ).toBe(true);
  });

  it('前台的 ToolSet 是并集（因持有 handoff_to）——专家工具在执行侧被硬挡', async () => {
    // 【为什么这条不能省】F002 的枚举断言只证明 registry 里前台没有专家工具；
    // 但真实 loop 里前台的 ToolSet 是**全人格并集**（handoff_to 需要），
    // 只有执行侧 isToolActive 拦得住。前台直接调 create_share_link 若被执行，
    // 库里会多一行 PendingAction —— 本断言据此翻红。
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    const res = await runScriptedLoop({
      copilot: {
        route: '/admin/today',
        projectId,
        env: 'default',
        agentId: FRONT_DESK_AGENT_ID,
      },
      prompt: '直接给我生成分享链接',
      ctx: frontDeskCtx,
      telemetryWriter: async () => {},
      script: [
        {
          toolCalls: [
            {
              toolName: 'create_share_link',
              input: { projectId, scope: 'quarterly' },
            },
          ],
        },
        { text: '我不能亲自做这件事。' },
      ],
    });
    expect(res.networkCalls).toEqual([]);
    expect(res.toolNames, '调用确实发生了').toContain('create_share_link');
    expect(
      res.toolErrors.map((e) => e.error).join('|'),
      '必须是明示拒绝，不是静默吞',
    ).toMatch(/不在当值人格的工具子集内|NoSuchToolError|unavailable tool/);
    expect(
      await prisma.pendingAction.count({ where: { tenantId } }),
      '前台越权执行专家 outbound 工具 = 红线击穿',
    ).toBe(before);
  });

  it('registry 是成本常量的单一真相源（数字不散落）', () => {
    expect(MAX_CONSULTS_PER_TURN).toBeGreaterThan(0);
    expect(SPECIALIST_MAX_STEPS).toBeGreaterThan(0);
  });
});
