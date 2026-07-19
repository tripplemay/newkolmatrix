// AGENT-FOUNDATION F005 — get_kol_detail 工具（柱一，internal/native）
//
// 按 id 或 publicId 取单个 KOL 详情。class:internal（只读）。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  idOrPublicId: z
    .string()
    .min(1)
    .describe('KOL 的 id 或 publicId（search_kols 结果里的 id/publicId 均可）'),
});

type GetKolDetailInput = z.infer<typeof inputSchema>;

async function run(
  { idOrPublicId }: GetKolDetailInput,
  ctx: ToolContext,
): Promise<{ found: boolean; kol: unknown }> {
  const kol = await prisma.kol.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ id: idOrPublicId }, { publicId: idOrPublicId }],
    },
    select: {
      id: true,
      publicId: true,
      displayName: true,
      platform: true,
      handle: true,
      profileUrl: true,
      avatarUrl: true,
      country: true,
      language: true,
      followers: true,
      avgViews: true,
      engagementRate: true,
      categories: true,
      bio: true,
      owner: true,
      dataSource: true,
    },
  });
  return { found: kol !== null, kol };
}

export const getKolDetailTool: ToolDefinition<
  GetKolDetailInput,
  { found: boolean; kol: unknown }
> = {
  name: 'get_kol_detail',
  description: '按 id 或 publicId 获取单个 KOL 的详细资料。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: run,
};
