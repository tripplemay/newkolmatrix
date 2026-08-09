/**
 * M5.1c F002 独立验收 —— 变异证活夹具（注入 → 实跑 → 反向编辑还原 → shasum 逐位对账）
 *
 * 铁律：**不得用 `git checkout` 还原**。本夹具一律以「反向字符串替换」还原，并在还原后
 * 重新计算 sha256 与注入前的基线比对；不一致则以非零码退出并大声报警。
 *
 * 用法：
 *   npx tsx scripts/test/m51c-f002-mutate.ts <file> <anchor> <injected> <testfile> [label]
 *     file      被变异的文件
 *     anchor    锚点（文件中必须唯一出现一次）
 *     injected  注入内容（会被插到 anchor 之后）
 *     testfile  要跑的 vitest 目标（传 'ALL' 则跑全量 unit）
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [file, anchor, injected, testTarget, label = ''] = process.argv.slice(2);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const before = readFileSync(file, 'utf8');
const shaBefore = sha(before);
console.log(`=== MUTATION ${label} ===`);
console.log(`file      : ${file}`);
console.log(`sha BEFORE: ${shaBefore}`);

const occurrences = before.split(anchor).length - 1;
if (occurrences !== 1) {
  console.error(`ABORT: anchor 在文件中出现 ${occurrences} 次，必须恰好 1 次`);
  process.exit(2);
}

// MODE=replace → 用 injected **替换** anchor（用于「摘掉某行/改写某行」型变异）；
// 默认 append → 把 injected 插到 anchor 之后（用于「写回某句话」型变异）。
const REPLACE = process.env.MODE === 'replace';
const mutatedFragment = REPLACE ? injected : anchor + injected;
const mutated = before.replace(anchor, mutatedFragment);
writeFileSync(file, mutated);
console.log(`sha MUTATED: ${sha(readFileSync(file, 'utf8'))}`);
console.log(`injected  : ${JSON.stringify(injected)}`);

let out = '';
try {
  const args = testTarget === 'ALL' ? ['vitest', 'run'] : ['vitest', 'run', testTarget];
  const r = spawnSync('npx', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
  out = (r.stdout ?? '') + (r.stderr ?? '');
  console.log(`--- vitest exit=${r.status} ---`);
} finally {
  // 反向编辑还原（**不是** git checkout）
  const cur = readFileSync(file, 'utf8');
  const restored = cur.replace(mutatedFragment, anchor);
  writeFileSync(file, restored);
  const shaAfter = sha(readFileSync(file, 'utf8'));
  console.log(`sha AFTER : ${shaAfter}`);
  if (shaAfter !== shaBefore) {
    console.error('!!! RESTORE MISMATCH — 文件未逐位还原 !!!');
    process.exitCode = 3;
  } else {
    console.log('RESTORE OK (sha256 逐位一致)');
  }
  // 再用 git 只读核对（不写盘）：确认工作树该文件与 HEAD 无差异
  try {
    const d = execFileSync('git', ['diff', '--stat', '--', file], { encoding: 'utf8' }).trim();
    console.log(`git diff --stat -- ${file} => ${d === '' ? '(空，与 HEAD 一致)' : d}`);
  } catch {
    /* ignore */
  }
}

// 结论行 —— 刻意同时打印 "Test Files"/"Tests" 两行的**原文**，
// 因为收集期抛错时 vitest 会打 "Tests  no tests"，只匹配 "N failed | M passed" 会把
// 「变异根本没跑起来」误读成「无鉴别力」（M5.1c generator 自陈踩过的仪器坑，本夹具不复现）。
const lines = out.split('\n');
const summary = lines.filter((l) => /^\s*(Test Files|Tests|Errors)\s/.test(l));
const failed = lines.filter((l) => /(^|\s)(×|FAIL|AssertionError|Unhandled)/.test(l));
console.log('--- vitest summary 原文 ---');
console.log(summary.join('\n') || '(未捕获到 summary 行 —— 下面打印尾部原文)');
if (summary.length === 0) console.log(lines.slice(-40).join('\n'));
console.log('--- 红条 / 报错行（前 40）---');
console.log(failed.slice(0, 40).join('\n') || '(无)');
