// AGENT-FOUNDATION F005 — search_kols 工具（柱一，internal/native）
//
// NL query → bge-m3 embedding（F003 gateway）→ pgvector cosine（<=>）top-K（F002/F004 数据）。
// class:internal（AI 直接执行，无确认框——检索是只读、可撤销、不对外，D27）。

import { z } from 'zod';
import { embedText } from 'lib/ai/gateway';
import { prisma } from 'lib/db/prisma';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('自然语言检索意图，如「游戏区英文科技测评 YouTuber」'),
  topK: z.number().int().min(1).max(50).default(10).describe('返回条数上限'),
  platform: z.string().optional().describe('可选平台过滤，如 youtube'),
});

type SearchKolsInput = z.infer<typeof inputSchema>;

interface KolHit {
  id: string;
  publicId: string;
  displayName: string | null;
  platform: string | null;
  handle: string | null;
  profileUrl: string | null;
  country: string | null;
  followers: number | null;
  categories: string[];
  similarity: number;
}

interface SearchKolsOutput {
  query: string;
  count: number;
  kols: KolHit[];
}

interface Row {
  id: string;
  publicId: string;
  displayName: string | null;
  platform: string | null;
  handle: string | null;
  profileUrl: string | null;
  country: string | null;
  followers: number | null;
  categories: string[];
  distance: number;
}

async function run(
  { query, topK, platform }: SearchKolsInput,
  ctx: ToolContext,
): Promise<SearchKolsOutput> {
  // 直连 embedText（非 AI SDK embed）——规避与 streamText chat 流并发时的连接池 400（见 gateway.embedText 注释）。
  const embedding = await embedText(query);
  const vec = `[${embedding.join(',')}]`;

  const select = `SELECT id, "publicId", "displayName", platform, handle, "profileUrl",
      country, followers, categories, (embedding <=> $1::vector) AS distance
    FROM "Kol"
    WHERE "tenantId" = $2 AND embedding IS NOT NULL`;
  const order = `ORDER BY embedding <=> $1::vector LIMIT $3`;

  const rows = platform
    ? await prisma.$queryRawUnsafe<Row[]>(
        `${select} AND platform = $4 ${order}`,
        vec,
        ctx.tenantId,
        topK,
        platform,
      )
    : await prisma.$queryRawUnsafe<Row[]>(
        `${select} ${order}`,
        vec,
        ctx.tenantId,
        topK,
      );

  const kols: KolHit[] = rows.map((r) => ({
    id: r.id,
    publicId: r.publicId,
    displayName: r.displayName,
    platform: r.platform,
    handle: r.handle,
    profileUrl: r.profileUrl,
    country: r.country,
    followers: r.followers,
    categories: r.categories ?? [],
    similarity: Number((1 - Number(r.distance)).toFixed(4)),
  }));

  return { query, count: kols.length, kols };
}

export const searchKolsTool: ToolDefinition<SearchKolsInput, SearchKolsOutput> =
  {
    name: 'search_kols',
    description:
      '按自然语言意图语义检索 KOL（bge-m3 向量 + pgvector cosine），返回相关 top-K。用于「找 XX 类 KOL」。',
    class: 'internal',
    source: 'native',
    inputSchema,
    execute: run,
  };
