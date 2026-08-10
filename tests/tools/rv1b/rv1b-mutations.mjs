/**
 * M5.1c rv1 回归 · 探针 P5：**复验方**独立变异台（钉在 fix 后的 HEAD 基线上）。
 *
 * 首轮验收方的 `tests/tools/m51c-evaluator-f001-mutations.mjs` 把基线 sha 硬编码在
 * 修复前的 a769878…，fix 轮改了该文件后它会直接抛「开工时 sha 就不是基线」。
 * 那份产物是**历史记录**，不动它；这里另起一台，基线换成 HEAD 的 efc46ad…。
 *
 * 覆盖两件事：
 *   (1) F001 ① 的重放 —— 五个遍历面分支各打一个必红变异，红了才算数；
 *   (2) 回归面 —— fix 轮改过用例文本后，既有断言的鉴别力有没有流失
 *       （尤其 R7 探「守多抓方向」那条、R9 探哪些用例已成恒真）。
 *
 * 三种红法分开记（沿用首轮口径，否则会把收集期抛误读成「全绿」）：
 *   PASS-ALL（全绿）/ ASSERT-RED（断言红 N 条）/ FILE-RED（0 条跑起来）
 *
 * 还原一律**反向编辑 + sha256 逐位对账**，不用 `git checkout`。
 * 锚点不唯一或还原后 sha 对不上 → 立即抛错中止，不留脏工作树。
 *
 * 用法：node tests/tools/rv1b/rv1b-mutations.mjs [仅跑某些 id，如 R1 R7]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';
const OUT = '/tmp/rv1b-mut-report.json';
const BASELINE = 'efc46adedd427d40c0b844a1541b2ff27519e3815322071f77897b494f99604c';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const count = (hay, needle) => hay.split(needle).length - 1;

const MUTATIONS = [
  // ── F001 ① 重放：五个遍历面分支 ──────────────────────────────
  {
    id: 'R1',
    desc: '摘掉 visitor 分支① ImportDeclaration',
    from: '    if (ts.isImportDeclaration(node)) {',
    to: '    if (false && ts.isImportDeclaration(node)) {',
  },
  {
    id: 'R2',
    desc: '摘掉 visitor 分支② ExportDeclaration',
    from: '    } else if (ts.isExportDeclaration(node)) {',
    to: '    } else if (false && ts.isExportDeclaration(node)) {',
  },
  {
    id: 'R3',
    desc: '摘掉 visitor 分支③ ImportEqualsDeclaration',
    from: '    } else if (ts.isImportEqualsDeclaration(node)) {',
    to: '    } else if (false && ts.isImportEqualsDeclaration(node)) {',
  },
  {
    id: 'R4',
    desc: '摘掉 visitor 分支④ 动态 import()',
    from: '      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;',
    to: '      const isDynamicImport = false;',
  },
  {
    id: 'R5',
    desc: '摘掉 visitor 分支⑤ CJS require()',
    from: "      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';",
    to: '      const isRequire = false;',
  },
  // ── 回归面：鉴别力是否被 fix 轮改没了 ────────────────────────
  {
    id: 'R6',
    desc: '收窄字面量判据 isStringLiteralLike → isStringLiteral（反引号静态路径不再抓）',
    from: '      if ((isDynamicImport || isRequire) && first && ts.isStringLiteralLike(first)) {',
    to: '      if ((isDynamicImport || isRequire) && first && ts.isStringLiteral(first)) {',
  },
  {
    id: 'R7',
    desc: '假阳性方向：任意字符串字面量都当 specifier —— 专探「守多抓方向」那条（fix 轮改过标题）还活着吗',
    from: '    ts.forEachChild(node, visit);',
    to: '    if (ts.isStringLiteralLike(node)) specs.push(node.text);\n    ts.forEachChild(node, visit);',
  },
  {
    id: 'R8',
    desc: '扫描面缩到 src/lib/db —— 专探「src/ 下确实扫到了文件」还活着吗',
    from: '  const files = collectSources(SRC_ROOT);',
    to: "  const files = collectSources('src/lib/db');",
  },
  {
    id: 'R9',
    desc: 'visit 整体空转（判据全死）—— 仍然绿的用例 = 恒真嫌疑名单',
    from: '  visit(sourceFile);\n  return specs;',
    to: '  if (String(1) !== String(2)) return specs;\n  visit(sourceFile);\n  return specs;',
  },
  {
    id: 'R10',
    desc: 'GUARDED 期望里塞一个不存在的 importer（探清单断言的多出方向）',
    from: "      'src/lib/db/prisma.ts',\n",
    to: "      'src/lib/db/prisma.ts',\n      'src/lib/db/RV1B-FAKE.ts',\n",
  },
  {
    id: 'R11',
    desc: 'GUARDED 期望里摘掉一个真实 importer（探清单断言的缺失方向）',
    from: "      'src/lib/db/tenant-scope.ts',\n",
    to: '',
  },
  {
    id: 'R12',
    desc: '归一器把 @/ 别名判死 —— 专探「路径归一」那条还活着吗',
    from: "  } else if (spec.startsWith('@/')) {",
    to: "  } else if (false && spec.startsWith('@/')) {",
  },
  {
    id: 'R13',
    desc: '叙述面 source 读成空串 —— 专探「扫描器不空转：文件确实读到了内容」还活着吗',
    from: "  const source = readFileSync(TENANT_SCOPE_FILE, 'utf8');",
    to: "  const source = '';",
  },
  {
    id: 'R16',
    desc: '预扫不传真实文件名（修复方自陈的已登记盲区 M10，声称仍全绿）—— 独立复核',
    from: "    files.map((f) => [f, importSpecifiers(readFileSync(f, 'utf8'), f)]),",
    to: "    files.map((f) => [f, importSpecifiers(readFileSync(f, 'utf8'))]),",
  },
];

function runVitest() {
  if (existsSync(OUT)) rmSync(OUT);
  let exitCode = 0;
  try {
    execFileSync('npx', ['vitest', 'run', FILE, '--reporter=json', `--outputFile=${OUT}`], {
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
    /* 收集期抛时可能连 json 都没有 */
  }
  const assertions = json?.testResults?.flatMap((t) => t.assertionResults ?? []) ?? [];
  const failed = assertions.filter((a) => a.status === 'failed').map((a) => a.title);
  const passedTitles = assertions.filter((a) => a.status === 'passed').map((a) => a.title);
  let verdict;
  if (assertions.length === 0) verdict = 'FILE-RED（0 条跑起来 —— 收集期抛）';
  else if (failed.length === 0) verdict = exitCode === 0 ? 'PASS-ALL（全绿）' : 'PASS-ALL但退出码非0';
  else verdict = `ASSERT-RED（红 ${failed.length} / 跑 ${assertions.length}）`;
  return { exitCode, ran: assertions.length, failed, passedTitles, verdict };
}

const only = process.argv.slice(2);
const results = [];

// 基线自测：未变异时必须全绿，否则整台仪器的读数没有意义
{
  const s0 = sha(readFileSync(FILE, 'utf8'));
  if (s0 !== BASELINE) throw new Error(`开工时 sha 就不是基线：${s0}`);
  const r = runVitest();
  console.log(`[基线] sha256=${s0.slice(0, 16)}…  ${r.verdict}  跑 ${r.ran} 条`);
  if (!r.verdict.startsWith('PASS-ALL')) throw new Error('基线不绿，仪器不可用');
  console.log();
}

for (const m of MUTATIONS) {
  if (only.length && !only.includes(m.id)) continue;
  const before = readFileSync(FILE, 'utf8');
  if (sha(before) !== BASELINE) throw new Error(`${m.id} 开跑前 sha 已偏离基线`);
  const nFrom = count(before, m.from);
  if (nFrom !== 1) throw new Error(`${m.id} 锚点出现 ${nFrom} 次（要求恰好 1 次），中止`);

  writeFileSync(FILE, before.replace(m.from, m.to));
  const mutatedSha = sha(readFileSync(FILE, 'utf8'));
  if (mutatedSha === BASELINE) throw new Error(`${m.id} 变异后 sha 未变 —— 变异没生效`);

  const r = runVitest();

  // 反向编辑还原（不用 git checkout）
  const mutated = readFileSync(FILE, 'utf8');
  const nTo = m.to === '' ? 1 : count(mutated, m.to);
  if (nTo !== 1) throw new Error(`${m.id} 还原锚点出现 ${nTo} 次，人工介入`);
  writeFileSync(FILE, m.to === '' ? before : mutated.replace(m.to, m.from));
  const after = sha(readFileSync(FILE, 'utf8'));
  if (after !== BASELINE) throw new Error(`${m.id} 还原失败：${after}`);

  results.push({ ...m, ...r, mutatedSha: mutatedSha.slice(0, 16) });
  console.log(`${m.id}  ${m.desc}`);
  console.log(`     变异后 sha=${mutatedSha.slice(0, 16)}…  → ${r.verdict}`);
  for (const t of r.failed) console.log(`       红：${t}`);
  if (m.id === 'R9') {
    console.log(`     —— 判据全死却仍绿的用例（恒真嫌疑）：`);
    for (const t of r.passedTitles) console.log(`       仍绿：${t}`);
  }
  console.log(`     还原 ✓ sha256 回到基线 ${after.slice(0, 16)}…`);
  console.log();
}

console.log('=== 汇总 ===');
for (const r of results) {
  console.log(`${r.id.padEnd(4)} ${r.verdict.padEnd(30)} ${r.desc}`);
}
const finalSha = sha(readFileSync(FILE, 'utf8'));
console.log(`\n全部变异结束，${FILE}`);
console.log(`sha256 = ${finalSha}`);
console.log(finalSha === BASELINE ? '✓ 与基线逐位相同（工作树干净）' : '✗ 与基线不同 —— 工作树已脏');
