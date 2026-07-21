// P2-CLEANUP F003 — Avatar 深浅色边框跟随回归探针。
// 只读断言，不改产品代码。
//
// fix-1 改版说明：首版本脚本的 B 项断言「必须改读 hooks/useColorMode」——那正是被验收判
// PARTIAL 的实现契约（该 hook 每调用点各持独立 state、零跨实例订阅，纯读取方活体切换不跟随）。
// 用户裁决改用 Tailwind `dark:` 变体后，断言口径同步从「读哪个状态源」改为「边框到底跟不跟随」。
//
// 为何不是产品路由上的浏览器探针：`image/Avatar.tsx` 全仓零引用（F003 审计发现 1，见
// docs/specs/P2-CLEANUP-F003-avatar-deadcode-audit.md），产品里没有能导航到它的路由。
// 故拆成两段可客观核验的实物，两段合起来等价于端到端证明：
//   ① 静态：Avatar 发出的 className 字面量是什么（源码）
//   ② 运行时：这一串 className 在真实构建产物 CSS 下，切 body.dark 时computed 边框色是否真的翻转
//
// 前置：`npx next build` 已跑过（②③ 读 .next/static/css 真实产物 CSS）。
//     npx next build && node scripts/test/p2-cleanup-f003-avatar-colormode.mjs
//
// 覆盖：
//   A. 不再读 @chakra-ui/system 自带 useColorMode（无 ChakraProvider 时的孤儿状态，spec D2）
//   B. 不依赖任何 JS colorMode 状态（fix-1 契约：纯 CSS 变体，绕开 useColorMode 遗留缺陷）
//   C. 不再把 border/borderColor 作为样式 props 交给 ./Image（纯 div 包装，会 spread 成无效 DOM 属性）
//   D. Avatar 发出的 className 含 border-2 + border-white + dark:border-navy-700
//   E. 构建产物 CSS 真发出这两条规则（web-runtime-patterns §5 Tailwind JIT 双域）
//   F. **行为回归（本次修复的正主）**：真实产物 CSS 下 toggle body.dark → 边框色由 white 翻到
//      navy.700，且再切回即复原。这是首版实现失败的那条路径（活体切换不跟随）。
//   G. 活性证明：把 dark 变体类从元素上摘掉，F 必须翻红 —— 自证 F 由该 class 供能而非恒真

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

let pass = 0;
let fail = 0;
const fails = [];
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    fails.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
};

const AVATAR = 'src/components/image/Avatar.tsx';
const src = readFileSync(AVATAR, 'utf8');
const WHITE = 'rgb(255, 255, 255)';
const NAVY_700 = 'rgb(27, 37, 75)'; // tailwind.config.js navy.700 = #1B254B

// --- A / B 状态源契约 ---------------------------------------------------
ok(
  !/import\s*\{[^}]*useColorMode[^}]*\}\s*from\s*'@chakra-ui\/system'/.test(src),
  'A 不再从 @chakra-ui/system 引 useColorMode',
);
ok(
  !/useColorMode/.test(src.replace(/\/\/.*$/gm, '')),
  'B 不依赖任何 JS colorMode 状态（纯 CSS 变体，注释除外）',
);

// --- C 边框不再走失效的样式 props 通道 -----------------------------------
ok(
  !/\bborderColor\s*:/.test(src),
  'C 不再把 borderColor 作为样式 props 传给 ./Image',
);

// --- D Avatar 发出的 className ------------------------------------------
const m = src.match(/borderClass\s*=\s*showBorder\s*\?\s*'([^']+)'/);
const emitted = m?.[1] ?? '';
ok(
  /\bborder-2\b/.test(emitted) &&
    /\bborder-white\b/.test(emitted) &&
    /\bdark:border-navy-700\b/.test(emitted),
  'D className 含 border-2 + border-white + dark:border-navy-700',
  `实得=${emitted || '(未匹配到 borderClass)'}`,
);

// --- E 构建产物确有对应 CSS ----------------------------------------------
const CSS_DIR = '.next/static/css';
let css = '';
try {
  for (const f of readdirSync(CSS_DIR)) {
    if (f.endsWith('.css')) css += readFileSync(join(CSS_DIR, f), 'utf8');
  }
} catch {
  css = '';
}
ok(css.length > 0, 'E 前置：读到构建产物 CSS（须先 npx next build）', CSS_DIR);
ok(css.includes('.border-white'), 'E 产物 CSS 含 .border-white（浅色边框真发出）');
ok(
  /\.dark\\:border-navy-700/.test(css),
  'E 产物 CSS 含 .dark\\:border-navy-700（深色边框真发出）',
);

// --- F 行为回归 + G 活性证明 ---------------------------------------------
// 起一个只 link 真实产物 CSS 的静态页，用 Avatar 实际发出的那串 className 建元素，
// 切 body.dark 观察 computed 边框色。不引 React —— 修复是纯 CSS 的，React 不参与跟随。
const cssFiles = (() => {
  try {
    return readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
  } catch {
    return [];
  }
})();

const html = `<!doctype html><html><head>${cssFiles
  .map((f) => `<link rel="stylesheet" href="/css/${f}">`)
  .join('')}</head><body id="root">
<div id="probe" class="${emitted}"></div>
</body></html>`;

const server = createServer((req, res) => {
  if (req.url === '/' || req.url === '') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
  const name = (req.url || '').replace('/css/', '');
  if (cssFiles.includes(name)) {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    return res.end(readFileSync(join(CSS_DIR, name)));
  }
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });

const borderOf = () =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('probe'));
    return { color: cs.borderTopColor, width: cs.borderTopWidth };
  });
const setDark = (on) =>
  page.evaluate((v) => document.body.classList.toggle('dark', v), on);

const light = await borderOf();
ok(light.width === '2px', 'F 浅色态边框宽度 2px（边框真渲染）', light.width);
ok(light.color === WHITE, 'F 浅色态边框 = white', light.color);

await setDark(true);
const dark = await borderOf();
ok(
  dark.color === NAVY_700,
  'F 切 body.dark → 边框跟随到 navy.700（首版失败的正主路径）',
  `实得=${dark.color}`,
);
ok(dark.width === '2px', 'F 深色态边框宽度仍 2px', dark.width);

await setDark(false);
const back = await borderOf();
ok(back.color === WHITE, 'F 切回浅色 → 边框复原 white', back.color);

// G 活性证明：摘掉 dark 变体类，深色态必须不再跟随
await page.evaluate(
  () => document.getElementById('probe').classList.remove('dark:border-navy-700'),
);
await setDark(true);
const mutated = await borderOf();
ok(
  mutated.color !== NAVY_700,
  'G 摘掉 dark:border-navy-700 后深色不再跟随（证明 F 非恒真）',
  `实得=${mutated.color}`,
);

await browser.close();
server.close();

// --- 活性证明（静态侧）---------------------------------------------------
const grepCount = (needle) => {
  try {
    const out = execSync(
      `grep -rlF "${needle}" src/ --include=*.tsx --include=*.ts | grep -v "image/Avatar.tsx" || true`,
      { encoding: 'utf8' },
    );
    return out.split('\n').filter(Boolean).length;
  } catch {
    return -1;
  }
};
ok(
  grepCount('dark:border-navy-700') === 0,
  'G dark:border-navy-700 在源码中仅 Avatar 一处（E 非假绿）',
);

console.log(`\n=== F003 Avatar 边框跟随：${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log(`FAILED: ${fails.join(' | ')}`);
  process.exit(1);
}
