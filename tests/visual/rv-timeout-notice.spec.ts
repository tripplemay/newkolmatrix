// M4.8-HARDEN F005 · 超时告知与流级错误的**渲染层**实测（浏览器级钉）
//
// 【为什么必须有这一条】F004 的收口证据止步于浏览器之外：源码级 grep（面板有分支）
// + 真 POST 的响应体字节里有 part。vitest 是 node 环境（无 jsdom），断不了「这条 part
// 是否真的被 React 渲染成用户看得见的东西」——R-2 的原话正是「写进流 ≠ 用户看得见」。
//
// 镜像先例 rv-budget-notice.spec.ts：把**真 route 产出的字节**
//（tests/integration/m48-timeout-fixture.test.ts 落盘）回放给真浏览器里的真 CopilotPanel。
// 零外呼：请求被 page.route 拦下，不出网。
//
// 【样本缺席 = 红，不是 skip】S-RV2-9 同款：前置真跑了就一定有字节；没有字节说明前置
// 被人拆了或落盘失败，那正是需要有人看见的事。本地单跑：先 `npm run test:visual:fixtures`。

import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const BODY_DUMP = '/tmp/m48-timeout-body.txt';
const BODY_DUMP_NONE = '/tmp/m48-notimeout-body.txt';

/** 字面量——刻意不 import registry / 面板常量，避免与被测物同源自证。 */
const TIMEOUT_LITERAL = '本次回答超时中断了';
const RETRY_LITERAL = '再问我一次';
const STREAM_ERROR_LITERAL = '这次回答没能送达';

/** 移动端视口（镜像 agent-loop.spec.ts 的两视口口径）。 */
const MOBILE = { width: 430, height: 932 };

/** 送一条消息并回放给定的 SSE 字节。 */
async function replay(
  page: import('@playwright/test').Page,
  body: string,
): Promise<void> {
  await page.route('**/api/agent', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'x-vercel-ai-ui-message-stream': 'v1',
        'cache-control': 'no-cache',
        'x-agent-id': 'orchestrator',
        'x-agent-tools': 'consult_specialist',
      },
      body,
    });
  });
  await send(page, 'm48 复验：超时告知渲染');
}

/** 打开面板并送一条消息（不预设 route → 由调用方先装好拦截）。 */
async function send(
  page: import('@playwright/test').Page,
  text: string,
): Promise<void> {
  await page.goto('/admin/today', { waitUntil: 'domcontentloaded' });
  const input = page.getByPlaceholder('问 Agent 或下达任务…');
  await input.waitFor({ state: 'visible', timeout: 30_000 });
  await input.fill(text);
  await input.press('Enter');
}

test.beforeAll(() => {
  const missing = [BODY_DUMP, BODY_DUMP_NONE].filter((p) => !existsSync(p));
  if (missing.length) {
    throw new Error(
      `缺少真字节样本 ${missing.join(' / ')} —— test:visual 的前置 ` +
        '`npm run test:visual:fixtures` 没跑成。skip 掉等于这条钉子不存在，故直接红。',
    );
  }
});

test('超时告知真的渲染到用户眼前（真 route 字节 → 真浏览器）', async ({
  page,
}) => {
  const body = readFileSync(BODY_DUMP, 'utf8');
  // 前提校验：字节里确实带告知，否则下面断言无意义（活性证明）
  expect(body).toContain('data-timeout_notice');
  expect(body).toContain(TIMEOUT_LITERAL);

  await replay(page, body);

  const notice = page.getByTestId('timeout-notice');
  await expect(notice, 'F004 的终点：告知必须出现在页面上').toBeVisible({
    timeout: 20_000,
  });
  await expect(notice).toContainText(TIMEOUT_LITERAL);
  // 不是空壳分支：补救指引也要在
  await expect(notice).toContainText(RETRY_LITERAL);
});

test('超时告知在移动视口同样可见（面板退为右滑抽屉后不丢）', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const body = readFileSync(BODY_DUMP, 'utf8');
  await replay(page, body);

  const notice = page.getByTestId('timeout-notice');
  await expect(notice, '窄屏用户同样有权知道这次没答完').toBeVisible({
    timeout: 20_000,
  });
  await expect(notice).toContainText(TIMEOUT_LITERAL);
});

// 活性证明：换成**正常收敛**的真字节（无告知 part）→ 两个选择器都必须找不到。
// 没有这一条，上面那条无法与「页面上恒有一个 timeout-notice 元素」区分开。
test('活性对照：正常收敛的字节 → 既无超时告知也无流级错误', async ({ page }) => {
  const body = readFileSync(BODY_DUMP_NONE, 'utf8');
  expect(body).not.toContain('data-timeout_notice');

  await replay(page, body);
  // 先等答案真的渲染出来，再断言两张卡都不在（否则可能只是还没渲染完）
  await expect(page.getByText('m48 答完了').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('timeout-notice')).toHaveCount(0);
  await expect(
    page.getByTestId('stream-error'),
    '正常会话不得凭空多出一张错误卡（回归：无超时/无错误 → 渲染零变化）',
  ).toHaveCount(0);
});

test('流级错误（500）真的渲染成一句人话，而不是"什么都不发生"', async ({
  page,
}) => {
  await page.route('**/api/agent', async (route) => {
    await route.fulfill({
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'upstream exploded' }),
    });
  });
  await send(page, 'm48 复验：流级错误渲染');

  const err = page.getByTestId('stream-error');
  await expect(
    err,
    'useChat 的 error 此前根本没被解构 —— 失败时界面上什么都不发生',
  ).toBeVisible({ timeout: 20_000 });
  await expect(err).toContainText(STREAM_ERROR_LITERAL);
  // 流级错误 ≠ 超时：两张卡不得混用
  await expect(page.getByTestId('timeout-notice')).toHaveCount(0);
});
