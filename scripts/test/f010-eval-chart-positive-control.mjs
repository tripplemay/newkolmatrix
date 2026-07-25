// M4-INSIGHT F010 — Evaluator 正向控制（图卡 + ROI 二色）：证明「本批占位」不是死代码。
//
// 生产路径下 roiTrend / projectRoi 恒 null（M5 无 ROI 历史与真值源）、roiTone 恒 null
//（分子缺 → 证据不足显中性灰）。本脚本在**只读 worktree 副本**里注入样例数据后实测：
// ROI 走势 LineAreaChart 8 点渲染 · 各项目 ROI BarChart 4 柱 + 🔒 badge 文字型（非 %/数字）
// · ROI 单元 good→绿 / low→琥珀，且**二色均非红**。数据到位即完整渲染 = 零返工。
//
// 用法：在注入了样例数据的副本上起 dev/standalone，然后
//   PROBE_BASE_URL=http://127.0.0.1:3010 node scripts/test/f010-eval-chart-positive-control.mjs
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3010';
let pass = 0;
let fail = 0;
function check(ok, label, extra = '') {
  if (ok) {
    pass += 1;
    console.log(`PASS ${label}${extra ? ` — ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
await page.goto(`${BASE}/admin/insight`, { waitUntil: 'domcontentloaded' });
await page.getByText('生成对外分享报告').first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(2500); // ApexCharts 渲染

const txt = (await page.textContent('body')) ?? '';

// ① 占位消失（有数据就不该再显「待接入」）
const placeholders = await page
  .locator('p.text-sm.text-gray-600')
  .filter({ hasText: '待接入' })
  .count();
check(placeholders === 0, '① 注入数据后两图卡占位消失（占位非死代码）', `count=${placeholders}`);

// ② ROI 走势 = LineAreaChart，8 个数据点
const areaPoints = await page
  .locator('.apexcharts-area-series .apexcharts-series path.apexcharts-line, .apexcharts-area-series')
  .count();
check(areaPoints > 0, '② ROI 走势 LineAreaChart 渲染');
// 点数标定（sparkline 模式无 x 轴标签）：实测 n 点 → marker 元素 n+1、平滑曲线段 C×n
//（5 点 → markers=6 / curves=5；8 点 → markers=9 / curves=8，本机两轮标定一致）
const trend = await page.evaluate(() => {
  const canvas = document.querySelectorAll('.apexcharts-canvas')[0];
  if (!canvas) return { markers: -1, curves: -1 };
  const line = [
    ...canvas.querySelectorAll('g.apexcharts-series path.apexcharts-area'),
  ].pop();
  return {
    markers: canvas.querySelectorAll('.apexcharts-marker').length,
    curves: ((line?.getAttribute('d') ?? '').match(/C/g) ?? []).length,
  };
});
check(
  trend.markers - 1 === 8 && trend.curves === 8,
  '② ROI 走势 = 8 点（markers n+1 / 曲线段 n 双口径）',
  `markers=${trend.markers} curves=${trend.curves}`,
);

// ③ 各项目 ROI = BarChart 4 柱
const bars = await page.locator('.apexcharts-bar-area').count();
check(bars === 4, '③ 各项目 ROI BarChart 4 柱', `bars=${bars}`);

// ④ 🔒 badge 文字型（非数字/百分比）
check(txt.includes('料理次元领先'), '④ 🔒 各项目 ROI badge = 文字型');
const badgeIsNumeric = /badge[^]{0,20}\d+%/.test(txt);
check(!badgeIsNumeric, '④ badge 未被改成数字/百分比型');

// ⑤ ROI 二色：good → 绿 / low → 琥珀，且均非红
const roiClasses = await page
  .locator('table tbody tr td:nth-child(5) span')
  .evaluateAll((els) => els.map((e) => e.className));
check(
  roiClasses.some((c) => /horizonGreen-500/.test(c)),
  '⑤ ROI good → 绿（horizonGreen-500）',
);
check(
  roiClasses.some((c) => /horizonOrange-500/.test(c)),
  '⑤ ROI low → 琥珀（horizonOrange-500，非红）',
);
check(
  roiClasses.every((c) => !/horizonRed|text-red/.test(c)),
  '⑤ 🔒 二色中无红（「偏低」≠「错误」）',
);

await browser.close();
console.log(`\n[positive-control] PASS=${pass} FAIL=${fail}`);
if (fail > 0) process.exit(1);
