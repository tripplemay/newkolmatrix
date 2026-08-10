/**
 * 复验 1 独立取证工具 A：**从被验文件的 AST 里逐字抽出探针输入**，不从 probe-bench 的
 * CANDIDATES 抄。用途是回答「台子量的那个字符串，跟真正写进用例的那个字符串，是不是同一个」。
 *
 * 交付方的 probe-bench 自带 CANDIDATES 常量 —— 若它与用例里的实参有出入（哪怕差一个空格），
 * 台子报的红格就与用例无关。首轮的阻断点正是「钉错了实例」，故此项必须独立取证。
 */
import fs from 'node:fs';
import ts from 'typescript';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';
const src = fs.readFileSync(FILE, 'utf8');
const sf = ts.createSourceFile(FILE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** 常量折叠：只认字面量 / 模板串（无替换）/ 字符串拼接 / [..].join('\n') —— 够覆盖本文件 */
function evalConst(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = evalConst(node.left), r = evalConst(node.right);
    return l === null || r === null ? null : l + r;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'join' && ts.isArrayLiteralExpression(node.expression.expression)) {
    const sep = node.arguments.length ? evalConst(node.arguments[0]) : ',';
    const parts = node.expression.expression.elements.map(evalConst);
    return parts.some((p) => p === null) || sep === null ? null : parts.join(sep);
  }
  return null;
}

/** 找到最近的祖先 it(...) 的标题 */
function ownerIt(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression)
        && (p.expression.text === 'it' || p.expression.text === 'test')) {
      const t = p.arguments[0];
      return t && ts.isStringLiteral(t) ? t.text : '<非字面量标题>';
    }
  }
  return '<顶层>';
}

const found = [];
(function walk(n) {
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'importSpecifiers') {
    const arg = n.arguments[0];
    found.push({
      line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
      it: ownerIt(n),
      raw: n.getText(sf).replace(/\s+/g, ' ').slice(0, 90),
      input: arg ? evalConst(arg) : null,
      fileArg: n.arguments[1] ? evalConst(n.arguments[1]) : undefined,
    });
  }
  ts.forEachChild(n, walk);
})(sf);

const want = process.argv[2];
const rows = want ? found.filter((f) => f.it.includes(want)) : found;
console.log(JSON.stringify(rows, null, 2));
console.error(`\n[抽取] importSpecifiers(...) 调用共 ${found.length} 处；本次输出 ${rows.length} 处；` +
  `其中实参无法常量折叠的 ${rows.filter((r) => r.input === null).length} 处`);
