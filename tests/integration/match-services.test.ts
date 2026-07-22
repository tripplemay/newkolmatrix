// M2-A-MATCH F003 — 候选/组合生成服务集成测试（打真库 + mock 向量 P7，D20 变异测试义务）。
//
// 变异断言设计（每条都能杀死一类变异）：
// 1. 幂等刷新：二跑候选数不增（杀「重复插入」变异，@@unique 幂等键）；
// 2. P4 verdict 保留：kept/dropped 刷新不回退 pending（杀「upsert 覆盖 verdict」变异）；
// 3. dropped 出局：组合不含 dropped 候选（杀「verdict 过滤丢失」变异）;
// 4. P4 supersede：二跑旧 draft → superseded 且新 3 组 draft（杀「supersede 漏置」变异）；
// 5. approved 永不动：重跑组合后 approved 行原样（杀「approved 被 supersede」变异）；
// 6. embedding 缺失的 KOL 不入候选池（P2 定案：score null 仅当 embedding 缺失）。
//
// 夹具向量设计：query = e1（基向量）；夹具 KOL 余弦相似度 = 向量首二维点积，
// 分别锚定 1.0 / 0.8 / 0.6 / 0.3 四档。
//
// 夹具租户独立（env-advance ${process.pid} 先例，不共享 dev tenant）：
// 1. CI 并行文件竞态安全——共享 dev tenant 的 find+create 在 fresh DB 上并行必撞
//    P2002（首推实测），upsert 也解不了「他人 afterAll 删我在用的 tenant」；
// 2. 检索按 project.tenantId 圈定 → 本租户只有夹具 KOL，断言全确定（total 恒 4），
//    不受本地 dev 库 2525 真 KOL 干扰。

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import {
  generateCandidates,
  CANDIDATE_TOP_N,
  DOUBT_LOW_SCORE,
} from '../../src/lib/match/generate-candidates';
import { buildMatchPlans } from '../../src/lib/match/build-plans';
import { parsePlanMetrics } from '../../src/lib/data/schemas/match';
import { REASON_AUDIENCE_PENDING } from '../../src/lib/domain/match-score';

const DIMS = 1024;

/** 构造 1024 维向量串：指定维度赋值，其余 0。 */
function vecLiteral(components: Record<number, number>): string {
  const v = new Array<number>(DIMS).fill(0);
  for (const [i, x] of Object.entries(components)) v[Number(i)] = x;
  return `[${v.join(',')}]`;
}

/** mock 查询向量 = e1（P7：不打网关）。 */
const mockEmbed = async (): Promise<number[]> => {
  const v = new Array<number>(DIMS).fill(0);
  v[0] = 1;
  return v;
};

const FIXTURE_SLUG = `test-tenant-m2a-match-${process.pid}`;

let tenantId: string;
let gameId: string;
let projectId: string;

// 夹具 KOL：id 按相似度档位命名
let kolTop: string; // sim 1.0 · 长尾(3万) · audienceDemo null → 降级
let kolMid: string; // sim 0.8 · 腰部(20万) · audienceDemo interests 命中 → 加权 0.74
let kolHead: string; // sim 0.6 · 头部(120万) · audienceDemo null → 降级
let kolLow: string; // sim 0.3 · 长尾(5千) · 低分 → 相似度存疑
let kolNoEmbed: string; // 无 embedding → 不入池

async function makeKol(
  handle: string,
  followers: number | null,
  audienceDemo: object | null,
  embedding: string | null,
): Promise<string> {
  const k = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m2a-f003-${handle}`,
      displayName: `夹具 ${handle}`,
      platform: 'youtube',
      followers,
      ...(audienceDemo ? { audienceDemo } : {}),
    },
  });
  if (embedding) {
    await prisma.$executeRawUnsafe(
      `UPDATE "Kol" SET embedding = $1::vector WHERE id = $2`,
      embedding,
      k.id,
    );
  }
  return k.id;
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2A match 集成测试夹具租户' },
  });
  tenantId = t.id;

  const game = await prisma.game.create({
    data: { tenantId, name: 'M2A F003 夹具游戏' },
  });
  gameId = game.id;

  // 受众画像链头（audience 知识；FR-11.9 溯源非空）
  await prisma.gameKnowledge.create({
    data: {
      tenantId,
      gameId,
      kind: 'audience',
      content: 'FPS 玩家 60% / 二次元 40%',
      structured: {
        slices: [
          { label: 'FPS 玩家', percent: 60 },
          { label: '二次元', percent: 40 },
        ],
      },
      sourceMaterialIds: ['m2a-f003-fixture'],
    },
  });

  const project = await prisma.project.create({
    data: {
      tenantId,
      gameId,
      name: 'M2A F003 夹具项目',
      goal: {
        targetExposure: 1_000_000,
        periodStart: '2026-07-01',
        periodEnd: '2026-09-30',
      },
    },
  });
  projectId = project.id;

  kolTop = await makeKol('top', 30_000, null, vecLiteral({ 0: 1 }));
  kolMid = await makeKol(
    'mid',
    200_000,
    { interests: ['fps'] },
    vecLiteral({ 0: 0.8, 1: 0.6 }),
  );
  kolHead = await makeKol(
    'head',
    1_200_000,
    null,
    vecLiteral({ 0: 0.6, 1: 0.8 }),
  );
  kolLow = await makeKol(
    'low',
    5_000,
    null,
    vecLiteral({ 0: 0.3, 1: Math.sqrt(1 - 0.09) }),
  );
  kolNoEmbed = await makeKol('noembed', 99_000, null, null);
});

afterAll(async () => {
  // D-H 扩展：Match 三表验收产物测毕清零复原（tenant Cascade 清 Project→MatchPlan/
  // PlanKol/MatchCandidate + Kol + Game→GameKnowledge，夹具租户整体删除）
  await prisma.gameKnowledge.deleteMany({ where: { gameId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('generateCandidates（检索 + 评分 + 幂等 upsert）', () => {
  it('首跑：夹具四档全部入池、评分/doubts/preJudge 按规则落库；无 embedding 不入池', async () => {
    const r = await generateCandidates(projectId, { embed: mockEmbed });
    expect(r.total).toBe(4); // 夹具租户内恰 4 个带 embedding 的 KOL
    expect(r.total).toBeLessThanOrEqual(CANDIDATE_TOP_N);
    expect(r.created).toBe(r.total);

    const byKol = new Map(
      (await prisma.matchCandidate.findMany({ where: { projectId } })).map(
        (c) => [c.kolId, c],
      ),
    );

    // sim 1.0 · audienceDemo null → 降级纯向量分 + 待接入 doubt + 高
    const top = byKol.get(kolTop);
    expect(top).toBeDefined();
    expect(top?.matchScore).toBeCloseTo(1.0, 5);
    expect(top?.scorePending).toBe(true);
    expect(top?.doubts).toContain(REASON_AUDIENCE_PENDING);
    expect(top?.preJudge).toBe('高');

    // sim 0.8 · interests 命中 FPS(60) → 0.8*0.7 + 0.6*0.3 = 0.74 · 不降级 · 中
    const mid = byKol.get(kolMid);
    expect(mid?.scorePending).toBe(false);
    expect(mid?.matchScore).toBeCloseTo(0.74, 5);
    expect(mid?.preJudge).toBe('中');
    expect(mid?.doubts).toEqual([]);

    // sim 0.3 → score 0.3 < 0.5 → 相似度存疑 + '?'
    const low = byKol.get(kolLow);
    expect(low?.matchScore).toBeCloseTo(0.3, 5);
    expect(low?.doubts).toContain(DOUBT_LOW_SCORE);
    expect(low?.preJudge).toBe('?');

    // 变异断言 6：embedding 缺失不入池
    expect(byKol.has(kolNoEmbed)).toBe(false);
  });

  it('幂等刷新（变异断言 1）：二跑候选数不增、全为 updated', async () => {
    const before = await prisma.matchCandidate.count({ where: { projectId } });
    const r = await generateCandidates(projectId, { embed: mockEmbed });
    const after = await prisma.matchCandidate.count({ where: { projectId } });
    expect(after).toBe(before);
    expect(r.created).toBe(0);
    expect(r.updated).toBe(r.total);
  });

  it('P4 verdict 保留（变异断言 2）：kept/dropped 刷新不回退 pending', async () => {
    await prisma.matchCandidate.update({
      where: { projectId_kolId: { projectId, kolId: kolMid } },
      data: { verdict: 'kept' },
    });
    await prisma.matchCandidate.update({
      where: { projectId_kolId: { projectId, kolId: kolLow } },
      data: { verdict: 'dropped' },
    });

    await generateCandidates(projectId, { embed: mockEmbed });

    const mid = await prisma.matchCandidate.findUniqueOrThrow({
      where: { projectId_kolId: { projectId, kolId: kolMid } },
    });
    const low = await prisma.matchCandidate.findUniqueOrThrow({
      where: { projectId_kolId: { projectId, kolId: kolLow } },
    });
    expect(mid.verdict).toBe('kept');
    expect(low.verdict).toBe('dropped');
    // 刷新仍更新评分字段（verdict 之外照常刷新）
    expect(mid.matchScore).toBeCloseTo(0.74, 5);
  });
});

describe('buildMatchPlans（规则化 3 组 + supersede）', () => {
  it('首跑：3 组 draft（A/B/C 命名沿 mock 语义）、B recommended、metrics 合形、reasons 非空', async () => {
    const r = await buildMatchPlans(projectId);
    expect(r.plans).toBe(3);
    expect(r.superseded).toBe(0);

    const plans = await prisma.matchPlan.findMany({
      where: { projectId, status: 'draft' },
      include: { kols: true },
      orderBy: { name: 'asc' },
    });
    expect(plans.map((p) => p.name)).toEqual([
      'A · 生活流精投组',
      'B · 均衡组',
      'C · 头部拉动组',
    ]);
    expect(plans.map((p) => p.recommended)).toEqual([false, true, false]);

    for (const p of plans) {
      expect(p.kols.length).toBeGreaterThan(0);
      expect(p.kols.length).toBeLessThanOrEqual(10);
      const metrics = parsePlanMetrics(p.metrics);
      expect(metrics).not.toBeNull();
      expect(metrics?.people).toBe(p.kols.length);
      expect(metrics?.budgetUsd).toBeNull(); // P6 恒 null
      expect(p.rationale.length).toBeGreaterThan(0);
      for (const pk of p.kols) {
        expect(pk.reasons.length).toBeGreaterThan(0); // 可解释依据必带
      }
    }

    // 组规则锚点：A（中小粉丝）含 kolTop；B（分层混合）含最优头部 kolHead
    const planA = plans[0];
    const planB = plans[1];
    expect(planA.kols.some((k) => k.kolId === kolTop)).toBe(true);
    expect(planA.kols.some((k) => k.kolId === kolHead)).toBe(false); // 头部不入精投组
    expect(planB.kols.some((k) => k.kolId === kolHead)).toBe(true);
  });

  it('dropped 出局（变异断言 3）：组合任何组不含 dropped 候选', async () => {
    const planKols = await prisma.planKol.findMany({
      where: { plan: { projectId } },
    });
    expect(planKols.some((pk) => pk.kolId === kolLow)).toBe(false);
  });

  it('P4 supersede（变异断言 4）：二跑旧 draft → superseded、新 3 组 draft', async () => {
    const r = await buildMatchPlans(projectId);
    expect(r.plans).toBe(3);
    expect(r.superseded).toBe(3);

    const drafts = await prisma.matchPlan.count({
      where: { projectId, status: 'draft' },
    });
    const superseded = await prisma.matchPlan.count({
      where: { projectId, status: 'superseded' },
    });
    expect(drafts).toBe(3);
    expect(superseded).toBe(3);
  });

  it('approved 永不动（变异断言 5）：重跑组合后 approved 行原样保留', async () => {
    const approved = await prisma.matchPlan.findFirstOrThrow({
      where: { projectId, status: 'draft' },
    });
    await prisma.matchPlan.update({
      where: { id: approved.id },
      data: {
        status: 'approved',
        approvedBy: 'operator',
        approvedAt: new Date(),
      },
    });

    const r = await buildMatchPlans(projectId);
    expect(r.superseded).toBe(2); // 只 supersede 剩余 2 条 draft

    const still = await prisma.matchPlan.findUniqueOrThrow({
      where: { id: approved.id },
    });
    expect(still.status).toBe('approved');
    expect(still.approvedBy).toBe('operator');

    const drafts = await prisma.matchPlan.count({
      where: { projectId, status: 'draft' },
    });
    expect(drafts).toBe(3); // 新一轮 3 组
  });

  it('空候选池 → 不建组（plans:0），不抛错（D2 诚实降级）', async () => {
    const empty = await prisma.project.create({
      data: { tenantId, name: 'M2A F003 空候选项目' },
    });
    const r = await buildMatchPlans(empty.id);
    expect(r.plans).toBe(0);
    expect(r.superseded).toBe(0);
    await prisma.project.delete({ where: { id: empty.id } });
  });
});
