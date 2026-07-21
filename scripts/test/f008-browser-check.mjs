// AGENT-FOUNDATION F008 — IA 浏览器实测（Playwright chromium）
// 验证：侧栏 6 项 + 各路由无死链 + 旧路由重定向 + 项目空间五环节 + 今天待办直达 + 无角色切换器 + console 无 error。
// 运行：node scripts/test/f008-browser-check.mjs   （需 dev server 在 :3000）

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
const errs = [];
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
});
page.on('pageerror', (e) => errs.push(String(e)));

async function status(path) {
  const r = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(400);
  return { code: r.status(), finalUrl: page.url() };
}

try {
  // ── 1) 侧栏 6 项 ──
  await status('/admin/today');
  const sidebar = (await page.locator('nav, aside').first().innerText().catch(() => '')) + (await page.textContent('body'));
  const items = ['今天', '项目', '创作者库', '游戏知识', '洞察', 'Agent 记录'];
  const present = items.filter((i) => sidebar.includes(i));
  ok(present.length === 6, `侧栏 6 项齐全（${present.join('/')}）`);

  // ── 2) 各路由无死链（真实占位页，非 404/error）──
  const routes = ['/admin/today', '/admin/campaigns', '/admin/creators', '/admin/knowledge', '/admin/insight', '/admin/runs'];
  let allOk = true;
  for (const rt of routes) {
    // dev 首访冷编译：先 warmup 一次再正式取样，避免瞬态 404。
    await page.goto(`${BASE}${rt}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    const { code } = await status(rt);
    // 用 HTTP status + 可见 not-found 文案判 404（不用宽泛 '404' 子串——Next 内置 not-found 模板在每页 RSC payload 里）。
    const notFound = await page.locator('text=This page could not be found').count().catch(() => 0);
    if (code === 404 || notFound > 0) {
      allOk = false;
      console.log(`    ! ${rt} → code=${code} notFound=${notFound}`);
    }
  }
  ok(allOk, '侧栏 6 路由均真实占位页无死链（无 404）');

  // ── 3) 旧路由重定向（无死链，含修 /admin/dashboards 404）──
  const r1 = await status('/admin');
  ok(r1.finalUrl.endsWith('/admin/today'), '/admin → 重定向 /admin/today');
  const r2 = await status('/admin/dashboards');
  ok(r2.finalUrl.endsWith('/admin/today') && r2.code !== 404, '/admin/dashboards → 重定向 today（修 404 死链）');
  const r3 = await status('/admin/discovery');
  ok(r3.finalUrl.endsWith('/admin/creators'), '旧 /admin/discovery → 重定向 /admin/creators');

  // ── 4) 项目空间：列表 → 详情 → 五环节 tab（stagePanel）──
  await status('/admin/campaigns');
  const listText = await page.textContent('body');
  ok(listText.includes('五环节') && listText.includes('星轨协议'), '项目列表渲染（项目卡 + 五环节容器说明）');
  // 点第一个项目卡进详情
  await page.locator('a[href^="/admin/campaigns/"]').first().click();
  await page.waitForTimeout(1200);
  const detailText = await page.textContent('body');
  const stages = ['Brief', 'Match', 'Reach', 'Delivery', 'Insight'];
  ok(stages.every((s) => detailText.includes(s)), '项目详情 = 五环节唯一容器（Brief/Match/Reach/Delivery/Insight tab 齐全，D22）');
  ok(detailText.includes('环节') && detailText.includes('本环节专家职责'), 'stagePanel 渲染当前环节（专家职责占位）');
  // 切到 Reach tab
  await page.locator('button:has-text("Reach")').first().click();
  await page.waitForTimeout(800);
  const afterTab = await page.locator('aside div.border-l-4').first().innerText().catch(() => '');
  ok(afterTab.includes('触达 Agent'), '切 Reach 环节 tab → stagePanel + Copilot 切到触达 Agent（环节唯一渲染入口 + 专家绑定）');

  // ── 5) 今天待办直达某项目某环节 ──
  await status('/admin/today');
  // ARCH-M05 F007：环节 URL 态 ?stage= → ?env=（kimi §6.1）。
  const todoLink = await page.locator('a[href*="/admin/campaigns/"][href*="env="]').first().getAttribute('href').catch(() => null);
  ok(!!todoLink && /\/admin\/campaigns\/[^/]+\?env=/.test(todoLink), `今天待办直达「某项目某环节」（复用 routeToStage，href=${todoLink}）`);

  // ── 6) 无角色切换器 ──
  const bodyAll = await page.textContent('body');
  ok(!/切换角色|role.?switch|角色切换/i.test(bodyAll), '无角色切换器（三角色作废）');

  // ── 7) console 无 error ──
  const realErrors = errs.filter((e) => !/favicon|404|Failed to load resource/.test(e));
  ok(realErrors.length === 0, `console 无 error（实测 ${realErrors.length} 条）`);
  if (realErrors.length) realErrors.slice(0, 5).forEach((e) => console.log(`    ! ${e.slice(0, 120)}`));

  console.log(`\n[f008-browser] PASS ${pass} / FAIL ${fail}`);
} finally {
  await browser.close();
}
process.exit(fail === 0 ? 0 : 1);
