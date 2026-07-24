// ARCH-M05 F007 — 项目详情路由（D22：五环节页内 tab 非路由，不进侧栏）
// URL 态 ?env=（kimi §6.1）；旧深链 ?stage= 由 ProjectDetail 兼容重写为 ?env=。
//
// M1-B-BRIEF F001 — RSC 直读 Project（本页已是 server component，是验证 M1-A
// mock→真数据契约层能否平滑换的纵切点）：
//   · prisma 按 slug/id/publicId + tenant 过滤取 Project，找不到 → project=null
//     走 D2 优雅降级（名回退 projectId、其余「待补充」，不 404——f007/f010 探针
//     仍以旧 demo id 深链访问，环节面不依赖项目行）。
//   · RSC 内调 domain/health.ts 真算 health 作 prop 传入。actualExposure /
//     budgetSpent 全库无存处、阻塞表未建 → 填 null/0，按 D15 四项目恒落 cr。
//     这是数据可得性的诚实反映（D2 裁决：接受全红，不打补丁不 seed 假指标）。
import ProjectDetail, {
  type ProjectDetailData,
} from 'components/project/ProjectDetail';
import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { computeHealth, type HealthResult } from 'lib/domain/health';
import { parseProjectGoal } from 'lib/data/schemas/project';
import { formatBudget, formatGoalText } from 'lib/display/project-format';
import { loadMatchSurfaceData } from 'lib/match/surface-data';
import { loadReachSurfaceData } from 'lib/reach/surface-data';
import { loadDeliverySurfaceData } from 'lib/delivery/surface-data';
import type { Stage } from 'lib/agent/stage-routing';

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ env?: string; stage?: string }>;
}) {
  const { id } = await params;
  const { env, stage } = await searchParams;

  const tenantId = await getDevTenantId();
  const row = await prisma.project.findFirst({
    where: { tenantId, OR: [{ slug: id }, { id }, { publicId: id }] },
  });

  let project: ProjectDetailData | null = null;
  let health: HealthResult | null = null;
  if (row) {
    const goal = parseProjectGoal(row.goal);
    // M2-A F004：→reach 守卫判据（canEnter ctx；守卫纯函数，存在性由 RSC 查好传入）
    const approvedPlan = await prisma.matchPlan.findFirst({
      where: { projectId: row.id, status: 'approved' },
      select: { id: true },
    });
    // M2-A F005：match 面数据组装（含 P2 首访 lazy；失败静默降级空态，CI 安全）
    const match = await loadMatchSurfaceData(row.id, row.cur as Stage);
    // M3-A F008：reach 面数据组装（thread ∪ approved 组合成员；失败静默降级空表）
    const reach = await loadReachSurfaceData(row.id);
    // M3-B F009：delivery 台账组装（deliveryCheck 真值 + Payout released；失败降级空表）
    const delivery = await loadDeliverySurfaceData(row.id);
    // 缺失因子填 null（分子无存处，D15 该因子记 0 分）；now 在 RSC 边界注入，
    // 纯度约束只在 domain 函数（computeHealth 自身不读时钟）。
    health = computeHealth({
      targetExposure: goal?.targetExposure ?? null,
      actualExposure: null, // M2/M3 才有指标存处（D2）
      budgetTotal: row.budgetTotal == null ? null : Number(row.budgetTotal),
      budgetSpent: null, // 同上
      periodStart: goal ? new Date(goal.periodStart) : null,
      periodEnd: goal ? new Date(goal.periodEnd) : null,
      now: new Date(),
      blockerCount: 0, // 阻塞表未建（M1-A health.ts:67 约定：无阻塞源传 0）
    });
    project = {
      name: row.name,
      goalText: formatGoalText(goal), // D9 结构化字段合成，不再用整句 mock
      budgetText: formatBudget(
        row.budgetTotal == null ? null : Number(row.budgetTotal),
        row.currency,
      ),
      owner: row.owner,
      cur: row.cur,
      maxReached: row.maxReached, // D5：F004 前端守卫的数据源，从 DB 直读
      goal, // F004 canEnter ctx（→match 判据）所需
      hasApprovedMatchPlan: approvedPlan != null, // M2-A F004 →reach 判据
      match, // M2-A F005：match 语法面真数据（可序列化视图）
      reach, // M3-A F008：reach 语法面真数据（可序列化视图）
      delivery, // M3-B F009：delivery 台账真数据（可序列化视图）
    };
  }

  return (
    <ProjectDetail
      projectId={id}
      project={project}
      health={health}
      initialEnv={env}
      legacyStage={stage}
    />
  );
}
