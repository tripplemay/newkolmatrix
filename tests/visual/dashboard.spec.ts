import { test, expect } from '@playwright/test';

// CICD-VPS F004 → AGENT-FOUNDATION F008 重指：IA 重构后驾驶舱 = /admin/today（今天雷达）。
// 静态占位数据 → 截图确定性。baseline 按平台存，CI(linux) 用 -linux baseline（update-visual-baselines 重生）。
//
// FE-REFACTOR F007（BL-FE-11）：/api/handoffs 用 route mock 固定夹具——此前 CI 无 DB 时该请求失败，
// HandoffCollab 恒渲染 null，基线静默编码空区域（生产交接卡零回归覆盖）；mock 后本地与 CI 行为一致，
// 填充态进入基线。夹具与 /preview/agent-canvas 的 HANDOFF_FIXTURE 同款（match→reach）。
const HANDOFFS_MOCK = {
  handoffs: [
    {
      id: 'visual-fixture-handoff-1',
      fromAgent: 'match',
      toAgent: 'reach',
      artifactType: 'match_plan',
      artifactRef: 'match_plan:demo-starlight-protocol',
      summary:
        '匹配 Agent 交接：为《星轨协议》筛出 3 位坦克世界解说候选（受众吻合、可信度已核），交触达 Agent 起草邀约。',
      createdAt: '2026-07-20T00:00:00.000Z',
    },
  ],
};

test('today dashboard visual baseline', async ({ page }) => {
  await page.route('**/api/handoffs', (route) =>
    route.fulfill({ json: HANDOFFS_MOCK }),
  );
  await page.goto('/admin/today', { waitUntil: 'networkidle' });
  // 等客户端渲染的今天雷达就位（待办卡直达某项目某环节）。
  await page.getByText('需要你确认').first().waitFor({ timeout: 30_000 });
  // 等 Copilot 侧栏的协同交接卡就位（route mock 保证确定性渲染）。
  await page.getByText('协同交接').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_000);
  await expect(page).toHaveScreenshot('en-today.png', {
    maxDiffPixelRatio: 0.02,
    animations: 'disabled',
    fullPage: false,
  });
});
