// M4-INSIGHT F009 — 正向控制：V8 #7-#14 渠道/受众图卡「结构保留、数据到位零返工」实证。
//
// 本批 channel/audience 数据源属 M5 平台回传 → 生产路径恒 null → 页面显「待接入」占位
//（ui-inventory M4 F009 例外登记）。仅靠占位无法区分「结构保留」与「代码已死」，
// 故在**只读 worktree 副本**里注入样例数据后实测：5 柱 BarChart / donut 150 /
// 🔒 中心叠加读数 / legend 4 行 / chart-sub / chart-big / 绿 badge 是否真渲染。
//
// 用法：PROBE_BASE_URL=http://127.0.0.1:3010 PROBE_PROJECT_ID=<id> node scripts/test/f009-eval-chart-positive-control.mjs
import { chromium } from 'playwright';

const BASE = process.env.PROBE_BASE_URL ?? 'http://127.0.0.1:3010';
const PID = process.env.PROBE_PROJECT_ID;
if (!PID) throw new Error('需要 PROBE_PROJECT_ID');

let pass = 0;
let fail = 0;
const check = (ok, label, extra = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
await page.goto(`${BASE}/admin/campaigns/${PID}?env=insight`, {
  waitUntil: 'domcontentloaded',
});
await page.getByText('证据缺口').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(6000); // apex 渲染（dynamic import + 首帧）

const body = await page.textContent('body');
check(body.includes('各渠道有效安装占比'), 'V8-#7 chart-sub 渲染');
check(body.includes('5,420'), 'V8-#8 chart-big 渲染');
check(body.includes('达标'), 'V8-#9 绿 badge 渲染');

const bars = await page.locator('.apexcharts-canvas .apexcharts-bar-area').count();
check(bars === 5, 'V8-#10 渠道 BarChart 恰 5 柱', `bars=${bars}`);

const donutBox = await page.locator('div.relative.h-\\[150px\\].w-\\[150px\\]').count();
check(donutBox === 1, 'V8-#12 受众 donut 150 盒在场');
const donutSlices = await page.locator('.apexcharts-canvas .apexcharts-pie-area').count();
check(donutSlices === 4, 'V8-#12 donut 4 段', `slices=${donutSlices}`);
check(body.includes('71%') && body.includes('休闲玩家'), 'V8-#13 🔒 中心叠加读数');

const legendRows = await page
  .locator('span.h-3.w-3.flex-none.rounded')
  .count();
check(legendRows === 4, 'V8-#14 legend 4 行色块', `rows=${legendRows}`);
check(
  body.includes('休闲农场向') &&
    body.includes('生活方式') &&
    body.includes('亲子家庭'),
  'V8-#14 legend 标签渲染',
);
check(!body.includes('待接入'), '数据到位后占位消失（零返工换真值）');

await browser.close();
console.log(`\n[positive-control] PASS=${pass} FAIL=${fail}`);
if (fail > 0) process.exitCode = 1;
