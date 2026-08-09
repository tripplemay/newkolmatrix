/**
 * 对抗复核工具 A：枚举 importSpecifiers 的**全部**历史世代（不预设只有三代）
 *
 * 设计要点（针对任务书点名的误报向量）：
 *  - 全程 execFileSync，**不经 shell** → 排除 zsh `:t` 修饰符 / 引号转义改写
 *  - 用 TS AST 定位函数声明并逐字取 .getText() → 排除行号漂移导致的抽错版本
 *  - 对 (importSpecifiers + stripComments) 的**合并文本**取 sha256 去重
 *    → 「哪几个 commit 其实是同一代」由哈希说了算，不由人指认
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';

export function gitShow(rev, path = FILE) {
  return execFileSync('git', ['show', `${rev}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** 取顶层函数声明的逐字源文本（AST 定位，非正则/行号） */
export function topLevelFn(source, name) {
  const sf = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st.getText(sf);
  }
  return null;
}

export const REVS = [
  ['6a120a7', 'M5.1b F008 原版（引入 importSpecifiers）'],
  ['fadc1f4', 'M5.1b F003 引导白名单'],
  ['57998bf', 'M5.1b F008 重写说明段'],
  ['8b51756', 'M5.1b F003 fix 恒绿假保证'],
  ['df36a3f', 'M5.1b F008 守的条数由数据结构产出'],
  ['1ea4abb', 'M5.1b F008 fix-3 两处真实漏抓'],
  ['2bc02aa', 'M5.1b F008 补 CJS require 形态'],
  ['c251fe9', 'M5.1b F008 fix-4 撤回 fix-3，改一个字符'],
  ['e509e06', 'M5.1c F001 换 AST（本批被验实现）'],
];

export function enumerateGenerations() {
  const rows = [];
  for (const [rev, note] of REVS) {
    const src = gitShow(rev);
    const imp = topLevelFn(src, 'importSpecifiers');
    const strip = topLevelFn(src, 'stripComments');
    const combined = `/*stripComments*/\n${strip ?? '<none>'}\n/*importSpecifiers*/\n${imp ?? '<none>'}`;
    rows.push({
      rev,
      note,
      hash: createHash('sha256').update(combined).digest('hex'),
      hasStrip: strip !== null,
      combined,
      impText: imp,
      stripText: strip,
    });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = enumerateGenerations();
  const byHash = new Map();
  for (const r of rows) {
    if (!byHash.has(r.hash)) byHash.set(r.hash, []);
    byHash.get(r.hash).push(r);
  }
  console.log('=== 逐 commit：(stripComments + importSpecifiers) 合并文本 sha256 ===');
  for (const r of rows) {
    console.log(
      `  ${r.rev}  ${r.hash.slice(0, 12)}  strip=${r.hasStrip ? 'Y' : 'N'}  ${r.note}`,
    );
  }
  console.log(`\n=== 去重后：真实世代数 = ${byHash.size} ===`);
  let i = 0;
  for (const [h, group] of byHash) {
    i += 1;
    console.log(`  G${i}  ${h.slice(0, 12)}  由 ${group.map((g) => g.rev).join(', ')} 共享`);
  }
}
