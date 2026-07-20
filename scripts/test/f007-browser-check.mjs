// AGENT-FOUNDATION F007 — 浏览器实测（Playwright chromium）
// 验证：CopilotPanel 渲染 + 专家头(职责/隔离) + 发消息→KOL 卡片流 + 多人格切换 + 协同交接 + console 无 error。
// 运行：node scripts/test/f007-browser-check.mjs   （需 dev server 在 :3000）

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
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
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  // ── 1) match 环节：/admin/discovery → 匹配 Agent ──
  await page.goto(`${BASE}/admin/discovery`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const panelText = await page.textContent('body');
  ok(panelText.includes('多 Agent 编队'), 'CopilotPanel 常驻渲染（多 Agent 编队）');
  ok(panelText.includes('匹配 Agent'), '专家头显示当前人格=匹配 Agent（/discovery→match）');
  ok(panelText.includes('职责') && panelText.includes('隔离'), '专家头常驻显示 职责 + 隔离（否定式护栏）');

  // ── 2) 发消息 → search_kols → KOL 卡片流 ──
  const input = page.locator('aside input[placeholder*="说"]').first();
  await input.fill('帮我找几个坦克世界解说 YouTuber');
  await input.press('Enter');
  // 等工具结果卡片（匹配徽标 or KOL 卡片）出现
  await page
    .waitForSelector('aside :text("% 匹配")', { timeout: 45000 })
    .catch(() => {});
  await page.waitForTimeout(2000);
  const afterSend = await page.textContent('body');
  ok(/\d+% 匹配/.test(afterSend), '发消息后 canvas 渲染 KOL 卡片流（含 % 匹配徽标，真实 seed 数据）');
  ok(afterSend.includes('位候选'), 'KOL 卡片流含候选计数');

  // ── 3) 多人格切换：/admin/outreach → 触达 Agent（对话清空 + 新专家）──
  await page.goto(`${BASE}/admin/outreach`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const reachText = await page.textContent('body');
  ok(reachText.includes('触达 Agent'), '切 /admin/outreach → 专家头变触达 Agent（多人格切换可见）');
  ok(!/\d+% 匹配/.test(reachText), 'context key 变化 → 对话清空（上个环节的 KOL 卡片不再显示）');

  // ── 4) 协同交接可视化（demo handoff match→reach）──
  // handoff collab 在消息区底部；展开看
  const hasCollab = reachText.includes('协同交接') || (await page.textContent('body')).includes('协同交接');
  ok(hasCollab, '协同交接区渲染（多 Agent 联动·点开看交接）');
  const collabToggle = page.locator('aside :text("→")').first();
  if (await collabToggle.count()) {
    await collabToggle.click().catch(() => {});
    await page.waitForTimeout(500);
    const expanded = await page.textContent('body');
    ok(expanded.includes('交接物'), '交接可展开看 交接对/摘要/交接物（A→B）');
  } else {
    ok(false, '协同交接 A→B 可展开（未找到交接项）');
  }

  // ── 5) console 无 error ──
  const realErrors = consoleErrors.filter(
    (e) => !/favicon|404|Failed to load resource/.test(e),
  );
  ok(realErrors.length === 0, `浅色 console 无 error（实测 ${realErrors.length} 条）`);
  if (realErrors.length) realErrors.slice(0, 5).forEach((e) => console.log(`    ! ${e.slice(0, 120)}`));

  console.log(`\n[f007-browser] PASS ${pass} / FAIL ${fail}`);
} finally {
  await browser.close();
}
process.exit(fail === 0 ? 0 : 1);
