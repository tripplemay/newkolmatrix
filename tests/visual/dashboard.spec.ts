import { test, expect } from '@playwright/test';

// CICD-VPS F004 → AGENT-FOUNDATION F008 重指：IA 重构后驾驶舱 = /admin/today（今天雷达）。
// 静态占位数据 → 截图确定性。baseline 按平台存，CI(linux) 用 -linux baseline（update-visual-baselines 重生）。
test('today dashboard visual baseline', async ({ page }) => {
  await page.goto('/admin/today', { waitUntil: 'networkidle' });
  // 等客户端渲染的今天雷达就位（待办卡直达某项目某环节）。
  await page.getByText('需要你确认').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_000);
  await expect(page).toHaveScreenshot('en-today.png', {
    maxDiffPixelRatio: 0.02,
    animations: 'disabled',
    fullPage: false,
  });
});
