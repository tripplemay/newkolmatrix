#!/usr/bin/env node
/**
 * M1-A-BRIEF F002 — hydration 探针的【检测器活性证明】（Evaluator 编写）
 *
 * 为什么需要这个文件：
 *   m1a-f002-hydration.mjs 报「0 hydration mismatch」。但「真的零失配」与「探针根本抓不到失配」
 *   在输出上完全同形。框架 v1.0.6 纪律：扫描类结论报 0 findings 时，必须先证明检测器还活着。
 *   （本批次自身就踩过一次：p2:f002 原用「主题钮存在与否」代理 hydrate，恢复 SSR 后该判据恒真。）
 *
 * 手法：不碰产品代码、不重新构建。用 Playwright 拦截 standalone 返回的 HTML，
 *   只篡改【已渲染的可见文本节点】，不动内联的 RSC flight 载荷 —— 于是客户端按 flight 数据
 *   渲染出的树与服务端 DOM 不一致，React 必然报 hydration 失配。
 *   探针能抓到 = 检测器活着；抓不到 = 上一份「零失配」结论不可采信。
 *
 * 前置：standalone server 起在 BASE。
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE || 'http://127.0.0.1:3300';
const TARGET = '/admin/today';

const HYDRATION_PATTERNS = [
  /minified react error #418/i,
  /minified react error #423/i,
  /minified react error #425/i,
  /hydration failed/i,
  /did not match/i,
  /text content does not match/i,
  /hydrating/i,
];
const isHydration = (t) => HYDRATION_PATTERNS.some((re) => re.test(t));

async function load({ tamper }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const msgs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`));

  if (tamper) {
    await page.route(BASE + TARGET, async (route) => {
      const res = await route.fetch();
      let html = await res.text();
      // 只改 <body> 中第一段可见文本；flight 载荷在 <script> 里，保持原样。
      const before = html;
      html = html.replace(
        />Agent 自动边界</,
        '>EVALUATOR-TAMPERED-TEXT<',
      );
      if (html === before) throw new Error('tamper anchor not found — livecheck invalid');
      await route.fulfill({ response: res, body: html });
    });
  }

  await page.goto(BASE + TARGET, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await browser.close();
  return msgs;
}

console.log(`F002 hydration detector live-check — BASE=${BASE} target=${TARGET}\n`);

const clean = await load({ tamper: false });
const cleanHyd = clean.filter(isHydration);
console.log(`A. 未篡改（对照）      : hydration warnings = ${cleanHyd.length}`);
cleanHyd.forEach((m) => console.log(`     > ${m.slice(0, 200)}`));

const tampered = await load({ tamper: true });
const tamperedHyd = tampered.filter(isHydration);
console.log(`B. 注入文本失配（活性）: hydration warnings = ${tamperedHyd.length}`);
tamperedHyd.forEach((m) => console.log(`     > ${m.slice(0, 220)}`));

const alive = tamperedHyd.length > 0;
const cleanOk = cleanHyd.length === 0;
console.log(
  `\n判定：检测器${alive ? '活着（注入失配后翻红）' : '已死（注入失配仍不报 → 上游「零失配」结论不可采信）'}` +
    ` · 对照组${cleanOk ? '零告警' : '有告警'}`,
);
console.log(alive && cleanOk ? '\nRESULT: PASS' : '\nRESULT: FAIL');
process.exit(alive && cleanOk ? 0 : 1);
