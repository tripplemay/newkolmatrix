/**
 * 复验 1 独立取证工具 D：**不复用交付方 / 首轮对抗复核的 adv-f002-* 脚本**，
 * 直接把探针文件注进 `src/`，跑**真正那道钉**（bootstrap-whitelist-census.test.ts），看它红不红。
 *
 * 为什么不信 `adv-f002-blindspots.mjs`：那个脚本里的 `usesPrivileged` 是**重新实现**的判据副本。
 * 副本与本尊若有出入，「被抓到 4 / 能绕过 1」就可能是副本的性质、而不是那道钉的性质。
 * 端到端跑真钉没有这个问题。
 *
 * 安全约束：探针文件用后必删；每轮结束比对 `src/` 全量跟踪文件的**清单哈希**，
 * 与基线不符即报错。全程不改任何既有产品文件。
 *
 * 用法：node tests/tools/rv1/rv1-f002-e2e.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const NAIL = 'tests/unit/bootstrap-whitelist-census.test.ts';
const PROBE = 'src/lib/db/__rv1_probe.ts';

/** src/ 全量跟踪文件的清单哈希（内容 + 路径），用于证明探针未留痕 */
function srcManifest() {
  const files = execFileSync('git', ['ls-files', 'src/'], { encoding: 'utf8' }).trim().split('\n');
  const h = createHash('sha256');
  for (const f of files) h.update(f).update(createHash('sha256').update(readFileSync(f)).digest());
  return { count: files.length, hash: h.digest('hex') };
}

function runNail() {
  const r = spawnSync('npx', ['vitest', 'run', NAIL], { encoding: 'utf8' });
  const out = `${r.stdout}${r.stderr}`;
  const m = out.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed/);
  const named = out.includes(PROBE.replace('src/', '')) || out.includes('__rv1_probe');
  return {
    exit: r.status,
    failed: m && m[1] ? Number(m[1]) : 0,
    passed: m ? Number(m[2]) : 0,
    // 抓出断言消息里的关键行
    msg: (out.match(/发现[^\n]*特权连接使用点[^\n]*/) || [''])[0],
    namesProbe: named,
    raw: out,
  };
}

const PROBES = [
  ['1  `import * as ns` 后 `ns.privilegedDb`',
    `import * as ns from './privileged';\nexport async function f() { return ns.privilegedDb; }\n`],
  ['2  重命名 import（as backdoor）',
    `import { privilegedDb as backdoor } from './privileged';\nexport async function f() { return backdoor; }\n`],
  ['3  动态 import() 后取属性',
    `export async function f() { const m = await import('./privileged'); return m.privilegedDb; }\n`],
  ['4  顶部仍有 import 的动态键取用',
    `import { privilegedDb } from './privileged';\nexport async function f() { const k = 'privilegedDb'; const m: any = { privilegedDb }; return m[k]; }\n`],
  ['5  拼接键动态取用（标识符从不作为完整 token 出现）',
    "export async function f() { const KEY = 'privileged' + 'Db'; const m: any = await import('./privileged'); return m[KEY]; }\n"],
];

const baseManifest = srcManifest();
console.log(`基线：src/ 跟踪文件 ${baseManifest.count} 个，清单哈希 ${baseManifest.hash.slice(0, 24)}`);
if (existsSync(PROBE)) throw new Error('探针路径已被占用，中止');

const base = runNail();
console.log(`基线跑钉：${base.passed} passed / ${base.failed} failed (exit=${base.exit})`);
if (base.failed !== 0 || base.exit !== 0) {
  console.error('基线就不绿，后续判定无意义，中止');
  process.exit(2);
}
console.log('');

const results = [];
try {
  for (const [label, body] of PROBES) {
    writeFileSync(PROBE, body);
    const r = runNail();
    unlinkSync(PROBE);
    const m = srcManifest();
    if (m.hash !== baseManifest.hash) {
      console.error(`探针 ${label} 后 src/ 清单哈希未回到基线，中止`);
      process.exit(3);
    }
    const caught = r.failed > 0;
    console.log(`${caught ? '被抓到  ' : '⚠ 绕过了钉'}  ${label}`);
    console.log(`      钉的结果：${r.passed} passed / ${r.failed} failed (exit=${r.exit})`);
    if (r.msg) console.log(`      断言消息：${r.msg.trim().slice(0, 120)}`);
    console.log(`      断言消息里是否点了探针文件的名：${r.namesProbe ? '是' : '否'}`);
    console.log('');
    results.push([label, caught, r.namesProbe]);
  }
} finally {
  if (existsSync(PROBE)) unlinkSync(PROBE);
}

const caught = results.filter((r) => r[1]).length;
const bypass = results.length - caught;
const fin = srcManifest();
console.log(`小计：被抓到 ${caught} 种 / 能绕过 ${bypass} 种（共 ${results.length} 种）`);
console.log(`收尾：src/ 跟踪文件 ${fin.count} 个，清单哈希 ${fin.hash.slice(0, 24)} —— 与基线 ${fin.hash === baseManifest.hash ? '逐位一致 OK' : 'FAIL'}`);
console.log(`探针文件残留：${existsSync(PROBE) ? '有 ⚠' : '无'}`);
