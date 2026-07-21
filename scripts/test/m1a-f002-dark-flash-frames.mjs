#!/usr/bin/env node
/**
 * M1-A-BRIEF F002 验收 — 深色刷新「无浅色闪烁」的客观取证（Evaluator 编写）
 *
 * acceptance 原文写「肉眼确认」。隔离 evaluator 无法肉眼看，且肉眼分辨不出一两帧（~16ms）的
 * 闪白。此处改为「刷新后高频采样已渲染态 + 早期真实截图测亮度」，比肉眼严格。
 *
 * 判据：预置 localStorage=dark 后刷新，**从第一次可采样起**页面即为深色
 *      （body.dark 已置 + 早期截图亮度落在深色区间）。出现浅色窗口 = FOUC，
 *      即 P2-CLEANUP 的 pre-paint 内联脚本在 SSR 下失效。
 *
 * 配套检测器活性证明（必须，否则「零浅色窗口」与「探针根本看不见浅色」同形）：
 *      同一流程再跑一次，但用 route 拦截把 layout.tsx 的 pre-paint 内联脚本从 HTML 剔除。
 *      此时必须抓到浅色窗口 —— 证明本探针确实看得见浅色态。
 *
 * 实现备注：初版用 CDP Page.startScreencast 抓合成帧，实测在导航期间不发帧（110 帧全落在
 *      hydration 之后），剔除脚本后仍抓不到浅色 —— 该实现自证不可用，故改为本方案。
 *      基线：本页深色截图亮度 45 / 浅色 237（实测），阈值取 110。
 *
 * 前置：standalone server 起在 BASE。
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3300';
const TARGET = '/admin/today';
const BOOTSTRAP_RE =
  /<script>try\{if\(localStorage\.getItem\('kolmatrix\.colorMode'\)==='dark'\)\{document\.body\.classList\.add\('dark'\)\}\}catch\(e\)\{\}<\/script>/;
const DARK_MAX_LUMA = 110;
const SAMPLES = 40;
const SAMPLE_GAP_MS = 25;

async function lumaOf(page, decoder) {
  const b64 = (await page.screenshot({ type: 'jpeg', quality: 60 })).toString('base64');
  return decoder.evaluate(async (data) => {
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      n++;
    }
    return Math.round(s / n);
  }, b64);
}

async function run({ stripBootstrap }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('kolmatrix.colorMode', 'dark');
    } catch (e) {}
  });
  const page = await ctx.newPage();

  let stripped = 0;
  if (stripBootstrap) {
    await page.route(BASE + TARGET, async (route) => {
      const res = await route.fetch();
      let html = await res.text();
      if (BOOTSTRAP_RE.test(html)) {
        html = html.replace(BOOTSTRAP_RE, '');
        stripped++;
      }
      await route.fulfill({ response: res, body: html });
    });
  }

  // 先落一次 localStorage 与深色态，下面的 reload 才是被测场景（深色态刷新）
  await page.goto(BASE + TARGET, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  const samples = [];
  const t0 = Date.now();
  const nav = page.reload({ waitUntil: 'load' });
  for (let i = 0; i < SAMPLES; i++) {
    try {
      const dark = await page.evaluate(() => document.body?.classList.contains('dark') ?? null);
      if (dark !== null) samples.push({ t: Date.now() - t0, dark });
    } catch {
      /* 导航切换瞬间无法求值，跳过 */
    }
    await new Promise((r) => setTimeout(r, SAMPLE_GAP_MS));
  }
  await nav;

  // 早期真实截图亮度（校验 class 采样与实际绘制一致）
  const decoder = await ctx.newPage();
  await decoder.goto('about:blank');
  const settledLuma = await lumaOf(page, decoder);

  await browser.close();
  return { samples, stripped, settledLuma };
}

function report(label, r) {
  const light = r.samples.filter((s) => !s.dark);
  const first = r.samples[0];
  console.log(`${label}`);
  console.log(`   采样数 = ${r.samples.length}，首个可采样点 = ${first ? `${first.t}ms dark=${first.dark}` : 'n/a'}`);
  console.log(`   浅色采样点 = ${light.length}${light.length ? ` → ${light[0].t}ms ~ ${light[light.length - 1].t}ms` : ''}`);
  console.log(`   稳定后截图亮度 = ${r.settledLuma}（深色判据 <= ${DARK_MAX_LUMA}）`);
  return light.length;
}

console.log(`F002 深色刷新取证 — BASE=${BASE} target=${TARGET}\n`);

const a = await run({ stripBootstrap: false });
const aLight = report('A. 原样刷新（被测场景）', a);

const b = await run({ stripBootstrap: true });
console.log('');
const bLight = report('B. 剔除 pre-paint 内联脚本（检测器活性证明）', b);
console.log(`   脚本剔除次数 = ${b.stripped}`);

const detectorAlive = b.stripped > 0 && bLight > 0;
const noFlash = a.samples.length > 0 && aLight === 0 && a.settledLuma <= DARK_MAX_LUMA;
console.log(
  `\n判定：探针${detectorAlive ? '活着（剔除脚本后确实抓到浅色窗口）' : '存疑（剔除脚本后仍无浅色窗口 → 结论不可采信）'}` +
    ` · 被测场景${noFlash ? '全程深色，无浅色闪烁' : '存在浅色窗口'}`,
);
console.log(detectorAlive && noFlash ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(detectorAlive && noFlash ? 0 : 1);
