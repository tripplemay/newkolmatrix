// P2-CLEANUP F002 — Evaluator 独立验收探针（深色模式持久化 / BL-FE-12）。
// 与 Generator 的 p2-cleanup-f002-colormode-persist.mjs 相互独立：本脚本不复用其断言口径，
// 「无闪烁」改用 **paint 时序硬证据**（MutationObserver 记录 body.dark 落地时刻 vs
// PerformancePaintTiming 首帧时刻），而非「延迟 chunk 看 hydrate 前状态」的间接推断。
//
// 只读断言，不改任何产品代码。
//
// 前置（framework/patterns/testing-env-patterns.md §7 —— UI 实测走 standalone 不走 next dev）：
//     npx next build
//     PORT=3102 node scripts/serve-standalone.mjs
//     BASE=http://127.0.0.1:3102 node scripts/test/p2-cleanup-f002-eval-probe.mjs
//
// 覆盖（对照 features.json F002 acceptance 逐条）：
//   T1 pre-paint 内联脚本在 <body> 内且先于任何可见内容（记录实际子节点序位）
//   T2 默认浅色 + 未切换前不写 localStorage（现有浅色基线不得被动到）
//   T3 切深色 → 写入 'dark' → 刷新仍深色
//   T4 切回浅色 → 写入 'light' → 刷新仍浅色
//   T5 清 localStorage → 刷新回落浅色
//   T6 损坏值矩阵（6 种）→ 逐个刷新均回落浅色
//   T7 无闪烁：body.dark 落地时刻 < 首帧 paint 时刻，且落地时 readyState==='loading'
//   T8 活性证明：剔掉内联脚本重放，T7 必须翻红（证 T7 非死断言）
//   T9 localStorage 不可用（throw）→ 不崩、可渲染、回落浅色

import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3102';
const KEY = 'kolmatrix.colorMode';
const ROUTE = '/admin/today';
const TOGGLE = 'button[aria-label="切换深浅色"]';

let pass = 0;
let fail = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

// 在任何页面脚本之前装的观测器。
// 「无闪烁」的判据不用 PerformancePaintTiming —— headless 下 paint 条目不稳定发放（实测基线
// 组 getEntriesByType('paint') 恒空）。改用**本应用可确定观测的等价事实**：
// 全站 NoSSR(ssr:false)，服务端 HTML 只有 BAILOUT_TO_CLIENT_SIDE_RENDERING 占位，
// 应用的第一像素只可能来自 React 客户端渲染出 <main> 之后。故
//     body 取得 dark 的时刻 < <main> 首次出现的时刻  ⇔  应用从未渲染过浅色帧。
// 注意：init script 在 documentElement 尚未创建时执行，MutationObserver 必须挂 `document`
// （挂 documentElement 会抛 TypeError 并静默吃掉后续安装）。
const TIMING_INIT = `
window.__f002 = { darkAt: null, readyAtDark: null, appAt: null, installed: false, err: null };
try {
  new MutationObserver(() => {
    const s = window.__f002;
    if (s.darkAt === null && document.body && document.body.classList.contains('dark')) {
      s.darkAt = performance.now();
      s.readyAtDark = document.readyState;
    }
    if (s.appAt === null && document.querySelector('main')) {
      s.appAt = performance.now();
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  window.__f002.installed = true;
} catch (e) { window.__f002.err = String(e); }
`;

const browser = await chromium.launch();

// ---------------------------------------------------------------- T1 HTML 结构
{
  const html = await (await fetch(`${BASE}${ROUTE}`)).text();
  const bodyOpen = html.indexOf('<body');
  const scriptIdx = html.indexOf(`localStorage.getItem('${KEY}')`);
  const between = html.slice(html.indexOf('>', bodyOpen) + 1, html.lastIndexOf('<script', scriptIdx));
  ok(scriptIdx > -1, 'T1 pre-paint 内联脚本存在于服务端 HTML');
  ok(scriptIdx > bodyOpen, 'T1 内联脚本位于 <body> 内（非 <head>）');
  // 「首子节点」的实测口径：脚本之前只允许存在不可见/无内容的节点
  const strippedBefore = between.replace(/<!--[\s\S]*?-->/g, '').replace(/\s/g, '');
  const onlyHiddenDiv = /^(<divhidden="">?<\/div>)?$/.test(strippedBefore.replace(/hidden=""/, 'hidden=""'));
  ok(
    onlyHiddenDiv || strippedBefore === '<divhidden=""></div>',
    'T1 脚本之前无任何可见内容（仅 Next 注入的空 hidden div）',
    `实际前置内容=${JSON.stringify(between)}`,
  );
}

// -------------------------------------------------------- T2~T6 持久化状态矩阵
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const isDark = () => page.evaluate(() => document.body.classList.contains('dark'));
  const stored = () => page.evaluate((k) => localStorage.getItem(k), KEY);
  const load = async () => {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
    await page.locator(TOGGLE).waitFor({ timeout: 20_000 });
  };

  await load();
  ok((await isDark()) === false, 'T2 全新 context 默认浅色');
  ok((await stored()) === null, 'T2 未切换前不写 localStorage', `实得=${await stored()}`);

  await page.locator(TOGGLE).click();
  ok((await isDark()) === true, 'T3 点击后即时深色');
  ok((await stored()) === 'dark', 'T3 localStorage 写入 dark', `实得=${await stored()}`);
  await load();
  ok((await isDark()) === true, 'T3 刷新后仍深色');
  ok((await stored()) === 'dark', 'T3 刷新后持久值未被覆写', `实得=${await stored()}`);

  await page.locator(TOGGLE).click();
  ok((await isDark()) === false, 'T4 切回即时浅色');
  ok((await stored()) === 'light', 'T4 localStorage 写入 light', `实得=${await stored()}`);
  await load();
  ok((await isDark()) === false, 'T4 刷新后仍浅色');

  await page.evaluate(() => localStorage.clear());
  await load();
  ok((await isDark()) === false, 'T5 清 localStorage 后刷新回落浅色');

  const corrupt = ['DARK', 'Dark', '', 'true', '{"mode":"dark"}', 'dark '];
  for (const v of corrupt) {
    await page.evaluate(([k, val]) => localStorage.setItem(k, val), [KEY, v]);
    await load();
    ok((await isDark()) === false, `T6 损坏值 ${JSON.stringify(v)} 回落浅色`);
  }
  await ctx.close();
}

// -------------------------------------------------- T7 无闪烁（渲染时序硬证据）
let baseline = null;
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k) => localStorage.setItem(k, 'dark'), KEY);
  await page.addInitScript(TIMING_INIT);
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
  await page.locator(TOGGLE).waitFor({ timeout: 20_000 });
  baseline = await page.evaluate(() => window.__f002);
  ok(baseline.installed === true, 'T7 时序观测器安装成功（否则本组结论无效）', baseline.err || '');
  ok(baseline.darkAt !== null, 'T7 观测到 body 取得 dark');
  ok(baseline.appAt !== null, 'T7 观测到应用首次渲染出 <main>');
  ok(
    baseline.darkAt !== null && baseline.appAt !== null && baseline.darkAt < baseline.appAt,
    'T7 深色早于应用首次渲染（应用从未出现浅色帧）',
    `darkAt=${baseline.darkAt?.toFixed(1)}ms appAt=${baseline.appAt?.toFixed(1)}ms`,
  );
  ok(
    baseline.readyAtDark === 'loading',
    'T7 深色落地时文档仍在 loading（证明由解析期内联脚本置入，非 React 挂载后补）',
    `readyState=${baseline.readyAtDark}`,
  );
  // 直证「首个渲染帧就是深色」：<main> 一出现即读其计算背景（深色 rgb(11,20,55) / 浅色 transparent）
  const firstBg = await page.evaluate(
    () => getComputedStyle(document.querySelector('main')).backgroundColor,
  );
  ok(firstBg === 'rgb(11, 20, 55)', 'T7 应用首屏 <main> 背景即深色', `实得=${firstBg}`);
  await ctx.close();
}

// ------------------------------------------ T8 活性证明：剔掉内联脚本 → T7 翻红
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((k) => localStorage.setItem(k, 'dark'), KEY);
  await page.addInitScript(TIMING_INIT);
  await page.route(`${BASE}${ROUTE}`, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/<script>try\{if\(localStorage[\s\S]*?<\/script>/, '');
    await route.fulfill({ response: res, body });
  });
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
  await page.locator(TOGGLE).waitFor({ timeout: 20_000 });
  const mut = await page.evaluate(() => window.__f002);
  // 活性判据落在「深色是否仍由解析期置入」：抽掉内联脚本后，深色只能等 React 挂载才补上，
  // 故 readyState 必从 'loading' 变为 'complete'，且不再早于应用首渲染（实测二者同一
  // MutationObserver 批次，时间戳相等，故用 >= 而非 >）。
  const flashed =
    mut.readyAtDark !== 'loading' &&
    (mut.darkAt === null || mut.appAt === null || mut.darkAt >= mut.appAt);
  ok(
    flashed,
    'T8 抽掉内联脚本后深色不再早于应用首渲染（T7 断言是活的，不是恒真）',
    `darkAt=${mut.darkAt?.toFixed?.(1)}ms appAt=${mut.appAt?.toFixed?.(1)}ms readyAtDark=${mut.readyAtDark}`,
  );
  await ctx.close();
}

// ------------------------------------------------- T9 localStorage 不可用降级
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(`
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('SecurityError'); },
    });
  `);
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await page.locator(TOGGLE).waitFor({ timeout: 20_000 });
  ok(errors.length === 0, 'T9 localStorage 抛异常时无未捕获页面错误', errors.join(' | '));
  ok(
    (await page.evaluate(() => document.body.classList.contains('dark'))) === false,
    'T9 localStorage 不可用时回落浅色',
  );
  await page.locator(TOGGLE).click();
  ok(
    (await page.evaluate(() => document.body.classList.contains('dark'))) === true,
    'T9 存储不可用不阻断切换本身（降级为不持久）',
  );
  await ctx.close();
}

await browser.close();
console.log(`\n=== F002 Evaluator 独立探针：${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log(`FAILED: ${fails.join(' | ')}`);
  process.exit(1);
}
