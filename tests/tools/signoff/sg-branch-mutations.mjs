// 签收方独立重算：摘掉五个 visitor 分支各红几条（文件注释 :253-254 写「6 · 2 · 1 · 4 · 1」）。
// 锚点自写（用 `if (false && …)` 短路，不删代码），与交付台/两路复验方的改法都不同。
// 还原：反向编辑 + sha256 逐位对账，不使用 git checkout。

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const TEST = 'tests/unit/db-layer-importer-census.test.ts';
const sha = () => createHash('sha256').update(readFileSync(TEST)).digest('hex');

const BRANCHES = [
  ['① ImportDeclaration', 'if (ts.isImportDeclaration(node)) {'],
  ['② ExportDeclaration', '} else if (ts.isExportDeclaration(node)) {'],
  ['③ ImportEqualsDeclaration', '} else if (ts.isImportEqualsDeclaration(node)) {'],
  ['④ 动态 import()', 'const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;'],
  ['⑤ CJS require()', "const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';"],
];

function run() {
  let out = '';
  let code = 0;
  try {
    out = execFileSync('npx', ['vitest', 'run', TEST, '--reporter=verbose'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`;
    code = e.status ?? 1;
  }
  const m = out.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed(?:[^(]*)\((\d+)\)/);
  if (!m) return { code, failed: null, total: null, names: [], raw: out };
  const names = [...out.matchAll(/^\s*[×✗]\s+.*?>\s*([^>]+?)(?:\s+\d+ms)?$/gm)].map((x) =>
    x[1].trim(),
  );
  return { code, failed: Number(m[1] || 0), total: Number(m[3]), names: [...new Set(names)] };
}

const base = sha();
console.log(`基线 sha256 = ${base}`);
const b = run();
console.log(`[基线] 红 ${b.failed} / 跑 ${b.total}（必须 0 红，否则中止）`);
if (b.failed !== 0) process.exit(2);

for (const [label, anchor] of BRANCHES) {
  const before = readFileSync(TEST, 'utf8');
  const hits = before.split(anchor).length - 1;
  if (hits !== 1) {
    console.log(`\n${label}：锚点命中 ${hits} 次 ★ 必须恰好 1 次 —— 中止`);
    process.exit(3);
  }
  const to = anchor.startsWith('const ')
    ? anchor.replace(/= /, '= false && ')
    : anchor.replace('if (', 'if (false && ');
  const mutated = before.replace(anchor, to);
  writeFileSync(TEST, mutated);
  if (sha() === base) {
    console.log(`\n${label}：变异后哈希未变 ★ 空操作 —— 中止`);
    process.exit(4);
  }
  const r = run();
  writeFileSync(TEST, before);
  const ok = sha() === base;
  console.log(
    `\n摘 ${label} → ${
      r.failed === null ? '★文件级红（解析不出计数）' : `红 ${r.failed} / 跑 ${r.total}`
    }   还原对账 ${ok ? '✓' : '★失败'}`,
  );
  for (const n of r.names) console.log(`     × ${n}`);
  if (!ok) process.exit(5);
}
console.log(`\n最终 sha256 = ${sha()}  ${sha() === base ? '✓ 逐位回到基线' : '★ 不一致'}`);
