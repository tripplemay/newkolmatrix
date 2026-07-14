// DS-FOUNDATION verifying — Evaluator runtime+visual gate probe (test artifact, not product code).
// Visits each route with Playwright, records HTTP status, console errors/pageerrors, and screenshots.
// Also toggles dark mode on the dashboard to confirm no crash (dark regression gate).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = 'tests/screenshots/verify';
mkdirSync(OUT, { recursive: true });

const routes = [
  { name: 'root-redirect', path: '/' },
  { name: 'dashboard', path: '/admin/dashboards/default' },
  { name: 'discovery', path: '/admin/discovery' },
  { name: 'database', path: '/admin/database' },
  { name: 'campaigns', path: '/admin/campaigns' },
  { name: 'outreach', path: '/admin/outreach' },
];

const browser = await chromium.launch();
const results = [];

for (const r of routes) {
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
    deviceScaleFactor: 1,
  });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  let status = 0;
  try {
    const resp = await page.goto(`${BASE}${r.path}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(1200);
  } catch (e) {
    pageErrors.push(`NAV_ERROR ${e}`);
  }
  const finalUrl = page.url();
  await page.screenshot({ path: `${OUT}/${r.name}.png` });
  results.push({
    name: r.name,
    path: r.path,
    status,
    finalUrl,
    consoleErrors,
    pageErrors,
  });
  await page.close();
}

// Dark-mode regression: load dashboard, add `dark` class to body, screenshot, check no error.
{
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
    deviceScaleFactor: 1,
  });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`${BASE}/admin/dashboards/default`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(800);
  // simulate the Configurator dark toggle (adds `dark` to body)
  await page.evaluate(() => document.body.classList.add('dark'));
  await page.waitForTimeout(1000);
  const bodyBg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  const hasDark = await page.evaluate(() =>
    document.body.classList.contains('dark'),
  );
  await page.screenshot({ path: `${OUT}/dashboard-dark.png` });
  results.push({
    name: 'dashboard-dark-toggle',
    hasDarkClass: hasDark,
    bodyBg,
    consoleErrors,
    pageErrors,
  });
  await page.close();
}

// light-mode body bg check on dashboard
{
  const page = await browser.newPage({
    viewport: { width: 1512, height: 982 },
  });
  await page.goto(`${BASE}/admin/dashboards/default`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(600);
  const bodyClass = await page.evaluate(() => document.body.className);
  const appBg = await page.evaluate(() => {
    const el = document.querySelector('.bg-background-100');
    return el ? getComputedStyle(el).backgroundColor : 'no .bg-background-100';
  });
  results.push({ name: 'light-mode-check', bodyClass, appBg });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
