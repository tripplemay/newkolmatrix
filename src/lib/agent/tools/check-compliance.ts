// M4.5-AGENT-LOOP F011 — check_compliance 工具（internal/native，只读）
//
// F-G「合规人格首件」：compliance 人格自 AGENT-FOUNDATION 起 tools 为空数组（占位人格），
// 本批给它第一件真工具——把「这个游戏的合规红线是什么、每条出自哪份素材」变成结构化核查单。
//
// **链头读取器复用**（M1-D F003 文件头「不得绕过直接 findMany」）：红线知识经
// `getKnowledgeHeads(gameId, ['compliance_redline'])` 取，本文件不内联任何
// `gameKnowledge.findMany` / `supersededById` 查询——绕过者会把已被取代的旧红线当现行红线用。
//
// ── 诚实边界（本工具刻意不做的事）──
// 传了待查文本也**不给合规判定**：判定需要模型阅读文本与红线逐条比对，那是 Agent 在对话里
// 做的事，不是本工具能确定性算出来的。工具只交付「权威红线清单 + 逐条溯源」，
// 并以 `verdict:'not_judged'` + 明示原因如实说明这一点——
// 假装给出 pass/fail 才是最危险的形态（一个编出来的「合规通过」比没有结论坏得多）。
//
// ── 范围注记 ──
// 本批只立工具，**不强制嵌入** create_share_link / draft_email / draft_report 等流程
//（自动接线是产品裁决，留后续批次）。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { getKnowledgeHeads } from 'lib/knowledge/query';
import type { ToolContext, ToolDefinition } from './types';

const inputSchema = z.object({
  projectId: z
    .string()
    .min(1)
    .describe('项目 id（支持 id / publicId / slug 三口径），用于定位所属游戏'),
  text: z
    .string()
    .nullish()
    .describe('可选：待核查的文案（本工具不做判定，只据此标注核查范围）'),
});

type CheckComplianceInput = z.infer<typeof inputSchema>;

/** 红线条目的溯源引用（FR-11.9：知识可溯源是其可信度来源）。 */
export interface RedlineSource {
  materialId: string;
  /** 素材原始文件名；素材已删除 / 跨租户不可见 → null（如实标注，不编名字） */
  fileName: string | null;
}

export interface RedlineItem {
  knowledgeId: string;
  content: string;
  /** LLM 自报置信度（无 → null，不补默认值） */
  confidence: number | null;
  sources: RedlineSource[];
  /** true = 该条红线没有可用溯源（如实暴露，供人判断可信度） */
  unsourced: boolean;
}

export interface CheckComplianceOutput {
  projectId: string;
  projectName: string | null;
  gameId: string | null;
  gameName: string | null;
  items: RedlineItem[];
  /** 是否核查了文案（false = 只出清单） */
  textProvided: boolean;
  /** 待查文案长度（只记长度不回传正文，避免把文案复制进工具产物/遥测面） */
  textLength: number;
  /**
   * 本工具恒 'not_judged'：判定归 Agent 依清单逐条比对并引用来源，工具不伪造结论。
   * （保留字段是为后续若真有确定性规则引擎时可扩展，不是给模型填的。）
   */
  verdict: 'not_judged';
  /** verdict 的原因说明 / 空态说明——恒非空，不留空让模型脑补 */
  note: string;
}

/** 空态文案锚点（测试钉死）。 */
export const COMPLIANCE_NO_REDLINE_MSG =
  '暂无红线知识：该项目所属游戏尚未解析出任何合规红线条目，本次核查无据可依——不得据此判定「合规通过」。';
export const COMPLIANCE_NO_GAME_MSG =
  '暂无红线知识：该项目未关联游戏，取不到任何合规红线——不得据此判定「合规通过」。';
export const COMPLIANCE_NOT_JUDGED_MSG =
  '本工具只交付权威红线清单与逐条溯源，不给合规判定：判定需要逐条比对文案与红线，请你据清单逐条说明「符合/不符合/无法判断」并引用来源素材。';
export const COMPLIANCE_PROJECT_NOT_FOUND_MSG = '项目不存在';

async function run(
  input: CheckComplianceInput,
  ctx: ToolContext,
): Promise<CheckComplianceOutput> {
  const db = ctx.db ?? prisma;
  const text = input.text ?? '';

  // 项目定位三口径（沿 knowledge-context / compute-health D8 先例）
  const project = await db.project.findFirst({
    where: {
      tenantId: ctx.tenantId,
      OR: [
        { id: input.projectId },
        { publicId: input.projectId },
        { slug: input.projectId },
      ],
    },
    select: {
      id: true,
      name: true,
      gameId: true,
      game: { select: { name: true } },
    },
  });
  if (!project) {
    throw new Error(
      `[check-compliance] ${COMPLIANCE_PROJECT_NOT_FOUND_MSG}: ${input.projectId}`,
    );
  }

  const base = {
    projectId: project.id,
    projectName: project.name,
    gameId: project.gameId ?? null,
    gameName: project.game?.name ?? null,
    textProvided: text.length > 0,
    textLength: text.length,
    verdict: 'not_judged' as const,
  };

  if (!project.gameId) {
    return { ...base, items: [], note: COMPLIANCE_NO_GAME_MSG };
  }

  // 链头读取器（唯一口径，不内联重查）
  const heads = await getKnowledgeHeads(project.gameId, ['compliance_redline']);
  if (heads.length === 0) {
    return { ...base, items: [], note: COMPLIANCE_NO_REDLINE_MSG };
  }

  // 溯源：一次批量取素材名（缺失的如实留 null，不编文件名）
  const materialIds = [...new Set(heads.flatMap((h) => h.sourceMaterialIds))];
  const materials = materialIds.length
    ? await db.material.findMany({
        where: { id: { in: materialIds }, tenantId: ctx.tenantId },
        select: { id: true, fileName: true },
      })
    : [];
  const fileNameById = new Map(materials.map((m) => [m.id, m.fileName]));

  const items: RedlineItem[] = heads.map((h) => {
    const sources = h.sourceMaterialIds.map((id) => ({
      materialId: id,
      fileName: fileNameById.get(id) ?? null,
    }));
    return {
      knowledgeId: h.id,
      content: h.content,
      confidence: h.confidence ?? null,
      sources,
      unsourced: sources.length === 0,
    };
  });

  return { ...base, items, note: COMPLIANCE_NOT_JUDGED_MSG };
}

export const checkComplianceTool: ToolDefinition<
  CheckComplianceInput,
  CheckComplianceOutput
> = {
  name: 'check_compliance',
  description:
    '取该项目所属游戏的现行合规红线清单（含每条的来源素材），用于内容合规自查。' +
    '本工具不给「合规/不合规」的判定——它只提供权威清单与溯源，判定要你逐条比对后说明并引用来源。' +
    '没有红线知识时如实返回空清单，绝不能据此说「合规通过」。只读，不改任何数据。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: run,
};
