import { test, expect } from '@playwright/test';
import { mockFonts, SNAPSHOT_OPTS } from './handoffs-mock';

// M4.5-AGENT-LOOP F006 — 循环放开面视觉基线。
// /preview/agent-loop 用固定夹具确定性还原本批新增构件（行动计划卡 + 人格接手标注 + 边界卡切换）。
// baseline 按平台存，CI(linux) 用 -linux baseline（update-visual-baselines 重生）。浅色，viewport ≥1440px。
test('agent loop visual baseline', async ({ page }) => {
  await mockFonts(page);
  await page.goto('/preview/agent-loop', { waitUntil: 'domcontentloaded' });
  // 两个新构件都须就位（否则可能截在它们绘制之前，基线守的是半张图）。
  await page.getByTestId('action-plan-card').waitFor({ timeout: 30_000 });
  await page.getByTestId('persona-switch-note').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('agent-loop.png', SNAPSHOT_OPTS);
});

// 第二视口（移动宽度）：计划卡的步骤行含「需你确认」徽标 + 低报警示两枚 chip，窄屏最易换行错位。
test('agent loop visual baseline (mobile viewport)', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await mockFonts(page);
  await page.goto('/preview/agent-loop', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('action-plan-card').waitFor({ timeout: 30_000 });
  await page.getByTestId('persona-switch-note').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('agent-loop-mobile.png', SNAPSHOT_OPTS);
});
