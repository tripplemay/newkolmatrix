// M4-INSIGHT F011 — Evaluator 独立探针（weekly-draft 例程 acceptance 逐条取证）。
//
// 运行（零外呼硬保证：显式清网关凭据 + fetch 熔断）：
//   AIGCGATEWAY_API_KEY= node --env-file=.env --import tsx scripts/test/f011-eval-probe.ts
//
// 与 generator 的 tests/integration/weekly-draft-routine.test.ts 不重复，专攻其未断言项：
//   A. 跨项目「汇总度量」真穿透：payout 口径 / quote 口径 / 无源三项目同批出现在草案
//   B. 零外呼硬证：globalThis.fetch 熔断（调用即抛）下例程仍成功 → 降级分支确无网络
//   C. 已采纳冻结：同周期已采纳 → skippedAdopted=true 且草案内容零改写
//   D. 未采纳覆盖：同周期重跑 reportId 恒定、行数恒 1、updatedAt 前移（覆盖非堆叠）
//   E. scheduler 注册表闭环：ROUTINES['weekly-draft'].run() 真跑通（cron 闭包非空壳）+ cron 错峰
//   F. internal-only 边界：例程一轮后 PendingAction / ShareLink 零新增（无 outbound 直通）
//
// 只读产品代码，夹具租户自建自清（dev 租户数据不动；E 项对 dev 租户为幂等覆盖写，见注释）。

import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { ROUTINES, WEEKLY_DRAFT_CRON } from '../../src/lib/jobs/scheduler';
import { runWeeklyDraft } from '../../src/lib/jobs/routines/weekly-draft';
import { adoptWeeklyReport } from '../../src/lib/insight/weekly-report';

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const SLUG = `eval-f011-${process.pid}`;

async function main(): Promise<void> {
  // 凭据在场性如实登记（本探针要求「不在场」）
  const credsPresent = Boolean(
    process.env.AIGCGATEWAY_BASE_URL?.trim() &&
      process.env.AIGCGATEWAY_API_KEY?.trim(),
  );
  console.log(`[前置] 网关凭据在场 = ${credsPresent}（探针要求 false，零外呼）`);
  if (credsPresent) {
    console.log(
      '  ⛔ 请用 `AIGCGATEWAY_API_KEY= node --env-file=.env --import tsx scripts/test/f011-eval-probe.ts` 运行',
    );
    process.exit(2);
  }

  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: 'F011 验收夹具租户' },
  });
  const tenantId = tenant.id;

  try {
    // ── 夹具：三项目 × 三 spend 真源分支 ──────────────────────────────
    const pPayout = await prisma.project.create({
      data: { tenantId, name: 'P-已放款' },
    });
    const pQuote = await prisma.project.create({
      data: { tenantId, name: 'P-承诺额' },
    });
    const pNone = await prisma.project.create({
      data: { tenantId, name: 'P-无源' },
    });
    const kol = await prisma.kol.create({
      data: { tenantId, canonicalHandle: `eval-f011-kol-${process.pid}` },
    });

    await prisma.deal.create({
      data: {
        tenantId,
        projectId: pPayout.id,
        kolId: kol.id,
        termsJson: { amount: 1234.5 } as unknown as Prisma.InputJsonValue,
        payouts: {
          create: [
            {
              tenantId,
              payee: 'EvalKol',
              amount: 1234.5,
              currency: 'USD',
              basis: '验收夹具',
              status: 'released',
            },
          ],
        },
      },
    });

    const thread = await prisma.outreachThread.create({
      data: { tenantId, projectId: pQuote.id, kolId: kol.id },
    });
    await prisma.quote.create({
      data: {
        tenantId,
        threadId: thread.id,
        amount: 777,
        currency: 'USD',
        deliverablesJson: { items: [] } as unknown as Prisma.InputJsonValue,
        status: 'committed',
        gateLogId: 'eval-f011-gate-stub',
      },
    });

    // ── B. fetch 熔断（零外呼硬证）──────────────────────────────────
    const realFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = ((...args: unknown[]) => {
      fetchCalls += 1;
      throw new Error(
        `[probe] 检测到外呼企图（应为零）：${String(args[0]).slice(0, 80)}`,
      );
    }) as typeof globalThis.fetch;

    console.log('\n[A/B] 跨项目度量穿透 + 零外呼');
    const r1 = await runWeeklyDraft(tenantId);
    const row1 = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: r1.reportId },
    });
    check('例程在 fetch 熔断下仍成功（降级分支零网络）', fetchCalls === 0,
      `fetch 调用数=${fetchCalls}`);
    check('degraded=true 且草案首行明示【降级草案】', r1.degraded &&
      row1.draftContent.startsWith('【降级草案】'));
    check('WeeklyReport(projectId=null, adopted=false, generatedBy=insight)',
      row1.projectId === null && row1.adopted === false &&
      row1.generatedBy === 'insight');
    check('period = ISO 周串', /^\d{4}-W\d{2}$/.test(row1.period), row1.period);
    check('payout 口径穿透（$1234.50 / 已放款）',
      row1.draftContent.includes('P-已放款') &&
      row1.draftContent.includes('$1234.50') &&
      row1.draftContent.includes('口径：已放款'));
    check('quote 口径穿透（$777.00 / 报价承诺额）',
      row1.draftContent.includes('P-承诺额') &&
      row1.draftContent.includes('$777.00') &&
      row1.draftContent.includes('口径：报价承诺额'));
    check('无源项目如实标注（无可核数额，非 0 冒充）',
      row1.draftContent.includes('P-无源') &&
      row1.draftContent.includes('花费：无可核数额') &&
      !/P-无源.*\$0/.test(row1.draftContent));
    check('三项目同批出现（跨项目汇总非单项目）',
      ['P-已放款', 'P-承诺额', 'P-无源'].every((n) =>
        row1.draftContent.includes(n)));
    check('ROI 诚实降级（证据不足，无编造数字）',
      row1.draftContent.includes('ROI：证据不足'));

    // ── D. 未采纳覆盖 ─────────────────────────────────────────────
    console.log('\n[D] 同周期重跑覆盖（不堆叠）');
    await new Promise((res) => setTimeout(res, 50));
    const r2 = await runWeeklyDraft(tenantId);
    const row2 = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: r2.reportId },
    });
    const cnt = await prisma.weeklyReport.count({
      where: { tenantId, projectId: null, period: r1.period },
    });
    check('reportId 恒定（覆盖同一行）', r2.reportId === r1.reportId);
    check('同周期行数恒 1（不堆重复）', cnt === 1, `count=${cnt}`);
    check('createdAt 未变 / updatedAt 前移（真覆盖写）',
      row2.createdAt.getTime() === row1.createdAt.getTime() &&
      row2.updatedAt.getTime() >= row1.updatedAt.getTime());

    // ── C. 已采纳冻结 ─────────────────────────────────────────────
    console.log('\n[C] 已采纳冻结');
    const adopted = await adoptWeeklyReport(r1.reportId, { tenantId });
    const r3 = await runWeeklyDraft(tenantId);
    const row3 = await prisma.weeklyReport.findUniqueOrThrow({
      where: { id: r3.reportId },
    });
    const cntAfter = await prisma.weeklyReport.count({
      where: { tenantId, projectId: null, period: r1.period },
    });
    check('采纳置 adopted=true + adoptedAt', adopted.adopted &&
      Boolean(adopted.adoptedAt));
    check('已采纳同周期重跑 → skippedAdopted=true', r3.skippedAdopted === true);
    check('已采纳草案内容零改写', row3.draftContent === row2.draftContent);
    check('已采纳不新建行（行数恒 1）', cntAfter === 1, `count=${cntAfter}`);

    // ── F. internal-only 边界 ─────────────────────────────────────
    console.log('\n[F] internal-only 边界（无 outbound 直通）');
    const pending = await prisma.pendingAction.count({ where: { tenantId } });
    const share = await prisma.shareLink.count({ where: { tenantId } });
    check('例程三轮后 PendingAction 零新增', pending === 0, `count=${pending}`);
    check('例程三轮后 ShareLink 零新增（零公开暴露）', share === 0,
      `count=${share}`);

    // ── E. scheduler 注册表闭环 ───────────────────────────────────
    console.log('\n[E] scheduler 注册表闭环');
    const def = ROUTINES.find((r) => r.name === 'weekly-draft');
    check('ROUTINES 含 weekly-draft 条目', Boolean(def));
    check('cron = 周一 04:00（与 02:00/02:30/03:00 夜间例程错峰）',
      def?.cron === WEEKLY_DRAFT_CRON && WEEKLY_DRAFT_CRON === '0 4 * * 1',
      String(def?.cron));
    const crons = ROUTINES.map((r) => `${r.name}@${r.cron}`);
    check('注册表无 cron 冲突', new Set(ROUTINES.map((r) => r.cron)).size ===
      ROUTINES.length, crons.join(' / '));
    // 注册表闭包真跑（dev 租户；覆盖写同周期草案，幂等无污染）
    const devBefore = await prisma.weeklyReport.count();
    const closureResult = await def!.run();
    const devAfter = await prisma.weeklyReport.count();
    check('注册表 run() 闭包真跑通（非空壳）', Boolean(closureResult));
    check('闭包一轮不增行（dev 租户同周期覆盖，幂等）', devAfter === devBefore,
      `${devBefore} → ${devAfter}`);

    globalThis.fetch = realFetch;
    check('全程零外呼（fetch 调用总数 0）', fetchCalls === 0);
  } finally {
    // 夹具自清（dev 租户数据不动）
    await prisma.weeklyReport.deleteMany({ where: { tenantId } });
    await prisma.quote.deleteMany({ where: { tenantId } });
    await prisma.outreachThread.deleteMany({ where: { tenantId } });
    await prisma.payout.deleteMany({ where: { tenantId } });
    await prisma.deal.deleteMany({ where: { tenantId } });
    await prisma.project.deleteMany({ where: { tenantId } });
    await prisma.kol.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }

  console.log(`\n[结果] PASS ${pass} / FAIL ${fail}`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('[probe] 未捕获异常：', err);
  await prisma.$disconnect();
  process.exit(1);
});
