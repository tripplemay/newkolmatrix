// M4.8-HARDEN 复验探针（Evaluator 自建，非 Generator 产物）· F005 第二条绕过
//
// 【补的是哪一格】rv-timeout-notice.spec.ts 的四条都断言页面上出现**固定字面量**
// （'本次回答超时中断了'）。这四条挡不住一种写法：面板把文案**硬编码**在渲染分支里
// 而不读 data part 的 `notice` —— 那样一来服务端改文案（registry 单一真相源）时
// 用户看到的还是旧话，且四条钉全绿。
//
// 本探针把真字节样本里的 notice 值换成一个独一无二的标记串再回放：卡片必须显示
// **样本里的那句**，才证明内容是数据驱动的。附带一条空 notice 用例（面板应不渲染
// 空壳卡，与实物 `return notice ? ... : null` 对齐）。
//
// 零外呼：请求被 page.route 拦下。样本缺席即红（同 S-RV2-9 口径）。

import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const BODY_DUMP = '/tmp/m48-timeout-body.txt';
const REAL_NOTICE_HEAD = '本次回答超时中断了';
const MARKER = 'M48-EVAL-PROBE-数据驱动标记-42';

test.beforeAll(() => {
  if (!existsSync(BODY_DUMP)) {
    throw new Error(
      `缺少真字节样本 ${BODY_DUMP} —— 先跑 npm run test:visual:fixtures。skip 等于钉子不存在，故直接红。`,
    );
  }
});

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
  await input.fill('m48 复验探针：超时告知是否数据驱动');
  await input.press('Enter');
}

test('超时卡的正文来自 data part 而非硬编码（换掉样本文案 → 页面必须跟着变）', async ({
  page,
}) => {
  const raw = readFileSync(BODY_DUMP, 'utf8');
  expect(raw, '前提：样本里确实是那句真文案').toContain(REAL_NOTICE_HEAD);
  // 只替换 notice 的**值**（同一行 JSON 内的中文串），结构不动
  const mutated = raw.replace(
    /"notice":"[^"]*"/,
    `"notice":"${MARKER}"`,
  );
  expect(mutated).toContain(MARKER);
  expect(mutated, '替换后样本里不该再有真文案').not.toContain(REAL_NOTICE_HEAD);

  await replay(page, mutated);

  const notice = page.getByTestId('timeout-notice');
  await expect(notice, '超时卡必须渲染').toBeVisible({ timeout: 20_000 });
  await expect(
    notice,
    '卡片正文若与样本无关 = 文案被硬编码在面板里，registry 单一真相源形同虚设',
  ).toContainText(MARKER);
  await expect(notice).not.toContainText(REAL_NOTICE_HEAD);
});

test('notice 为空的 part 不渲染空壳卡（与实物的 notice ? ... : null 对齐）', async ({
  page,
}) => {
  const raw = readFileSync(BODY_DUMP, 'utf8');
  const emptied = raw.replace(/"notice":"[^"]*"/, '"notice":""');
  expect(emptied).toContain('data-timeout_notice');

  await replay(page, emptied);
  // 等流跑完（abort 事件后面板状态落定）再断言，避免"还没渲染"造成的假通过
  await page.waitForTimeout(1_500);
  await expect(
    page.getByTestId('timeout-notice'),
    '空文案不该在页面上留一张空卡',
  ).toHaveCount(0);
});
