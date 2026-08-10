/**
 * M5.1c rv1 回归 · 探针 P2：GUARDED 期望清单在两个口径上均逐字未变。
 * 口径 1：修复前基线 bb28842 → HEAD
 * 口径 2：本批起点 bf26603（立项）→ HEAD   ——「不得变更」在本批全程都成立
 * 判据：抽出 `const GUARDED ... ];` 整块做 sha256 比对（不是眼看 diff）。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';
const REVS = ['bf26603', 'bb28842', 'fc2dd20', 'HEAD'];

function blockAt(rev) {
  const src = execFileSync('git', ['show', `${rev}:${FILE}`], { encoding: 'utf8' });
  const start = src.indexOf('const GUARDED');
  if (start < 0) return null;
  // 到该块结束的 `];`（行首两字符）为止
  const endRel = src.slice(start).indexOf('\n];');
  if (endRel < 0) return null;
  return src.slice(start, start + endRel + 3);
}

const rows = [];
for (const rev of REVS) {
  const b = blockAt(rev);
  const sha = b ? createHash('sha256').update(b).digest('hex').slice(0, 16) : 'ABSENT';
  rows.push([rev, sha, b ? b.split('\n').length : 0]);
}
console.log('rev        sha256(前16)      行数');
for (const [r, s, n] of rows) console.log(`${r.padEnd(10)} ${s.padEnd(17)} ${n}`);

const uniq = new Set(rows.map((r) => r[1]));
console.log(`\nDISTINCT_HASHES=${uniq.size}  → ${uniq.size === 1 ? 'GUARDED 全程逐字未变' : 'GUARDED 发生过变更！'}`);

// 活性自测：判据必须能看见「真的改了一个字符」这件事
const head = blockAt('HEAD');
const mutated = head.replace("'src/lib/agent/context.ts'", "'src/lib/agent/context2.ts'");
const same = createHash('sha256').update(head).digest('hex');
const diff = createHash('sha256').update(mutated).digest('hex');
console.log(
  `SELFTEST: 人为改一条期望路径 → hash ${same === diff ? '相同（判据是死的！）' : '不同（判据活）'}`,
);
