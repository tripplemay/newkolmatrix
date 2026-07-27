// M4.7-FRONTDESK F009 — 单一前台 E2E 闭环
//
// 链路（mock LanguageModel 驱动**真** loop：真 executeTool / 真闸门 / 真人格子集）：
//   ① 项目环节页发起 → **前台受理**（不是环节人格——本批根因的正面证明）
//   ② 前台咨询专家 A（匹配）+ 专家 B（洞察），≤ MAX_CONSULTS_PER_TURN
//   ③ 洞察专家备 outbound → **停 pending，副作用零发生**
//      （这条覆盖是从 m45 探针**迁移**过来的：F003 后前台不再持有专家工具，
//        原来"前台直接调 create_share_link"的场景已不成立，改由本链承载）
//   ④ 逐项 confirm + execute → 副作用逐个发生
//   ⑤ 留痕归属 = **实际干活的专家**（F004），协作痕迹落 Handoff 行（F008）
//   ⑥ 遥测含 consultCount（F006）
//
// 【零外呼】模型是 mock；测试床全程装 fetch 哨兵（任何出网即失败）。
// 【零真实副作用】outbound 只有 create_share_link，恒走 mock ShareLinkService。
//
// 运行：npm run frontdesk:e2e   退出码：0=全绿 / 1=任一失败。

import { prisma } from '../../src/lib/db/prisma';
import { buildToolContext } from '../../src/lib/agent/context';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import {
  FRONT_DESK_AGENT_ID,
  MAX_CONSULTS_PER_TURN,
} from '../../src/lib/agent/registry';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { LOOP_TELEMETRY_MARKER } from '../../src/lib/agent/loop-telemetry';
import { CONSULT_FAILED_MARKER } from '../../src/lib/agent/tools/consult-specialist';
import { SHARE_CREATED_MARKER } from '../../src/lib/ops/share';
import { runScriptedLoop } from '../../tests/support/agent-loop-testbed';
import { resolveContextForTest } from '../../src/app/api/agent/route';
import type { ToolContext } from '../../src/lib/agent/tools/types';

import { cleanupStep } from './cleanup-step';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}


async function main(): Promise<void> {
  // 无凭据也要能跑（CI）：mock 模型全程接管，网关凭据不参与
  delete process.env.AIGCGATEWAY_API_KEY;
  getNativeToolNames();

  const base = await buildToolContext({ agentId: FRONT_DESK_AGENT_ID });
  const tenantId = base.tenantId;
  const fxProject = await prisma.project.create({
    data: { tenantId, name: `m47-frontdesk-e2e-${process.pid}` },
  });
  const ctx: ToolContext = { ...base, projectId: fxProject.id };

  const createdPA: string[] = [];
  const createdLogs: string[] = [];
  const shareIdsBefore = (
    await prisma.shareLink.findMany({ where: { tenantId }, select: { id: true } })
  ).map((r) => r.id);
  const runStartedAt = new Date();
  const shareBefore = shareIdsBefore.length;
  const markerBefore = await prisma.operationLog.count({
    where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
  });
  const handoffBefore = await prisma.handoff.count({ where: { tenantId } });

  try {
    /* ── ① 环节页发起 → 前台受理 + 咨询两位专家 ─────────────────── */
    console.log('[1/3] 环节页发起：前台受理并咨询两位专家');
    // 【R-5】客户端 body 刻意传环节人格 'match'，经**真 resolveContext** 解析后
    // 把产物直接喂给本轮 loop —— 解析与执行串成一条链，而不是两段各跑各的。
    const resolved = resolveContextForTest({
      context: {
        route: `/admin/campaigns/${fxProject.id}`,
        projectId: fxProject.id,
        env: 'default',
        agentId: 'match',
        stage: 'match',
      },
    });
    assert(
      resolved.agentId === FRONT_DESK_AGENT_ID && resolved.agentId !== 'match',
      '🔑 客户端传环节人格，服务端仍解析为前台（本批根因的正面证明，输入≠期望）',
    );
    const run = await runScriptedLoop({
      copilot: resolved,
      ctx,
      prompt: '帮我看看这个项目该推进什么，然后分析下 ROI',
      script: [
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'match', question: '现在的组合方案如何？' },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: 'consult_specialist',
              input: { targetAgent: 'insight', question: '这个项目 ROI 如何？' },
            },
          ],
        },
        {
          text: '匹配说 B 组重合度最高；洞察说本期分子无回传源，ROI 算不出来，已如实标注。分享链接已备好，等你确认。',
        },
      ],
      specialistScripts: {
        match: [{ text: 'B 组受众重合度最高。' }],
        // 洞察专家：先算 ROI（证据不足），再备一份对外分享（outbound）
        insight: [
          { toolCalls: [{ toolName: 'compute_roi', input: { projectId: fxProject.id } }] },
          { toolCalls: [{ toolName: 'create_share_link', input: { scope: 'quarterly' } }] },
          { text: '本期分子无回传源，ROI 算不出来；分享已备好待确认。' },
        ],
      },
    });

    assert(run.networkCalls.length === 0, '零外呼（fetch 哨兵在场）');
    assert(
      run.loop.persona.id === FRONT_DESK_AGENT_ID,
      '本轮 loop 的受理人格 = 上面解析出的那个（解析与执行串成一条链，非两段各跑各的）',
    );
    assert(
      run.toolNames.filter((n) => n === 'consult_specialist').length === 2,
      `前台咨询了 2 位专家（上限 ${MAX_CONSULTS_PER_TURN}）`,
    );

    /* ── ② 专家备的 outbound 停 pending ────────────────────────── */
    console.log('[2/3] 专家备 outbound → 停 pending，副作用零发生');
    const pending = await prisma.pendingAction.findMany({
      where: { tenantId, toolName: 'create_share_link', status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    assert(pending.length === 1, '专家备的 outbound 落一条 pending');
    createdPA.push(pending[0].id);
    assert(
      pending[0].agentId === 'insight',
      '🔒 留痕归属 = 实际干活的专家（insight），不是受理的前台',
    );
    assert(
      (await prisma.shareLink.count({ where: { tenantId } })) === shareBefore,
      '🔒 副作用零发生——子 loop 里的 outbound 同样停在确认前',
    );
    assert(
      (await prisma.handoff.count({ where: { tenantId } })) ===
        handoffBefore + 2,
      '两次咨询各落一行协作痕迹（Handoff）',
    );
    assert(
      (await prisma.operationLog.count({
        where: { tenantId, summary: { contains: CONSULT_FAILED_MARKER } },
      })) === 0,
      '本轮无咨询失败留痕（两次咨询都成功）',
    );

    /* ── ③ 人确认后逐项执行 ────────────────────────────────────── */
    console.log('[3/3] 人确认 → 逐项 confirm + execute');
    const confirmed = await confirmPendingAction(pending[0].id, ctx);
    await executePendingAction(pending[0].id, confirmed.ticket, ctx);
    assert(
      (await prisma.shareLink.count({ where: { tenantId } })) ===
        shareBefore + 1,
      '副作用在人确认后才发生（恰好 1 次）',
    );
    assert(
      (await prisma.operationLog.count({
        where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
      })) === markerBefore + 1,
      'mock 分享通道留痕（零真实公开暴露）',
    );

    /* ── 遥测 ─────────────────────────────────────────────────── */
    const tele = await run.loop.telemetry;
    assert(tele !== null, '会话落一行 loop 遥测');
    assert(
      (tele as { consultCount?: number }).consultCount === 2,
      '遥测记录本轮咨询了 2 位专家（只记数量，不记问题正文）',
    );
    assert(
      JSON.stringify(tele).indexOf('ROI 如何') === -1,
      '遥测不含问题正文（隐私边界）',
    );
    const teleRow = await prisma.operationLog.findFirst({
      where: { tenantId, summary: { contains: LOOP_TELEMETRY_MARKER } },
      orderBy: { createdAt: 'desc' },
    });
    if (teleRow) createdLogs.push(teleRow.id);

    console.log('[frontdesk-e2e] ✅ 全部断言通过（零外呼 · 零真实对外副作用）');
  } finally {
    // 逐步 try/catch，清理段自身绝不可再抛（M4.5 F010 教训）
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
    // 【显式决定：留不删】mock 分享通道的标记行 ref/projectId 皆 null，三把键都不命中。
    // 沿 M4.5 spec §9 S-M45-1 既定口径：append-only，保留不删，但**报账**。
    await cleanupStep('SHARE_CREATED 留痕计账（不删，只报账）', async () => {
      const after = await prisma.operationLog.count({
        where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
      });
      console.log(
        `[清理] 按 append-only 口径**保留**（不删）SHARE_CREATED 标记留痕 ${
          after - markerBefore
        } 行 —— 显式决定，非泄漏`,
      );
    });

    // 【RV-1 修正】清态断言**必须在 cleanupStep 之外**。
    // 复验实测：把它包在 cleanupStep 里 = 被 cleanupStep 的契约（吞掉异常绝不外抛）
    // 吃掉——删掉 handoff 清理步骤后脚本照样 exit 0、留 2 行孤儿，只多一行没人消费
    // 的 stderr 警告。断言写在会吞异常的包装器里，等于没写。
    const [lLogs, lHandoffs, lPas, lProjects] = await Promise.all([
      prisma.operationLog.count({ where: { tenantId, projectId: fxProject.id } }),
      prisma.handoff.count({ where: { tenantId, projectId: fxProject.id } }),
      prisma.pendingAction.count({ where: { id: { in: createdPA } } }),
      prisma.project.count({ where: { id: fxProject.id } }),
    ]);
    if (lLogs || lHandoffs || lPas || lProjects) {
      // 直接抛：清理没做干净必须让脚本红，而不是打一行警告了事
      throw new Error(
        `清态断言失败，夹具仍有残留：${JSON.stringify({ lLogs, lHandoffs, lPas, lProjects })}`,
      );
    }
    console.log('  ✓ 清态断言：夹具残留逐表为 0（在 cleanupStep 之外，抛得出去）');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[frontdesk-e2e] ❌',
      err instanceof Error ? err.message : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
