// 签收方独立复算 ①：换代前到底有几代实现？（注释 :388-389 写「5 代」，N/5 全部数字的分母）
// 自己枚举 commit（git log --follow）、自己抽实现、自己哈希去重，不看 REVS 常量。
//
// 活性自测三道（先跑，失败即 exit 2）：
//   L1 正向：已知分歧输入上，换代前/换代后取值必须不同（否则说明全都加载成同一份）
//   L2 负向：两侧一致输入上，取值必须相同（否则说明加载器本身在乱改语义）
//   L3 未坍缩：换代前各代在某个区分性输入上取值不得全部相同

import { execFileSync } from 'node:child_process';
import { fnHash, loadImpl } from './sg-impl.mjs';

const FILE = 'tests/unit/db-layer-importer-census.test.ts';

const commits = execFileSync(
  'git',
  ['log', '--follow', '--reverse', '--format=%h %s', '--', FILE],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .map((l) => ({ rev: l.slice(0, l.indexOf(' ')), subject: l.slice(l.indexOf(' ') + 1) }));

console.log(`枚举到 ${commits.length} 个 commit 触碰过 ${FILE}`);

// ---- 活性自测 ----
const DIVERGENT = "import{a}from'./no-space';"; // 换代前抓不到（无空格），AST 抓得到
const AGREED = "import { a } from './plain';";
const oldest = commits[0].rev;
const newest = 'WORKTREE';
const fOld = loadImpl(oldest);
const fNew = loadImpl(newest);
const l1 = JSON.stringify(fOld(DIVERGENT)) !== JSON.stringify(fNew(DIVERGENT));
const l2 =
  JSON.stringify(fOld(AGREED)) === JSON.stringify(fNew(AGREED)) &&
  JSON.stringify(fNew(AGREED)) === JSON.stringify(['./plain']);
console.log(`[自测] L1 正向(已知分歧上两侧不同) = ${l1 ? 'OK' : 'FAIL'}`);
console.log(`[自测] L2 负向(一致输入上两侧相同且=["./plain"]) = ${l2 ? 'OK' : 'FAIL'}`);
if (!l1 || !l2) process.exit(2);

// ---- 世代去重 ----
const gens = [];
const folded = [];
for (const c of commits) {
  const { hash, hasStrip } = fnHash(c.rev);
  const prev = gens.find((g) => g.hash === hash);
  if (prev) {
    prev.revs.push(c.rev);
    folded.push(c.rev);
  } else {
    gens.push({ hash, hasStrip, revs: [c.rev], first: c.rev });
  }
}
const before = gens.filter((g) => g.hasStrip);
const after = gens.filter((g) => !g.hasStrip);
console.log(`\n哈希去重后共 ${gens.length} 代：`);
for (const g of gens) {
  console.log(
    `  ${g.first}  ${g.hasStrip ? '换代前(有 stripComments)' : '换代后(无 stripComments)'}  ` +
      `hash=${g.hash.slice(0, 12)}  折叠了 ${g.revs.length} 个 commit：${g.revs.join(' ')}`,
  );
}
console.log(`\n换代前世代数 = ${before.length}   换代后世代数 = ${after.length}`);

// L3 未坍缩
const PROBE = "import {\n  a, // it's fine\n} from './ap';";
const vals = before.map((g) => JSON.stringify(loadImpl(g.first)(PROBE)));
const l3 = new Set(vals).size > 1;
console.log(`[自测] L3 换代前各代未坍缩 = ${l3 ? 'OK' : 'FAIL'}  取值：${vals.join(' / ')}`);
if (!l3) process.exit(2);

// 交叉核对：立项 HEAD(bf26603) 树上的该文件 = 哪一代？
const projHash = fnHash('bf26603').hash;
const which = gens.find((g) => g.hash === projHash);
console.log(
  `\n立项 HEAD bf26603 的实现属于世代：${which ? which.first : '(未匹配)'}` +
    `（该代含 commit：${which ? which.revs.join(' ') : '-'}）`,
);
