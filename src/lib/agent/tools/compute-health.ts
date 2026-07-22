// M1-B-BRIEF F003 — compute_health 工具（柱一，internal/native）
//
// architecture.md:184 登记：health.compute 的薄封装，Agent 与页面同源——
// 打分逻辑只有 domain/health.ts 的 computeHealth 一份，本工具与详情页 RSC
//（[id]/page.tsx）是它的两个调用方，各自组装 HealthInput（M1-A D16：分子由
// 调用方显式提供，纯函数不去猜）。
//
// D8 输入契约 = projectId-only：工具自读 Project + parseProjectGoal，缺失因子
// 填 null（actualExposure/budgetSpent 全库无存处，阻塞表未建）→ 按 D15 恒返 cr。
// 不让模型传因子——模型不应编造实测，与 D2「接受全红」同根。
// `now` 在 execute 边界 new Date() 注入（纯度约束只在 domain 函数）。
//
// class:internal（纯计算只读，无需 buildHarm）。范式对齐 get-kol-detail.ts。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import {
  computeHealth,
  computeHealthBreakdown,
  type HealthBreakdown,
  type HealthInput,
  type HealthResult,
} from 'lib/domain/health';
import { parseProjectGoal } from 'lib/data/schemas/project';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  projectId: z.string().min(1).describe('项目的 id / publicId / slug（如 xg）'),
});

type ComputeHealthInput = z.infer<typeof inputSchema>;

export interface ComputeHealthOutput {
  found: boolean;
  project: {
    id: string;
    publicId: string;
    slug: string | null;
    name: string;
  } | null;
  /** domain/health.ts 的 HealthResult（score 0-100 + band gd/wn/cr），与详情页同源 */
  health: HealthResult | null;
  /** 四因子分项拆解（供 Agent 解释「为什么是这个档」） */
  breakdown: HealthBreakdown | null;
}

async function run(
  { projectId }: ComputeHealthInput,
  ctx: ToolContext,
): Promise<ComputeHealthOutput> {
  const row = await prisma.project.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ id: projectId }, { publicId: projectId }, { slug: projectId }],
    },
    select: {
      id: true,
      publicId: true,
      slug: true,
      name: true,
      goal: true,
      budgetTotal: true,
    },
  });
  if (!row) {
    return { found: false, project: null, health: null, breakdown: null };
  }

  const goal = parseProjectGoal(row.goal);
  // 与 [id]/page.tsx 同一组装口径（D2/D15）：分子无存处填 null → 该因子记 0 分。
  // M2/M3 指标表落地后，两处同步换真实分子。
  const input: HealthInput = {
    targetExposure: goal?.targetExposure ?? null,
    actualExposure: null,
    budgetTotal: row.budgetTotal == null ? null : Number(row.budgetTotal),
    budgetSpent: null,
    periodStart: goal ? new Date(goal.periodStart) : null,
    periodEnd: goal ? new Date(goal.periodEnd) : null,
    now: new Date(), // D8：时钟在工具边界注入
    blockerCount: 0, // 阻塞表未建（health.ts:67 约定传 0）
  };
  return {
    found: true,
    project: {
      id: row.id,
      publicId: row.publicId,
      slug: row.slug,
      name: row.name,
    },
    health: computeHealth(input),
    breakdown: computeHealthBreakdown(input),
  };
}

export const computeHealthTool: ToolDefinition<
  ComputeHealthInput,
  ComputeHealthOutput
> = {
  name: 'compute_health',
  description:
    '按项目 id/publicId/slug 计算项目健康度（0-100 分 + gd/wn/cr 档），含四因子拆解。与项目详情页同一打分函数。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: run,
};
