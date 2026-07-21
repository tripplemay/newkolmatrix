// ARCH-M05 verifying（隔离 Evaluator 产物，B 组 F002/F003）——外壳与路由实测探针。
// 只读断言，不改产品代码。前置：已 `npx next build` 且 standalone server 起在 BASE。
//   PORT=3000 node .next/standalone/server.js
//   node scripts/test/arch-m05-shell-probe.mjs
//
// 覆盖：
//   A. F002 六 redirect 桩终点实测（浏览器态——Next 15 静态预渲染的 redirect 为客户端跳转，curl 看不到）
//   B. F002 六入口无死链 + 侧栏 6 项与 kimi §6.1 表逐项一致
//   C. F003 S1/S2 关键元素在场（🔒 项优先）
//   D. F003 指令栏 Enter → Copilot 链路
//   E. F003 路由切换外壳不重挂载（DOM 身份标记法）
//   F. F003 移动端 Copilot 抽屉 + 侧栏抽屉

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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});

const go = async (p) => {
  await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 客户端 redirect 需等待导航稳定
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  return new URL(page.url()).pathname;
};

try {
  console.log('\n[A] F002 — redirect 桩终点实测（附录 A 口径）');
  const REDIRECTS = [
    ['/', '/admin/today', '根 → today（经 dashboards/default 桩）'],
    ['/admin', '/admin/today', 'admin 根 → today'],
    ['/admin/dashboards', '/admin/today', 'dashboards → today'],
    ['/admin/dashboards/default', '/admin/today', 'dashboards/default → today'],
    ['/admin/database', '/admin/creators', 'database → creators'],
    ['/admin/discovery', '/admin/creators', 'discovery → creators'],
    ['/admin/outreach', '/admin/campaigns', 'outreach → campaigns'],
  ];
  for (const [from, to, label] of REDIRECTS) {
    const landed = await go(from);
    ok(landed === to, `${label}（实测落点 ${landed}）`, `期望 ${to}`);
  }

  console.log('\n[B] F002 — 六入口无死链 + 侧栏与 kimi §6.1 表一致');
  const KIMI = [
    ['今天', '/admin/today'],
    ['项目', '/admin/campaigns'],
    ['创作者库', '/admin/creators'],
    ['游戏知识', '/admin/knowledge'],
    ['洞察', '/admin/insight'],
    ['Agent 记录', '/admin/runs'],
  ];
  for (const [name, path] of KIMI) {
    const res = await page.goto(`${BASE}${path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    const code = res?.status() ?? 0;
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForSelector('main', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    const bodyLen = (await page.locator('body').innerText()).trim().length;
    ok(code === 200 && bodyLen > 50, `${name} ${path} 200 且有内容（${code}, ${bodyLen} 字）`);
  }
  await go('/admin/today');
  const navNames = await page
    .locator('nav a span:nth-child(2), nav a div span')
    .allInnerTexts()
    .catch(() => []);
  const sidebarText = await page.locator('aside, nav').first().innerText().catch(() => '');
  for (const [name, path] of KIMI) {
    const has = await page.locator(`a[href="${path}"]`).count();
    ok(has > 0, `侧栏含入口「${name}」→ ${path}`);
  }
  const extraLinks = await page.locator('a[href^="/admin/"]').evaluateAll((els) =>
    Array.from(new Set(els.map((e) => e.getAttribute('href')))),
  );
  const allowed = new Set(KIMI.map(([, p]) => p));
  const strays = extraLinks.filter(
    (h) => !allowed.has(h) && !h.startsWith('/admin/campaigns/'),
  );
  ok(strays.length === 0, `侧栏区无多余/旧路由链接（发现 ${JSON.stringify(strays)}）`);

  console.log('\n[C] F003 — S1 侧栏 / S2 navbar 关键元素在场');
  const bodyText = await page.locator('body').innerText();
  ok(/KOL/.test(bodyText) && /Matrix/.test(bodyText), 'S1-2 品牌字 KOL+Matrix');
  const brandWeights = await page
    .locator('text=KOL')
    .first()
    .evaluate((el) => {
      const p = el.closest('div');
      return Array.from(p?.querySelectorAll('span') ?? []).map(
        (s) => getComputedStyle(s).fontWeight,
      );
    })
    .catch(() => []);
  ok(
    new Set(brandWeights).size >= 2,
    `S1-2 双字重未压成单一（实测 ${JSON.stringify(brandWeights)}）`,
  );
  ok(/工作台/.test(bodyText), 'S1-4 nav 组标签「工作台」');
  ok(/Agent 自动边界/.test(bodyText), 'S1-11 🔒 CTA 标题');
  ok(
    /可检索\s*·\s*评估\s*·\s*匹配\s*·\s*起草/.test(bodyText) &&
      /发送\s*\/\s*报价\s*\/\s*放款\s*\/\s*分享一律停在你面前/.test(bodyText),
    'S1-12 🔒 D26/D27 宣示文案逐字',
  );
  // S1-7 待办徽标 3/4/2
  for (const [path, n] of [
    ['/admin/today', '3'],
    ['/admin/campaigns', '4'],
    ['/admin/insight', '2'],
  ]) {
    const t = await page.locator(`a[href="${path}"]`).first().innerText();
    ok(t.includes(n), `S1-7 🔒 待办徽标 ${path}=${n}（实测「${t.replace(/\n/g, '|')}」）`);
  }
  // S1-6 active 竖条
  const activeBar = await page
    .locator('a[href="/admin/today"] span.absolute')
    .count();
  ok(activeBar > 0, 'S1-6 🔒 active 右侧竖条在场');
  // S2
  const cmdInput = page.locator('input[aria-label="向 Agent 下达任务"]');
  ok((await cmdInput.count()) > 0, 'S2-4/6 🔒 指令栏胶囊 + placeholder 原文');
  ok(/Agent 推进中/.test(bodyText), 'S2-7 「Agent 推进中」');
  const pulse = await page.locator('span.animate-ping').count();
  ok(pulse > 0, 'S2-8 🔒 pulse 绿点');
  const navGlass = await page
    .locator('nav.sticky')
    .first()
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return { pos: cs.position, filter: cs.backdropFilter, bg: cs.backgroundColor };
    })
    .catch(() => null);
  ok(
    !!navGlass && navGlass.pos === 'sticky' && /blur/.test(navGlass.filter || ''),
    `S2-12 🔒 玻璃外壳 sticky+backdrop-blur（实测 ${JSON.stringify(navGlass)}）`,
  );
  const sidebarW = await page
    .locator('div.w-\\[285px\\]')
    .first()
    .evaluate((el) => el.getBoundingClientRect().width)
    .catch(() => 0);
  ok(sidebarW === 285, `F003 侧栏固定 285px（实测 ${sidebarW}）`);

  console.log('\n[D] F003 — 指令栏 Enter → Copilot 链路');
  const MSG = 'evaluator-probe-指令栏链路';
  await page.waitForSelector('aside', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await cmdInput.fill(MSG);
  await cmdInput.press('Enter');
  await page.waitForTimeout(2000);
  const asideText = await page.locator('aside').first().innerText().catch(() => '');
  ok(asideText.includes(MSG), `指令内容送达 Copilot 面板（面板内可见该文本）`);
  ok((await cmdInput.inputValue()) === '', '提交后指令栏清空');

  console.log('\n[E] F003 — 路由切换外壳不重挂载（DOM 身份标记法）');
  await go('/admin/today');
  await page.evaluate(() => {
    const sb = document.querySelector('div.w-\\[285px\\]');
    const nb = document.querySelector('nav.sticky');
    if (sb) sb.setAttribute('data-evaluator-mark', 'sidebar-1');
    if (nb) nb.setAttribute('data-evaluator-mark', 'navbar-1');
  });
  // 客户端软导航（点侧栏链接，不整页刷新）
  await page.locator('a[href="/admin/creators"]').first().click();
  await page.waitForURL('**/admin/creators', { timeout: 30000 });
  await page.waitForTimeout(800);
  const marks1 = await page.evaluate(() => ({
    sidebar: document.querySelector('div.w-\\[285px\\]')?.getAttribute('data-evaluator-mark') ?? null,
    navbar: document.querySelector('nav.sticky')?.getAttribute('data-evaluator-mark') ?? null,
    path: location.pathname,
  }));
  ok(marks1.path === '/admin/creators', `软导航到达 creators（${marks1.path}）`);
  ok(marks1.sidebar === 'sidebar-1', `侧栏 DOM 节点未重挂载（mark=${marks1.sidebar}）`);
  ok(marks1.navbar === 'navbar-1', `navbar DOM 节点未重挂载（mark=${marks1.navbar}）`);
  await page.locator('a[href="/admin/runs"]').first().click();
  await page.waitForURL('**/admin/runs', { timeout: 30000 });
  await page.waitForTimeout(800);
  const marks2 = await page.evaluate(() => ({
    sidebar: document.querySelector('div.w-\\[285px\\]')?.getAttribute('data-evaluator-mark') ?? null,
    navbar: document.querySelector('nav.sticky')?.getAttribute('data-evaluator-mark') ?? null,
  }));
  ok(
    marks2.sidebar === 'sidebar-1' && marks2.navbar === 'navbar-1',
    `二次切换后外壳仍未重挂载（${JSON.stringify(marks2)}）`,
  );
  // 主区确实换了内容
  const runsText = await page.locator('main').innerText();
  ok(runsText.length > 50, '主区已重绘为 runs 内容');

  console.log('\n[F] F003 — 移动端 Copilot 抽屉 + 侧栏抽屉');
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(`${BASE}/admin/today`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await m.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await m.waitForTimeout(500);
  const copBefore = await m
    .locator('aside')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, w: r.width, vis: r.x < window.innerWidth };
    })
    .catch(() => null);
  ok(!!copBefore && copBefore.vis === false, `移动端 Copilot 默认收起（${JSON.stringify(copBefore)}）`);
  const copToggle = m.locator('button[aria-label="打开 Agent"]');
  ok((await copToggle.count()) > 0, 'S2-10 mobile copilot toggle 在场');
  await copToggle.first().click();
  await m.waitForTimeout(700);
  const copAfter = await m
    .locator('aside')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), w: Math.round(r.width), vis: r.x < window.innerWidth - 10 };
    })
    .catch(() => null);
  ok(!!copAfter && copAfter.vis === true, `点 toggle 后 Copilot 抽屉滑入（${JSON.stringify(copAfter)}）`);
  // F-DEFECT 探针：抽屉打开后是否可关闭（面板内关闭钮 / scrim / 仍可点到 cop-toggle）
  const closeBtns = await m
    .locator('aside button')
    .evaluateAll((els) =>
      els
        .map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim())
        .filter(Boolean),
    );
  const hasCloseAffordance = closeBtns.some((t) => /关闭|close|收起|×/i.test(t));
  ok(hasCloseAffordance, `移动端 Copilot 抽屉内有关闭钮（实测 aside 内按钮 ${JSON.stringify(closeBtns)}）`);
  const scrim = await m
    .locator('div.fixed.inset-0, div[data-scrim]')
    .count();
  ok(scrim > 0, `移动端 Copilot 抽屉有 scrim 遮罩可点关（实测 ${scrim} 个）`);
  const toggleReachable = await m
    .locator('button[aria-label="打开 Agent"]')
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { hitSelf: el.contains(top), topTag: top?.tagName ?? null };
    });
  ok(
    toggleReachable.hitSelf,
    `抽屉开启态下 cop-toggle 仍可点击（命中元素 ${toggleReachable.topTag}）`,
  );

  // 侧栏抽屉（先整页重载复位 drawerOpen，避免被 Copilot 抽屉遮挡）
  await m.reload({ waitUntil: 'domcontentloaded' });
  await m.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await m.waitForTimeout(600);
  const sideToggle = m.locator('button[aria-label="导航"]');
  ok((await sideToggle.count()) > 0, 'S2-1 mobile menu 钮在场');
  await sideToggle.first().click();
  await m.waitForTimeout(700);
  const sideAfter = await m
    .locator('div.w-\\[285px\\]')
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().x));
  ok(sideAfter > -100, `点 menu 后侧栏抽屉滑入（x=${sideAfter}）`);
  const sideClose = await m.locator('div.w-\\[285px\\] span.cursor-pointer').count();
  ok(sideClose > 0, '侧栏抽屉有关闭钮（对照组：同外壳内侧栏有、Copilot 无）');

  console.log(`\n[errs] 运行期控制台/页面错误 ${errs.length} 条`);
  if (errs.length) console.log(errs.slice(0, 8).map((e) => `   · ${e}`).join('\n'));
} finally {
  await browser.close();
}

console.log(`\n[arch-m05-shell-probe] 汇总：PASS ${pass} / FAIL ${fail}`);
if (fail) {
  console.log('失败项：\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
