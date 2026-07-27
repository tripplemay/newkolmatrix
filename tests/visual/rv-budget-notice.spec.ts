// M4.7-FRONTDESK 复验 · 撞顶告知的**渲染层**实测（Evaluator 产物）
//
// 【为什么必须有这一条】fix_round2 对 R-2 的收口证据是：① 两条源码级 grep
// （面板有分支 / 两侧字段同名）② 真 POST 的响应体字节里有 part。两者都**止步于
// 浏览器之外**——vitest 是 node 环境（无 jsdom），断不了「这条 part 是否真的被
// React 渲染成用户看得见的东西」。R-2 的原话正是「写进流 ≠ 用户看得见」。
//
// 这里补最后一段：把**真 route 产出的字节**（tests/integration/m47-rv-probe.test.ts
// 落盘的 /tmp/rv-budget-body.txt）回放给真浏览器里的真 CopilotPanel，断言告知
// 真的出现在页面上。零外呼：请求被 page.route 拦下，不出网。

import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const BODY_DUMP = '/tmp/rv-budget-body.txt';
const BODY_DUMP_NONE = '/tmp/rv-nonotice-body.txt';
/** 字面量——刻意不 import registry 常量，避免与被测物同源自证。 */
const NOTICE_LITERAL = '我没答完就到步数上限了';

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
  await page.goto('/admin/today', { waitUntil: 'domcontentloaded' });
  const input = page.getByPlaceholder('问 Agent 或下达任务…');
  await input.waitFor({ state: 'visible', timeout: 30_000 });
  await input.fill('rv 复验：撞顶告知渲染');
  await input.press('Enter');
}

// 【入库须知】本 spec 依赖 m47-rv-probe.test.ts 落盘的真字节。若编排方决定收编，
// 请把「先跑 vitest 落盘」串进 test:visual 的前置；在字节缺席时本 spec **自动 skip**，
// 不会把 CI 打红（但那时它也不提供任何保护——skip ≠ 通过）。
test.skip(
  () => !existsSync(BODY_DUMP) || !existsSync(BODY_DUMP_NONE),
  '缺少真字节样本：先跑 npx vitest run tests/integration/m47-rv-probe.test.ts',
);

test('撞顶告知真的渲染到用户眼前（真 route 字节 → 真浏览器）', async ({
  page,
}) => {
  const body = readFileSync(BODY_DUMP, 'utf8');
  // 前提校验：字节里确实带告知，否则下面断言无意义（活性证明）
  expect(body).toContain('data-budget_notice');
  expect(body).toContain(NOTICE_LITERAL);

  await replay(page, body);

  const notice = page.getByTestId('budget-notice');
  await expect(notice, 'R-2 的终点：告知必须出现在页面上').toBeVisible({
    timeout: 20_000,
  });
  await expect(notice).toContainText(NOTICE_LITERAL);
  // 不是空壳分支：补救指引也要在
  await expect(notice).toContainText('把问题拆小一点再问我一次');
});

// 活性证明：换成**自然收敛**的真字节（无告知 part）→ 同一个选择器必须找不到。
// 没有这一条，上面那条无法与「页面上恒有一个 budget-notice 元素」区分开。
test('活性对照：自然收敛的字节 → 页面上没有撞顶告知', async ({ page }) => {
  const body = readFileSync(BODY_DUMP_NONE, 'utf8');
  expect(body).not.toContain('data-budget_notice');

  await replay(page, body);
  // 先等答案真的渲染出来，再断言告知不在（否则可能只是还没渲染完）
  await expect(page.getByText('rv 答完了').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('budget-notice')).toHaveCount(0);
});
