// DS-FOUNDATION F006：截取 Dashboard visual baseline（浅色，≥1440px 宽）。
// 用法：先 `npm run build && npm run start`（或 dev）起服务，再 `node scripts/capture-baseline.mjs`。
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const URL =
  process.env.BASE_URL || 'http://localhost:3000/admin/dashboards/default';
const OUT = 'tests/screenshots/baseline/en-dashboard.png';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 1,
});
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
// 等客户端渲染的 KPI + 图表就位（NoSSR + apexcharts 动态加载）
await page.waitForSelector('text=已发现 KOL', { timeout: 30000 });
await page
  .waitForSelector('.apexcharts-canvas', { timeout: 30000 })
  .catch(() => console.warn('apexcharts canvas not detected, continuing'));
await page.waitForTimeout(1500);

mkdirSync(dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT });
await browser.close();
console.log('baseline saved →', OUT);
