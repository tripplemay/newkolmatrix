// M1-D-KNOWLEDGE F003 — 知识链头读取（唯一读取口径：supersededById IS NULL）。
//
// 版本链 ⑥（architecture §5.3）：重解析不物理删，旧条目 supersededById 指向新条目；
// 任何消费方（F004 页面 / F005 prompt 注入 / M2+ 领域工具）读取知识一律经此模块取链头，
// 不得绕过直接 findMany——绕过者会把已被取代的旧知识当现行知识用。

import type { GameKnowledge } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import type { KnowledgeKindValue } from 'lib/data/schemas/knowledge';

/** 某游戏的现行知识链头（可按 kinds 过滤；默认三类全量）。 */
export async function getKnowledgeHeads(
  gameId: string,
  kinds?: KnowledgeKindValue[],
): Promise<GameKnowledge[]> {
  return prisma.gameKnowledge.findMany({
    where: {
      gameId,
      supersededById: null, // 链头恒定读取口径
      ...(kinds && kinds.length > 0 ? { kind: { in: kinds } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
}
