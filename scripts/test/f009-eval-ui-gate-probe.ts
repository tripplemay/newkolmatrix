// M4-INSIGHT F009 — Evaluator 独立 UI + 闸门真链探针（浏览器实测，恒 mock 零公开暴露）
//
// 用法（先起 :3000 standalone，网关凭据须伪造 —— web-runtime-patterns §4.5）：
//   DATABASE_URL=... npx tsx scripts/test/f009-eval-ui-gate-probe.ts
//
// 覆盖 acceptance：
//  U1 V8 19 元素逐处在场（DOM 实测，非源码阅读）
//  U2 差异列三值三样式：三个真实项目分别渲染 绿 / 红 / 中性灰 class（压二态即红）
//  U3 反向 guardrail：InsightEnv 根仅 3 个直接子块（recon 双列 / 图卡双列 / retro），无原型外新增
//  U4 分享 = 真闸门链（点击 → POST /api/insight/share → GET 详情 → 确认卡渲染服务端真 harm）
//     · 确认前副作用零发生（ShareLink 行数不变）· 取消不产生任何写入
//  U5 confirm→execute 真消费票：ShareLink 落库（scope=project + projectId + gateLogId + tokenHash）
//     + irrev 留痕；payloadRef 非公网 URL；toast 如实标注 mock 通道
//  U6 采纳 = internal 无弹窗（POST /api/insight/adopt → Toast → 事实态「已采纳」disabled）
//  U7 空态语义（项目未命中 → 对照表空态文案 + retro 空态文案 + 采纳钮隐藏）
//  U8 终态零暴露核证：探针夹具全清理后 dev 库 ShareLink 行数回到探针前基线
//
// 探针只写夹具数据、只读产品代码；结束时自清理（失败也在 finally 清理）。

import { chromium, type Page } from 'playwright';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { DEV_TENANT_SLUG, systemTenantId } from '../../src/lib/agent/context';

const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3000';
const TAG = `f009eval${process.pid}`;

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

interface Fixture {
  up: string;
  down: string;
  flat: string;
}

async function makeProject(
  tenantId: string,
  key: string,
  budget: number,
  payouts: number[],
  goalExposure?: number,
): Promise<string> {
  const project = await prisma.project.create({
    data: {
      tenantId,
      name: `【${TAG}】${key}`,
      budgetTotal: budget,
      currency: 'USD',
      goal:
        goalExposure == null
          ? undefined
          : ({
              targetExposure: goalExposure,
              periodStart: '2026-07-01',
              periodEnd: '2026-07-31',
            } as unknown as Prisma.InputJsonValue),
    },
  });
  const kol = await prisma.kol.create({
    data: { tenantId, canonicalHandle: `${TAG}-${key}` },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId: project.id,
      kolId: kol.id,
      termsJson: {} as unknown as Prisma.InputJsonValue,
      payouts: {
        create: payouts.map((amount, i) => ({
          tenantId,
          payee: `${TAG}-${key}-${i}`,
          amount,
          currency: 'USD',
          basis: '探针夹具',
          status: 'released' as const,
        })),
      },
    },
  });
  return project.id;
}

async function textOf(page: Page): Promise<string> {
  return (await page.textContent('body')) ?? '';
}

/**
 * 点「生成对外分享报告」直到确认卡出现（dev server 首访 hydration 慢时首击可能落在
 * 未 hydrate 的按钮上——这是探针鲁棒性，与被验行为无关；标准 standalone 下一击即中）。
 */
async function openShareGate(page: Page): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: '生成对外分享报告' }).click();
    try {
      await page.getByText('确认对外分享').waitFor({ timeout: 15_000 });
      return;
    } catch {
      if (i === 3) throw new Error('确认卡未出现（4 次点击均无响应）');
      await page.waitForTimeout(1_000);
    }
  }
}

async function main(): Promise<void> {
  const tenantId = await systemTenantId(DEV_TENANT_SLUG);
  const shareBefore = await prisma.shareLink.count();
  console.log(
    `[probe] dev tenant=${tenantId} · ShareLink 基线行数=${shareBefore}`,
  );

  const fx: Fixture = {
    up: await makeProject(tenantId, 'up', 3000, [1200.5], 3_000_000),
    down: await makeProject(tenantId, 'down', 1000, [1500]),
    flat: await makeProject(tenantId, 'flat', 1000, [600, 400]),
  };
  const report = await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: fx.up,
      period: `${TAG}-W01`,
      draftContent: `探针复盘草案正文 ${TAG}`,
    },
  });
  await prisma.weeklyReport.create({
    data: {
      tenantId,
      projectId: fx.flat,
      period: `${TAG}-W02`,
      draftContent: `探针已采纳草案 ${TAG}`,
      adopted: true,
      adoptedAt: new Date(),
    },
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
  });

  try {
    /* ---------------- U1 19 元素在场（DOM 实测） ---------------- */
    await page.goto(`${BASE}/admin/campaigns/${fx.up}?env=insight`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText('证据缺口').first().waitFor({ timeout: 30_000 });

    const headers = await page.locator('table thead th').allInnerTexts();
    check(
      headers.join('|').includes('指标') &&
        headers.join('|').includes('原目标') &&
        headers.join('|').includes('实际') &&
        headers.join('|').includes('差异'),
      'U1-①②③④ 对照表 4 列表头',
      headers.join(' / '),
    );

    const rowMetrics = await page
      .locator('table tbody tr td:first-child')
      .allInnerTexts();
    check(
      rowMetrics.length === 4 &&
        rowMetrics[0].includes('目标曝光') &&
        rowMetrics[1].includes('花费 · 已放款') &&
        rowMetrics[2].includes('有效转化') &&
        rowMetrics[3].includes('ROI'),
      'U1 对照表 4 行（口径后缀如实）',
      rowMetrics.join(' / '),
    );

    const bodyText = await textOf(page);
    check(
      bodyText.includes('$1,200.50'),
      'U1 花费实际 = spend 真源渲染',
      '$1,200.50',
    );
    const insufficientCount = (bodyText.match(/证据不足/g) ?? []).length;
    check(
      insufficientCount >= 3 && !/\$0\.00/.test(bodyText),
      'U1 分子无源三行显「证据不足」且无 $0.00 冒充',
      `证据不足 ×${insufficientCount}`,
    );

    const gapRows = page.locator('span', { hasText: '无回传源，本期无法计入' });
    const gapCount = await gapRows.count();
    check(
      bodyText.includes('证据缺口 2') && gapCount === 2,
      'U1-⑤⑥ 证据缺口卡 eyebrow 计数 + gaprow ×N 真值',
      `gaprow=${gapCount}`,
    );

    const pendingPlaceholders = (bodyText.match(/待接入/g) ?? []).length;
    check(
      pendingPlaceholders >= 2,
      'U1-⑦⑭ 渠道 / 受众两图卡「待接入」占位（M5 登记例外，区块未删）',
      `占位 ×${pendingPlaceholders}`,
    );

    check(
      bodyText.includes('Agent 复盘草案 · 采纳后可复用到下个项目') &&
        bodyText.includes(`探针复盘草案正文 ${TAG}`),
      'U1-⑮⑯⑰ retro 卡 dlbl + 正文 = WeeklyReport 真值',
    );
    check(
      (await page.getByRole('button', { name: '采纳结论' }).count()) === 1,
      'U1-⑱ 采纳结论按钮在场（未采纳态）',
    );
    const shareBtn = page.getByRole('button', { name: '生成对外分享报告' });
    check(await shareBtn.isVisible(), 'U1-⑲ 🚪 生成对外分享报告红 gate 在场');
    const shareClass = (await shareBtn.getAttribute('class')) ?? '';
    check(
      /red/.test(shareClass),
      'U1-⑲ 分享钮 danger（红）变体',
      shareClass.slice(0, 60),
    );

    /* ---------------- U3 反向 guardrail：根仅 3 个直接子块 ---------------- */
    const rootShape = await page.evaluate(() => {
      const retro = document.querySelector('[class*="from-brandSoft-a"]');
      const root = retro?.parentElement;
      if (!root) return null;
      return {
        children: root.childElementCount,
        classes: Array.from(root.children).map((c) => c.className.slice(0, 40)),
      };
    });
    check(
      rootShape?.children === 3,
      'U3 反向 guardrail：InsightEnv 根恰 3 个直接子块（recon / 图卡 / retro）',
      JSON.stringify(rootShape),
    );

    /* ---------------- U2 三值三样式（三项目分别取差异单元 class） ---------------- */
    const deltaClassOf = async (projectId: string): Promise<string> => {
      await page.goto(`${BASE}/admin/campaigns/${projectId}?env=insight`, {
        waitUntil: 'domcontentloaded',
      });
      await page.getByText('证据缺口').first().waitFor({ timeout: 30_000 });
      // 花费行（第 2 行）差异单元（第 4 列）
      const cell = page.locator('table tbody tr').nth(1).locator('td').nth(3);
      const cls =
        (await cell.locator('span').first().getAttribute('class')) ?? '';
      const txt = (await cell.innerText()).trim();
      return `${cls}||${txt}`;
    };
    const upCls = await deltaClassOf(fx.up);
    const downCls = await deltaClassOf(fx.down);
    const flatCls = await deltaClassOf(fx.flat);
    check(
      upCls.includes('text-horizonGreen-500') && upCls.includes('-60%'),
      'U2 差异列 up → 绿（低于预算）',
      upCls,
    );
    check(
      downCls.includes('text-horizonRed-500') && downCls.includes('+50%'),
      'U2 差异列 down → 红（超预算）',
      downCls,
    );
    check(
      flatCls.includes('text-gray-500') &&
        !flatCls.includes('text-horizonGreen-500') &&
        !flatCls.includes('text-horizonRed-500'),
      'U2 差异列 flat → 中性灰（三值三样式未压二态）',
      flatCls,
    );

    /* ---------------- U6 采纳 internal（无弹窗） ---------------- */
    await page.goto(`${BASE}/admin/campaigns/${fx.up}?env=insight`, {
      waitUntil: 'domcontentloaded',
    });
    for (let i = 0; i < 4; i += 1) {
      await page.getByRole('button', { name: '采纳结论' }).click();
      try {
        await page.getByText('复盘结论已采纳').waitFor({ timeout: 8_000 });
        break;
      } catch {
        await page.waitForTimeout(1_000); // dev server hydration 慢时重击（探针鲁棒性）
      }
    }
    const afterAdoptText = await textOf(page);
    const adoptRow = await prisma.weeklyReport.findUnique({
      where: { id: report.id },
      select: { adopted: true, adoptedAt: true },
    });
    check(
      adoptRow?.adopted === true && adoptRow.adoptedAt != null,
      'U6 采纳落库（adopted=true + adoptedAt）',
    );
    check(
      afterAdoptText.includes('复盘结论已采纳'),
      'U6 采纳仅 Toast（internal 无确认弹窗）',
    );
    const gateVisibleAfterAdopt = await page
      .locator('section[role="dialog"], [role="dialog"]')
      .count();
    check(gateVisibleAfterAdopt === 0, 'U6 采纳全程无 GateConfirm 弹窗');
    // 采纳后事实态
    await page.goto(`${BASE}/admin/campaigns/${fx.up}?env=insight`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByText('证据缺口').first().waitFor({ timeout: 30_000 });
    const adoptedBtn = page.getByRole('button', { name: '已采纳' });
    check(
      (await adoptedBtn.count()) === 1 && (await adoptedBtn.isDisabled()),
      'U6 已采纳 → disabled 事实态（不再可重复采纳）',
    );

    /* ---------------- U4 分享真链：pending 停闸门 + 确认卡真 harm ---------------- */
    const shareCountBefore = await prisma.shareLink.count();
    const paBefore = await prisma.pendingAction.count();
    await openShareGate(page);
    const shareCountPending = await prisma.shareLink.count();
    const pa = await prisma.pendingAction.findFirst({
      where: { tenantId, toolName: 'create_share_link' },
      orderBy: { createdAt: 'desc' },
    });
    check(
      shareCountPending === shareCountBefore,
      'U4 确认前副作用零发生（ShareLink 行数不变）',
      `${shareCountBefore} → ${shareCountPending}`,
    );
    check(
      pa != null && pa.status === 'pending',
      'U4 已产生 PendingAction 且停在 pending（服务端强制）',
      `status=${pa?.status}`,
    );
    check(
      (await prisma.pendingAction.count()) === paBefore + 1,
      'U4 恰产生 1 条 PendingAction',
    );

    const modalText =
      (await page.locator('[role="dialog"]').last().innerText()) ?? '';
    const harmFromServer = (pa?.harmJson ?? {}) as Record<string, unknown>;
    check(
      modalText.includes(String(harmFromServer.scope ?? '###')),
      'U4 确认卡「数据范围」= 服务端 harm.scope 原文（前端不改写）',
      String(harmFromServer.scope),
    );
    check(
      modalText.includes(
        String((harmFromServer.targets as string[] | undefined)?.[0] ?? '###'),
      ),
      'U4 确认卡「对象」= 服务端 harm.targets 原文',
      String((harmFromServer.targets as string[] | undefined)?.join('、')),
    );
    check(
      modalText.includes('链接一经生成即暴露') && modalText.includes('有效期'),
      'U4 确认卡「依据」含红标 + 有效期（harm 三要素）',
    );
    check(
      modalText.includes(String(harmFromServer.summary ?? '###')),
      'U4 确认卡正文 = 服务端 harm.summary 原文',
    );
    check(
      modalText.includes('对外 · 链接一经生成即暴露'),
      'U4 irrev 红标行在场',
    );
    check(
      (await page.getByRole('button', { name: '生成链接' }).count()) === 1 &&
        (await page.getByRole('button', { name: '取消' }).count()) === 1,
      'U4 确认卡取消 ghost + 确认红钮双钮',
    );

    // 取消不写库
    await page.getByRole('button', { name: '取消' }).click();
    await page.waitForTimeout(600);
    check(
      (await prisma.shareLink.count()) === shareCountBefore &&
        (await prisma.pendingAction.findUnique({ where: { id: pa!.id } }))
          ?.status === 'pending',
      'U4 取消 → 无任何 ShareLink 写入，票据未被消费',
    );

    /* ---------------- U5 confirm → execute 真链 ---------------- */
    await openShareGate(page);
    await page.getByRole('button', { name: '生成链接' }).click();
    await page.getByText('分享链接已生成').waitFor({ timeout: 20_000 });
    const toastText = await textOf(page);
    check(
      toastText.includes('mock 通道 · 未对外公开暴露'),
      'U5 成功 Toast 如实标注 mock 通道（不冒充已公开）',
    );

    const links = await prisma.shareLink.findMany({
      where: { tenantId, projectId: fx.up },
    });
    check(links.length === 1, 'U5 ShareLink 恰落 1 行', `rows=${links.length}`);
    const link = links[0];
    check(link?.scope === 'project', 'U5 scope=project（V8 项目级，裁决 #3）');
    check(link?.projectId === fx.up, 'U5 projectId = 当前项目');
    check(
      !!link?.gateLogId,
      'U5 gateLogId 非空（经闸门）',
      String(link?.gateLogId),
    );
    const paAfter = await prisma.pendingAction.findFirst({
      where: { tenantId, toolName: 'create_share_link', status: 'executed' },
      orderBy: { createdAt: 'desc' },
    });
    check(
      link?.gateLogId === paAfter?.id && paAfter?.ticketUsedAt != null,
      'U5 gateLogId = 被消费的 PendingAction.id（两步票据链闭合）',
    );
    check(
      !!link?.tokenHash && /^[0-9a-f]{64}$/.test(link.tokenHash),
      'U5 DB 只存 tokenHash（sha256，明文不落库）',
    );
    check(
      !!link && !/^https?:\/\//i.test(link.payloadRef),
      'U5 payloadRef 非公网 URL（零真实公开暴露）',
      link?.payloadRef,
    );
    const irrev = await prisma.operationLog.count({
      where: { tenantId, kind: 'irrev', ref: paAfter?.id ?? '###' },
    });
    check(irrev === 1, 'U5 irrev 留痕恰 1 行（与业务写入同事务）');

    /* ---------------- U7 空态语义 ---------------- */
    await page.goto(
      `${BASE}/admin/campaigns/no-such-project-${TAG}?env=insight`,
      {
        waitUntil: 'domcontentloaded',
      },
    );
    await page.waitForTimeout(1500);
    const emptyText = await textOf(page);
    check(
      emptyText.includes('还没有度量事实——放款或承诺报价后自动生成对照账本'),
      'U7 对照表空态文案（硬锚，防静默空白）',
    );
    check(emptyText.includes('暂无复盘草案'), 'U7 retro 空态文案（不编草案）');
    check(
      (await page.getByRole('button', { name: '采纳结论' }).count()) === 0 &&
        (await page
          .getByRole('button', { name: '生成对外分享报告' })
          .count()) === 1,
      'U7 无草案 → 采纳钮隐藏（幽灵控件规则），分享钮保留',
    );
  } finally {
    await browser.close();
    /* ---------------- 清理 + U8 终态零暴露核证 ---------------- */
    const pas = await prisma.pendingAction.findMany({
      where: { tenantId, toolName: 'create_share_link' },
      select: { id: true },
    });
    await prisma.shareLink.deleteMany({
      where: { projectId: { in: [fx.up, fx.down, fx.flat] } },
    });
    await prisma.operationLog.deleteMany({
      where: { ref: { in: pas.map((p) => p.id) } },
    });
    await prisma.pendingAction.deleteMany({
      where: { id: { in: pas.map((p) => p.id) } },
    });
    await prisma.weeklyReport.deleteMany({
      where: { projectId: { in: [fx.up, fx.down, fx.flat] } },
    });
    await prisma.payout.deleteMany({
      where: { payee: { startsWith: TAG } },
    });
    await prisma.deal.deleteMany({
      where: { projectId: { in: [fx.up, fx.down, fx.flat] } },
    });
    await prisma.project.deleteMany({
      where: { id: { in: [fx.up, fx.down, fx.flat] } },
    });
    await prisma.kol.deleteMany({
      where: { canonicalHandle: { startsWith: TAG } },
    });
    const shareAfter = await prisma.shareLink.count();
    check(
      shareAfter === shareBefore,
      'U8 终态：夹具清理后 ShareLink 行数回到基线（零残留公开面）',
      `${shareBefore} → ${shareAfter}`,
    );
    await prisma.$disconnect();
    console.log(`\n[probe] PASS=${pass} FAIL=${fail}`);
    if (fail > 0) process.exitCode = 1;
  }
}

void main();
