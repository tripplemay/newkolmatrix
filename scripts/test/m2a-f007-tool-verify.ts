// M2-A-MATCH F007 验收 — match_plan / evaluate_creator 工具真机直调（Evaluator 测试产物）
//
// 前置：本地 dev DB 已起（.env DATABASE_URL）；网关凭据已配（evaluate_creator 走真
// embedText，L2 授权最小用量——本脚本共 3 次 embedText 短文本调用）。
// 隔离：独立夹具租户（${process.pid} 后缀，match-services.test.ts 先例），不触碰共享
// dev tenant——与并行验收 subagent 互不干扰；afterAll 语义 = 夹具租户级联删除（D-H）。
// 运行：node --env-file=.env --import tsx scripts/test/m2a-f007-tool-verify.ts

import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { ensureNativeToolsRegistered } from '../../src/lib/agent/tools';
import { generateCandidates } from '../../src/lib/match/generate-candidates';
import { buildMatchPlans } from '../../src/lib/match/build-plans';
import type { MatchPlanOutput } from '../../src/lib/agent/tools/match-plan';
import type { EvaluateCreatorOutput } from '../../src/lib/agent/tools/evaluate-creator';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const DIMS = 1024;
const FIXTURE_SLUG = `test-tenant-m2a-f007-eval-${process.pid}`;

let passed = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function vecLiteral(components: Record<number, number>): string {
  const v = new Array<number>(DIMS).fill(0);
  for (const [i, x] of Object.entries(components)) v[Number(i)] = x;
  return `[${v.join(',')}]`;
}

/** P7 mock 查询向量 = e1（候选生成不打网关）。 */
const mockEmbed = async (): Promise<number[]> => {
  const v = new Array<number>(DIMS).fill(0);
  v[0] = 1;
  return v;
};

async function main(): Promise<void> {
  console.log('[f007-verify] match_plan / evaluate_creator 直调验证开始');
  ensureNativeToolsRegistered();

  // ---- 夹具（隔离租户） ----
  const tenant = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M2A F007 验收夹具租户' },
  });
  const tenantId = tenant.id;
  const ctx: ToolContext = {
    tenantId,
    agentId: 'match',
    projectId: null,
    env: 'default',
  };

  try {
    const game = await prisma.game.create({
      data: { tenantId, name: 'F007 夹具游戏' },
    });
    await prisma.gameKnowledge.create({
      data: {
        tenantId,
        gameId: game.id,
        kind: 'audience',
        content: 'FPS 玩家 60% / 二次元 40%',
        structured: {
          slices: [
            { label: 'FPS 玩家', percent: 60 },
            { label: '二次元', percent: 40 },
          ],
        },
        sourceMaterialIds: ['m2a-f007-eval-fixture'],
      },
    });
    const project = await prisma.project.create({
      data: {
        tenantId,
        gameId: game.id,
        name: 'F007 夹具项目',
        slug: `f007-eval-${process.pid}`,
        goal: {
          targetExposure: 1_000_000,
          periodStart: '2026-07-01',
          periodEnd: '2026-09-30',
        },
      },
    });

    async function makeKol(
      handle: string,
      followers: number | null,
      audienceDemo: object | null,
      embedding: string | null,
    ): Promise<{ id: string; publicId: string }> {
      const k = await prisma.kol.create({
        data: {
          tenantId,
          canonicalHandle: `m2a-f007-${handle}`,
          displayName: `F007 夹具 ${handle}`,
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
      return { id: k.id, publicId: k.publicId };
    }

    const kolTop = await makeKol('top', 30_000, null, vecLiteral({ 0: 1 }));
    const kolMid = await makeKol(
      'mid',
      200_000,
      { interests: ['fps'] },
      vecLiteral({ 0: 0.8, 1: 0.6 }),
    );
    const kolHead = await makeKol(
      'head',
      1_200_000,
      null,
      vecLiteral({ 0: 0.6, 1: 0.8 }),
    );
    const kolNoEmbed = await makeKol('noembed', 99_000, null, null);
    void kolTop;
    void kolHead;

    // ---- 1. match_plan：PROJECT_NOT_FOUND ----
    const notFound = (
      await executeTool('match_plan', { projectId: 'no-such-project' }, ctx)
    ).output as MatchPlanOutput;
    assert(
      notFound.type === 'match_plan' &&
        notFound.found === false &&
        notFound.reason === 'PROJECT_NOT_FOUND' &&
        notFound.plans.length === 0,
      'match_plan 未知项目 → found:false + PROJECT_NOT_FOUND + type 路由键在位',
    );

    // ---- 2. match_plan：现行轮为空（清态） ----
    const empty = (
      await executeTool('match_plan', { projectId: project.id }, ctx)
    ).output as MatchPlanOutput;
    assert(
      empty.found === true && empty.plans.length === 0,
      'match_plan 零 plans → found:true + plans=[]（空态不编数据）',
    );

    // ---- 3. 入参 zod 校验（executeTool 边界） ----
    let threw = false;
    try {
      await executeTool('match_plan', {}, ctx);
    } catch {
      threw = true;
    }
    assert(threw, 'match_plan 空入参 → executeTool zod 校验抛错');

    // ---- 4. 生成一轮组合（P7 mock 向量，不打网关）→ match_plan 摘要 ----
    await generateCandidates(project.id, { embed: mockEmbed });
    await buildMatchPlans(project.id);
    const full = (
      await executeTool('match_plan', { projectId: project.slug! }, ctx)
    ).output as MatchPlanOutput; // 以 slug 口径调用（三口径之一）
    assert(
      full.found === true && full.projectName === 'F007 夹具项目',
      'match_plan slug 口径解析项目成功',
    );
    assert(full.plans.length === 3, `match_plan 返回现行轮 3 组（实际 ${full.plans.length}）`);
    const names = full.plans.map((p) => p.name);
    assert(
      [...names].every((n, i) => i === 0 || names[i - 1].localeCompare(n) <= 0),
      `组合按名稳定排序 A/B/C（${names.join(' | ')}）`,
    );
    assert(
      full.plans.every((p) => p.status === 'draft') &&
        full.plans.filter((p) => p.recommended).length === 1,
      '现行轮均 draft 且恰 1 组 recommended',
    );
    assert(
      full.plans.every(
        (p) =>
          p.members.length > 0 &&
          p.members.every(
            (m) =>
              typeof m.matchScore === 'number' &&
              Array.isArray(m.reasons) &&
              m.reasons.length > 0 &&
              typeof m.name === 'string',
          ),
      ),
      'PlanKol 摘要：每组成员携 matchScore + 非空 reasons + 名称',
    );
    assert(
      full.plans.every((p) =>
        p.members.every(
          (m, i, arr) => i === 0 || arr[i - 1].matchScore >= m.matchScore,
        ),
      ),
      '成员按 matchScore 降序',
    );
    assert(
      full.plans.every(
        (p) =>
          p.metrics != null &&
          p.metrics.budgetUsd === null &&
          typeof p.metrics.people === 'number' &&
          p.metrics.people === p.members.length,
      ),
      'metrics 宽松解析在位：budgetUsd 恒 null（P6）+ people=成员数',
    );

    // 4b. publicId 口径
    const byPublic = (
      await executeTool('match_plan', { projectId: project.publicId }, ctx)
    ).output as MatchPlanOutput;
    assert(
      byPublic.found === true && byPublic.plans.length === 3,
      'match_plan publicId 口径等价',
    );

    // ---- 5. evaluate_creator：KOL_NOT_FOUND（不打网关即返回） ----
    const noKol = (
      await executeTool(
        'evaluate_creator',
        { projectId: project.id, kolIdOrPublicId: 'no-such-kol' },
        ctx,
      )
    ).output as EvaluateCreatorOutput;
    assert(
      noKol.found === false &&
        noKol.reason === 'KOL_NOT_FOUND' &&
        noKol.evaluation === null,
      'evaluate_creator 未知 KOL → KOL_NOT_FOUND + evaluation:null',
    );

    // ---- 6. evaluate_creator：真网关 embedText（L2 最小用量 #1）——两因子齐备 ----
    const evalMid = (
      await executeTool(
        'evaluate_creator',
        { projectId: project.id, kolIdOrPublicId: kolMid.publicId },
        ctx,
      )
    ).output as EvaluateCreatorOutput;
    console.log('    evaluate_creator(kolMid) =', JSON.stringify(evalMid.evaluation));
    assert(
      evalMid.found === true &&
        evalMid.kol?.publicId === kolMid.publicId &&
        evalMid.evaluation != null,
      'evaluate_creator（audienceDemo+知识画像齐备）→ found + evaluation 在位',
    );
    assert(
      evalMid.evaluation!.score >= 0 &&
        evalMid.evaluation!.score <= 1 &&
        evalMid.evaluation!.pending === false,
      `两因子齐备 → pending=false，score=${evalMid.evaluation!.score.toFixed(4)} ∈ [0,1]`,
    );
    assert(
      evalMid.evaluation!.reasons.some((r) => r.includes('向量相似度')) &&
        evalMid.evaluation!.reasons.some((r) =>
          r.includes('来源：游戏知识库受众画像'),
        ),
      'reasons 可解释：向量相似度 + 受众契合（注明知识库来源）',
    );

    // ---- 7. evaluate_creator：audienceDemo null → pending 降级（L2 #2） ----
    const evalTop = (
      await executeTool(
        'evaluate_creator',
        { projectId: project.id, kolIdOrPublicId: kolTop.id },
        ctx,
      )
    ).output as EvaluateCreatorOutput;
    assert(
      evalTop.evaluation != null &&
        evalTop.evaluation.pending === true &&
        evalTop.evaluation.reasons.some((r) => r.includes('受众数据待接入')),
      'audienceDemo null → pending=true + reason「受众数据待接入」（FR-11.6 降级）',
    );

    // ---- 8. evaluate_creator：embedding 缺失 → 明示不可评（L2 #3） ----
    const evalNo = (
      await executeTool(
        'evaluate_creator',
        { projectId: project.id, kolIdOrPublicId: kolNoEmbed.id },
        ctx,
      )
    ).output as EvaluateCreatorOutput;
    assert(
      evalNo.found === true &&
        evalNo.reason === 'EMBEDDING_MISSING' &&
        evalNo.evaluation === null,
      'embedding 缺失 → EMBEDDING_MISSING + evaluation:null（P2 不编分）',
    );

    console.log(`[f007-verify] 全部 ${passed} 项断言通过`);
  } finally {
    // ---- D-H：夹具租户级联清理 ----
    await prisma.gameKnowledge.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    const leftovers = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM "Kol" WHERE "canonicalHandle" LIKE 'm2a-f007-%'`,
    );
    console.log(
      `[f007-verify] 夹具清理完成（残留 Kol=${leftovers[0].n}，应为 0）`,
    );
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
