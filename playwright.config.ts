import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE_PATH } from './tests/support/auth-session';

// CICD-VPS F004 — 视觉回归。baseline 按平台存（{platform}），因 mac↔linux 字体渲染不 pixel-match；
// CI(linux) 用 -linux baseline，由 update-visual-baselines.yml 在 CI 重生并 commit。
//
// M5-AUTH-RLS F012 — 登录态前置：`setup` 项目跑一次真登录并落 storageState，
// `chromium` 项目 dependencies 引它 + use.storageState 复用。既有用例**零改动**跑通
//（F003 middleware 之前它们直接 goto /admin/*，之后仍然直接 goto，只是浏览器带上了会话 cookie）。
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
    // 登录一次（tests/visual/auth.setup.ts）。文件名不匹配默认 testMatch（*.spec.ts），
    // 故它只会作为 setup 跑，不会被主项目重复收集。setup 自身**不带** storageState——
    // 那正是它要生产的东西。
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
  // 起 standalone 产物（与 Docker runner 同 artifact；CI 在此前已 npm run build）
  webServer: {
    command: 'node scripts/serve-standalone.mjs',
    url: 'http://127.0.0.1:3000/admin/today',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
