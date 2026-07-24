// M4-INSIGHT F005 — compute_roi 工具（internal/native，只读）
//
// class:'internal' 无 buildHarm（只读不过闸门）：输出 = F004 装配事实 + roi.compute +
// attribution.gaps 两纯函数产物的组合——**不内联重算**（三处复用铁律②，
// domain/roi-compute.ts / domain/attribution-gaps.ts 文件头 ①②③）。
// 诚实透传（P1）：分子缺 → roi=null + basis=insufficient_evidence + gaps 非空，
// 工具层不伪造、不兜底填 0。输出可序列化（JSON 往返无损，供画布渲染）。
//
// 目标值来源：Project.goal.targetExposure（M3-B F011 confirm_brief_goal 落库）；
// actualExposure 本批恒 null（真回传源 M5）——达成方向按纯函数语义为 null（无法判断≠flat）。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { parseProjectGoal } from 'lib/data/schemas/project';
import {
  loadProjectSpend,
  type ProjectMetricFacts,
} from 'lib/insight/metric-snapshot';
import { computeRoi, type RoiComputeResult } from 'lib/domain/roi-compute';
import {
  attributionGaps,
  type AttributionGapsResult,
} from 'lib/domain/attribution-gaps';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  projectId: z.string().min(1).describe('项目 id（ROI 对账的项目范围）'),
});

type ComputeRoiInput = z.infer<typeof inputSchema>;

export interface ComputeRoiToolOutput {
  projectId: string;
  projectName: string;
  /** F004 装配事实（spend 真源 + 口径标注 + 非 USD 排除清单） */
  facts: ProjectMetricFacts;
  /** roi.compute 产物（分子缺 → roi=null + insufficient_evidence，透传不伪造） */
  roi: RoiComputeResult;
  /** attribution.gaps 产物（证据缺口逐条可分支；无缺口空数组） */
  gaps: AttributionGapsResult;
  /** Project.goal.targetExposure（未确认目标 → null，如实透传） */
  targetExposure: number | null;
}

export async function computeProjectRoi(
  input: ComputeRoiInput,
  ctx: ToolContext,
): Promise<ComputeRoiToolOutput> {
  const db = ctx.db ?? prisma;
  const project = await db.project.findFirst({
    where: { id: input.projectId, tenantId: ctx.tenantId },
    select: { id: true, name: true, goal: true },
  });
  if (!project) {
    throw new Error(`[compute-roi] 项目不存在: ${input.projectId}`);
  }
  const goal = parseProjectGoal(project.goal);
  const facts = await loadProjectSpend(project.id, {
    tenantId: ctx.tenantId,
    db: ctx.db,
  });

  const roi = computeRoi({
    spend: facts.spend,
    reach: facts.reach,
    conversions: facts.conversions,
    actualExposure: null, // M5 前无真实曝光回传源（不猜）
    targetExposure: goal?.targetExposure ?? null,
  });
  const gaps = attributionGaps({
    spend: facts.spend,
    spendSource: facts.spendSource,
    currency: facts.currency,
    reach: facts.reach,
    conversions: facts.conversions,
  });

  return {
    projectId: project.id,
    projectName: project.name,
    facts,
    roi,
    gaps,
    targetExposure: goal?.targetExposure ?? null,
  };
}

export const computeRoiTool: ToolDefinition<
  ComputeRoiInput,
  ComputeRoiToolOutput
> = {
  name: 'compute_roi',
  description:
    '对指定项目做 ROI 对账：spend 真源（已放款优先，无则报价承诺额）+ 证据缺口清单。分子（触达/转化/曝光）本期无源时如实显「证据不足」，绝不猜 ROI。只读，不改任何数据。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: computeProjectRoi,
};
