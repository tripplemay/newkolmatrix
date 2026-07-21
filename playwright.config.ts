import { defineConfig, devices } from '@playwright/test';

// CICD-VPS F004 — 视觉回归。baseline 按平台存（{platform}），因 mac↔linux 字体渲染不 pixel-match；
// CI(linux) 用 -linux baseline，由 update-visual-baselines.yml 在 CI 重生并 commit。
export default defineConfig({
  testDir: './tests/visual',
  snapshotPathTemplate: 'tests/screenshots/baseline/{arg}-{platform}{ext}',
  fullyParallel: false,
  // ARCH-M05 F017：视觉基线确定性优先——单 worker 消除多 worker 文件级并行的 CPU 竞争
  // 导致的晚期绘制抖动（1500px 紧阈值下 ~1/4 复现，实测校准）。12 用例约 2 分钟可接受。
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    viewport: { width: 1512, height: 982 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1512, height: 982 },
      },
    },
  ],
  // 起 standalone 产物（与 Docker runner 同 artifact；CI 在此前已 npm run build）
  webServer: {
    command: 'node scripts/serve-standalone.mjs',
    url: 'http://127.0.0.1:3000/admin/today',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
