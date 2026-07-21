// ARCH-M05 F017 — 视觉基线共用夹具：/api/handoffs route mock。
// 全部 admin 页挂常驻 CopilotPanel（内含 HandoffCollab 取数），CI 无 DB 时该请求失败会
// 让协同交接卡渲染 null（BL-FE-11 盲区，FE-REFACTOR F007 首修）。所有 admin 页 spec 统一
// 挂本 mock，本地与 CI 行为一致、填充态入基线。夹具与 /preview/agent-canvas 的
// HANDOFF_FIXTURE 同款（match→reach）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

// ARCH-M05 F017 — CDN 字体本地回放：index.css/App.css 经 Google Fonts CDN 引入
// Poppins + DM Sans，而 Playwright 每测试全新 context 无缓存 → 每用例重拉 CDN，
// 网络抖动即 fonts.ready 挂起/截图超时（F017 实测多次复现的总根源，CI 同样暴露）。
// 夹具：tests/visual/fonts/ 内置改写为 /__visual_fonts__/ 路径的 CSS + 28 个 woff2，
// route 层拦截 googleapis/gstatic 与本地路径全部离线回放——零网络、字形与线上完全一致。
const FONTS_DIR = join(__dirname, 'fonts');

function fontCssFor(url: string): string {
  const family = new URL(url).searchParams.get('family') ?? '';
  const file = family.startsWith('Poppins')
    ? 'poppins.css'
    : family.includes('ital')
    ? 'dmsans-italic.css'
    : 'dmsans.css';
  return readFileSync(join(FONTS_DIR, file), 'utf8');
}

export async function mockFonts(page: Page): Promise<void> {
  await page.route('**/fonts.googleapis.com/**', (route) =>
    route.fulfill({
      contentType: 'text/css',
      body: fontCssFor(route.request().url()),
    }),
  );
  await page.route('**/__visual_fonts__/**', (route) => {
    const name = route.request().url().split('/').pop() ?? '';
    return route.fulfill({
      contentType: 'font/woff2',
      body: readFileSync(join(FONTS_DIR, name)),
    });
  });
  // 兜底：任何漏网的 gstatic 直连也按 basename 本地回放
  await page.route('**/fonts.gstatic.com/**', (route) => {
    const name = route.request().url().split('/').pop() ?? '';
    return route.fulfill({
      contentType: 'font/woff2',
      body: readFileSync(join(FONTS_DIR, name)),
    });
  });
}

export const HANDOFFS_MOCK = {
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

export async function mockHandoffs(page: Page): Promise<void> {
  await page.route('**/api/handoffs', (route) =>
    route.fulfill({ json: HANDOFFS_MOCK }),
  );
}

/** BL-FE-13 拍板阈值：断言收紧至 maxDiffPixels 1500（重生仍走 --update-snapshots=all）。 */
export const SNAPSHOT_OPTS = {
  maxDiffPixels: 1500,
  animations: 'disabled',
  fullPage: false,
} as const;
