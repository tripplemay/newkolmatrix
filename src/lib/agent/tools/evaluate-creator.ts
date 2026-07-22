// M2-A-MATCH F007 — evaluate_creator 工具（柱一，internal/native）
//
// 输入 projectId + kol idOrPublicId → matchScore.compute 单人评估 + 可解释 reasons。
// class:internal（只读评估，无确认框，D27）。
// 评分单一真相源（:533 三处复用铁律）：项目画像口径 = F003 buildQueryText/
// loadKnowledgeAudience 同源；评分 = computeMatchScore，不内联重算。
// embedding 缺失 → evaluable:false 明示（P2：score null 仅当 embedding 缺失，不编分）。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { embedText } from 'lib/ai/gateway';
import {
  buildQueryText,
  loadKnowledgeAudience,
} from 'lib/match/generate-candidates';
import { computeMatchScore } from 'lib/domain/match-score';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe('项目的 id / publicId / slug（三口径均可）'),
  kolIdOrPublicId: z
    .string()
    .min(1)
    .describe('KOL 的 id 或 publicId（search_kols / match_plan 结果里的均可）'),
});

type EvaluateCreatorInput = z.infer<typeof inputSchema>;

export interface EvaluateCreatorOutput {
  found: boolean;
  reason?: 'PROJECT_NOT_FOUND' | 'KOL_NOT_FOUND' | 'EMBEDDING_MISSING';
  kol?: {
    id: string;
    publicId: string;
    displayName: string | null;
    platform: string | null;
    followers: number | null;
  };
  /** null = 不可评（embedding 缺失）；pending=true = 受众数据缺失降级纯向量分（「待核」） */
  evaluation: {
    score: number;
    reasons: string[];
    pending: boolean;
  } | null;
}

async function run(
  { projectId, kolIdOrPublicId }: EvaluateCreatorInput,
  ctx: ToolContext,
): Promise<EvaluateCreatorOutput> {
  const project = await prisma.project.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ id: projectId }, { publicId: projectId }, { slug: projectId }],
    },
    include: { game: { select: { name: true } } },
  });
  if (!project) {
    return { found: false, reason: 'PROJECT_NOT_FOUND', evaluation: null };
  }

  const kol = await prisma.kol.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ id: kolIdOrPublicId }, { publicId: kolIdOrPublicId }],
    },
    select: {
      id: true,
      publicId: true,
      displayName: true,
      platform: true,
      followers: true,
      audienceDemo: true,
    },
  });
  if (!kol) {
    return { found: false, reason: 'KOL_NOT_FOUND', evaluation: null };
  }

  const kolSummary = {
    id: kol.id,
    publicId: kol.publicId,
    displayName: kol.displayName,
    platform: kol.platform,
    followers: kol.followers,
  };

  // 项目画像 → 查询向量（F003 同源口径）
  const knowledgeAudience = project.gameId
    ? await loadKnowledgeAudience(project.gameId)
    : null;
  const queryText = buildQueryText(
    project.name,
    project.game?.name ?? null,
    project.goal,
    knowledgeAudience,
  );
  const embedding = await embedText(queryText);
  const vec = `[${embedding.join(',')}]`;

  // 单人 cosine（P2：embedding 缺失 → 不可评，明示不编分）
  const rows = await prisma.$queryRawUnsafe<Array<{ distance: number }>>(
    `SELECT (embedding <=> $1::vector) AS distance
     FROM "Kol" WHERE id = $2 AND embedding IS NOT NULL`,
    vec,
    kol.id,
  );
  if (rows.length === 0) {
    return {
      found: true,
      reason: 'EMBEDDING_MISSING',
      kol: kolSummary,
      evaluation: null,
    };
  }

  const computed = computeMatchScore({
    similarity: 1 - Number(rows[0].distance),
    audienceDemo: kol.audienceDemo,
    knowledgeAudience,
  });

  return {
    found: true,
    kol: kolSummary,
    evaluation: {
      score: computed.score,
      reasons: computed.reasons,
      pending: computed.pending,
    },
  };
}

export const evaluateCreatorTool: ToolDefinition<
  EvaluateCreatorInput,
  EvaluateCreatorOutput
> = {
  name: 'evaluate_creator',
  description:
    '对单个 KOL 相对某项目做可解释匹配评估（组合分 + 依据；受众数据缺失时降级纯向量分标「待核」）。用于「这个人适合吗」。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: run,
};
