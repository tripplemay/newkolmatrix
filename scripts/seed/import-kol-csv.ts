// AGENT-FOUNDATION F004 — CSV seed：~2500 真实 KOL + bge-m3 embedding 入 pgvector（单 dev 用户）
//
// 解析 kol-seed-enriched-final.csv（真正的 RFC4180 parser——该 CSV 内嵌逗号/引号泛滥，naive split 会散架）
// → 规范化 → 幂等 upsert（(tenantId, canonicalHandle)）→ 用 F003 gateway bge-m3 生成向量入 pgvector。
//
// 运行：
//   npm run seed:kol                       # 默认 CSV = scripts/seed/data/kol-seed-enriched-final.csv
//   npm run seed:kol -- <path-to.csv>      # 指定 CSV（脏 CSV 测试用）
//
// 退出码：0 = 成功；非 0 = 脏 CSV（表头缺必需列 / 存在缺必需字段的行）或异常。
//
// 幂等：(tenantId, canonicalHandle) upsert；仅对 embedding IS NULL 的行调 bge-m3（re-run 不重复 embed）。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { embedMany } from 'ai';
import { prisma } from '../../src/lib/db/prisma';
import { embeddingModel, EMBEDDING_DIMENSIONS } from '../../src/lib/ai/gateway';

const DEV_TENANT_SLUG = 'dev';
const DEV_USER_EMAIL = 'dev@newkolmatrix.local';
const DATA_SOURCE = 'csv-seed:kol-seed-enriched-final.csv';
const EMBED_BATCH = 100; // 网关 embed 单次上限 100
const UPSERT_CONCURRENCY = 100;

// 列名别名（中文主 + 英文兜底）——满足 acceptance「列名别名」。
const COLUMN_ALIASES: Record<string, string[]> = {
  platform: ['平台', 'platform'],
  name: ['昵称', 'name', 'nickname', 'handle'],
  url: ['频道链接', 'url', 'channel', 'link', 'channelUrl'],
  region: ['地区', 'region', 'country'],
  followers: ['粉丝数', 'followers', 'fans', 'subscribers'],
  isGame: ['是否游戏', 'is_game', 'isGame'],
  category: ['类目', 'category', 'categories'],
  reason: ['AI 判断理由', 'AI判断理由', 'reason', 'ai_reason'],
};
const REQUIRED_FIELDS = ['platform', 'name', 'url'] as const;

interface NormalizedKol {
  canonicalHandle: string;
  displayName: string | null;
  platform: string | null;
  handle: string | null;
  profileUrl: string | null;
  country: string | null;
  followers: number | null;
  categories: string[];
  bio: string | null;
  dataSource: string;
  embeddingText: string;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** 把表头映射到字段 → 列名；缺任一必需列抛错（脏 CSV 结构性失败）。 */
function resolveColumns(header: string[]): Record<string, string> {
  const norm = header.map((h) => stripBom(h).trim());
  const map: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const hit = norm.find((h) => aliases.some((a) => a.toLowerCase() === h.toLowerCase()));
    if (hit) map[field] = hit;
  }
  const missing = REQUIRED_FIELDS.filter((f) => !map[f]);
  if (missing.length > 0) {
    throw new Error(
      `脏 CSV：表头缺必需列 [${missing.join(', ')}]。实际表头: ${norm.join(' | ')}`,
    );
  }
  return map;
}

/** 粉丝数容错解析：去逗号/空格，支持 万/w/k/m/亿 后缀。 */
function parseFollowers(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().replace(/[,，\s]/g, '');
  if (s === '') return null;
  const m = s.match(/^([0-9]+(?:\.[0-9]+)?)([万wWkKmM亿]?)$/);
  if (!m) {
    const plain = Number(s);
    return Number.isFinite(plain) ? Math.round(plain) : null;
  }
  const base = Number(m[1]);
  const mult =
    { '万': 1e4, w: 1e4, W: 1e4, k: 1e3, K: 1e3, m: 1e6, M: 1e6, '亿': 1e8 }[m[2]] ?? 1;
  return Math.round(base * mult);
}

/** 从频道 URL 派生稳定唯一 canonicalHandle：youtube.com/@handle（小写，去协议/www/尾斜杠）。 */
function deriveCanonicalHandle(
  url: string | undefined,
  platform: string,
  name: string,
): string {
  const u = (url ?? '').trim();
  if (u) {
    const cleaned = u
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/+$/, '')
      .toLowerCase();
    if (cleaned) return cleaned;
  }
  const slug = name.trim().toLowerCase().replace(/\s+/g, '-') || 'unknown';
  return `${platform.toLowerCase()}:${slug}`;
}

function get(row: Record<string, string>, cols: Record<string, string>, field: string): string {
  const col = cols[field];
  return col ? (row[col] ?? '').trim() : '';
}

function normalizeRow(
  row: Record<string, string>,
  cols: Record<string, string>,
): NormalizedKol | { error: string } {
  const platform = get(row, cols, 'platform').toLowerCase();
  const name = get(row, cols, 'name');
  const url = get(row, cols, 'url');
  if (!platform || (!name && !url)) {
    return { error: `缺必需字段（platform=${platform || '空'} name/url 均空）` };
  }
  const region = get(row, cols, 'region') || null;
  const reason = get(row, cols, 'reason') || null;
  const category = get(row, cols, 'category');
  const isGame = get(row, cols, 'isGame');
  const categories: string[] = [];
  if (category) categories.push(category);
  if (isGame === '是' || isGame.toLowerCase() === 'true' || isGame.toLowerCase() === 'yes') {
    categories.push('gaming');
  }
  const handle = url ? url.replace(/\/+$/, '').split('/').pop() ?? null : name || null;
  const displayName = name || handle;
  const embeddingText = [displayName, platform, region, ...categories, reason]
    .filter(Boolean)
    .join(' ');
  return {
    canonicalHandle: deriveCanonicalHandle(url, platform, name),
    displayName: displayName || null,
    platform,
    handle,
    profileUrl: url || null,
    country: region,
    followers: parseFollowers(get(row, cols, 'followers')),
    categories,
    bio: reason,
    dataSource: DATA_SOURCE,
    embeddingText,
  };
}

async function seedDevTenantUser(): Promise<string> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEV_TENANT_SLUG },
    update: {},
    create: { slug: DEV_TENANT_SLUG, name: 'Dev Tenant' },
  });
  await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: {},
    create: { tenantId: tenant.id, email: DEV_USER_EMAIL, name: 'Dev User' },
  });
  return tenant.id;
}

async function chunkedForEach<T>(
  items: T[],
  size: number,
  fn: (chunk: T[], batchIndex: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await fn(items.slice(i, i + size), i / size);
  }
}

async function upsertKols(tenantId: string, kols: NormalizedKol[]): Promise<void> {
  let done = 0;
  await chunkedForEach(kols, UPSERT_CONCURRENCY, async (chunk) => {
    await Promise.all(
      chunk.map((k) =>
        prisma.kol.upsert({
          where: { tenantId_canonicalHandle: { tenantId, canonicalHandle: k.canonicalHandle } },
          update: {
            displayName: k.displayName,
            platform: k.platform,
            handle: k.handle,
            profileUrl: k.profileUrl,
            country: k.country,
            followers: k.followers,
            categories: k.categories,
            bio: k.bio,
            dataSource: k.dataSource,
          },
          create: {
            tenantId,
            canonicalHandle: k.canonicalHandle,
            displayName: k.displayName,
            platform: k.platform,
            handle: k.handle,
            profileUrl: k.profileUrl,
            country: k.country,
            followers: k.followers,
            categories: k.categories,
            bio: k.bio,
            dataSource: k.dataSource,
          },
        }),
      ),
    );
    done += chunk.length;
    console.log(`[seed] upsert ${done}/${kols.length}`);
  });
}

/** 仅对 embedding IS NULL 的行生成 bge-m3 向量入 pgvector（幂等：re-run 不重复 embed）。 */
async function embedMissing(
  tenantId: string,
  textByHandle: Map<string, string>,
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; canonicalHandle: string }>>(
    `SELECT id, "canonicalHandle" FROM "Kol" WHERE "tenantId" = $1 AND embedding IS NULL`,
    tenantId,
  );
  if (rows.length === 0) {
    console.log('[seed] 所有 KOL 已有 embedding，跳过（幂等）');
    return 0;
  }
  console.log(`[seed] 需 embedding 的 KOL: ${rows.length}，分 ${EMBED_BATCH}/批`);
  let embedded = 0;
  await chunkedForEach(rows, EMBED_BATCH, async (chunk, batchIndex) => {
    const values = chunk.map((r) => textByHandle.get(r.canonicalHandle) ?? r.canonicalHandle);
    const { embeddings } = await embedMany({ model: embeddingModel(), values });
    await Promise.all(
      chunk.map((r, i) => {
        const vec = `[${embeddings[i].join(',')}]`;
        return prisma.$executeRawUnsafe(
          `UPDATE "Kol" SET embedding = $1::vector WHERE id = $2`,
          vec,
          r.id,
        );
      }),
    );
    embedded += chunk.length;
    console.log(`[seed] embedding batch ${batchIndex + 1}：+${chunk.length}（累计 ${embedded}/${rows.length}）`);
  });
  return embedded;
}

/** cosine sanity：NL query → bge-m3 → top-K，验证返回相关结果。 */
async function cosineSanity(tenantId: string): Promise<void> {
  const query = 'World of Tanks 坦克世界 游戏解说 replay';
  const { embeddings } = await embedMany({ model: embeddingModel(), values: [query] });
  const vec = `[${embeddings[0].join(',')}]`;
  const top = await prisma.$queryRawUnsafe<
    Array<{ displayName: string | null; distance: number }>
  >(
    `SELECT "displayName", (embedding <=> $1::vector) AS distance
     FROM "Kol" WHERE "tenantId" = $2 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector LIMIT 5`,
    vec,
    tenantId,
  );
  console.log(`[seed] cosine sanity  query="${query}"  top-5:`);
  top.forEach((r, i) =>
    console.log(`   ${i + 1}. ${r.displayName ?? '(无名)'}  distance=${Number(r.distance).toFixed(4)}`),
  );
  if (top.length === 0) throw new Error('cosine 查询返回 0 结果——embedding 可能未入库');
}

async function main(): Promise<void> {
  const csvPath =
    process.argv[2] ?? resolve(process.cwd(), 'scripts/seed/data/kol-seed-enriched-final.csv');
  console.log(`[seed] 读取 CSV: ${csvPath}`);
  const raw = stripBom(readFileSync(csvPath, 'utf8'));

  const records: string[][] = parse(raw, { skip_empty_lines: true, relax_column_count: true });
  if (records.length < 2) throw new Error('脏 CSV：无数据行');
  const cols = resolveColumns(records[0]); // 结构性校验，缺列即抛
  const headerNorm = records[0].map((h) => stripBom(h).trim());

  const kols: NormalizedKol[] = [];
  const errors: string[] = [];
  for (let i = 1; i < records.length; i++) {
    const rowObj: Record<string, string> = {};
    headerNorm.forEach((h, j) => (rowObj[h] = records[i][j] ?? ''));
    const result = normalizeRow(rowObj, cols);
    if ('error' in result) errors.push(`行 ${i + 1}: ${result.error}`);
    else kols.push(result);
  }

  if (errors.length > 0) {
    console.error(`[seed] ❌ 脏 CSV：${errors.length} 行校验失败（前 5）:`);
    errors.slice(0, 5).forEach((e) => console.error(`   ${e}`));
    process.exit(1);
  }

  // canonicalHandle 去重（同 CSV 内重复取首条，避免 upsert 相互覆盖）
  const seen = new Set<string>();
  const deduped = kols.filter((k) => (seen.has(k.canonicalHandle) ? false : seen.add(k.canonicalHandle)));
  const textByHandle = new Map(deduped.map((k) => [k.canonicalHandle, k.embeddingText]));
  console.log(`[seed] 解析 ${kols.length} 行，去重后 ${deduped.length} 条唯一 KOL`);

  const tenantId = await seedDevTenantUser();
  console.log(`[seed] dev tenant=${tenantId} + dev user 已 upsert`);

  await upsertKols(tenantId, deduped);
  const embedded = await embedMissing(tenantId, textByHandle);

  const total = await prisma.kol.count({ where: { tenantId } });
  const withEmb = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT count(*)::bigint AS c FROM "Kol" WHERE "tenantId" = $1 AND embedding IS NOT NULL`,
    tenantId,
  );
  const withEmbCount = Number(withEmb[0].c);
  console.log(`[seed] DB: KOL 总数=${total}，含非空 embedding=${withEmbCount}（本次新 embed ${embedded}）`);

  await cosineSanity(tenantId);

  if (total < 2000) throw new Error(`KOL 总数 ${total} < 2000，未达 acceptance`);
  if (withEmbCount < 2000)
    throw new Error(`含 embedding 的 KOL ${withEmbCount} < 2000，未达 acceptance`);
  console.log(
    `[seed] ✅ 完成：${total} KOL（${withEmbCount} 含 ${EMBEDDING_DIMENSIONS} 维 embedding）+ 1 dev 用户`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] ❌ 失败：', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
