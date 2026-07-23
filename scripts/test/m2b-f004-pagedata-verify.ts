// M2-B-CREATORS F004 验收脚本（Evaluator：Andy/evaluator-subagent，2026-07-23）
// 1) 夹具双行在场核验（P6 基线态）  2) KPI 4 卡真计数核验  3) RSC 数据层直调（loadCreatorsPageData）
// 4) 筛选真值域 + URL 边界回落  5) 改→验→复原（sentinel 行经数据层实时可见后删除，D-H 清态）
// 运行：node --env-file=.env --import tsx scripts/test/m2b-f004-pagedata-verify.ts
import { prisma } from '../../src/lib/db/prisma';
import { getDevTenantId } from '../../src/lib/agent/context';
import { loadCreatorsPageData, LIST_LIMIT } from '../../src/lib/creators/page-data';

const SENTINEL_HANDLE = 'evaluator-f004:sentinel';

function assert(cond: boolean, label: string) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const tenantId = await getDevTenantId();

  // ── 0. 残留清理（幂等，防上次中断）
  await prisma.kol.deleteMany({ where: { tenantId, canonicalHandle: SENTINEL_HANDLE } });

  // ── 1. 基线态：总量 + dataSource 分布 + 夹具双行
  const total = await prisma.kol.count({ where: { tenantId } });
  const bySource = await prisma.kol.groupBy({ by: ['dataSource'], where: { tenantId }, _count: true });
  console.log('Kol total =', total, '| dataSource 分布 =', JSON.stringify(bySource.map((s) => `${s.dataSource}:${s._count}`)));
  assert(total === 2526, `基线总量 2526（2524 CSV + 2 夹具）实测=${total}`);

  const vkFull = await prisma.kol.findUnique({ where: { publicId: 'vk-visual-full-0001' } });
  const vkNull = await prisma.kol.findUnique({ where: { publicId: 'vk-visual-null-0002' } });
  assert(
    vkFull != null && vkFull.dataSource === 'crawl' && vkFull.credibility != null && vkFull.audienceDemo != null && vkFull.fieldProvenance != null,
    'VK-FULL 在场且深字段齐备（crawl）',
  );
  assert(
    vkNull != null && vkNull.dataSource === 'user_upload' && vkNull.credibility == null && vkNull.audienceDemo == null,
    'VK-NULL 在场且深字段全 null（user_upload）',
  );

  // ── 2. RSC 数据层直调（无筛选）
  const d = await loadCreatorsPageData(tenantId, {});
  assert(d.totalCount === total, `totalCount=${d.totalCount} 与 DB 全量一致`);
  assert(d.rows.length === LIST_LIMIT && d.listTruncated, `LIST_LIMIT=${LIST_LIMIT} 截断（rows=${d.rows.length}, truncated=${d.listTruncated}）`);
  assert(d.rows[0].publicId === 'vk-visual-full-0001', `followers 降序首行 = VK-FULL（实测 ${d.rows[0].publicId} / ${d.rows[0].name}）`);
  assert(d.rows[1].publicId === 'vk-visual-null-0002', `第二行 = VK-NULL（实测 ${d.rows[1].publicId}）`);
  assert(d.rows.every((r) => r.match === null), 'P5：受众匹配列全行恒 null（待核，不编造）');
  assert(d.rows.every((r) => r.reuse === null), '历史合作全行 null（无 CRM 源 → —）');
  assert(d.rows[0].cred === 'A', `VK-FULL credibility 93 → A 级（实测 ${d.rows[0].cred}）`);
  assert(d.rows[1].cred === null && d.rows[1].ad === 'warn', `VK-NULL cred=null(待核) / ad=warn(待核)（实测 ${d.rows[1].cred}/${d.rows[1].ad}）`);
  assert(d.rows[0].ad === 'warn', `VK-FULL 无 brandSafety → ad=warn 待核（实测 ${d.rows[0].ad}）`);

  // KPI 4 卡
  const kpiMap = Object.fromEntries(d.kpis.map((k) => [k.id, k.value]));
  console.log('KPI =', JSON.stringify(kpiMap));
  assert(kpiMap['total'] === String(total), `KPI 库内创作者 = ${kpiMap['total']}（全量真值，非截断值）`);
  assert(kpiMap['reuse'] === '待接入', 'KPI 本季度复用 = 待接入（无 CRM 源诚实降级）');
  assert(kpiMap['match'] === '待核', 'KPI 平均受众匹配 = 待核（P5）');
  assert(kpiMap['premium'] === '1', `KPI 高价值可复用 = A 级真计数（实测 ${kpiMap['premium']}，库内唯一 A=VK-FULL score93）`);

  // 筛选真值域
  console.log('platformFilters =', JSON.stringify(d.platformFilters));
  console.log('categoryFilters =', JSON.stringify(d.categoryFilters));
  assert(d.platformFilters[0] === '全部' && d.platformFilters.length > 1, '平台值域 = 全部 + 库内实际出现平台');
  assert(d.categoryFilters[0] === '全部品类' && d.categoryFilters.length === 5, '品类值域 = 全部品类 + top4 频次');

  // ── 3. 服务端筛选 + URL 边界回落
  const dt = await loadCreatorsPageData(tenantId, { platform: 'TikTok' });
  assert(
    dt.platform === 'TikTok' && dt.rows.length > 0 && dt.rows.every((r) => r.plat.startsWith('TikTok')),
    `platform=TikTok 服务端过滤生效（rows=${dt.rows.length} 全 TikTok）`,
  );
  const dc = await loadCreatorsPageData(tenantId, { category: d.categoryFilters[1] });
  assert(dc.category === d.categoryFilters[1] && dc.rows.length > 0, `category=${d.categoryFilters[1]} 过滤生效（rows=${dc.rows.length}）`);
  const dbad = await loadCreatorsPageData(tenantId, { platform: "'; DROP TABLE--", category: '不存在的品类' });
  assert(dbad.platform === '全部' && dbad.category === '全部品类', 'URL 未知/恶意值回落默认（不信任外部输入）');

  // ── 4. 改→验→复原（RSC 组装层实时性：sentinel 插入 → 数据层立即可见 → 删除复原）
  await prisma.kol.create({
    data: {
      tenantId,
      publicId: 'eval-f004-sentinel',
      canonicalHandle: SENTINEL_HANDLE,
      displayName: 'EVAL-SENTINEL-F004',
      platform: 'youtube',
      handle: 'eval-sentinel',
      followers: 99_990_000,
      categories: ['evaluator-probe'],
      dataSource: 'user_upload',
    },
  });
  const d2 = await loadCreatorsPageData(tenantId, {});
  assert(
    d2.rows[0].name === 'EVAL-SENTINEL-F004' && d2.totalCount === total + 1,
    `改：sentinel 立即出现在首行且 totalCount=${d2.totalCount}（RSC 数据层实时直读 DB）`,
  );
  await prisma.kol.deleteMany({ where: { tenantId, canonicalHandle: SENTINEL_HANDLE } });
  const d3 = await loadCreatorsPageData(tenantId, {});
  assert(
    d3.rows[0].publicId === 'vk-visual-full-0001' && d3.totalCount === total,
    `复原：sentinel 已删，首行回 VK-FULL，totalCount=${d3.totalCount}（D-H 清态）`,
  );

  // ── 5. 终态清点（D-H：夹具与 2524 基线不动）
  const finalTotal = await prisma.kol.count({ where: { tenantId } });
  assert(finalTotal === total, `终态 Kol=${finalTotal} 与验前一致（无残留）`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ 脚本异常:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
