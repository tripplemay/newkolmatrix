#!/usr/bin/env node
/**
 * M1-A-BRIEF F002 独立复核 — p2:f004「A 生产侧多卡路径仍在」断言的时序余量测量
 *
 * 目的：不看聚合通过率，直接量出 p2-cleanup-f004 的就绪信号（getByText 锚点 waitFor）
 *      与断言真正依赖的事件（GET /api/handoffs 落地 + 第 2 张卡入 DOM）之间的时间差。
 *
 * 若 t(锚点可见) < t(api 落地)，则探针在读数时刻的 cardCount 取决于纯运气；
 * 该时间差（余量）即竞态窗口宽度，负余量 = 必挂，正余量小 = 抖动。
 *
 * 用法：export BASE=http://127.0.0.1:3300 N=15; node scripts/test/m1a-f002-p2f004-timeline.mjs
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3300';
const PROD = `${BASE}/admin/campaigns/lc?env=brief`;
const N = Number(process.env.N || 15);
const CPUTHROTTLE = Number(process.env.CPUTHROTTLE || 0);

const readCards = () => {
  const el = [...document.querySelectorAll('div')].find(
    (d) =>
      /多 Agent 联动 · 点开看交接/.test(d.textContent || '') &&
      d.className.includes('rounded-2xl'),
  );
  return el?.children[1]?.children.length ?? -1;
};

const browser = await chromium.launch();
const rows = [];

for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  const page = await ctx.newPage();

  if (CPUTHROTTLE > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPUTHROTTLE });
  }

  let tApiReq = null;
  let tApiRes = null;
  page.on('request', (r) => {
    if (r.url().includes('/api/handoffs') && tApiReq === null) tApiReq = Date.now();
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/handoffs') && tApiRes === null) tApiRes = Date.now();
  });

  const t0 = Date.now();
  await page.goto(PROD, { waitUntil: 'domcontentloaded' });
  const tDcl = Date.now();
  await page.getByText('多 Agent 联动 · 点开看交接').first().waitFor({ timeout: 20_000 });
  const tAnchor = Date.now();
  const cardsAtAnchor = await page.evaluate(readCards);
  const tRead = Date.now();

  try {
    await page.waitForResponse((r) => r.url().includes('/api/handoffs'), { timeout: 15_000 });
  } catch {}
  await page.waitForTimeout(500);
  const cardsSettled = await page.evaluate(readCards);

  rows.push({
    dcl: tDcl - t0,
    anchor: tAnchor - t0,
    read: tRead - t0,
    apiReq: tApiReq ? tApiReq - t0 : null,
    apiRes: tApiRes ? tApiRes - t0 : null,
    margin: tApiRes ? tRead - (tApiRes - t0) - 0 : null,
    cardsAtAnchor,
    cardsSettled,
  });

  const r = rows[rows.length - 1];
  console.log(
    `run ${String(i + 1).padStart(2)}: DCL=${String(r.dcl).padStart(4)}ms ` +
      `锚点可见=${String(r.anchor).padStart(4)}ms 读数=${String(r.read).padStart(4)}ms ` +
      `apiReq=${String(r.apiReq).padStart(4)}ms apiRes=${String(r.apiRes).padStart(4)}ms ` +
      `| 读数-api落地 余量=${r.apiRes === null ? 'n/a' : String(r.read - r.apiRes).padStart(5)}ms ` +
      `| cards@锚点=${r.cardsAtAnchor} → 稳定后=${r.cardsSettled}`,
  );
  await ctx.close();
}
await browser.close();

const margins = rows.filter((r) => r.apiRes !== null).map((r) => r.read - r.apiRes);
const okImm = rows.filter((r) => r.cardsAtAnchor >= 2).length;
const okSet = rows.filter((r) => r.cardsSettled >= 2).length;
margins.sort((a, b) => a - b);
console.log(`\nCPU throttle = ${CPUTHROTTLE || 1}x`);
console.log(`断言 cardCount>=2：锚点即刻 ${okImm}/${N} · 稳定后 ${okSet}/${N}`);
console.log(
  `读数时刻相对 /api/handoffs 落地的余量(ms)：min=${margins[0]} p50=${margins[Math.floor(margins.length / 2)]} max=${margins[margins.length - 1]}`,
);
console.log('（余量为负 = 读数发生在取数落地之前 = 断言必然读到 1 张卡）');
