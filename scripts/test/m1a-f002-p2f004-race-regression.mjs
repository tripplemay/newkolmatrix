// M1-A-BRIEF fixing-1 — p2:f004 卡数竞态的回归证据脚本。
//
// 来源：F002 验收 PARTIAL（对抗复核维持原判）——p2:f004 的
// 「A 生产侧多卡路径仍在（卡数>=2）」在并发/CPU 吃紧时约 20-25% 概率误红。
// 根因不在产品：拆 NoSSR 恢复 SSR 后，文案锚点进入服务端 HTML，
// 不再隐含「hydration 已完成、数据已到位」，读数因此落在中间态上。
//
// 本脚本在【同一页面、同一时刻】对照两种读法，使「修复前失败 / 修复后通过」可复现：
//   · OLD：等文案锚点 → 立刻读卡数        （p2:f004 修复前的做法）
//   · NEW：等文案锚点 → 轮询卡数到 >=2 → 读（p2:f004 修复后的做法）
//
// CPU 节流放大竞态窗口，使对照确定性成立而非靠运气。
//
// 前置：standalone 已起（testing-env-patterns §7，不走 next dev）
//   PORT=3000 node .next/standalone/server.js
//   BASE=http://127.0.0.1:3000 node scripts/test/m1a-f002-p2f004-race-regression.mjs
//
// 退出码：0 = 对照成立（OLD 至少踩中一次中间态且 NEW 全程稳定）/ 1 = 不成立

import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const PROD = `${BASE}/admin/campaigns/lc?env=brief`;
const ROUNDS = Number(process.env.ROUNDS || 8);
const THROTTLE = Number(process.env.THROTTLE || 4);
const ANCHOR = '多 Agent 联动 · 点开看交接';
const EXPECT = 2;

/** 在页面里数 HandoffPanel 的卡片数。两种读法共用，排除「读法本身不同」的干扰。 */
const COUNT_CARDS = (anchor) => {
  const el = [...document.querySelectorAll('div')].find(
    (d) =>
      typeof d.className === 'string' &&
      d.className.includes('rounded-2xl') &&
      (d.textContent || '').includes(anchor),
  );
  return el?.children[1]?.children.length ?? 0;
};

const browser = await chromium.launch();
const results = { old: [], neu: [] };

for (let i = 0; i < ROUNDS; i++) {
  for (const mode of ['old', 'neu']) {
    const ctx = await browser.newContext({
      viewport: { width: 1512, height: 982 },
    });
    const page = await ctx.newPage();
    // CPU 节流：拉开「锚点可见」与「数据落地 + React commit」之间的间隙
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

    await page.goto(PROD, { waitUntil: 'domcontentloaded' });
    await page.getByText(ANCHOR).first().waitFor({ timeout: 30_000 });

    if (mode === 'neu') {
      // 修复后的做法：轮询等卡数落定；超时不抛，交给读数如实反映
      try {
        await page.waitForFunction(
          ([anchor, min]) => {
            const el = [...document.querySelectorAll('div')].find(
              (d) =>
                typeof d.className === 'string' &&
                d.className.includes('rounded-2xl') &&
                (d.textContent || '').includes(anchor),
            );
            return (el?.children[1]?.children.length ?? 0) >= min;
          },
          [ANCHOR, EXPECT],
          { timeout: 20_000, polling: 50 },
        );
      } catch {
        /* 留给下面读数如实记录 */
      }
    }

    const count = await page.evaluate(COUNT_CARDS, ANCHOR);
    results[mode].push(count);

    // 落定态对照：证明产品行为本身是对的，问题只在读的时机
    await page.waitForTimeout(1500);
    const settled = await page.evaluate(COUNT_CARDS, ANCHOR);
    if (mode === 'old' && count < EXPECT && settled >= EXPECT) {
      console.log(
        `  round ${i + 1} OLD 踩中中间态：读数=${count} → 落定后=${settled}（产品正确，读法错）`,
      );
    }
    await ctx.close();
  }
}
await browser.close();

const bad = (arr) => arr.filter((c) => c < EXPECT).length;
const oldBad = bad(results.old);
const newBad = bad(results.neu);

console.log(`\n[p2:f004 竞态回归] CPU 节流 ${THROTTLE}x × ${ROUNDS} 轮`);
console.log(`  OLD（等锚点即读，修复前做法）：卡数序列 [${results.old.join(', ')}] — 不足 ${EXPECT} 张：${oldBad}/${ROUNDS}`);
console.log(`  NEW（轮询到落定再读，修复后做法）：卡数序列 [${results.neu.join(', ')}] — 不足 ${EXPECT} 张：${newBad}/${ROUNDS}`);

// 对照成立的两个条件：旧做法确实会踩中（否则这条回归证据没有区分力），新做法全程稳定。
const oldReproduced = oldBad > 0;
const newStable = newBad === 0;
console.log(
  `\n  修复前可复现竞态：${oldReproduced ? '是' : '否'}　修复后稳定：${newStable ? '是' : '否'}`,
);

if (!oldReproduced) {
  console.log(
    '  ✗ 旧做法未踩中中间态——本次节流强度不足以复现，该结论无区分力。请提高 THROTTLE 或 ROUNDS 重跑。',
  );
  process.exit(1);
}
if (!newStable) {
  console.log('  ✗ 新做法仍出现不足 2 张——修复未闭合竞态。');
  process.exit(1);
}
console.log('  ✓ 对照成立：竞态在修复前可复现，修复后消失。');
