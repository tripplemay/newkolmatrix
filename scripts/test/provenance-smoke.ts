// ARCH-M05 F004 — 渲染契约层冒烟（无 DB / 无网络，纯函数验证）
//
// 覆盖：A readContractSlot 三态（null / 有值 / 降级）+ 绝不填 0
//       B isPendingVerification「待核」判定（裁决 #2 口径）
//       C resolveProvenance 三级回退（字段级 → 实体级 → 保守下限）
//       D 读写不对称 sanity（§7.5.2：无值→待核占位；有值无溯源→ai_estimate 徽标）
//       E ProvenanceTag 双通道完备性（六档来源 图标+文字 全覆盖）
//
// 运行：npx tsx scripts/test/provenance-smoke.ts   退出码：0=全绿 / 1=任一失败

import { z } from 'zod';
import {
  dataSourceSchema,
  fieldProvenanceEntrySchema,
  fieldProvenanceSchema,
  isPendingVerification,
  readContractSlot,
  resolveProvenance,
} from '../../src/lib/data/provenance';
import { SOURCE_META } from '../../src/components/common/ProvenanceTag';

let pass = 0;
let fail = 0;

function check(name: string, fn: () => void): void {
  try {
    fn();
    pass += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`  FAIL ${name} — ${(e as Error).message}`);
  }
}

function expect(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

console.log('[provenance-smoke] 渲染契约层验证开始\n');

/* ── A. readContractSlot 三态 ─────────────────────────────── */
console.log('A. readContractSlot 三态（null / 有值 / 降级）');

check('A1 null 槽 → null（「待接入」语义，不抛错）', () => {
  expect(readContractSlot(z.number(), null, 'test.null') === null, '应返回 null');
});

check('A2 undefined 槽 → null（缺失即缺失）', () => {
  expect(
    readContractSlot(z.number(), undefined, 'test.undef') === null,
    '应返回 null',
  );
});

check('A3 有值且合法 → 原样解析返回', () => {
  const raw = { source: 'crawl', fetchedAt: '2026-07-17', confidence: 'high' };
  const v = readContractSlot(fieldProvenanceEntrySchema, raw, 'test.valid');
  expect(v !== null, '合法值不应为 null');
  expect(v!.source === 'crawl' && v!.confidence === 'high', '解析值应与输入一致');
});

check('A4 脏数据（形状不合法）→ 降级 null，不抛错', () => {
  const dirty = { source: 'hacked_source', confidence: 42 };
  const v = readContractSlot(fieldProvenanceEntrySchema, dirty, 'test.dirty');
  expect(v === null, '脏数据应降级为 null 而非抛错');
});

check('A5 数值槽缺失 → null，绝不合成 0 冒充实测', () => {
  const v = readContractSlot(z.number(), null, 'test.followers');
  expect(v === null && v !== 0, '缺失数值必须是 null，不得是 0');
});

/* ── B. isPendingVerification「待核」判定 ─────────────────── */
console.log('\nB. isPendingVerification（裁决 #2：字段缺失 / 契约层 null → 待核）');

check('B1 值为 null → 待核', () => {
  expect(isPendingVerification(null) === true, 'null 应判定待核');
});

check('B2 值为 undefined → 待核', () => {
  expect(isPendingVerification(undefined) === true, 'undefined 应判定待核');
});

check('B3 有值（含 0 / 空串等 falsy 实测值）→ 非待核，有值即显', () => {
  expect(isPendingVerification(0) === false, '实测 0 是合法值');
  expect(isPendingVerification('') === false, '空串是值，非缺失');
  expect(isPendingVerification({ geoDist: [] }) === false, '对象值非缺失');
});

check('B4 有值但溯源链空（FR-11.9 空依据非法）→ 待核', () => {
  expect(isPendingVerification('卖点文本', []) === true, '空链应判定待核');
  expect(isPendingVerification('卖点文本', null) === true, 'null 链应判定待核');
});

check('B5 有值且溯源链非空 → 非待核', () => {
  expect(isPendingVerification('卖点文本', ['mat-1']) === false, '有链应通过');
});

/* ── C. resolveProvenance 三级回退 ────────────────────────── */
console.log('\nC. resolveProvenance 三级回退（字段级 → 实体级 → 保守下限）');

const fieldEntry = {
  source: 'crawl',
  fetchedAt: '2026-07-17T00:00:00Z',
  confidence: 'high',
};

check('C1 ① 字段级覆盖命中 → resolvedFrom=field，值取自条目', () => {
  const p = resolveProvenance(
    {
      dataSource: 'platform_api',
      fieldProvenance: { 'audienceDemo.geoDist': fieldEntry },
    },
    'audienceDemo.geoDist',
  );
  expect(p.resolvedFrom === 'field', `层级应为 field，实为 ${p.resolvedFrom}`);
  expect(p.source === 'crawl' && p.confidence === 'high', '应取字段级条目值');
});

check('C2 ② 字段级未命中 → 行级 dataSource（confidence/fetchedAt 置 null）', () => {
  const p = resolveProvenance(
    { dataSource: 'purchased', fieldProvenance: { followers: fieldEntry } },
    'engagementRate',
  );
  expect(p.resolvedFrom === 'row', `层级应为 row，实为 ${p.resolvedFrom}`);
  expect(p.source === 'purchased', '应取行级来源');
  expect(p.confidence === null && p.fetchedAt === null, '行级无字段细节');
});

check('C3 ③ 双空 → fallback ai_estimate（保守下限，绝不冒充实测）', () => {
  const p = resolveProvenance({ dataSource: null, fieldProvenance: null }, 'followers');
  expect(p.resolvedFrom === 'fallback', `层级应为 fallback，实为 ${p.resolvedFrom}`);
  expect(p.source === 'ai_estimate', '兜底必须是 ai_estimate 最低档');
});

check('C4 脏 fieldProvenance → 降级走行级，不抛错', () => {
  const p = resolveProvenance(
    { dataSource: 'optin', fieldProvenance: 'not-an-object' },
    'followers',
  );
  expect(p.resolvedFrom === 'row' && p.source === 'optin', '脏字段级应降级到行级');
});

check('C5 脏 dataSource + 无字段级 → 降级到 fallback，不抛错', () => {
  const p = resolveProvenance(
    { dataSource: 'made_up_source', fieldProvenance: null },
    'followers',
  );
  expect(
    p.resolvedFrom === 'fallback' && p.source === 'ai_estimate',
    '脏行级应降级到保守下限',
  );
});

/* ── D. 读写不对称 sanity（§7.5.2）─────────────────────────── */
console.log('\nD. 读写不对称（值缺失→待核占位；值在溯源空→ai_estimate 徽标）');

check('D1 字段值 null → 待核占位（无数据点、无徽标）', () => {
  const audienceDemo = null;
  expect(isPendingVerification(audienceDemo) === true, '值缺失走占位分支');
});

check('D2 字段值存在、溯源链空 → 数据点 + ai_estimate 徽标（永不裸展示）', () => {
  const followers = 182000; // 值存在 → 渲染数据点
  expect(isPendingVerification(followers) === false, '有值即显');
  const p = resolveProvenance({ dataSource: null, fieldProvenance: null }, 'followers');
  expect(p.source === 'ai_estimate', '徽标强制降到最低可信档，FR-11.19');
});

/* ── E. ProvenanceTag 双通道完备性 ────────────────────────── */
console.log('\nE. ProvenanceTag 来源双通道（图标+文字，六档全覆盖）');

check('E1 SOURCE_META 覆盖全部 DataSource 且每档 图标+文字 齐备', () => {
  const sources = dataSourceSchema.options;
  expect(sources.length === 6, `来源应为 6 档，实为 ${sources.length}`);
  for (const s of sources) {
    const meta = SOURCE_META[s];
    expect(!!meta, `${s} 缺 SOURCE_META 条目`);
    expect(meta.label.length > 0, `${s} 缺文字通道`);
    expect(typeof meta.Icon === 'function', `${s} 缺图标通道`);
  }
});

check('E2 fieldProvenanceSchema 可整表解析（多字段 map）', () => {
  const map = readContractSlot(
    fieldProvenanceSchema,
    {
      followers: { source: 'platform_api', fetchedAt: null, confidence: null },
      'audienceDemo.geoDist': fieldEntry,
    },
    'test.map',
  );
  expect(map !== null && Object.keys(map!).length === 2, '整表解析应保留两条');
});

/* ── 汇总 ─────────────────────────────────────────────────── */
console.log(`\n[provenance-smoke] 汇总：PASS ${pass} / FAIL ${fail}（共 ${pass + fail} 例）`);
if (fail > 0) {
  console.log('[provenance-smoke] ✗ 存在失败用例');
  process.exit(1);
}
console.log('[provenance-smoke] ✓ 全绿');
