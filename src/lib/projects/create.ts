// M2-C-AGENT-HONESTY F001 — createProject 服务（项目写路径从零补齐）。
//
// 触发源：用户反馈「对话创建项目零落库」（user_report M2C-agent-honesty-2026-07-23）——
// 此前项目实体的唯一写路径 = seed 脚本，工具与 UI 均无创建能力。
//
// 【P3】创建最小集：name 必填 + game/market 可选；goal **不在创建时填**——goal 确认是
// brief 环节的动线（创建即入 cur=brief 默认，不越环节）。
// 【P1】事务 = Project.create + OperationLog 留痕（kind=auto + 人话 summary +
// payloadJson 结构化，advanceStage 先例）——「创建了」必须在雷达/记录页**看得见**，
// 正面消解「AI 说做了但界面没有」的信任问题。
// UI（POST /api/projects）与工具（create_project）共用本服务——单一真相源。

import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from 'lib/db/prisma';

export const createProjectInputSchema = z.object({
  /** 项目名（必填非空） */
  name: z.string().min(1, '项目名不能为空'),
  /** 关联游戏（id / publicId / slug 三口径，可空——后续可在知识域补挂） */
  gameIdOrSlug: z.string().min(1).optional(),
  /** 目标市场（自由文本，如「东南亚」；可空） */
  market: z.string().min(1).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export type CreateProjectResult =
  | {
      ok: true;
      project: { id: string; publicId: string; name: string; cur: string };
      logId: string;
    }
  | { ok: false; code: 'GAME_NOT_FOUND' };

export interface CreateProjectOpts {
  /** 留痕 actor（调用人格 / 'operator'）。 */
  actor: string;
}

export async function createProject(
  tenantId: string,
  input: CreateProjectInput,
  opts: CreateProjectOpts,
): Promise<CreateProjectResult> {
  // game 三口径解析；未命中明示不静默（D2：不吞错也不猜）
  let gameId: string | null = null;
  if (input.gameIdOrSlug) {
    const game = await prisma.game.findFirst({
      where: {
        tenantId,
        OR: [
          { id: input.gameIdOrSlug },
          { publicId: input.gameIdOrSlug },
          { slug: input.gameIdOrSlug },
        ],
      },
      select: { id: true },
    });
    if (!game) return { ok: false, code: 'GAME_NOT_FOUND' };
    gameId = game.id;
  }

  // 事务：项目创建与留痕同生共死（记了没建 = 虚痕；建了没记 = 雷达盲区，两者都不可接受）
  const [project, log] = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        tenantId,
        name: input.name,
        gameId,
        market: input.market ?? null,
        // cur/maxReached @default(brief)：创建即入目标 Brief 环节（P3 不越环节）
      },
      select: { id: true, publicId: true, name: true, cur: true },
    });
    const l = await tx.operationLog.create({
      data: {
        tenantId,
        kind: 'auto', // 可逆内部动作（advanceStage 同款口径）
        actor: opts.actor,
        summary: `创建项目《${p.name}》（进入目标 Brief 环节）`,
        projectId: p.id,
        payloadJson: {
          action: 'project.created',
          projectId: p.id,
          gameId,
          market: input.market ?? null,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return [p, l] as const;
  });

  return { ok: true, project, logId: log.id };
}
