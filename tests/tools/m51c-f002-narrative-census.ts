/**
 * M5.1c F002 独立验收工具 —— src/lib/db 叙述面「覆盖面承诺句」普查（Evaluator 侧独立 oracle）
 *
 * 与 Generator 的判据刻意不同源：
 *   · Generator 用「grep 注释行 + 剔 `// >`」；本工具用 **TS scanner 抽取真实注释 trivia**，
 *     因此字符串字面量里的同形文字不会被误当叙述面（负向自测覆盖这一点）。
 *   · 模式分两档：A = Generator 自陈的模式（用于复核其自陈结论）；
 *                 B = 本工具自拟的**更宽**模式（用于找 Generator 漏掉的形态）。
 *
 * 用法：
 *   npx tsx scripts/test/m51c-f002-narrative-census.ts            # 扫工作树
 *   npx tsx scripts/test/m51c-f002-narrative-census.ts --rev 8cc63d2  # 扫某个 commit
 *   npx tsx scripts/test/m51c-f002-narrative-census.ts --selftest  # 判据活性自测（正负双向）
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const FILES = [
  'src/lib/db/app-role.ts',
  'src/lib/db/prisma.ts',
  'src/lib/db/privileged.ts',
  'src/lib/db/runtime.ts',
  'src/lib/db/tenant-entry.ts',
  'src/lib/db/tenant-scope.ts',
];

/** A 档：Generator 在 commit 正文自陈的模式，逐字复刻，用于复核其自陈的 1→0。 */
const PATTERN_A = /守住|即红|红并点名|不可能再|完备|一条不漏|无一遗漏|全部覆盖|不会漏|杜绝/;

/** B 档：本工具自拟，覆盖 A 档之外的承诺形态（更宽，命中后人工归类）。 */
const PATTERN_B: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'B01 守住/守死/钉死/钉住', re: /守住|守死|钉死|钉住/ },
  { name: 'B02 即红 / 当场红 / 必红 / 就会红', re: /即红|当场红|必红|就会红|一定红/ },
  { name: 'B03 点名类承诺', re: /红并点名|并点名/ },
  { name: 'B04 不可能 / 绝不 / 绝无', re: /不可能|绝不|绝无|决不/ },
  { name: 'B05 完备 / 穷尽 / 齐全', re: /完备|穷尽|齐全|无遗漏|一条不漏|无一遗漏|不会漏|不漏掉/ },
  { name: 'B06 全部覆盖 / 覆盖全部 / 全覆盖', re: /全部覆盖|覆盖全部|全覆盖|悉数覆盖/ },
  { name: 'B07 保证 / 确保 / 杜绝', re: /保证|确保|杜绝/ },
  { name: 'B08 任何…都会 / 一律会 / 均会', re: /任何[^。\n]{0,20}都会|一律会|均会|都逃不过|逃不过/ },
  { name: 'B09 必然 / 必定 / 铁定', re: /必然|必定|铁定/ },
  { name: 'B10 只要…就 (充分条件式承诺)', re: /只要[^。\n]{0,24}就(会|能|红|报)/ },
  { name: 'B11 已由X守 / 已被X守 (转移举证责任)', re: /已由[^。\n]{0,24}守|已被[^。\n]{0,24}守/ },
  { name: 'B12 不会再 / 再也不会', re: /不会再|再也不会|不再可能/ },
];

interface CommentLine {
  file: string;
  line: number; // 1-based
  text: string;
  isHistory: boolean; // `// >` 更正块
}

/** 用 TS scanner 抽取注释 trivia，逐行铺平。字符串字面量内容不会进入结果。 */
export function extractCommentLines(file: string, source: string): CommentLine[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const scanner = ts.createScanner(ts.ScriptTarget.ESNext, /* skipTrivia */ false, ts.LanguageVariant.Standard, source);
  const out: CommentLine[] = [];
  let kind: ts.SyntaxKind;
  while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const start = scanner.getTokenStart();
      const raw = source.slice(start, scanner.getTokenEnd());
      const startLine = sf.getLineAndCharacterOfPosition(start).line;
      raw.split('\n').forEach((l, i) => {
        out.push({
          file,
          line: startLine + i + 1,
          text: l,
          isHistory: l.trimStart().startsWith('// >') || l.trimStart().startsWith('* >') || l.trimStart().startsWith('> '),
        });
      });
    }
  }
  return out;
}

function loadFile(file: string, rev: string | null): string {
  if (!rev) return readFileSync(file, 'utf8');
  return execFileSync('git', ['show', `${rev}:${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
}

function scan(rev: string | null) {
  const all: CommentLine[] = [];
  for (const f of FILES) all.push(...extractCommentLines(f, loadFile(f, rev)));
  const current = all.filter((c) => !c.isHistory);
  const history = all.filter((c) => c.isHistory);

  const aHits = current.filter((c) => PATTERN_A.test(c.text));
  console.log(`# rev=${rev ?? 'WORKTREE'}`);
  console.log(`注释行总数=${all.length}  现行叙述=${current.length}  历史更正(// >)=${history.length}`);
  console.log(`\n## A 档（Generator 自陈模式）命中：${aHits.length}`);
  for (const h of aHits) console.log(`  ${h.file}:${h.line}  ${h.text.trim()}`);

  console.log(`\n## B 档（Evaluator 自拟更宽模式）命中，按子模式列出：`);
  let bTotal = 0;
  for (const p of PATTERN_B) {
    const hits = current.filter((c) => p.re.test(c.text));
    if (hits.length === 0) continue;
    bTotal += hits.length;
    console.log(`  [${p.name}] ${hits.length} 条`);
    for (const h of hits) console.log(`     ${h.file}:${h.line}  ${h.text.trim()}`);
  }
  console.log(`  B 档命中行合计（含跨子模式重复计数）=${bTotal}`);
  return { aHits: aHits.length, bTotal };
}

/** 判据活性自测：正向 = 已知在场目标必须看得见；负向 = 已知不该命中的必须不报。 */
function selftest() {
  let fail = 0;
  const ok = (cond: boolean, msg: string) => {
    console.log(`${cond ? 'PASS' : '**FAIL**'}  ${msg}`);
    if (!cond) fail++;
  };

  // 正向 1：A 档六种 acceptance 点名措辞，注入现行叙述必须逐条被看见
  const forms = [
    '本段陈述现由 xxx 钉机械守住',
    '新增 importer 即红并点名',
    '声称与实际不可能再对不上',
    '这份清单是完备的',
    '已知形态一条不漏',
    '该面已被全部覆盖',
  ];
  for (const f of forms) {
    const src = `// ${f}\nexport const x = 1;\n`;
    const lines = extractCommentLines('t.ts', src).filter((c) => !c.isHistory);
    ok(lines.some((l) => PATTERN_A.test(l.text)), `正向A：「${f}」被 A 档看见`);
  }

  // 正向 2：B 档独有形态（A 档看不见）必须被 B 档看见
  const bOnly = [
    '这道钉保证不会有漏网之鱼',
    '任何新 importer 都会让它红',
    '该清单已由那道钉守着',
    '这条路径必然被拦下',
  ];
  for (const f of bOnly) {
    const src = `// ${f}\nexport const x = 1;\n`;
    const lines = extractCommentLines('t.ts', src).filter((c) => !c.isHistory);
    const seenB = PATTERN_B.some((p) => lines.some((l) => p.re.test(l.text)));
    const seenA = lines.some((l) => PATTERN_A.test(l.text));
    ok(seenB, `正向B：「${f}」被 B 档看见`);
    ok(!seenA, `对照：「${f}」A 档看不见（证明 B 档确实更宽）`);
  }

  // 负向 1：写进 `// >` 更正块的同一句必须被归为历史、不进现行叙述（已知盲区，如实登记）
  {
    const src = `// > 上一版写的是「机械守住」\nexport const x = 1;\n`;
    const cur = extractCommentLines('t.ts', src).filter((c) => !c.isHistory);
    ok(cur.length === 0, '负向：`// >` 行被归为历史，不计入现行叙述（= 本判据已知盲区）');
  }

  // 负向 2：字符串字面量里的同形文字不得被当作叙述面（AST 抽注释相对 grep 行的增益）
  {
    const src = `export const msg = '这句里也有 机械守住 两个字';\n`;
    const cur = extractCommentLines('t.ts', src);
    ok(cur.length === 0, '负向：字符串字面量内的同形文字不被计入注释面');
  }

  // 负向 3：代码标识符不得误报
  {
    const src = `export function 守住(){ return 1 }\n`;
    const cur = extractCommentLines('t.ts', src);
    ok(cur.length === 0, '负向：标识符不被计入注释面');
  }

  console.log(fail === 0 ? '\nSELFTEST: ALL PASS' : `\nSELFTEST: ${fail} FAILED`);
  return fail;
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  process.exit(selftest() === 0 ? 0 : 1);
} else {
  const i = argv.indexOf('--rev');
  scan(i >= 0 ? argv[i + 1] : null);
}
