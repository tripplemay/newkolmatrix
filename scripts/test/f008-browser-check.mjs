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

  // ── 4) 项目空间：列表 → 详情 → 五环节导轨 ──
  // M1-C F006 修缮（D-G）：锚点随 UI 演进校准——
  //   · 「五环节」容器说明与「本环节专家职责」占位是 F008 时代 stagePanel 文案，
  //     ARCH-M05 起被 IA 契约句「只做进入」与环节落地面取代（历史漂移，非 M1-C 引入）；
  //   · 英文环节名 Brief/Match/… 在 ARCH-M05 F007 已中文化为 ENV_META 名；
  //   · 列表卡 anchor 断言因 M1-C F001 Link 化复活（此前 router.push 无 anchor，
  //     ARCH-M05-verify-B:65 记录在案）。
  await status('/admin/campaigns');
  const listText = await page.textContent('body');
  ok(listText.includes('只做进入') && listText.includes('星轨协议'), '项目列表渲染（项目卡 + 🔒 lede IA 契约句「只做进入」）');
  // 点第一个项目卡进详情（真实 anchor，M1-C F001 Link 化复活）
  await page.locator('a[href^="/admin/campaigns/"]').first().click();
  // M2-A F005 起：项目零 plans 且 cur≥match 时，详情页 RSC 首访同步 lazy 生成
  // （真网关 embedText，实测首访 ttfb ≈3.05s / 暖访 12ms）——原固定 1200ms 等待
  // 会在导航完成前读到旧页 body，两条详情断言假红。改为条件等待导轨内容到场
  // （超时吞掉不抛：内容不到场时下方 ok() 断言照常判红，语义不变）。
  // M2-A-MATCH READINESS 验收校准（Andy/evaluator-subagent 2026-07-22）。
  await page.locator('text=目标 Brief').first().waitFor({ timeout: 30_000 }).catch(() => {});
  const detailText = await page.textContent('body');
  const stages = ['目标 Brief', '创作者匹配', '触达谈判', '交付结算', '复盘洞察'];
  ok(stages.every((s) => detailText.includes(s)), '项目详情 = 五环节唯一容器（导轨五环节齐全，D22）');
  ok(detailText.includes('这一环节的界面与其它环节刻意不同'), '环节落地面渲染（🔒「刻意不同」宣示句）');
  // 切到触达谈判环节（xg cur=reach 已解锁，canEnter 放行）
  await page.locator('button:has-text("触达谈判")').first().click();
  await page.waitForTimeout(800);
  const afterTab = await page.locator('aside div.border-l-4').first().innerText().catch(() => '');
  ok(afterTab.includes('触达 Agent'), '切触达谈判环节 → Copilot 切到触达 Agent（环节唯一渲染入口 + 专家绑定）');

  // ── 5) 今天待办直达某项目某环节 ──
  // M1-C F006 修缮（D-G/D-A）：雷达已接 PendingAction 真数据——有待办时卡内
  // 「进入项目」是真实 anchor（F003 Link 化复活，href 含 ?env=）；零待办时空态
  // 必须渲染可见文案（§4.3 反静默空白）。两态均为合法真值，各按其锚断言。
  await status('/admin/today');
  const todoLink = await page.locator('a[href*="/admin/campaigns/"][href*="env="]').first().getAttribute('href').catch(() => null);
  if (todoLink) {
    ok(/\/admin\/campaigns\/[^/]+\?env=/.test(todoLink), `今天待办直达「某项目某环节」（真实 anchor，href=${todoLink}）`);
  } else {
    const emptyVisible = await page.locator('text=今天没有需要你确认的事').first().isVisible().catch(() => false);
    ok(emptyVisible, '今天零待办 → 雷达空态可见文案（非静默空白；直达链形状由待办态覆盖）');
  }

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
