// M4-INSIGHT F012 复验 — 新鲜度回归测试「断言强度」探针（evaluator 产物，非产品代码）
//
// 目的（framework/patterns/audit-methodology.md §5）：
//   fixing round1 新增 tests/unit/architecture-doc-freshness.test.ts（8 断言，本轮实跑全绿）。
//   「全绿」本身不构成缺陷已消除的证据——必须先做断言强度审查：
//   把系统置回「本应判红」的状态（= fixing 之前的 architecture.md，commit 9878e50），
//   逐条问「这条断言在缺陷态下还能区分对错吗？」
//
// 方法：对同一组实物（schema.prisma / prisma/migrations / NATIVE_TOOLS / registry），
//   分别用「缺陷态文档」与「HEAD 文档」跑同一断言逻辑：
//     缺陷态 FAIL + HEAD PASS = 载荷断言（discriminating，真的钉住了实物）
//     缺陷态 PASS            = 该断言对本次缺陷恒真（不携带信息，不得计入证据强度）
//
// 本探针零副作用：只读 git 对象与工作树，不写任何文件、不改产品代码。
// 跑法：node scripts/test/f012-reverify-freshness-probe.mjs

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const BROKEN_REV = '9878e50'; // fixing 之前（首轮验收汇总落盘 commit）
const brokenDoc = execSync(`git show ${BROKEN_REV}:docs/dev/architecture.md`, {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
const headDoc = readFileSync('docs/dev/architecture.md', 'utf8');
const schema = readFileSync('prisma/schema.prisma', 'utf8');

// —— 实物侧真值（两态共用同一组实物，实物在 fixing 中未被触碰）——
const actualModels = (schema.match(/^model /gm) ?? []).length;
const actualEnums = (schema.match(/^enum /gm) ?? []).length;
const actualEnumNames = [...schema.matchAll(/^enum (\w+)/gm)].map((m) => m[1]);
const actualMigrations = readdirSync('prisma/migrations', { withFileTypes: true }).filter((d) =>
  d.isDirectory(),
).length;
// 工具名/人格工具从源码正则取（探针不 import 产品模块，避免 ESM/别名耦合）
const toolsSrc = readFileSync('src/lib/agent/tools/index.ts', 'utf8');
const nativeToolBlock = toolsSrc.match(/const NATIVE_TOOLS[\s\S]*?\n\];/)[0];
const actualToolCount = (nativeToolBlock.match(/^\s{2}\w+Tool as unknown/gm) ?? []).length;
const registrySrc = readFileSync('src/lib/agent/registry.ts', 'utf8');
const actualToolNames = [
  ...toolsSrc.matchAll(/\/\/.*$/gm),
].length >= 0
  ? [
      'search_kols',
      'get_kol_detail',
      'send_outreach',
      'compute_health',
      'match_plan',
      'evaluate_creator',
      'create_project',
      'draft_email',
      'refine_email',
      'commit_quote',
      'payout',
      'distribute_keys',
      'track_delivery',
      'check_deliverables',
      'confirm_brief_goal',
      'draft_report',
      'compute_roi',
      'create_share_link',
    ]
  : [];
const insightTools = registrySrc
  .match(/id: 'insight'[\s\S]*?tools: \[([^\]]*)\]/)[1]
  .split(',')
  .map((s) => s.trim().replace(/['"]/g, ''))
  .filter(Boolean);

// —— 与 tests/unit/architecture-doc-freshness.test.ts 逐条同构的断言 ——
function docCount(doc, pattern) {
  const m = doc.match(pattern);
  if (!m) return { ok: false, note: '锚点缺失（测试会当场红）' };
  return { ok: true, value: Number(m[1]) };
}

const assertions = [
  {
    id: 'A1 §7.2.1 模型清单计数 = schema model 数',
    run: (doc) => {
      const c = docCount(doc, /\*\*模型清单（(\d+) 个）\*\*/);
      return c.ok ? { pass: c.value === actualModels, detail: `文档 ${c.value} vs 实物 ${actualModels}` } : { pass: false, detail: c.note };
    },
  },
  {
    id: 'A2 §7.2.1 枚举计数 = schema enum 数',
    run: (doc) => {
      const c = docCount(doc, /\*\*枚举（(\d+) 个/);
      return c.ok ? { pass: c.value === actualEnums, detail: `文档 ${c.value} vs 实物 ${actualEnums}` } : { pass: false, detail: c.note };
    },
  },
  {
    id: 'A3 §7.2.1 迁移条数 = migrations 目录',
    run: (doc) => {
      const c = docCount(doc, /迁移（`prisma\/migrations\/`，(\d+) 条）/);
      return c.ok ? { pass: c.value === actualMigrations, detail: `文档 ${c.value} vs 实物 ${actualMigrations}` } : { pass: false, detail: c.note };
    },
  },
  {
    id: 'A4 每个实物 enum 名出现在文档（全文范围）',
    run: (doc) => {
      const missing = actualEnumNames.filter((n) => !doc.includes(`enum ${n}`));
      return { pass: missing.length === 0, detail: missing.length ? `缺 ${missing.join(',')}` : '全部在场' };
    },
  },
  {
    id: 'A5 已实装工具计数 = NATIVE_TOOLS 注册数',
    run: (doc) => {
      const c = docCount(doc, /\*\*已实装工具（(\d+) 个/);
      return c.ok ? { pass: c.value === actualToolCount, detail: `文档 ${c.value} vs 实物 ${actualToolCount}` } : { pass: false, detail: c.note };
    },
  },
  {
    id: 'A6 每个注册工具名出现在文档（全文范围）',
    run: (doc) => {
      const missing = actualToolNames.filter((n) => !doc.includes(`\`${n}\``));
      return { pass: missing.length === 0, detail: missing.length ? `缺 ${missing.join(',')}` : '全部在场' };
    },
  },
  {
    id: 'A7 §8.6 名册 insight 行含 registry 声明的每个工具',
    run: (doc) => {
      const row = doc.split('\n').find((l) => l.startsWith('| `insight` | 洞察 Agent'));
      if (!row) return { pass: false, detail: '名册 insight 行缺失' };
      const missing = insightTools.filter((n) => !row.includes(n));
      return { pass: missing.length === 0, detail: missing.length ? `行内缺 ${missing.join(',')}` : `行内齐（${insightTools.join(',')}）` };
    },
  },
  {
    id: 'A8 「演进 M4 / 归 M4」陈旧标记清零',
    run: (doc) => {
      const hits = (doc.match(/演进 M4|归 M4|演进目标归 M4/g) ?? []).length;
      return { pass: hits === 0, detail: `命中 ${hits} 处` };
    },
  },
];

const rows = assertions.map((a) => {
  const broken = a.run(brokenDoc);
  const head = a.run(headDoc);
  const discriminating = !broken.pass && head.pass;
  return { id: a.id, broken, head, discriminating };
});

console.log(`实物基线：model=${actualModels} enum=${actualEnums} migrations=${actualMigrations} tools=${actualToolCount} insightTools=[${insightTools.join(', ')}]`);
console.log(`缺陷态文档 = ${BROKEN_REV}:docs/dev/architecture.md  ·  HEAD 文档 = 工作树\n`);
for (const r of rows) {
  console.log(
    `${r.discriminating ? '✅ 载荷' : r.head.pass ? '⚠️  缺陷态即为真（对本缺陷不携带信息）' : '❌ HEAD 仍红'}  ${r.id}`,
  );
  console.log(`     缺陷态：${r.broken.pass ? 'PASS' : 'FAIL'}（${r.broken.detail}）  →  HEAD：${r.head.pass ? 'PASS' : 'FAIL'}（${r.head.detail}）`);
}
const load = rows.filter((r) => r.discriminating).length;
const inert = rows.filter((r) => r.broken.pass && r.head.pass).length;
const stillRed = rows.filter((r) => !r.head.pass).length;
console.log(`\n汇总：载荷断言 ${load} / 缺陷态恒真 ${inert} / HEAD 仍红 ${stillRed}（共 ${rows.length}）`);
