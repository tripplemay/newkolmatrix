// M1-C-LIST-TODAY READINESS — f007 守护面 L1 替代探针（Evaluator 产物，2026-07-22）
//
// 背景：`npm run f007:browser`（scripts/test/f007-browser-check.mjs）自 AGENT-FOUNDATION
// （2026-07-20 最后跑绿）后锚点陈旧，当前无法跑绿，且陈旧点全部先于 M1-C：
//   1. :34 「多 Agent 编队」— ARCH-M05-F003 (2284333) 三区外壳改造后仅存于 /preview/agent-canvas
//   2. :36 「隔离」— FE-REFACTOR-F001 (f7fc3cf) 术语统一为「职责/边界」
//   3. :39 placeholder*="说" — ARCH-M05-F003 (2284333) 改为「问 Agent 或下达任务…」，fill 超时崩溃
// 且其 §2（发消息→KOL 卡片流）是真实网关聊天调用 [L2 计费]，未授权环境不可跑。
//
// 本探针以现行文案锚点复刻 f007 的 L1 可跑守护面（§1 面板常驻 / §3 多人格切换+旧 id 深链 /
// §4 协同交接 / §5 console 无 error），用于回归判定；[L2] §2 留待授权后由修缮版 f007 覆盖。
// 前置：已 next build 且 standalone server 起在 :3000（testing-env-patterns §7）。

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
  // ── 1) 面板常驻（/admin/creators → match 人格），现行文案锚 ──
  await page.goto(`${BASE}/admin/creators`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const aside = page.locator('aside').first();
  ok((await aside.count()) === 1, 'CopilotPanel aside 常驻渲染');
  const input = page.locator('aside input[placeholder*="问 Agent"]').first();
  ok((await input.count()) === 1, '输入框在场（placeholder=「问 Agent 或下达任务…」，现行文案）');
  const scope = await page.locator('aside div.border-l-4').first().innerText().catch(() => '');
  ok(scope.includes('匹配 Agent'), '专家头(ExpertScope)=匹配 Agent（/creators→match）');
  const asideText = await aside.innerText();
  ok(asideText.includes('职责') && asideText.includes('边界'), '专家头常驻显示 职责 + 边界（FE-REFACTOR 术语，原「隔离」）');

  // ── 3) 多人格切换 + 旧 id 深链（starlight-protocol→xg alias，F005 D-E 保留面）──
  await page.goto(`${BASE}/admin/campaigns/starlight-protocol?env=reach`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  const scopeReach = await page.locator('aside div.border-l-4').first().innerText().catch(() => '');
  ok(scopeReach.includes('触达 Agent'), '旧 id 深链 ?env=reach → 专家头切触达 Agent（多人格切换 + alias 兼容）');
  const reachText = await page.textContent('body');
  ok(!/\d+% 匹配/.test(reachText), 'context 无残留 KOL 卡片（对话按 context key 隔离）');

  // ── 4) 协同交接可视化（demo handoff match→reach）──
  // 锚点用现行文案：环节上下文标签为「本环节协同」（HandoffPanel stage 三元文案，
  // ARCH-M05-F003 起；非环节上下文才是「协同交接」）；demo handoff 摘要句唯一可辨。
  ok(reachText.includes('本环节协同'), '本环节协同区渲染（HandoffPanel 环节上下文标签，现行文案）');
  ok(reachText.includes('匹配 Agent 交接：为《星轨协议》筛出 3 位坦克世界解说候选'), 'demo handoff（match→reach，DB 真行经 /api/handoffs）在场');
  // 展开钮分隔符现为「↔」（HandoffCard；f007 原锚「→」为 AGENT-FOUNDATION 时代文案）。
  const collabToggle = page.locator('aside :text("↔")').first();
  if (await collabToggle.count()) {
    await collabToggle.click().catch(() => {});
    await page.waitForTimeout(500);
    const expanded = await page.textContent('body');
    ok(expanded.includes('交接物'), '交接可展开看 交接对/摘要/交接物（A↔B）');
  } else {
    ok(false, '协同交接 A↔B 可展开（未找到交接项）');
  }

  // ── 5) console 无 error ──
  const realErrors = consoleErrors.filter((e) => !/favicon|404|Failed to load resource/.test(e));
  ok(realErrors.length === 0, `console 无 error（实测 ${realErrors.length} 条）`);
  if (realErrors.length) realErrors.slice(0, 5).forEach((e) => console.log(`    ! ${e.slice(0, 120)}`));

  console.log(`\n[m1c-readiness-f007-l1-substitute] PASS ${pass} / FAIL ${fail}`);
} finally {
  await browser.close();
}
process.exit(fail === 0 ? 0 : 1);
