// M4.5-AGENT-LOOP F010 — agent 循环放开面 E2E 闭环
//
// 链路（全程 mock LanguageModel 驱动**真** loop：真 executeTool / 真闸门 / 真人格子集）：
//   ① 编排会话：propose_plan 计划留痕 → handoff_to 接力洞察（子集切换 + **越权负向断言**）
//      → compute_roi_portfolio 组合追问（证据不足如实）→ 收尾
//      → 遥测落行（personaSwitches=1 / finalAgentId=insight）
//   ② 洞察会话：连备 2 件 outbound → **pending 停驻，副作用零发生**
//   ③ 批量确认：逐项 confirm + execute（**无批量端点**）→ 副作用逐个发生 + irrev 留痕齐
//
// 【零外呼】模型是 mock；测试床全程装 fetch 哨兵（任何出网即失败）。
// 【零真实副作用】outbound 只有 create_share_link，本批恒走 mock ShareLinkService
//（publicUrl 恒 null / mocked 恒 true / SHARE_CREATED_MARKER 留痕），无真实公开暴露分支。
//
// 运行：npm run agentloop:e2e   退出码：0=全绿 / 1=任一失败。

import { buildToolContext } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getPersona } from '../../src/lib/agent/registry';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { confirmAndExecuteSequentially } from '../../src/lib/gate/batch-confirm';
import type { BatchPost } from '../../src/lib/gate/batch-confirm';
import { toPendingBatchItems } from '../../src/lib/gate/pending-items';
import { aggregatePending } from '../../src/lib/agent/orchestrator';
import { LOOP_TELEMETRY_MARKER } from '../../src/lib/agent/loop-telemetry';
import { PLAN_PROPOSED_MARKER } from '../../src/lib/agent/tools/propose-plan';
import { acknowledgePlan } from '../../src/lib/agent/plan-ack';
import { SHARE_CREATED_MARKER } from '../../src/lib/ops/share';
import { runScriptedLoop } from '../../tests/support/agent-loop-testbed';
import { TOOL_NOT_IN_SUBSET_MSG } from '../../src/lib/agent/to-ai-sdk-tools';
import type { ToolContext } from '../../src/lib/agent/tools/types';

import { cleanupStep } from './cleanup-step';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}


/** 逐项闸门传输（与两个 route handler 同一服务层实现；无批量端点可用，也不该有）。 */
function gatePost(ctx: ToolContext): BatchPost {
  return async (url, body) => {
    const m = url.match(/^\/api\/actions\/([^/]+)\/(confirm|execute)$/);
    if (!m) return { ok: false, status: 404, body: { error: '未知端点' } };
    const [, id, action] = m;
    try {
      if (action === 'confirm') {
        const r = await confirmPendingAction(id, ctx);
        return {
          ok: true,
          status: 200,
          body: r as unknown as Record<string, unknown>,
        };
      }
      const ticket = typeof body?.ticket === 'string' ? body.ticket : '';
      const r = await executePendingAction(id, ticket, ctx);
      return {
        ok: true,
        status: 200,
        body: r as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      return {
        ok: false,
        status: 400,
        body: { error: e.message ?? '失败', code: e.code ?? null },
      };
    }
  };
}

async function main(): Promise<void> {
  // 默认零外呼：清网关凭据（mock 模型注入缝无条件生效，凭据缺失也不改道——F009 纪律）
  delete process.env.AIGCGATEWAY_BASE_URL;
  delete process.env.AIGCGATEWAY_API_KEY;

  console.log(
    '[agentloop-e2e] 循环放开面闭环开始（模型：mock；外呼：零；对外副作用：mock 分享通道）',
  );
  getNativeToolNames();
  const ctx = await buildToolContext({ agentId: 'orchestrator' });
  const tenantId = ctx.tenantId;

  const fxProject = await prisma.project.create({
    data: { tenantId, name: `m45-agentloop-e2e-${process.pid}` },
  });
  const orchestratorCtx: ToolContext = { ...ctx, projectId: fxProject.id };
  const insightCtx: ToolContext = { ...orchestratorCtx, agentId: 'insight' };

  const createdPA: string[] = [];
  const createdLogs: string[] = [];
  const projectsBefore = await prisma.project.count({ where: { tenantId } });
  const shareBefore = await prisma.shareLink.count({ where: { tenantId } });
  // 跑前 ShareLink id 基线 —— 清理段按「差集」删，不依赖 gateLogId / projectId。
  // 【为什么不能只靠那两把键】本批 e2e 备的是 `scope='quarterly'` 分享，projectId 恒 null；
  // 而闸门红线一旦回归（outbound 直连执行），链接也不带 gateLogId —— 两把键同时落空，
  // 恰好在最该清干净的失败路径上漏掉真实产物。差集是唯一不受被测代码行为影响的键。
  const shareIdsBefore = (
    await prisma.shareLink.findMany({
      where: { tenantId },
      select: { id: true },
    })
  ).map((r) => r.id);
  const runStartedAt = new Date();
  const markerBefore = await prisma.operationLog.count({
    where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
  });

  try {
    /* ── ① 编排会话：计划 → 接力 → 追问 ─────────────────────────── */
    console.log('[1/3] 编排会话：propose_plan → handoff_to → 组合追问');
    const run1 = await runScriptedLoop({
      copilot: {
        route: '/admin',
        projectId: fxProject.id,
        env: 'default',
        agentId: 'orchestrator',
      },
      ctx: orchestratorCtx,
      prompt: '把这季度的复盘安排一下，需要的话交给洞察',
      script: [
        {
          toolCalls: [
            {
              toolName: 'propose_plan',
              input: {
                title: '季度复盘与分享',
                items: [
                  {
                    title: '看一遍组合 ROI',
                    toolName: 'compute_roi_portfolio',
                    needsGate: false,
                  },
                  {
                    title: '生成对外分享链接',
                    toolName: 'create_share_link',
                    needsGate: false,
                  },
                ],
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'handoff_to',
              input: {
                toAgent: 'insight',
                artifactType: 'report',
                artifactRef: fxProject.id,
                summary: '请洞察接手做季度复盘',
              },
            },
          ],
        },
        // 接力之后越权去调编排独占工具 —— 必须被拒
        {
          toolCalls: [
            { toolName: 'create_project', input: { name: 'e2e 越权项目' } },
          ],
        },
        { toolCalls: [{ toolName: 'compute_roi_portfolio', input: {} }] },
        {
          text: '组合看完了：本期分子无回传源，ROI 算不出来，已如实标注，等你确认后续动作。',
        },
      ],
    });

    assert(run1.networkCalls.length === 0, '编排会话零外呼');
    assert(
      run1.toolNames[0] === 'propose_plan' &&
        run1.toolNames[1] === 'handoff_to',
      '工具序列：先出计划、再接力',
    );

    const planOut = run1.toolOutputs.find((o) => o.toolName === 'propose_plan')!
      .output as {
      planId: string;
      needsGateCount: number;
      items: Array<{ gateUnderreported: boolean }>;
    };
    createdLogs.push(planOut.planId);
    const planRow = await prisma.operationLog.findUnique({
      where: { id: planOut.planId },
    });
    assert(
      planRow?.summary?.startsWith(PLAN_PROPOSED_MARKER) === true,
      '计划留痕落 OperationLog(kind=auto)',
    );
    assert(
      planOut.needsGateCount === 1 &&
        planOut.items[1].gateUnderreported === true,
      '模型低报 outbound 被服务端复核纠正并如实标出',
    );

    // 认可计划 → 只留痕，不解锁执行权（下面 ② 仍然只拿到 pending）
    const ack = await acknowledgePlan(planOut.planId, { tenantId });
    createdLogs.push(ack.logId);
    assert(ack.alreadyAcknowledged === false, '计划认可落一行留痕');

    const handoffRow = await prisma.handoff.findFirst({
      where: { tenantId, projectId: fxProject.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(
      handoffRow?.fromAgent === 'orchestrator' &&
        handoffRow?.toAgent === 'insight',
      '接力落 Handoff 行（orchestrator → insight）',
    );

    const insightTools = [...getPersona('insight').tools].sort();
    assert(
      JSON.stringify([...run1.visibleToolsPerStep[2]].sort()) ===
        JSON.stringify(insightTools),
      '接力后模型视野收窄到洞察子集',
    );
    // 【S-G5-6 收口】原写法是 `some(含 create_project) || toolErrors.length > 0`——
    // 后半截让**任意**工具错误都能满足，等于这条负向断言几乎不设防（M4.5 复验登记）。
    //
    // 收紧时实测到一件此前被掩盖的事：拒因是 AI SDK 自己的
    // `AI_NoSuchToolError: Model tried to call unavailable tool` —— 即
    // **activeTools 视野收窄先生效**，请求根本没走到我们执行侧的 isToolActive。
    // 两道防线都在，只是外层先拦（同 M4.7 F001 在子 loop 里观察到的形态）。
    // 故判据收紧为"确实是 create_project 被判不可用"，并接受两种合法拒因形态——
    // 这与原来的 `|| length > 0`（任意错误都算）有本质区别：那是不设防，这是精确枚举。
    assert(
      run1.toolErrors.some(
        (e) =>
          e.toolName === 'create_project' &&
          (e.error.includes(TOOL_NOT_IN_SUBSET_MSG) ||
            e.error.includes('unavailable tool')),
      ),
      '🔒 接力后调编排独占工具被拒，且拒因确实是"该工具不可用"（越权负向断言）',
    );
    assert(
      (await prisma.project.count({ where: { tenantId } })) === projectsBefore,
      '越权建项目未发生（项目数与会话前一致）',
    );

    const tele1 = await run1.loop.telemetry;
    createdLogs.push('__telemetry1__');
    assert(tele1!.personaSwitches === 1, '遥测 personaSwitches = 1');
    assert(tele1!.finalAgentId === 'insight', '遥测 finalAgentId = 洞察');
    assert(tele1!.budgetHit === false, '深链档 10 步预算未撞上限');
    assert(
      tele1!.toolNames.includes('compute_roi_portfolio'),
      '遥测工具序列含组合追问',
    );

    const portfolio = run1.toolOutputs.find(
      (o) => o.toolName === 'compute_roi_portfolio',
    )!.output as {
      summary: { rankable: boolean; notRankableReason: string | null };
    };
    assert(
      portfolio.summary.rankable === false &&
        !!portfolio.summary.notRankableReason,
      '组合追问：ROI 不可横向排名并如实说明原因',
    );

    /* ── ② 洞察会话：连备 2 件 outbound，副作用零发生 ───────────── */
    console.log('[2/3] 洞察会话：连备 2 件 outbound → pending 停驻');
    const shareCall = {
      toolCalls: [
        { toolName: 'create_share_link', input: { scope: 'quarterly' } },
      ],
    };
    const run2 = await runScriptedLoop({
      copilot: {
        route: '/admin/insight',
        projectId: fxProject.id,
        env: 'default',
        agentId: 'insight',
      },
      ctx: insightCtx,
      prompt: '把季度汇总备两份对外分享',
      script: [shareCall, shareCall, { text: '两份都备好了，等你确认。' }],
    });
    assert(run2.networkCalls.length === 0, '洞察会话零外呼');

    const rawPendingIds = run2.toolOutputs.map(
      (o) => (o.output as { pendingActionId?: string }).pendingActionId,
    );
    // 【先过滤再入清理清单】闸门红线一旦回归（outbound 不再返回 pending 信封），
    // pendingActionId 就是 undefined。若把 undefined 塞进 createdPA，finally 首句
    // deleteMany({ gateLogId: { in: [undefined] } }) 会被 Prisma 拒绝
    //（Can not use undefined value within array）→ 清理段中断 + 盖掉下面这条断言的原文。
    // 这正是这条 e2e 最该抓住的场景，不能在抓到的同时把自己炸掉。
    const pendingIds = rawPendingIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );
    createdPA.push(...pendingIds);
    assert(
      rawPendingIds.length === 2 && pendingIds.length === 2,
      '2 件都落 pending',
    );
    assert(
      (await prisma.shareLink.count({ where: { tenantId } })) === shareBefore,
      '🔒 计划已被认可，但 outbound 仍停在 pending——副作用零发生',
    );

    const batchItems = toPendingBatchItems(await aggregatePending(insightCtx));
    const mine = batchItems.filter((i) => pendingIds.includes(i.id));
    assert(mine.length === 2, '聚合确认面列出这 2 件');
    assert(
      mine.every(
        (i) => i.harm?.irreversible === true && i.harm.targets.length > 0,
      ),
      '聚合卡数据 = 服务端 harm 原样（不可撤销红标 + 对象名单在场）',
    );

    /* ── ③ 批量确认：逐项 confirm + execute ─────────────────────── */
    console.log('[3/3] 逐项 confirm + execute（无批量端点）');
    const batch = await confirmAndExecuteSequentially(
      pendingIds,
      gatePost(insightCtx),
    );
    assert(batch.succeeded === 2 && batch.failed === 0, '2 件逐项确认全部成功');
    assert(
      (await prisma.shareLink.count({ where: { tenantId } })) ===
        shareBefore + 2,
      '副作用逐个发生（恰好 2 次，不多不少）',
    );
    assert(
      (await prisma.operationLog.count({
        where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
      })) ===
        markerBefore + 2,
      'mock 分享通道留痕 ×2（零真实公开暴露）',
    );
    assert(
      (await prisma.operationLog.count({
        where: { tenantId, kind: 'irrev', ref: { in: pendingIds } },
      })) === 2,
      'irrev 不可逆留痕齐',
    );

    const telemetryRows = await prisma.operationLog.count({
      where: {
        tenantId,
        kind: 'auto',
        summary: { startsWith: LOOP_TELEMETRY_MARKER },
      },
    });
    assert(telemetryRows >= 2, '两次会话各落一行 loop 遥测');

    console.log('[agentloop-e2e] ✅ 全部断言通过（零外呼 · 零真实对外副作用）');
  } finally {
    // 夹具清理（只删本脚本产物）。每步各自 try/catch —— 清理段自身绝不可再抛，
    // 否则会掩盖主流程首因并跳过后续清理（见 cleanupStep 头注）。
    await cleanupStep('shareLink(本次跑出来的：id 基线差集)', () =>
      prisma.shareLink.deleteMany({
        where: {
          tenantId,
          id: { notIn: shareIdsBefore },
          createdAt: { gte: runStartedAt },
        },
      }),
    );
    await cleanupStep('operationLog(ref ∈ createdPA)', () =>
      prisma.operationLog.deleteMany({
        where: { tenantId, ref: { in: createdPA } },
      }),
    );
    await cleanupStep('operationLog(id ∈ createdLogs)', () =>
      prisma.operationLog.deleteMany({
        where: { tenantId, id: { in: createdLogs } },
      }),
    );
    await cleanupStep('operationLog(projectId = 夹具项目)', () =>
      prisma.operationLog.deleteMany({
        where: { tenantId, projectId: fxProject.id },
      }),
    );
    await cleanupStep('pendingAction(id ∈ createdPA)', () =>
      prisma.pendingAction.deleteMany({ where: { id: { in: createdPA } } }),
    );
    await cleanupStep('handoff(projectId = 夹具项目)', () =>
      prisma.handoff.deleteMany({
        where: { tenantId, projectId: fxProject.id },
      }),
    );
    await cleanupStep('project(夹具项目)', () =>
      prisma.project.deleteMany({ where: { id: fxProject.id } }),
    );

    // 【显式决定：留不删】mock 分享通道的 SHARE_CREATED 标记行 ref=null / projectId=null，
    // 上面三把清理键都不命中。按项目既定口径保留不删——同族先例 M4 `insight:e2e`
    // 每跑净增 1 行（signoff S5 / project-status O2：「append-only 语义一致不建议删」），
    // patterns/testing-env-patterns.md §9 亦写明「append-only 语义的留痕表可选择保留不删，
    // 但删或留必须是一个**显式决定**」。故此处不删，改为把留下的行数喊出来——
    // 让它从「静默泄漏」变成「有账可查的显式残留」。
    // 来源：M4.5 首轮验收 F010 缺陷 ②（对抗复核 DOWNGRADED：不要求改代码，需明文兜底）。
    await cleanupStep('SHARE_CREATED 留痕计账（不删，只报账）', async () => {
      const markerAfter = await prisma.operationLog.count({
        where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
      });
      console.log(
        `[清理] 按 append-only 口径**保留**（不删）SHARE_CREATED 标记留痕 ${
          markerAfter - markerBefore
        } 行 —— 显式决定，非泄漏；本机重生含 feed/雷达的视觉基线前须把它计入`,
      );
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[agentloop-e2e] ❌',
      err instanceof Error ? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
