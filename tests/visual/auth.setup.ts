// M5-AUTH-RLS F012（spec D-8）— playwright 全局登录前置：**登录一次，落 storageState**。
//
// 【为什么需要它】F003 的 middleware 落地后，/admin/* 与 /preview/* 未登录一律 307 → /login。
// 本机实测：F003 之后既有套件 23 failed / 7 passed，红的 23 条全是「等一个永远不会渲染的选择器」。
// 修法不是给 23 条用例各加一段登录（那是 23 份会各自漂移的清单），而是 setup 项目跑一次真登录，
// 把会话 cookie 存进 storageState，主项目 `dependencies: ['setup']` + `use.storageState` 复用。
// 既有用例因此**零改动**——它们不知道登录这回事，和 F003 之前一样直接 goto。
//
// 【豁免面为什么不受影响】auth-pages.spec.ts 打的是 /login 与 /signup（middleware 豁免清单），
// 带不带会话都可达、页面本身不读会话（全仓 useSession 引用 0 处，实测 grep），故它的 7 条在
// 登录态下渲染不变、基线不重生。
//
// 【失败必须响】登录不通时**当场抛带指引的错**，而不是写出一个 cookies:[] 的空 storageState
// 让 23 条用例在最后一层一起红——首因会被埋掉。故这里三重校验：URL 落到 /admin、API 面不 401、
// 落盘后回读确认真有会话 cookie。

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { resolveDevTestUserCredentials } from '../../src/lib/auth/dev-seed';
import {
  LOGIN_FAILED_PREFIX,
  STORAGE_STATE_PATH,
  hasSessionCookie,
  loginFailureHint,
} from '../support/auth-session';

setup('登录一次并落 storageState（供全部视觉用例复用）', async ({ page }) => {
  const { email, password } = resolveDevTestUserCredentials();

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: '登录' }).click();

  // 成功 = 客户端跳到 callbackUrl（默认 /admin/today）；失败 = 页面上渲染一句错误文案。
  // 【为什么用 race 而不是只等 URL】只等 URL 的话，登录失败要耗满超时预算才报错，
  // 且报错时**已经没有时间预算**去读页面上那句真正的失败原因（实测：错口令跑出来的
  // 首版报「页面错误文案：（无）」，把最有用的一句吃掉了）。两个条件一起等，先到者定性。
  const outcome = await Promise.race([
    page
      .waitForURL('**/admin/today', { timeout: 25_000 })
      .then(() => 'ok' as const)
      .catch(() => 'none' as const),
    page
      .getByTestId('login-error')
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => 'error' as const)
      .catch(() => 'none' as const),
  ]);
  if (outcome !== 'ok') {
    const shown = await page
      .getByTestId('login-error')
      .textContent()
      .catch((): string | null => null);
    throw new Error(
      `${LOGIN_FAILED_PREFIX}：浏览器登录未成功（停在 ${page.url()}）。` +
        `页面错误文案：${shown?.trim() || '（无——登录请求可能 500 或根本没发出）'}\n` +
        loginFailureHint(email),
    );
  }

  // 会话对**受保护 API 面**同样成立（middleware 认的是同一张 cookie）。
  // 只断言「不是 401」：401 是 F003 对未登录的唯一响应，其余状态码属业务面，与登录态无关。
  const api = await page.request.get('/api/handoffs');
  expect(
    api.status(),
    `API 面仍判未登录（${api.status()}）——cookie 没被 middleware 认下，storageState 存了也没用`,
  ).not.toBe(401);

  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });

  // 回读确认：storageState 对「没登上」的浏览器同样会写出合法 JSON（cookies: []）。
  expect(existsSync(STORAGE_STATE_PATH), 'storageState 未落盘').toBe(true);
  const state = JSON.parse(readFileSync(STORAGE_STATE_PATH, 'utf8'));
  expect(
    hasSessionCookie(state),
    `storageState 里没有会话 cookie —— 空壳文件会让后续用例以 307 的形式一起红，首因被埋掉。\n${loginFailureHint(
      email,
    )}`,
  ).toBe(true);

  console.log(
    `[auth.setup] 登录态就绪：${email} → ${STORAGE_STATE_PATH}（会话 cookie 已核实）`,
  );
});
