// M1-B-BRIEF F004 验收探针（Evaluator 产物）— 页面守卫前端半边两视口实测
//
// 前置（testing-env-patterns §7）：已 next build 且 standalone server 起在 BASE
//（127.0.0.1:3000），dev DB 已 up 且 npm run seed:projects 已灌四 canonical 项目。
// 本探针只读不写（浏览器点击 + 断言），不改任何数据。
//
// 被测事实（spec §2 F004 / §4）：
//   · lc 项目 cur=match maxReached=match（seed 快照）→ reach/delivery/insight 未解锁
//   · 未解锁环节点击 → canEnter 拒 → toast（STAGE_NOT_UNLOCKED 文案）+ URL/落地面不变
//   · 已解锁环节（brief 回看 / match）→ 正常切换 + URL ?env= 同步
//   · rail 按钮不 disabled（D4 保留探索感）
//   · 深链 ?env=reach 不拦（D4：URL 即状态契约，设计非漏拦）
//   · D2 降级态（DB 无此行）无判据 → 保持可自由切换、无 toast
//
// 运行：node scripts/test/m1b-f004-guard-probe.mjs

import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const LOCK_MSG = '该环节尚未解锁，项目推进到此处后即可进入'; // ENV_GUARD_MESSAGE.STAGE_NOT_UNLOCKED

let pass = 0;
let fail = 0;
const ok = (c, m) => {
  if (c) {
    pass++;
    console.log(`  ✓ ${m}`);
  } else {
    fail++;
    console.log(`  ✗ ${m}`);
  }
};

const VIEWPORTS = [
  { name: 'desktop 1512x982', width: 1512, height: 982 },
  { name: 'mobile 390x844', width: 390, height: 844 },
];

const browser = await chromium.launch();

/** rail 按钮定位：详情页导轨按钮带 aria-pressed（页面唯一） */
const railBtn = (page, name) =>
  page.locator('button[aria-pressed]').filter({ hasText: name }).first();

/** toast 可见性：ToastProvider 单例 role=status，visible= opacity-100 */
const toastVisible = async (page) => {
  const cls = (await page.locator('div[role="status"]').getAttribute('class')) ?? '';
  return cls.includes('opacity-100');
};
const toastText = (page) => page.locator('div[role="status"]').innerText();
const activeRail = (page) =>
  page.locator('button[aria-pressed="true"]').first().innerText();

for (const vp of VIEWPORTS) {
  console.log(`\n── 视口 ${vp.name} ──`);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // ── 1) lc（cur=match maxReached=match）初始态 ──
  await page.goto(`${BASE}/admin/campaigns/lc`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(800);
  ok(
    (await activeRail(page)).includes('创作者匹配'),
    '初始落在 cur=match（创作者匹配 aria-pressed=true）',
  );

  // ── 2) D4：五个 rail 按钮均不 disabled ──
  const btns = page.locator('button[aria-pressed]');
  const n = await btns.count();
  let disabledCount = 0;
  for (let i = 0; i < n; i++) {
    if (await btns.nth(i).isDisabled()) disabledCount++;
  }
  ok(n === 5 && disabledCount === 0, `rail 5 按钮全部可点不 disabled（n=${n}, disabled=${disabledCount}）`);

  // ── 3) 点未解锁 reach → toast + 不切换 ──
  await railBtn(page, '触达谈判').click();
  await page.waitForTimeout(400);
  ok(await toastVisible(page), '点未解锁「触达谈判」→ toast 弹出');
  ok(
    (await toastText(page)).includes(LOCK_MSG),
    `toast 文案 = STAGE_NOT_UNLOCKED 映射「${LOCK_MSG}」`,
  );
  ok(!page.url().includes('env=reach'), 'URL 未变为 ?env=reach（拒绝不切）');
  ok(
    (await activeRail(page)).includes('创作者匹配'),
    '落地面未切换（active 仍=创作者匹配）',
  );

  // ── 4) 点未解锁 insight → 同样拦截 ──
  await page.waitForTimeout(2600); // 等上一 toast 自动收（2.4s）
  ok(!(await toastVisible(page)), 'toast 2.4s 后自动收起');
  await railBtn(page, '复盘洞察').click();
  await page.waitForTimeout(400);
  ok(
    (await toastVisible(page)) && !page.url().includes('env=insight'),
    '点未解锁「复盘洞察」→ 再次拦截（toast + URL 不变）',
  );

  // ── 5) 回看已解锁 brief → 正常切换 ──
  await railBtn(page, '目标 Brief').click();
  await page.waitForTimeout(600);
  ok(
    (await activeRail(page)).includes('目标 Brief') &&
      page.url().includes('env=brief'),
    '回看已解锁「目标 Brief」→ 正常切换 + URL ?env=brief',
  );

  // ── 6) 切回 match → 正常 ──
  await railBtn(page, '创作者匹配').click();
  await page.waitForTimeout(600);
  ok(
    (await activeRail(page)).includes('创作者匹配') &&
      page.url().includes('env=match'),
    '切回「创作者匹配」→ 正常切换 + URL ?env=match',
  );

  // ── 7) 深链 ?env=reach 不拦（D4 设计：URL 即状态契约） ──
  await page.goto(`${BASE}/admin/campaigns/lc?env=reach`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(800);
  ok(
    (await activeRail(page)).includes('触达谈判'),
    '深链 ?env=reach 直达 reach 面（D4：深链不拦是设计非漏拦）',
  );

  // ── 8) D2 降级态（DB 无此行）→ 无判据自由切换、无 toast ──
  await page.goto(`${BASE}/admin/campaigns/starlight-protocol`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(800);
  await railBtn(page, '复盘洞察').click();
  await page.waitForTimeout(400);
  ok(
    (await activeRail(page)).includes('复盘洞察') &&
      !(await toastVisible(page)),
    'D2 降级态（project=null）点任意环节自由切换、无 toast（不抛错）',
  );

  ok(pageErrors.length === 0, `无 pageerror（${pageErrors.length} 条）${pageErrors.slice(0, 2).join(' | ')}`);

  await ctx.close();
}

await browser.close();
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
