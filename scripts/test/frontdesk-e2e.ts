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

/**
 * 一条清理登记：删除与残留断言**共用同一个 where**（复验轮二 §13.3）。
 *
 * 【为什么要有这个类型】上一版清理用三把 operationLog 键、断言只守一把，
 * 另外两把成了静默门——删掉对应清理步后脚本 exit 0 却真漏 3 行闸门留痕。
 * 根因不是漏写了一条断言，是**两份清单各写各的**必然漂移。
 * 这里把 where 收成唯一入参，purge 与 residue 由它派生，结构上写不出子集。
 */
interface CleanupEntry {
  label: string;
  purge: () => Promise<unknown>;
  residue: () => Promise<number>;
}

/** 登记一条：delegate + where 各写一次，两个动作同源。 */
function entry<W>(
  label: string,
  delegate: {
    deleteMany(args: { where: W }): Promise<unknown>;
    count(args: { where: W }): Promise<number>;
  },
  where: W,
): CleanupEntry {
  return {
    label,
    purge: () => delegate.deleteMany({ where }),
    residue: () => delegate.count({ where }),
  };
}


async function main(): Promise<void> {
  // 无凭据也要能跑（CI）：mock 模型全程接管，网关凭据不参与
  delete process.env.AIGCGATEWAY_API_KEY;
  getNativeToolNames();

  const base = await buildToolContext({ agentId: FRONT_DESK_AGENT_ID });
  const tenantId = base.tenantId;

  /* ── 整表普查基线（第二层，**刻意不从登记表派生**）─────────────────────────
     登记表只保证「断言的键 = 清理的键」，挡的是子集漂移；但把一整条 entry 删掉时，
     它的残留断言会跟着消失——实测仍 exit 0。故再压一层与登记表无关的粗粒度普查：
     跑完之后本租户各表行数必须回到基线，唯一允许的增量是**显式声明**的那一项
     （S-M45-1：SHARE_CREATED 标记行 append-only 留不删）。
     两层的失效模式不重叠：删键 → 第一层红；删整条 → 第二层红。
     **基线必须在建夹具之前取**——否则夹具项目算进基线，清完反而是净减。      */
  const census = async () => ({
    shareLink: await prisma.shareLink.count({ where: { tenantId } }),
    operationLog: await prisma.operationLog.count({ where: { tenantId } }),
    pendingAction: await prisma.pendingAction.count({ where: { tenantId } }),
    handoff: await prisma.handoff.count({ where: { tenantId } }),
    project: await prisma.project.count({ where: { tenantId } }),
  });
  const censusBefore = await census();

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

  // 清理登记表（唯一真相源：既是清理清单，也是残留断言清单）。
  // 顺序 = 执行顺序；`createdPA` / `createdLogs` 是引用捕获，跑完才定型。
  const cleanupPlan: CleanupEntry[] = [
    entry('shareLink(本次跑出来的：id 基线差集)', prisma.shareLink, {
      tenantId,
      id: { notIn: shareIdsBefore },
      createdAt: { gte: runStartedAt },
    }),
    entry('operationLog(ref ∈ createdPA)', prisma.operationLog, {
      tenantId,
      ref: { in: createdPA },
    }),
    entry('operationLog(id ∈ createdLogs)', prisma.operationLog, {
      tenantId,
      id: { in: createdLogs },
    }),
    entry('operationLog(projectId = 夹具项目)', prisma.operationLog, {
      tenantId,
      projectId: fxProject.id,
    }),
    entry('pendingAction(id ∈ createdPA)', prisma.pendingAction, {
      id: { in: createdPA },
    }),
    entry('handoff(projectId = 夹具项目)', prisma.handoff, {
      tenantId,
      projectId: fxProject.id,
    }),
    entry('project(夹具项目)', prisma.project, { id: fxProject.id }),
  ];

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
    //
    // 【复验轮二 §13.3 结构性修正】上一版的清态断言只查 4 项、operationLog 只用
    // `projectId` 一把键，而清理用了三把键——**断言的键集合是清理清单的真子集**。
    // 实测两条绕过：删掉 `shareLink` 清理步 → exit 0 且真漏 1 行；删掉
    // `operationLog(ref ∈ createdPA)` 清理步 → exit 0 且真漏 3 行闸门留痕，
    // 脚本照样打印「残留逐表为 0」。修「让原变异翻红」不等于这条断言有鉴别力。
    //
    // 故改成登记表驱动：每一项的 **where 只写一次**，同时喂给 deleteMany 与 count。
    // 新增清理步 = 新增一条登记 = 自动带上对应的残留断言，子集漂移在结构上不可能发生。
    for (const step of cleanupPlan) {
      await cleanupStep(step.label, step.purge);
    }
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
    //
    // 【RV-1 收尾（轮二）】逐项断言由同一张登记表生成：断言的键集合恒 = 清理的键集合。
    const residues = await Promise.all(
      cleanupPlan.map(async (step) => ({
        key: step.label,
        left: await step.residue(),
      })),
    );
    const dirty = residues.filter((r) => r.left > 0);
    if (dirty.length) {
      // 直接抛：清理没做干净必须让脚本红，而不是打一行警告了事
      throw new Error(
        `清态断言失败，夹具仍有残留（逐键）：${JSON.stringify(
          Object.fromEntries(dirty.map((d) => [d.key, d.left])),
        )}`,
      );
    }
    console.log(
      `  ✓ 清态断言（第一层·逐键）：${residues.length} 把清理键逐项残留为 0` +
        '（键集合与清理清单同源，在 cleanupStep 之外，抛得出去）',
    );

    // 第二层：整表普查回基线。唯一允许的增量是显式声明的 append-only 标记行。
    const censusAfter = await census();
    const markerAfter = await prisma.operationLog.count({
      where: { tenantId, summary: { contains: SHARE_CREATED_MARKER } },
    });
    const allowedDelta: Record<keyof typeof censusAfter, number> = {
      shareLink: 0,
      operationLog: markerAfter - markerBefore, // S-M45-1 显式留不删
      pendingAction: 0,
      handoff: 0,
      project: 0,
    };
    const leaks = (
      Object.keys(censusAfter) as Array<keyof typeof censusAfter>
    ).flatMap((t) => {
      const delta = censusAfter[t] - censusBefore[t];
      return delta === allowedDelta[t]
        ? []
        : [`${t}: 净增 ${delta}（允许 ${allowedDelta[t]}）`];
    });
    if (leaks.length) {
      throw new Error(
        `清态断言失败（第二层·整表普查）——本租户有未申报的净增行：${leaks.join(
          '；',
        )}。清理登记表里是不是少了一条？`,
      );
    }
    console.log(
      '  ✓ 清态断言（第二层·整表普查）：各表净增 = 申报值' +
        `（仅 operationLog 允许 +${allowedDelta.operationLog} 行 append-only 标记）`,
    );
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
