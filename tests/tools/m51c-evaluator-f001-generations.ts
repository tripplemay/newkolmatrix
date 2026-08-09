/**
 * M5.1c F001 —— 验收方的**四代判据横向对照台**（evaluator 产物）。
 *
 * acceptance ② 要求「逐条给出『换代前漏 / 换代后抓到』的对照输出」。「换代前」在本仓不是
 * 一个版本而是三个（原版 / fix-3 / fix-4），三者漏抓面互不相同——M5.1b 的实测账就是
 * 「原版漏 5 → fix-3 漏 6 → fix-4 漏 0」。只拿其中一代作对照，会把「另一代才有的病」
 * 说成「换代前的病」。故本台一次跑四代。
 *
 * 四代来源（全部机械抽取，不手抄）：
 *   原版   6a120a7  feat(F008) 立
 *   fix-3  1ea4abb  修两处真实漏抓（引入行尾注释/ES2022 两类新漏）
 *   fix-4  c251fe9  撤回 fix-3 改法，`?` → `??`（M5.1c 立项时的 HEAD，= bf26603 内容）
 *   AST    工作树   M5.1c F001
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import ts from 'typescript';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';
type Scanner = (s: string, f?: string) => string[];

function cut(source: string, name: string): string | null {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return null;
  let i = source.indexOf('{', start);
  let d = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}' && (d -= 1) === 0) return source.slice(start, i + 1);
  }
  return null;
}

function build(source: string): Scanner {
  const fns = [cut(source, 'stripComments'), cut(source, 'importSpecifiers')].filter(
    (x): x is string => x !== null,
  );
  const js = transformSync(`${fns.join('\n\n')}\nreturn importSpecifiers;`, {
    loader: 'ts',
    format: 'cjs',
  }).code;
  // eslint-disable-next-line no-new-func -- 验收脚本
  return new Function('ts', js)(ts) as Scanner;
}

const at = (rev: string) =>
  execFileSync('git', ['show', `${rev}:${FILE}`], { encoding: 'utf8', maxBuffer: 64 << 20 });

const gens: { name: string; scan: Scanner }[] = [
  { name: '原版 6a120a7', scan: build(at('6a120a7')) },
  { name: 'fix-3 1ea4abb', scan: build(at('1ea4abb')) },
  { name: 'fix-4 c251fe9', scan: build(at('c251fe9')) },
  { name: 'AST 工作树', scan: build(readFileSync(FILE, 'utf8')) },
];

const eq = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

const PROBES: { id: string; src: string; want: string[] }[] = [
  {
    id: 'U1 行尾注释含 from \'./old\'（钉在 📜 语料 (e)）',
    src: "import { a } from './new'; // 旧版 from './old'",
    want: ['./new'],
  },
  {
    id: "U1′ 多行 import + 行尾注释含 from './old'（「既误捕又漏真」的真形态）",
    src: "import {\n  a, // 旧版 from './old'\n} from './new';",
    want: ['./new'],
  },
  {
    id: 'U2 钉在文件里的那条探针（📜 语料 (f)，后文散文是**整行 // 注释**）',
    src: "export const a = 1\n// 说明：本模块的数据 from 'lib/db/privileged' 而来",
    want: [],
  },
  {
    id: 'U2′ 同形态但散文不在整行注释里（行尾注释）',
    src: "export const a = 1\nconst b = 2 // 说明：数据 from 'lib/db/privileged' 而来",
    want: [],
  },
  {
    id: 'U2″ 同形态但散文是普通代码（模板串）',
    src: "export const a = 1\nconst note = `数据 from 'lib/db/privileged' 而来`",
    want: [],
  },
  { id: 'U3 模板串带替换', src: 'const m = await import(`./${name}`);', want: [] },
  { id: 'U4 字符串里的假 import', src: `const s = "import { x } from './fake';";`, want: [] },
  { id: 'U5 动态 import 尾逗号', src: `const m = await import('./trail',);`, want: ['./trail'] },
  { id: "无空格 import{a}from'x'", src: `import{a}from'x';`, want: ['x'] },
  { id: "无空格侧效应 import'x'", src: `import'x';`, want: ['x'] },
  { id: 'import attributes with', src: `import j from './d.json' with { type: 'json' };`, want: ['./d.json'] },
  { id: 'import attributes assert', src: `import j from './d.json' assert { type: 'json' };`, want: ['./d.json'] },
  { id: '动态 import 第二参数', src: `const m = await import('./x', { with: { type: 'json' } });`, want: ['./x'] },
  { id: '侧效应吞噬', src: "import './runtime';\nimport { z } from 'zod';", want: ['./runtime', 'zod'] },
  { id: '后文字符串 from', src: "import './runtime';\nconst s = 'a from ' + 'b';", want: ['./runtime'] },
  { id: '行尾注释含反引号', src: "import {\n  a, // 见 `runtime`\n} from './bt';", want: ['./bt'] },
  { id: "行尾注释含撇号", src: "import {\n  a, // it's fine\n} from './ap';", want: ['./ap'] },
  { id: '行尾注释含分号', src: "import {\n  a, // foo; bar\n} from './sc';", want: ['./sc'] },
  { id: 'ES2022 带引号绑定名', src: 'import { "weird-name" as w, x } from "./es2022";', want: ['./es2022'] },
  { id: 'ES2022 export 侧', src: 'export { x as "a-b" } from "./es2022x";', want: ['./es2022x'] },
  { id: 'export * as ns', src: `export * as ns from './ns';`, want: ['./ns'] },
  { id: 'import Foo = require()', src: `import Foo = require('./legacy');`, want: ['./legacy'] },
  { id: '幻影块注释', src: "// M5 路由装配：/api/auth/*\nimport { privilegedDb } from 'lib/db/privileged';", want: ['lib/db/privileged'] },
  { id: '边界：拼接路径', src: "const m = await import('./' + name);", want: [] },
  { id: '边界：变量路径', src: 'const m = await import(pathFromConfig);', want: [] },
  { id: '反引号无替换静态路径', src: 'const m = await import(`../db/runtime`);', want: ['../db/runtime'] },
];

console.log('=== 四代判据横向对照（✓=与期望相符，✗=不符）===\n');
const tally = gens.map(() => 0);
for (const p of PROBES) {
  console.log(`● ${p.id}`);
  console.log(`    期望 ${JSON.stringify(p.want)}`);
  gens.forEach((g, i) => {
    let out: string[];
    try {
      out = g.scan(p.src, 'probe.ts');
    } catch (e) {
      out = [`<抛错 ${(e as Error).message}>`];
    }
    const ok = eq(out, p.want);
    if (!ok) tally[i] += 1;
    console.log(`    ${ok ? '✓' : '✗'} ${g.name.padEnd(14)} ${JSON.stringify(out)}`);
  });
  console.log();
}
console.log('=== 各代不符期望的探针数 ===');
gens.forEach((g, i) => console.log(`  ${g.name.padEnd(14)} ${tally[i]} / ${PROBES.length}`));
