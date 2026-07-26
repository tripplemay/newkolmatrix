// M4.7-FRONTDESK 验收（G4，隔离 Evaluator）— F008 / F009 独立取证探针
//
// 本文件补的是**批次交付物里缺的那几条断言**，而不是复述已有测试：
//   ① F008 acceptance「面板顶部身份不随**咨询**变」——批内无任何断言覆盖；
//      咨询走的是 tool part 不是 persona_switch，所以「不换人」这件事必须显式钉住，
//      否则将来谁在 consult_specialist 里顺手发一条 persona_switch，界面就又开始换头，
//      而全套测试全绿。
//   ② F008 acceptance「**无咨询会话行为零变化**（回归断言）」——批内无覆盖。
//      M4.5 有「无接力零变化」（handoff-loop.test.ts:349），本批没有对应物。
//   ③ F009 acceptance「软引用表逐表清 + **逐表断言残留**」——`frontdesk-e2e.ts` 只做了
//      逐表清，没有断言。变异实测（删掉 Handoff 清理步骤）脚本仍 exit 0 并留下 2 行
//      孤儿 Handoff。这里把「跑完逐表归零」写成可执行断言。
//   ④ F009 测试床嵌套：两位专家必须各拿各的脚本（按可见工具集辨认，非 duty）。
//
// 纪律：夹具租户带 `g4` + process.pid 唯一前缀；afterAll 逐表清 + **逐表断言残留**
//（`OperationLog` / `Handoff` 对 `Tenant` 软引用无 FK，删租户不级联）。零外呼（fetch 哨兵）。
// 不修改任何产品代码。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { FRONT_DESK_AGENT_ID } from '../../src/lib/agent/registry';
import {
  activeAgentFromMessages,
  PERSONA_SWITCH_PART,
} from '../../src/components/copilot/CopilotPanel';
import { runScriptedLoop } from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const TAG = `g4-${process.pid}`;
const SLUG = `test-tenant-m47-${TAG}`;

let tenantId: string;
let projectId: string;
let ctx: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 G4 夹具 ${TAG}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 G4 项目 ${TAG}` },
  });
  projectId = p.id;
  ctx = {
    tenantId,
    agentId: FRONT_DESK_AGENT_ID,
    projectId,
    env: 'default',
  };
});

afterAll(async () => {
  // 逐表清（软引用表不级联，删租户不会带走它们）
  await prisma.handoff.deleteMany({ where: { tenantId } });
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.shareLink.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  // 逐表断言残留（只断言 tenant = 假信心，M4.6 D3 教训）
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
});

/**
 * 测试床的 copilot 入参。
 *
 * 【实测记录，写在这里免得下一个人再踩】`runAgentLoop` 是**装配层**，它照旧
 * `selectPersona(copilot)` → 采信 `copilot.agentId`；「受理人格恒为前台」的强制点
 * 在 **route 层**（`route.ts:resolveContext()` 硬写 `FRONT_DESK_AGENT_ID`）。
 * 我先按 `agentId:'match'` 驱动测试床，拿到的 persona 就是 match（工具里没有
 * `consult_specialist`，整条咨询链根本起不来）——所以测试床里传前台 id 是**必需**的，
 * 而不是「刻意传环节人格来证明服务层不采信」。frontdesk-e2e 的 🔑 断言正是这个形状。
 */
const copilot = (stage: string | null) => ({
  route: `/admin/campaigns/${projectId}`,
  projectId,
  env: 'default' as const,
  agentId: FRONT_DESK_AGENT_ID,
  stage,
});

describe('[G4] 受理人格的强制点在 route 层（层次事实，取证记录）', () => {
  it('route.resolveContext 硬写前台 id，且不再消费 defaultAgentForRoute/STAGE_AGENT', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/app/api/agent/route.ts', 'utf8');
    const fn = src.slice(
      src.indexOf('function resolveContext'),
      src.indexOf('export async function POST'),
    );
    expect(fn, '取证器切片为空 = 结构变更须同步本测试').not.toBe('');
    expect(fn, 'resolveContext 必须硬写前台 id').toContain(
      'agentId: FRONT_DESK_AGENT_ID',
    );
    expect(fn, 'resolveContext 不得再由 route 推导人格').not.toMatch(
      /defaultAgentForRoute\(|STAGE_AGENT\[/,
    );
  });
});

describe('[G4] F008 — 身份不随咨询变（批内缺的负向断言）', () => {
  it('前台咨询 2 位专家：全程零 persona_switch，当值人格恒为前台', async () => {
    const run = await runScriptedLoop({
      copilot: copilot('match'),
      ctx,
      prompt: '帮我看看该推进什么，顺带说下 ROI',
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
        { text: '综合两位专家的结论如上。' },
      ],
      specialistScripts: {
        match: [{ text: 'B 组重合度最高。' }],
        insight: [{ text: '本期分子无回传源，ROI 算不出来。' }],
      },
    });

    expect(run.networkCalls, '零外呼').toEqual([]);
    expect(run.loop.persona.id, '受理人格恒为前台').toBe(FRONT_DESK_AGENT_ID);
    // 🔒 咨询 ≠ 换人：不得往流里写 persona_switch
    expect(
      run.personaSwitches,
      '咨询发生了 persona_switch —— 面板会换头，单一前台被破坏',
    ).toEqual([]);
    // UI 侧同源推论：无 persona_switch part → 当值人格回落前台
    const msgs = [
      { parts: [{ type: 'text', text: '综合两位专家的结论如上。' }] },
    ];
    expect(activeAgentFromMessages(msgs, FRONT_DESK_AGENT_ID)).toBe(
      FRONT_DESK_AGENT_ID,
    );
    expect(
      JSON.stringify(msgs).includes(PERSONA_SWITCH_PART),
      '咨询产物里不应含人格切换事件',
    ).toBe(false);
    // 两次咨询各落一行协作痕迹（F008 D-5 的统一数据源）
    const rows = await prisma.handoff.findMany({ where: { tenantId } });
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.fromAgent).toBe(FRONT_DESK_AGENT_ID);
      expect(['match', 'insight']).toContain(r.toAgent);
      expect(r.summary ?? '').not.toBe('');
      expect(r.artifactRef ?? '').not.toBe('');
    }
  });
});

describe('[G4] F008 — 无咨询会话行为零变化（批内缺的回归断言）', () => {
  it('不咨询的会话：零 Handoff、零 consultation 产物、零 persona_switch', async () => {
    const handoffBefore = await prisma.handoff.count({ where: { tenantId } });
    const run = await runScriptedLoop({
      copilot: copilot(null),
      ctx,
      prompt: '给我起一个计划',
      script: [
        {
          toolCalls: [
            {
              toolName: 'propose_plan',
              input: {
                title: 'G4 计划',
                items: [
                  {
                    what: '看看组合',
                    why: '还没定',
                    toolName: 'match_plan',
                    needsGate: false,
                  },
                ],
              },
            },
          ],
        },
        { text: '计划如上，等你认可。' },
      ],
    });

    expect(run.networkCalls).toEqual([]);
    expect(run.personaSwitches).toEqual([]);
    expect(
      run.toolNames.includes('consult_specialist'),
      '本会话不该发生咨询',
    ).toBe(false);
    expect(
      run.toolOutputs.some(
        (o) => (o.output as { type?: string } | null)?.type === 'consultation',
      ),
      '无咨询会话不得凭空出现咨询产物',
    ).toBe(false);
    expect(
      await prisma.handoff.count({ where: { tenantId } }),
      '无咨询会话不得新增协作痕迹行',
    ).toBe(handoffBefore);
    const tele = (await run.loop.telemetry) as {
      consultCount?: number;
    } | null;
    expect(tele, '会话仍落一行遥测（行为零变化）').not.toBeNull();
    expect(tele?.consultCount ?? 0, '无咨询会话的 consultCount 必须是 0').toBe(
      0,
    );
  });
});

describe('[G4] F009 — 测试床嵌套脚本按人格分发（不串脚本）', () => {
  it('两位专家各拿各的脚本（辨认依据 = 可见工具集，不是 duty）', async () => {
    const run = await runScriptedLoop({
      copilot: copilot('insight'),
      ctx,
      prompt: '两位专家分别说说',
      script: [
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'match', question: 'A?' },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'insight', question: 'B?' },
            },
          ],
        },
        { text: '综合完毕。' },
      ],
      specialistScripts: {
        match: [{ text: 'G4-匹配专家的回答' }],
        insight: [{ text: 'G4-洞察专家的回答' }],
      },
    });
    const outs = run.toolOutputs
      .filter((o) => o.toolName === 'consult_specialist')
      .map((o) => o.output as { agentId: string; answer: string; ok: boolean });
    expect(outs.length).toBe(2);
    expect(outs.map((o) => o.agentId)).toEqual(['match', 'insight']);
    expect(outs.every((o) => o.ok)).toBe(true);
    // 串脚本的症状：两次子 loop 拿到同一份答案
    expect(outs[0].answer).toContain('G4-匹配专家的回答');
    expect(outs[1].answer).toContain('G4-洞察专家的回答');
    expect(outs[0].answer).not.toBe(outs[1].answer);
  });
});
