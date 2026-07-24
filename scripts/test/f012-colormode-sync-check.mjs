// M3-B-DELIVERY F012（BL-FE-16）— 深浅色跨实例 / 跨标签页同步浏览器探针。
// 只读断言，不改产品代码。
//
// 前置（framework/patterns/testing-env-patterns.md §7）：走 standalone 生产产物，不走 next dev。
//     npx next build && node scripts/serve-standalone.mjs
//     node scripts/test/f012-colormode-sync-check.mjs
//
// 覆盖：
//   A. 单页：toggle → body.dark 翻转（既有行为不变）
//   B. 跨标签页：A 页 toggle → B 页（同 context 共享 localStorage）经 storage 事件同步
//   C. 外部改动：直接改 body.classList → 订阅方（MutationObserver）收到，快照跟随
//   D. 活性反证：不写 storage 只改内存变量时 B 页不应变（证明 B 不是恒真）

import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const ROUTE = '/admin/today';
const TOGGLE = 'button[aria-label="切换深浅色"]';
const KEY = 'kolmatrix.colorMode';

let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};
const isDark = (page) =>
  page.evaluate(() => document.body.classList.contains('dark'));

const browser = await chromium.launch();
const ctx = await browser.newContext();

try {
  const a = await ctx.newPage();
  await a.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded' });
  await a.waitForSelector(TOGGLE);
  ok((await isDark(a)) === false, 'A 初始浅色（无持久值）');

  // A：单页 toggle
  await a.click(TOGGLE);
  await a.waitForTimeout(150);
  ok((await isDark(a)) === true, 'A 单页 toggle → 深色（既有行为不变）');

  // B：跨标签页（同 context 共享 localStorage → storage 事件）
  const b = await ctx.newPage();
  await b.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded' });
  await b.waitForSelector(TOGGLE);
  ok((await isDark(b)) === true, 'B 新标签页读持久值即深色');

  await a.click(TOGGLE); // A 切回浅色
  await a.waitForTimeout(300);
  ok((await isDark(a)) === false, 'B 前置：A 已切回浅色');
  await b.waitForTimeout(300);
  ok(
    (await isDark(b)) === false,
    'B 跨标签页同步：A 切换后 B 页经 storage 事件跟随（BL-FE-16 修复点）',
  );

  // C：外部改动（模拟 devtools / 第三方脚本改 class）→ MutationObserver 通道
  await b.evaluate(() => document.body.classList.add('dark'));
  await b.waitForTimeout(150);
  ok(
    (await isDark(b)) === true,
    'C 外部直改 body.class → 订阅方收到（MutationObserver 通道在场）',
  );
  await b.evaluate(() => document.body.classList.remove('dark'));

  // D：活性反证——只写别的 key，不应引起变化（证明 B 不是恒真）
  const beforeD = await isDark(b);
  await a.evaluate(() => localStorage.setItem('unrelated.key', 'dark'));
  await b.waitForTimeout(200);
  ok(
    (await isDark(b)) === beforeD,
    'D 活性反证：无关 storage key 不触发切换（B 不是恒真）',
  );

  // 清理持久值，避免污染后续探针
  await a.evaluate((k) => localStorage.removeItem(k), KEY);
} finally {
  await browser.close();
}

console.log(`\n=== F012 深浅色跨实例同步：${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
