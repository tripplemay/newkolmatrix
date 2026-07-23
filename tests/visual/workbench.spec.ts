import { test, expect } from '@playwright/test';
import { mockFonts, mockHandoffs, SNAPSHOT_OPTS } from './handoffs-mock';

// ARCH-M05 F017 — M0.5 六页工作台视觉基线扩展。
// 每页 mock /api/handoffs（Copilot 侧栏确定性）+ waitFor 页面关键文案硬断言
//（渲染 null 即超时硬失败，杜绝空白入基线）+ 等 ApexCharts 渲染稳定。
// baseline 按平台存；linux 经 update-visual-baselines（--update-snapshots=all）重生。

const CHART_SETTLE_MS = 1_500;

async function shot(page: import('@playwright/test').Page, name: string) {
  // 全套并行（2 worker）下 CPU 竞争会拉长晚期绘制：等 webfont 全就绪 + 固定 settle，
  // 消除 1500px 紧阈值下的字体换绘/图表尾帧抖动（F017 三连跑实测校准）。
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(CHART_SETTLE_MS);
  await expect(page).toHaveScreenshot(name, SNAPSHOT_OPTS);
}

test.beforeEach(async ({ page }) => {
  await mockFonts(page);
  await mockHandoffs(page);
});

test('campaigns list visual baseline', async ({ page }) => {
  await page.goto('/admin/campaigns', { waitUntil: 'domcontentloaded' });
  await page.getByText('只做进入').first().waitFor({ timeout: 30_000 });
  await shot(page, 'campaigns.png');
});

test('project env=brief visual baseline', async ({ page }) => {
  await page.goto('/admin/campaigns/xg?env=brief', {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('目标健康度').first().waitFor({ timeout: 30_000 });
  await shot(page, 'project-brief.png');
});

test('project env=match visual baseline', async ({ page }) => {
  await page.goto('/admin/campaigns/xg?env=match', {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('待你裁定').first().waitFor({ timeout: 30_000 });
  // M2-A F005 接真后的基线态 = CI 无网关凭据 lazy 静默降级空态（v1.0.9 §4.3）：
  // 空态文案硬断言使「数据源整个消失 / 降级路径回归」都超时硬红，杜绝静默空白入基线。
  await page
    .getByText('组合方案尚未生成——进入匹配环节后由匹配 Agent 自动筛查生成')
    .waitFor({ timeout: 30_000 }); // 矩阵空态占位（D2 降级）
  await page
    .getByText('暂无待裁定候选——匹配 Agent 拿不准的判断会放到这里等你拍板。')
    .waitFor({ timeout: 30_000 }); // 待裁定表空态
  await shot(page, 'project-match.png');
});

test('project env=reach visual baseline', async ({ page }) => {
  await page.goto('/admin/campaigns/xg?env=reach', {
    waitUntil: 'domcontentloaded',
  });
  // M3-A F008 接真后的基线态 = 夹具项目无 approved 组合/thread 的空态（match 基线同口径，
  // v1.0.9 §4.3）：空态文案硬断言使「数据源整个消失 / 组装层回归」都超时硬红。
  await page
    .getByText('还没有触达对象——先在「创作者匹配」批准一个组合')
    .first()
    .waitFor({ timeout: 30_000 }); // 左栏人列空态（裁决 #5 数据源语义）
  await page.getByText('整个环节聚焦').first().waitFor({ timeout: 30_000 }); // V6-24 宣示句（🔒静态锚）
  await shot(page, 'project-reach.png');
});

test('project env=delivery visual baseline', async ({ page }) => {
  await page.goto('/admin/campaigns/xg?env=delivery', {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('不提供绕过入口').first().waitFor({ timeout: 30_000 });
  await shot(page, 'project-delivery.png');
});

test('project env=insight visual baseline', async ({ page }) => {
  await page.goto('/admin/campaigns/xg?env=insight', {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('证据缺口').first().waitFor({ timeout: 30_000 });
  await shot(page, 'project-insight.png');
});

test('creators visual baseline', async ({ page }) => {
  await page.goto('/admin/creators', { waitUntil: 'domcontentloaded' });
  await page.getByText('只做发现和分流').first().waitFor({ timeout: 30_000 });
  // M2-B F004 接真后的基线态 = 2 行确定性夹具（visual-kols seed，§4.3 硬断言：
  // 数据源整个消失 / RSC 组装回归时超时硬红，杜绝静默空白入基线）
  await page
    .getByText('基线夹具·深字段齐备')
    .first()
    .waitFor({ timeout: 30_000 });
  await page
    .getByText('基线夹具·待接入态')
    .first()
    .waitFor({ timeout: 30_000 });
  await shot(page, 'creators.png');
});

test('knowledge visual baseline', async ({ page }) => {
  await page.goto('/admin/knowledge', { waitUntil: 'domcontentloaded' });
  await page
    .getByText('策略 Agent 分析出的游戏特点')
    .first()
    .waitFor({ timeout: 30_000 });
  // M1-D F004 接真后的基线态 = CI DB 4 canonical Game 零素材空态（v1.0.9 §4.3）：
  // 三条硬断言使「数据源整个消失 / 空态文案回归」都超时硬红，杜绝静默空白入基线。
  await page.getByText('星轨协议').first().waitFor({ timeout: 30_000 }); // Game 行真渲染
  await page.getByText('上传素材开始分析').waitFor({ timeout: 30_000 }); // 素材空态
  await page
    .getByText('待解析——上传素材后由策略 Agent 生成')
    .first()
    .waitFor({ timeout: 30_000 }); // 特点卡空态占位
  await shot(page, 'knowledge.png');
});

test('insight page visual baseline', async ({ page }) => {
  await page.goto('/admin/insight', { waitUntil: 'domcontentloaded' });
  await page.getByText('生成对外分享报告').first().waitFor({ timeout: 30_000 });
  await shot(page, 'insight.png');
});

test('runs visual baseline', async ({ page }) => {
  await page.goto('/admin/runs', { waitUntil: 'domcontentloaded' });
  await page.getByText('永久可查').first().waitFor({ timeout: 30_000 });
  await shot(page, 'runs.png');
});
