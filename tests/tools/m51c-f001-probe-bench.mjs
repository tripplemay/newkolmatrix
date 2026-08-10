/**
 * M5.1c F001 fix-1 —— **候选探针台**：在把任何一条探针写进用例之前，先量它在换代前的各世代上红不红。
 *
 * 【为什么要有这个东西】首轮验收的阻断点就是「探针写进去了，但它在换代前的实现上一样是绿的」，
 * 而注释却声称它红过。根因不是眼力不够，是**顺序反了**：先写断言与说明，再（没有）去量。
 * 本台把顺序钉死——先跑，拿到红格才有资格写那句话。
 *
 * 世代来源复用对抗复核的 `adv-generations.mjs` / `adv-eval.mjs`（哈希去重出的 6 个真实世代，
 * 而不是人指认的「三代」）。判据先做正负活性自测。
 *
 * 用法：node tests/tools/m51c-f001-probe-bench.mjs
 */
import { enumerateGenerations } from './adv/adv-generations.mjs';
import { loadMethodA, loadWorktree } from './adv/adv-eval.mjs';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 候选探针：`want` 是 AST（换代后）应得的结果；换代前**应当**得不到它，否则这条探针没有对照价值。 */
const CANDIDATES = [
  {
    id: '(a) 侧效应 import 被后续 from-import 吞掉',
    src: "import './runtime';\nimport { z } from 'zod';",
    want: ['./runtime', 'zod'],
  },
  {
    id: '(b) 后文字符串里的 from 紧跟引号，触发同一吞噬',
    src: "import './runtime';\nconst s = 'a from ' + 'b';",
    want: ['./runtime'],
  },
  {
    id: '(c1) 多行 import 行尾注释含反引号',
    src: "import {\n  a, // 见 `runtime`\n} from './bt';",
    want: ['./bt'],
  },
  {
    id: "(c2) 多行 import 行尾注释含撇号",
    src: "import {\n  a, // it's fine\n} from './ap';",
    want: ['./ap'],
  },
  {
    id: '(c3) 多行 import 行尾注释含分号',
    src: "import {\n  a, // foo; bar\n} from './sc';",
    want: ['./sc'],
  },
  {
    id: '(d1) ES2022 带引号绑定名（import 侧）',
    src: 'import { "weird-name" as w, x } from "./es2022";',
    want: ['./es2022'],
  },
  {
    id: '(d2) ES2022 带引号绑定名（export 侧）',
    src: 'export { x as "a-b" } from "./es2022x";',
    want: ['./es2022x'],
  },
  {
    id: '(e) 现行：单行 import + 行尾注释含 from',
    src: "import { a } from './new'; // 旧版 from './old'",
    want: ['./new'],
  },
  {
    id: "(e') 候选：多行 import + 行尾注释含 from './old'",
    src: "import {\n  a, // 旧版 from './old'\n} from './new';",
    want: ['./new'],
  },
  {
    id: '(f) 现行：无分号 export + 后文散文在整行 // 注释里',
    src: "export const a = 1\n// 说明：本模块的数据 from 'lib/db/privileged' 而来",
    want: [],
  },
  {
    id: "(f') 候选：无分号 export + 散文在**行尾**注释里",
    src: "export const a = 1 // 本模块的数据 from 'lib/db/privileged' 而来",
    want: [],
  },
  {
    id: "(f'') 候选：无分号 export + 散文是普通代码（模板串）",
    src: "export const a = 1\nconst doc = `本模块的数据 from 'lib/db/privileged' 而来`;",
    want: [],
  },
  {
    id: '(g) 现行：幻影块注释——两行，无闭合 */',
    src: ['// M5 路由装配：/api/auth/*', "import { privilegedDb } from 'lib/db/privileged';"].join('\n'),
    want: ['lib/db/privileged'],
  },
  {
    id: "(g') 候选：幻影块注释——补回 M5.1b 原版被我合并时丢掉的第三行（闭合 */）",
    src: [
      '// M5 路由装配：/api/auth/*',
      "import { privilegedDb } from 'lib/db/privileged';",
      '/** 正常块注释 */',
    ].join('\n'),
    want: ['lib/db/privileged'],
  },
];

// 按实现文本哈希去重 → 真实世代；排除换代后的那一代（e509e06 = AST 本身，不是「换代前」）
const seen = new Set();
const impls = enumerateGenerations()
  .filter((r) => r.hasStrip && !seen.has(r.hash) && (seen.add(r.hash), true))
  .map((r) => ({ label: `${r.rev} ${r.note}`, run: loadMethodA(r.rev) }));
const ast = loadWorktree();

// ── 判据活性自测：不做这步，「全绿」可能只是台子坏了 ─────────────────────────
{
  const known = "import{a}from'./no-space';"; // 正则各世代抓不到、AST 抓得到
  const pre = impls.map((i) => i.run(known));
  const post = ast(known, 'p.ts');
  if (!pre.every((r) => eq(r, [])) || !eq(post, ['./no-space'])) {
    console.error('活性自测失败（正向）：已知分歧输入上，各世代/AST 的表现不符预期');
    console.error('  换代前:', JSON.stringify(pre), ' AST:', JSON.stringify(post));
    process.exit(2);
  }
  const same = "import { a } from './plain';";
  if (!impls.every((i) => eq(i.run(same), ['./plain'])) || !eq(ast(same, 'p.ts'), ['./plain'])) {
    console.error('活性自测失败（负向）：两侧本该一致的输入上报出了差异');
    process.exit(2);
  }
  console.log('[自测] 正向 ✓（已知分歧输入：换代前各代 [] / AST 抓到）  负向 ✓（一致输入无误报）\n');
}

// ── 逐候选量红格 ─────────────────────────────────────────────────────────
const W = 52;
console.log(`世代（哈希去重，非人工指认）：${impls.map((i) => i.label).join(' · ')}\n`);
let verdictBad = 0;
for (const c of CANDIDATES) {
  const pre = impls.map((i) => {
    let got;
    try {
      got = i.run(c.src);
    } catch (e) {
      got = `THREW:${e.message}`;
    }
    return { label: i.label, got, red: !eq(got, c.want) };
  });
  const post = ast(c.src, 'probe.ts');
  const reds = pre.filter((p) => p.red).length;
  const astOk = eq(post, c.want);
  const usable = reds > 0 && astOk;
  if (!usable) verdictBad += 1;
  console.log(`${usable ? '✅ 可用' : '❌ 无对照价值'}  ${c.id}`);
  console.log(`     期望(AST) ${JSON.stringify(c.want)}   换代前红 ${reds}/${pre.length} 代   AST ${astOk ? '符合' : '✗ ' + JSON.stringify(post)}`);
  for (const p of pre) {
    console.log(`       ${p.red ? '🔴' : '🟢'} ${p.label.padEnd(W)} ${JSON.stringify(p.got)}`);
  }
  console.log('');
}
console.log(`可用 ${CANDIDATES.length - verdictBad} / ${CANDIDATES.length}（「可用」＝换代前至少一代红，且 AST 符合期望）`);
