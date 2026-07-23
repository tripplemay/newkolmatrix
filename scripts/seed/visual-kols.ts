// M2-B-CREATORS F004 —【P6】视觉基线确定性 Kol 夹具（CI visual job + 本地重生流程）。
//
// 2 行固定 publicId/canonicalHandle 的确定性创作者：
//   VK-FULL：深字段齐备（interests + credibility + fieldProvenance，dataSource='crawl'）
//     —— 抽屉「真值面」基线态（ProvenanceTag crawl 派生标注可见）
//   VK-NULL：深字段全 null（dataSource='user_upload'）
//     —— 抽屉「待接入面」基线态（逐子块降级占位）
// 双状态入基线 = §4.3 静默空白防御（数据源整个消失时 waitFor 硬红）。
//
// 幂等：(tenantId, canonicalHandle) upsert，重跑不产生重复行；publicId 首插固定。
// embedding 不灌（创作者库/抽屉不依赖向量；match 域夹具另有体系）。

import { prisma } from '../../src/lib/db/prisma';

const DEV_TENANT_SLUG = 'dev';

export const VISUAL_KOL_FULL_PUBLIC_ID = 'vk-visual-full-0001';
export const VISUAL_KOL_NULL_PUBLIC_ID = 'vk-visual-null-0002';

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEV_TENANT_SLUG },
    update: {},
    create: { slug: DEV_TENANT_SLUG, name: 'Dev Tenant' },
  });

  await prisma.kol.upsert({
    where: {
      tenantId_canonicalHandle: {
        tenantId: tenant.id,
        canonicalHandle: 'visual-fixture:vk-full',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      publicId: VISUAL_KOL_FULL_PUBLIC_ID,
      canonicalHandle: 'visual-fixture:vk-full',
      displayName: '基线夹具·深字段齐备',
      platform: 'youtube',
      handle: 'vk-full',
      followers: 9_990_000, // followers 降序恒居列表首行（点击锚点确定性）
      categories: ['基线夹具', 'gaming'],
      bio: '视觉基线确定性夹具（深字段齐备态）',
      dataSource: 'crawl',
      audienceDemo: { interests: ['基线夹具', 'gaming', 'sandbox'] },
      credibility: {
        score: 93,
        method: 'rule-derived-from-crawl',
        signals: ['平台认证 ✓', '互动质量分 0.80（采集侧实测）', '热度分层 hot'],
        assessedAt: '2026-07-23T00:00:00.000Z',
      },
      fieldProvenance: {
        audienceDemo: {
          source: 'crawl',
          fetchedAt: '2026-07-23T00:00:00.000Z',
          detail: '由创作者标签规则派生（非受众实测分布）',
        },
        credibility: {
          source: 'crawl',
          fetchedAt: '2026-07-23T00:00:00.000Z',
          detail: '由采集弱信号规则合成（verified/互动质量/热度分层）',
        },
      },
    },
  });

  await prisma.kol.upsert({
    where: {
      tenantId_canonicalHandle: {
        tenantId: tenant.id,
        canonicalHandle: 'visual-fixture:vk-null',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      publicId: VISUAL_KOL_NULL_PUBLIC_ID,
      canonicalHandle: 'visual-fixture:vk-null',
      displayName: '基线夹具·待接入态',
      platform: 'tiktok',
      handle: 'vk-null',
      followers: 9_980_000, // 恒居第二行
      categories: ['基线夹具'],
      bio: '视觉基线确定性夹具（深字段全 null 态）',
      dataSource: 'user_upload',
    },
  });

  console.log('[seed:visual-kols] ✅ 2 行确定性夹具就位（VK-FULL / VK-NULL）');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed:visual-kols] ❌', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
