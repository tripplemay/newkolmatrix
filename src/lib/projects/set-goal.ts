// M3-B-DELIVERY F011（BL-BRIEF-GOAL）— setProjectGoal 服务（goal 写路径从零补齐）。
//
// 触发源（backlog BL-BRIEF-GOAL）：`Project.goal` 此前只有 seed 脚本能写——
// 于是「新建项目」永远卡在 brief→match（→match 判据 = goal 已确认，env-guards.ts），
// create_project 指路的「设定目标后即可解锁匹配」在产品里没有对应入口。
//
// 【P10】UI（PATCH /api/projects/[id]/goal）与工具（confirm_brief_goal）共用本服务——
// 单一真相源，不各写一份（create_project 三件套同款模式）。
// 【P10】V4 brief 面**零结构变更**：处置入口走 Copilot 与 API，卡内不加按钮（裁决 #1）。
// 事务 = Project.update + OperationLog 留痕（「确认了目标」必须在雷达/记录页看得见）。

import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { projectGoalSchema, type ProjectGoal } from 'lib/data/schemas/project';

/**
 * 入参 = `Project.goal` 形状（schemas/project.ts 单一定义，不在此复制一份字段约束）
 * + 跨字段约束：periodStart < periodEnd。
 *
 * 「起止同日」也拒绝：曝光目标按周期摊算，零长度周期让健康度的时间进度因子无意义
 *（health.ts 的 periodStart/periodEnd 消费口径）——宁可让人写清楚，不猜。
 */
export const setProjectGoalInputSchema = projectGoalSchema.refine(
  (g) => Date.parse(g.periodStart) < Date.parse(g.periodEnd),
  { message: 'periodStart 必须早于 periodEnd', path: ['periodEnd'] },
);

export type SetProjectGoalInput = z.infer<typeof setProjectGoalInputSchema>;

export type SetProjectGoalResult =
  | {
      ok: true;
      project: { id: string; publicId: string; name: string; cur: string };
      goal: ProjectGoal;
      /** true = 覆盖了既有目标（false = 首次确认） */
      replaced: boolean;
      logId: string;
    }
  | { ok: false; code: 'PROJECT_NOT_FOUND' };

export interface SetProjectGoalOpts {
  /** 留痕 actor（调用人格 / 'operator'）。 */
  actor: string;
}

/**
 * 确认 / 更新项目目标（曝光量 + 周期）。
 *
 * 幂等与覆盖语义：目标可重复确认（人改主意是正常业务），每次都留痕并在 payload 里
 * 带上 from/to——审计能看出「目标被改过几次、从什么改成什么」。
 * projectId 支持 id / publicId / slug 三口径（compute_health 同款，人给什么都能认）。
 */
export async function setProjectGoal(
  tenantId: string,
  projectIdOrSlug: string,
  input: SetProjectGoalInput,
  opts: SetProjectGoalOpts,
): Promise<SetProjectGoalResult> {
  const found = await prisma.project.findFirst({
    where: {
      tenantId,
      OR: [
        { id: projectIdOrSlug },
        { publicId: projectIdOrSlug },
        { slug: projectIdOrSlug },
      ],
    },
    select: { id: true, goal: true },
  });
  if (!found) return { ok: false, code: 'PROJECT_NOT_FOUND' };

  const goal: ProjectGoal = {
    targetExposure: input.targetExposure,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  };
  const before = found.goal;

  const [project, log] = await prisma.$transaction(async (tx) => {
    const p = await tx.project.update({
      where: { id: found.id },
      data: { goal: goal as unknown as Prisma.InputJsonValue },
      select: { id: true, publicId: true, name: true, cur: true },
    });
    const l = await tx.operationLog.create({
      data: {
        tenantId,
        kind: 'auto', // 可逆内部动作（D27：不对外、不花钱，无确认框）
        actor: opts.actor,
        summary: `确认项目《${p.name}》目标：曝光 ${goal.targetExposure.toLocaleString(
          'en-US',
        )} · ${goal.periodStart} → ${goal.periodEnd}`,
        projectId: p.id,
        payloadJson: {
          action: 'project.goal_confirmed',
          projectId: p.id,
          from: (before ?? null) as Prisma.InputJsonValue,
          to: goal,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return [p, l] as const;
  });

  return {
    ok: true,
    project,
    goal,
    replaced: before != null,
    logId: log.id,
  };
}
