/**
 * 对抗复核工具 C：从 HEAD 的 `📜 语料` 用例中**运行时捕获**每条断言的
 * (实际输入, 期望值, 所属字母段, 该段的注释原文)
 *
 * 为什么不手抄：任务书点名的误报向量里有「探针字符串被转义改写」与
 * 「把注释里的措辞和断言实际输入混为一谈」。手抄或 shell 传参都可能踩中。
 * 这里的输入直接来自**真实执行**该 it 回调时传进 importSpecifiers 的那个值，
 * 期望值直接来自 .toEqual() 的实参 —— 与 vitest 跑的是同一份对象。
 *
 * 同时用 AST 独立求出「第 k 条 expect 属于哪个字母段」，与运行时条数交叉校验。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require_ = createRequire(import.meta.url);
const FILE = 'tests/unit/db-layer-importer-census.test.ts';
const CORPUS_IT = '📜 语料';

/** AST 侧：逐条 expect 归属到字母段（由各语句的前导注释决定） */
export function astSegments(source = readFileSync(FILE, 'utf8')) {
  const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let body = null;
  const findIt = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'it' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text.includes(CORPUS_IT)
    ) {
      body = node.arguments[1];
    }
    ts.forEachChild(node, findIt);
  };
  findIt(sf);
  if (!body || !ts.isArrowFunction(body) || !ts.isBlock(body.body)) {
    throw new Error('找不到 📜 语料 用例体');
  }

  const segments = [];
  let current = { letter: '?', comment: '', expects: 0, lines: [] };
  for (const st of body.body.statements) {
    const lead = ts.getLeadingCommentRanges(source, st.pos) ?? [];
    const commentText = lead.map((r) => source.slice(r.pos, r.end)).join('\n');
    const m = commentText.match(/\(([a-z])\)/);
    if (m) {
      if (current.expects > 0 || current.letter !== '?') segments.push(current);
      current = { letter: m[1], comment: commentText, expects: 0, lines: [] };
    }
    // 数该语句里的 expect 调用
    const count = (function countExpects(n) {
      let c = 0;
      if (
        ts.isCallExpression(n) &&
        ts.isIdentifier(n.expression) &&
        n.expression.text === 'expect'
      ) {
        c += 1;
      }
      ts.forEachChild(n, (ch) => {
        c += countExpects(ch);
      });
      return c;
    })(st);
    current.expects += count;
    if (count > 0) {
      current.lines.push(sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1);
    }
  }
  segments.push(current);
  return segments.filter((s) => s.expects > 0);
}

/** 运行时侧：捕获 (输入, 期望) */
export function capture() {
  const src = readFileSync(FILE, 'utf8');
  const sf = ts.createSourceFile(FILE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  // 把 importSpecifiers 的**声明名**改掉（只改声明处那一个标识符），再注入同名 hoisted 包装
  let declNameStart = -1;
  let declNameEnd = -1;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === 'importSpecifiers') {
      declNameStart = st.name.getStart(sf);
      declNameEnd = st.name.getEnd();
    }
  }
  if (declNameStart < 0) throw new Error('找不到 importSpecifiers 声明');

  const patched =
    src.slice(0, declNameStart) +
    '__real_importSpecifiers' +
    src.slice(declNameEnd) +
    `
function importSpecifiers(s, f) {
  globalThis.__ADV_INPUTS.push(s);
  return __real_importSpecifiers(s, f);
}
`;

  const inputs = [];
  const asserts = [];
  globalThis.__ADV_INPUTS = inputs;

  const vitestStub = {
    describe: (_n, fn) => fn(),
    it: (name, fn) => {
      if (name.includes(CORPUS_IT)) fn();
    },
    test: () => {},
    beforeAll: () => {},
    afterAll: () => {},
    beforeEach: () => {},
    afterEach: () => {},
    vi: {},
    expect: (actual, message) => ({
      toEqual: (expected) => {
        asserts.push({ actual, expected, message, inputIndex: inputs.length - 1 });
      },
      toBe: (expected) => {
        asserts.push({ actual, expected, message, inputIndex: inputs.length - 1 });
      },
      toBeNull: () => {},
    }),
  };

  const js = ts.transpileModule(patched, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: 'probe.ts',
  }).outputText;

  const mod = { exports: {} };
  const req = (id) => (id === 'vitest' ? vitestStub : require_(id));
  // eslint-disable-next-line no-new-func
  new Function('exports', 'require', 'module', '__filename', '__dirname', js)(
    mod.exports,
    req,
    mod,
    'probe.ts',
    process.cwd(),
  );

  delete globalThis.__ADV_INPUTS;

  return asserts.map((a, i) => ({
    idx: i + 1,
    input: inputs[a.inputIndex],
    expected: a.expected,
    headActual: a.actual,
    message: a.message,
  }));
}

/** 合并：给每条探针贴上字母段 */
export function probesWithSegments() {
  const segs = astSegments();
  const caught = capture();
  const labels = [];
  for (const s of segs) for (let k = 0; k < s.expects; k += 1) labels.push(s);
  if (labels.length !== caught.length) {
    throw new Error(`AST 段内 expect 数 ${labels.length} ≠ 运行时捕获 ${caught.length}`);
  }
  return caught.map((c, i) => ({ ...c, letter: labels[i].letter, comment: labels[i].comment }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const segs = astSegments();
  console.log('=== AST：📜 语料 各字母段的 expect 条数 ===');
  for (const s of segs) console.log(`  (${s.letter})  expects=${s.expects}  行=${s.lines.join(',')}`);
  console.log(`  合计 expects = ${segs.reduce((a, s) => a + s.expects, 0)}`);

  const probes = probesWithSegments();
  console.log('\n=== 运行时捕获的逐条 (输入 → 期望)（输入为 JSON 转义显示，未经 shell）===');
  for (const p of probes) {
    console.log(
      `  #${String(p.idx).padStart(2)} (${p.letter})  input=${JSON.stringify(p.input)}\n` +
        `        expected=${JSON.stringify(p.expected)}  HEAD实测=${JSON.stringify(p.headActual)}` +
        (p.message ? `  msg=${JSON.stringify(p.message)}` : ''),
    );
  }
}
