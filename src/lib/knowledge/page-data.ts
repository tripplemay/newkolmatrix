// M1-D-KNOWLEDGE F004 — knowledge 页 RSC 数据组装（服务端专用）。
//
// Game 全列 + 各游戏 Material 列表 + GameKnowledge 链头（query.ts 唯一读取口径）
// → 可序列化 KnowledgeGameData[]。structured 读侧宽松降级（parseKnowledgeStructured：
// 脏数据 → null → 空数组走「待解析」占位，D2 绝不打死页面）。

import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { getKnowledgeHeads } from 'lib/knowledge/query';
import { toMaterialDto } from 'lib/knowledge/dto';
import {
  parseKnowledgeStructured,
  type AudienceSlice,
  type KnowledgeKindValue,
} from 'lib/data/schemas/knowledge';
import {
  gameColorForIndex,
  toMaterialView,
  type KnowledgeAnalysisData,
  type KnowledgeGameData,
} from 'lib/knowledge/page-contract';

/** 从链头行提取某 kind 的结构化载荷（宽松降级：脏 structured → 空）。 */
function structuredOf<T>(
  heads: Awaited<ReturnType<typeof getKnowledgeHeads>>,
  kind: KnowledgeKindValue,
  pick: (s: unknown) => T[] | undefined,
): T[] {
  const head = heads.find((h) => h.kind === kind);
  if (!head) return [];
  const parsed = parseKnowledgeStructured(kind, head.structured);
  return (parsed && pick(parsed)) || [];
}

export async function getKnowledgePageData(): Promise<KnowledgeGameData[]> {
  const tenantId = await getDevTenantId();
  const now = new Date();

  const games = await prisma.game.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    include: {
      materials: { orderBy: { createdAt: 'asc' } },
    },
  });

  return Promise.all(
    games.map(async (game, index): Promise<KnowledgeGameData> => {
      const heads = await getKnowledgeHeads(game.id);

      const sell = structuredOf(heads, 'selling_point', (s) =>
        (s as { points?: string[] }).points,
      );
      const aud = structuredOf<AudienceSlice>(heads, 'audience', (s) =>
        (s as { slices?: AudienceSlice[] }).slices,
      );
      const rules = structuredOf(heads, 'compliance_redline', (s) =>
        (s as { rules?: string[] }).rules,
      );

      // 溯源素材计数：链头 sourceMaterialIds 去重并集（FR-11.9 非空即溯源）
      const sourceCount = new Set(heads.flatMap((h) => h.sourceMaterialIds)).size;

      const analysis: KnowledgeAnalysisData = { sell, aud, rules, sourceCount };

      return {
        id: game.id,
        name: game.name,
        color: gameColorForIndex(index),
        materials: game.materials.map((m) => toMaterialView(toMaterialDto(m), now)),
        analysis,
        // §7.5 契约位：行级 = user_upload（素材由你上传构成）；
        // analysis 字段级 = ai_estimate（策略 Agent 解析产物，保守下限档）
        dataSource: 'user_upload',
        fieldProvenance: {
          analysis: {
            source: 'ai_estimate',
            fetchedAt: null,
            confidence: null,
            detail:
              sourceCount > 0
                ? `策略 Agent 基于 ${sourceCount} 份上传素材解析提炼；素材级来源见素材库列表`
                : '尚无解析产物；上传素材后由策略 Agent 生成',
          },
        },
      };
    }),
  );
}
