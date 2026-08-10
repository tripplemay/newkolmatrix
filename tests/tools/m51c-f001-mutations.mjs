/**
 * M5.1c F001 —— **变异证活台**：对 `tests/unit/db-layer-importer-census.test.ts` 逐条打变异，
 * 记录每条变异**红了几条、红的是哪几条**（audit-methodology.md §7.1 推论一）。
 *
 * 【为什么必须区分三种红法】首轮跑这套时，M9 被报成「全绿 / 无鉴别力」，实际是变异让文件在
 * 收集期抛 TypeError、vitest 打印 `Tests  no tests`，而当时的输出解析只认
 * `Tests N failed | M passed`，匹配不到就默认 0 failed —— 一个**假阴性**，坑在仪器本身。
 * 现在按退出码兜底并区分：assert（断言红）/ file（文件级红，0 条用例跑起来）/ pass（真全绿）。
 *
 * 还原一律**反向编辑 + sha256 逐位对账**，不用 `git checkout`（后者会连带冲掉其它未提交改动，
 * 也会掩盖「变异脚本自己写坏了文件」这类事故）。任一次还原对不上即中止。
 *
 * 用法：node tests/tools/m51c-f001-mutations.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';

/** [标签, 原文, 替换文] —— 原文必须在文件中**恰好出现一次**，否则该条跳过并报告。 */
const MUTATIONS = [
  ['M1  摘掉 ImportDeclaration 分支',
   '    if (ts.isImportDeclaration(node)) {\n      // ① 静态 import',
   '    if (false && ts.isImportDeclaration(node)) {\n      // ① 静态 import'],
  ['M2  摘掉 ExportDeclaration 分支',
   '    } else if (ts.isExportDeclaration(node)) {',
   '    } else if (false && ts.isExportDeclaration(node)) {'],
  ['M3  摘掉 ImportEqualsDeclaration 分支',
   '    } else if (ts.isImportEqualsDeclaration(node)) {',
   '    } else if (false && ts.isImportEqualsDeclaration(node)) {'],
  ['M4  摘掉动态 import() 识别',
   '      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;',
   '      const isDynamicImport = false;'],
  ['M5  摘掉 CJS require() 识别',
   "      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';",
   '      const isRequire = false;'],
  ['M6  字面量收窄 isStringLiteralLike → isStringLiteral',
   '      if ((isDynamicImport || isRequire) && first && ts.isStringLiteralLike(first)) {',
   '      if ((isDynamicImport || isRequire) && first && ts.isStringLiteral(first)) {'],
  ['M8  ScriptKind 写死成 .tsx',
   "  const sourceFile = ts.createSourceFile(fileName, source",
   "  const sourceFile = ts.createSourceFile('scan.tsx', source"],
  ['M9  摘掉 export 的 moduleSpecifier 判空',
   '      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {',
   '      if (ts.isStringLiteralLike(node.moduleSpecifier!)) {'],
  ['M10 预扫不传真实文件名（已登记的盲区，预期全绿）',
   "    files.map((f) => [f, importSpecifiers(readFileSync(f, 'utf8'), f)]),",
   "    files.map((f) => [f, importSpecifiers(readFileSync(f, 'utf8'))]),"],
  ['M11 GUARDED 期望里塞一个不存在的 importer',
   "      'src/lib/db/tenant-scope.ts',\n    ],",
   "      'src/lib/db/tenant-scope.ts',\n      'src/lib/db/NOT-A-REAL-IMPORTER.ts',\n    ],"],
  // M12 是**多抓方向**的变异：上面 M1–M9 全是「少抓」，任何一条都红不到
  // `🔒 字面出现不算 import`。这条把每个字符串字面量都当成 specifier，专门量那条用例。
  ['M12 放宽取值：任意字符串字面量都当 specifier（多抓方向）',
   '    ts.forEachChild(node, visit);',
   '    if (ts.isStringLiteral(node)) specs.push(node.text);\n    ts.forEachChild(node, visit);'],
];

const sha = () => createHash('sha256').update(readFileSync(FILE)).digest('hex');

function run() {
  const r = spawnSync('npx', ['vitest', 'run', FILE, '--reporter=verbose'], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  const names = [
    ...new Set(
      [...out.matchAll(/^\s*(?:×|✗)\s+(?:.*?>\s*)?(.+?)(?:\s+\d+ms)?$/gm)]
        .map((m) => m[1].trim())
        .filter((n) => !n.includes('db-layer-importer-census')),
    ),
  ].sort();
  const m = out.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed/);
  if (m) return { mode: 'assert', failed: m[1] ? Number(m[1]) : 0, passed: Number(m[2]), names };
  return { mode: r.status === 0 ? 'empty' : 'file', failed: -1, passed: 0, names };
}

const baseline = sha();
process.stdout.write(`基线 sha256 = ${baseline}\n`);
const base = run();
if (base.mode !== 'assert' || base.failed !== 0) {
  console.error(`基线就不绿（mode=${base.mode} failed=${base.failed}）—— 先修基线再谈变异`);
  process.exit(2);
}
process.stdout.write(`[基线] ${base.passed} passed / 0 failed\n\n`);

const rows = [];
for (const [label, from, to] of MUTATIONS) {
  const src = readFileSync(FILE, 'utf8');
  const n = src.split(from).length - 1;
  if (n !== 1) {
    process.stdout.write(`⚠  ${label}\n     锚点命中 ${n} 次（需恰好 1），跳过\n\n`);
    rows.push([label, 'skip']);
    continue;
  }
  writeFileSync(FILE, src.replace(from, to));
  const res = run();
  writeFileSync(FILE, readFileSync(FILE, 'utf8').replace(to, from));
  const after = sha();
  if (after !== baseline) {
    console.error(`\n${label} 还原失败！${after} != ${baseline}`);
    process.exit(3);
  }
  const verdict =
    res.mode === 'file' ? '红：文件级（0 条用例跑起来）' : res.failed ? `红 ${res.failed} 条（断言级）` : '⚠ 全绿';
  process.stdout.write(`${res.mode === 'file' || res.failed ? '✓' : '✗'}  ${label}\n     ${verdict}   (${res.passed} passed)\n`);
  for (const nm of res.names) process.stdout.write(`       · ${nm.replace(/^.*?>\s*/, '')}\n`);
  process.stdout.write('\n');
  rows.push([label, res.mode === 'file' ? 'file' : res.failed]);
}

process.stdout.write(`还原对账：${MUTATIONS.length} 次变异后 sha256 均回到基线 ✓\n\n汇总\n`);
for (const [label, v] of rows) {
  const t = v === 'skip' ? '跳过' : v === 'file' ? '红：文件级' : v ? `红 ${v} 条` : '⚠ 全绿';
  process.stdout.write(`  ${label.padEnd(54)} → ${t}\n`);
}
