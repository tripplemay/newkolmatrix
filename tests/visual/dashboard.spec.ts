import { test, expect } from '@playwright/test';

// CICD-VPS F004 — Dashboard 视觉回归。占位数据是静态的 → 截图确定性。
test('dashboard visual baseline', async ({ page }) => {
  await page.goto('/admin/dashboards/default', { waitUntil: 'networkidle' });
  // 等客户端渲染的 KPI + 图表就位（NoSSR + apexcharts 动态加载）
  await page.getByText('已发现 KOL').first().waitFor({ timeout: 30_000 });
  await page
    .locator('.apexcharts-canvas')
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => {});
  await page.waitForTimeout(1_000);
  await expect(page).toHaveScreenshot('en-dashboard.png', {
    maxDiffPixelRatio: 0.02,
    animations: 'disabled',
    fullPage: false,
  });
});
