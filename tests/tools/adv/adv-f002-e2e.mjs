/**
 * 对抗复核工具 F：端到端证明「scanner 层判定」==「钉真的红/不红」
 *
 * 做法：把探针写成 src/ 下的临时文件 → 实跑那道钉 → 删除 → 逐位对账 src/ 无残留。
 * 不使用 git checkout；临时文件为**新增未跟踪**文件，删除即还原，另用全量哈希清单对账。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';

const NAIL = 'tests/unit/bootstrap-whitelist-census.test.ts';

function srcFingerprint() {
  const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(f);
    h.update(readFileSync(f));
  }
  return { count: files.length, hash: h.digest('hex') };
}

function runNail() {
  try {
    const out = execFileSync('npx', ['vitest', 'run', NAIL], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exit: 0, out };
  } catch (e) {
    return { exit: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function summarize(out) {
  const lines = out.split('\n');
  const keep = lines.filter((l) => /Tests\s+\d|Test Files\s+\d|未登记|AssertionError|×/.test(l));
  return keep.slice(0, 8).map((l) => `      ${l.trim()}`).join('\n');
}

const PROBES = [
  {
    file: 'src/__adv_probe_style1.ts',
    tag: '✅1 namespace import 后取属性（scanner 判：被抓到）',
    expectRed: true,
    body:
      '// 对抗复核临时探针（用完即删）\n' +
      "import * as ns from '@/lib/db/privileged';\n" +
      'export const c = ns.privilegedDb;\n',
  },
  {
    file: 'src/__adv_probe_style5.ts',
    tag: '❌5 拼接键动态取用（scanner 判：绕过）',
    expectRed: false,
    body:
      '// 对抗复核临时探针（用完即删）\n' +
      "const KEY = 'privileged' + 'Db';\n" +
      "export const load = async () => (await import('@/lib/db/privileged'))[KEY];\n",
  },
];

const before = srcFingerprint();
console.log(`=== 基线：src/ 跟踪文件 ${before.count} 个，清单哈希 ${before.hash.slice(0, 16)}… ===\n`);

const base = runNail();
console.log(`[对照] 未注入任何探针时，那道钉：exit=${base.exit}`);
console.log(summarize(base.out));
console.log();

for (const p of PROBES) {
  writeFileSync(p.file, p.body, 'utf8');
  const r = runNail();
  const red = r.exit !== 0;
  const named = r.out.includes(p.file);
  console.log(`● ${p.tag}`);
  console.log(
    `   注入 ${p.file} → 钉 exit=${r.exit}  ⇒ ${red ? '🔴 红' : '🟢 未红'}${named ? '（报文点名该文件）' : ''}`,
  );
  console.log(summarize(r.out));
  console.log(
    `   预期 ${p.expectRed ? '红' : '不红'} ⇒ ${red === p.expectRed ? 'PASS 与 scanner 层判定一致' : 'FAIL 端到端与 scanner 层不一致'}`,
  );
  unlinkSync(p.file);
  console.log(`   已删除 ${p.file}（存在=${existsSync(p.file)}）\n`);
}

const after = srcFingerprint();
console.log('=== 收尾对账 ===');
console.log(`  src/ 跟踪文件 ${after.count} 个，清单哈希 ${after.hash.slice(0, 16)}…`);
console.log(
  `  与基线逐位一致 ⇒ ${before.hash === after.hash && before.count === after.count ? 'PASS 产品代码零残留' : 'FAIL 有残留'}`,
);
const st = execFileSync('git', ['status', '--short', 'src'], { encoding: 'utf8' });
console.log(`  git status --short src ⇒ ${st.trim() === '' ? '(空)' : st}`);
