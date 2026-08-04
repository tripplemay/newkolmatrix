import { test, expect } from '@playwright/test';
import { mockFonts, SNAPSHOT_OPTS } from './handoffs-mock';

// M5-AUTH-RLS F002（spec D-10 §2.4）— 登录 / 注册页视觉基线：两页 × 两视口
// （1512×982 桌面 / 430×932 移动）。baseline 按平台存，CI(linux) 用 -linux 基线
// （首次 push 必红属预期，见 patterns/web-runtime-patterns.md §4.4：需跑一次
//  Update visual baselines workflow 生成 linux 基线）。
//
// 两页都是**未登录可达面**（F003 middleware 豁免清单），故本 spec 不需要任何登录前置——
// 它同时也是「豁免真的生效」的活体证据：middleware 若把 /login 也拦了，这四条会 302 到自己而超时。
//
// 页面为纯静态表单（无取数、无动画、无相对时间），fullPage:false 的视口截图即可覆盖卡片全貌。

const VIEWPORT_MOBILE = { width: 430, height: 932 };

test('login page visual baseline', async ({ page }) => {
  await mockFonts(page);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  // 硬断言锚：标题 + 两个输入框 + 提交钮都得在（渲染成空白时此处超时硬红，§4.3）
  await page.getByRole('heading', { name: '登录' }).waitFor({ timeout: 30_000 });
  await page.locator('#email').waitFor({ timeout: 30_000 });
  await page.locator('#password').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: '登录' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('auth-login.png', SNAPSHOT_OPTS);
});

test('login page visual baseline (mobile viewport)', async ({ page }) => {
  await page.setViewportSize(VIEWPORT_MOBILE);
  await mockFonts(page);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '登录' }).waitFor({ timeout: 30_000 });
  await page.locator('#password').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('auth-login-mobile.png', SNAPSHOT_OPTS);
});

test('signup page visual baseline', async ({ page }) => {
  await mockFonts(page);
  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('heading', { name: '创建账号' })
    .waitFor({ timeout: 30_000 });
  await page.locator('#tenantName').waitFor({ timeout: 30_000 });
  await page.locator('#email').waitFor({ timeout: 30_000 });
  await page.locator('#password').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('auth-signup.png', SNAPSHOT_OPTS);
});

test('signup page visual baseline (mobile viewport)', async ({ page }) => {
  await page.setViewportSize(VIEWPORT_MOBILE);
  await mockFonts(page);
  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('heading', { name: '创建账号' })
    .waitFor({ timeout: 30_000 });
  await page.locator('#password').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveScreenshot('auth-signup-mobile.png', SNAPSHOT_OPTS);
});

// ── 错误态渲染实测（acceptance：401 / 限速 / 校验失败三类须有用户可读文案）──
// 精确文案映射由 tests/unit/auth-form-messages.test.ts 逐条钉；这里只证「错误态真的会渲染出来」。
// 刻意不断言具体某句：登录失败在不同环境下可能落到「凭据不正确」或兜底文案
//（如 CI 未配 AUTH_SECRET 时请求 500），断言封闭集合才既有鉴别力又不玄学。
const LOGIN_ERROR_MESSAGES = [
  '邮箱或密码不正确',
  '尝试过于频繁，请稍后再试',
  '登录失败，请稍后重试',
];

test('login form renders a readable error for bad credentials', async ({
  page,
}) => {
  await mockFonts(page);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill('definitely-not-a-user@test.invalid');
  await page.locator('#password').fill('WrongPassword2026');
  await page.getByRole('button', { name: '登录' }).click();
  const err = page.getByTestId('login-error');
  await err.waitFor({ timeout: 30_000 });
  const text = (await err.textContent())?.trim() ?? '';
  expect(LOGIN_ERROR_MESSAGES, `实际渲染文案：${text}`).toContain(text);
  // 仍停在登录页（认证失败不得放行）
  expect(new URL(page.url()).pathname).toBe('/login');
});

test('login form blocks empty submit with a validation message', async ({
  page,
}) => {
  await mockFonts(page);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '登录' }).click();
  const err = page.getByTestId('login-error');
  await err.waitFor({ timeout: 30_000 });
  await expect(err).toHaveText('请填写邮箱和密码');
});

test('signup form blocks weak password with a validation message', async ({
  page,
}) => {
  await mockFonts(page);
  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await page.locator('#tenantName').fill('视觉夹具工作室');
  await page.locator('#email').fill('fixture@test.invalid');
  await page.locator('#password').fill('weak');
  await page.getByRole('button', { name: '创建我的账号' }).click();
  const err = page.getByTestId('signup-error');
  await err.waitFor({ timeout: 30_000 });
  await expect(err).toHaveText('密码至少 10 位，且需同时包含字母和数字');
  // 弱口令根本不该发出注册请求（前端先拦一道）
  expect(new URL(page.url()).pathname).toBe('/signup');
});
