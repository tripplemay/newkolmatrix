/**
 * 复验 1 独立取证工具 B：**不复用交付方的 adv-eval / probe-bench 任何一行**，重新量一遍红格。
 *
 * 与被验台子的三处刻意分歧（任一处若交付方的台子有问题，此处会对不上）：
 *   1. 编译器用 **esbuild**（交付方用 typescript 的 transpileModule）
 *   2. 世代列表由 `git log --follow` **现场枚举**（交付方用硬编码 REVS 常量）
 *   3. 探针输入从**用例文件 AST 逐字抽取**（交付方用台子自带的 CANDIDATES 常量）
 *
 * 用法：node tests/tools/rv1/rv1-independent-bench.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import esbuild from 'esbuild';
import ts from 'typescript';

const require_ = createRequire(import.meta.url);
const FILE = 'tests/unit/db-layer-importer-census.test.ts';
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. 现场枚举世代（不读 REVS 常量）────────────────────────────────────────
const revs = execFileSync('git', ['log', '--follow', '--format=%h', '--', FILE], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .reverse(); // 由老到新

const STUB = new Proxy({}, { get: () => () => new Proxy({}, { get: () => () => {} }) });
function load(source, label) {
  const js = esbuild.transformSync(
    `${source}\nmodule.exports.importSpecifiers = importSpecifiers;\n`,
    { loader: 'ts', format: 'cjs', target: 'es2022' },
  ).code;
  const mod = { exports: {} };
  const req = (id) => (id === 'vitest' ? STUB : require_(id));
  // eslint-disable-next-line no-new-func
  new Function('exports', 'require', 'module', '__filename', '__dirname', js)(
    mod.exports, req, mod, `${label}.ts`, process.cwd(),
  );
  if (typeof mod.exports.importSpecifiers !== 'function') throw new Error(`${label}: 未导出`);
  return mod.exports.importSpecifiers;
}
function fnText(source, name) {
  const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && st.name.text === name) return st.getText(sf);
  }
  return null;
}

const gens = [];
const seenHash = new Set();
for (const rev of revs) {
  const src = execFileSync('git', ['show', `${rev}:${FILE}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const strip = fnText(src, 'stripComments');
  const imp = fnText(src, 'importSpecifiers');
  const hash = createHash('sha256').update(`${strip ?? 'NONE'} ${imp}`).digest('hex');
  const isRegexEra = strip !== null; // AST 版已无 stripComments
  if (seenHash.has(hash)) {
    gens.push({ rev, dup: true, isRegexEra });
    continue;
  }
  seenHash.add(hash);
  gens.push({ rev, dup: false, isRegexEra, run: load(src, rev), hash: hash.slice(0, 10) });
}
const pre = gens.filter((g) => !g.dup && g.isRegexEra);
const post = gens.filter((g) => !g.dup && !g.isRegexEra);
console.log(`枚举到 ${revs.length} 个 commit 触碰过该文件 -> 去重 ${gens.filter((g) => !g.dup).length} 代`);
console.log(`  换代前（有 stripComments）= ${pre.length} 代：${pre.map((g) => g.rev).join(' / ')}`);
console.log(`  换代后（无 stripComments）= ${post.length} 代：${post.map((g) => g.rev).join(' / ')}`);
console.log(`  与前代同哈希被折叠掉的 commit：${gens.filter((g) => g.dup).map((g) => g.rev).join(' / ') || '（无）'}\n`);

// ── 2. 判据活性自测（三道，比交付方多一道「世代未坍缩」）─────────────────────
const ast = load(fs.readFileSync(FILE, 'utf8'), 'WORKTREE');
{
  const probe = "import{a}from'./no-space';";
  const ok1 = pre.every((g) => eq(g.run(probe), [])) && eq(ast(probe, 'x.ts'), ['./no-space']);
  const same = "import { a } from './plain';";
  const ok2 = pre.every((g) => eq(g.run(same), ['./plain'])) && eq(ast(same, 'x.ts'), ['./plain']);
  // 多一道：各代必须**互不相同**，否则「全绿/全红」可能只是所有代都加载成了同一份实现
  const disc = "import {\n  a, // it's fine\n} from './ap';";
  const sig = pre.map((g) => `${g.rev}=${JSON.stringify(g.run(disc))}`).join(' ');
  const ok3 = new Set(pre.map((g) => JSON.stringify(g.run(disc)))).size > 1;
  console.log(`[自测] 正向 ${ok1 ? 'OK' : 'FAIL'}  负向 ${ok2 ? 'OK' : 'FAIL'}  世代未坍缩 ${ok3 ? 'OK' : 'FAIL'}`);
  console.log(`       区分性输入上各代取值：${sig}`);
  if (!ok1 || !ok2 || !ok3) {
    console.error('活性自测失败，后续数字不可信');
    process.exit(2);
  }
  console.log('');
}

// ── 3. 从用例文件 AST 抽出 语料段的实参，逐条量红格 ──────────────────────────
const src = fs.readFileSync(FILE, 'utf8');
const sf = ts.createSourceFile(FILE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function evalConst(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = evalConst(n.left);
    const r = evalConst(n.right);
    return l === null || r === null ? null : l + r;
  }
  if (
    ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
    && n.expression.name.text === 'join' && ts.isArrayLiteralExpression(n.expression.expression)
  ) {
    const sep = n.arguments.length ? evalConst(n.arguments[0]) : ',';
    const ps = n.expression.expression.elements.map(evalConst);
    return ps.some((p) => p === null) ? null : ps.join(sep);
  }
  return null;
}
function ownerIt(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && p.expression.text === 'it') {
      return ts.isStringLiteral(p.arguments[0]) ? p.arguments[0].text : '?';
    }
  }
  return '';
}
const TARGET = process.argv[2] || '\u{1F4DC} 语料';
const probes = [];
(function walk(n) {
  if (
    ts.isCallExpression(n) && ts.isIdentifier(n.expression)
    && n.expression.text === 'importSpecifiers' && ownerIt(n).startsWith(TARGET)
  ) {
    let exp = n.parent;
    while (
      exp && !(ts.isCallExpression(exp) && ts.isPropertyAccessExpression(exp.expression)
      && exp.expression.name.text === 'toEqual')
    ) exp = exp.parent;
    probes.push({
      line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
      input: evalConst(n.arguments[0]),
      want: exp ? JSON.parse(exp.arguments[0].getText(sf).replace(/'/g, '"').replace(/,(\s*])/g, '$1')) : null,
    });
  }
  ts.forEachChild(n, walk);
})(sf);

console.log(`实测（探针输入逐字取自 ${FILE} 的 AST，段：${TARGET}）：\n`);
let bad = 0;
for (const p of probes) {
  const results = pre.map((g) => {
    let got;
    try { got = g.run(p.input); } catch (e) { got = `THREW:${e.message}`; }
    return { rev: g.rev, got, red: !eq(got, p.want) };
  });
  const astGot = ast(p.input, 'probe.ts');
  const reds = results.filter((r) => r.red).length;
  const astOk = eq(astGot, p.want);
  if (reds === 0 || !astOk) bad += 1;
  console.log(`  L${p.line}  换代前红 ${reds}/${pre.length}  AST ${astOk ? '符合' : 'MISMATCH ' + JSON.stringify(astGot)}  期望 ${JSON.stringify(p.want)}`);
  console.log(`        红在：${results.filter((r) => r.red).map((r) => r.rev).join(' / ') || '（无）'}`);
  console.log(`        输入 ${JSON.stringify(p.input)}`);
  console.log(`        取值 ${results.map((r) => `${r.rev}=${JSON.stringify(r.got)}`).join('  ')}`);
}
console.log(`\n共 ${probes.length} 条；换代前零红或 AST 不符的 ${bad} 条`);
