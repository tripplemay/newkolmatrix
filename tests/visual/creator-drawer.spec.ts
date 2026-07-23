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

// M2-B F005 接真后的锚点重设计：行选择从「首行 = mock 确定」改为**固定夹具行**
//（scripts/seed/visual-kols.ts：VK-FULL/VK-NULL 固定 publicId + followers 恒居前二）。
// 双状态硬断言（§4.3 扩展）：深字段齐备态（真值 + crawl 派生溯源）与待接入态
//（逐子块降级占位）都必须活着——任一状态渲染缺失即超时硬红。基线截图 = VK-FULL 态。

test('creator drawer open-state visual baseline', async ({ page }) => {
  await mockFonts(page);
  await mockHandoffs(page);

  await page.goto('/admin/creators', { waitUntil: 'domcontentloaded' });
  await page.getByText('只做发现和分流').first().waitFor({ timeout: 30_000 });

  const drawer = page.locator(
    '.chakra-modal__content[aria-label="创作者详情"]',
  );

  // ── 状态 2 先验：VK-NULL（待接入态）——断言后关闭，不入基线截图 ──
  await page.getByText('基线夹具·待接入态').first().click();
  await drawer.waitFor({ state: 'visible', timeout: 30_000 });
  await drawer
    .getByText('受众数据采集未完成', { exact: false })
    .first()
    .waitFor({ timeout: 30_000 }); // ① 整区待核占位
  await drawer
    .getByText('平台 API 未接通', { exact: false })
    .first()
    .waitFor({ timeout: 30_000 }); // ② 待接入
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden', timeout: 10_000 });

  // ── 状态 1（基线态）：VK-FULL（深字段齐备）──
  await page.getByText('基线夹具·深字段齐备').first().click();
  await drawer.waitFor({ state: 'visible', timeout: 30_000 });
  await drawer.getByText('受众匹配').first().waitFor({ timeout: 30_000 });
  await drawer.getByText('加入某项目匹配').first().waitFor({ timeout: 30_000 });
  // 真值面硬断言：interests 标签（crawl 派生）+ 可信度 ring 值 + A 级
  await drawer.getByText('sandbox').first().waitFor({ timeout: 30_000 });
  await drawer.getByText('可信度 A 级').first().waitFor({ timeout: 30_000 });

  // 抽屉内含 donut / 环形进度 / 面积图，须等绘制稳定；同时等 webfont 全就绪
  // （1500px 紧阈值下字体换绘会抖，F017 三连跑实测校准）。
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(CHART_SETTLE_MS);

  await expect(page).toHaveScreenshot('creator-drawer.png', SNAPSHOT_OPTS);
});
