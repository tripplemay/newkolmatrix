/**
 * M5.1c F001 —— **验收方**的独立变异台（evaluator 产物）。
 *
 * 对 tests/unit/db-layer-importer-census.test.ts 逐条打变异，记录：
 *   · 退出码 · 跑起来几条 · 红了几条 · 红的是哪几条（点名）
 * 三种红法要分开，否则会像实现方首轮那样把「文件级抛」误读成「全绿 / 无鉴别力」：
 *   PASS-ALL（全绿）/ ASSERT-RED（断言红，N 条）/ FILE-RED（收集期抛，0 条跑起来）
 *
 * 还原一律**反向编辑 + sha256 逐位对账**，不用 `git checkout`。
 * 任一步锚点不唯一、或还原后 sha 对不上，立即抛错中止（宁可中断，不留脏工作树）。
 *
 * 用法：node scripts/test/m51c-evaluator-f001-mutations.mjs [仅跑某些 id，如 E1 E4]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';
const OUT = '/tmp/m51c-mut-report.json';
const BASELINE = 'a769878040b17c467f349883a2d2e6401fa0d36f087b1b99453a8ea64eb224ee';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const count = (hay, needle) => hay.split(needle).length - 1;

/** id / 描述 / 锚点 from → to。from 必须在文件中**恰好出现一次**。 */
const MUTATIONS = [
  {
    id: 'E1',
    desc: '摘掉 visitor 分支① ImportDeclaration',
    from: '    if (ts.isImportDeclaration(node)) {',
    to: '    if (false && ts.isImportDeclaration(node)) {',
  },
  {
    id: 'E2',
    desc: '摘掉 visitor 分支② ExportDeclaration',
    from: '    } else if (ts.isExportDeclaration(node)) {',
    to: '    } else if (false && ts.isExportDeclaration(node)) {',
  },
  {
    id: 'E3',
    desc: '摘掉 visitor 分支③ ImportEqualsDeclaration',
    from: '    } else if (ts.isImportEqualsDeclaration(node)) {',
    to: '    } else if (false && ts.isImportEqualsDeclaration(node)) {',
  },
  {
    id: 'E4',
    desc: '摘掉 visitor 分支④ 动态 import()',
    from: '      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;',
    to: '      const isDynamicImport = false;',
  },
  {
    id: 'E5',
    desc: '摘掉 visitor 分支⑤ CJS require()',
    from: "      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';",
    to: '      const isRequire = false;',
  },
  {
    id: 'E6',
    desc: '字面量判据收窄：isStringLiteralLike → isStringLiteral（反引号无替换不再抓）',
    from: '      if ((isDynamicImport || isRequire) && first && ts.isStringLiteralLike(first)) {',
    to: '      if ((isDynamicImport || isRequire) && first && ts.isStringLiteral(first)) {',
  },
  {
    id: 'E7',
    desc: '字面量判据放宽：连带替换的模板串也收（把 `./${name}` 的字面片段当路径）',
    from:
      '      if ((isDynamicImport || isRequire) && first && ts.isStringLiteralLike(first)) {\n' +
      '        specs.push(first.text);\n' +
      '      }',
    to:
      '      if (\n' +
      '        (isDynamicImport || isRequire) &&\n' +
      '        first &&\n' +
      '        (ts.isStringLiteralLike(first) || ts.isTemplateExpression(first))\n' +
      '      ) {\n' +
      '        specs.push(ts.isTemplateExpression(first) ? first.head.text : first.text);\n' +
      '      }',
  },
  {
    id: 'E8',
    desc: 'ScriptKind 写死 scan.tsx（无视传入文件名）',
    from: '  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false);',
    to: "  const sourceFile = ts.createSourceFile('scan.tsx', source, ts.ScriptTarget.Latest, false);",
  },
  {
    id: 'E9',
    desc: '摘掉 ExportDeclaration 的 moduleSpecifier 判空',
    from: '      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {',
    to: '      if (ts.isStringLiteralLike(node.moduleSpecifier)) {',
  },
  {
    id: 'E10',
    desc: '【实现方自陈的盲区】预扫那行摘掉第二参数（不再传真实文件名）',
    from: "    files.map((f) => [f, importSpecifiers(readFileSync(f, 'utf8'), f)]),",
    to: "    files.map((f) => [f, importSpecifiers(readFileSync(f, 'utf8'))]),",
  },
  {
    id: 'E11',
    desc: 'GUARDED 期望里塞一个不存在的 importer',
    from: "      'src/lib/db/prisma.ts',\n",
    to: "      'src/lib/db/prisma.ts',\n      'src/lib/db/EVALUATOR-FAKE.ts',\n",
  },
  {
    id: 'E12',
    desc: 'GUARDED 期望里摘掉一个真实 importer（反方向）',
    from: "      'src/lib/db/tenant-scope.ts',\n",
    to: '',
  },
  {
    id: 'E13',
    desc: '归一器把 @/ 别名判死（resolveToSrcModule 的 @/ 分支）',
    from: "  } else if (spec.startsWith('@/')) {",
    to: "  } else if (false && spec.startsWith('@/')) {",
  },
  {
    id: 'E15',
    desc: '假阳性方向：把任意字符串字面量都当 specifier（专门探「字面出现不算 import」还活着吗）',
    from: '    ts.forEachChild(node, visit);',
    to: '    if (ts.isStringLiteralLike(node)) specs.push(node.text);\n    ts.forEachChild(node, visit);',
  },
  {
    id: 'E16',
    desc: '扫描面缩到 src/lib/db（专门探「src/ 下确实扫到了文件」还活着吗）',
    from: '  const files = collectSources(SRC_ROOT);',
    to: "  const files = collectSources('src/lib/db');",
  },
  {
    id: 'E14',
    desc: 'visit 整体空转（判据全死 —— 看哪些用例仍然绿 = 恒真嫌疑名单）',
    from: '  visit(sourceFile);\n  return specs;',
    to: '  if (String(1) !== String(2)) return specs;\n  visit(sourceFile);\n  return specs;',
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
  const passed = assertions.filter((a) => a.status === 'passed').length;
  let verdict;
  if (assertions.length === 0) verdict = 'FILE-RED（0 条跑起来 —— 收集期抛）';
  else if (failed.length === 0) verdict = exitCode === 0 ? 'PASS-ALL（全绿）' : 'PASS-ALL但退出码非0';
  else verdict = `ASSERT-RED（红 ${failed.length} / 跑 ${assertions.length}）`;
  return { exitCode, ran: assertions.length, passed, failed, verdict };
}

const only = process.argv.slice(2);
const results = [];

// 基线自测：未变异时必须全绿，否则整台仪器的读数没有意义
{
  const s0 = sha(readFileSync(FILE, 'utf8'));
  if (s0 !== BASELINE) throw new Error(`开工时 sha 就不是基线：${s0}`);
  const r = runVitest();
  console.log(`[基线] sha256=${s0.slice(0, 16)}…  ${r.verdict}  跑 ${r.ran} 条`);
  if (r.verdict.startsWith('PASS-ALL') === false) throw new Error('基线不绿，仪器不可用');
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

  results.push({ ...m, ...r, mutatedSha: mutatedSha.slice(0, 16), restored: true });
  console.log(`${m.id}  ${m.desc}`);
  console.log(`     变异后 sha=${mutatedSha.slice(0, 16)}…  → ${r.verdict}`);
  for (const t of r.failed) console.log(`       红：${t}`);
  console.log(`     还原 ✓ sha256 回到基线 ${after.slice(0, 16)}…`);
  console.log();
}

console.log('=== 汇总 ===');
for (const r of results) {
  console.log(`${r.id.padEnd(4)} ${r.verdict.padEnd(28)} ${r.desc}`);
}
const finalSha = sha(readFileSync(FILE, 'utf8'));
console.log(`\n全部变异结束，${FILE} sha256 = ${finalSha}`);
console.log(finalSha === BASELINE ? '✓ 与基线逐位相同' : '✗ 与基线不同 —— 工作树已脏');
