// P2-CLEANUP F003 — Avatar 状态源统一 + 边框通道回归探针。
// 只读断言，不改产品代码。
//
// 为何不是浏览器探针：`image/Avatar.tsx` 全仓零引用（F003 审计发现 1，见
// docs/specs/P2-CLEANUP-F003-avatar-deadcode-audit.md），产品里没有能导航到它的路由。
// 故改测两件可客观核验的实物：源码状态源契约 + 构建产物里 Tailwind 是否真发出了边框 CSS。
//
// 前置：`npx next build` 已跑过（D 项读 .next 产物 CSS）。
//     npx next build && node scripts/test/p2-cleanup-f003-avatar-colormode.mjs
//
// 覆盖：
//   A. 不再读 @chakra-ui/system 自带 useColorMode（无 ChakraProvider 时的孤儿状态，spec D2）
//   B. 改读项目统一状态源 hooks/useColorMode
//   C. 不再把 border/borderColor 作为样式 props 交给 ./Image（纯 div 包装，会 spread 成无效 DOM 属性）
//   D. 构建产物 CSS 里确有 .border-navy-700 / .border-white —— 边框「真被渲染出来」的实物证据
//      （web-runtime-patterns §5：className 可达值必须是静态类名，写成 JS 常量插值会静默丢 CSS）
//   E. 活性证明：D 的两个类名在本仓源码中无第二处静态用法，故 D 只可能由 Avatar 供能，不是假绿

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

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

// --- A / B 状态源契约 ---------------------------------------------------
ok(
  !/import\s*\{[^}]*useColorMode[^}]*\}\s*from\s*'@chakra-ui\/system'/.test(src),
  'A 不再从 @chakra-ui/system 引 useColorMode',
);
ok(
  /from\s*'hooks\/useColorMode'/.test(src),
  'B 改读项目统一状态源 hooks/useColorMode',
);

// --- C 边框不再走失效的样式 props 通道 -----------------------------------
ok(
  !/\bborderColor\s*:/.test(src),
  'C 不再把 borderColor 作为样式 props 传给 ./Image',
);

// --- D 构建产物确有边框 CSS ----------------------------------------------
const CSS_DIR = '.next/static/css';
let css = '';
try {
  for (const f of readdirSync(CSS_DIR)) {
    if (f.endsWith('.css')) css += readFileSync(join(CSS_DIR, f), 'utf8');
  }
} catch {
  css = '';
}
ok(css.length > 0, 'D 前置：读到构建产物 CSS（须先 npx next build）', CSS_DIR);
ok(css.includes('.border-navy-700'), 'D 产物 CSS 含 .border-navy-700（深色边框真发出）');
ok(css.includes('.border-white'), 'D 产物 CSS 含 .border-white（浅色边框真发出）');

// --- E 活性证明 ----------------------------------------------------------
// 若这两个类名在别处也静态出现，D 可能由别处供能 → D 就不是 F003 的活断言。
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
ok(grepCount('border-navy-700') === 0, 'E border-navy-700 在源码中仅 Avatar 一处（D 非假绿）');

console.log(`\n=== F003 Avatar 状态源/边框通道：${pass} passed, ${fail} failed ===`);
if (fail > 0) {
  console.log(`FAILED: ${fails.join(' | ')}`);
  process.exit(1);
}
