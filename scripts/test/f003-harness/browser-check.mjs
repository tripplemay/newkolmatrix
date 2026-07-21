// F003 浏览器实测（Evaluator 独立验收产物，不改产品代码）
//
// 目的：acceptance「深色下 Avatar 边框跟随」「浅色态与改造前像素一致」无法由静态断言证明——
// image/Avatar.tsx 全仓零引用，产品里没有能导航到它的路由。故自建挂载 harness：
//   - 挂载真实 src/components/image/Avatar.tsx 的 NextAvatar（未复制、未改写）
//   - 用真实 src/hooks/useColorMode 的 toggle 切换（生产 navbar 同一路径）
//   - 页面 link 真实 .next/static/css 构建产物 CSS（不是手写样式）
//   - 同页并排挂载 pre-F003 版本（git show 8856924^）做 A/B，独立核实审计 §4.3 的事实主张
//
// 前置：npx next build 已跑过（本脚本 link 的是 .next/static/css 的真实产物 CSS）。
// 用法：node scripts/test/f003-harness/browser-check.mjs [port]
//   打包步骤（esbuild）由本脚本自动执行，out/ 为生成物，不入库。

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const PORT = Number(process.argv[2] || 3103);
const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, '..', '..', '..');
const ROOT = join(HERE, 'out');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// --- 打包：把真实 Avatar.tsx + 真实 hooks/useColorMode 打进一个浏览器可跑的 bundle ---
mkdirSync(ROOT, { recursive: true });
execFileSync(
  join(REPO, 'node_modules/.bin/esbuild'),
  [
    join(HERE, 'entry.tsx'),
    '--bundle',
    `--outfile=${join(ROOT, 'bundle.js')}`,
    '--jsx=automatic',
    `--tsconfig=${join(REPO, 'tsconfig.json')}`,
    '--define:process.env.NODE_ENV="production"',
    '--format=iife',
    '--banner:js=var process={env:{NODE_ENV:"production",NEXT_PUBLIC_BASE_PATH:"",__NEXT_ROUTER_BASEPATH:""}};',
  ],
  { cwd: REPO, stdio: 'inherit' },
);

const CSS_DIR = join(REPO, '.next/static/css');
if (!existsSync(CSS_DIR)) {
  console.error('缺少 .next/static/css —— 请先 npx next build');
  process.exit(2);
}
const cssFiles = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
for (const f of cssFiles) copyFileSync(join(CSS_DIR, f), join(ROOT, f));
writeFileSync(
  join(ROOT, 'index.html'),
  `<!doctype html><html><head><meta charset="utf-8">
${cssFiles.map((f) => `<link rel="stylesheet" href="${f}">`).join('\n')}
</head><body><div id="root"></div><div id="root-before"></div>
<script src="bundle.js"></script></body></html>`,
);

let pass = 0, fail = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};

const server = createServer((req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)); });

// 边框读数取 Avatar 渲染出的包装 div（Image.tsx 的 .relative.overflow-hidden）
const readBorder = (rootId) =>
  page.evaluate((id) => {
    const el = document.querySelector(`#${id} div`);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      cls: el.className,
      width: cs.borderTopWidth,
      color: cs.borderTopColor,
      style: cs.borderTopStyle,
      attrBorder: el.getAttribute('border'),
      attrBorderColor: el.getAttribute('bordercolor') ?? el.getAttribute('borderColor'),
    };
  }, rootId);

await page.goto(`${BASE}/index.html`);
await page.waitForSelector('#after-border div', { state: 'attached' });

console.log('\n[1] 浅色态（默认，无 localStorage）');
const lightAfter = await readBorder('after-border');
console.log('    after  :', JSON.stringify(lightAfter));
ok(lightAfter.width === '2px', 'A1 改造后 showBorder 浅色：border-width = 2px（边框真渲染）', lightAfter.width);
ok(lightAfter.color === 'rgb(255, 255, 255)', 'A2 改造后浅色边框色 = white', lightAfter.color);
ok(/border-2/.test(lightAfter.cls) && /border-white/.test(lightAfter.cls), 'A3 className 含 border-2 + border-white', lightAfter.cls);

const lightNoBorder = await readBorder('after-noborder');
ok(lightNoBorder.width === '0px', 'A4 不传 showBorder 时无边框（opt-in 语义未变）', lightNoBorder.width);

console.log('\n[2] A/B：pre-F003 版本同条件下的实际渲染（核实审计 §4.3）');
const before = await readBorder('before-border');
const beforeErr = await page.evaluate(() => window.__beforeError ?? null);
console.log('    before :', JSON.stringify(before), 'err=', beforeErr);
ok(before === null || before.width === '0px',
   'B1 改造前 showBorder 边框宽度为 0（审计 §4.3「改造前边框根本不渲染」成立）',
   before ? before.width : `未渲染 / ${beforeErr}`);
if (before) {
  ok(before.attrBorder === '2px',
     'B2 改造前 border 落成无效 DOM 属性而非样式（审计发现 2 成立）',
     `border attr=${before.attrBorder}`);
}

console.log('\n[3] 活体切换：走真实 useColorMode.toggle（生产 navbar 同一路径）');
await page.click('#toggle');
await page.waitForFunction(() => document.body.classList.contains('dark'));
await page.waitForTimeout(500); // 给 React 充分的重渲染窗口，排除竞态误报
const bodyDark = await page.evaluate(() => document.body.classList.contains('dark'));
const darkAfter = await readBorder('after-border');
console.log('    body.dark =', bodyDark, ' after:', JSON.stringify(darkAfter));
ok(bodyDark === true, 'C0 toggle 后 body.dark 已置位（状态源本身正确翻转）');
ok(darkAfter.width === '2px', 'C1 深色态边框仍为 2px', darkAfter.width);
ok(darkAfter.color === 'rgb(27, 37, 75)', 'C2 深色态边框色跟随到 navy.700 rgb(27,37,75)', darkAfter.color);
ok(/border-navy-700/.test(darkAfter.cls), 'C3 className 切到 border-navy-700', darkAfter.cls);

console.log('\n[4] 切回浅色');
await page.click('#toggle');
await page.waitForFunction(() => !document.body.classList.contains('dark'));
await page.waitForTimeout(300);
const backLight = await readBorder('after-border');
ok(backLight.color === 'rgb(255, 255, 255)', 'D1 切回浅色边框回到 white', backLight.color);

console.log('\n[5] 挂载即深色（持久值已存在时的首次渲染路径）');
await page.evaluate(() => localStorage.setItem('kolmatrix.colorMode', 'dark'));
await page.reload();
await page.waitForSelector('#after-border div', { state: 'attached' });
await page.waitForFunction(() => document.body.classList.contains('dark'));
const reloaded = await readBorder('after-border');
ok(reloaded.color === 'rgb(27, 37, 75)', 'E1 持久深色刷新后 Avatar 边框仍跟随 navy.700', reloaded.color);

await browser.close();
server.close();

console.log(`\n=== F003 浏览器实测：${pass} passed, ${fail} failed ===`);
if (fail > 0) { console.log(`FAILED: ${fails.join(' | ')}`); process.exit(1); }
