// M5.1c 签收方独立工具 —— 从任意 rev 抽取 importSpecifiers（含它依赖的 stripComments）
// 并编译成可调用函数。**刻意不复用**交付方 / 两位复验方的任何一行抽取代码：
//   · 交付方 m51c-f001-probe-bench.mjs：ts.transpileModule
//   · 复验方 rv1-independent-bench.mjs：esbuild
//   · 本工具：ts.transpileModule + node vm（第三条路，且抽取锚点自写：从 `function 名(` 起做括号配对）
//
// 用法：import { loadImpl, fnHash } from './sg-impl.mjs'

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';

export function readAt(rev) {
  if (rev === 'WORKTREE') {
    return execFileSync('cat', [FILE], { encoding: 'utf8' });
  }
  return execFileSync('git', ['show', `${rev}:${FILE}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
}

/**
 * 用 TS 自己的 parser 取顶层同名 FunctionDeclaration 的全文；找不到返回 null。
 * （初版用手写花括号配对，在 1ea4abb 上被正则字面量里的 `{` 带偏，抽出的文本一路吃到 describe(...)
 *  —— 已如实登记在签收报告里；改用 parser 后不再依赖手写词法。）
 */
export function extractFn(source, name) {
  const sf = ts.createSourceFile('probe.ts', source, ts.ScriptTarget.Latest, true);
  let found = null;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.name.text === name) found = st.getText(sf);
  }
  return found;
}

/** 抽出的实现文本（stripComments + importSpecifiers 拼接）的 sha256，用于世代去重。 */
export function fnHash(rev) {
  const src = readAt(rev);
  const parts = [];
  for (const name of ['stripComments', 'importSpecifiers']) {
    const fn = extractFn(src, name);
    if (fn) parts.push(`/*${name}*/` + fn);
  }
  if (!parts.length) throw new Error(`rev ${rev}: 抽不到任何实现（锚点失效）`);
  return {
    hash: createHash('sha256').update(parts.join('\n')).digest('hex'),
    hasStrip: !!extractFn(src, 'stripComments'),
    text: parts.join('\n'),
  };
}

/** 把某 rev 的 importSpecifiers 编译成可调用函数。 */
export function loadImpl(rev) {
  const { text } = fnHash(rev);
  const tsSrc = `${text}\nglobalThis.__importSpecifiers = importSpecifiers;`;
  const js = ts.transpileModule(tsSrc, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const ctx = vm.createContext({ ts, console, globalThis: undefined });
  ctx.globalThis = ctx;
  vm.runInContext(js, ctx, { filename: `impl@${rev}.js` });
  const fn = ctx.__importSpecifiers;
  if (typeof fn !== 'function') throw new Error(`rev ${rev}: 编译后拿不到 importSpecifiers`);
  return (source, fileName) => fn(source, fileName);
}
