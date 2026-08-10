/**
 * 复验 1 独立取证工具 C：**独立重数变异红格**，不复用交付方 m51c-f001-mutations.mjs 的
 * 输出解析。
 *
 * 与被验台子的刻意分歧：
 *   1. 结果来源用 **vitest 的 JSON reporter**（结构化 assertionResults），
 *      交付方用**正则去刮 verbose 文本**。首轮那个假阴性（`Tests no tests` 被当成 0 failed）
 *      就出在文本刮取上，故此处换一条不经文本的路。
 *   2. 变异锚点独立重写（语义相同，字面不同），避免「锚点抄错但两边一起错」。
 *   3. 额外记录**红的用例名逐条清单**，用于核对注释里「摘 X 红不到某条」这类归属陈述。
 *
 * 还原：反向编辑 + sha256 逐位对账，**不用 git checkout**。任一次对不上立即中止。
 *
 * 用法：node tests/tools/rv1/rv1-independent-mutations.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';
const JSON_OUT = '/tmp/rv1-vitest-result.json';

/** 独立重写的锚点（与交付方字面不同，语义等价） */
const MUTATIONS = [
  ['M1  ImportDeclaration 分支',
    'if (ts.isImportDeclaration(node)) {', 'if ((0 as number) && ts.isImportDeclaration(node)) {'],
  ['M2  ExportDeclaration 分支',
    'else if (ts.isExportDeclaration(node)) {', 'else if ((0 as number) && ts.isExportDeclaration(node)) {'],
  ['M3  ImportEqualsDeclaration 分支',
    'else if (ts.isImportEqualsDeclaration(node)) {', 'else if ((0 as number) && ts.isImportEqualsDeclaration(node)) {'],
  ['M4  动态 import() 识别',
    'node.expression.kind === ts.SyntaxKind.ImportKeyword;', 'node.expression.kind === ts.SyntaxKind.Unknown;'],
  ['M5  CJS require() 识别',
    "node.expression.text === 'require'", "node.expression.text === '__never_require__'"],
  ['M12 放宽取值：任意字符串字面量都当 specifier（多抓方向）',
    '    ts.forEachChild(node, visit);',
    '    if (ts.isStringLiteral(node)) specs.push(node.text);\n    ts.forEachChild(node, visit);'],
];

const sha = () => createHash('sha256').update(readFileSync(FILE)).digest('hex');

/** 用 JSON reporter 取结构化结果；文件级失败（收集期抛）时 testResults 为空或 status=failed */
function run(label) {
  if (existsSync(JSON_OUT)) unlinkSync(JSON_OUT);
  const r = spawnSync(
    'npx',
    ['vitest', 'run', FILE, '--reporter=json', `--outputFile=${JSON_OUT}`],
    { encoding: 'utf8' },
  );
  if (!existsSync(JSON_OUT)) {
    return { mode: 'no-report', exit: r.status, failedNames: [], passed: 0 };
  }
  const j = JSON.parse(readFileSync(JSON_OUT, 'utf8'));
  const assertions = (j.testResults || []).flatMap((t) => t.assertionResults || []);
  const failedNames = assertions.filter((a) => a.status === 'failed').map((a) => a.fullName || a.title);
  const passed = assertions.filter((a) => a.status === 'passed').length;
  const mode = assertions.length === 0 ? 'file' : 'assert';
  return { mode, exit: r.status, failedNames, passed, total: assertions.length };
}

const baseline = sha();
console.log(`基线 sha256 = ${baseline}`);
const base = run('baseline');
console.log(`[基线] mode=${base.mode} passed=${base.passed} failed=${base.failedNames.length} exit=${base.exit}`);
if (base.mode !== 'assert' || base.failedNames.length !== 0) {
  console.error('基线不绿，中止');
  process.exit(2);
}
console.log('');

const summary = [];
for (const [label, from, to] of MUTATIONS) {
  const src = readFileSync(FILE, 'utf8');
  const hits = src.split(from).length - 1;
  if (hits !== 1) {
    console.log(`SKIP ${label} —— 锚点命中 ${hits} 次（需恰好 1）\n`);
    summary.push([label, `skip(${hits})`]);
    continue;
  }
  writeFileSync(FILE, src.replace(from, to));
  if (sha() === baseline) {
    console.error(`${label}: 变异后哈希未变，变异根本没落盘 —— 中止`);
    process.exit(4);
  }
  const res = run(label);
  // 反向编辑还原（不用 git checkout）
  writeFileSync(FILE, readFileSync(FILE, 'utf8').replace(to, from));
  const after = sha();
  if (after !== baseline) {
    console.error(`${label}: 还原失败 ${after} != ${baseline}`);
    process.exit(3);
  }
  const verdict = res.mode === 'file' ? '红：文件级（0 条断言跑起来）'
    : res.failedNames.length ? `红 ${res.failedNames.length} 条` : '全绿';
  console.log(`${label}  →  ${verdict}   (passed=${res.passed}, exit=${res.exit})`);
  for (const n of res.failedNames.sort()) console.log(`      · ${n}`);
  console.log('');
  summary.push([label, res.mode === 'file' ? 'file' : res.failedNames.length]);
}

console.log(`还原对账：${summary.filter((s) => !String(s[1]).startsWith('skip')).length} 次实际变异后 sha256 逐位回到基线 ${sha() === baseline ? 'OK' : 'FAIL'}`);
console.log(`最终 sha256 = ${sha()}\n汇总`);
for (const [l, v] of summary) console.log(`  ${l.padEnd(50)} → ${v === 'file' ? '红：文件级' : typeof v === 'number' ? `红 ${v} 条` : v}`);
