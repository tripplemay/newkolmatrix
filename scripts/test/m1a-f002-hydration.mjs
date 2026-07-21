#!/usr/bin/env node
/**
 * M1-A-BRIEF F002 验收探针 — hydration mismatch 实测（Evaluator 编写）
 *
 * 前置（必须，否则结论无效）：
 *   1. 已 `npm run build` 且 standalone server 起在 BASE
 *      （framework/patterns/testing-env-patterns.md §7：UI 实测一律走生产构建，不走 next dev）
 *   2. export BASE=http://127.0.0.1:3300
 *
 * 覆盖：六个 admin 页 × {桌面 1440x900, 移动 390x844} × {浅色, 深色} = 24 次加载。
 * 判据：控制台不得出现 hydration mismatch 类告警（React #418/#423/#425 及其明文形式）。
 *
 * 深色态单独跑一遍的理由：F002 修的 navbar isDark 三元与 findCurrentRoute 服务端分支，
 * 失配只在「服务端渲染值 ≠ 客户端首帧值」时暴露；浅色态恰好是服务端默认值，
 * 只测浅色会漏掉整类回归（假绿）。
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3300';
const PAGES = [
  '/admin/today',
  '/admin/campaigns',
  '/admin/insight',
  '/admin/knowledge',
  '/admin/creators',
  '/admin/runs',
];
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const MODES = ['light', 'dark'];

// React 生产构建把 hydration 报错压成 minified invariant 编号。
// 418 = Hydration failed / 423 = error while hydrating / 425 = Text content did not match
const HYDRATION_PATTERNS = [
  /minified react error #418/i,
  /minified react error #423/i,
  /minified react error #425/i,
  /hydration failed/i,
  /did not match/i,
  /text content does not match/i,
  /hydrating/i,
];

const isHydration = (t) => HYDRATION_PATTERNS.some((re) => re.test(t));

const results = [];
let hydrationHits = 0;
let otherErrors = 0;

const browser = await chromium.launch();

for (const mode of MODES) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    // 深色态：预置 localStorage，让 layout.tsx 的 pre-paint 脚本在绘制前置好 body.dark，
    // 从而复现「服务端 HTML 为浅色默认 / 客户端首帧为深色」这一失配窗口。
    if (mode === 'dark') {
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('kolmatrix.colorMode', 'dark');
        } catch (e) {}
      });
    }

    for (const path of PAGES) {
      const page = await ctx.newPage();
      const msgs = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') msgs.push(`[${m.type()}] ${m.text()}`);
      });
      page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));

      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      // 给 hydration 与后续 effect 留出窗口
      await page.waitForTimeout(1200);

      const hyd = msgs.filter((m) => isHydration(m));
      const other = msgs.filter((m) => !isHydration(m));
      hydrationHits += hyd.length;
      otherErrors += other.length;

      const bodyDark = await page.evaluate(() => document.body.classList.contains('dark'));
      results.push({ mode, vp: vp.name, path, hyd, other, bodyDark });
      await page.close();
    }
    await ctx.close();
  }
}

await browser.close();

console.log(`\nF002 hydration probe — BASE=${BASE}`);
console.log(`loads: ${results.length} (6 pages x ${VIEWPORTS.length} viewports x ${MODES.length} modes)\n`);
for (const r of results) {
  const flag = r.hyd.length ? 'HYDRATION-MISMATCH' : 'ok';
  console.log(
    `${r.mode.padEnd(5)} ${r.vp.padEnd(7)} ${r.path.padEnd(20)} body.dark=${String(r.bodyDark).padEnd(5)} ${flag}${r.other.length ? ` (otherConsole=${r.other.length})` : ''}`,
  );
  for (const h of r.hyd) console.log(`      HYD> ${h.slice(0, 260)}`);
  for (const o of r.other) console.log(`      MSG> ${o.slice(0, 200)}`);
}

// 深色态必须真的进入深色，否则「深色零失配」只是没测到深色（假绿）
const darkRows = results.filter((r) => r.mode === 'dark');
const darkApplied = darkRows.filter((r) => r.bodyDark).length;
console.log(`\nlive-check: dark-mode loads with body.dark applied = ${darkApplied}/${darkRows.length}`);
console.log(`hydration mismatch warnings: ${hydrationHits}`);
console.log(`other console errors/warnings: ${otherErrors}`);

const pass = hydrationHits === 0 && darkApplied === darkRows.length;
console.log(pass ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(pass ? 0 : 1);
