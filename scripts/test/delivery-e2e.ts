// M3-B-DELIVERY F012 — 交付 E2E 闭环（PRD §15.3 M3：条件齐才出放款钮，未确认不可执行）
//
// 链路：commit_quote 过闸门 → Deal + 五条件生成 → 登记 contract/escrow 单号 →
// 人工核验内容与 #ad → 条件齐（deliveryCheck.ready=true）→ payout 无令牌 → pending
//（**副作用零发生断言**）→ confirm 签票 → execute 消费票 → Payout released +
// Deal 推进 completed + irrev 留痕 + key 分发闸门同款验证。
//
// 【P1 零真实资金动作】本脚本**没有 REAL 分支**（对照 reach-e2e 的 REAL 投递模式）：
// partner 适配器恒 mock（ops/partner 选择器本批无真实现），观测点 = RELEASED_MARKER /
// DISTRIBUTED_MARKER 日志计数。不设「测试目标」也不留可误触的开关（spec §3 P1）。
//
// 运行：npm run delivery:e2e   退出码：0=全绿 / 1=任一失败。

import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { buildToolContext } from '../../src/lib/agent/context';
import { prisma } from '../../src/lib/db/prisma';
import { DISTRIBUTED_MARKER, RELEASED_MARKER } from '../../src/lib/ops/partner';
import { loadDeliveryCheck } from '../../src/lib/delivery/check';
import {
  registerDealRefs,
  registerKeyPool,
  verifyDeliverable,
} from '../../src/lib/delivery/register';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

const AMOUNT = 1600;

async function main(): Promise<void> {
  console.log(
    '[delivery-e2e] 交付闭环开始（资金/分发模式：mock 恒定——本批零真实资金动作，无 REAL 分支）',
  );
  getNativeToolNames();
  const ctx = await buildToolContext({ agentId: 'delivery' });
  const reachCtx = { ...ctx, agentId: 'reach' as const };

  // ── 夹具：合成 KOL + 项目（P1：不触碰任何真实 KOL 行；m3b-* 前缀，spec §7 白名单）──
  const fxKol = await prisma.kol.create({
    data: {
      tenantId: ctx.tenantId,
      canonicalHandle: `m3b-delivery-e2e-${process.pid}`,
      displayName: 'Delivery E2E 测试创作者',
      language: 'zh',
    },
    select: { id: true },
  });
  const fxProject = await prisma.project.create({
    data: {
      tenantId: ctx.tenantId,
      name: `Delivery E2E 项目 ${process.pid}`,
      cur: 'reach',
      maxReached: 'reach',
    },
    select: { id: true },
  });
  const createdPA: string[] = [];

  const markerCount = (marker: string) =>
    prisma.operationLog.count({
      where: { tenantId: ctx.tenantId, summary: { contains: marker } },
    });

  try {
    const releasedBefore = await markerCount(RELEASED_MARKER);
    const distributedBefore = await markerCount(DISTRIBUTED_MARKER);

    // ── ① 报价承诺过闸门 → Deal + 五条件（F003 接线点）──
    const quote = await executeTool(
      'commit_quote',
      {
        projectId: fxProject.id,
        kolId: fxKol.id,
        amount: AMOUNT,
        currency: 'USD',
        deliverables: ['1 条长视频', '10 个 Steam key'],
        scope: '项目内使用 90 天',
      },
      reachCtx,
    );
    assert(isPendingEnvelope(quote.output), '① commit_quote 无令牌 → pending 信封');
    if (!isPendingEnvelope(quote.output)) return;
    createdPA.push(quote.output.pendingActionId);
    const qConf = await confirmPendingAction(quote.output.pendingActionId, reachCtx);
    const qExec = await executePendingAction(
      quote.output.pendingActionId,
      qConf.ticket,
      reachCtx,
    );
    const dealId = (qExec.output as { dealId: string }).dealId;
    assert(!!dealId, '① 同事务生成 Deal（有 committed quote 必有 Deal）');

    const deliverables = await prisma.deliverable.findMany({ where: { dealId } });
    assert(deliverables.length === 5, '① 五条交付条件生成齐（台账五列一一对应）');
    assert(
      deliverables.find((d) => d.kind === 'key')?.required === true,
      '① 报价含 key 交付 → key 条件为必需（P3）',
    );

    // ── ② 条件未齐时放款被服务端拒（P6：连 PendingAction 都不产生）──
    const paBefore = await prisma.pendingAction.count({
      where: { tenantId: ctx.tenantId },
    });
    let rejected = false;
    try {
      await executeTool('payout', { dealId }, ctx);
    } catch (err) {
      rejected = /条件未齐/.test(err instanceof Error ? err.message : '');
    }
    assert(rejected, '② 条件未齐 → payout 服务端拒绝（FR-8.2.4.2 无绕过入口）');
    assert(
      (await prisma.pendingAction.count({ where: { tenantId: ctx.tenantId } })) ===
        paBefore,
      '② 拒绝发生在落 PendingAction 之前（待办都不产生）',
    );

    // ── ③ 登记合同/托管单号 → 条件置 met + Deal 推进（F008）──
    const refs = await registerDealRefs(
      dealId,
      { contractRef: `sign-e2e-${process.pid}`, escrowRef: `esc-e2e-${process.pid}` },
      { tenantId: ctx.tenantId, actor: 'operator' },
    );
    assert(refs.dealStatus === 'escrowed', '③ 登记 refs → Deal negotiating→escrowed（逐级）');
    assert(
      refs.check.byKind.contract.cell === 'ok' &&
        refs.check.byKind.escrow.cell === 'ok',
      '③ 合同/托管条件置 met',
    );

    // ── ④ key 池登记 + 分发闸门（F006）：条件 key 由分发动作满足 ──
    await registerKeyPool(
      dealId,
      { keyRefs: [`pool-e2e-${process.pid}-1`, `pool-e2e-${process.pid}-2`] },
      { tenantId: ctx.tenantId, actor: 'operator' },
    );
    const keys = await executeTool(
      'distribute_keys',
      { dealId, quantity: 2 },
      ctx,
    );
    assert(isPendingEnvelope(keys.output), '④ distribute_keys 无令牌 → pending');
    if (!isPendingEnvelope(keys.output)) return;
    createdPA.push(keys.output.pendingActionId);
    assert(
      keys.output.harm.summary.includes('一经发放不可回收'),
      '④ harm 明示「一经发放不可回收」',
    );
    assert(
      (await markerCount(DISTRIBUTED_MARKER)) === distributedBefore,
      '④ 确认前分发副作用零发生',
    );
    const kConf = await confirmPendingAction(keys.output.pendingActionId, ctx);
    await executePendingAction(keys.output.pendingActionId, kConf.ticket, ctx);
    assert(
      (await prisma.gameKey.count({ where: { dealId, status: 'distributed' } })) === 2,
      '④ 确认后 GameKey reserved→distributed（gateLogId 非空）',
    );

    // ── ⑤ 人工核验内容与 #ad → 条件全齐 ──
    const rows = await prisma.deliverable.findMany({ where: { dealId } });
    for (const kind of ['content', 'ad_disclosure'] as const) {
      const row = rows.find((d) => d.kind === kind)!;
      await verifyDeliverable(
        row.id,
        { status: 'met', evidenceRef: `evidence-${kind}` },
        { tenantId: ctx.tenantId, actor: 'operator' },
      );
    }
    const check = await loadDeliveryCheck(dealId, { tenantId: ctx.tenantId });
    assert(check?.check.ready === true, '⑤ 条件全齐 → deliveryCheck.ready=true（放款钮出现的同一真相）');

    // ── ⑥ 放款：无令牌 → pending，副作用零发生 ──
    const payout = await executeTool('payout', { dealId }, ctx);
    assert(isPendingEnvelope(payout.output), '⑥ payout 无令牌 → pending 信封（点确认才放款）');
    if (!isPendingEnvelope(payout.output)) return;
    createdPA.push(payout.output.pendingActionId);
    const harm = payout.output.harm;
    assert(
      harm.targets.length === 1 && harm.amount === AMOUNT && !!harm.evidence,
      '⑥ harm 三行齐（收款方 / 金额+币种 / 依据）',
    );
    assert(
      (await prisma.payout.count({ where: { dealId, status: 'released' } })) === 0 &&
        (await markerCount(RELEASED_MARKER)) === releasedBefore,
      '⑥ 副作用零发生（无 released 行、无放款标记）',
    );

    // ── ⑦ 人确认 → 执行：Payout released + Deal completed + irrev ──
    const pConf = await confirmPendingAction(payout.output.pendingActionId, ctx);
    const pExec = await executePendingAction(
      payout.output.pendingActionId,
      pConf.ticket,
      ctx,
    );
    const out = pExec.output as {
      released: boolean;
      mocked: boolean;
      dealStatus: string;
      amount: number;
    };
    assert(out.released === true && out.amount === AMOUNT, '⑦ 确认后放款执行成功');
    assert(out.mocked === true, '⑦ P1：mock 适配器（未发生任何真实资金动作）');
    assert(out.dealStatus === 'completed', '⑦ Deal 推进 completed');

    const payoutRow = await prisma.payout.findFirst({ where: { dealId } });
    assert(
      payoutRow?.status === 'released' &&
        payoutRow.gateLogId === payout.output.pendingActionId,
      '⑦ Payout released 且 gateLogId 指回闸门动作',
    );
    assert(
      (await prisma.operationLog.count({
        where: {
          tenantId: ctx.tenantId,
          kind: 'irrev',
          ref: payout.output.pendingActionId,
        },
      })) === 1,
      '⑦ irrev 留痕在场（同事务）',
    );
    assert(
      (await markerCount(RELEASED_MARKER)) === releasedBefore + 1,
      '⑦ mock 放款恰好发生一次（不双放）',
    );

    // ── ⑧ →insight 守卫真判（F010）：全部 Deal 收尾 → 放行 ──
    const { advanceStage } = await import('../../src/lib/domain/env-advance');
    await prisma.project.update({
      where: { id: fxProject.id },
      data: { cur: 'delivery', maxReached: 'delivery' },
    });
    const adv = await advanceStage({
      projectId: fxProject.id,
      tenantId: ctx.tenantId,
    });
    assert(
      adv.ok === true && adv.cur === 'insight',
      '⑧ 全部 Deal completed → →insight 守卫放行',
    );

    // ── ⑨ P1 终局断言：全程零真实资金/分发外呼 ──
    assert(
      (await markerCount(RELEASED_MARKER)) === releasedBefore + 1 &&
        (await markerCount(DISTRIBUTED_MARKER)) === distributedBefore + 1,
      'P1: 全程仅 mock 副作用各一次，无任何真实付款 / key 平台外呼',
    );

    console.log('[delivery-e2e] ✅ 交付闭环全绿');
    console.log(
      '[delivery-e2e] 用量申报：真实资金动作 0 · 真实 key 发放 0（mock 适配器；本批无 REAL 分支）',
    );
  } finally {
    // 清理夹具（含 mock 观测标记——沿 M3-A「按业务标记清态」口径）
    await prisma.operationLog.deleteMany({
      where: { tenantId: ctx.tenantId, summary: { contains: RELEASED_MARKER } },
    });
    await prisma.operationLog.deleteMany({
      where: { tenantId: ctx.tenantId, summary: { contains: DISTRIBUTED_MARKER } },
    });
    await prisma.operationLog.deleteMany({
      where: { tenantId: ctx.tenantId, projectId: fxProject.id },
    });
    if (createdPA.length) {
      await prisma.operationLog.deleteMany({
        where: { tenantId: ctx.tenantId, ref: { in: createdPA } },
      });
      await prisma.pendingAction.deleteMany({
        where: { id: { in: createdPA } },
      });
    }
    await prisma.project.deleteMany({ where: { id: fxProject.id } });
    await prisma.kol.deleteMany({ where: { id: fxKol.id } });
    console.log('[delivery-e2e] 夹具已清理');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(
      '[delivery-e2e] ❌ 失败：',
      err instanceof Error ? (err.stack ?? err.message) : err,
    );
    await prisma.$disconnect();
    process.exit(1);
  });
