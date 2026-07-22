// M2-A-MATCH F007 — match_plan 工具（柱一，internal/native）
//
// 输入 projectId → 现行轮组合（draft/approved）+ PlanKol 摘要。
// class:internal（只读，无确认框，D27）。canvas 出对比矩阵简版卡：输出携带
// type:'match_plan'（ADR-28 结果 type 路由键）→ MatchPlanCard。
// 现行轮口径 = currentRoundPlanIds 单点（与 F005 页面组装同源，不重复实现）。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { currentRoundPlanIds } from 'lib/match/surface-data';
import { parsePlanMetrics, type PlanMetrics } from 'lib/data/schemas/match';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe('项目的 id / publicId / slug（三口径均可）'),
});

type MatchPlanInput = z.infer<typeof inputSchema>;

export interface MatchPlanMemberSummary {
  kolId: string;
  name: string | null;
  matchScore: number;
  reasons: string[];
}

export interface MatchPlanSummary {
  id: string;
  publicId: string;
  name: string;
  status: string;
  recommended: boolean;
  rationale: string;
  /** 宽松解析（D2）：脏 metrics → null */
  metrics: PlanMetrics | null;
  members: MatchPlanMemberSummary[];
}

export interface MatchPlanOutput {
  /** ADR-28 canvas 路由键（结果 type，非工具名） */
  type: 'match_plan';
  found: boolean;
  reason?: 'PROJECT_NOT_FOUND';
  projectId?: string;
  projectName?: string;
  /** 现行轮组合（0 = 尚未生成；页面/例程生成后即有） */
  plans: MatchPlanSummary[];
}

async function run(
  { projectId }: MatchPlanInput,
  ctx: ToolContext,
): Promise<MatchPlanOutput> {
  // Project 三口径解析（knowledge-injection 先例）
  const project = await prisma.project.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ id: projectId }, { publicId: projectId }, { slug: projectId }],
    },
    select: { id: true, name: true },
  });
  if (!project) {
    return { type: 'match_plan', found: false, reason: 'PROJECT_NOT_FOUND', plans: [] };
  }

  const roundIds = await currentRoundPlanIds(project.id);
  const rows = await prisma.matchPlan.findMany({
    where: { id: { in: roundIds } },
    include: {
      kols: {
        orderBy: { matchScore: 'desc' },
        include: { kol: { select: { displayName: true } } },
      },
    },
  });
  const byId = new Map(rows.map((p) => [p.id, p]));

  const plans: MatchPlanSummary[] = roundIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => ({
      id: p.id,
      publicId: p.publicId,
      name: p.name,
      status: p.status,
      recommended: p.recommended,
      rationale: p.rationale,
      metrics: parsePlanMetrics(p.metrics),
      members: p.kols.map((pk) => ({
        kolId: pk.kolId,
        name: pk.kol.displayName,
        matchScore: pk.matchScore,
        reasons: pk.reasons,
      })),
    }));

  return {
    type: 'match_plan',
    found: true,
    projectId: project.id,
    projectName: project.name,
    plans,
  };
}

export const matchPlanTool: ToolDefinition<MatchPlanInput, MatchPlanOutput> = {
  name: 'match_plan',
  description:
    '查询项目的现行匹配组合方案（3 组对比 + 各组成员摘要与可解释依据）。用于「看看当前组合 / 方案对比」。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: run,
};
