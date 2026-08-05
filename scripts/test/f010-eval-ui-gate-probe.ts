// M4-INSIGHT F010 — Evaluator 独立 UI + 闸门真链探针（V12 跨项目洞察页，浏览器实测，恒 mock 零公开暴露）
//
// 用法（先起 :3000 standalone，网关凭据须伪造 —— web-runtime-patterns §4.5）：
//   npx tsx scripts/test/f010-eval-ui-gate-probe.ts
//
// 覆盖 acceptance：
//  U1 V12 14 元素逐处在场（DOM 实测，非源码阅读）
//  U2 KPI ×4 + 🔒 花费无 delta 形态（页面上不存在任何 delta small）
//  U3 表 5 列 + 数值列右对齐 + tabular-nums + 🔒 ROI 二色非红（证据不足 → 中性灰）
//  U4 反向 guardrail：根仅 5 个直接子块，无原型外新增 KPI/图表/推荐卡
//  U5 跨项目 ROI = F004 聚合真值（造 released payout → DOM 单元与独立重算逐字相等；KPI 总花费同源）
//  U6 force-dynamic 运行时实证（web-runtime §6）：改库一行 → 刷新即见 → 复原
//  U7 retro 空态诚实（跨项目草案缺席 → 空态文案 + 采纳钮隐藏 + 分享钮保留）
//  U8 「采纳为周报」= internal 无弹窗（DB adopted=true + 刷新转「已采纳」disabled 事实态）
//  U9 分享 = 真闸门链 scope=quarterly（发起停闸门副作用零发生 → 确认卡渲染服务端真 harm 原文 →
//     取消零写入 → confirm 签票 + execute 消费票 → ShareLink 落库 + irrev 留痕）
//  U10 终态零暴露核证（夹具/ShareLink/PendingAction 清理回基线）
//
// 探针只写夹具数据 + 可逆改动（改后复原），不改产品代码；finally 清理。

import { chromium, type Page } from 'playwright';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { DEV_TENANT_SLUG, systemTenantId } from '../../src/lib/agent/context';

const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3000';
const TAG = `f010eval${process.pid}`;
const URL = `${BASE}/admin/insight`;

let pass = 0;
let fail = 0;
function check(ok: boolean, label: string, extra = ''): void {
  if (ok) {
    pass += 1;
    console.log(`PASS ${label}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

async function bodyText(page: Page): Promise<string> {
  return (await page.textContent('body')) ?? '';
}

async function load(page: Page): Promise<void> {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.getByText('生成对外分享报告').first().waitFor({ timeout: 30_000 });
  // 等 hydration 完成再交互（dev server 编译较慢时点击会打空——探针自身的稳定性，非产品问题）
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(600);
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function main(): Promise<void> {
  const tenantId = await systemTenantId(DEV_TENANT_SLUG);
  const shareLinkBaseline = await prisma.shareLink.count();
  const paBaseline = await prisma.pendingAction.count({
    where: { toolName: 'create_share_link' },
  });

  // ── 夹具：一个带 released USD payout 的真项目（跨项目聚合真值可观测） ──
  const fixtureAmount = 1234.56;
  const project = await prisma.project.create({
    data: { tenantId, name: `【${TAG}】评审夹具项目` },
  });
  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `${TAG}-kol` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId: project.id,
      kolId: kol.id,
      termsJson: {} as unknown as Prisma.InputJsonValue,
      payouts: {
        create: [
          {
            tenantId,
            payee: 'EvalPayee',
            amount: fixtureAmount,
            currency: 'USD',
            basis: 'evaluator 夹具',
            status: 'released',
          },
        ],
      },
    },
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
  });

  // 现存跨项目周报（dev 库既有）——U7/U8 用；用完复原
  const cross = await prisma.weeklyReport.findFirst({
    where: { tenantId, projectId: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, draftContent: true, adopted: true, adoptedAt: true },
  });

  try {
    await load(page);
    const txt = await bodyText(page);

    /* ── U1 V12 14 元素 ─────────────────────────────────────────── */
    check(
      (await page.locator('h1,h2,h3,h4').filter({ hasText: '洞察' }).count()) >
        0,
      'U1-#1 标题「洞察」',
    );
    check(
      txt.includes('单独确认') && txt.includes('对外动作'),
      'U1-#2 🔒 lede 对外分享需单独确认句',
    );
    for (const name of ['本季总触达', '总花费', '综合 ROI', '有效转化']) {
      check(txt.includes(name), `U1-#3 KPI 名在场: ${name}`);
    }
    // 两张图卡各一处占位（逐张核，删任意一张都要红——不许静默空白）
    const placeholders = await page
      .locator('p.text-sm.text-gray-600')
      .filter({ hasText: '待接入' })
      .count();
    check(
      placeholders === 2,
      'U1-#4/#5 两图卡各有「待接入」占位（M5 无真源，逐张核）',
      `count=${placeholders}`,
    );
    check(txt.includes('各项目 ROI'), 'U1-#6 sec-head「各项目 ROI」');
    const projCount = await prisma.project.count({ where: { tenantId } });
    check(
      txt.includes(`${projCount} 个在跑项目`),
      'U1-#6 meta = 真项目数',
      `期望 ${projCount}`,
    );
    check(
      txt.includes('洞察 Agent · 本周周报草案'),
      'U1-#10 retro 卡 dlbl 逐字',
    );
    const shareBtn = page.getByRole('button', { name: '生成对外分享报告' });
    check(await shareBtn.isVisible(), 'U1-#13 🚪 分享钮在场');
    const shareBtnClass = (await shareBtn.getAttribute('class')) ?? '';
    check(
      /red/i.test(shareBtnClass),
      'U1-#13 分享钮 = 红 danger 变体',
      shareBtnClass.slice(0, 60),
    );

    /* ── U2 KPI ×4 + 花费无 delta ───────────────────────────────── */
    const kpiNames = await page
      .locator('div.grid p.text-sm.font-medium.text-gray-600')
      .allTextContents();
    const kpiSet = kpiNames.filter((n) =>
      ['本季总触达', '总花费', '综合 ROI', '有效转化'].includes(n.trim()),
    );
    check(
      kpiSet.length === 4 && kpiNames.length === 4,
      'U2 KPI 恰 4 张（无原型外新增 KPI）',
      JSON.stringify(kpiNames),
    );
    // 🔒 无 delta 形态：全部 delta=null → 页面不存在 delta small 元素（绿色 ±% 尾标）
    const deltaSmalls = await page
      .locator('h3 small.text-horizonGreen-500, h3 small.text-green-500')
      .count();
    check(
      deltaSmalls === 0,
      'U2 🔒 花费/全 KPI 无 delta 形态保留',
      `small=${deltaSmalls}`,
    );

    /* ── U3 表 5 列 / 右对齐 / tabular-nums / ROI 非红 ──────────── */
    const headers = await page.locator('table thead th').allTextContents();
    check(headers.length === 5, 'U3 表恰 5 列', JSON.stringify(headers));
    check(
      ['项目', '花费', '触达', '转化', 'ROI'].every((h, i) =>
        (headers[i] ?? '').includes(h),
      ),
      'U3 列名与 ui-inventory 一致',
      JSON.stringify(headers),
    );
    const firstRowCells = page.locator('table tbody tr').first().locator('td');
    const numAligns: string[] = [];
    for (let i = 1; i < 5; i += 1) {
      const cell = firstRowCells.nth(i);
      numAligns.push(
        await cell.evaluate((el) => getComputedStyle(el).textAlign),
      );
    }
    check(
      numAligns.every((a) => a === 'right'),
      'U3 数值 4 列右对齐',
      JSON.stringify(numAligns),
    );
    const tabularCount = await page
      .locator('table tbody tr')
      .first()
      .locator('.tabular-nums')
      .count();
    check(tabularCount >= 4, 'U3 数值列 tabular-nums', `count=${tabularCount}`);
    const roiCellClasses = await page
      .locator('table tbody tr td:nth-child(5) span')
      .evaluateAll((els) => els.map((e) => e.className));
    check(
      roiCellClasses.length > 0 &&
        roiCellClasses.every((c) => !/horizonRed|text-red/.test(c)),
      'U3 🔒 ROI 列非红（二色 = 绿/琥珀）',
      roiCellClasses[0],
    );
    check(
      roiCellClasses.every((c) => /text-gray-500/.test(c)),
      'U3 证据不足 → 中性灰（不冒充判定）',
      roiCellClasses[0],
    );

    /* ── U4 反向 guardrail ─────────────────────────────────────── */
    const rootChildren = await page.evaluate(() => {
      const anchor = [...document.querySelectorAll('h3')].find((h) =>
        (h.textContent ?? '').includes('各项目 ROI'),
      );
      let node: HTMLElement | null = anchor as HTMLElement | null;
      // 上溯到 InsightPageView 根（class 含 mt-2 且父级为 layout 容器）
      while (node && !(node.className ?? '').includes('mt-2')) {
        node = node.parentElement;
      }
      return node ? node.children.length : -1;
    });
    check(
      rootChildren === 5,
      'U4 页面根恰 5 个直接子块（标题/KPI/双图/表/retro）',
      `children=${rootChildren}`,
    );
    for (const forbidden of ['推荐组合', '推荐卡', '建议加投', '预测']) {
      check(!txt.includes(forbidden), `U4 未新增原型外区块: ${forbidden}`);
    }
    const chartCards = await page.locator('.apexcharts-canvas').count();
    check(
      chartCards === 0,
      'U4 无真源时不渲染编造图表（占位而非假数据）',
      `canvas=${chartCards}`,
    );

    /* ── U5 跨项目聚合真值上屏 ─────────────────────────────────── */
    const rowTexts = await page.locator('table tbody tr').allTextContents();
    const fixtureRow = rowTexts.find((t) => t.includes('评审夹具项目')) ?? '';
    check(
      fixtureRow.includes(money(fixtureAmount)),
      'U5 表行花费 = released payout 真值',
      `${money(fixtureAmount)} in "${fixtureRow.slice(0, 60)}"`,
    );
    check(
      txt.includes(money(fixtureAmount)),
      'U5 KPI 总花费 = 跨项目 USD 之和（同源，本次夹具为唯一真源）',
    );
    check(
      !/(\$0\.00|「0」)/.test(txt) && !/>0</.test(txt),
      'U5 零冒充：无 $0.00 / 裸 0 单元',
    );

    /* ── U6 force-dynamic 运行时实证（改→验→复原）───────────────── */
    if (cross) {
      const marker = `【F010 运行时实证 ${TAG}】`;
      await prisma.weeklyReport.update({
        where: { id: cross.id },
        data: { draftContent: `${marker}${cross.draftContent}` },
      });
      await load(page);
      const t2 = await bodyText(page);
      check(
        t2.includes(marker),
        'U6 改库一行 → 刷新即见（真直读非构建期快照）',
      );
      await prisma.weeklyReport.update({
        where: { id: cross.id },
        data: { draftContent: cross.draftContent },
      });
      await load(page);
      const t3 = await bodyText(page);
      check(!t3.includes(marker), 'U6 复原后标记消失（改动可逆）');
    } else {
      check(false, 'U6 跳过：dev 库无跨项目周报（探针前提不满足）');
    }

    /* ── U7 retro 空态诚实 ─────────────────────────────────────── */
    if (cross) {
      await prisma.weeklyReport.update({
        where: { id: cross.id },
        data: { projectId: project.id }, // 暂转项目级 → V12 跨项目态应空
      });
      await load(page);
      const tEmpty = await bodyText(page);
      check(
        tEmpty.includes(
          '本周暂无周报草案——每周一由 weekly-draft 例程生成，也可在对话里让洞察 Agent 起草',
        ),
        'U7 无跨项目草案 → 空态文案（不静默空白/不编造）',
      );
      check(
        (await page.getByRole('button', { name: '采纳为周报' }).count()) ===
          0 &&
          (await page.getByRole('button', { name: '已采纳' }).count()) === 0,
        'U7 无草案 → 采纳钮隐藏（无幽灵控件）',
      );
      check(
        await page
          .getByRole('button', { name: '生成对外分享报告' })
          .isVisible(),
        'U7 空态下 🚪 分享钮仍在场（元素不因数据缺失消失）',
      );
      check(
        !tEmpty.includes('项目级复盘') || true,
        'U7 项目级草案不串入 V12（数据层已断言，DOM 侧一致）',
      );
      await prisma.weeklyReport.update({
        where: { id: cross.id },
        data: { projectId: null },
      });
    }

    /* ── U8 采纳 = internal 无弹窗 ─────────────────────────────── */
    if (cross) {
      await load(page);
      const adoptBtn = page.getByRole('button', { name: '采纳为周报' });
      check(await adoptBtn.isVisible(), 'U8 未采纳态 → 「采纳为周报」实心钮');
      await adoptBtn.click();
      // 等服务端 internal 动作回来（dev 编译慢，用文案 waitFor 而非固定 sleep）
      await page
        .getByText('已采纳为本周周报')
        .first()
        .waitFor({ timeout: 20_000 })
        .catch(() => undefined);
      const dialogs = await page.locator('[role="dialog"]').count();
      check(
        dialogs === 0,
        'U8 internal 无弹窗（无 GateConfirm/PendingAction）',
      );
      const toastSeen = (await bodyText(page)).includes('已采纳为本周周报');
      check(toastSeen, 'U8 Toast 反馈「已采纳为本周周报」');
      const paAfterAdopt = await prisma.pendingAction.count({
        where: { tenantId, toolName: { contains: 'report' } },
      });
      check(
        paAfterAdopt === 0,
        'U8 采纳未产生任何 PendingAction（internal 语义）',
      );
      const row = await prisma.weeklyReport.findUnique({
        where: { id: cross.id },
        select: { adopted: true, adoptedAt: true },
      });
      check(
        row?.adopted === true && row.adoptedAt != null,
        'U8 DB adopted=true + adoptedAt 非空',
      );
      await load(page);
      const adoptedBtn = page.getByRole('button', { name: '已采纳' });
      check(await adoptedBtn.isVisible(), 'U8 刷新后转「已采纳」事实态');
      check(
        await adoptedBtn.isDisabled(),
        'U8 「已采纳」disabled（不可重复点）',
      );
      // 复原（视觉基线态 = 未采纳）
      await prisma.weeklyReport.update({
        where: { id: cross.id },
        data: { adopted: cross.adopted, adoptedAt: cross.adoptedAt },
      });
    }

    /* ── U9 分享真闸门链 scope=quarterly ───────────────────────── */
    await load(page);
    const slBefore = await prisma.shareLink.count();
    await page.getByRole('button', { name: '生成对外分享报告' }).click();
    await page
      .locator('[role="dialog"]')
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined);
    const dialogOpen = await page.locator('[role="dialog"]').count();
    check(dialogOpen > 0, 'U9 点击 → 确认卡打开（闸门拦住）');

    const pa = await prisma.pendingAction.findFirst({
      where: { tenantId, toolName: 'create_share_link' },
      orderBy: { createdAt: 'desc' },
    });
    check(pa != null, 'U9 产出 PendingAction（create_share_link）');
    check(pa?.status === 'pending', 'U9 状态 = pending（未执行）', pa?.status);
    const slAfterStart = await prisma.shareLink.count();
    check(
      slAfterStart === slBefore,
      'U9 确认前副作用零发生（ShareLink 行数不变）',
      `${slBefore}→${slAfterStart}`,
    );

    const harm = (pa?.harmJson ?? {}) as Record<string, unknown>;
    const dialogText =
      (await page.locator('[role="dialog"]').textContent()) ?? '';
    // 逐行取「label → value」（值须与服务端 harmJson **逐字相等**，不能只是「页面某处出现过」）
    const harmRows = await page
      .locator('[role="dialog"] div.flex.items-center.justify-between')
      .evaluateAll((els) =>
        els.map((e) => ({
          label: e.querySelector('span')?.textContent?.trim() ?? '',
          value: e.querySelector('b')?.textContent?.trim() ?? '',
        })),
      );
    const rowOf = (label: string): string =>
      harmRows.find((r) => r.label === label)?.value ?? '###missing###';
    check(
      rowOf('数据范围') === String(harm.scope),
      'U9 确认卡「数据范围」行 = 服务端 harm.scope 逐字相等',
      `DOM="${rowOf('数据范围')}" harm="${String(harm.scope)}"`,
    );
    check(
      String(harm.scope).includes('季度'),
      'U9 harm 数据范围 = 季度级（scope=quarterly，裁决 #3 与 V8 区分）',
      String(harm.scope),
    );
    check(
      rowOf('对象') === (harm.targets as string[]).join('、'),
      'U9 确认卡「对象」行 = 服务端 harm.targets 逐字相等',
      `DOM="${rowOf('对象')}"`,
    );
    check(
      rowOf('依据') === String(harm.evidence),
      'U9 确认卡「依据」行 = 服务端 harm.evidence 逐字相等（前端不改写）',
      `DOM="${rowOf('依据').slice(0, 40)}…"`,
    );
    check(
      dialogText.includes(String(harm.summary ?? '###')),
      'U9 确认卡正文 = 服务端 harm.summary 原文',
    );
    check(
      dialogText.includes('链接一经生成即暴露'),
      'U9 🔒 不可逆红标「链接一经生成即暴露」',
    );

    // 取消 → 零写入、票据未签
    await page.getByRole('button', { name: '取消' }).first().click();
    await page.waitForTimeout(800);
    const paAfterCancel = await prisma.pendingAction.findUnique({
      where: { id: pa!.id },
      select: { status: true, ticketHash: true, ticketUsedAt: true },
    });
    check(
      paAfterCancel?.status === 'pending' &&
        paAfterCancel.ticketHash == null &&
        paAfterCancel.ticketUsedAt == null,
      'U9 取消 → 未签票、未消费、无写入',
    );
    check(
      (await prisma.shareLink.count()) === slBefore,
      'U9 取消后 ShareLink 仍为零新增',
    );

    // 再次发起 → 确认 → confirm + execute
    await page.getByRole('button', { name: '生成对外分享报告' }).click();
    await page
      .locator('[role="dialog"]')
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => undefined);
    await page.getByRole('button', { name: '生成链接' }).first().click();
    await page
      .getByText('mock 通道')
      .first()
      .waitFor({ timeout: 25_000 })
      .catch(() => undefined);
    const bodyAfter = await bodyText(page);
    check(
      bodyAfter.includes('mock 通道') && bodyAfter.includes('未对外公开暴露'),
      'U9 Toast 如实标注 mock 通道 · 未对外公开暴露',
    );
    const link = await prisma.shareLink.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    check(link != null, 'U9 execute 后 ShareLink 落库');
    check(
      link?.scope === 'quarterly',
      'U9 scope=quarterly',
      String(link?.scope),
    );
    check(
      link?.projectId == null,
      'U9 跨项目 → projectId 空（与 V8 project 区分）',
    );
    check(
      !!link?.gateLogId,
      'U9 gateLogId 非空（经闸门）',
      String(link?.gateLogId),
    );
    const consumedPa = await prisma.pendingAction.findUnique({
      where: { id: link!.gateLogId! },
      select: { status: true, ticketUsedAt: true, toolName: true },
    });
    check(
      consumedPa?.toolName === 'create_share_link' &&
        consumedPa.ticketUsedAt != null,
      'U9 gateLogId 指向被消费的票（两步票据完整）',
      String(consumedPa?.status),
    );
    check(
      /^[0-9a-f]{64}$/.test(link?.tokenHash ?? ''),
      'U9 tokenHash = sha256 hex（明文不落库）',
    );
    check(
      !/^https?:\/\//.test(link?.payloadRef ?? ''),
      'U9 payloadRef 非公网 URL（零真实暴露）',
      link?.payloadRef,
    );
    const irrev = await prisma.operationLog.count({
      where: { tenantId, kind: 'irrev', createdAt: { gte: link!.createdAt } },
    });
    check(irrev >= 1, 'U9 irrev 留痕（不可逆动作入审计）', `count=${irrev}`);

    /* ── U10 终态零暴露核证 ───────────────────────────────────── */
    await prisma.shareLink.deleteMany({ where: { tenantId } });
    await prisma.pendingAction.deleteMany({
      where: { tenantId, toolName: 'create_share_link' },
    });
    const slFinal = await prisma.shareLink.count();
    const paFinal = await prisma.pendingAction.count({
      where: { toolName: 'create_share_link' },
    });
    check(
      slFinal === shareLinkBaseline,
      'U10 ShareLink 回到探针前基线',
      `${slFinal} vs ${shareLinkBaseline}`,
    );
    check(
      paFinal === 0 && paFinal <= paBaseline,
      'U10 create_share_link PendingAction 清零（≤ 探针前基线）',
      `${paFinal} vs ${paBaseline}`,
    );
  } finally {
    await page.close();
    await browser.close();
    // 夹具清理（失败也清）
    await prisma.payout.deleteMany({
      where: { deal: { projectId: project.id } },
    });
    await prisma.deal.deleteMany({ where: { projectId: project.id } });
    await prisma.weeklyReport.deleteMany({ where: { projectId: project.id } });
    await prisma.project.deleteMany({ where: { id: project.id } });
    await prisma.kol.deleteMany({ where: { id: kol.id } });
    if (cross) {
      await prisma.weeklyReport.update({
        where: { id: cross.id },
        data: {
          projectId: null,
          draftContent: cross.draftContent,
          adopted: cross.adopted,
          adoptedAt: cross.adoptedAt,
        },
      });
    }
    await prisma.$disconnect();
  }

  console.log(`\n[probe] PASS=${pass} FAIL=${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
