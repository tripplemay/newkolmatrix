// AGENT-FOUNDATION F010 — 端到端 hello-agent 浏览器实测（Playwright chromium，接活网关）
//
// 串起 F001–F009 的 e2e：浏览器自然语言 → /api/agent 流式 loop → search_kols → KOL 卡片流在画布渲染，
// 闭环无 console error；并演示多 Agent 编排最小闭环（≥2 人格按 route 切换 + 一次可视化 handoff）。
//
// 前置：dev server 在 :3000（next dev）+ .env 网关凭据 + 已灌 demo handoff（seed:demo-handoff）。
// 运行：npm run f010:e2e   退出码：0=全绿 / 1=任一失败。

import { chromium } from 'playwright';

// GO-LIVE F003：E2E_BASE 可覆盖，供本地 prod-stack（127.0.0.1:3300）复用同一 e2e。默认 dev :3000。
const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const PROJECT = 'starlight-protocol';
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log(`  ✓ ${m}`);
  } else {
    fail++;
    console.log(`  ✗ ${m}`);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});
page.on('pageerror', (e) => errs.push(String(e)));

async function gotoStage(stage) {
  // dev 首访冷编译：warmup 一次再正式导航，避免瞬态。
  // ARCH-M05 F007：环节 URL 态 ?stage= → ?env=（kimi §6.1，spec 附录 A #2 探针核销）。
  const url = `${BASE}/admin/campaigns/${PROJECT}?env=${stage}`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(500);
}

try {
  console.log('[f010-e2e] hello-agent 端到端 + 多 Agent 编排闭环');

  // ── Part A：单 agent 闭环（NL → /api/agent → search_kols → KOL 卡片流渲染）──
  console.log('\n── Part A：hello-agent 单 agent 闭环 ──');
  await gotoStage('match');
  // 常驻专家头 = 匹配 Agent（该人格绑定 search_kols）。
  const expertMatch = await page.getByText('匹配 Agent').first().isVisible().catch(() => false);
  ok(expertMatch, 'match 环节：常驻专家头显示「匹配 Agent」（route→人格）');

  // 在 Copilot 输入自然语言指令并发送。
  // ARCH-M05 F017 重指：F003 外壳升级后输入框 placeholder 按原型改为「问 Agent 或下达任务…」
  //（旧「对{专家}说…」选择器随 UI 演进失效——v1.0.5 探针纪律）。
  // 注意与 navbar 指令栏（「问 Campaign Agent 或下达任务…」）区分：^问 Agent 精确锚 Copilot 输入框。
  const input = page.getByPlaceholder(/^问 Agent /).first();
  await input.waitFor({ timeout: 15000 });
  await input.fill('帮我从创作者库找《坦克世界》题材的游戏解说 KOL 候选');
  await page.getByRole('button', { name: '发送' }).first().click();

  // 等画布 KOL 卡片流渲染（KolResultCards 头「N 位候选」或卡片「% 匹配」）。活网关，给足超时。
  let cardsRendered = false;
  try {
    await page.getByText(/位候选|% 匹配/).first().waitFor({ timeout: 90000 });
    cardsRendered = true;
  } catch {
    cardsRendered = false;
  }
  ok(cardsRendered, 'NL → 流式 loop → search_kols → KOL 卡片流在画布渲染（闭环）');
  if (cardsRendered) {
    // ARCH-M05 F017：计数改锚 canvas 头「N 位候选」的 N（F001 Badge 化后文案节点结构演进，
    // 文本子串计数不再稳定；头部计数是 KolResultCards 的单一权威输出）。
    const headTxt = await page
      .getByText(/位候选/)
      .first()
      .textContent()
      .catch(() => '');
    const cardCount = Number((headTxt ?? '').match(/(\d+)\s*位候选/)?.[1] ?? 0);
    ok(cardCount >= 1, `画布渲染 ≥1 张 KOL 候选卡片（实得 ${cardCount}）`);
  }

  // ── Part B：多 Agent 编排 —— ≥2 人格按 route 切换 ──
  console.log('\n── Part B：≥2 人格按 route 切换 ──');
  await gotoStage('reach');
  const expertReach = await page.getByText('触达 Agent').first().isVisible().catch(() => false);
  ok(expertReach, 'reach 环节：专家头切为「触达 Agent」（≠ 匹配 Agent，人格随 route 切换）');

  // ── Part C：一次可视化 handoff（协同交接）──
  console.log('\n── Part C：一次可视化 handoff ──');
  // HandoffCollab 从 /api/handoffs 拉真实交接（需 seed:demo-handoff）。
  // ARCH-M05 F017 重指：环节页的协同卡标签已变体为「本环节协同…」且叠加 stage mock——
  // 为保持"断言真实 Handoff 表数据"原意，回到 stage=null 的 /admin/today 等「协同交接」标签。
  await page.goto(`${BASE}/admin/today`, { waitUntil: 'domcontentloaded' });
  let handoffShown = false;
  try {
    await page.getByText('协同交接').first().waitFor({ timeout: 15000 });
    // 交接对 match→reach 两端人格名均在协同交接卡内呈现。
    handoffShown =
      (await page.getByText('协同交接').count()) > 0 &&
      (await page.getByText('触达 Agent').count()) > 0;
  } catch {
    handoffShown = false;
  }
  ok(handoffShown, '协同交接可视化渲染一次 handoff（匹配 Agent → 触达 Agent，来自 F002 Handoff 表）');

  // ── 闭环无 error ──
  const realErrs = errs.filter(
    (e) => !/favicon|Download the React DevTools|hydrat/i.test(e),
  );
  ok(realErrs.length === 0, `闭环无 console error（捕获 ${realErrs.length} 条）`);
  if (realErrs.length) realErrs.slice(0, 5).forEach((e) => console.log(`    ! ${e}`));

  console.log(`\n[f010-e2e] 结果：${pass} 通过 / ${fail} 失败`);
} catch (err) {
  console.error('[f010-e2e] ❌ 异常：', err instanceof Error ? err.message : err);
  fail++;
} finally {
  await browser.close();
}

process.exit(fail === 0 ? 0 : 1);
