#!/usr/bin/env node
/**
 * M1-A-BRIEF F002 验收诊断 — p2:f004「A 生产侧多卡路径仍在」断言的时序依赖（Evaluator 编写）
 *
 * 背景：验收首跑 p2:f004 得 14 passed / 1 failed（卡数=1，期望 >=2），随后 3 次重跑全绿。
 *      本脚本用于判定这是偶发抖动，还是 F002 恢复 SSR 后系统性变窄的竞态窗口。
 *
 * 机理假设：
 *   HandoffPanel 的卡 = COLLAB_MOCK[stage]（同步渲染）+ GET /api/handoffs（客户端 useEffect 异步取数）。
 *   p2-cleanup-f004 用 `getByText('多 Agent 联动 · 点开看交接').waitFor()` 作为「面板就绪」信号，
 *   随后立即 evaluate 读 children.length。
 *   · 拆 NoSSR 前：该标签只能在客户端挂载后出现，waitFor 落在 hydration 之后 ——
 *     此时 fetch 已发出，本地环回往往已返回，断言碰巧稳定。
 *   · 拆 NoSSR 后：标签已在服务端 HTML 中（curl 可见），waitFor 在 domcontentloaded 即满足，
 *     早于 hydration、更早于 fetch 发出 —— 断言与取数之间不再有任何同步点。
 *
 * 判据：若「waitFor 即刻读数」显著低于「等 /api/handoffs 响应后读数」，则假设成立，
 *      该断言属 F002 引入的探针失效（产品行为本身不受影响）。
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3300';
const PROD = `${BASE}/admin/campaigns/lc?env=brief`;
const N = Number(process.env.N || 8);

const readCards = () =>
  document.evaluate
    ? (() => {
        const el = [...document.querySelectorAll('div')].find(
          (d) =>
            /多 Agent 联动 · 点开看交接/.test(d.textContent || '') &&
            d.className.includes('rounded-2xl'),
        );
        return el?.children[1]?.children.length ?? -1;
      })()
    : -1;

const browser = await chromium.launch();
const immediate = [];
const settled = [];

for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  const page = await ctx.newPage();
  let apiDone = false;
  page.on('response', (r) => {
    if (r.url().includes('/api/handoffs')) apiDone = true;
  });

  await page.goto(PROD, { waitUntil: 'domcontentloaded' });
  // 复刻 p2-cleanup-f004 的就绪信号
  await page.getByText('多 Agent 联动 · 点开看交接').first().waitFor({ timeout: 20_000 });
  const nowCount = await page.evaluate(readCards);
  const apiSeenAtWait = apiDone;

  // 再等取数真正落地后重读
  try {
    await page.waitForResponse((r) => r.url().includes('/api/handoffs'), { timeout: 15_000 });
  } catch {}
  await page.waitForTimeout(600);
  const lateCount = await page.evaluate(readCards);

  immediate.push(nowCount);
  settled.push(lateCount);
  console.log(
    `run ${String(i + 1).padStart(2)}: waitFor 即刻 cardCount=${nowCount}` +
      ` (此刻 /api/handoffs 已返回=${apiSeenAtWait}) → 取数落地后 cardCount=${lateCount}`,
  );
  await ctx.close();
}
await browser.close();

const okImm = immediate.filter((c) => c >= 2).length;
const okSet = settled.filter((c) => c >= 2).length;
console.log(`\n断言 cardCount>=2 通过率：`);
console.log(`  探针现判据（waitFor 后即刻读）: ${okImm}/${N}`);
console.log(`  等 /api/handoffs 落地后读     : ${okSet}/${N}`);
console.log(
  okSet > okImm
    ? '\n结论：断言结果取决于客户端取数是否已落地 —— 属时序竞态，非产品行为差异。'
    : '\n结论：两种读法通过率一致 —— 未复现竞态，需另找成因。',
);
