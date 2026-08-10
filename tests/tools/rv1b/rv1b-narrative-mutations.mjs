/**
 * M5.1c rv1 回归 · 探针 P6：叙述面守护（🔒① ② ②b ③ ④）在 HEAD 上的鉴别力复核。
 *
 * 覆盖 F002 acceptance ③「往现行叙述写回任一黑名单词 → 必须红并点名」的重放，
 * 以及 §2.4 鉴别力矩阵里第 19–21 条（负向断言，须用**写回禁词**的正向变异才能证活）。
 *
 * 被变异的是产品文件 src/lib/db/tenant-scope.ts —— **只在本进程内临时改写**，
 * 每条变异后立即反向编辑还原并做 sha256 逐位对账；**不使用 `git checkout`**。
 * 任一步锚点不唯一或还原后 sha 对不上 → 抛错中止，不留脏工作树。
 *
 * 用法：node tests/tools/rv1b/rv1b-narrative-mutations.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

const TARGET = 'src/lib/db/tenant-scope.ts';
const TESTFILE = 'tests/unit/db-layer-importer-census.test.ts';
const OUT = '/tmp/rv1b-narr-report.json';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const count = (hay, needle) => hay.split(needle).length - 1;

const BASELINE = sha(readFileSync(TARGET, 'utf8'));

/** 插入锚点：现行叙述里的一行普通注释（非 `// >`），恰好出现一次。 */
const ANCHOR = readFileSync(TARGET, 'utf8')
  .split('\n')
  .find((l) => l.trimStart().startsWith('//') && !l.trimStart().startsWith('// >') && l.length > 20);

if (!ANCHOR) throw new Error('找不到可用的现行叙述锚点');
if (count(readFileSync(TARGET, 'utf8'), ANCHOR) !== 1) {
  throw new Error(`锚点不唯一：${ANCHOR}`);
}
console.log(`插入锚点（现行叙述行，唯一）：${ANCHOR.trim().slice(0, 60)}…\n`);

const MUTATIONS = [
  // ── F002 ③ 重放：三个黑名单词逐个写回现行叙述 ──────────────
  { id: 'N1', desc: '黑名单词①「即红并点名」写回现行叙述', ins: '// 这道钉即红并点名，放心' },
  { id: 'N2', desc: '黑名单词②「不可能再对不上」写回现行叙述', ins: '// 声称与实际不可能再对不上' },
  { id: 'N3', desc: '黑名单词③「机械守住」写回现行叙述', ins: '// 本段陈述已由那组钉机械守住' },
  // ── 已登记盲区复核：同样的词写进 `// >` 更正行 → 按设计**不该**红 ──
  {
    id: 'N4',
    desc: '【盲区对照】同一个词写进 `// >` 更正行 → 按设计不红（S2 登记的已知盲区）',
    ins: '// > 上一版曾写「本段陈述已由那组钉机械守住」，实测为假',
    expectRed: false,
  },
  // ── 矩阵第 19–21 条：三条被证伪陈述 / 计数 / 政策句 ──────────
  { id: 'N5', desc: '🔒② 复活被证伪陈述①「只交付单层语义」', ins: '// 本模块此刻只交付单层语义' },
  { id: 'N6', desc: '🔒② 复活被证伪陈述②「零 withTenant 调用点」', ins: '// 产品代码零 withTenant 调用点' },
  { id: 'N7', desc: '🔒② 复活被证伪陈述③「没有嵌套守卫」', ins: '// 现在没有嵌套守卫' },
  { id: 'N8', desc: '🔒③ 写回会漂的计数「15 处 withTenant 调用点」', ins: '// 批末实测 15 处 withTenant 调用点' },
];

function runVitest() {
  if (existsSync(OUT)) rmSync(OUT);
  let exitCode = 0;
  try {
    execFileSync('npx', ['vitest', 'run', TESTFILE, '--reporter=json', `--outputFile=${OUT}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    exitCode = e.status ?? -1;
  }
  let json = null;
  try {
    json = JSON.parse(readFileSync(OUT, 'utf8'));
  } catch {
    /* ignore */
  }
  const a = json?.testResults?.flatMap((t) => t.assertionResults ?? []) ?? [];
  const failed = a.filter((x) => x.status === 'failed');
  return {
    exitCode,
    ran: a.length,
    failed: failed.map((x) => x.title),
    messages: failed.flatMap((x) => x.failureMessages ?? []),
  };
}

// 基线自测：未变异必须全绿
{
  const r = runVitest();
  console.log(`[基线] ${TARGET} sha=${BASELINE.slice(0, 16)}…  跑 ${r.ran} 条  红 ${r.failed.length} 条`);
  if (r.failed.length !== 0) throw new Error('基线不绿，仪器不可用');
  console.log();
}

const results = [];
for (const m of MUTATIONS) {
  const before = readFileSync(TARGET, 'utf8');
  if (sha(before) !== BASELINE) throw new Error(`${m.id} 开跑前 sha 已偏离基线`);

  const replacement = `${ANCHOR}\n${m.ins}`;
  writeFileSync(TARGET, before.replace(ANCHOR, replacement));
  const mutSha = sha(readFileSync(TARGET, 'utf8'));
  if (mutSha === BASELINE) throw new Error(`${m.id} 变异未生效`);

  const r = runVitest();

  // 反向编辑还原
  const mutated = readFileSync(TARGET, 'utf8');
  if (count(mutated, replacement) !== 1) throw new Error(`${m.id} 还原锚点不唯一`);
  writeFileSync(TARGET, mutated.replace(replacement, ANCHOR));
  const after = sha(readFileSync(TARGET, 'utf8'));
  if (after !== BASELINE) throw new Error(`${m.id} 还原失败：${after}`);

  const wantRed = m.expectRed !== false;
  const gotRed = r.failed.length > 0;
  const ok = wantRed === gotRed;
  results.push({ ...m, ...r, ok });

  console.log(`${m.id}  ${m.desc}`);
  console.log(`     插入：${m.ins}`);
  console.log(`     → 红 ${r.failed.length} / 跑 ${r.ran}   期望${wantRed ? '红' : '不红'} → ${ok ? '符合 ✓' : '不符 ✗'}`);
  for (const t of r.failed) console.log(`       红：${t}`);
  // 「点名」的证据：失败信息里必须出现被写回的那个词
  for (const msg of r.messages.slice(0, 1)) {
    const firstLine = msg.split('\n').find((l) => l.includes('出现') || l.includes('复活') || l.includes('：'));
    if (firstLine) console.log(`       点名：${firstLine.trim().slice(0, 150)}`);
  }
  console.log(`     还原 ✓ sha 回到基线 ${after.slice(0, 16)}…`);
  console.log();
}

console.log('=== 汇总 ===');
for (const r of results) console.log(`${r.id.padEnd(4)} ${r.ok ? 'OK  ' : 'FAIL'} 红${String(r.failed.length).padEnd(2)} ${r.desc}`);
const finalSha = sha(readFileSync(TARGET, 'utf8'));
console.log(`\n${TARGET}\nsha256 = ${finalSha}`);
console.log(finalSha === BASELINE ? '✓ 与基线逐位相同（产品文件已还原，工作树干净）' : '✗ 已脏！');
console.log(`\nRESULT=${results.every((r) => r.ok) ? 'ALL_AS_EXPECTED' : 'MISMATCH'}`);
