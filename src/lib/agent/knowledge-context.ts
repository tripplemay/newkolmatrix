// M1-D-KNOWLEDGE F005 — prompt ⑤层知识注入（architecture §8.3 第⑤层，U4）。
//
// 特点是「工具调用输入 / 运行时注入」而非硬编码（FR-8.4.9）：每次对话装配 system prompt 时
// 经 Project.gameId 查 GameKnowledge 链头拼知识段——特点更新后下次调用即感知。
// kind 子集由 persona.knowledgeKinds 声明（FR-8.4.8 下游消费映射：受众→匹配、卖点→触达、
// 红线→合规、strategy 三类全量）。无知识 / 无关联游戏 → 返回空串（不注水）。
//
// 纯渲染与取数分离：renderKnowledgeSection 纯函数（单测口径）；gameKnowledgeSection 负责
// DB 取数（project 三口径 OR 解析**按 tenantId 作用域**，沿 compute-health D8 先例）。

import { prisma } from 'lib/db/prisma';
import { getKnowledgeHeads } from 'lib/knowledge/query';
import type { KnowledgeKindValue } from 'lib/data/schemas/knowledge';

const KIND_LABEL: Record<KnowledgeKindValue, string> = {
  selling_point: '卖点',
  audience: '目标受众',
  compliance_redline: '合规红线',
};

export interface KnowledgeHeadLike {
  kind: KnowledgeKindValue;
  content: string;
  sourceMaterialIds: string[];
}

/**
 * 把链头知识渲染为 system prompt 知识段（纯函数）。
 * 空 heads → 空串（调用方原样拼接无副作用）。含溯源计数（FR-11.9：知识可溯源是其可信度来源）。
 */
export function renderKnowledgeSection(
  gameName: string | null,
  heads: KnowledgeHeadLike[],
): string {
  if (heads.length === 0) return '';
  const sourceCount = new Set(heads.flatMap((h) => h.sourceMaterialIds)).size;
  const lines = heads.map(
    (h) => `- ${KIND_LABEL[h.kind] ?? h.kind}：${h.content}`,
  );
  return [
    '',
    '',
    `【游戏知识（策略 Agent 基于 ${sourceCount} 份素材解析${
      gameName ? `，游戏：${gameName}` : ''
    }）】`,
    ...lines,
    '以上知识来自已解析素材的现行链头，作为你决策与回答的事实依据；素材未覆盖处如实说明，不编造。',
  ].join('\n');
}

/**
 * 按项目取知识段：projectId（id / publicId / slug 三口径）→ Project.gameId → 链头（kinds 过滤）。
 * 任一环节缺失（项目不存在 / **跨租户** / 未关联游戏 / 无知识 / kinds 未声明）→ 空串。
 * 取数失败也返回空串（知识注入是增强，不得打死对话主链路，D2）。
 *
 * 【M4.8-HARDEN F002：tenantId 必选】此前三口径解析**无 tenantId 条件**，而 projectId
 * 一路来自客户端可控的 `body.context.projectId`——别的租户的游戏知识（受众切片、卖点、
 * 合规红线）会被拼进 system 段。跨租户 → 返回 `''`，与「无知识」同款行为：不注水、
 * 不抛错（增强性注入不得打死主链路）。必选而非可选：漏传的新调用点必须编译不过。
 */
export async function gameKnowledgeSection(
  projectId: string,
  tenantId: string,
  kinds: KnowledgeKindValue[] | undefined,
): Promise<string> {
  if (!kinds || kinds.length === 0) return '';
  try {
    const project = await prisma.project.findFirst({
      where: {
        tenantId,
        OR: [{ id: projectId }, { publicId: projectId }, { slug: projectId }],
      },
      select: { gameId: true, game: { select: { name: true } } },
    });
    if (!project?.gameId) return '';
    const heads = await getKnowledgeHeads(project.gameId, kinds);
    return renderKnowledgeSection(
      project.game?.name ?? null,
      heads.map((h) => ({
        kind: h.kind as KnowledgeKindValue,
        content: h.content,
        sourceMaterialIds: h.sourceMaterialIds,
      })),
    );
  } catch (error) {
    console.warn('[agent/knowledge-context] 知识段取数失败，跳过注入:', error);
    return '';
  }
}
