/**
 * 对抗复核工具 E：把 `盲区登记` 段列出的**每一种**写法真去打那道白名单钉，
 * 数出到底**几种能绕过**。
 *
 * 被复核报告只测了 5 种里的第 1 种就下了结论；本工具逐种测。
 * 判定方向写死：`usesPrivileged(src) === false` ⇒ **该写法绕过了钉**（钉看不见 ⇒ 不会红）。
 *                `usesPrivileged(src) === true`  ⇒ **被抓到**。
 *
 * 判据来源：从 tests/unit/bootstrap-whitelist-census.test.ts 逐字抽取
 * stripComments / stripStringLiterals / usesPrivileged 三个函数（AST 定位，不手抄）。
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require_ = createRequire(import.meta.url);
const NAIL = 'tests/unit/bootstrap-whitelist-census.test.ts';

function extractUsesPrivileged() {
  const src = readFileSync(NAIL, 'utf8');
  const sf = ts.createSourceFile(NAIL, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const want = ['stripComments', 'stripStringLiterals', 'usesPrivileged'];
  const fns = [];
  let ident = null;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && want.includes(st.name?.text)) fns.push(st.getText(sf));
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === 'PRIVILEGED_IDENTIFIER') {
          ident = st.getText(sf);
        }
      }
    }
  }
  if (fns.length !== 3 || !ident) throw new Error(`抽取失败：fns=${fns.length} ident=${!!ident}`);
  const mod = [ident, ...fns, 'export { usesPrivileged };'].join('\n\n');
  const js = ts.transpileModule(mod, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: 'nail.ts',
  }).outputText;
  const m = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'require', 'module', js)(m.exports, require_, m);
  return m.exports.usesPrivileged;
}

const usesPrivileged = extractUsesPrivileged();

// ── 盲区登记段逐种写法（逐字对照 bootstrap-whitelist-census.test.ts:21-26）──
const STYLES = [
  {
    tag: '✅1',
    name: '`import * as ns` 后 `ns.privilegedDb`',
    src: "import * as ns from 'lib/db/privileged';\nexport const c = ns.privilegedDb;\n",
  },
  {
    tag: '✅2',
    name: '重命名 import（`as backdoor`）',
    src: "import { privilegedDb as backdoor } from 'lib/db/privileged';\nexport const c = backdoor;\n",
  },
  {
    tag: '✅3',
    name: '动态 `import()` 后取属性',
    src: "const m = await import('lib/db/privileged');\nexport const c = m.privilegedDb;\n",
  },
  {
    tag: '✅4',
    name: '顶部仍有 import 的动态键取用',
    src:
      "import { privilegedDb } from 'lib/db/privileged';\n" +
      "const KEY = 'privileged' + 'Db';\n" +
      "export const c = (await import('lib/db/privileged'))[KEY];\n",
  },
  {
    tag: '❌5',
    name: '标识符从不作为完整 token 出现的动态键取用（拼接键）',
    src:
      "const KEY = 'privileged' + 'Db';\n" +
      "export const c = (await import('./db/privileged'))[KEY];\n",
  },
];

// ── 活性自测 ──
const LIVENESS = [
  {
    name: '正向：最普通的直接使用，必须被抓到',
    src: "import { privilegedDb } from 'lib/db/privileged';\nawait privilegedDb.user.findMany();\n",
    expect: true,
  },
  {
    name: '负向：只在注释里提到，不算使用',
    src: '// 这里说明为什么不能用 privilegedDb\nexport const x = 1;\n',
    expect: false,
  },
  {
    name: '负向：只在字符串消息里提到（tenant-scope 那个真实假阳性），不算使用',
    src: "throw new Error('引导查询…改用 privilegedDb，白名单见 spec D-5');\n",
    expect: false,
  },
  {
    name: '正向：模板串插值里的使用必须仍被看见',
    src: 'export const s = `${privilegedDb.user}`;\n',
    expect: true,
  },
];

console.log('=== 活性自测（判据先证明能看见目标、且不误报）===');
let ok = true;
for (const l of LIVENESS) {
  const got = usesPrivileged(l.src);
  const pass = got === l.expect;
  if (!pass) ok = false;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${l.name}   → usesPrivileged=${got}`);
}
console.log(`  自测总判：${ok ? 'ALL PASS' : 'FAILED'}`);

console.log('\n=== 盲区登记段五种写法：逐种打钉 ===');
console.log('（能绕过 = usesPrivileged 返回 false = 钉看不见 = 不会红）\n');
let bypass = 0;
let caught = 0;
for (const s of STYLES) {
  const seen = usesPrivileged(s.src);
  if (seen) caught += 1;
  else bypass += 1;
  console.log(
    `  ${s.tag}  ${seen ? '被抓到（无法绕过）' : '⚠ 绕过了钉    '}  ${s.name}`,
  );
}
console.log(`\n  被抓到 = ${caught} 种；**能绕过 = ${bypass} 种**`);

console.log('\n=== 结论比对 ===');
console.log(`  privileged.ts:19-20 断言：「「盲区登记」段就列着**四种**…写法**能绕过它**」`);
console.log(`  实测：能绕过 = ${bypass} 种，被抓到 = ${caught} 种`);
console.log(`  ⇒ 该断言 ${bypass === 4 ? '成立' : '**不成立**'}`);
