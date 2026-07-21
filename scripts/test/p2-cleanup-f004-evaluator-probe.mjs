// P2-CLEANUP F004 — Evaluator 独立验收探针（BL-FE-14 抽 HandoffPanel + 夹具对齐生产）。
//
// 独立于 Generator 的 p2-cleanup-f004-handoff-panel.mjs 重写，不复用其定位逻辑与断言口径。
// 只读断言，绝不修改产品代码。
//
// 前置（framework/patterns/testing-env-patterns.md §7）：走 standalone 生产产物，不走 next dev。
//     PORT=3104 node scripts/serve-standalone.mjs
//     BASE=http://127.0.0.1:3104 node scripts/test/p2-cleanup-f004-evaluator-probe.mjs
//
// 验收对照（features.json F004 acceptance 逐条）：
//   A1 抽出的 HandoffPanel 同时被生产与夹具消费（DOM 实证，非源码声明）
//   A2 夹具 border-dashed 已对齐生产口径 —— 本 feature 的回归价值
//   A3 生产侧 chrome 与 F004 之前逐字一致（抽取不得偷改生产外观）
//   A4 三处分叉逐项成立：dashed / stage 三元文案 / 多卡 flex（单卡亦走同路径）
//   A5 抽象未引入多余 DOM 层（fragment 而非额外 wrapper）
//   A6 HandoffCard 全 props 路径不退化（两侧并集覆盖 turns 态与非 turns 态）
//   NC 负控：检测器活性证明 —— 同页非 dashed 的 SurfaceCard 必须被判为「无虚线框」

import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3104';
const PROD = `${BASE}/admin/campaigns/lc?env=brief`;
const FIXTURE = `${BASE}/preview/agent-canvas`;

// F004 之前 HandoffCollab.tsx:73 硬编码的生产 chrome（git show 8f5f470^ 取得）：
//   <SurfaceCard className="border-dashed p-3">  →  SurfaceCard 基类 + " border-dashed p-3"
const PROD_CHROME_BEFORE_F004 =
  'rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700 border-dashed p-3';
const LIST_CHROME = 'flex flex-col gap-1.5';

let pass = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fails.push(name);
    console.log(`  FAIL  ${name}${extra ? `\n          ${extra}` : ''}`);
  }
};

const browser = await chromium.launch();
const page = await browser.newContext({
  viewport: { width: 1512, height: 982 },
}).then((c) => c.newPage());

/**
 * 用「区块标签文案」锚定 panel，然后取其最近的 rounded-2xl 祖先/自身作为 chrome 根。
 * 刻意不复用 Generator 的 querySelectorAll('div').find 写法，改走 XPath-ish 上溯，
 * 保证两套探针的失效模式不相关。
 */
async function readPanel(url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page
    .getByText('多 Agent 联动 · 点开看交接')
    .first()
    .waitFor({ timeout: 20_000 });
  return page.evaluate(() => {
    const RE = /多 Agent 联动 · 点开看交接/;
    // 取「最内层」命中元素：自身命中且无子元素命中（否则 <html>/<body> 也会命中）
    const label = [...document.querySelectorAll('*')].find(
      (e) =>
        RE.test(e.textContent || '') &&
        ![...e.children].some((c) => RE.test(c.textContent || '')),
    );
    if (!label) return null;
    let root = label.parentElement;
    while (root && !/(^|\s)rounded-2xl(\s|$)/.test(root.className || '')) {
      root = root.parentElement;
    }
    if (!root) return null;
    const kids = [...root.children];
    const list = kids.find((k) => /flex-col/.test(k.className || ''));
    // 同页所有 SurfaceCard（rounded-2xl + border-gray-200），用于负控
    const surfaces = [...document.querySelectorAll('div')]
      .filter((d) => /(^|\s)rounded-2xl(\s|$)/.test(d.className || ''))
      .map((d) => d.className);
    return {
      chrome: root.className,
      labelText: (label.textContent || '').trim(),
      childCount: kids.length,
      listChrome: list?.className ?? null,
      cardCount: list ? list.children.length : 0,
      bodyText: root.textContent || '',
      surfaces,
    };
  });
}

console.log('\n--- 生产侧 /admin/campaigns/lc?env=brief ---');
const prod = await readPanel(PROD);
ok(prod !== null, 'A1 生产侧 HandoffPanel 在场');
ok(
  prod?.chrome === PROD_CHROME_BEFORE_F004,
  'A3 生产侧 chrome 与 F004 之前逐字一致（抽取未偷改生产外观）',
  `期望=${PROD_CHROME_BEFORE_F004}\n          实得=${prod?.chrome}`,
);
ok(
  /(^|\s)border-dashed(\s|$)/.test(prod?.chrome || ''),
  'A4-1 生产侧虚线框（分叉 1：dashed）',
);
ok(
  prod?.labelText.startsWith('本环节协同 · 多 Agent 联动'),
  'A4-2 生产侧 stage 命中 → 「本环节协同」文案（分叉 2 支路 a）',
  `实得=${prod?.labelText}`,
);
ok(
  prod?.listChrome === LIST_CHROME,
  'A4-3 生产侧多卡 flex 容器（分叉 3）',
  `实得=${prod?.listChrome}`,
);
ok(
  (prod?.cardCount ?? 0) >= 2,
  'A4-3b 生产侧多卡路径仍在（≥2 张）',
  `卡数=${prod?.cardCount}`,
);
ok(
  prod?.childCount === 2,
  'A5 生产侧 panel 直接子节点恰为 2（SectionLabel + flex 列表，无多余 wrapper）',
  `实得 childCount=${prod?.childCount}`,
);

// A6 生产侧：turns 态全 props（turns / payload / outcome 仅展开后渲染）
ok(
  /对齐组合覆盖能否达成 300 万曝光目标/.test(prod?.bodyText || ''),
  'A6-1 生产侧 summary prop（收起态）',
);
await page
  .locator('button', { hasText: '对齐组合覆盖能否达成' })
  .first()
  .click();
const opened = await page.evaluate(() => {
  const RE = /多 Agent 联动 · 点开看交接/;
  const label = [...document.querySelectorAll('*')].find(
    (e) =>
      RE.test(e.textContent || '') &&
      ![...e.children].some((c) => RE.test(c.textContent || '')),
  );
  let root = label?.parentElement;
  while (root && !/(^|\s)rounded-2xl(\s|$)/.test(root.className || '')) {
    root = root.parentElement;
  }
  return root?.textContent || '';
});
ok(/交接物：组合预估覆盖/.test(opened), 'A6-2 生产侧 payload prop（交接物 chip）');
ok(/策略 Agent 采纳/.test(opened), 'A6-3 生产侧 outcome prop（绿色结论行）');
ok(
  /目标是 30 天 300 万曝光/.test(opened),
  'A6-4 生产侧 turns prop（逐轮台词）',
);
// A6-6 fromColor / toColor：双色 agent 名走 inline style 通道，两端色值须不同
const colors = await page.evaluate(() => {
  const RE = /多 Agent 联动 · 点开看交接/;
  const lab = [...document.querySelectorAll('*')].find(
    (e) =>
      RE.test(e.textContent || '') &&
      ![...e.children].some((c) => RE.test(c.textContent || '')),
  );
  let root = lab?.parentElement;
  while (root && !/(^|\s)rounded-2xl(\s|$)/.test(root.className || '')) {
    root = root.parentElement;
  }
  return [...(root?.querySelectorAll('span[style*="color"]') ?? [])]
    .slice(0, 4)
    .map((s) => s.style.color);
});
ok(
  new Set(colors).size >= 2,
  'A6-6 生产侧 fromColor/toColor prop（双色 agent 名，色值可区分）',
  `实得色值=${JSON.stringify(colors)}`,
);

console.log('\n--- 夹具侧 /preview/agent-canvas ---');
const fix = await readPanel(FIXTURE);
ok(fix !== null, 'A1 夹具侧 HandoffPanel 在场');
ok(
  /(^|\s)border-dashed(\s|$)/.test(fix?.chrome || ''),
  'A2 夹具侧已获 border-dashed —— 对齐生产口径（本 feature 回归价值）',
  `实得=${fix?.chrome}`,
);
ok(
  // 非空守卫：两侧都是 undefined 时不得算通过（恒真断言防护）
  Boolean(fix?.chrome) && fix?.chrome === prod?.chrome,
  'A1/A2 两侧 chrome class 逐字相同（共用同一外壳的 DOM 实证）',
  `prod=${prod?.chrome}\n          fix =${fix?.chrome}`,
);
ok(
  fix?.labelText.startsWith('协同交接 · 多 Agent 联动'),
  'A4-2b 夹具侧无 stage → 「协同交接」文案（分叉 2 支路 b）',
  `实得=${fix?.labelText}`,
);
ok(
  fix?.listChrome === LIST_CHROME && fix?.cardCount === 1,
  'A4-3c 夹具单卡亦走同一 flex 容器路径（不再裸放）',
  `listChrome=${fix?.listChrome} cards=${fix?.cardCount}`,
);
ok(
  fix?.childCount === 2,
  'A5 夹具侧 panel 直接子节点恰为 2（无多余 wrapper）',
  `实得 childCount=${fix?.childCount}`,
);
// A6 夹具侧：非 turns 态全 props（collapsible=false + defaultOpen + artifactType/Ref）
ok(
  /交接物：/.test(fix?.bodyText || ''),
  'A6-5 夹具侧 artifactType/artifactRef prop（静态展开态，非 turns 分支）',
);

// --- NC 检测器活性证明 -------------------------------------------------
// 同页存在别的 SurfaceCard（rounded-2xl）不带 border-dashed；若检测器把它们也判成
// 「有虚线框」，说明 A2/A4-1 是恒真断言。要求：至少 1 个 rounded-2xl 被判为无虚线框。
const nonDashed = (fix?.surfaces ?? []).filter(
  (c) => !/(^|\s)border-dashed(\s|$)/.test(c),
);
ok(
  nonDashed.length >= 1,
  `NC 负控：检测器能区分「无虚线框」的 SurfaceCard（判否 ${nonDashed.length} 个 / 共 ${fix?.surfaces.length}）`,
  '若为 0 说明 border-dashed 检测器恒真、A2 无判别力',
);

await browser.close();
console.log(
  `\n=== F004 Evaluator 探针：${pass} passed, ${fails.length} failed ===`,
);
if (fails.length > 0) {
  console.log(`FAILED: ${fails.join(' | ')}`);
  process.exit(1);
}
