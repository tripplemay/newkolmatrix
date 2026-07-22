import { test, expect } from '@playwright/test';
import { mockFonts, mockHandoffs, SNAPSHOT_OPTS } from './handoffs-mock';

// CICD-VPS F004 → AGENT-FOUNDATION F008 重指：IA 重构后驾驶舱 = /admin/today（今天雷达）。
// FE-REFACTOR F007（BL-FE-11）：/api/handoffs route mock 固定夹具（CI 无 DB 时 HandoffCollab
// 恒 null 的基线盲区已消）。ARCH-M05 F017：mock 抽共享夹具 + 断言阈值收紧 maxDiffPixels 1500
//（BL-FE-13 拍板：重生用 --update-snapshots=all、断言用紧阈值）。
test('today dashboard visual baseline', async ({ page }) => {
  await mockFonts(page);
  await mockHandoffs(page);
  await page.goto('/admin/today', { waitUntil: 'domcontentloaded' });
  // 雷达区块头（SecHead 无条件渲染）。
  await page.getByText('需要你确认').first().waitFor({ timeout: 30_000 });
  // M1-C F003（D-A/D-H）：基线态 = 零 PendingAction（CI 天然如此；本地重生前须清表）。
  // 空态文案是硬断言锚——雷达接真后若渲染 null（静默空白，§4.3 反面）此处超时硬红。
  await page
    .getByText('今天没有需要你确认的事')
    .first()
    .waitFor({ timeout: 30_000 });
  // 等 Copilot 侧栏的协同交接卡就位（route mock 保证确定性渲染）。
  await page.getByText('协同交接').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_200);
  await expect(page).toHaveScreenshot('en-today.png', SNAPSHOT_OPTS);
});
