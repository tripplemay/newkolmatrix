// M4-INSIGHT F012 — 洞察 E2E 闭环（PRD §15.3 M4：证据不足如实显示，分享未确认不可执行）
//
// 链路：度量装配（spend 真源 = released Payout）→ compute_roi（分子缺显证据不足 + gaps）
// → draft_report 起草落库 → 采纳 internal（无 PendingAction）→ create_share_link 无令牌
// → pending（**副作用零发生断言**）→ confirm 签票 → execute 消费票 → ShareLink 落库
// （gateLogId + tokenHash，明文 token 仅响应现一次）+ irrev 留痕齐。
//
// 【P4 零真实公开暴露】本脚本恒走 mock ShareLinkService（ops/share 选择器本批无真实现），
// 观测点 = SHARE_CREATED_MARKER 日志计数 + publicUrl 恒 null + mocked 恒 true——
// **无真实公开分享分支**，不存在可误触的开关（spec §7）。
//
// 【LLM 模式】默认清网关凭据走降级固定草案（明示，零外呼——building 期口径，spec §8）；
// verifying 期经用户授权后 INSIGHT_E2E_REAL_LLM=1 走真网关最小用量（同 reach:e2e 口径）。
//
// 运行：npm run insight:e2e   退出码：0=全绿 / 1=任一失败。

import { createHash } from 'node:crypto';
import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { buildToolContext } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import { SHARE_CREATED_MARKER } from '../../src/lib/ops/share';
import { loadProjectSpend } from '../../src/lib/insight/metric-snapshot';
import { adoptWeeklyReport } from '../../src/lib/insight/weekly-report';
import type { ComputeRoiToolOutput } from '../../src/lib/agent/tools/compute-roi';
import type { DraftWeeklyReportResult } from '../../src/lib/insight/weekly-report';
import type { CreateShareLinkOutput } from '../../src/lib/agent/tools/create-share-link';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const AMOUNT = 900.5;

async function main(): Promise<void> {
  const realLlm = process.env.INSIGHT_E2E_REAL_LLM === '1';
  if (!realLlm) {
    // 默认零外呼：清凭据 → draft_report 走降级固定草案（明示，spec §8 building 期口径）
    delete process.env.AIGCGATEWAY_BASE_URL;
    delete process.env.AIGCGATEWAY_API_KEY;
  }
  console.log(
    `[insight-e2e] 洞察闭环开始（分享：mock 恒定零真实公开暴露，无 REAL 分支；LLM：${
      realLlm ? '真网关（已授权最小用量）' : '降级固定草案（零外呼）'
    }）`,
  );
  getNativeToolNames();
  const ctx = await buildToolContext({ agentId: 'insight' });

  // ── 夹具：合成项目 + KOL + released Payout（spend 真源；m4-* 前缀不触碰真实行）──
  const fxKol = await prisma.kol.create({
    data: {
      tenantId: ctx.tenantId,
      canonicalHandle: `m4-insight-e2e-${process.pid}`,
      displayName: 'Insight E2E 测试创作者',
    },
    select: { id: true },
  });
  const fxProject = await prisma.project.create({
    data: {
      tenantId: ctx.tenantId,
      name: `Insight E2E 项目 ${process.pid}`,
      goal: {
        targetExposure: 1_000_000,
        periodStart: '2026-07-01',
        periodEnd: '2026-07-31',
      },
    },
    select: { id: true },
  });
  await prisma.deal.create({
    data: {
      tenantId: ctx.tenantId,
      projectId: fxProject.id,
      kolId: fxKol.id,
      termsJson: { amount: AMOUNT, currency: 'USD' },
      payouts: {
        create: [
          {
            tenantId: ctx.tenantId,
            payee: 'Insight E2E 测试创作者',
            amount: AMOUNT,
            currency: 'USD',
            basis: 'E2E 夹具依据',
            status: 'released',
          },
        ],
      },
    },
  });
  const createdPA: string[] = [];

  const markerCount = () =>
    prisma.operationLog.count({
      where: {
        tenantId: ctx.tenantId,
        summary: { contains: SHARE_CREATED_MARKER },
      },
    });
  const shareRowCount = () =>
    prisma.shareLink.count({
      where: { tenantId: ctx.tenantId, projectId: fxProject.id },
    });

  try {
    // ── ① 度量装配：spend 真源聚合 ──
    const facts = await loadProjectSpend(fxProject.id, {
      tenantId: ctx.tenantId,
    });
    assert(facts.spendSource === 'payout', '① 装配 spendSource=payout（真源）');
    assert(facts.spend === AMOUNT, `① 装配 spend=${AMOUNT}（分整数累加）`);
    assert(
      facts.reach === null && facts.conversions === null && facts.roi === null,
      '① reach/conversions/roi 恒 null（M5 前无分子，不填 0）',
    );

    // ── ② compute_roi：分子缺显证据不足 + gaps ──
    const roiRes = await executeTool(
      'compute_roi',
      { projectId: fxProject.id },
      ctx,
    );
    const roiOut = roiRes.output as ComputeRoiToolOutput;
    assert(
      roiOut.roi.roi === null && roiOut.roi.basis === 'insufficient_evidence',
      '② compute_roi：roi=null + insufficient_evidence（诚实透传）',
    );
    assert(roiOut.gaps.gaps.length > 0, '② gaps 非空（缺什么显什么）');
    assert(
      JSON.stringify(JSON.parse(JSON.stringify(roiOut))) ===
        JSON.stringify(roiOut),
      '② 输出 JSON 往返无损（供画布）',
    );

    // ── ③ draft_report 起草落库 ──
    const draftRes = await executeTool(
      'draft_report',
      { projectId: fxProject.id },
      ctx,
    );
    const draft = draftRes.output as DraftWeeklyReportResult;
    assert(
      draft.draftContent.length > 0 && draft.adopted === false,
      '③ draft_report：草案落库（draftContent 非空 / adopted=false）',
    );
    if (!realLlm) {
      assert(
        draft.degraded && draft.draftContent.startsWith('【降级草案】'),
        '③ 无凭据降级固定草案（首行明示，不静默）',
      );
    }

    // ── ④ 采纳 internal：无 PendingAction ──
    const paBefore = await prisma.pendingAction.count({
      where: { tenantId: ctx.tenantId },
    });
    const adopt = await adoptWeeklyReport(draft.reportId, {
      tenantId: ctx.tenantId,
    });
    assert(adopt.adopted && !adopt.alreadyAdopted, '④ 采纳生效（internal）');
    const paAfter = await prisma.pendingAction.count({
      where: { tenantId: ctx.tenantId },
    });
    assert(paAfter === paBefore, '④ 采纳不产生 PendingAction（P5 无闸门）');

    // ── ⑤ create_share_link 无令牌 → pending（副作用零发生）──
    const shareBefore = await shareRowCount();
    const markerBefore = await markerCount();
    const shareRes = await executeTool(
      'create_share_link',
      { scope: 'project', projectId: fxProject.id },
      ctx,
    );
    assert(
      isPendingEnvelope(shareRes.output),
      '⑤ 无令牌 → pending 信封（服务端强制停在确认前）',
    );
    if (!isPendingEnvelope(shareRes.output)) throw new Error('unreachable');
    const paId = shareRes.output.pendingActionId;
    createdPA.push(paId);
    const harm = shareRes.output.harm;
    assert(
      harm.evidence.includes('链接一经生成即暴露'),
      '⑤ harm 含「一经生成即暴露」红标',
    );
    assert(
      (await shareRowCount()) === shareBefore &&
        (await markerCount()) === markerBefore,
      '⑤ 副作用零发生（无 ShareLink 行、无 SHARE_CREATED 标记）',
    );

    // ── ⑥ confirm + execute → ShareLink 落库 + irrev 齐 ──
    const conf = await confirmPendingAction(paId, ctx);
    const exec = await executePendingAction(paId, conf.ticket, ctx);
    const out = exec.output as CreateShareLinkOutput;
    assert(out.created && !out.already, '⑥ 执行成功（首次，非重入）');
    assert(out.token != null && out.token.length === 64, '⑥ token 明文仅响应现一次');
    const row = await prisma.shareLink.findUniqueOrThrow({
      where: { id: out.shareLinkId },
    });
    assert(row.gateLogId === paId, '⑥ ShareLink.gateLogId 非空（经闸门）');
    assert(
      row.tokenHash === createHash('sha256').update(out.token!).digest('hex'),
      '⑥ DB 只存 tokenHash（sha256，明文不落库）',
    );
    const irrev = await prisma.operationLog.findFirst({
      where: { tenantId: ctx.tenantId, kind: 'irrev', ref: paId },
    });
    assert(irrev != null, '⑥ irrev 留痕在场（与业务写入同事务）');
    assert((await markerCount()) === markerBefore + 1, '⑥ mock 分享恰好发生一次');

    // ── ⑦ 零真实公开暴露断言（spec §7 硬要求）──
    assert(out.mocked === true, '⑦ mocked=true（mock ShareLinkService）');
    assert(out.publicUrl === null, '⑦ publicUrl=null（无真实可公开访问地址）');
    assert(
      row.payloadRef.startsWith('share-payload:') &&
        !/^https?:\/\//.test(row.payloadRef),
      '⑦ payloadRef 为内部引用非公网 URL——本批未生成任何真实公开暴露',
    );

    console.log('[insight-e2e] ✅ 全部断言通过（零真实公开暴露）');
  } finally {
    // 夹具清理（只删本脚本产物；PA/留痕按 id 精确删）
    await prisma.shareLink.deleteMany({
      where: { tenantId: ctx.tenantId, gateLogId: { in: createdPA } },
    });
    await prisma.operationLog.deleteMany({
      where: { tenantId: ctx.tenantId, ref: { in: createdPA } },
    });
    await prisma.pendingAction.deleteMany({
      where: { id: { in: createdPA } },
    });
    await prisma.weeklyReport.deleteMany({
      where: { tenantId: ctx.tenantId, projectId: fxProject.id },
    });
    await prisma.project.deleteMany({ where: { id: fxProject.id } });
    await prisma.kol.deleteMany({ where: { id: fxKol.id } });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[insight-e2e] ❌', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
