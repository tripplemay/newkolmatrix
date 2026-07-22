// M2-A-MATCH F005 — match 语法面 RSC 组装层（campaigns/[id] page.tsx 调用）。
//
// P2 首访 lazy 生成：项目零 plans 且 cur ∈ {match 及以后} → 服务端同步
// generateCandidates + buildMatchPlans（原型无生成 CTA，不自创 UI 区块）；
// 生成失败（网关不可达，如 CI 无凭据）→ **静默降级空态占位（log warn 不抛错，D2）**
// ——CI 构建/渲染必须安全（F005 acceptance 硬要求）。
//
// 现行轮语义：最新 3 条（buildMatchPlans 同事务落库，恒同轮）按组合名稳定排序——
// 批准后的轮（1 approved + 2 superseded）仍是现行展示对象，直到下一轮生成。

import { prisma } from 'lib/db/prisma';
import { stageIndex } from 'lib/domain/env-guards';
import type { Stage } from 'lib/agent/stage-routing';
import { generateCandidates } from 'lib/match/generate-candidates';
import { buildMatchPlans } from 'lib/match/build-plans';
import {
  toCandidateView,
  toPlanView,
  type MatchSurfaceData,
} from 'lib/display/match-format';

export type { MatchSurfaceData };

export async function loadMatchSurfaceData(
  projectId: string,
  cur: Stage,
): Promise<MatchSurfaceData> {
  // P2 lazy：仅在环节已到 match 及以后才生成（brief 期不预生成——环节还没走到）
  const plansCount = await prisma.matchPlan.count({ where: { projectId } });
  if (plansCount === 0 && stageIndex(cur) >= stageIndex('match')) {
    try {
      await generateCandidates(projectId);
      await buildMatchPlans(projectId);
    } catch (error) {
      // D2 静默降级：空态占位由页面承担；CI 无网关凭据走此路径属预期
      console.warn(
        '[match] 首访 lazy 生成失败，降级空态占位（CI 无凭据属预期）:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  const latest = await prisma.matchPlan.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: {
      kols: {
        select: { matchScore: true },
        orderBy: { matchScore: 'desc' },
        take: 6, // P5 bars 派生源：组内 top6
      },
    },
  });
  const plans = [...latest]
    .sort((a, b) => a.name.localeCompare(b.name)) // A/B/C 稳定列序
    .map((p) =>
      toPlanView({
        id: p.id,
        name: p.name,
        recommended: p.recommended,
        rationale: p.rationale,
        metrics: p.metrics,
        topScores: p.kols.map((k) => k.matchScore),
      }),
    );

  const rows = await prisma.matchCandidate.findMany({
    where: { projectId, verdict: 'pending' },
    orderBy: { matchScore: 'desc' },
    include: {
      kol: { select: { displayName: true, platform: true, followers: true } },
    },
  });
  const candidates = rows
    .filter((r) => r.doubts.length > 0) // 「拿不准」= 有存疑原因才上待裁定表
    .map((r) =>
      toCandidateView({
        displayName: r.kol.displayName,
        platform: r.kol.platform,
        followers: r.kol.followers,
        matchScore: r.matchScore,
        scorePending: r.scorePending,
        doubts: r.doubts,
        preJudge: r.preJudge,
      }),
    );

  return { plans, candidates };
}
