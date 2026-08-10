/**
 * M5.1c rv1 回归 · 探针 P7：F002 ③ 的「保留」半边 —— 🔒④ 黑名单与 FALSIFIED_CLAIMS
 * 在本批全程逐字未动（「复核鉴别力」半边见 P6）。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';
const REVS = ['bf26603', '8cc63d2', 'bb28842', 'fc2dd20', 'HEAD'];

function slice(src, startMark, endMark) {
  const i = src.indexOf(startMark);
  if (i < 0) return null;
  const j = src.indexOf(endMark, i);
  if (j < 0) return null;
  return src.slice(i, j + endMark.length);
}

const BLOCKS = [
  { name: '🔒④ 黑名单字面量', start: "const overclaims = [", end: '].filter' },
  { name: 'FALSIFIED_CLAIMS 数组', start: 'const FALSIFIED_CLAIMS', end: '\n];' },
];

for (const b of BLOCKS) {
  console.log(`【${b.name}】`);
  const hashes = [];
  for (const rev of REVS) {
    const src = execFileSync('git', ['show', `${rev}:${FILE}`], { encoding: 'utf8' });
    const blk = slice(src, b.start, b.end);
    const h = blk ? createHash('sha256').update(blk).digest('hex').slice(0, 16) : 'ABSENT';
    hashes.push(h);
    console.log(`  ${rev.padEnd(9)} ${h}`);
  }
  if (hashes.includes('ABSENT')) {
    console.log('  ⚠ 有版本抽不到该块 —— 判据锚点失效，读数无意义，中止');
    process.exit(2);
  }
  const uniq = new Set(hashes);
  console.log(`  DISTINCT=${uniq.size} → ${uniq.size === 1 ? '全程逐字未变 ✓' : '变过 ⚠'}\n`);
}

// 黑名单当前实物
const head = execFileSync('git', ['show', `HEAD:${FILE}`], { encoding: 'utf8' });
console.log('黑名单实物（HEAD）：');
console.log('  ' + slice(head, 'const overclaims = [', '].filter'));

// 活性自测
const blk = slice(head, 'const overclaims = [', '].filter');
const mut = blk.replace('机械守住', '机械守住X');
console.log(
  `\nSELFTEST：改黑名单里一个字 → hash ${
    createHash('sha256').update(blk).digest('hex') === createHash('sha256').update(mut).digest('hex')
      ? '相同（判据死）'
      : '不同（判据活）'
  }`,
);
