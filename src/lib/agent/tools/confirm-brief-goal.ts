// M3-B-DELIVERY F011（BL-BRIEF-GOAL）— confirm_brief_goal 工具（柱一，internal/native）。
//
// class:'internal'（D27：确认目标可逆、不对外、不花钱——无确认框）。
// 薄封装 lib/projects/set-goal.ts（UI PATCH /api/projects/[id]/goal 共用同一服务，
// 单一真相源；create_project 三件套同款）。
//
// 输出携带 next 指路语义（M2-C F003 诚实护栏的正面样板）：目标确认后 →match 守卫即放行，
// 告诉人下一步在哪，而不是让人自己猜为什么匹配还锁着。

import { z } from 'zod';
import { setProjectGoal } from 'lib/projects/set-goal';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe('项目的 id / publicId / slug（如 xg）'),
  targetExposure: z
    .number()
    .int()
    .nonnegative()
    .describe('目标曝光量（次），非负整数'),
  periodStart: z.iso.date().describe('周期起（ISO 日期，如 2026-07-01）'),
  periodEnd: z
    .iso
    .date()
    .describe('周期止（ISO 日期，必须晚于 periodStart）'),
});

type ConfirmBriefGoalInput = z.infer<typeof inputSchema>;

export interface ConfirmBriefGoalOutput {
  confirmed: boolean;
  reason?: 'PROJECT_NOT_FOUND' | 'INVALID_PERIOD';
  project?: { id: string; publicId: string; name: string; cur: string };
  goal?: { targetExposure: number; periodStart: string; periodEnd: string };
  /** true = 覆盖既有目标（人改主意），false = 首次确认 */
  replaced?: boolean;
  /** 指路语义（真做了 + 下一步在哪） */
  next?: string;
}

async function run(
  input: ConfirmBriefGoalInput,
  ctx: ToolContext,
): Promise<ConfirmBriefGoalOutput> {
  // 跨字段约束在服务层 schema（periodStart < periodEnd）——工具不重复实现，
  // 只把校验失败翻成模型可读的 reason（不抛裸 zod 错给对话）。
  if (Date.parse(input.periodStart) >= Date.parse(input.periodEnd)) {
    return { confirmed: false, reason: 'INVALID_PERIOD' };
  }
  const r = await setProjectGoal(
    ctx.tenantId,
    input.projectId,
    {
      targetExposure: input.targetExposure,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
    { actor: ctx.agentId },
  );
  if (r.ok === false) return { confirmed: false, reason: r.code };
  return {
    confirmed: true,
    project: r.project,
    goal: r.goal,
    replaced: r.replaced,
    next: `目标已确认并落库（项目页「目标 Brief」可见）——「创作者匹配」环节现在可以进入了。`,
  };
}

export const confirmBriefGoalTool: ToolDefinition<
  ConfirmBriefGoalInput,
  ConfirmBriefGoalOutput
> = {
  name: 'confirm_brief_goal',
  description:
    '确认项目的目标曝光量与投放周期（brief 环节的目标确认）。确认后「创作者匹配」环节即解锁。可重复确认以修改目标。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: run,
};
