import { test, expect } from '@playwright/test';
import { mockFonts, mockHandoffs, SNAPSHOT_OPTS } from './handoffs-mock';

// P2-CLEANUP F005 — 创作者详情抽屉「开启态」视觉基线。
//
// 立项原因：该抽屉此前 visual 与交互**零覆盖**，正是 BL-FE-15（遮罩点击关不掉）能活到现在的原因。
// 本条与 F001 的交互探针（scripts/test/p2-cleanup-f001-drawer-close.mjs）互补：
// 那条守「能不能关」，这条守「打开长什么样」。
//
// 范式沿 ARCH-M05 F017：route mock 固定夹具（/api/handoffs，Copilot 侧栏确定性）+ 本地字体回放
// + waitFor 关键文案硬断言 + 图表 settle。阈值沿用 F017 收紧后的 SNAPSHOT_OPTS，未放宽。
//
// 硬断言纪律（框架 v1.0.6 web-runtime-patterns §4.3）：
// CreatorDrawer 在 `creator === null` 时直接 return null。若不配 waitFor，抽屉渲染不出来时
// 截图只会拍到底下的创作者列表页，两边都「有内容」→ 基线把缺失静默编码成合法画面。
// 下面的 waitFor 抓的是**只存在于抽屉内部**的文案，抽屉不在即超时硬失败。
// 活性证明见 commit message：临时抽掉抽屉数据源后本条确实翻红。

const CHART_SETTLE_MS = 1_500;

test('creator drawer open-state visual baseline', async ({ page }) => {
  await mockFonts(page);
  await mockHandoffs(page);

  await page.goto('/admin/creators', { waitUntil: 'domcontentloaded' });
  await page.getByText('只做发现和分流').first().waitFor({ timeout: 30_000 });

  // 整行可点开抽屉（creators/page.tsx onRowClick）。静态 mock 数据 → 首行确定。
  await page.locator('tbody tr').first().click();

  // 硬断言：以下三处均只在抽屉内部渲染，缺一即说明抽屉没起来。
  const drawer = page.locator('.chakra-modal__content[aria-label="创作者详情"]');
  await drawer.waitFor({ state: 'visible', timeout: 30_000 });
  await drawer.getByText('受众匹配').first().waitFor({ timeout: 30_000 });
  await drawer.getByText('加入某项目匹配').first().waitFor({ timeout: 30_000 });

  // 抽屉内含 donut / 环形进度 / 面积图，须等绘制稳定；同时等 webfont 全就绪
  // （1500px 紧阈值下字体换绘会抖，F017 三连跑实测校准）。
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(CHART_SETTLE_MS);

  await expect(page).toHaveScreenshot('creator-drawer.png', SNAPSHOT_OPTS);
});
