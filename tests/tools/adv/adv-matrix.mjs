/**
 * 对抗复核工具 D：六世代 × 十探针 矩阵
 *
 * 判定口径（**方向必须写死并自证，防「比对方向写反」**）：
 *   某世代对某探针「红」  ⇔  该世代的 importSpecifiers(input) 与该断言的 expected **不相等**
 *   （因为断言就是 expect(importSpecifiers(input)).toEqual(expected)）
 *   「绿」⇔ 相等。
 *
 * 活性自测三道：
 *   L1 正向：已知在正则世代会分歧的输入，必须显示为「正则红 / AST 绿」
 *   L2 负向：两侧都对的输入，必须显示为「全绿」
 *   L3 端到端：Method A 载入的 e509e06 与工作树实现，在十条探针上必须逐条同值；
 *              且工作树实现必须让十条 expected 全部成立（= 复现 vitest 的 21 passed 中这一条）
 *   L4 抽取保真：Method A（整文件逐字）与 Method B（只抽两函数）必须逐条同值
 */
import { enumerateGenerations } from './adv-generations.mjs';
import { loadMethodA, loadMethodB, loadWorktree } from './adv-eval.mjs';
import { probesWithSegments } from './adv-probes.mjs';

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const GEN_REPS = [
  ['G1', '6a120a7', '原版'],
  ['G2', 'fadc1f4', 'F003 引导白名单期（报告未测）'],
  ['G3', '1ea4abb', 'fix-3'],
  ['G4', '2bc02aa', '补 CJS require（报告未测）'],
  ['G5', 'c251fe9', 'fix-4 = 立项 HEAD'],
  ['G6', 'e509e06', 'AST（被验实现）'],
];

function safeCall(fn, input) {
  try {
    return { ok: true, out: fn(input) };
  } catch (e) {
    return { ok: false, out: `THROW:${e.message}` };
  }
}

function main() {
  const probes = probesWithSegments();
  const wt = loadWorktree();

  const impls = GEN_REPS.map(([g, rev, note]) => ({
    g,
    rev,
    note,
    A: loadMethodA(rev),
    B: loadMethodB(rev),
  }));

  // ---------- 活性自测 ----------
  console.log('=== 活性自测 ===');
  const L1in = "import{a}from'./no-space';";
  const L1 = impls.map((i) => safeCall(i.A, L1in).out);
  const l1ok =
    eq(L1[0], []) && eq(L1[4], []) && eq(L1[5], ['./no-space']);
  console.log(
    `L1 正向（已知分歧输入 ${JSON.stringify(L1in)}）：` +
      impls.map((i, k) => `${i.g}=${JSON.stringify(L1[k])}`).join('  '),
  );
  console.log(`   → 正则世代应为 [] 、AST 应抓到 ⇒ ${l1ok ? 'PASS 判据能看见已知目标' : 'FAIL'}`);

  const L2in = "import { a } from './plain';";
  const L2 = impls.map((i) => safeCall(i.A, L2in).out);
  const l2ok = L2.every((o) => eq(o, ['./plain']));
  console.log(
    `L2 负向（两侧都该对 ${JSON.stringify(L2in)}）：` +
      impls.map((i, k) => `${i.g}=${JSON.stringify(L2[k])}`).join('  '),
  );
  console.log(`   → 全部应为ic ["./plain"] ⇒ ${l2ok ? 'PASS 判据不误报' : 'FAIL'}`);

  const g6 = impls[5];
  const l3a = probes.every((p) => eq(safeCall(g6.A, p.input).out, safeCall(wt, p.input).out));
  const l3b = probes.every((p) => eq(safeCall(wt, p.input).out, p.expected));
  console.log(`L3 端到端：e509e06(MethodA) ≡ 工作树 ⇒ ${l3a ? 'PASS' : 'FAIL'};  ` +
    `工作树满足全部 10 条 expected ⇒ ${l3b ? 'PASS（复现 vitest 绿）' : 'FAIL'}`);

  let l4ok = true;
  for (const i of impls) {
    for (const p of probes) {
      if (!eq(safeCall(i.A, p.input).out, safeCall(i.B, p.input).out)) {
        l4ok = false;
        console.log(`   L4 分歧：${i.g} 探针#${p.idx}  A=${JSON.stringify(safeCall(i.A, p.input).out)} B=${JSON.stringify(safeCall(i.B, p.input).out)}`);
      }
    }
  }
  console.log(`L4 抽取保真：Method A（整文件逐字）≡ Method B（只抽两函数）⇒ ${l4ok ? 'PASS 抽取未改变语义' : 'FAIL'}`);

  // ---------- 主矩阵 ----------
  console.log('\n=== 主矩阵：每格 = 该世代 importSpecifiers(input) 是否满足该断言的 expected ===');
  console.log('（🔴 = 不满足 ⇒ 该形态在该世代上「红」；🟢 = 满足 ⇒「绿」）\n');
  const head = ['探针', ...impls.map((i) => i.g)].join('\t');
  console.log(head);
  const redCount = Object.fromEntries(impls.map((i) => [i.g, 0]));
  for (const p of probes) {
    const cells = impls.map((i) => {
      const r = safeCall(i.A, p.input);
      const green = eq(r.out, p.expected);
      if (!green) redCount[i.g] += 1;
      return green ? '🟢' : '🔴';
    });
    console.log(`#${p.idx}(${p.letter})\t${cells.join('\t')}`);
  }
  console.log(`\n各世代红格数：${impls.map((i) => `${i.g}=${redCount[i.g]}`).join('  ')}`);

  // ---------- (e)(f) 详表 ----------
  console.log('\n=== 争议焦点 (e)(f) 的逐世代原始返回值 ===');
  for (const p of probes.filter((x) => x.letter === 'e' || x.letter === 'f')) {
    console.log(`\n探针 #${p.idx} (${p.letter})  input=${JSON.stringify(p.input)}`);
    console.log(`  expected=${JSON.stringify(p.expected)}`);
    for (const i of impls) {
      const r = safeCall(i.A, p.input);
      console.log(
        `    ${i.g} ${i.rev} ${eq(r.out, p.expected) ? '🟢绿' : '🔴红'}  → ${JSON.stringify(r.out)}   (${i.note})`,
      );
    }
  }

  // ---------- 世代去重佐证 ----------
  const gens = enumerateGenerations();
  console.log('\n=== 世代代表 commit 的 (stripComments+importSpecifiers) sha256（前12） ===');
  for (const [g, rev] of GEN_REPS) {
    console.log(`  ${g} ${rev} ${gens.find((x) => x.rev === rev).hash.slice(0, 12)}`);
  }
}

main();
