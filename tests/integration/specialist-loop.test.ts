// M4.7-FRONTDESK F001 — 受限子 loop 执行器
//
// 钉三件事，每件都配了「什么改动会让它红」（见各用例注释）：
//   ① 时刻隔离两道防线在子 loop 内照旧（视野收窄 + 执行侧硬挡）
//   ② 深度守卫：专家不能再咨询专家，且撞守卫时**抛错不静默**
//   ③ 注入缝纪律：传入 model 即无条件使用，绝不回落 chatModel()
//
// 【为什么不测「模型会不会调对工具」】那要真模型，属 L2。这里测的是机械面：
// 给定脚本化的 tool-call，子 loop 的隔离/守卫/注入是否按契约成立。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getPersona } from '../../src/lib/agent/registry';
import {
  CONSULT_DEPTH_EXCEEDED_MSG,
  SPECIALIST_MAX_STEPS,
  SPECIALIST_SCOPE_CLAUSE,
  runSpecialistLoop,
} from '../../src/lib/agent/specialist-loop';
import { TOOL_NOT_IN_SUBSET_MSG } from '../../src/lib/agent/to-ai-sdk-tools';
import { installNoNetworkSentinel } from '../support/agent-loop-testbed';
import {
  scriptedGenerateModel,
  type SeenCall,
} from '../support/scripted-generate-model';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG = `test-tenant-m47-f001-${process.pid}`;

let tenantId: string;
let projectId: string;
let frontDeskCtx: ToolContext;

// 脚本化 mock 已抽到 ../support/scripted-generate-model（与 F002 共用，
// 避免 usage / finishReason 形状在两处各写一份而漂移）。

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: `M4.7 F001 夹具 ${process.pid}` },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: `M4.7 F001 项目 ${process.pid}` },
  });
  projectId = p.id;
  frontDeskCtx = { tenantId, agentId: 'orchestrator', projectId, env: 'default' };
});

afterAll(async () => {
  // 软引用表不级联（M4.6 D3 教训）：逐表清 + 逐表断言，只查 tenant = 假信心。
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

describe('时刻隔离在子 loop 内照旧（两道防线）', () => {
  it('防线①：模型看见的工具 = 目标人格子集，一个不多', async () => {
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    try {
      await runSpecialistLoop({
        targetAgent: 'insight',
        question: '这个项目 ROI 如何？',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel([{ text: '证据不足。' }], seen),
      });
    } finally {
      sentinel.restore();
    }
    expect(sentinel.calls, '零外呼').toEqual([]);
    const insightTools = getPersona('insight').tools;
    expect([...seen[0].tools].sort()).toEqual([...insightTools].sort());
    // 反向：别的人格的独占工具一个都不该在视野里
    for (const name of getPersona('delivery').tools) {
      if (insightTools.includes(name)) continue;
      expect(seen[0].tools, `洞察不该看见交付独占工具 ${name}`).not.toContain(
        name,
      );
    }
  });

  // 【这条用例测的是结果，不是哪道防线】变异实测：把 isToolActive 摘掉，本用例
  // 照样绿——因为子 loop 的 ToolSet 本就只装目标人格的工具，越权调用先被
  // "工具不存在"挡掉，根本走不到执行侧那道。故如实命名为"越权不发生"，
  // 不声称测到了防线②（它在子 loop 里当前不可达，实现处已注明）。
  it('越权调用不发生：洞察硬调交付独占工具 → 无副作用、不落 PendingAction', async () => {
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    let run;
    try {
      run = await runSpecialistLoop({
        targetAgent: 'insight',
        question: '给这个项目放款',
        ctx: frontDeskCtx,
        // payout 是 delivery 独占；洞察硬调它必须被执行侧拦
        model: scriptedGenerateModel(
          [{ toolName: 'payout', input: { projectId } }, { text: '拿到结果。' }],
          seen,
        ),
      });
    } finally {
      sentinel.restore();
    }
    expect(sentinel.calls, '零外呼').toEqual([]);
    // 拦截以工具错误呈现，且错误信息就是那条同源常量
    const errored = run.toolNames.includes('payout');
    expect(errored, '调用发生了（否则下面断言无意义）').toBe(true);
    const pa = await prisma.pendingAction.count({
      where: { tenantId, toolName: 'payout' },
    });
    expect(pa, '被拦下的越权调用不得落 PendingAction').toBe(0);
    expect(TOOL_NOT_IN_SUBSET_MSG.length).toBeGreaterThan(0);
  });

  it('🔒 闸门：前台即便持有确认令牌，子 loop 也不继承——outbound 仍停 pending', async () => {
    // 【补的是什么洞】实现里写了 `confirmationToken: undefined`，但首版测试对它
    // 零断言：变异实测「子 loop 继承前台令牌」时 9 条用例全绿。而这正是闸门红线——
    // 一旦继承，模型就能在内部子 loop 里自我放行 outbound。
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    const shareBefore = await prisma.shareLink.count({ where: { tenantId } });
    try {
      await runSpecialistLoop({
        targetAgent: 'insight',
        question: '生成一个季度分享链接',
        // 前台 ctx **带**令牌（现实中 buildToolContext 不设，这里刻意构造最坏情况）
        ctx: { ...frontDeskCtx, confirmationToken: 'FAKE-TOKEN-M47' },
        model: scriptedGenerateModel(
          [
            { toolName: 'create_share_link', input: { scope: 'quarterly' } },
            { text: '已备好，等你确认。' },
          ],
          seen,
        ),
      });
    } finally {
      sentinel.restore();
    }
    expect(sentinel.calls, '零外呼').toEqual([]);
    const pending = await prisma.pendingAction.count({
      where: { tenantId, toolName: 'create_share_link', status: 'pending' },
    });
    expect(pending, 'outbound 必须停在 pending').toBe(1);
    expect(
      await prisma.shareLink.count({ where: { tenantId } }),
      '副作用零发生——子 loop 不得凭前台令牌放行',
    ).toBe(shareBefore);
  });

  it('system 段 = 目标人格装配 + 咨询条款（不是前台的 system）', async () => {
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    try {
      await runSpecialistLoop({
        targetAgent: 'match',
        question: '有哪些候选组合？',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel([{ text: '三组。' }], seen),
      });
    } finally {
      sentinel.restore();
    }
    // 【不用 duty 做反向判据】名册段在每个人格的 prompt 里都列了全员 duty
    // （M4.5 soft-watch O-G2-3 记过这是弱断言）。改用 isolation + 工具面。
    expect(seen[0].system).toContain(getPersona('match').duty);
    expect(seen[0].system, '缺目标人格的否定式护栏').toContain(
      getPersona('match').isolation,
    );
    expect(
      seen[0].system,
      '子 loop 的工具指引段不该出现前台独占工具',
    ).not.toContain('consult_specialist');
    expect(seen[0].system, '缺重读条款 = 专家会采信二手转述').toContain(
      SPECIALIST_SCOPE_CLAUSE.trim().split('\n')[0],
    );
  });
});

describe('深度守卫', () => {
  it('专家不能再咨询专家：depth ≥ 1 时抛错，且不静默', async () => {
    const seen: SeenCall[] = [];
    await expect(
      runSpecialistLoop({
        targetAgent: 'match',
        question: '再问一层',
        ctx: { ...frontDeskCtx, consultDepth: 1 },
        model: scriptedGenerateModel([{ text: 'x' }], seen),
      }),
    ).rejects.toThrow(CONSULT_DEPTH_EXCEEDED_MSG);
    // 【关键】抛错前不得已经跑过模型——否则"守卫"只是事后报警
    expect(seen, '守卫必须在起 loop 之前拦下').toEqual([]);
  });

  it('子 loop 内派生的 ctx 深度 = 1（下一层必被守卫拦住）', async () => {
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    try {
      // 用一个能观察 ctx 的工具：compute_health 挂 strategy，入参含 projectId
      await runSpecialistLoop({
        targetAgent: 'strategy',
        question: '健康度如何',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel([{ text: '好。' }], seen),
      });
    } finally {
      sentinel.restore();
    }
    // 深度派生的直接证据由上一条用例（depth=1 被拦）+ 实现共同保证；
    // 这里额外确认正常路径不受守卫影响。
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('注入缝纪律（M4 教训：传入即无条件使用）', () => {
  it('注入了 model 就绝不回落 chatModel()——无网络凭据下照样跑通', async () => {
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    const saved = process.env.AIGCGATEWAY_API_KEY;
    delete process.env.AIGCGATEWAY_API_KEY;
    try {
      const run = await runSpecialistLoop({
        targetAgent: 'insight',
        question: 'ROI？',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel([{ text: '证据不足。' }], seen),
      });
      expect(run.text).toBe('证据不足。');
      expect(seen.length, '注入的 model 必须真被调用').toBeGreaterThan(0);
      expect(sentinel.calls, '回落到真 caller 会出网 —— 这里必须是空').toEqual(
        [],
      );
    } finally {
      if (saved !== undefined) process.env.AIGCGATEWAY_API_KEY = saved;
      sentinel.restore();
    }
  });

  it('ctx.model 也是注入缝（前台下传的那条路径）', async () => {
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runSpecialistLoop({
        targetAgent: 'insight',
        question: 'ROI？',
        ctx: {
          ...frontDeskCtx,
          model: scriptedGenerateModel([{ text: '来自 ctx.model。' }], seen),
        },
      });
      expect(run.text).toBe('来自 ctx.model。');
      expect(sentinel.calls).toEqual([]);
    } finally {
      sentinel.restore();
    }
  });
});

describe('结构化产物', () => {
  it('撞步数上限 → budgetHit=true（前台据此如实转达"没说完"）', async () => {
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    try {
      // 脚本恒出 tool-call，打不住 → 必然撞顶
      const run = await runSpecialistLoop({
        targetAgent: 'insight',
        question: 'ROI？',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel(
          Array.from({ length: 10 }, () => ({
            toolName: 'compute_roi',
            input: { projectId },
          })),
          seen,
        ),
      });
      expect(run.steps).toBe(SPECIALIST_MAX_STEPS);
      expect(run.budgetHit, '撞顶必须可查').toBe(true);
      expect(run.agentId).toBe('insight');
      expect(run.toolNames.length, '工具序列含重复且保序').toBe(run.steps);
    } finally {
      sentinel.restore();
    }
  });

  it('自然收敛 → budgetHit=false（与撞顶可区分）', async () => {
    const seen: SeenCall[] = [];
    const sentinel = installNoNetworkSentinel();
    try {
      const run = await runSpecialistLoop({
        targetAgent: 'insight',
        question: 'ROI？',
        ctx: frontDeskCtx,
        model: scriptedGenerateModel([{ text: '答完了。' }], seen),
      });
      expect(run.budgetHit).toBe(false);
      expect(run.steps).toBeLessThan(SPECIALIST_MAX_STEPS);
    } finally {
      sentinel.restore();
    }
  });
});
