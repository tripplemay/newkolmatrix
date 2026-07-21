// P2-CLEANUP F003 复验（reverifying, fix_round=1）— Evaluator 独立验证
//
// 为何不只复跑首轮 harness：首轮 harness 的 C3 断言是 /border-navy-700/.test(className)，
// 在 fix-1 的实现下（className 恒为 'border-2 border-white dark:border-navy-700'）
// 该正则**在浅色态也恒真** —— C3 由「行为断言」退化为「恒真断言」，其转绿不携带任何信息。
// 本脚本补一条 discriminating 反向断言（R3：className 跨切换必须不变），
// 把 C3 想测的东西改由「computed 边框色变、className 不变」这对互补事实来证。
//
// 前置：npx next build 已跑过（link 真实 .next/static/css 产物）。
// 用法：node scripts/test/f003-reverify/check.mjs [port]

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const PORT = Number(process.argv[2] || 3131);
const HERE = dirname(new URL(import.meta.url).pathname);
const REPO = join(HERE, '..', '..', '..');
const ROOT = join(HERE, 'out');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const WHITE = 'rgb(255, 255, 255)';
const NAVY_700 = 'rgb(27, 37, 75)'; // tailwind.config.js navy.700 = #1B254B

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
if (!existsSync(CSS_DIR)) { console.error('缺少 .next/static/css —— 请先 npx next build'); process.exit(2); }
const cssFiles = readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
for (const f of cssFiles) copyFileSync(join(CSS_DIR, f), join(ROOT, f));
writeFileSync(
  join(ROOT, 'index.html'),
  `<!doctype html><html><head><meta charset="utf-8">
${cssFiles.map((f) => `<link rel="stylesheet" href="${f}">`).join('\n')}
</head><body><div id="root"></div><script src="bundle.js"></script></body></html>`,
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

// 读 Avatar 渲染出的包装 div（Image.tsx 的 .relative.overflow-hidden）
const read = (rootId) =>
  page.evaluate((id) => {
    const el = document.querySelector(`#${id} .relative`);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { cls: el.className, color: cs.borderTopColor, width: cs.borderTopWidth };
  }, rootId);

const setDark = (on) => page.evaluate((v) => document.body.classList.toggle('dark', v), on);

await page.goto(BASE, { waitUntil: 'networkidle' });

// ── [1] 浅色基线 ────────────────────────────────────────────────
console.log('\n[1] 浅色态（body 无 .dark）');
const light = await read('plain-border');
console.log('    ', JSON.stringify(light));
ok(light?.width === '2px', 'R1 浅色边框真渲染 = 2px', light?.width);
ok(light?.color === WHITE, 'R2 浅色边框色 = white', light?.color);

// ── [2] 直接切 body.dark（完全不经 hooks/useColorMode）────────────
console.log('\n[2] 直接切 body.dark —— 不经任何 JS 状态/hook');
await setDark(true);
const dark = await read('plain-border');
console.log('    ', JSON.stringify(dark));
ok(dark?.color === NAVY_700, 'R3 深色边框跟随 navy.700（首轮 PARTIAL 的正主缺陷路径）', dark?.color);
ok(dark?.width === '2px', 'R4 深色边框宽度仍 2px', dark?.width);

// ── [3] discriminating 反向断言：className 跨切换必须不变 ──────────
// 首轮 harness 的 C3 用 /border-navy-700/.test(cls) 判「className 切到 border-navy-700」。
// fix-1 下 className 恒含该子串（在 'dark:border-navy-700' 里），C3 恒真。
// 真正该证的是：跟随由 CSS 承担 → className 恒定不变，而 computed 色变了。
console.log('\n[3] discriminating：跟随是否真由 CSS 而非 JS 承担');
ok(light?.cls === dark?.cls, 'R5 className 跨深浅切换完全不变（证明零 JS 参与）', `light="${light?.cls}" dark="${dark?.cls}"`);
ok(light?.color !== dark?.color, 'R6 但 computed 边框色确实改变了（CSS 变体生效）', `${light?.color} → ${dark?.color}`);
ok(
  /border-navy-700/.test(light?.cls ?? ''),
  'R7 [反证] 首轮 C3 的正则在浅色态同样为真 → C3 在 fix-1 下已是恒真断言，其转绿不构成证据',
  light?.cls,
);

// ── [4] 往返 ────────────────────────────────────────────────────
console.log('\n[4] 切回浅色');
await setDark(false);
const back = await read('plain-border');
ok(back?.color === WHITE, 'R8 切回浅色边框复原 white', back?.color);

// ── [5] 活性证明（本脚本自证不死）──────────────────────────────
console.log('\n[5] 活性证明：摘掉 dark:border-navy-700 后 R3 必须翻红');
await setDark(true);
await page.evaluate(() => {
  document.querySelector('#plain-border .relative')?.classList.remove('dark:border-navy-700');
});
const mutated = await read('plain-border');
ok(
  mutated?.color !== NAVY_700,
  'R9 摘类后深色不再跟随 → R3 非恒真，本脚本确有鉴别力',
  mutated?.color,
);
await page.reload({ waitUntil: 'networkidle' });

// ── [6] 挂载即深色（body.dark 先于 React 挂载）──────────────────
console.log('\n[6] 挂载即深色路径');
await page.evaluate(() => document.body.classList.add('dark'));
await page.reload({ waitUntil: 'networkidle' });
await page.evaluate(() => document.body.classList.add('dark'));
await page.waitForTimeout(200);
const mounted = await read('plain-border');
ok(mounted?.color === NAVY_700, 'R10 挂载即深色时边框同样跟随', mounted?.color);

// ── [7] chakra() 包装路径（两套既有测试均未覆盖）────────────────
console.log('\n[7] chakra() 包装路径 ChakraNextAvatar showBorder —— 观察项');
await setDark(false);
const chakraLight = await read('chakra-border');
await setDark(true);
const chakraDark = await read('chakra-border');
console.log('     light:', JSON.stringify(chakraLight));
console.log('     dark :', JSON.stringify(chakraDark));
const chakraRendersBorder = chakraLight?.width === '2px';
console.log(
  chakraRendersBorder
    ? '  ℹ️  chakra 包装路径同样渲染边框'
    : `  ℹ️  chakra 包装路径 showBorder 未生效（border-width=${chakraLight?.width}）—— shouldForwardProp 白名单不含 showBorder，属 F003 之前既存行为，非本轮引入`,
);

console.log(`\n=== F003 复验独立验证：${pass} passed, ${fail} failed ===`);
if (fails.length) console.log('失败项：', fails.join(' | '));
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
