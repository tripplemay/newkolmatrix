// M2-B-CREATORS F003 — kol-sync 同步服务集成测试（打真库 + mock client/embed P7）。
//
// 断言设计：
// 1. 首跑闭环：分页拉取 → 浅字段映射 + 三派生落库（parse* 可读回）+ dataSource='crawl' +
//    embedding 补灌（IS NULL 幂等语义）；
// 2. 幂等二跑：行数不增、全 updated、embedding 不重复灌；
// 3. CSV 行覆盖合并：同 canonicalHandle 的既有行被外采覆盖（浅字段 + 契约位 + crawl）；
// 4. CSV 独有行不动：apify 无此 handle 的行保持原值；
// 5. 【P4】normalizeDataSource：dry-run 只报不改 / apply 后 csv-seed:* → user_upload、
//    crawl 行不触碰、二跑命中 0（幂等）；
// 6. 注册表：ROUTINES 含 kol-sync @ 0 3 * * *（注册表化口径）；
// 7. 截断显式：超页上限 truncated=true（no silent caps）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { syncKols } from '../../src/lib/kol-sync/sync';
import { normalizeDataSource } from '../../src/lib/kol-sync/normalize-datasource';
import { deriveCanonicalHandle } from '../../src/lib/kol-sync/canonical-handle';
import {
  parseAudienceDemo,
  parseCredibility,
} from '../../src/lib/data/schemas/kol-deep';
import { KOL_SYNC_CRON, ROUTINES } from '../../src/lib/jobs/scheduler';
import type { ApifyKolRow } from '../../src/lib/apify/schemas';

const FIXTURE_SLUG = `test-tenant-m2b-sync-${process.pid}`;
const DIMS = 1024;

let tenantId: string;

/** 上游假行（形状按真样本子集）。 */
function apifyRow(over: Partial<ApifyKolRow>): ApifyKolRow {
  return {
    id: 'r1',
    platform: 'youtube',
    platformUserId: 'UC-1',
    username: 'chan1',
    displayName: '频道一',
    bio: 'bio text',
    profileUrl: 'https://www.youtube.com/channel/UC-1',
    followers: 100_000,
    postsCount: 100,
    totalLikes: 1_000_000,
    totalViews: 5_000_000,
    verified: true,
    tier: 'hot',
    matchedTags: ['Minecraft', 'gaming'],
    lastScrapedAt: '2026-07-20T00:00:00.000Z',
    ...over,
  } as ApifyKolRow;
}

const UPSTREAM: ApifyKolRow[] = [
  apifyRow({}),
  apifyRow({
    id: 'r2',
    platform: 'instagram',
    platformUserId: 'ig-2',
    username: 'insta2',
    displayName: 'Insta 二',
    profileUrl: 'https://instagram.com/insta2',
    verified: null,
    qualityScore: null,
    tier: null,
    matchedTags: [],
    businessCategory: '',
    followers: 5000,
    postsCount: null,
    totalLikes: null,
    totalViews: null,
  }),
  // 与「CSV 既有行」同 canonicalHandle（覆盖合并锚点）
  apifyRow({
    id: 'r3',
    platform: 'youtube',
    platformUserId: 'UC-CSV',
    username: 'csvchan',
    displayName: 'CSV 频道新名',
    profileUrl: 'https://www.youtube.com/@csvchan',
    followers: 200_000,
    matchedTags: ['fps'],
  }),
];

/** mock 分页 client：pageSize 2 → 2 页。 */
const mockList = async ({
  page,
  pageSize = 100,
}: {
  page: number;
  pageSize?: number;
}) => {
  const start = (page - 1) * pageSize;
  return {
    data: UPSTREAM.slice(start, start + pageSize),
    page,
    pageSize,
    total: UPSTREAM.length,
  };
};

const mockEmbedBatch = async (values: string[]): Promise<number[][]> =>
  values.map(() => {
    const v = new Array<number>(DIMS).fill(0);
    v[0] = 1;
    return v;
  });

const SYNC_DEPS = {
  list: mockList,
  embedBatch: mockEmbedBatch,
  now: () => new Date('2026-07-23T03:00:00.000Z'),
};

let csvHitId: string; // 与 r3 同 handle 的既有行（会被覆盖）
let csvOnlyId: string; // apify 无此 handle 的既有行（不动）

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2B sync 集成测试夹具租户' },
  });
  tenantId = t.id;

  const hit = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: deriveCanonicalHandle(
        'https://www.youtube.com/@csvchan',
        'youtube',
        'CSV 频道',
      ),
      displayName: 'CSV 频道旧名',
      platform: 'youtube',
      followers: 1,
      dataSource: 'csv-seed:kol-seed-enriched-final.csv',
    },
  });
  csvHitId = hit.id;

  const only = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: 'youtube:csv-only',
      displayName: 'CSV 独有行',
      platform: 'youtube',
      followers: 42,
      dataSource: 'csv-seed:kol-seed-enriched-final.csv',
    },
  });
  csvOnlyId = only.id;
});

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册表（F006 注册表化口径延续）', () => {
  it('ROUTINES 含 kol-sync @ 0 3 * * *（三例程错峰）', () => {
    const names = ROUTINES.map((r) => r.name);
    expect(names).toEqual(['health-scan', 'nightly-screen', 'kol-sync']);
    expect(ROUTINES[2].cron).toBe(KOL_SYNC_CRON);
    expect(KOL_SYNC_CRON).toBe('0 3 * * *');
  });
});

describe('syncKols 首跑闭环', () => {
  it('分页拉取 + 映射/派生落库 + crawl 归一 + embedding 补灌', async () => {
    const r = await syncKols(tenantId, { ...SYNC_DEPS });
    expect(r.fetched).toBe(3);
    expect(r.created).toBe(2); // r1/r2 新建
    expect(r.updated).toBe(1); // r3 命中 CSV 行
    expect(r.truncated).toBe(false);
    expect(r.derivedAudience).toBe(2); // r1(tags)/r3(fps)；r2 全空 → null
    // fix_round 1（五因子）：r2 有 followers → 也派生 credibility（followers-only 路径）
    expect(r.derivedCredibility).toBe(3); // r1(verified+quality+tier+followers)/r2(followers)/r3
    expect(r.embedded).toBeGreaterThanOrEqual(3); // 3 行同步行 + csv-only 行（IS NULL 全补）

    const r1 = await prisma.kol.findUniqueOrThrow({
      where: {
        tenantId_canonicalHandle: {
          tenantId,
          canonicalHandle: 'youtube.com/channel/uc-1',
        },
      },
    });
    expect(r1.displayName).toBe('频道一');
    expect(r1.categories).toEqual(['Minecraft', 'gaming']);
    expect(r1.engagementRate).toBeCloseTo(0.1, 5); // 1e6/100/1e5
    expect(r1.avgViews).toBe(50_000);
    expect(r1.dataSource).toBe('crawl');
    // 派生契约位可读回（读侧 parse*）
    const demo = parseAudienceDemo(r1.audienceDemo);
    expect(demo?.interests).toEqual(['Minecraft', 'gaming']);
    const cred = parseCredibility(r1.credibility);
    expect(cred?.method).toBe('rule-derived-from-crawl');
    expect(cred?.signals.length).toBeGreaterThan(0);
    expect(r1.fieldProvenance).toMatchObject({
      audienceDemo: { source: 'crawl' },
      credibility: { source: 'crawl' },
    });

    // r2：标签全空 → audienceDemo null（不编造）；followers 在场 → credibility
    // followers-only 派生（fix_round 1 五因子；signals 必带依据）
    const r2 = await prisma.kol.findUniqueOrThrow({
      where: {
        tenantId_canonicalHandle: {
          tenantId,
          canonicalHandle: 'instagram.com/insta2',
        },
      },
    });
    expect(r2.audienceDemo).toBeNull();
    const r2Cred = parseCredibility(r2.credibility);
    expect(r2Cred).not.toBeNull();
    expect(r2Cred!.signals).toEqual(['粉丝规模 5,000']);
    expect(r2.fieldProvenance).toMatchObject({
      credibility: { source: 'crawl' },
    });
    expect(
      (r2.fieldProvenance as Record<string, unknown>).audienceDemo,
    ).toBeUndefined(); // 未派生字段不标注（读写不对称）

    // embedding 补灌实证（含 csv-only 行）
    const nullCount = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM "Kol" WHERE "tenantId" = $1 AND embedding IS NULL`,
      tenantId,
    );
    expect(Number(nullCount[0].n)).toBe(0);
  });

  it('CSV 行覆盖合并（同 canonicalHandle）：浅字段 + 契约位 + crawl', async () => {
    const hit = await prisma.kol.findUniqueOrThrow({ where: { id: csvHitId } });
    expect(hit.displayName).toBe('CSV 频道新名');
    expect(hit.followers).toBe(200_000);
    expect(hit.dataSource).toBe('crawl');
    expect(parseAudienceDemo(hit.audienceDemo)?.interests).toEqual(['fps']);
  });

  it('CSV 独有行不动（apify 无此 handle）', async () => {
    const only = await prisma.kol.findUniqueOrThrow({
      where: { id: csvOnlyId },
    });
    expect(only.displayName).toBe('CSV 独有行');
    expect(only.followers).toBe(42);
    expect(only.dataSource).toBe('csv-seed:kol-seed-enriched-final.csv');
    expect(only.audienceDemo).toBeNull();
  });
});

describe('幂等二跑', () => {
  it('行数不增、全 updated、embedding 不重复灌', async () => {
    const before = await prisma.kol.count({ where: { tenantId } });
    const r = await syncKols(tenantId, { ...SYNC_DEPS });
    expect(r.created).toBe(0);
    expect(r.updated).toBe(3);
    expect(r.embedded).toBe(0); // IS NULL 幂等：无缺灌行
    expect(await prisma.kol.count({ where: { tenantId } })).toBe(before);
  });
});

describe('normalizeDataSource（【P4】存量归一）', () => {
  it('dry-run 只报不改；apply 后 csv-seed:* → user_upload；crawl 不触碰；二跑命中 0', async () => {
    const dry = await normalizeDataSource(tenantId, { apply: false });
    expect(dry).toEqual({ matched: 1, updated: 0, applied: false }); // 仅 csv-only 行
    expect(
      (await prisma.kol.findUniqueOrThrow({ where: { id: csvOnlyId } }))
        .dataSource,
    ).toContain('csv-seed'); // dry-run 未改

    const applied = await normalizeDataSource(tenantId, { apply: true });
    expect(applied).toEqual({ matched: 1, updated: 1, applied: true });
    expect(
      (await prisma.kol.findUniqueOrThrow({ where: { id: csvOnlyId } }))
        .dataSource,
    ).toBe('user_upload');
    expect(
      (await prisma.kol.findUniqueOrThrow({ where: { id: csvHitId } }))
        .dataSource,
    ).toBe('crawl'); // crawl 行不触碰

    const again = await normalizeDataSource(tenantId, { apply: true });
    expect(again.matched).toBe(0); // 幂等
  });
});

describe('截断显式（no silent caps）', () => {
  it('上游 total 异常大时 truncated=true 且不失控循环', async () => {
    const r = await syncKols(tenantId, {
      ...SYNC_DEPS,
      list: async ({ page, pageSize = 100 }) => ({
        // 恒返 1 行 + 虚高 total：翻页永不满足 rows>=total
        data: [
          apifyRow({
            id: `x${page}`,
            username: `x${page}`,
            profileUrl: `https://youtube.com/@x${page}`,
          }),
        ].slice(0, pageSize),
        page,
        pageSize,
        total: 10_000_000,
      }),
    });
    expect(r.truncated).toBe(true);
  }, 120_000);
});
