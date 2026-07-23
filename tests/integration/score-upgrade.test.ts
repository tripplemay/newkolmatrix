// M2-B-CREATORS F007 — 评分升级端到端验证（打真库 mock 向量，跨 F002/F003→M2-A 评分链）。
//
// 勘查实证（spec §1.1 #12）：extractInterests 只认 {interests: string[]} 非空——
// 外采派生 audienceDemo 落库后，下一轮 generateCandidates **零代码自动升级**：
// scorePending=false、「受众数据待接入」doubt 消失、加权组合分（0.7/0.3）生效。
// 本套件把这条链当作端到端不变式钉死：
// 1. interests 入场 → scorePending=false + doubt 消失 + score = 0.7·sim + 0.3·fit；
// 2. evaluate_creator（工具路径）消费同一 audienceDemo 同断言（三处复用铁律）；
// 3. interests 全空行仍降级待核（D2 回归——升级不吞降级路径）；
// 4. 显示层：scorePending=false 行 match 列显真 %（toCandidateView 真库行集成断言）。
// M2-A D20 全量回归由 match-services / match-approve / nightly-screen 套件承担（同 run 全绿）。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { generateCandidates } from '../../src/lib/match/generate-candidates';
import { loadMatchSurfaceData } from '../../src/lib/match/surface-data';
import {
  computeMatchScore,
  MATCH_WEIGHTS,
  REASON_AUDIENCE_PENDING,
} from '../../src/lib/domain/match-score';
import { deriveAudienceDemo } from '../../src/lib/kol-sync/derive';
import type { ApifyKolRow } from '../../src/lib/apify/schemas';

const FIXTURE_SLUG = `test-tenant-m2b-upgrade-${process.pid}`;
const DIMS = 1024;

let tenantId: string;
let projectId: string;
let kolWithInterests: string; // 派生 interests 已落库 → 升级路径
let kolNoInterests: string; // 契约位 null → 降级路径回归

const mockEmbed = async (): Promise<number[]> => {
  const v = new Array<number>(DIMS).fill(0);
  v[0] = 1;
  return v;
};

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2B 评分升级夹具租户' },
  });
  tenantId = t.id;

  const game = await prisma.game.create({
    data: { tenantId, name: 'M2B F007 夹具游戏' },
  });
  // 知识受众画像链头（加权的知识侧输入）
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId: game.id,
      kind: 'audience',
      content: 'FPS 玩家 60 / 二次元 40',
      structured: {
        slices: [
          { label: 'FPS 玩家', percent: 60 },
          { label: '二次元', percent: 40 },
        ],
      },
      sourceMaterialIds: ['m2b-f007-fixture'],
    },
  });

  const p = await prisma.project.create({
    data: {
      tenantId,
      gameId: game.id,
      name: 'M2B F007 夹具项目',
      cur: 'match',
      maxReached: 'match',
      goal: {
        targetExposure: 500_000,
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
      },
    },
  });
  projectId = p.id;

  // KOL A：经 F002 派生管道产出 audienceDemo（与 F003 sync 落库同形）——interests 命中 FPS
  const derived = deriveAudienceDemo({
    id: 'x',
    platform: 'youtube',
    platformUserId: 'x',
    username: 'x',
    matchedTags: ['fps'],
  } as ApifyKolRow);
  const a = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: 'm2b-f007-with-interests',
      displayName: '升级路径 KOL',
      platform: 'youtube',
      followers: 100_000,
      dataSource: 'crawl',
      audienceDemo: derived!,
    },
  });
  kolWithInterests = a.id;

  const b = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: 'm2b-f007-no-interests',
      displayName: '降级回归 KOL',
      platform: 'youtube',
      followers: 50_000,
    },
  });
  kolNoInterests = b.id;

  for (const [id, first, second] of [
    [kolWithInterests, 1, 0],
    [kolNoInterests, 0.8, 0.6],
  ] as const) {
    const v = new Array<number>(DIMS).fill(0);
    v[0] = first;
    v[1] = second;
    await prisma.$executeRawUnsafe(
      `UPDATE "Kol" SET embedding = $1::vector WHERE id = $2`,
      `[${v.join(',')}]`,
      id,
    );
  }

  await generateCandidates(projectId, { embed: mockEmbed });
  // 建组使 plans>0：loadMatchSurfaceData 的 P2 lazy 不触发（否则会用真网关重刷
  // mock 分——lazy 只在零 plans 时跑，这正是其产品语义）
  const { buildMatchPlans } = await import('../../src/lib/match/build-plans');
  await buildMatchPlans(projectId);
});

afterAll(async () => {
  await prisma.gameKnowledge.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('评分升级端到端（interests 入场 → 零代码自动升级）', () => {
  it('scorePending=false + 「受众数据待接入」doubt 消失 + 加权组合分（0.7/0.3）', async () => {
    const c = await prisma.matchCandidate.findUniqueOrThrow({
      where: { projectId_kolId: { projectId, kolId: kolWithInterests } },
    });
    expect(c.scorePending).toBe(false);
    expect(c.doubts).not.toContain(REASON_AUDIENCE_PENDING);
    // sim=1.0；fit：interests ['fps'] 命中「FPS 玩家」60/100 = 0.6
    const expected =
      1.0 * MATCH_WEIGHTS.similarity + 0.6 * MATCH_WEIGHTS.audience;
    expect(c.matchScore).toBeCloseTo(expected, 5);
  });

  it('interests 全空行仍降级待核（D2 回归——升级不吞降级路径）', async () => {
    const c = await prisma.matchCandidate.findUniqueOrThrow({
      where: { projectId_kolId: { projectId, kolId: kolNoInterests } },
    });
    expect(c.scorePending).toBe(true);
    expect(c.doubts).toContain(REASON_AUDIENCE_PENDING);
    expect(c.matchScore).toBeCloseTo(0.8, 5); // 纯向量分直通
  });

  it('三处复用铁律：computeMatchScore 直调（工具路径同源）与落库值一致', async () => {
    const kol = await prisma.kol.findUniqueOrThrow({
      where: { id: kolWithInterests },
      select: { audienceDemo: true },
    });
    const heads = await prisma.gameKnowledge.findMany({
      where: { tenantId, kind: 'audience', supersededById: null },
    });
    const slices = (
      heads[0].structured as {
        slices: Array<{ label: string; percent: number }>;
      }
    ).slices;
    const direct = computeMatchScore({
      similarity: 1.0,
      audienceDemo: kol.audienceDemo,
      knowledgeAudience: slices,
    });
    const stored = await prisma.matchCandidate.findUniqueOrThrow({
      where: { projectId_kolId: { projectId, kolId: kolWithInterests } },
    });
    expect(direct.pending).toBe(false);
    expect(stored.matchScore).toBeCloseTo(direct.score, 5);
  });

  it('显示层：scorePending=false 行 match 列显真 %（待裁定表集成断言）', async () => {
    // kolNoInterests：scorePending → doubts 非空 → 上待裁定表且 match=null（待核）
    const surface = await loadMatchSurfaceData(projectId, 'match');
    const degraded = surface.candidates.find((c) => c.name === '降级回归 KOL');
    expect(degraded).toBeDefined();
    expect(degraded!.match).toBeNull();

    // kolWithInterests：升级后无「受众待接入」doubt；若因低分仍有 doubt 则显真 %——
    // 本夹具 score=0.88 ≥ 阈值 → 无 doubts → 不上待裁定表（离表即升级的显示面证据）
    const upgraded = surface.candidates.find((c) => c.name === '升级路径 KOL');
    expect(upgraded).toBeUndefined();

    // 直接以视图映射断言真 % 形态（toCandidateView 消费真库行）
    const { toCandidateView } = await import(
      '../../src/lib/display/match-format'
    );
    const row = await prisma.matchCandidate.findUniqueOrThrow({
      where: { projectId_kolId: { projectId, kolId: kolWithInterests } },
      include: {
        kol: { select: { displayName: true, platform: true, followers: true } },
      },
    });
    const view = toCandidateView({
      id: row.id,
      displayName: row.kol.displayName,
      platform: row.kol.platform,
      followers: row.kol.followers,
      matchScore: row.matchScore,
      scorePending: row.scorePending,
      doubts: row.doubts,
      preJudge: row.preJudge,
    });
    expect(view.match).toBe('88%');
  });
});
