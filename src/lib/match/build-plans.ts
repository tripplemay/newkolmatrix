// M2-A-MATCH F003 — 组合生成服务：候选池 → 规则化 3 组方案（P1 无 LLM 打分）。
//
// 三组语义沿 mock env-match.ts:44-78 命名：
//   A · 生活流精投组 —— 匹配分优先、粉丝量中小
//   B · 均衡组（recommended）—— 头部/腰部/长尾分层混合
//   C · 头部拉动组 —— followers 加权拉动触达
//
// supersede 语义（P4，同事务）：新 3 组落库 draft + 旧 draft → superseded；
// **approved 永不动**（审计链）——D20 变异测试锚点。
// metrics：reachTotal=Σfollowers 真值 · budgetUsd=null（P6 无价格数据，显示「待核」）·
// risk 由 doubts 占比分档 · people=组员数。

import type { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import {
  assertPlanKolReasons,
  type PlanMetrics,
} from 'lib/data/schemas/match';

/** 每组成员上限（spec §2 F003：≤10 人）。 */
export const PLAN_MAX_MEMBERS = 10;

/** 粉丝量分层阈值（示意值，上线以真实数据校准）。 */
export const FOLLOWER_TIERS = {
  /** ≥ 此数为头部 */
  headMin: 500_000,
  /** < 此数为长尾（介于两者 = 腰部） */
  smallMax: 50_000,
} as const;

/** risk 分档：组内「有存疑」成员占比（示意值，上线校准）。 */
export const RISK_BANDS = {
  /** < 此占比 → low */
  low: 1 / 3,
  /** < 此占比 → mid，其余 high */
  mid: 2 / 3,
} as const;

export interface BuildPlansResult {
  projectId: string;
  /** 本轮新建的 draft 组数（0 = 无可用候选，未建组） */
  plans: number;
  /** 被置为 superseded 的旧 draft 数 */
  superseded: number;
}

interface PoolEntry {
  kolId: string;
  matchScore: number;
  followers: number | null;
  hasDoubts: boolean;
}

type Tier = 'head' | 'mid' | 'small';

function tierOf(followers: number | null): Tier {
  // followers 未知按非头部处理（不编造头部地位）
  if (followers != null && followers >= FOLLOWER_TIERS.headMin) return 'head';
  if (followers != null && followers >= FOLLOWER_TIERS.smallMax) return 'mid';
  return 'small';
}

const TIER_LABEL: Record<Tier, string> = {
  head: '头部',
  mid: '腰部',
  small: '长尾',
};

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** A · 生活流精投组：匹配分优先，粉丝量中小（无中小候选时按分数兜底，不留空组）。 */
function pickPrecision(pool: PoolEntry[]): PoolEntry[] {
  const nonHead = pool.filter((e) => tierOf(e.followers) !== 'head');
  const base = nonHead.length > 0 ? nonHead : pool;
  return base.slice(0, PLAN_MAX_MEMBERS);
}

/** B · 均衡组：三层轮转混合（每层按分序），覆盖与稳定平衡。 */
function pickBalanced(pool: PoolEntry[]): PoolEntry[] {
  const byTier: Record<Tier, PoolEntry[]> = { head: [], mid: [], small: [] };
  for (const e of pool) byTier[tierOf(e.followers)].push(e);
  const order: Tier[] = ['head', 'mid', 'small'];
  const out: PoolEntry[] = [];
  let exhausted = false;
  while (out.length < PLAN_MAX_MEMBERS && !exhausted) {
    exhausted = true;
    for (const t of order) {
      const next = byTier[t].shift();
      if (next) {
        out.push(next);
        exhausted = false;
        if (out.length >= PLAN_MAX_MEMBERS) break;
      }
    }
  }
  return out;
}

/** C · 头部拉动组：followers 对数归一 × 匹配分等权加权，拉动最大触达。 */
function pickHeadline(pool: PoolEntry[]): PoolEntry[] {
  const maxFollowers = Math.max(
    1,
    ...pool.map((e) => e.followers ?? 0),
  );
  const weight = (e: PoolEntry): number => {
    const norm =
      Math.log10((e.followers ?? 0) + 1) / Math.log10(maxFollowers + 1);
    return e.matchScore * 0.5 + norm * 0.5;
  };
  return [...pool].sort((a, b) => weight(b) - weight(a)).slice(0, PLAN_MAX_MEMBERS);
}

function resolveRisk(doubtRatio: number): PlanMetrics['risk'] {
  if (doubtRatio < RISK_BANDS.low) return 'low';
  if (doubtRatio < RISK_BANDS.mid) return 'mid';
  return 'high';
}

function buildMetrics(members: PoolEntry[]): PlanMetrics {
  const known = members.filter((m) => m.followers != null);
  const reachTotal =
    known.length > 0
      ? known.reduce((s, m) => s + (m.followers ?? 0), 0)
      : null; // 全员 followers 缺失 → null（不编造，显示层「待核」）
  const doubtRatio =
    members.length > 0
      ? members.filter((m) => m.hasDoubts).length / members.length
      : 0;
  return {
    reachTotal,
    budgetUsd: null, // P6：无价格数据源恒 null
    risk: resolveRisk(doubtRatio),
    people: members.length,
  };
}

function avgScore(members: PoolEntry[]): number {
  if (members.length === 0) return 0;
  return members.reduce((s, m) => s + m.matchScore, 0) / members.length;
}

interface PlanDraft {
  name: string;
  recommended: boolean;
  rationale: string;
  ruleReason: string;
  members: PoolEntry[];
}

/**
 * 组合生成：候选（verdict != dropped 且 matchScore 非 null）→ 规则化 3 组 draft。
 * 空候选池 → 不建组（plans:0），页面走空态占位（D2 诚实降级）。
 */
export async function buildMatchPlans(
  projectId: string,
): Promise<BuildPlansResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error(`[match] buildMatchPlans：项目不存在 ${projectId}`);
  }

  const candidates = await prisma.matchCandidate.findMany({
    where: {
      projectId,
      verdict: { not: 'dropped' }, // dropped 出局；pending/kept 均可入组
      matchScore: { not: null },
    },
    orderBy: { matchScore: 'desc' },
  });

  if (candidates.length === 0) {
    return { projectId, plans: 0, superseded: 0 };
  }

  const kols = await prisma.kol.findMany({
    where: { id: { in: candidates.map((c) => c.kolId) } },
    select: { id: true, followers: true },
  });
  const followersById = new Map(kols.map((k) => [k.id, k.followers]));

  const pool: PoolEntry[] = candidates.map((c) => ({
    kolId: c.kolId,
    matchScore: c.matchScore ?? 0,
    followers: followersById.get(c.kolId) ?? null,
    hasDoubts: c.doubts.length > 0,
  }));

  const precision = pickPrecision(pool);
  const balanced = pickBalanced(pool);
  const headline = pickHeadline(pool);

  const drafts: PlanDraft[] = [
    {
      name: 'A · 生活流精投组',
      recommended: false,
      rationale: `匹配分优先选入中小粉丝量创作者 ${precision.length} 人，组合平均匹配分 ${pct(avgScore(precision))}`,
      ruleReason: '入选规则：匹配分优先 · 中小粉丝量（生活流精投）',
      members: precision,
    },
    {
      name: 'B · 均衡组',
      recommended: true, // 分层混合 = Agent 推荐位（mock best 语义）
      rationale: `头部/腰部/长尾分层混合 ${balanced.length} 人，覆盖与稳定平衡，组合平均匹配分 ${pct(avgScore(balanced))}`,
      ruleReason: '入选规则：分层均衡（头部/腰部/长尾轮转混合）',
      members: balanced,
    },
    {
      name: 'C · 头部拉动组',
      recommended: false,
      rationale: `粉丝量加权拉动最大触达，选入 ${headline.length} 人（followers 对数归一 × 匹配分等权）`,
      ruleReason: '入选规则：粉丝量加权（头部拉动触达）',
      members: headline,
    },
  ];

  // P4 supersede 同事务：旧 draft → superseded + 新 3 组落库；approved 永不动
  //（updateMany 只圈 status=draft）。
  const superseded = await prisma.$transaction(async (tx) => {
    const old = await tx.matchPlan.updateMany({
      where: { projectId, status: 'draft' },
      data: { status: 'superseded' },
    });

    for (const d of drafts) {
      await tx.matchPlan.create({
        data: {
          tenantId: project.tenantId,
          projectId,
          name: d.name,
          metrics: buildMetrics(d.members) as Prisma.InputJsonValue,
          rationale: d.rationale,
          recommended: d.recommended,
          status: 'draft',
          kols: {
            create: d.members.map((m) => ({
              tenantId: project.tenantId,
              kolId: m.kolId,
              matchScore: m.matchScore,
              // 可解释依据必带（FR-11.9 先例）：分数 + 入选规则 + 粉丝分层
              reasons: assertPlanKolReasons([
                `匹配分 ${pct(m.matchScore)}`,
                d.ruleReason,
                `粉丝分层：${TIER_LABEL[tierOf(m.followers)]}${m.followers != null ? `（${m.followers.toLocaleString()}）` : '（粉丝量未知）'}`,
              ]),
            })),
          },
        },
      });
    }

    return old.count;
  });

  return { projectId, plans: drafts.length, superseded };
}
