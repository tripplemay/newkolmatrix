// M2-A-MATCH F003 — 候选生成服务（match 域首个服务层）。
//
// generateCandidates(projectId)：项目画像（name/goal + 游戏知识受众画像）→ embedding →
// pgvector cosine top-N（search-kols.ts SQL 范式）→ 逐候选 computeMatchScore →
// MatchCandidate 幂等 upsert（@@unique([projectId,kolId])）。
//
// 单一真相源：F005 页面首访 lazy / F004 refresh API / F006 nightly-screen 例程共用本服务，
// 不得各自内联重算（architecture :533 三处复用铁律）。
//
// P4 保留人工态：已 kept/dropped 的候选刷新时**不回退 pending**（upsert 的 update 分支
// 不含 verdict 字段）——D20 变异测试锚点（tests/integration/match-services.test.ts）。
// P7 测试边界：embedText 经 deps 注入可替换，单测/集成测 mock 向量不打网关。

import type { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import { embedText } from 'lib/ai/gateway';
import { getKnowledgeHeads } from 'lib/knowledge/query';
import {
  parseKnowledgeStructured,
  type AudienceSlice,
  type AudienceStructured,
} from 'lib/data/schemas/knowledge';
import { parseProjectGoal } from 'lib/data/schemas/project';
import {
  computeMatchScore,
  REASON_AUDIENCE_PENDING,
} from 'lib/domain/match-score';

/** 候选池上限（spec §2 F003：topN=20）。 */
export const CANDIDATE_TOP_N = 20;

/** doubts 规则：组合分低于此阈值 → 「相似度存疑」（示意值，上线以真实数据校准）。 */
export const SCORE_DOUBT_THRESHOLD = 0.5;

/** doubts canonical 文案（页面灰字直接消费）。 */
export const DOUBT_LOW_SCORE = '相似度存疑';

/**
 * preJudge 三态分档阈值（spec：由 score 分档；示意值，上线校准）。
 * score ≥ high → '高'；≥ mid → '中'；其余 → '?'。
 */
export const PRE_JUDGE_BANDS = { high: 0.75, mid: 0.55 } as const;

export type PreJudge = '高' | '中' | '?';

export function resolvePreJudge(score: number): PreJudge {
  if (score >= PRE_JUDGE_BANDS.high) return '高';
  if (score >= PRE_JUDGE_BANDS.mid) return '中';
  return '?';
}

/** P7 注入点：embedText 可替换（测试 mock 向量不打网关）。 */
export interface GenerateCandidatesDeps {
  embed?: (text: string) => Promise<number[]>;
}

export interface GenerateCandidatesResult {
  projectId: string;
  /** 本轮 upsert 的候选数（= 检索命中数） */
  total: number;
  created: number;
  updated: number;
  /** 受众数据缺失、降级纯向量分的候选数（页面「待核」口径） */
  scorePending: number;
}

interface CandidateRow {
  id: string;
  followers: number | null;
  audienceDemo: unknown;
  distance: number;
}

/** 游戏知识受众画像链头 → 受众切片扁平化（无画像 → null，评分层降级）。
 *  导出供 F007 evaluate_creator 单人评估复用（同一画像口径，不重复实现）。 */
export async function loadKnowledgeAudience(
  gameId: string,
): Promise<AudienceSlice[] | null> {
  const heads = await getKnowledgeHeads(gameId, ['audience']);
  const slices = heads.flatMap(
    (h) =>
      (
        parseKnowledgeStructured(
          'audience',
          h.structured,
        ) as AudienceStructured | null
      )?.slices ?? [],
  );
  return slices.length > 0 ? slices : null;
}

/** 查询文本 = Project name/goal + 游戏名 + 受众画像标签（spec §2 F003）。
 *  导出供 F007 evaluate_creator 复用（项目画像口径单点）。 */
export function buildQueryText(
  projectName: string,
  gameName: string | null,
  goalRaw: unknown,
  slices: AudienceSlice[] | null,
): string {
  const goal = parseProjectGoal(goalRaw);
  const parts = [
    projectName,
    gameName,
    goal ? `目标曝光 ${goal.targetExposure}` : null,
    slices ? `目标受众：${slices.map((s) => s.label).join('、')}` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * 候选生成：检索 + 评分 + 幂等 upsert。
 * 网关失败（embedText 抛错）不在此消化——由调用方决定降级语义
 * （F005 lazy 静默空态 / F006 例程逐项目消化 / F004 refresh 返回错误）。
 */
export async function generateCandidates(
  projectId: string,
  deps: GenerateCandidatesDeps = {},
): Promise<GenerateCandidatesResult> {
  const embed = deps.embed ?? embedText;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { game: { select: { name: true } } },
  });
  if (!project) {
    throw new Error(`[match] generateCandidates：项目不存在 ${projectId}`);
  }

  const knowledgeAudience = project.gameId
    ? await loadKnowledgeAudience(project.gameId)
    : null;

  const queryText = buildQueryText(
    project.name,
    project.game?.name ?? null,
    project.goal,
    knowledgeAudience,
  );
  const embedding = await embed(queryText);
  const vec = `[${embedding.join(',')}]`;

  // search-kols.ts:54-81 SQL 范式：cosine（<=>）top-N，embedding 缺失的 KOL 不入候选
  //（P2 定案：matchScore null 仅当 embedding 缺失——该类行根本不进池）。
  const rows = await prisma.$queryRawUnsafe<CandidateRow[]>(
    `SELECT id, followers, "audienceDemo", (embedding <=> $1::vector) AS distance
     FROM "Kol"
     WHERE "tenantId" = $2 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    vec,
    project.tenantId,
    CANDIDATE_TOP_N,
  );

  const existing = await prisma.matchCandidate.findMany({
    where: { projectId, kolId: { in: rows.map((r) => r.id) } },
    select: { kolId: true },
  });
  const existingIds = new Set(existing.map((e) => e.kolId));

  let created = 0;
  let updated = 0;
  let scorePending = 0;

  for (const row of rows) {
    const similarity = 1 - Number(row.distance);
    const computed = computeMatchScore({
      similarity,
      audienceDemo: row.audienceDemo,
      knowledgeAudience,
    });

    // doubts 规则化（spec §2 F003）：降级 → 受众数据待接入；低分 → 相似度存疑
    const doubts: string[] = [];
    if (computed.pending) doubts.push(REASON_AUDIENCE_PENDING);
    if (computed.score < SCORE_DOUBT_THRESHOLD) doubts.push(DOUBT_LOW_SCORE);

    if (computed.pending) scorePending += 1;

    const shared = {
      doubts,
      preJudge: resolvePreJudge(computed.score),
      matchScore: computed.score,
      scorePending: computed.pending,
    } satisfies Prisma.MatchCandidateUpdateInput;

    // P4：update 分支不含 verdict——已 kept/dropped 的人工裁定永不被刷新回退。
    await prisma.matchCandidate.upsert({
      where: { projectId_kolId: { projectId, kolId: row.id } },
      create: {
        tenantId: project.tenantId,
        projectId,
        kolId: row.id,
        ...shared,
      },
      update: shared,
    });

    if (existingIds.has(row.id)) updated += 1;
    else created += 1;
  }

  return { projectId, total: rows.length, created, updated, scorePending };
}
