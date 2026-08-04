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
//
// M5-AUTH-RLS F012：与根配置同步补登录态前置（setup 项目 + storageState）。
// 不补则 F003 middleware 落地后本配置跑出来的每条 admin/preview 用例都是 307 红，
// 「验收专用配置」会变成一个只能证明「没登录」的配置。
// 并发跑多份实例时用 PW_STORAGE_STATE=<各自路径> 隔离（默认落点见 tests/support/auth-session.ts）。
import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE_PATH } from '../support/auth-session';

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
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1512, height: 982 },
        storageState: STORAGE_STATE_PATH,
      },
    },
  ],
});
