// 签收方自做变异 —— 打在两处「最可能藏恒绿假保证」的位置：
//
//   SG-M1【现实侧 · 两路复验都没打过】src/ 里真冒出一个未登记的 importer，钉必须红并点名。
//         此前所有变异要么改**实现**（摘 visitor 分支），要么改**期望常量**（GUARDED 里增删），
//         没有一条从**现实侧**打：这道钉的生产用途正是「现实变了要红」。
//         探针刻意用 .tsx + 动态 import(@/…) + 静态裸路径三种形态，一并压 ScriptKind 与归一路径。
//
//   SG-M2a【判据整类失效】importSpecifiers 对全部 .tsx 返回 []（模拟 ScriptKind 类回归）。
//   SG-M2b【判据单文件失效 · 非登记文件】只对一个未登记文件返回 []，量这道钉的真实射程。
//
// 纪律：变异一律「反向编辑 + sha256 逐位对账」还原，**不使用 git checkout**；
//       新建探针文件用 unlinkSync 删除，并以 src/ 全量跟踪文件内容清单哈希前后对账。

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';

const TEST = 'tests/unit/db-layer-importer-census.test.ts';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function srcInventory() {
  const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' }).trim().split('\n');
  const h = createHash('sha256');
  for (const f of files) h.update(f).update(readFileSync(f));
  return { count: files.length, hash: h.digest('hex').slice(0, 24) };
}

function runCensus(label) {
  let out = '';
  let code = 0;
  try {
    out = execFileSync(
      'npx',
      ['vitest', 'run', TEST, '--reporter=verbose'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } },
    );
  } catch (e) {
    out = `${e.stdout || ''}${e.stderr || ''}`;
    code = e.status ?? 1;
  }
  const m = out.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed(?: \| (\d+) skipped)?\s+\((\d+)\)/);
  const failed = m ? Number(m[1] || 0) : null;
  const total = m ? Number(m[4]) : null;
  const redNames = [...out.matchAll(/^\s*[×✗]\s+(.+?)(?:\s+\d+ms)?$/gm)].map((x) => x[1].trim());
  const named = [...out.matchAll(/未登记的特权连接使用点：(\S+)|importer 清单漂了/g)].length;
  console.log(
    `  [${label}] exit=${code}  ${
      total === null ? '★ 解析不出计数（可能是收集期抛 = 文件级红）' : `红 ${failed} / 跑 ${total}`
    }`,
  );
  for (const n of new Set(redNames)) console.log(`      × ${n}`);
  return { code, out, failed, total, named };
}

const mode = process.argv[2] || 'all';
console.log(`基线 sha256(${TEST}) = ${sha(TEST)}`);
const inv0 = srcInventory();
console.log(`基线 src/ 跟踪文件 ${inv0.count} 个，清单哈希 ${inv0.hash}`);
const base = runCensus('基线');
if (base.failed !== 0) {
  console.error('基线不是全绿，拒绝在红基线上打变异（exit 2）');
  process.exit(2);
}
const baseSha = sha(TEST);

// ───────────────────────── SG-M1：现实侧注入 ─────────────────────────
if (mode === 'all' || mode === 'm1') {
  console.log('\n=== SG-M1 现实侧：src/ 冒出未登记 importer（.tsx + 动态 import + 裸路径静态 import）===');
  const probeDir = 'src/lib/agent';
  const probe = `${probeDir}/__signoff_probe.tsx`;
  if (existsSync(probe)) throw new Error('探针文件已存在，中止');
  if (!existsSync(probeDir)) mkdirSync(probeDir, { recursive: true });
  writeFileSync(
    probe,
    [
      '// 签收方临时探针（SG-M1）。用后即删。',
      "import { getRuntimeDb } from 'lib/db/runtime';",
      '',
      'export async function backdoor() {',
      "  const m = await import('@/lib/db/privileged');",
      '  return [getRuntimeDb, m];',
      '}',
      '',
      'export const Probe = () => <div>probe</div>;',
      '',
    ].join('\n'),
  );
  console.log(`  已写入 ${probe}（未跟踪新文件）`);
  const r = runCensus('SG-M1');
  const hitPriv = /privileged 的 importer 清单漂了[\s\S]*?__signoff_probe/.test(r.out);
  const hitRun = /runtime 的 importer 清单漂了[\s\S]*?__signoff_probe/.test(r.out);
  console.log(`  报文点名探针文件：privileged 清单=${hitPriv ? '是' : '否'}  runtime 清单=${hitRun ? '是' : '否'}`);
  const multiOut = r.out.match(/多出（未登记的 importer）：.*/g);
  for (const l of new Set(multiOut || [])) console.log(`      ${l}`);
  unlinkSync(probe);
  console.log('  探针已删除（unlinkSync，未用 git checkout）');
  const inv1 = srcInventory();
  console.log(
    `  收尾：src/ 跟踪文件 ${inv1.count} 个，清单哈希 ${inv1.hash} —— 与基线 ${
      inv1.hash === inv0.hash && inv1.count === inv0.count ? '逐位一致 OK' : '★不一致'
    }`,
  );
}

// ───────────────────────── SG-M2：判据侧致盲 ─────────────────────────
const ANCHOR = `function importSpecifiers(source: string, fileName = 'scan.ts'): string[] {`;
function mutate(label, injected, expectRed) {
  console.log(`\n=== ${label} ===`);
  const before = readFileSync(TEST, 'utf8');
  const hits = before.split(ANCHOR).length - 1;
  console.log(`  锚点命中次数 = ${hits}${hits === 1 ? '' : ' ★ 必须恰好 1 次，中止'}`);
  if (hits !== 1) process.exit(3);
  const mutated = before.replace(ANCHOR, ANCHOR + '\n' + injected);
  writeFileSync(TEST, mutated);
  const shaMut = sha(TEST);
  if (shaMut === baseSha) {
    console.error('  ★ 变异后哈希未变 —— 空操作变异，中止（exit 4）');
    process.exit(4);
  }
  console.log(`  变异后 sha256 = ${shaMut}（确已改变）`);
  const r = runCensus(label);
  writeFileSync(TEST, before); // 反向编辑还原
  const shaBack = sha(TEST);
  console.log(
    `  还原后 sha256 = ${shaBack}  ${shaBack === baseSha ? '✓ 与基线逐位一致' : '★ 对账失败'}`,
  );
  if (shaBack !== baseSha) process.exit(5);
  console.log(`  预期：${expectRed}`);
  return r;
}

if (mode === 'all' || mode === 'm2') {
  mutate(
    'SG-M2a 判据对全部 .tsx 致盲（模拟 ScriptKind 类整类回归）',
    "  if (fileName.endsWith('.tsx')) return [];",
    '若这道钉对「整类文件解析失效」有鉴别力 → 应红',
  );
  mutate(
    'SG-M2b 判据只对一个未登记文件致盲（src/lib/agent/orchestrator.ts）',
    "  if (fileName === 'src/lib/agent/orchestrator.ts') return [];",
    '若全绿 → 说明单文件恒盲只有落在两份 GUARDED 清单上才会被发现（射程实测）',
  );
  mutate(
    'SG-M2c 判据只对一个**已登记** importer 致盲（src/lib/auth/index.ts）',
    "  if (fileName === 'src/lib/auth/index.ts') return [];",
    '对照组：同样是单文件致盲，落在清单内应红',
  );
}

console.log(`\n最终 sha256(${TEST}) = ${sha(TEST)}`);
const invZ = srcInventory();
console.log(`最终 src/ 清单哈希 ${invZ.hash}（${invZ.count} 文件）`);
