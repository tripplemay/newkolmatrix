import { test, expect } from '@playwright/test';
import { mockFonts, SNAPSHOT_OPTS } from './handoffs-mock';

// AGENT-FOUNDATION F010 — Generative Canvas 视觉基线。
// /preview/agent-canvas 用固定夹具确定性还原 hello-agent 画布产物（专家头 + KOL 卡片流 + 一次交接）。
// baseline 按平台存，CI(linux) 用 -linux baseline（update-visual-baselines 重生）。浅色，viewport ≥1440px。
// ARCH-M05 F017：断言阈值收紧 maxDiffPixels 1500（BL-FE-13 拍板）。
test('agent canvas visual baseline', async ({ page }) => {
  await mockFonts(page);
  await page.goto('/preview/agent-canvas', { waitUntil: 'domcontentloaded' });
  // 等画布卡片流就位（KolResultCards 头部「N 位候选」）。
  await page.getByText('位候选').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('agent-canvas.png', SNAPSHOT_OPTS);
});
