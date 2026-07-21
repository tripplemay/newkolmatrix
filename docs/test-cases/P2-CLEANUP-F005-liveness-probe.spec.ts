import { test, expect } from '@playwright/test';
import { mockFonts, mockHandoffs, SNAPSHOT_OPTS } from './handoffs-mock';

// ============================================================================
// P2-CLEANUP F005 验收探针（Evaluator 独立编写，非产品代码，跑完即移出 testDir）
// ============================================================================
// acceptance 指定的验证方式是「临时抽掉 mock 数据应硬失败」。Evaluator 不得改产品代码
// （mockCreators 是 src/lib/data/mock/creators 的静态模块，且非 API，route 拦不到），
// 故采用**运行时等效变异**：
//
//   CreatorDrawer.tsx:299 `if (creator === null) return null;`
//   creators/page.tsx:321-322 `<CreatorDrawer creator={selected} .../>`（selected 初始 null）
//
// → 「抽掉抽屉数据源」在运行时的唯一可观测后果 = 抽屉渲染 null、页面只剩创作者列表。
//   不点行 = selected 恒为 null = 与抽掉数据源逐位等价的 DOM 终态（且不碰任何产品代码）。
//
// 探针 A：保留 creator-drawer.spec.ts 的三道 waitFor 守卫 → 期望在守卫处硬失败。
// 探针 B：删掉守卫（其余逐字相同）→ 期望静默写出一张「只有列表页」的假基线，
//         证明守卫是**载荷性的**（load-bearing），而非装饰。
// 两条均在 --update-snapshots（基线生成模式）下跑——这正是 §4.3 所指的危险场景。
// 快照名带 p2f005-liveness- 前缀，绝不触碰 13 张真实基线。

const CHART_SETTLE_MS = 1_500;

test('PROBE-A 守卫在场 + 抽屉未渲染 → 必须硬失败（不得静默出基线）', async ({
  page,
}) => {
  await mockFonts(page);
  await mockHandoffs(page);

  await page.goto('/admin/creators', { waitUntil: 'domcontentloaded' });
  await page.getByText('只做发现和分流').first().waitFor({ timeout: 30_000 });

  // ↓↓↓ 变异点：不点行 → selected 恒 null → CreatorDrawer return null ↓↓↓
  // await page.locator('tbody tr').first().click();

  // 以下三行与 creator-drawer.spec.ts:32-35 逐字一致（超时缩至 8s 以免探针空转 30s）
  const drawer = page.locator('.chakra-modal__content[aria-label="创作者详情"]');
  await drawer.waitFor({ state: 'visible', timeout: 8_000 });
  await drawer.getByText('受众匹配').first().waitFor({ timeout: 8_000 });
  await drawer.getByText('加入某项目匹配').first().waitFor({ timeout: 8_000 });

  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(CHART_SETTLE_MS);

  await expect(page).toHaveScreenshot('p2f005-liveness-guarded.png', SNAPSHOT_OPTS);
});

test('PROBE-B 守卫移除 + 抽屉未渲染 → 会静默固化假基线（反证守卫载荷性）', async ({
  page,
}) => {
  await mockFonts(page);
  await mockHandoffs(page);

  await page.goto('/admin/creators', { waitUntil: 'domcontentloaded' });
  await page.getByText('只做发现和分流').first().waitFor({ timeout: 30_000 });

  // 同一变异点：不点行。区别仅在于——下面**没有**那三道 waitFor 守卫。
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(CHART_SETTLE_MS);

  await expect(page).toHaveScreenshot('p2f005-liveness-noguard.png', SNAPSHOT_OPTS);
});
