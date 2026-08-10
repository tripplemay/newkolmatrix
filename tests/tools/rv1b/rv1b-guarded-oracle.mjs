/**
 * M5.1c rv1 回归 · 探针 P3：GUARDED「与实物相符」的**独立** oracle。
 *
 * 不 import 被验实现的任何函数。这里用一条与之无关的路径取 importer：
 *   对每个 src/ 文件跑 `tsc` 的**预处理器** ts.preProcessFile()（TS 内置的轻量扫描器，
 *   与被验实现走的 createSourceFile+forEachChild 是两套不同代码路径），
 *   再自己写归一化。若两者结论一致，说明「实测集合 == 期望」不是自证。
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { posix } from 'node:path';
import ts from 'typescript';

const SRC_ROOT = 'src';
const GUARDED = {
  'src/lib/db/runtime': [
    'src/instrumentation.ts',
    'src/lib/db/prisma.ts',
    'src/lib/db/tenant-scope.ts',
  ],
  'src/lib/db/privileged': [
    'src/app/api/auth/[...nextauth]/route.ts',
    'src/app/api/auth/register/route.ts',
    'src/lib/agent/context.ts',
    'src/lib/auth/index.ts',
    'src/lib/auth/register.ts',
  ],
};

function collect(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

/** 独立取值：TS 预处理器（不同于被验实现的 AST 遍历）。 */
function specsOf(file) {
  const text = readFileSync(file, 'utf8');
  const pp = ts.preProcessFile(text, /*readImportFiles*/ true, /*detectJavaScriptImports*/ true);
  return pp.importedFiles.map((f) => f.fileName);
}

function resolveToSrc(fromFile, spec) {
  let resolved;
  if (spec.startsWith('.')) resolved = normalize(join(dirname(fromFile), spec));
  else if (spec.startsWith('@/')) resolved = normalize(join(SRC_ROOT, spec.slice(2)));
  else if (/^[a-z]/i.test(spec) && !spec.startsWith('@')) resolved = normalize(join(SRC_ROOT, spec));
  else return null;
  return resolved.split(/[\\/]/).join(posix.sep).replace(/\.(ts|tsx)$/, '');
}

const files = collect(SRC_ROOT);
console.log(`src/ 文件数 = ${files.length}`);

let bad = 0;
for (const [mod, expected] of Object.entries(GUARDED)) {
  const actual = files
    .filter((f) => {
      const self = f.split(/[\\/]/).join(posix.sep).replace(/\.(ts|tsx)$/, '');
      if (self === mod) return false;
      return specsOf(f).some((s) => resolveToSrc(f, s) === mod);
    })
    .map((f) => f.split(/[\\/]/).join(posix.sep))
    .sort();
  const exp = [...expected].sort();
  const missing = exp.filter((f) => !actual.includes(f));
  const unexpected = actual.filter((f) => !exp.includes(f));
  const ok = missing.length === 0 && unexpected.length === 0;
  if (!ok) bad++;
  console.log(`\n【${mod}】 ${ok ? '相符 ✓' : '不符 ✗'}`);
  console.log(`  期望(${exp.length})：${exp.join(', ')}`);
  console.log(`  独立实测(${actual.length})：${actual.join(', ')}`);
  console.log(`  多出：${unexpected.join(', ') || '无'}   缺失：${missing.join(', ') || '无'}`);
}

// 活性自测：正向 —— 换一个已知在场的模块，oracle 必须能数出非空 importer
const probe = files.filter((f) => specsOf(f).some((s) => resolveToSrc(f, s) === 'src/lib/db/prisma'));
console.log(`\nSELFTEST 正向：import src/lib/db/prisma 的文件数 = ${probe.length}（须 >0）`);
// 活性自测：负向 —— 一个不存在的模块必须数出 0
const neg = files.filter((f) => specsOf(f).some((s) => resolveToSrc(f, s) === 'src/lib/db/__nope__'));
console.log(`SELFTEST 负向：import 一个不存在的模块的文件数 = ${neg.length}（须 =0）`);
console.log(`\nRESULT=${bad === 0 ? 'ALL_MATCH' : 'MISMATCH(' + bad + ')'}`);
