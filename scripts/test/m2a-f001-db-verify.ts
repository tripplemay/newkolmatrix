// M2-A-MATCH F001 验收 — DB 实物验证（Evaluator: Andy/evaluator-subagent, 2026-07-22）
// 1) 三表在库（information_schema）+ 列清单  2) 两枚举值域  3) 幂等唯一键 + 索引
// 4) migration 记录  5) RLS 缺省确认（D4）  6) 物理约束实测：默认值 + @@unique 冲突 + FK
// 7) D-H：测前/测后三表行数（测毕清理复原）
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ── 1. 三表在库 + 列
  const cols = await prisma.$queryRawUnsafe<any[]>(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name IN ('MatchPlan','PlanKol','MatchCandidate')
    ORDER BY table_name, ordinal_position`);
  const byTable: Record<string, string[]> = {};
  for (const c of cols) {
    byTable[c.table_name] ??= [];
    byTable[c.table_name].push(
      `${c.column_name}:${c.data_type}${c.is_nullable === 'YES' ? '?' : ''}${c.column_default ? ` def=${String(c.column_default).slice(0, 30)}` : ''}`,
    );
  }
  console.log('== 1. tables/columns ==');
  for (const [t, cl] of Object.entries(byTable)) console.log(`${t} (${cl.length} cols):\n  ${cl.join('\n  ')}`);

  // ── 2. 枚举值域
  const enums = await prisma.$queryRawUnsafe<any[]>(`
    SELECT t.typname, e.enumlabel, e.enumsortorder
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname IN ('MatchPlanStatus','CandidateVerdict')
    ORDER BY t.typname, e.enumsortorder`);
  console.log('\n== 2. enums ==');
  console.log(enums.map((e) => `${e.typname}.${e.enumlabel}`).join(' | '));

  // ── 3. 索引 / 唯一键
  const idx = await prisma.$queryRawUnsafe<any[]>(`
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE tablename IN ('MatchPlan','PlanKol','MatchCandidate') ORDER BY tablename, indexname`);
  console.log('\n== 3. indexes ==');
  for (const i of idx) console.log(`${i.indexname}: ${i.indexdef.replace(/CREATE (UNIQUE )?INDEX .* ON /, (m: string) => (m.includes('UNIQUE') ? '[UNIQUE] ' : ''))}`);

  // ── 4. migration 记录
  const mig = await prisma.$queryRawUnsafe<any[]>(`
    SELECT migration_name, finished_at IS NOT NULL AS applied FROM _prisma_migrations
    WHERE migration_name = '20260722161835_m2a_match_three_tables'`);
  console.log('\n== 4. migration ==', JSON.stringify(mig));

  // ── 5. RLS 缺省（D4：单租户不建 RLS，relrowsecurity 应为 false）
  const rls = await prisma.$queryRawUnsafe<any[]>(`
    SELECT relname, relrowsecurity FROM pg_class
    WHERE relname IN ('MatchPlan','PlanKol','MatchCandidate')`);
  console.log('\n== 5. RLS ==', JSON.stringify(rls));

  // ── 6/7. 物理约束实测（D-H：测前行数 → 插入 → 冲突 → 清理 → 测后行数）
  const counts = async () => {
    const [p, k, c] = await Promise.all([
      prisma.matchPlan.count(),
      prisma.planKol.count(),
      prisma.matchCandidate.count(),
    ]);
    return { MatchPlan: p, PlanKol: k, MatchCandidate: c };
  };
  console.log('\n== 6. D-H pre-test counts ==', JSON.stringify(await counts()));

  const proj = await prisma.project.findFirst({ select: { id: true, tenantId: true, name: true } });
  const kol = await prisma.kol.findFirst({ select: { id: true } });
  if (!proj || !kol) throw new Error('dev DB 缺 Project/Kol 样本');
  console.log(`sample: project=${proj.name} kol=${kol.id.slice(0, 8)}…`);

  // 6a. 默认值实测（verdict/doubts/scorePending 不显式传）
  const cand = await prisma.matchCandidate.create({
    data: { tenantId: proj.tenantId, projectId: proj.id, kolId: kol.id, preJudge: '?' },
  });
  console.log(
    `6a defaults: verdict=${cand.verdict} doubts=${JSON.stringify(cand.doubts)} scorePending=${cand.scorePending} matchScore=${cand.matchScore} publicId=${!!cand.publicId}`,
  );

  // 6b. @@unique([projectId,kolId]) 冲突实测 → 期待 P2002
  let uniqueViolation = 'NOT-FIRED';
  try {
    await prisma.matchCandidate.create({
      data: { tenantId: proj.tenantId, projectId: proj.id, kolId: kol.id, preJudge: '高' },
    });
  } catch (e: any) {
    uniqueViolation = e?.code === 'P2002' ? 'P2002 (unique violation) ✓' : `unexpected: ${e?.code ?? e}`;
  }
  console.log('6b unique(projectId,kolId):', uniqueViolation);

  // 6c. MatchPlan 默认值 + PlanKol FK Cascade 实测
  const plan = await prisma.matchPlan.create({
    data: { tenantId: proj.tenantId, projectId: proj.id, name: 'EVAL-TMP', metrics: { reachTotal: null, budgetUsd: null, risk: null, people: 0 }, rationale: 'evaluator tmp' },
  });
  console.log(`6c MatchPlan defaults: status=${plan.status} recommended=${plan.recommended} approvedBy=${plan.approvedBy}`);
  await prisma.planKol.create({
    data: { tenantId: proj.tenantId, planId: plan.id, kolId: kol.id, matchScore: 0.5, reasons: ['evaluator tmp reason'] },
  });
  await prisma.matchPlan.delete({ where: { id: plan.id } }); // Cascade 应删除 PlanKol
  const orphan = await prisma.planKol.count({ where: { planId: plan.id } });
  console.log(`6c PlanKol cascade on plan delete: orphans=${orphan} ${orphan === 0 ? '✓' : '✗'}`);

  // 6d. FK 违规实测（不存在的 projectId → 期待 P2003）
  let fkViolation = 'NOT-FIRED';
  try {
    await prisma.matchPlan.create({
      data: { tenantId: proj.tenantId, projectId: 'nonexistent-project-id', name: 'x', metrics: {}, rationale: 'x' },
    });
  } catch (e: any) {
    fkViolation = e?.code === 'P2003' ? 'P2003 (FK violation) ✓' : `unexpected: ${e?.code ?? e}`;
  }
  console.log('6d FK projectId:', fkViolation);

  // ── 清理（D-H）
  await prisma.matchCandidate.delete({ where: { id: cand.id } });
  console.log('\n== 7. D-H post-test counts ==', JSON.stringify(await counts()));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
