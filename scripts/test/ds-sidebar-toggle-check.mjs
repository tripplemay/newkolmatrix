// DS-FOUNDATION reverify — targeted check: sidebar collapse (mini) still works via
// ConfiguratorContext after SidebarContext deletion. Opens the Configurator gear drawer,
// clicks the "Mini" sidebar option, and asserts the main content margin switches to the
// collapsed class (xl:ml-[142px]). Test artifact — no product code touched.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console:' + m.text());
});

await page.goto(`${BASE}/admin/dashboards/default`, {
  waitUntil: 'networkidle',
  timeout: 60000,
});
await page.waitForTimeout(800);

const mainSel = 'main';
const before = await page.getAttribute(mainSel, 'class');

// Open Configurator drawer via the settings gear button.
// Gear renders the MdSettings icon inside a button with onClick={onOpen}.
const gear = page.locator('nav button:has(svg)').filter({ hasNot: page.locator('img') });
// Fallback: find button that toggles the drawer by aria/title is unreliable; click all nav svg buttons until a drawer appears.
let opened = false;
const navButtons = await page.locator('nav button').all();
for (const b of navButtons) {
  await b.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(300);
  if (await page.locator('text=Mini').first().isVisible().catch(() => false)) {
    opened = true;
    break;
  }
}

let after = before;
let clickedMini = false;
if (opened) {
  // Click the "Mini" sidebar radio option.
  const mini = page.locator('text=Mini').first();
  await mini.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(600);
  after = await page.getAttribute(mainSel, 'class');
  clickedMini = true;
}

const beforeCollapsed = (before || '').includes('xl:ml-[142px]');
const afterCollapsed = (after || '').includes('xl:ml-[142px]');

console.log(
  JSON.stringify(
    {
      drawerOpened: opened,
      clickedMini,
      before_has_142: beforeCollapsed,
      after_has_142: afterCollapsed,
      toggledToMini: !beforeCollapsed && afterCollapsed,
      before_class_snippet: (before || '').slice(0, 120),
      after_class_snippet: (after || '').slice(0, 120),
      errors,
    },
    null,
    2,
  ),
);

await browser.close();
