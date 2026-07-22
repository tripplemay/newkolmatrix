// ARCH-M05 F007 — 项目列表（V2 全 10 元素，原型 viewCampaigns L738-744）
//
// 标题 + 🔒 lede IA 契约句（「…这一层只做进入」）+ 卡 ×4（avatar 色轮 / 全名 /
// market·budget·health 三 pill）+ goal 句 + rc-foot「停在「{环节}」」+「进入」钮。
// 卡片只做「进入」——真正的触达/谈判/审核/放款都在项目内部；「进入」直落项目
// 当前推进环节（stageHref 产出 ?env=，原型 data-goenv=p.cur 语义）。
//
// M1-C F001 — RSC 直读 Project（去 'use client'）：数据源从 mockProjects 换
// prisma findMany；「进入」由 router.push 改 Link（client 泄漏归零，f008 §4 的
// anchor 断言随之复活）。health 真算（null 因子 → D15 四项目恒 cr，D2 纪律：
// 全红是数据可得性的诚实反映，非缺陷）。orderBy createdAt asc = seed 固定顺序
// xg/lc/aw/mf，与原 mock 卡序一致（Planner 修订，零重排零 avatar 色轮错位）。

import Link from 'next/link';
import { MdChevronRight } from 'react-icons/md';

// 本页无 dynamic API（不读 params/searchParams/cookies），Next 默认会在构建期
// 静态预渲染——prisma 查询在 build 时执行、数据冻结进 HTML，运行时不再读库
//（CI Build job 无 DB 时更是直接 prerender error 红灯）。RSC 直读 DB 的页面
// 必须显式声明动态渲染，每次请求真实查库。
export const dynamic = 'force-dynamic';
import Card from 'components/card';
import Button from 'components/common/Button';
import PageHeader from 'components/common/PageHeader';
import ProjectAvatar from 'components/project/ProjectAvatar';
import { ENV_META } from 'components/project/env-meta';
import { stageHref } from 'lib/agent/stage-routing';
import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { computeHealth, type HealthBand } from 'lib/domain/health';
import { parseProjectGoal } from 'lib/data/schemas/project';
import { formatBudget, formatGoalText } from 'lib/display/project-format';
import { HEALTH_LABEL } from 'lib/display/health-label';
// M1-C F005（D-F/S4）：PILL_TONE 收敛到展示层单点（canonical=today 版全 dark 变体；
// 本页浅色渲染零漂移，深色略变属登记项）。
import { PILL_TONE } from 'lib/display/health-tone';
import { PENDING_TEXT } from 'lib/data/provenance';

function Pill({
  tone,
  children,
}: {
  tone: 'nu' | HealthBand;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-micro font-bold ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export default async function CampaignsPage() {
  const tenantId = await getDevTenantId();
  const rows = await prisma.project.findMany({
    where: { tenantId },
    include: { game: true },
    orderBy: { createdAt: 'asc' },
  });
  const now = new Date();

  // 与 [id]/page.tsx:42-51 逐字段一致的 HealthInput 组装（D2/D15：分子无存处填
  // null → 该因子记 0 分，四项目恒 cr）。M2/M3 指标表落地后两处同步换真实分子。
  const projects = rows.map((row) => {
    const goal = parseProjectGoal(row.goal);
    const health = computeHealth({
      targetExposure: goal?.targetExposure ?? null,
      actualExposure: null,
      budgetTotal: row.budgetTotal == null ? null : Number(row.budgetTotal),
      budgetSpent: null,
      periodStart: goal ? new Date(goal.periodStart) : null,
      periodEnd: goal ? new Date(goal.periodEnd) : null,
      now,
      blockerCount: 0,
    });
    return {
      /** 深链用标识（seed 的 slug 与原 mock id 一致；无 slug 回退 id） */
      linkId: row.slug ?? row.id,
      name: row.name,
      game: row.game?.name ?? row.name,
      market: row.market,
      budgetText: formatBudget(
        row.budgetTotal == null ? null : Number(row.budgetTotal),
        row.currency,
      ),
      goalText: formatGoalText(goal),
      health: health.band,
      cur: row.cur,
    };
  });

  return (
    <div className="mt-3">
      {/* V2-1 标题 + V2-2 🔒 lede IA 契约句（文案逐字原型 L739） */}
      <PageHeader
        className="mb-5"
        title="项目"
        subtitle="选择一个项目进入完整上下文。真正的触达、谈判、审核与放款都在项目内部——这一层只做进入。"
      />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {projects.map((p, pi) => {
          const env = ENV_META[p.cur];
          const EnvIcon = env.icon;
          return (
            // V2-3 卡 ×4（原型 .rcard：avatar / 全名 / 三 pill / goal / rc-foot / 进入）
            <Card key={p.linkId} extra="!p-[22px] flex flex-col gap-3.5">
              <div className="flex items-center gap-2.5">
                {/* V2-3a avatar 色轮（游戏名首二字 + 6 色轮） */}
                <ProjectAvatar label={p.game} index={pi} size={42} />
                <div className="min-w-0">
                  {/* V2-4 项目全名 */}
                  <b className="block text-[15px] font-bold text-navy-700 dark:text-white">
                    {p.name}
                  </b>
                  {/* V2-5/6/7 market pill + budget pill + health pill 三态 */}
                  <div className="mt-[5px] flex flex-wrap gap-1.5">
                    <Pill tone="nu">{p.market ?? PENDING_TEXT.fill}</Pill>
                    <Pill tone="nu">{p.budgetText ?? PENDING_TEXT.fill}</Pill>
                    <Pill tone={p.health}>{HEALTH_LABEL[p.health]}</Pill>
                  </div>
                </div>
              </div>
              {/* V2-8 goal 句（D9 结构化字段合成串） */}
              <p className="text-compact text-gray-600 dark:text-gray-400">
                {p.goalText ?? PENDING_TEXT.fill}
              </p>
              {/* V2-9 rc-foot「停在「{环节}」」 + V2-10「进入」钮（Link 化，真实 anchor） */}
              <div className="mt-auto flex items-center gap-2.5">
                <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <EnvIcon size={14} />
                  停在「{env.name}」
                </span>
                <span className="flex-1" />
                <Link href={stageHref(p.linkId, p.cur)}>
                  <Button
                    size="sm"
                    variant="solid"
                    rightIcon={<MdChevronRight size={16} />}
                  >
                    进入
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
