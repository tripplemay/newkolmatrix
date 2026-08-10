/**
 * M5.1c rv1 回归 · 探针 P4：AST 实现本体（importSpecifiers / resolveToSrcModule /
 * actualImporters / collectSources）在 fix 轮是否被改动。
 * 判据：抽函数体（去掉前导 JSDoc，只取 `function X(` 到配平右花括号）做 sha256。
 * 修复清单声明这几项「不动」，此处机械核对。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';
const FNS = ['importSpecifiers', 'resolveToSrcModule', 'actualImporters', 'collectSources'];
const REVS = ['e509e06', 'fc2dd20', 'HEAD'];

function bodyOf(src, fn) {
  const i = src.indexOf(`function ${fn}(`);
  if (i < 0) return null;
  let depth = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true; }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1); }
  }
  return null;
}

const table = {};
for (const rev of REVS) {
  const src = execFileSync('git', ['show', `${rev}:${FILE}`], { encoding: 'utf8' });
  table[rev] = FNS.map((fn) => {
    const b = bodyOf(src, fn);
    return b ? createHash('sha256').update(b).digest('hex').slice(0, 12) : 'ABSENT';
  });
}

console.log('函数'.padEnd(22) + REVS.map((r) => r.padEnd(14)).join(''));
FNS.forEach((fn, k) => {
  const row = REVS.map((r) => table[r][k]);
  const same = new Set(row).size === 1;
  console.log(fn.padEnd(22) + row.map((h) => h.padEnd(14)).join('') + (same ? ' 全程未变' : ' ⚠ 变过'));
});

// 活性自测：改一个字符必须让哈希变
const head = execFileSync('git', ['show', `HEAD:${FILE}`], { encoding: 'utf8' });
const b = bodyOf(head, 'importSpecifiers');
const m = b.replace('isStringLiteralLike', 'isStringLiteral');
console.log(
  `\nSELFTEST：把 isStringLiteralLike 改成 isStringLiteral → 哈希 ${
    createHash('sha256').update(b).digest('hex') === createHash('sha256').update(m).digest('hex')
      ? '相同（判据死）'
      : '不同（判据活）'
  }`,
);
