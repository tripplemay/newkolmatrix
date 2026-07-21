// P2-CLEANUP F004 — HandoffPanel 抽取 + 夹具对齐生产回归探针（BL-FE-14）。
// 只读断言，不改产品代码。
//
// 前置（framework/patterns/testing-env-patterns.md §7）：UI 实测一律走 standalone 生产产物，
// 不走 `next dev`（Next 15 devtools segment-explorer × RSC manifest 冲突会全路由 500/白屏）。
//     npx next build
//     PORT=3000 node .next/standalone/server.js
//     node scripts/test/p2-cleanup-f004-handoff-panel.mjs
//
// 覆盖：
//   A. 生产侧（/admin/campaigns/lc?env=brief）容器 chrome 三要素不退化
//   B. 夹具侧（/preview/agent-canvas）经 HandoffPanel 获得 border-dashed —— 对齐生产口径，
//      本 feature 的回归价值所在（此前夹具无虚线框，基线守的不是生产实际外观）
//   C. 两侧 chrome class 逐字相同 —— 「共用同一外壳」的实证，而非各写各的碰巧相似
//   D. 三处分叉改造后逐项仍成立：border-dashed / stage 三元文案 / 多卡 flex 容器
//      （单张卡亦走同一 flex 路径）
//   E. HandoffCard 全 props 路径不退化：生产侧逐轮台词 + 交接物 chip + 绿色结论；
//      夹具侧静态展开态（collapsible=false + defaultOpen）仍呈现 summary/artifact

import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const PROD = `${BASE}/admin/campaigns/lc?env=brief`;
const FIXTURE = `${BASE}/preview/agent-canvas`;

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
const ctx = await browser.newContext({ viewport: { width: 1512, height: 982 } });
const page = await ctx.newPage();

/** 抓 HandoffPanel 外壳（凭标签文案 + SurfaceCard 特征类定位，不依赖测试专用属性）。 */
async function readPanel(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByText('多 Agent 联动 · 点开看交接').first().waitFor({ timeout: 20_000 });
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
      (d) =>
        /多 Agent 联动 · 点开看交接/.test(d.textContent || '') &&
        d.className.includes('rounded-2xl'),
    );
    if (!el) return null;
    const list = el.children[1];
    return {
      cls: el.className,
      label: (el.querySelector('div')?.textContent || '').trim(),
      listCls: list?.className ?? '',
      cardCount: list?.children.length ?? 0,
      text: el.textContent || '',
    };
  });
}

// --- A/D 生产侧 --------------------------------------------------------
const prod = await readPanel(PROD);
ok(prod !== null, 'A 生产侧 HandoffPanel 在场');
ok(prod?.cls.includes('border-dashed'), 'A/D 生产侧虚线框容器（分叉 1）');
ok(
  prod?.label.startsWith('本环节协同 · 多 Agent 联动'),
  'A/D 生产侧 stage 命中走「本环节协同」文案（分叉 2）',
  `实得=${prod?.label}`,
);
ok(prod?.listCls === 'flex flex-col gap-1.5', 'A/D 生产侧多卡 flex 容器（分叉 3）');
ok((prod?.cardCount ?? 0) >= 2, 'A 生产侧多卡路径仍在', `卡数=${prod?.cardCount}`);

// --- E 生产侧 HandoffCard 全 props 路径 ---------------------------------
// 注意：payload / outcome / 逐轮台词只在展开态渲染（HandoffCard.tsx:132 `open &&`），
// 生产侧 collapsible 默认收起，故须先点开卡头再断言。
ok(
  /对齐组合覆盖能否达成 300 万曝光目标/.test(prod?.text ?? ''),
  'E 生产侧 summary（收起态即在）',
);
await page.locator('button', { hasText: '对齐组合覆盖能否达成' }).first().click();
const expanded = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(
    (d) =>
      /多 Agent 联动 · 点开看交接/.test(d.textContent || '') &&
      d.className.includes('rounded-2xl'),
  );
  return el?.textContent || '';
});
ok(/交接物：组合预估覆盖/.test(expanded), 'E 生产侧交接物 chip（payload prop）');
ok(/策略 Agent 采纳/.test(expanded), 'E 生产侧结论行（outcome prop）');
ok(
  /目标是 30 天 300 万曝光，当前批准组合的预估覆盖够吗？/.test(expanded),
  'E 生产侧逐轮台词（turns prop）',
);

// --- B/D 夹具侧 --------------------------------------------------------
const fix = await readPanel(FIXTURE);
ok(fix !== null, 'B 夹具侧 HandoffPanel 在场');
ok(
  fix?.cls.includes('border-dashed'),
  'B 夹具侧已获得 border-dashed —— 对齐生产口径（本 feature 回归价值）',
  `实得=${fix?.cls}`,
);
ok(
  fix?.label.startsWith('协同交接 · 多 Agent 联动'),
  'B/D 夹具侧无 stage 走「协同交接」文案（分叉 2 另一支）',
  `实得=${fix?.label}`,
);
ok(
  fix?.listCls === 'flex flex-col gap-1.5' && fix?.cardCount === 1,
  'D 夹具单张卡亦走同一 flex 容器路径（分叉 3）',
  `listCls=${fix?.listCls} cards=${fix?.cardCount}`,
);

// --- C 两侧 chrome 逐字同源 --------------------------------------------
ok(
  prod?.cls === fix?.cls,
  'C 生产/夹具容器 class 逐字相同（共用同一外壳的实证）',
  `prod=${prod?.cls}\n      fix =${fix?.cls}`,
);
ok(prod?.listCls === fix?.listCls, 'C 生产/夹具卡列表容器 class 逐字相同');

await browser.close();
console.log(`\n=== F004 HandoffPanel：${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log(`FAILED: ${fails.join(' | ')}`);
  process.exit(1);
}
