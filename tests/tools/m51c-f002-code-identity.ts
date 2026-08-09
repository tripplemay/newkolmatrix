/**
 * M5.1c F002 独立验收 —— acceptance ⑥「src/ 除注释外零改动」的判据（Evaluator 侧独立 oracle）。
 *
 * 判据刻意做成**双判据交叉**，不与 Generator 同源：
 *   判据 1：`ts.transpileModule({ removeComments: true })` 后比对 emit（与 Generator 同法，用于复核其自陈）
 *   判据 2：**AST token 流**比对 —— 用 ts scanner 跳过 trivia 逐 token 取 (kind, text)，
 *           完全不经过 emitter。两条互相独立的路径给出同一结论才采信。
 *
 * 判据本身先做正负双向自测（`--selftest`）：
 *   正向（负例）：只改注释 → 两条判据都必须判「相同」
 *   负向（正例）：改一个字面量 / 改一个标识符 / 删一条语句 → 两条判据都必须判「不同」
 *              （不做这一步，「相同」可能只是比对器瞎了）
 */
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

function emitNoComments(fileName: string, source: string): string {
  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      removeComments: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      newLine: ts.NewLineKind.LineFeed,
    },
    reportDiagnostics: false,
  }).outputText;
}

function tokenStream(fileName: string, source: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.ESNext,
    /* skipTrivia */ true,
    /\.tsx$/.test(fileName) ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source,
  );
  const out: string[] = [];
  let kind: ts.SyntaxKind;
  while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    // skipTrivia:true 已跳过空白与**注释**；剩下的就是代码 token 本身。
    out.push(`${kind}:${scanner.getTokenText()}`);
  }
  return out.join('\n');
}

interface Verdict {
  file: string;
  emitSame: boolean;
  tokensSame: boolean;
}

function compare(file: string, a: string, b: string): Verdict {
  return {
    file,
    emitSame: emitNoComments(file, a) === emitNoComments(file, b),
    tokensSame: tokenStream(file, a) === tokenStream(file, b),
  };
}

function gitShow(rev: string, file: string): string {
  return execFileSync('git', ['show', `${rev}:${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
}

function selftest(): number {
  let fail = 0;
  const ok = (c: boolean, m: string) => {
    console.log(`${c ? 'PASS' : '**FAIL**'}  ${m}`);
    if (!c) fail++;
  };
  const base = `// 头注\nexport const n = 1;\nexport function f(a: number) { return a + n; }\n`;

  // 负例：只改注释 → 必须判「相同」
  const onlyComment = `// 头注改成了完全不同的另一句话\n/** 还加了一段 JSDoc */\nexport const n = 1;\nexport function f(a: number) { return a + n; }\n`;
  let v = compare('t.ts', base, onlyComment);
  ok(v.emitSame && v.tokensSame, '负例：只改注释 → emit 相同 ✓ token 相同 ✓');

  // 正例 1：改字面量 1 → 2
  v = compare('t.ts', base, base.replace('= 1;', '= 2;'));
  ok(!v.emitSame && !v.tokensSame, '正例1：字面量 1→2 → emit 不同 ✓ token 不同 ✓（比对器没瞎）');

  // 正例 2：改标识符
  v = compare('t.ts', base, base.replace(/\bn\b/g, 'm'));
  ok(!v.emitSame && !v.tokensSame, '正例2：标识符 n→m → 两判据均判不同');

  // 正例 3：删一条语句
  v = compare('t.ts', base, base.replace('export const n = 1;\n', ''));
  ok(!v.emitSame && !v.tokensSame, '正例3：删一条语句 → 两判据均判不同');

  // 正例 4：**只改字符串字面量的内容**（注释形近，最容易被误判为「只是文案」）
  const s1 = `export const msg = '旧文案';\n`;
  const s2 = `export const msg = '新文案';\n`;
  v = compare('t.ts', s1, s2);
  ok(!v.emitSame && !v.tokensSame, '正例4：字符串字面量内容变化 → 两判据均判不同（不会被当成注释）');

  console.log(fail === 0 ? '\nSELFTEST: ALL PASS' : `\nSELFTEST: ${fail} FAILED`);
  return fail;
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  process.exit(selftest() === 0 ? 0 : 1);
}

const from = argv[0] ?? '8cc63d2';
const to = argv[1] ?? 'HEAD';
const changed = execFileSync('git', ['diff', '--name-only', `${from}..${to}`, '--', 'src/'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

console.log(`# ${from}..${to} 改动的 src/ 文件：${changed.length} 个`);
let codeChanged = 0;
for (const f of changed) {
  const v = compare(f, gitShow(from, f), gitShow(to, f));
  const realCode = !(v.emitSame && v.tokensSame);
  if (realCode) codeChanged++;
  console.log(
    `  ${f}\n     emit(removeComments) 相同 = ${v.emitSame}\n     token 流       相同 = ${v.tokensSame}\n     => ${realCode ? '**含真实代码改动**' : '仅注释改动'}`,
  );
}
console.log(`\n含真实代码改动的文件数 = ${codeChanged}`);
process.exit(codeChanged === 0 ? 0 : 1);
