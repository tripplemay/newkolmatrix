/**
 * 对抗复核工具 B：把任一世代的 importSpecifiers 变成可调用函数
 *
 * 两条**互相独立**的抽取路径，用于自证「抽取没有改变语义」：
 *   Method A（整文件逐字）：原文件一字不改，仅 (1) require('vitest') 换 no-op stub
 *                            (2) 文件末尾追加一行 `export { importSpecifiers };`
 *                            → 函数体与其所有依赖全部保持原样、原位置
 *   Method B（仅抽两函数）：AST 取 stripComments + importSpecifiers 逐字文本，
 *                            配上原文件的非 vitest import，组成独立模块
 *
 * 编译器用 TypeScript 自带 transpileModule（**不用 esbuild**）——与被复核报告所用工具链不同源，
 * 若 esbuild 曾改变语义，此处会暴露为 A/B 或与实跑不一致。
 */
import { createRequire } from 'node:module';
import ts from 'typescript';
import { gitShow, topLevelFn } from './adv-generations.mjs';

const require_ = createRequire(import.meta.url);

const VITEST_STUB = {
  describe: () => {},
  it: () => {},
  test: () => {},
  expect: () => ({}),
  beforeAll: () => {},
  afterAll: () => {},
  beforeEach: () => {},
  afterEach: () => {},
  vi: {},
};

function runModule(tsSource, label) {
  const js = ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: `${label}.ts`,
  }).outputText;

  const mod = { exports: {} };
  const req = (id) => (id === 'vitest' ? VITEST_STUB : require_(id));
  // eslint-disable-next-line no-new-func
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', js);
  fn(mod.exports, req, mod, `${label}.ts`, process.cwd());
  return mod.exports;
}

/** Method A：整文件逐字 + vitest stub + 末尾追加导出 */
export function loadMethodA(rev) {
  const src = gitShow(rev);
  const patched = `${src}\nexport { importSpecifiers };\n`;
  const exp = runModule(patched, `A_${rev}`);
  if (typeof exp.importSpecifiers !== 'function') throw new Error(`A_${rev}: no importSpecifiers`);
  return exp.importSpecifiers;
}

/** Method B：只抽 stripComments + importSpecifiers */
export function loadMethodB(rev) {
  const src = gitShow(rev);
  const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = sf.statements
    .filter((s) => ts.isImportDeclaration(s))
    .map((s) => s.getText(sf))
    .filter((t) => !/from\s+['"]vitest['"]/.test(t));
  const strip = topLevelFn(src, 'stripComments');
  const imp = topLevelFn(src, 'importSpecifiers');
  if (!imp) throw new Error(`B_${rev}: no importSpecifiers`);
  const mod = [...imports, strip ?? '', imp, 'export { importSpecifiers };'].join('\n\n');
  const exp = runModule(mod, `B_${rev}`);
  return exp.importSpecifiers;
}

/** 工作树当前实现（不经 git，直接读盘） */
export function loadWorktree() {
  const fs = require_('node:fs');
  const src = fs.readFileSync('tests/unit/db-layer-importer-census.test.ts', 'utf8');
  const patched = `${src}\nexport { importSpecifiers };\n`;
  return runModule(patched, 'A_WORKTREE').importSpecifiers;
}
