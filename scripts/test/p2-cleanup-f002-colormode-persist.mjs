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
  // M1-A-BRIEF F002 — hydrate 判据换实现。
  //
  // 原判据是「navbar 主题钮存在与否」，注释写「未 hydrate 时不存在」。
  // 那个前提只在【全站包 NoSSR、服务端什么都不渲染】时成立；F002 恢复 SSR 后，
  // 该按钮本来就在服务端 HTML 里，DOM 存在性不再能代理 hydration，此判据会恒真。
  //
  // 换成 React 自己的痕迹：React 在【hydrate 时】才往容器节点挂 `__reactContainer$<后缀>`
  // 内部属性，SSR 出来的静态 HTML 上没有。这条与「服务端渲不渲染」解耦，SSR 前后都成立。
  // 容器是 `document` 而非 body —— Next App Router 走 hydrateRoot(document, …)，
  // body 上挂的是 `__reactFiber$`。（写成 document.body 会恒假，即死断言；
  // 下面 F-live 那条活性证明就是为抓这个而加，实装期确实抓到过一次。）
  hydrated: Object.keys(document).some((k) =>
    k.startsWith('__reactContainer$'),
  ),
}));
ok(prePaint.dark === true, 'F pre-paint 已置深色（无浅色闪烁）');
ok(prePaint.hydrated === false, 'F 断言时 React 确未 hydrate（本条保证 F 上一条不是假绿）');

// F-live 上一条判据自身的活性证明（框架 v1.0.7：断言换实现后须重审强度）。
// 上一条断言 `hydrated === false`；若该表达式【恒假】（比如 React 换了内部属性名），
// 它会永远绿，从而把「pre-paint 早于 hydrate」这一保证悄悄架空。
// 故在同一页等 hydrate 真正完成，同一表达式必须翻真——证明它分得清两种状态。
let hydrateDetectorLive = false;
try {
  await page.waitForFunction(
    () =>
      Object.keys(document).some((k) => k.startsWith('__reactContainer$')),
    null,
    { timeout: 15_000 },
  );
  hydrateDetectorLive = true;
} catch {
  hydrateDetectorLive = false;
}
ok(
  hydrateDetectorLive,
  'F-live hydrate 判据在 hydrate 完成后确会翻真（证明上条不是恒假的死断言）',
);

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
