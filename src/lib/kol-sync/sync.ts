// M2-B-CREATORS F003 — kol-sync 同步服务（apify-kol 拉模型，只读存量）。
//
// discover 全量分页（【P2】不带 platform 过滤）→ 字段映射 + F002 三派生 →
// upsert by (tenantId, canonicalHandle)（【P3】归一单点 canonical-handle.ts）→
// 新行 embedding 补灌（seed 管道同款「IS NULL 幂等」语义）。
//
// 【P1】零投喂零充值：本服务只消费 apify-kol 存量（我方服务 DB 读，零上游花费）；
// /admin/seeds 投喂与 TikHub 充值永留人工，此文件不出现任何写端点调用。
// 【P7】client / embedBatch 双注入：单测/集成测不打真服务不打网关。
//
// 覆盖语义（spec §2 F003）：apify 命中的既有行（含 CSV 来源）外采字段覆盖浅字段 +
// 写契约位 + dataSource='crawl'；CSV 独有行（apify 无此 handle）不动。
// 派生为 null 时显式写 DbNull（来源标签消失即诚实清空，不留陈旧派生值）。

import { Prisma } from '@prisma/client';
import { embedMany } from 'ai';
import { prisma } from 'lib/db/prisma';
import { embeddingModel } from 'lib/ai/gateway';
import {
  listKols,
  type ApifyKolClientDeps,
  type ListKolsParams,
} from 'lib/apify/client';
import type { ApifyKolListResponse, ApifyKolRow } from 'lib/apify/schemas';
import { deriveCanonicalHandle } from './canonical-handle';
import {
  deriveAudienceDemo,
  deriveCredibility,
  deriveFieldProvenance,
  normalizeTags,
} from './derive';

/** 分页页大小（上游上限 100）。 */
export const SYNC_PAGE_SIZE = 100;

/** 分页页数上限（防上游 total 异常导致的失控循环；100×300=3 万行，远超当前存量）。 */
export const SYNC_MAX_PAGES = 300;

/** embedding 批大小（网关 embed 单次上限 100，沿 seed EMBED_BATCH 口径）。 */
export const SYNC_EMBED_BATCH = 100;

/** 【P7】注入点。 */
export interface SyncKolsDeps {
  /** 分页拉取（默认真 client；测试注入分页假数据） */
  list?: (
    params: ListKolsParams,
    clientDeps?: ApifyKolClientDeps,
  ) => Promise<ApifyKolListResponse>;
  /** 批量 embedding（默认 AI SDK embedMany + 网关 bge-m3；测试注入定长假向量） */
  embedBatch?: (values: string[]) => Promise<number[][]>;
  /** 同步时点（assessedAt / fetchedAt 兜底），默认真时钟 */
  now?: () => Date;
}

export interface SyncKolsResult {
  pages: number;
  fetched: number;
  created: number;
  updated: number;
  /** 派生统计（诚实面：多少行拿到了派生深字段） */
  derivedAudience: number;
  derivedCredibility: number;
  embedded: number;
  /** 上限截断标记（no silent caps：截断必须显式可见） */
  truncated: boolean;
}

async function defaultEmbedBatch(values: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({ model: embeddingModel(), values });
  return embeddings;
}

/** 上游行 → Kol 浅字段映射（语义注记见各行）。 */
function mapShallow(row: ApifyKolRow) {
  const displayName = row.displayName?.trim() || row.username;
  const categories = normalizeTags(row.matchedTags ?? []);
  // engagementRate 派生：avgLikes/followers。
  // ⚠️ totalLikes 跨平台语义不一致（TT 真值 / IG 估算 / YT=views 平替 / X 曝光估算）
  // → YT/X 实为 view-based proxy，展示层需按 dataSource 语境理解（旧 kolmatrix 同款注记）。
  const er =
    row.totalLikes != null &&
    row.postsCount != null &&
    row.postsCount > 0 &&
    row.followers != null &&
    row.followers > 0
      ? Number((row.totalLikes / row.postsCount / row.followers).toFixed(6))
      : null;
  const avgViews =
    row.totalViews != null && row.postsCount != null && row.postsCount > 0
      ? Math.round(row.totalViews / row.postsCount)
      : null;
  return {
    displayName,
    platform: row.platform,
    handle: row.username,
    profileUrl: row.profileUrl ?? null,
    avatarUrl: row.avatarUrl ?? null,
    country: row.location ?? null, // YT 专有（~83% 填充）；其余平台 null
    followers: row.followers ?? null,
    avgViews,
    engagementRate: er,
    categories,
    bio: row.bio ?? null,
  };
}

/** embedding 源文本（seed 同源语义：displayName platform country categories bio）。 */
function buildEmbeddingText(shallow: ReturnType<typeof mapShallow>): string {
  return [
    shallow.displayName,
    shallow.platform,
    shallow.country,
    ...shallow.categories,
    shallow.bio,
  ]
    .filter(Boolean)
    .join(' ');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * 同步一轮：分页拉取 → 映射/派生 → 幂等 upsert → embedding 补灌（IS NULL 幂等）。
 * 网关/上游失败向上抛（调用方消化：例程静默跳过 / 手动入口明示）。
 */
export async function syncKols(
  tenantId: string,
  deps: SyncKolsDeps = {},
): Promise<SyncKolsResult> {
  const list = deps.list ?? listKols;
  const embedBatch = deps.embedBatch ?? defaultEmbedBatch;
  const nowIso = (deps.now ?? (() => new Date()))().toISOString();

  // ── 1. 分页拉取（【P2】全量无 platform 过滤）──
  const rows: ApifyKolRow[] = [];
  let page = 1;
  let total = Infinity;
  let truncated = false;
  while (rows.length < total) {
    if (page > SYNC_MAX_PAGES) {
      truncated = true;
      console.warn(
        `[kol-sync] 达页数上限 ${SYNC_MAX_PAGES}（no silent caps：本轮截断，已拉 ${rows.length}/${total}）`,
      );
      break;
    }
    const res = await list({ page, pageSize: SYNC_PAGE_SIZE });
    rows.push(...res.data);
    total = res.total;
    if (res.data.length === 0) break; // 上游翻页尽头兜底（total 漂移防护）
    page += 1;
  }

  // ── 2. 映射 + 派生 + upsert（幂等键 = (tenantId, canonicalHandle)【P3】）──
  const textByHandle = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let derivedAudience = 0;
  let derivedCredibility = 0;

  for (const row of rows) {
    const shallow = mapShallow(row);
    const canonicalHandle = deriveCanonicalHandle(
      row.profileUrl ?? undefined,
      row.platform,
      shallow.displayName,
    );
    textByHandle.set(canonicalHandle, buildEmbeddingText(shallow));

    const audienceDemo = deriveAudienceDemo(row);
    const credibility = deriveCredibility(row, nowIso);
    const fieldProvenance = deriveFieldProvenance({
      audienceDemo,
      credibility,
      fetchedAt: row.lastScrapedAt ?? nowIso,
    });
    if (audienceDemo) derivedAudience += 1;
    if (credibility) derivedCredibility += 1;

    // 派生 null → DbNull 显式清空（诚实：来源信号消失不留陈旧派生值）
    const deepFields = {
      audienceDemo: audienceDemo
        ? (audienceDemo as Prisma.InputJsonValue)
        : Prisma.DbNull,
      credibility: credibility
        ? (credibility as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      fieldProvenance:
        Object.keys(fieldProvenance).length > 0
          ? (fieldProvenance as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      dataSource: 'crawl', // 六档枚举内（P4；resolveProvenance 行级第②级恒可解析）
    };

    const existing = await prisma.kol.findUnique({
      where: { tenantId_canonicalHandle: { tenantId, canonicalHandle } },
      select: { id: true },
    });
    await prisma.kol.upsert({
      where: { tenantId_canonicalHandle: { tenantId, canonicalHandle } },
      create: { tenantId, canonicalHandle, ...shallow, ...deepFields },
      update: { ...shallow, ...deepFields },
    });
    if (existing) updated += 1;
    else created += 1;
  }

  // ── 3. embedding 补灌（seed 同款「IS NULL 幂等」：re-run 不重复 embed）──
  const missing = await prisma.$queryRawUnsafe<
    Array<{ id: string; canonicalHandle: string }>
  >(
    `SELECT id, "canonicalHandle" FROM "Kol" WHERE "tenantId" = $1 AND embedding IS NULL`,
    tenantId,
  );
  let embedded = 0;
  for (const batch of chunk(missing, SYNC_EMBED_BATCH)) {
    const values = batch.map(
      (r) => textByHandle.get(r.canonicalHandle) ?? r.canonicalHandle,
    );
    const embeddings = await embedBatch(values);
    await Promise.all(
      batch.map((r, i) =>
        prisma.$executeRawUnsafe(
          `UPDATE "Kol" SET embedding = $1::vector WHERE id = $2`,
          `[${embeddings[i].join(',')}]`,
          r.id,
        ),
      ),
    );
    embedded += batch.length;
  }

  return {
    pages: page - 1,
    fetched: rows.length,
    created,
    updated,
    derivedAudience,
    derivedCredibility,
    embedded,
    truncated,
  };
}
