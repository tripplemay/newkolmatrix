/**
 * M5.1c rv1 回归 · 探针 P8：F002 ② 的重放 ——「`// >` 历史更正记录不得被抹掉」。
 *
 * fix 轮（9922206）**改写了两行既有 `// >`**，这正是本条的风险面：
 * 若旧措辞就此消失，等于「为了清理而抹掉历史」。逐行核对每一条在基线存在的
 * `// >` 行，其实质内容在 HEAD 上是否仍可寻得（原样保留 or 被新更正段原文引用）。
 */
import { execFileSync } from 'node:child_process';

const FILES = ['src/lib/db/privileged.ts', 'src/lib/db/tenant-scope.ts', 'src/lib/db/runtime.ts', 'src/lib/db/prisma.ts'];
const BASES = ['bf26603', 'bb28842', 'fc2dd20'];

const show = (rev, f) => {
  try {
    return execFileSync('git', ['show', `${rev}:${f}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};
const corrLines = (src) =>
  src.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('// >')).map((l) => l.replace(/^\/\/ >\s*/, '').trim()).filter(Boolean);

// 归一化：去掉 markdown 强调星号与「」引号，便于判断「实质内容是否仍在」
// 归一化须**去掉标点**：新更正段原文引用旧措辞时常省掉句末的 ；/。，
// 保留标点会把「已被原文引用」误报成「历史被抹掉」（本探针首版实测踩中一次）。
const norm = (s) =>
  s.replace(/\*\*/g, '').replace(/[「」『』]/g, '').replace(/[；;。，,、]/g, '').replace(/\s+/g, '');

let missingTotal = 0;
for (const base of BASES) {
  console.log(`\n########## 基线 ${base} → HEAD ##########`);
  for (const f of FILES) {
    const oldSrc = show(base, f);
    const newSrc = show('HEAD', f);
    if (!oldSrc || !newSrc) continue;
    const oldC = corrLines(oldSrc);
    const newAll = norm(newSrc);
    const missing = oldC.filter((l) => !newAll.includes(norm(l)));
    console.log(`  ${f}: 基线 ${oldC.length} 行 // >  → HEAD 中找不到实质内容的 ${missing.length} 行`);
    for (const m of missing) console.log(`      ✗ 丢失：${m.slice(0, 90)}`);
    missingTotal += missing.length;
  }
}

// 活性自测：判据必须能看见「真的删了一行历史」
console.log('\n=== 判据活性自测 ===');
const head = show('HEAD', 'src/lib/db/privileged.ts');
const oneLine = corrLines(head)[0];
const withoutIt = norm(head.split('\n').filter((l) => !l.includes(oneLine)).join('\n'));
console.log(`  正向：人为删掉一行 // > 后，判据${withoutIt.includes(norm(oneLine)) ? '仍看得见（死！）' : '看不见了（活）'}`);
console.log(`  负向：未删时判据看得见 = ${norm(head).includes(norm(oneLine))}`);

console.log(`\nRESULT=${missingTotal === 0 ? 'NO_HISTORY_ERASED' : 'ERASED(' + missingTotal + ')'}`);
