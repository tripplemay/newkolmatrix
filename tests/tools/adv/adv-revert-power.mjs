/**
 * 对抗复核工具 G：全文件「反回退鉴别力」测量
 *
 * 回答 📜 语料段自陈的那个用途是否成立：
 *   「谁若哪天想把判据改回文本匹配，这里是现成的反例清单」
 * 做法：把整个文件里**所有**直接断言 importSpecifiers 的用例抓出来，
 *       逐世代重放，数出「若把实现回退到该世代，会有几条断言红」。
 *
 * 配对方式用**引用相等**（expect 的 actual 是否就是刚才那次 importSpecifiers 的返回对象），
 * 从而只收 importSpecifiers 类断言，排除 resolveToSrcModule / 全量扫描类断言。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { loadMethodA } from './adv-eval.mjs';

const require_ = createRequire(import.meta.url);
const FILE = 'tests/unit/db-layer-importer-census.test.ts';

function captureAll() {
  const src = readFileSync(FILE, 'utf8');
  const sf = ts.createSourceFile(FILE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let s = -1;
  let e = -1;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === 'importSpecifiers') {
      s = st.name.getStart(sf);
      e = st.name.getEnd();
    }
  }
  const patched = `${src.slice(0, s)}__real_importSpecifiers${src.slice(e)}
function importSpecifiers(a, b) {
  const out = __real_importSpecifiers(a, b);
  globalThis.__REC.push({ input: a, fileName: b, out });
  return out;
}
`;
  const rec = [];
  const asserts = [];
  globalThis.__REC = rec;
  let currentIt = '(top)';

  const stub = {
    describe: (_n, fn) => fn(),
    it: (name, fn) => {
      currentIt = name;
      try {
        fn();
      } catch (err) {
        /* 断言全部被 stub 接管，理论上不抛 */
      }
    },
    test: () => {},
    beforeAll: () => {},
    afterAll: () => {},
    beforeEach: () => {},
    afterEach: () => {},
    vi: {},
    expect: (actual) => {
      const hit = [...rec].reverse().find((r) => r.out === actual);
      const mk = (expected) => {
        if (hit) {
          asserts.push({ it: currentIt, input: hit.input, fileName: hit.fileName, expected });
        }
      };
      return { toEqual: mk, toBe: mk, toBeNull: () => {}, toContain: () => {} };
    },
  };

  const js = ts.transpileModule(patched, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: 'all.ts',
  }).outputText;
  const m = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'require', 'module', '__filename', '__dirname', js)(
    m.exports,
    (id) => (id === 'vitest' ? stub : require_(id)),
    m,
    'all.ts',
    process.cwd(),
  );
  delete globalThis.__REC;
  return asserts;
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const GENS = [
  ['G1', '6a120a7', '原版'],
  ['G2', 'fadc1f4', 'F003 期'],
  ['G3', '1ea4abb', 'fix-3'],
  ['G4', '2bc02aa', '补 require'],
  ['G5', 'c251fe9', 'fix-4 = 立项 HEAD（最可能的回退目标）'],
];

const asserts = captureAll();
console.log(`=== 捕获到 importSpecifiers 类断言 ${asserts.length} 条（含 📜 语料 10 条）===\n`);

const byIt = new Map();
for (const a of asserts) {
  if (!byIt.has(a.it)) byIt.set(a.it, []);
  byIt.get(a.it).push(a);
}

console.log('用例\t' + GENS.map((g) => g[0]).join('\t'));
const totals = Object.fromEntries(GENS.map((g) => [g[0], 0]));
const impls = GENS.map(([g, rev]) => [g, loadMethodA(rev)]);
for (const [name, list] of byIt) {
  const cells = impls.map(([g, fn]) => {
    let red = 0;
    for (const a of list) {
      let out;
      try {
        out = fn(a.input, a.fileName);
      } catch {
        out = '__THROW__';
      }
      if (!eq(out, a.expected)) red += 1;
    }
    totals[g] += red;
    return red === 0 ? '  ·' : ` ${red}红`;
  });
  const short = name.length > 34 ? `${name.slice(0, 33)}…` : name.padEnd(34);
  console.log(`${short}\t${cells.join('\t')}`);
}
console.log(
  `\n合计红断言数：${GENS.map(([g]) => `${g}=${totals[g]}`).join('  ')}   （总断言 ${asserts.length}）`,
);

console.log('\n=== 只看 📜 语料这一条用例（它自陈是「现成的反例清单」）===');
const corpus = [...byIt.entries()].find(([n]) => n.includes('📜 语料'))[1];
for (const [g, fn] of impls) {
  let red = 0;
  for (const a of corpus) {
    let out;
    try {
      out = fn(a.input, a.fileName);
    } catch {
      out = '__THROW__';
    }
    if (!eq(out, a.expected)) red += 1;
  }
  const note = GENS.find((x) => x[0] === g)[2];
  console.log(`  回退到 ${g}（${note}）：语料 10 条中会红 ${red} 条`);
}
