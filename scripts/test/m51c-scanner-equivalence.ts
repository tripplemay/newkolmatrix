/**
 * M5.1c-CENSUS-SCANNER F001 —— 扫描器换代的**等价性审计**（spec D-4）。
 *
 * 【它回答什么】把 `tests/unit/db-layer-importer-census.test.ts` 的 importSpecifiers 从正则
 * 换成 TS AST 之后，对 `src/` 真实代码的扫描结果**变了没有、哪里变了、每一处变化算修正还是回归**。
 *
 * 【判据形态（spec D-4 逐条）】
 *   ① 逐文件比对**多重集**（multiset）——**不去重**。去重会藏起「同一个 specifier 被重复捕获」
 *      这类假阳性，而那恰恰是正则版真实犯过的错（M5.1b 复验在 admin/campaigns/page.tsx 上
 *      实测到 re-export pattern 跨语句把下一条 import 重复计入，specifier 数 18 → 17）。
 *   ② 每处差异**逐条归因**：修正 / 回归 / 本仓不存在的写法。
 *   ③ 比对器**自身先做正负双向活性自测**，见 `selfTest()`。
 *
 * 【两侧实现都是机械抽取，不手抄】
 * 老实现从 git 对象库按 `--base` 取，新实现从工作树取，各自用同一个大括号配平抽取器切出函数体，
 * 再用 esbuild 把 TS 转成 JS 后求值。**手抄正则是本审计最容易翻车的地方**——抄错一个字符，
 * 结论就是关于一个从未存在过的实现的（M5.1b 复验方也是用 esbuild 机械抽取三版扫描器才敢下结论）。
 *
 * 用法：
 *   npm run census:scanner-equiv                 # 默认 base = 换代前那个 commit
 *   npm run census:scanner-equiv -- --base <rev> # 指定基线
 *   npm run census:scanner-equiv -- --verbose    # 打印每个有差异文件的逐条 specifier
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import ts from 'typescript';

/**
 * 换代前最后一个仍是正则实现的 commit（M5.1c 立项那次提交）。
 *
 * **必须钉死一个具体 rev，不能默认 HEAD。** 换代提交落地后 HEAD 上的实现就是新的，
 * 默认 HEAD 会让本脚本拿新实现和新实现比，稳定输出「0 分歧」——一个恒真的假结论。
 * 下面 `assertBaseIsRegexEra()` 把这件事从「记得别写错」升级成「写错就报错」。
 */
const DEFAULT_BASE = 'bf26603';
const SCANNER_FILE = 'tests/unit/db-layer-importer-census.test.ts';
const SRC_ROOT = 'src';

type Scanner = (source: string, fileName?: string) => string[];

// ── 机械抽取 ────────────────────────────────────────────────────────────

/** 从源码里按大括号配平切出一个具名函数（含函数头）。找不到即抛，不返回空串。 */
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`抽取失败：源码里找不到 function ${name}(`);
  const bodyStart = source.indexOf('{', start);
  if (bodyStart < 0) throw new Error(`抽取失败：${name} 找不到函数体起始括号`);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`抽取失败：${name} 的大括号未配平`);
}

/**
 * 把抽取到的 TS 函数文本编译并求值成可调用的 scanner。
 *
 * `ts` 以参数注入：新实现引用它，老实现不引用；统一注入省掉分支判断。
 */
function compileScanner(fnSources: string[], entry: string): Scanner {
  const tsSource = `${fnSources.join('\n\n')}\nreturn ${entry};`;
  const js = transformSync(tsSource, { loader: 'ts', format: 'cjs' }).code;
  // eslint-disable-next-line no-new-func -- 审计脚本，输入来自本仓自己的 git 对象与工作树
  return new Function('ts', js)(ts) as Scanner;
}

function gitShow(rev: string, path: string): string {
  return execFileSync('git', ['show', `${rev}:${path}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
}

/** 基线必须真是正则时代的实现——否则本审计比的是「新 vs 新」，恒 0 分歧。 */
function assertBaseIsRegexEra(baseSource: string, rev: string): void {
  const fn = extractFunction(baseSource, 'importSpecifiers');
  const markers = ['RegExpExecArray', 'patterns', 're.exec'];
  const missing = markers.filter((m) => !fn.includes(m));
  if (missing.length > 0) {
    throw new Error(
      `基线 ${rev} 的 importSpecifiers 不像正则实现（缺少标记：${missing.join(', ')}）。\n` +
        `本审计要求 base 指向**换代之前**的 commit；指向换代之后会让新旧两侧是同一份实现，` +
        `产出稳定的「0 分歧」假结论。`,
    );
  }
}

// ── 扫描面 ──────────────────────────────────────────────────────────────

function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSources(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** 多重集差集：返回 a 里有而 b 里少掉的那些（按出现次数算）。 */
function multisetDiff(a: readonly string[], b: readonly string[]): string[] {
  const remaining = [...b];
  const out: string[] = [];
  for (const item of a) {
    const at = remaining.indexOf(item);
    if (at >= 0) remaining.splice(at, 1);
    else out.push(item);
  }
  return out;
}

// ── 比对器活性自测（spec D-4 ③）────────────────────────────────────────

/**
 * 正负双向自测：
 *   正向 —— 喂一份**已知两侧会分歧**的输入，比对器必须报出差异；
 *   负向 —— 喂一份两侧一致的输入，比对器必须不报。
 * 只做负向等于没验：一个永远返回「无差异」的比对器也能通过负向。
 */
function selfTest(oldScan: Scanner, newScan: Scanner): void {
  // 正向探针：无空格写法。正则版 `\bimport\s+` 要求 import 后至少一个空白，抓不到；AST 抓得到。
  const probe = `import{a}from'./probe-known-divergence';`;
  const oldOut = oldScan(probe);
  const newOut = newScan(probe, 'probe.ts');
  const gained = multisetDiff(newOut, oldOut);
  const lost = multisetDiff(oldOut, newOut);
  if (gained.length === 0 && lost.length === 0) {
    throw new Error(
      `活性自测失败（正向）：已知会分歧的探针 \`${probe}\` 上，比对器报了「无差异」。\n` +
        `  老实现输出：${JSON.stringify(oldOut)}\n  新实现输出：${JSON.stringify(newOut)}\n` +
        `两侧很可能被编译成了同一份实现（抽取错了 / base 指错了），此时全仓「0 分歧」不成立。`,
    );
  }
  // 负向探针：最普通的静态 import，两侧都该抓到且只抓到它。
  const same = `import { a } from './same';`;
  const sOld = oldScan(same);
  const sNew = newScan(same, 'same.ts');
  if (multisetDiff(sOld, sNew).length > 0 || multisetDiff(sNew, sOld).length > 0) {
    throw new Error(
      `活性自测失败（负向）：两侧本该一致的输入上报出了差异。\n` +
        `  老：${JSON.stringify(sOld)}  新：${JSON.stringify(sNew)}`,
    );
  }
  process.stdout.write(
    `[自测] 正向 ✓（探针 ${JSON.stringify(probe)}：老=${JSON.stringify(oldOut)} 新=${JSON.stringify(newOut)}）\n` +
      `[自测] 负向 ✓（两侧一致的输入未误报）\n\n`,
  );
}

// ── 主流程 ──────────────────────────────────────────────────────────────

function main(): void {
  const argv = process.argv.slice(2);
  const baseIdx = argv.indexOf('--base');
  const base = baseIdx >= 0 ? argv[baseIdx + 1] : DEFAULT_BASE;
  const verbose = argv.includes('--verbose');

  const baseSource = gitShow(base, SCANNER_FILE);
  assertBaseIsRegexEra(baseSource, base);
  const oldScan = compileScanner(
    [extractFunction(baseSource, 'stripComments'), extractFunction(baseSource, 'importSpecifiers')],
    'importSpecifiers',
  );

  const headSource = readFileSync(SCANNER_FILE, 'utf8');
  const newScan = compileScanner([extractFunction(headSource, 'importSpecifiers')], 'importSpecifiers');

  process.stdout.write(
    `扫描器等价性审计（M5.1c F001 / spec D-4）\n` +
      `  基线（正则）：${base}:${SCANNER_FILE}\n` +
      `  当前（AST）：工作树 ${SCANNER_FILE}\n\n`,
  );
  selfTest(oldScan, newScan);

  const files = collectSources(SRC_ROOT);
  let totalOld = 0;
  let totalNew = 0;
  const diffs: { file: string; gained: string[]; lost: string[] }[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const o = oldScan(source);
    const n = newScan(source, file);
    totalOld += o.length;
    totalNew += n.length;
    const gained = multisetDiff(n, o);
    const lost = multisetDiff(o, n);
    if (gained.length > 0 || lost.length > 0) diffs.push({ file, gained, lost });
  }

  process.stdout.write(
    `扫描面：${files.length} 个 .ts/.tsx\n` +
      `specifier 总数（多重集，未去重）：老 ${totalOld} / 新 ${totalNew}\n` +
      `有差异的文件：${diffs.length}\n\n`,
  );

  if (diffs.length === 0) {
    process.stdout.write('✓ 全仓 src/ 逐文件多重集完全一致——换代未改变对真实代码的扫描结果。\n');
  } else {
    process.stdout.write('逐条差异（需人工归因：修正 / 回归 / 本仓不存在的写法）：\n');
    for (const d of diffs) {
      process.stdout.write(`\n  ${d.file}\n`);
      if (d.gained.length > 0) process.stdout.write(`    新增捕获：${d.gained.join(', ')}\n`);
      if (d.lost.length > 0) process.stdout.write(`    不再捕获：${d.lost.join(', ')}\n`);
    }
    process.stdout.write('\n');
  }

  if (verbose) {
    process.stdout.write('\n[verbose] 每个文件的 specifier 数（老 / 新）：\n');
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      process.stdout.write(
        `  ${oldScan(source).length.toString().padStart(3)} / ${newScan(source, file).length.toString().padStart(3)}  ${file}\n`,
      );
    }
  }

  process.exitCode = diffs.length === 0 ? 0 : 1;
}

main();
