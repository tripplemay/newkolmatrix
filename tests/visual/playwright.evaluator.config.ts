// M1-A-BRIEF F002 验收专用 Playwright 配置（Evaluator 编写）。
//
// 与根 playwright.config.ts 的唯一差别：不自起 webServer，改打编排者已起好的 standalone 实例。
// 理由：本次验收多个 evaluator 并发共用同一份 .next 与同一个服务实例，
//   根配置的 webServer 会执行 `scripts/serve-standalone.mjs`（内含 cpSync 写 .next/standalone）
//   并占用 3000 端口 —— 都会干扰其他并发 evaluator 的环境。
// 其余项（testDir / snapshotPathTemplate / viewport / workers:1 / retries:0）逐字沿用根配置，
// 以保证比对的是同一组 13 张 {arg}-darwin 基线、同一确定性口径。
//
// 用法：BASE=http://127.0.0.1:3300 npx playwright test -c tests/visual/playwright.evaluator.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  snapshotPathTemplate: '../screenshots/baseline/{arg}-{platform}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE || 'http://127.0.0.1:3300',
    viewport: { width: 1512, height: 982 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1512, height: 982 } },
    },
  ],
});
