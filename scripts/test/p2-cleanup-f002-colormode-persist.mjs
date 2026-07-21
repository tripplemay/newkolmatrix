// P2-CLEANUP F002 — 深色模式持久化回归探针（BL-FE-12）。
// 只读断言，不改产品代码。
//
// 前置（framework/patterns/testing-env-patterns.md §7）：UI 实测一律走 standalone 生产产物，
// 不走 `next dev`（Next 15 devtools segment-explorer × RSC manifest 冲突会全路由 500/白屏）。
//     npx next build
//     PORT=3000 node .next/standalone/server.js
//     node scripts/test/p2-cleanup-f002-colormode-persist.mjs
//
// 覆盖：
//   A. 默认浅色（全新 context 无持久值 —— 现有浅色基线不得被改造动到）
//   B. 切深色 → 刷新仍深色
//   C. 切回浅色 → 刷新仍浅色
//   D. 清 localStorage → 刷新回落浅色
//   E. 写入损坏值 → 刷新回落浅色
//   F. pre-paint 证明：延迟 app chunk（React 未 hydrate）时 body.dark 已就位 → 刷新无浅色闪烁
//      （若深色仅由 React 挂载后补上，本条必红——这是「无闪烁」的活性断言）

import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const KEY = 'kolmatrix.colorMode';
const ROUTE = '/admin/today';
const TOGGLE = 'button[aria-label="切换深浅色"]';

let pass = 0;
let fail = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const isDark = () => page.evaluate(() => document.body.classList.contains('dark'));
const stored = () => page.evaluate((k) => localStorage.getItem(k), KEY);
const load = async () => {
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await page.locator(TOGGLE).waitFor({ timeout: 20_000 });
};

// --- A. 默认浅色 -------------------------------------------------------
await load();
ok((await isDark()) === false, 'A 默认浅色（无持久值）');
ok((await stored()) === null, 'A 未切换前不写 localStorage', `实得=${await stored()}`);

// --- B. 切深色 → 刷新仍深色 --------------------------------------------
await page.locator(TOGGLE).click();
ok((await isDark()) === true, 'B 切换后即时深色');
ok((await stored()) === 'dark', 'B 已持久化 dark', `实得=${await stored()}`);
await load();
ok((await isDark()) === true, 'B 刷新后仍深色');

// --- C. 切回浅色 → 刷新仍浅色 ------------------------------------------
await page.locator(TOGGLE).click();
ok((await isDark()) === false, 'C 切回即时浅色');
ok((await stored()) === 'light', 'C 已持久化 light', `实得=${await stored()}`);
await load();
ok((await isDark()) === false, 'C 刷新后仍浅色');

// --- D. 清 localStorage → 回落浅色 -------------------------------------
await page.evaluate(() => localStorage.clear());
await load();
ok((await isDark()) === false, 'D 清 localStorage 后回落浅色');

// --- E. 损坏值 → 回落浅色 ----------------------------------------------
await page.evaluate((k) => localStorage.setItem(k, '{"not":"a mode"}'), KEY);
await load();
ok((await isDark()) === false, 'E 损坏值回落浅色');

// --- F. pre-paint 证明（无闪烁） ----------------------------------------
// 深色持久值就位后，延迟 app chunk 让 React 来不及 hydrate；此刻 body.dark 若已在，
// 只能来自 layout.tsx 的 pre-paint 内联脚本 → 证明深色早于绘制、不存在浅色首帧。
await page.evaluate((k) => localStorage.setItem(k, 'dark'), KEY);
await page.route('**/_next/static/chunks/**', async (route) => {
  await new Promise((r) => setTimeout(r, 3_000));
  await route.continue();
});
await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'commit' });
// 采样锚点：内联脚本是同步执行的，故文档中排在它之后的任一节点一旦出现，它必已跑完。
// （不能用 `!!document.body` —— <body> 标签解析完就为真，早于其内联脚本执行，会误红。）
await page.waitForFunction(
  () => !!document.querySelector('script[src*="webpack"]'),
  null,
  { timeout: 10_000 },
);
const prePaint = await page.evaluate(() => ({
  dark: document.body.classList.contains('dark'),
  // 注意 <body id="root">，故不能用 #root.textContent 判 hydrate（恒非空）。
  // 用真实 app 元素：navbar 主题钮由 React 渲染，未 hydrate 时不存在。
  hydrated: !!document.querySelector('button[aria-label="切换深浅色"]'),
}));
ok(prePaint.dark === true, 'F pre-paint 已置深色（无浅色闪烁）');
ok(prePaint.hydrated === false, 'F 断言时 React 确未 hydrate（本条保证 F 上一条不是假绿）');

// F-mut 检测器活性证明（框架 v1.0.6）：把内联脚本从 document HTML 里剔掉重放，
// 同样条件下 F 必须翻红。若仍绿，说明 F 测的不是这段脚本 —— 断言是死的。
await page.route(`${BASE}${ROUTE}`, async (route) => {
  const res = await route.fetch();
  const html = (await res.text()).replace(
    /<script>try\{if\(localStorage[\s\S]*?<\/script>/,
    '',
  );
  await route.fulfill({ response: res, body: html });
});
await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'commit' });
await page.waitForFunction(
  () => !!document.querySelector('script[src*="webpack"]'),
  null,
  { timeout: 10_000 },
);
const mutated = await page.evaluate(() => document.body.classList.contains('dark'));
ok(mutated === false, 'F-mut 抽掉内联脚本后 pre-paint 深色消失（证明 F 非死断言）');
await page.unroute(`${BASE}${ROUTE}`);
await page.unroute('**/_next/static/chunks/**');

await browser.close();
console.log(`\n=== F002 深色持久化：${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log(`FAILED: ${fails.join(' | ')}`);
  process.exit(1);
}
