// P2-CLEANUP F001 — 创作者抽屉四条关闭路径回归探针（BL-FE-15）。
// 只读断言，不改产品代码。
//
// 前置（跨隔离上下文的坑，写进脚本本身——framework/patterns/testing-env-patterns.md §7）：
//   UI 实测一律走 standalone 生产产物，不走 `next dev`（Next 15 devtools segment-explorer
//   × RSC client manifest 冲突会导致全路由 500/白屏，与被测代码无关）。
//     npx next build
//     PORT=3000 node .next/standalone/server.js
//     node scripts/test/p2-cleanup-f001-drawer-close.mjs
//
// 覆盖（桌面 1440×900 + 移动 390×844 各一遍）：
//   A. 遮罩点击关闭（BL-FE-15 本体——修复前应 FAIL）
//   B. X 钮关闭（CreatorDrawer.tsx dw-head）
//   C. Esc 关闭
//   D. dw-foot「加入某项目匹配」副作用型关闭
//   E. 关闭后不残留遮挡层（下层表格行仍可命中 hit-test）

import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
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

const DRAWER = '.chakra-modal__content[aria-label="创作者详情"]';

const browser = await chromium.launch();

/** 打开抽屉：点表格首行，等抽屉可见。 */
async function openDrawer(page) {
  await page.locator('tbody tr').first().click();
  await page.locator(DRAWER).waitFor({ state: 'visible', timeout: 10_000 });
}

/** 抽屉是否已从 DOM 消失（Chakra 卸载 Portal）。 */
async function drawerGone(page) {
  try {
    await page.locator(DRAWER).waitFor({ state: 'hidden', timeout: 4_000 });
    return true;
  } catch {
    return false;
  }
}

async function runViewport(label, viewport) {
  console.log(`\n[${label} ${viewport.width}×${viewport.height}]`);
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.goto(`${BASE}/admin/creators`, { waitUntil: 'domcontentloaded' });
  await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });

  // --- A. 遮罩点击关闭 -------------------------------------------------
  await openDrawer(page);
  // 抽屉右贴边 width min(520px,96vw)；点左侧空白区（远离抽屉本体）
  await page.mouse.click(Math.round(viewport.width * 0.12), Math.round(viewport.height / 2));
  ok(await drawerGone(page), 'A 遮罩点击关闭');

  // --- E. 关闭后不残留遮挡层 -------------------------------------------
  const topTag = await page.evaluate(() => {
    const el = document.elementFromPoint(
      Math.round(window.innerWidth * 0.12),
      Math.round(window.innerHeight / 2),
    );
    return el
      ? `${el.tagName.toLowerCase()}.${String(el.className || '').slice(0, 60)}`
      : 'null';
  });
  ok(
    !/chakra-modal|content-container|overlay/i.test(topTag),
    'E 关闭后无残留遮挡层',
    `命中元素=${topTag}`,
  );

  // --- B. X 钮关闭 -----------------------------------------------------
  await openDrawer(page);
  await page.locator(`${DRAWER} button[aria-label="关闭"]`).click();
  ok(await drawerGone(page), 'B X 钮关闭');

  // --- C. Esc 关闭 -----------------------------------------------------
  await openDrawer(page);
  await page.keyboard.press('Escape');
  ok(await drawerGone(page), 'C Esc 关闭');

  // --- D. dw-foot 副作用型关闭 -----------------------------------------
  await openDrawer(page);
  await page.locator(`${DRAWER} button`, { hasText: '加入某项目匹配' }).click();
  ok(await drawerGone(page), 'D dw-foot「加入某项目匹配」关闭');

  ok(errs.length === 0, `${label} 无 page error`, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

await runViewport('桌面', { width: 1440, height: 900 });
await runViewport('移动', { width: 390, height: 844 });

await browser.close();
console.log(`\n=== F001 关闭路径：${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log(`FAILED: ${fails.join(' | ')}`);
  process.exit(1);
}
