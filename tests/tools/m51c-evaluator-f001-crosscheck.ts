/**
 * M5.1c F001 —— **验收方**的独立交叉核对（evaluator 产物，非实现方脚本）。
 *
 * 存在理由：`scripts/test/m51c-scanner-equivalence.ts` 是实现方写的「新 vs 旧」对照。
 * 它能证明「换代没改变对本仓真实代码的扫描结果」，但**不能**证明新实现是对的——
 * 若新旧同错，两侧一致照样 0 分歧。故本脚本另立一个**与被验实现不同代码路径**的 oracle：
 * `ts.preProcessFile`（TypeScript 自带的预处理扫描器，不是本仓手写的 visitor），
 * 对 src/ 全量逐文件比对**多重集**（不去重），差异逐条打印待人工归因。
 *
 * 同时做两件事：
 *   ② 探针表：old(bf26603 正则版) vs new(工作树 AST 版) 在 U1–U5 与已知边界上的实测对照；
 *   ⑤ 用**独立重写**的解析器复算两个被守模块的 importer 集合，与 GUARDED 期望对账。
 *
 * 用法：node --import tsx scripts/test/m51c-evaluator-f001-crosscheck.ts
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, normalize, posix } from 'node:path';
import { transformSync } from 'esbuild';
import ts from 'typescript';

const SCANNER_FILE = 'tests/unit/db-layer-importer-census.test.ts';
const BASE = 'bf26603';
const SRC_ROOT = 'src';

type Scanner = (source: string, fileName?: string) => string[];

// ── 机械抽取（验收方自写，不复用实现方的抽取器）────────────────────────────
function cutFunction(source: string, name: string): string {
  const head = `function ${name}(`;
  const start = source.indexOf(head);
  if (start < 0) throw new Error(`找不到 ${head}`);
  let i = source.indexOf('{', start);
  if (i < 0) throw new Error(`${name} 无函数体`);
  let depth = 0;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} 大括号未配平`);
}

function evalScanner(fns: string[], entry: string): Scanner {
  const js = transformSync(`${fns.join('\n\n')}\nreturn ${entry};`, {
    loader: 'ts',
    format: 'cjs',
  }).code;
  // eslint-disable-next-line no-new-func -- 验收脚本，输入来自本仓 git 对象与工作树
  return new Function('ts', js)(ts) as Scanner;
}

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);

function collect(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

function msDiff(a: readonly string[], b: readonly string[]): string[] {
  const rest = [...b];
  const out: string[] = [];
  for (const x of a) {
    const at = rest.indexOf(x);
    if (at >= 0) rest.splice(at, 1);
    else out.push(x);
  }
  return out;
}

// ── oracle：TypeScript 自带 preProcessFile（与被验 visitor 不同代码路径）──────
function oracle(source: string): string[] {
  const pp = ts.preProcessFile(source, /* readImportFiles */ true, /* detectJavaScriptImports */ true);
  return pp.importedFiles.map((f) => f.fileName);
}

// ── 验收方自写的解析器（独立于被验实现的 resolveToSrcModule）─────────────────
function resolveMine(fromFile: string, spec: string): string | null {
  let r: string;
  if (spec[0] === '.') r = normalize(join(dirname(fromFile), spec));
  else if (spec.startsWith('@/')) r = normalize(join(SRC_ROOT, spec.slice(2)));
  else if (spec[0] === '@') return null;
  else r = normalize(join(SRC_ROOT, spec));
  return r.split(/[\\/]/).join(posix.sep).replace(/\.(ts|tsx)$/, '');
}

function main(): void {
  const baseSrc = execFileSync('git', ['show', `${BASE}:${SCANNER_FILE}`], {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
  });
  const headSrc = readFileSync(SCANNER_FILE, 'utf8');
  const oldFn = cutFunction(baseSrc, 'importSpecifiers');
  const newFn = cutFunction(headSrc, 'importSpecifiers');
  if (oldFn === newFn) throw new Error('老/新函数体逐字相同 —— 对照退化，结论无效');
  for (const m of ['RegExpExecArray', 're.exec']) {
    if (!oldFn.includes(m)) throw new Error(`基线 ${BASE} 不像正则实现（缺 ${m}）`);
  }
  if (!newFn.includes('ts.createSourceFile')) throw new Error('工作树实现不像 AST 实现');

  const oldScan = evalScanner([cutFunction(baseSrc, 'stripComments'), oldFn], 'importSpecifiers');
  const newScan = evalScanner([newFn], 'importSpecifiers');

  console.log('=== M5.1c F001 验收方独立交叉核对 ===');
  console.log(`old = ${BASE}:${SCANNER_FILE}  fn-sha256[0:16]=${sha(oldFn)}`);
  console.log(`new = 工作树 ${SCANNER_FILE}    fn-sha256[0:16]=${sha(newFn)}`);
  console.log(`oracle = ts.preProcessFile（typescript ${ts.version}，与被验 visitor 不同代码路径）\n`);

  // ── oracle 活性自测（正负双向）──────────────────────────────────────────
  const posProbe = `import{a}from'./no-space';`;
  const negProbe = `const s = "import { x } from './fake';";`;
  const oPos = oracle(posProbe);
  const oNeg = oracle(negProbe);
  console.log('[oracle 自测] 正向 `import{a}from\'./no-space\';` →', JSON.stringify(oPos));
  console.log('[oracle 自测] 负向 字符串里的假 import →', JSON.stringify(oNeg));
  if (oPos.length !== 1 || oNeg.length !== 0) {
    throw new Error('oracle 活性自测未通过 —— 后续 0 分歧结论不可采信');
  }
  // 第三道：oracle 必须能看见新实现的一处已知缺陷形态（若把 require 分支摘掉的差异）
  console.log('[oracle 自测] require 形态 →', JSON.stringify(oracle(`const m = require('./r');`)));
  console.log();

  // ── ④' oracle vs 新实现，全量 src/ 逐文件多重集 ────────────────────────
  const files = collect(SRC_ROOT);
  let tOracle = 0;
  let tNew = 0;
  const diffs: { file: string; onlyOracle: string[]; onlyNew: string[] }[] = [];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    const a = oracle(s);
    const b = newScan(s, f);
    tOracle += a.length;
    tNew += b.length;
    const onlyOracle = msDiff(a, b);
    const onlyNew = msDiff(b, a);
    if (onlyOracle.length || onlyNew.length) diffs.push({ file: f, onlyOracle, onlyNew });
  }
  console.log(`--- ④' 独立 oracle 对照（不去重多重集）---`);
  console.log(`扫描面：${files.length} 个 .ts/.tsx`);
  console.log(`specifier 总数：oracle ${tOracle} / 新实现 ${tNew}`);
  console.log(`有差异的文件：${diffs.length}`);
  for (const d of diffs) {
    console.log(`  ${d.file}`);
    if (d.onlyOracle.length) console.log(`    仅 oracle 抓到：${d.onlyOracle.join(', ')}`);
    if (d.onlyNew.length) console.log(`    仅新实现抓到：${d.onlyNew.join(', ')}`);
  }
  console.log();

  // ── ② U1–U5 与已知边界：old vs new 实测对照 ─────────────────────────────
  const probes: { id: string; src: string; want: string[] }[] = [
    { id: 'U1 行尾注释含 from \'./old\'', src: "import { a } from './new'; // 旧版 from './old'", want: ['./new'] },
    {
      id: 'U2 无分号 export + 后文散文含 from',
      src: "export const a = 1\n// 说明：本模块的数据 from 'lib/db/privileged' 而来",
      want: [],
    },
    { id: 'U3 模板串带替换', src: 'const m = await import(`./${name}`);', want: [] },
    { id: 'U4 普通字符串里的 import 语句', src: `const s = "import { x } from './fake';";`, want: [] },
    { id: 'U5 动态 import 尾逗号', src: `const m = await import('./trail',);`, want: ['./trail'] },
    { id: '无空格 import{a}from\'x\'', src: `import{a}from'x';`, want: ['x'] },
    { id: "无空格侧效应 import'x'", src: `import'x';`, want: ['x'] },
    {
      id: 'import attributes（with）',
      src: `import j from './d.json' with { type: 'json' };`,
      want: ['./d.json'],
    },
    {
      id: 'import attributes（assert）',
      src: `import j from './d.json' assert { type: 'json' };`,
      want: ['./d.json'],
    },
    {
      id: '动态 import 第二参数 with',
      src: `const m = await import('./x', { with: { type: 'json' } });`,
      want: ['./x'],
    },
    { id: '侧效应后跟 from-import（吞噬）', src: "import './runtime';\nimport { z } from 'zod';", want: ['./runtime', 'zod'] },
    { id: '行尾注释含反引号（fix-3 漏抓）', src: "import {\n  a, // 见 `runtime`\n} from './bt';", want: ['./bt'] },
    { id: 'ES2022 带引号绑定名', src: 'import { "weird-name" as w, x } from "./es2022";', want: ['./es2022'] },
    { id: 'export * as ns from', src: `export * as ns from './ns';`, want: ['./ns'] },
    { id: 'import Foo = require()', src: `import Foo = require('./legacy');`, want: ['./legacy'] },
    { id: '边界：拼接路径', src: "const m = await import('./' + name);", want: [] },
    { id: '边界：变量路径', src: 'const m = await import(pathFromConfig);', want: [] },
    { id: '反引号无替换静态路径', src: 'const m = await import(`../db/runtime`);', want: ['../db/runtime'] },
  ];
  console.log('--- ② 探针表：old(正则) vs new(AST) vs 期望 ---');
  const eq = (a: string[], b: string[]) => msDiff(a, b).length === 0 && msDiff(b, a).length === 0;
  let newBad = 0;
  for (const p of probes) {
    const o = oldScan(p.src);
    const n = newScan(p.src, 'probe.ts');
    const oOk = eq(o, p.want);
    const nOk = eq(n, p.want);
    if (!nOk) newBad += 1;
    console.log(
      `  ${nOk ? '✓' : '✗'} ${p.id}\n` +
        `      期望=${JSON.stringify(p.want)}  老=${JSON.stringify(o)}${oOk ? '(符)' : '(不符)'}  新=${JSON.stringify(n)}${nOk ? '(符)' : '(不符)'}`,
    );
  }
  console.log(`  新实现不符期望的探针数：${newBad}\n`);

  // ── ⑤ 用独立解析器复算 GUARDED 实测集合 ─────────────────────────────────
  console.log('--- ⑤ 独立复算被守模块的 importer 集合（oracle specs + 验收方自写解析器）---');
  for (const mod of ['src/lib/db/runtime', 'src/lib/db/privileged']) {
    const hits: string[] = [];
    for (const f of files) {
      const self = f.split(/[\\/]/).join(posix.sep).replace(/\.(ts|tsx)$/, '');
      if (self === mod) continue;
      const specs = oracle(readFileSync(f, 'utf8'));
      if (specs.some((s) => resolveMine(f, s) === mod)) hits.push(self.replace(/$/, ''));
    }
    console.log(`  ${mod}  (${hits.length}) →`);
    for (const h of hits.sort()) console.log(`      ${h}`);
  }
}

main();
