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
  await shot(page, 'project-match.png');
});

test('project env=reach visual baseline', async ({ page }) => {
  await page.goto('/admin/campaigns/xg?env=reach', {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('可编辑后发送').first().waitFor({ timeout: 30_000 });
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
  await shot(page, 'creators.png');
});

test('knowledge visual baseline', async ({ page }) => {
  await page.goto('/admin/knowledge', { waitUntil: 'domcontentloaded' });
  await page
    .getByText('策略 Agent 分析出的游戏特点')
    .first()
    .waitFor({ timeout: 30_000 });
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
