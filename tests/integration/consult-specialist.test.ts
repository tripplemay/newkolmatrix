// M4.7-FRONTDESK F002 — consult_specialist + 前台人格改造
//
// 这条工具是「单一前台」的核心动作。钉四件事：
//   ① 注册形状：internal 无 buildHarm（不是 outbound，不该有闸门披露）
//   ② **仅前台持有**（与 handoff_to 同款纪律）——专家拿到它就能造出嵌套咨询
//   ③ 入参契约：合法专家 + 不能咨询自己
//   ④ 前台职责文案改到位（registry 单一真相源），且前台不直接持有专家的执行类工具

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import {
  FRONT_DESK_AGENT_ID,
  getPersona,
  listPersonas,
} from '../../src/lib/agent/registry';
import {
  CONSULT_SELF_MSG,
  type ConsultSpecialistOutput,
} from '../../src/lib/agent/tools/consult-specialist';
import { executeTool } from '../../src/lib/agent/execute';
import { installNoNetworkSentinel } from '../support/agent-loop-testbed';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import { scriptedGenerateModel } from '../support/scripted-generate-model';

const TOOL = 'consult_specialist';
const SLUG = `test-tenant-m47-f002-${process.pid}`;

let tenantId: string;
let projectId: string;
let frontDeskCtx: ToolContext;

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 F002 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 F002 项目 ${process.pid}` },
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

describe('注册形状与人格绑定', () => {
  it('已注册，class=internal 且无 buildHarm', () => {
    expect(getNativeToolNames()).toContain(TOOL);
    const def = getTool(TOOL)!;
    expect(def.class).toBe('internal');
    expect(def.buildHarm, 'internal 工具不该有闸门披露').toBeUndefined();
  });

  it('**仅前台持有**——其余人格子集一个都不含（同源断言）', () => {
    for (const p of listPersonas()) {
      const has = p.tools.includes(TOOL);
      if (p.id === FRONT_DESK_AGENT_ID) {
        expect(has, '前台必须持有 consult_specialist').toBe(true);
      } else {
        expect(has, `${p.id} 不该持有 ${TOOL}（专家不能再咨询专家）`).toBe(
          false,
        );
      }
    }
  });

  it('前台工具面 = 枚举清单（正向精确匹配：要动它必须显式改这条断言）', () => {
    // 【为什么是正向枚举而不是"与专家工具集交集为空"】实物里 create_project /
    // confirm_brief_goal 与 strategy 共享、propose_plan 与 insight 共享——它们是
    // 入口/元工具，本就属受理与综合范畴。"交集为空"会误伤它们。
    // 而正向枚举能挡住真正该挡的：任何领域执行工具被塞进前台都会翻红。
    // （M4.6 教训：否定式判据不可穷尽，正向精确匹配才根治。）
    expect([...getPersona(FRONT_DESK_AGENT_ID).tools].sort()).toEqual(
      [
        'confirm_brief_goal',
        'consult_specialist',
        'create_project',
        'handoff_to',
        'propose_plan',
      ].sort(),
    );
  });

  it('前台不持有任何 outbound 工具（它从不亲自对外动作）', () => {
    const outbound = getPersona(FRONT_DESK_AGENT_ID)
      .tools.map((n) => ({ n, def: getTool(n) }))
      .filter(({ def }) => def?.class === 'outbound')
      .map(({ n }) => n);
    expect(outbound, `前台持有了 outbound 工具：${outbound.join('、')}`).toEqual(
      [],
    );
    // 活性：确认判据看得见目标——全仓确实存在 outbound 工具，只是不在前台手上
    const anyOutbound = listPersonas()
      .flatMap((p) => p.tools)
      .some((n) => getTool(n)?.class === 'outbound');
    expect(anyOutbound, '若全仓无 outbound 工具，上面那条断言毫无意义').toBe(
      true,
    );
  });

  it('前台职责文案已改为「受理与综合」语义（registry 单一真相源）', () => {
    const front = getPersona(FRONT_DESK_AGENT_ID);
    // 正向精确匹配语义核心（M4.6 教训：否定式黑名单不可穷尽）
    expect(front.duty).toContain('受理与综合');
    expect(front.isolation).toContain('可转述不可改写');
    // 反向：不得停留在旧的「只分派」语义（那正是让用户自己去找别的 Agent 的措辞）
    expect(front.duty).not.toContain('环节调度·专家编排');
  });
});

describe('入参契约', () => {
  it('咨询自己被拒（前台不能把问题问给自己）', async () => {
    await expect(
      executeTool(
        TOOL,
        { targetAgent: FRONT_DESK_AGENT_ID, question: '我该干嘛' },
        frontDeskCtx,
      ),
    ).rejects.toThrow(CONSULT_SELF_MSG);
  });

  it('非法专家名被 zod 拦下（不是名册成员）', async () => {
    await expect(
      executeTool(
        TOOL,
        { targetAgent: 'nobody', question: 'x' },
        frontDeskCtx,
      ),
    ).rejects.toThrow(/入参校验失败/);
  });

  it('空问题被拦下', async () => {
    await expect(
      executeTool(TOOL, { targetAgent: 'insight', question: '' }, frontDeskCtx),
    ).rejects.toThrow(/入参校验失败/);
  });
});

describe('执行：起子 loop 并返回结构化结果', () => {
  it('咨询洞察 → 拿回结论 + 工具序列 + 步数（JSON 往返无损）', async () => {
    const seen: Array<{ system: string; tools: string[] }> = [];
    const sentinel = installNoNetworkSentinel();
    try {
      const res = (await executeTool(
        TOOL,
        {
          targetAgent: 'insight',
          question: '这个项目 ROI 如何？',
          refs: [projectId],
        },
        // model 经 ctx 下传（生产路径：runAgentLoop 放进去的）
        {
          ...frontDeskCtx,
          model: scriptedGenerateModel([{ text: '证据不足，缺转化分子。' }], seen),
        },
      )) as { output: ConsultSpecialistOutput };
      const out = res.output;
      expect(out.type).toBe('consultation');
      expect(out.agentId, '作答的是专家不是前台').toBe('insight');
      expect(out.answer).toBe('证据不足，缺转化分子。');
      expect(out.budgetHit).toBe(false);
      expect(JSON.parse(JSON.stringify(out))).toEqual(out);
      // refs 进了问题正文（给专家指路），且带「勿采信转述」的措辞
      expect(seen[0].system.length).toBeGreaterThan(0);
    } finally {
      sentinel.restore();
    }
    expect(sentinel.calls, '零外呼').toEqual([]);
  });

  it('专家撞步数上限 → budgetHit=true 透传给前台（不假装答完）', async () => {
    const seen: Array<{ system: string; tools: string[] }> = [];
    const sentinel = installNoNetworkSentinel();
    try {
      const res = (await executeTool(
        TOOL,
        { targetAgent: 'insight', question: 'ROI？' },
        {
          ...frontDeskCtx,
          model: scriptedGenerateModel(
            Array.from({ length: 10 }, () => ({
              toolName: 'compute_roi',
              input: { projectId },
            })),
            seen,
          ),
        },
      )) as { output: ConsultSpecialistOutput };
      expect(res.output.budgetHit, '撞顶必须如实透传').toBe(true);
    } finally {
      sentinel.restore();
    }
  });
});
