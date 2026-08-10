// 签收方独立复算 ②：把 HEAD 测试文件里**全部** importSpecifiers 断言逐条抽出来，
// 在换代前 5 代 + 换代后 1 代上重放，自己算「换代前红几代」。
//
// 与前面几路刻意分歧：输入不手抄、不读任何 CANDIDATES 常量，直接从 HEAD 文件 AST 取
// `importSpecifiers(...)` 的实参与配套 `.toEqual(...)` 期望；实现由 sg-impl.mjs（TS parser 抽取 + vm）加载。
//
// 活性自测两道：正向（已知分歧输入两侧不同）、负向（一致输入两侧相同）——由 sg-impl/sg-generations 复用。

import vm from 'node:vm';
import ts from 'typescript';
import { readAt, loadImpl, fnHash } from './sg-impl.mjs';

const PRE_REVS = ['6a120a7', 'fadc1f4', '1ea4abb', '2bc02aa', 'c251fe9'];

const src = readAt('WORKTREE');
const sf = ts.createSourceFile('head.ts', src, ts.ScriptTarget.Latest, true);

function evalText(text) {
  try {
    return { ok: true, value: vm.runInNewContext(`(${text})`, {}, { timeout: 1000 }) };
  } catch {
    return { ok: false, value: undefined };
  }
}

/** 最近的外层 it('...') 标题 */
function enclosingTitle(node) {
  let p = node.parent;
  while (p) {
    if (
      ts.isCallExpression(p) &&
      ts.isIdentifier(p.expression) &&
      p.expression.text === 'it' &&
      p.arguments[0] &&
      ts.isStringLiteralLike(p.arguments[0])
    ) {
      return p.arguments[0].text;
    }
    p = p.parent;
  }
  return '(顶层)';
}

const probes = [];
const walk = (node) => {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'importSpecifiers'
  ) {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const argText = node.arguments[0] ? node.arguments[0].getText(sf) : '';
    const input = evalText(argText);
    // 找 expect(...).toEqual(...) 的期望
    let expected = { ok: false, value: undefined };
    let p = node.parent;
    while (p && !(ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression))) p = p.parent;
    if (p && ['toEqual', 'toStrictEqual'].includes(p.expression.name.text)) {
      expected = evalText(p.arguments[0].getText(sf));
    }
    probes.push({
      line,
      title: enclosingTitle(node),
      argText,
      input,
      expected,
      hasFileName: node.arguments.length > 1,
    });
  }
  ts.forEachChild(node, walk);
};
walk(sf);

console.log(`从 HEAD 文件 AST 抽到 importSpecifiers 调用 ${probes.length} 处`);
const unresolved = probes.filter((p) => !p.input.ok || !p.expected.ok);
console.log(
  `  其中实参/期望无法静态求值的 ${unresolved.length} 处：` +
    (unresolved.map((u) => `L${u.line}`).join(' ') || '无'),
);

const impls = new Map();
for (const rev of PRE_REVS) impls.set(rev, loadImpl(rev));
impls.set('AST', loadImpl('WORKTREE'));

// 世代身份自检：5 个 rev 的实现哈希必须两两不同（防「全坍缩成同一代」）
const hashes = PRE_REVS.map((r) => fnHash(r).hash);
console.log(
  `[自测] 换代前 5 代实现哈希互异 = ${new Set(hashes).size === 5 ? 'OK' : 'FAIL'}\n`,
);
if (new Set(hashes).size !== 5) process.exit(2);

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rows = [];
for (const p of probes) {
  if (!p.input.ok || !p.expected.ok) continue;
  const per = {};
  for (const rev of PRE_REVS) {
    let got;
    try {
      got = impls.get(rev)(p.input.value);
    } catch (e) {
      got = `THROW:${e.message.slice(0, 30)}`;
    }
    per[rev] = { got, red: !eq(got, p.expected.value) };
  }
  let astGot;
  try {
    astGot = impls.get('AST')(p.input.value, p.hasFileName ? 'scan.ts' : undefined);
  } catch (e) {
    astGot = `THROW:${e.message.slice(0, 30)}`;
  }
  rows.push({
    ...p,
    per,
    astGot,
    astOk: eq(astGot, p.expected.value),
    redCount: PRE_REVS.filter((r) => per[r].red).length,
  });
}

const byTitle = new Map();
for (const r of rows) {
  if (!byTitle.has(r.title)) byTitle.set(r.title, []);
  byTitle.get(r.title).push(r);
}
for (const [title, rs] of byTitle) {
  console.log(`\n### ${title}`);
  for (const r of rs) {
    const redRevs = PRE_REVS.filter((x) => r.per[x].red);
    console.log(
      `  L${String(r.line).padEnd(3)} 换代前红 ${r.redCount}/5  AST ${r.astOk ? '符合' : '★不符'}` +
        `  期望=${JSON.stringify(r.expected.value)}` +
        (redRevs.length ? `  红在：${redRevs.join(' ')}  换代前取值：${redRevs.map((x) => JSON.stringify(r.per[x].got)).join(' ')}` : ''),
    );
  }
}

const zero = rows.filter((r) => r.redCount === 0);
console.log(
  `\n合计断言 ${rows.length} 条；AST 不符 ${rows.filter((r) => !r.astOk).length} 条；` +
    `换代前零红 ${zero.length} 条（其中 📜 语料段 ${zero.filter((r) => r.title.startsWith('📜')).length} 条）`,
);
