// AGENT-FOUNDATION F006 — 多 Agent 编排框架 smoke（最小跑通验证）
//
// 证明框架每个接口都通（如 hello-agent 证明单 agent 闭环）：
// (1) registry 7 人格；≥2 真实人格按 route 切换，各自工具子集不同
// (2) 一次 handoff：信封创建 → 落 F002 Handoff 表 → 接收方按 id 重读（+ 重读指令）
// (3) orchestrator 环节路由到「某项目某环节」 + pending 聚合原样不改写
//
// 运行：npm run orch:smoke  退出码：0=全绿 / 1=任一失败。

import {
  listPersonas,
  getPersona,
  personaBoundary,
  ALL_AGENT_IDS,
} from '../../src/lib/agent/registry';
import {
  selectPersona,
  personaToolSubset,
  defaultAgentForRoute,
  buildContextKey,
  parseContextKey,
} from '../../src/lib/agent/persona-router';
import { createHandoff, receiveHandoff } from '../../src/lib/agent/handoff';
import {
  routeToStage,
  parseOrchestratorDirective,
  aggregatePending,
} from '../../src/lib/agent/orchestrator';
import { registerTool } from '../../src/lib/agent/tools/registry';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { buildToolContext } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function main(): Promise<void> {
  console.log('[orch-smoke] 多 Agent 编排框架验证开始');
  getNativeToolNames(); // 触发 native 工具注册

  // ── (1) registry 7 人格 + 人格按 route 切换，工具子集不同 ──
  assert(
    listPersonas().length === 7,
    `registry 声明 7 人格（${ALL_AGENT_IDS.join('/')}）`,
  );
  assert(
    ALL_AGENT_IDS.every((id) => {
      const p = getPersona(id);
      return !!p.systemPrompt && !!p.duty && !!p.isolation;
    }),
    '每人格含 system prompt + duty + 否定式护栏',
  );

  const matchCtx = {
    route: '/admin/creators',
    projectId: null,
    env: 'default' as const,
    agentId: defaultAgentForRoute('/admin/creators'),
  };
  const strategyCtx = {
    route: '/admin/knowledge',
    projectId: null,
    env: 'default' as const,
    agentId: defaultAgentForRoute('/admin/knowledge'),
  };
  assert(matchCtx.agentId === 'match', 'route /admin/creators → match 人格');
  assert(
    strategyCtx.agentId === 'strategy',
    'route /admin/knowledge → strategy 人格',
  );
  // 回归（F007 fix-round-1）：/admin/outreach 曾因 '/reach' 子串不匹配误配 orchestrator，现须为 reach。
  assert(
    defaultAgentForRoute('/admin/outreach') === 'reach',
    'route /admin/outreach → reach 人格（回归：修子串误配）',
  );
  assert(
    defaultAgentForRoute('/admin/project/x/reach') === 'reach',
    'route .../reach 环节 → reach 人格',
  );

  const matchPersona = selectPersona(matchCtx);
  const strategyPersona = selectPersona(strategyCtx);
  const matchTools = personaToolSubset(matchPersona);
  const strategyTools = personaToolSubset(strategyPersona);
  console.log(
    `  · match 工具子集: [${matchTools}]  strategy 工具子集: [${strategyTools}]`,
  );
  assert(
    matchTools.includes('search_kols'),
    'match 人格工具子集含 search_kols',
  );
  assert(
    !strategyTools.includes('search_kols'),
    'strategy 人格工具子集**不含** search_kols（子集不同）',
  );
  assert(
    JSON.stringify(matchTools) !== JSON.stringify(strategyTools),
    '两人格工具子集确实不同',
  );

  // context key 往返
  const key = buildContextKey(matchCtx);
  const parsed = parseContextKey(key);
  assert(
    parsed.agentId === 'match' && parsed.route === '/admin/creators',
    `context key 往返一致（${key}）`,
  );

  // 否定式护栏可取（F007 用）
  const boundary = personaBoundary('reach');
  assert(
    !!boundary && boundary.isolation.includes('不'),
    'personaBoundary 返回否定式护栏',
  );

  // ── (2) 一次 handoff：创建 → 落表 → 接收方重读 ──
  const ctx = await buildToolContext({ agentId: 'match' });
  const projectId = `__orch_smoke_proj_${Date.now()}`;
  const created = await createHandoff(ctx, {
    projectId,
    fromAgent: 'match',
    toAgent: 'reach',
    artifactType: 'match_plan',
    artifactRef: `match_plan:${projectId}`,
    summary:
      '匹配 Agent 交接：3 位候选，预估触达成本 $X（此摘要仅审计，接收方须重读）',
    messages: [
      { role: 'agent', content: '已完成候选筛查，交接给触达 Agent 起草邀约' },
    ],
  });
  assert(
    !!created.id,
    `handoff 创建并落 F002 Handoff 表（id=${created.id.slice(0, 8)}…）`,
  );

  const dbRow = await prisma.handoff.findUnique({ where: { id: created.id } });
  assert(
    dbRow?.fromAgent === 'match' && dbRow?.toAgent === 'reach',
    'Handoff 表实测 fromAgent=match/toAgent=reach（§5.4 信封落盘）',
  );

  const received = await receiveHandoff(ctx, created.id, 'reach');
  assert(
    received.envelope.artifactRef === `match_plan:${projectId}`,
    '接收方读到 artifactRef',
  );
  assert(
    received.mustRereadBy === 'reach' &&
      received.rereadRef === received.envelope.artifactRef,
    '接收方获得重读指令（按自身 scope 重读，不信任 summary 结论）',
  );

  // 接收者不匹配应抛（防串扰）
  let mismatchThrew = false;
  try {
    await receiveHandoff(ctx, created.id, 'delivery');
  } catch {
    mismatchThrew = true;
  }
  assert(mismatchThrew, '错误接收者（delivery 接收 reach 的 handoff）被拒');

  // ── (3) orchestrator 环节路由 + pending 聚合 ──
  const target = routeToStage(projectId, 'match');
  assert(
    target.agentId === 'match' &&
      target.stage === 'match' &&
      target.route === `/admin/campaigns/${projectId}`,
    'orchestrator 路由到「某项目某环节」（match）→ 目标 context 正确（route=/admin/campaigns/[id] + stage/agent=match）',
  );
  const dir = parseOrchestratorDirective(`enter:${projectId}:reach`);
  assert(
    dir?.agentId === 'reach' && dir?.stage === 'reach',
    'orchestrator 指令 enter:<proj>:reach → reach 环节',
  );

  // pending 聚合原样：插一条 PendingAction，聚合返回且 harm 不被改写
  const harm = { action: 'send_outreach', irreversible: true, count: 12 };
  const pa = await prisma.pendingAction.create({
    data: {
      tenantId: ctx.tenantId,
      kind: 'gate',
      toolName: 'send_outreach',
      payloadHash: 'h',
      harmJson: harm,
      status: 'pending',
    },
  });
  try {
    const pending = await aggregatePending(ctx);
    const mine = pending.find((p) => p.id === pa.id);
    assert(!!mine, 'aggregatePending 聚合到待拍板项');
    // 按字段值比较（JSONB 存储会重排 key 顺序，故不用 stringify）——验值未被软化/改写。
    const h = mine!.harm as {
      action?: string;
      irreversible?: boolean;
      count?: number;
    };
    assert(
      h.action === harm.action &&
        h.irreversible === harm.irreversible &&
        h.count === harm.count,
      'pending 的 harm 原值原样返回（编排不改写/软化专家结论）',
    );
  } finally {
    await prisma.pendingAction.delete({ where: { id: pa.id } });
    await prisma.handoff.delete({ where: { id: created.id } });
  }

  console.log('[orch-smoke] ✅ 全部断言通过');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[orch-smoke] ❌ 失败：',
      err instanceof Error ? err.stack ?? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
