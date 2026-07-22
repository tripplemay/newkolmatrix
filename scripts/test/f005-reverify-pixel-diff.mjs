// M1-C-LIST-TODAY F005 复验（fix_round=1）像素取证脚本 — Evaluator 产物。
//
// 用途：复刻 tests/visual/workbench.spec.ts "campaigns list" 用例的截图口径
//（viewport 1512×982 / mockFonts 离线回放 / mockHandoffs / fonts.ready + 1500ms settle /
//  动画禁用 + caret 隐藏，即 toHaveScreenshot animations:'disabled' 的等效稳定化），
// 对当前运行中的 standalone 实例截图，与 c362711 重生后的 campaigns-darwin.png
// 逐像素 exact-diff——验证首轮发现的 720px 借绿漂移是否归零。
//
// 用法：BASE=http://127.0.0.1:3000 node scripts/test/f005-reverify-pixel-diff.mjs
// 依赖：仅 @playwright/test（截图）；比对交给 stdout 后续 PIL 步骤或本脚本内置 PNG 解析。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTS_DIR = join(ROOT, 'tests', 'visual', 'fonts');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const OUT = process.env.OUT || '/tmp/f005-reverify/campaigns-current.png';

function fontCssFor(url) {
  const family = new URL(url).searchParams.get('family') ?? '';
  const file = family.startsWith('Poppins')
    ? 'poppins.css'
    : family.includes('ital')
      ? 'dmsans-italic.css'
      : 'dmsans.css';
  return readFileSync(join(FONTS_DIR, file), 'utf8');
}

const HANDOFFS_MOCK = {
  handoffs: [
    {
      id: 'visual-fixture-handoff-1',
      fromAgent: 'match',
      toAgent: 'reach',
      artifactType: 'match_plan',
      artifactRef: 'match_plan:demo-starlight-protocol',
      summary:
        '匹配 Agent 交接：为《星轨协议》筛出 3 位坦克世界解说候选（受众吻合、可信度已核），交触达 Agent 起草邀约。',
      createdAt: '2026-07-20T00:00:00.000Z',
    },
  ],
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

// mockFonts（逐字复刻 tests/visual/handoffs-mock.ts 逻辑）
await page.route('**/fonts.googleapis.com/**', (route) =>
  route.fulfill({ contentType: 'text/css', body: fontCssFor(route.request().url()) }),
);
await page.route('**/__visual_fonts__/**', (route) => {
  const name = route.request().url().split('/').pop() ?? '';
  return route.fulfill({ contentType: 'font/woff2', body: readFileSync(join(FONTS_DIR, name)) });
});
await page.route('**/fonts.gstatic.com/**', (route) => {
  const name = route.request().url().split('/').pop() ?? '';
  return route.fulfill({ contentType: 'font/woff2', body: readFileSync(join(FONTS_DIR, name)) });
});
// mockHandoffs
await page.route('**/api/handoffs', (route) => route.fulfill({ json: HANDOFFS_MOCK }));

await page.goto(`${BASE}/admin/campaigns`, { waitUntil: 'domcontentloaded' });
await page.getByText('只做进入').first().waitFor({ timeout: 30_000 });
// toHaveScreenshot animations:'disabled' 等效稳定化（首轮对抗复核 §5.2 校准过的口径）
await page.addStyleTag({
  content:
    '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);

mkdirSync(dirname(OUT), { recursive: true });
const buf = await page.screenshot({ fullPage: false });
writeFileSync(OUT, buf);
console.log(`screenshot saved: ${OUT} (${buf.length} bytes)`);
await browser.close();
