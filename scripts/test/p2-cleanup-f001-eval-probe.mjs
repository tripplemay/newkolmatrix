// P2-CLEANUP F001 — Evaluator 独立验收探针（不复用 Generator 探针的断言口径）。
// 只读断言 + 运行时 DOM 实验，绝不修改产品代码。
//
// 前置（framework/patterns/testing-env-patterns.md §7）：UI 实测走 standalone 生产产物，
// 不走 `next dev`（Next 15 devtools segment-explorer × RSC manifest 冲突 → 全路由 500）：
//     npx next build && PORT=3101 node scripts/serve-standalone.mjs
//     BASE=http://127.0.0.1:3101 node scripts/test/p2-cleanup-f001-eval-probe.mjs
//
// 相对 Generator 探针 p2-cleanup-f001-drawer-close.mjs 的增量（独立性所在）：
//   G0 等 Slide 过渡稳定后再测（Generator 探针在过渡未完成时就点，移动端 12% 坐标
//      在稳定态其实落在抽屉本体内 —— 见报告 O1）
//   G1 量化 .chakra-modal__content-container 几何，坐实文件头注释的事实陈述
//   G2 点击坐标由稳定态几何反推，必须真的落在抽屉本体之外
//   G3 活性证明：运行时把容器高度改回 0px（模拟修复前），遮罩点击必须失效
//   G4 点击抽屉内部不得关闭（closeOnOverlayClick 语义未被扩大）
//   G5 关闭后 DOM 无残留 + 下层表格行仍可真交互
//   G6 四条关闭路径逐条实测（遮罩 / X / Esc / dw-foot）

import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3101';
const DRAWER = '.chakra-modal__content[aria-label="创作者详情"]';
const CONTAINER = '.chakra-modal__content-container';

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ''}`);
  } else {
    fails.push(name);
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const browser = await chromium.launch();

/** 打开抽屉并等 Slide 过渡稳定（连续两帧 boundingBox.x 不变）。 */
async function openDrawer(page) {
  await page.locator('tbody tr').first().click();
  await page.locator(DRAWER).waitFor({ state: 'visible', timeout: 10_000 });
  let prev = -1;
  for (let i = 0; i < 40; i++) {
    const b = await page.locator(DRAWER).boundingBox();
    const x = Math.round(b.x);
    if (x === prev) return b;
    prev = x;
    await page.waitForTimeout(100);
  }
  return page.locator(DRAWER).boundingBox();
}
async function drawerGone(page, timeout = 4_000) {
  try {
    await page.locator(DRAWER).waitFor({ state: 'hidden', timeout });
    return true;
  } catch {
    return false;
  }
}
async function drawerStillOpen(page, ms = 1_200) {
  await page.waitForTimeout(ms);
  return page.locator(DRAWER).isVisible();
}

async function run(label, viewport) {
  console.log(`\n[${label} ${viewport.width}x${viewport.height}]`);
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/admin/creators`, { waitUntil: 'domcontentloaded' });
  await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });

  // ---- G0/G1 稳定态几何 -------------------------------------------------
  const box = await openDrawer(page);
  const geo = await page.evaluate((sel) => {
    const c = document.querySelector(sel);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    return {
      h: Math.round(r.height),
      w: Math.round(r.width),
      z: cs.zIndex,
      inlineH: c.style.height,
      pos: cs.position,
    };
  }, CONTAINER);
  ok(
    geo !== null && geo.h >= viewport.height - 1,
    'G1 content-container 高度 ≈ 视口高（修复生效）',
    geo ? `h=${geo.h} w=${geo.w} z=${geo.z} inlineHeight=${geo.inlineH} pos=${geo.pos}` : 'container 不存在',
  );

  // ---- G2 遮罩点击坐标由稳定态几何反推 ---------------------------------
  const clickX = Math.max(2, Math.round(box.x / 2));
  const clickY = Math.round(viewport.height / 2);
  ok(
    clickX < box.x - 1,
    'G2 遮罩点击坐标落在抽屉本体之外（稳定态几何）',
    `drawer.x=${Math.round(box.x)} drawer.w=${Math.round(box.width)} 遮罩带宽=${Math.round(box.x)}px clickAt=(${clickX},${clickY})`,
  );
  const hitTag = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? `${el.tagName.toLowerCase()}|${String(el.className || '').slice(0, 60)}` : 'null';
    },
    [clickX, clickY],
  );
  ok(/content-container|overlay/i.test(hitTag), 'G2b 该坐标命中的是遮罩/容器层', `hit=${hitTag}`);

  // ---- G4 点抽屉内部不得关闭 -------------------------------------------
  const insideX = Math.round(Math.min(box.x + box.width / 2, viewport.width - 6));
  await page.mouse.click(insideX, Math.round(viewport.height * 0.5));
  ok(
    await drawerStillOpen(page),
    'G4 点击抽屉内部不关闭（语义未被扩大）',
    `clickAt=(${insideX},${Math.round(viewport.height * 0.5)})`,
  );

  // ---- G3 活性证明：容器高度归 0（模拟修复前）--------------------------
  const killedH = await page.evaluate((sel) => {
    const c = document.querySelector(sel);
    c.style.height = '0px';
    return Math.round(c.getBoundingClientRect().height);
  }, CONTAINER);
  await page.mouse.click(clickX, clickY);
  const stillOpenAfterKill = await drawerStillOpen(page);
  ok(
    killedH === 0 && stillOpenAfterKill,
    'G3 活性证明：容器高度归 0 后遮罩点击失效（本断言能抓到回归）',
    `killedHeight=${killedH}px drawerStillOpen=${stillOpenAfterKill}`,
  );
  await page.evaluate((sel) => {
    document.querySelector(sel).style.height = '100vh';
  }, CONTAINER);

  // ---- G6-A 遮罩点击关闭（稳定态）--------------------------------------
  await page.mouse.click(clickX, clickY);
  ok(await drawerGone(page), 'G6-A 遮罩点击关闭（稳定态）');

  // ---- G5 关闭后无残留 + 下层真交互 ------------------------------------
  const leftover = await page.evaluate(
    () => document.querySelectorAll('.chakra-modal__content-container').length,
  );
  ok(leftover === 0, 'G5a 关闭后 DOM 无 content-container 残留', `count=${leftover}`);
  const reopened = await page
    .locator('tbody tr')
    .nth(1)
    .click({ timeout: 8_000 })
    .then(() => page.locator(DRAWER).waitFor({ state: 'visible', timeout: 5_000 }))
    .then(() => true)
    .catch(() => false);
  ok(reopened, 'G5b 关闭后下层表格行仍可点击（真交互，抽屉可重开）');
  if (reopened) {
    await page.keyboard.press('Escape');
    await drawerGone(page);
  }

  // ---- G6-B X 钮 -------------------------------------------------------
  await openDrawer(page);
  await page.locator(`${DRAWER} button[aria-label="关闭"]`).click();
  ok(await drawerGone(page), 'G6-B X 钮关闭');

  // ---- G6-C Esc --------------------------------------------------------
  await openDrawer(page);
  await page.keyboard.press('Escape');
  ok(await drawerGone(page), 'G6-C Esc 关闭');

  // ---- G6-D dw-foot ----------------------------------------------------
  await openDrawer(page);
  await page.locator(`${DRAWER} button`, { hasText: '加入某项目匹配' }).click();
  ok(await drawerGone(page), 'G6-D dw-foot「加入某项目匹配」关闭');

  ok(errs.length === 0, `${label} 无 page error`, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

await run('桌面', { width: 1440, height: 900 });
await run('移动', { width: 390, height: 844 });

await browser.close();
console.log(`\n=== Evaluator F001 probe: ${pass} passed, ${fails.length} failed ===`);
if (fails.length) {
  console.log(`FAILED: ${fails.join(' | ')}`);
  process.exit(1);
}
