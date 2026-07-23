// M2-C-AGENT-HONESTY F001 — create_project 工具（柱一，internal/native）。
//
// class:'internal'（D27：创建项目可逆、不对外、不花钱——无确认框）。
// 薄封装 lib/projects/create.ts（UI POST /api/projects 共用同一服务，单一真相源）。
// 输出携带 next 指路语义：创建成功后引导用户进入 brief 环节设定目标——
// 「说到做到 + 告诉用户下一步」是本批诚实护栏（F003）的正面样板。

import { z } from 'zod';
import {
  createProject,
  createProjectInputSchema,
} from 'lib/projects/create';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = createProjectInputSchema.extend({
  name: z.string().min(1).describe('项目名，如「王者荣耀·东南亚推广」'),
  gameIdOrSlug: z
    .string()
    .min(1)
    .optional()
    .describe('关联游戏（游戏知识库中已有的 id/slug；不确定就省略，之后可补挂）'),
  market: z.string().min(1).optional().describe('目标市场，如「东南亚」'),
});

type CreateProjectToolInput = z.infer<typeof inputSchema>;

export interface CreateProjectToolOutput {
  created: boolean;
  reason?: 'GAME_NOT_FOUND';
  project?: { id: string; publicId: string; name: string; cur: string };
  /** 指路语义（诚实护栏正面样板：真做了 + 下一步在哪） */
  next?: string;
}

async function run(
  input: CreateProjectToolInput,
  ctx: ToolContext,
): Promise<CreateProjectToolOutput> {
  const r = await createProject(ctx.tenantId, input, { actor: ctx.agentId });
  if (r.ok === false) {
    return { created: false, reason: r.code };
  }
  return {
    created: true,
    project: r.project,
    next: `项目《${r.project.name}》已创建并进入「目标 Brief」环节——请在项目页设定目标曝光与周期后确认，即可解锁「创作者匹配」。`,
  };
}

export const createProjectTool: ToolDefinition<
  CreateProjectToolInput,
  CreateProjectToolOutput
> = {
  name: 'create_project',
  description:
    '创建一个新项目（进入目标 Brief 环节起点）。用于「帮我创建 XX 推广项目」。创建成功会在项目页与今天雷达真实可见。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: run,
};
