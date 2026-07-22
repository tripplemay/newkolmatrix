// ARCH-M05 F006 — 今天页真页（V1 全 37 元素；原型 viewToday L714-735 为浏览器级参照）。
//
// 四段硬要求落点：
// §2.1 原型：KPI ×4 / 需要你确认雷达 / Agent 编队 / Agent 活动 feed / chartcard / 团队负荷。
// §2.2 必用件：MiniStatistics（delta 有/无两态）· AgentSquad grid · SurfaceCard / Button。
// §2.3 不得简化：🔒 sec-head meta IA 契约句 ×2、🔒🚪 irrev 红标（条件渲染）、
//      🔒 feed sub 主动式宣示、🔒 团队负荷免责 eyebrow（裁决 #8，逐字）。
//
// M1-C F003 — RSC 重构 + 真数据纵切（D-A/D-D）：
// · 去 'use client'：数据在 RSC 直读（aggregatePending / Project / OperationLog），
//   client 叶子仅剩 AgentSquad island；「进入项目」Link 化（f008 §5 anchor 复活）。
// · 雷达 = PendingAction 真数据（F009 闸门是真实的 ask 之源）：有 projectId 联
//   Project 渲染完整卡，无则极简卡；空态渲染可见文案（§4.3 反静默空白）。
// · KPI/feed 有真源接真源（count / OperationLog）；本月有效触达、chartcard、
//   团队负荷无存处 →「待接入」占位，保留区块结构（设计稿保护规则不删区块）。
//   原 mock 的 chartcard 图表（LineAreaChart）随数据源一并降级，M4 指标落地后回接。
// · 侧栏徽标本批不接真（D-B）：today 徽标 mock 3 与雷达真值的不一致是登记过渡态。
// D7 URL 即状态：「进入项目」直落 /admin/campaigns/{id}?env={stage}。

import Link from 'next/link';
import {
  MdAccessTime,
  MdAutoAwesome,
  MdChevronRight,
  MdMailOutline,
  MdNotificationsNone,
  MdOutlineFolder,
  MdShield,
  MdTrendingUp,
  MdWarningAmber,
} from 'react-icons/md';
import MiniStatistics from 'components/card/MiniStatistics';
import AgentSquad from 'components/common/AgentSquad';
import { AGENT_ICONS } from 'components/common/agent-icons';
import Button from 'components/common/Button';
import SurfaceCard from 'components/common/SurfaceCard';
import { ENV_META } from 'components/project/env-meta';
import { AVATAR_WHEEL } from 'lib/design-tokens';
import { STAGE_AGENT, type Stage } from 'lib/agent/stage-routing';
import { prisma } from 'lib/db/prisma';
import { buildToolContext } from 'lib/agent/context';
import { aggregatePending, type PendingItem } from 'lib/agent/orchestrator';
import { harmSchema } from 'lib/agent/gate/harm';
import { computeHealth, type HealthBand } from 'lib/domain/health';
import { parseProjectGoal } from 'lib/data/schemas/project';
import { readContractSlot, PENDING_TEXT } from 'lib/data/provenance';
import { formatBudget } from 'lib/display/project-format';
import { formatRelativeTime } from 'lib/display/relative-time';
import { HEALTH_LABEL } from 'lib/display/health-label';
import { PILL_TONE } from 'lib/display/health-tone';
import { getPersona, isAgentId } from 'lib/agent/registry';

// RSC 直读 DB：无 dynamic API 的页面 Next 默认构建期静态化（数据冻结 + CI 无
// DB 硬红，F001 fix 同因），必须显式每请求查库。
export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ *
 * 图标映射（原型 ic 名 → react-icons）
 * ------------------------------------------------------------------ */
/** OperationLog kind → feed 图标（auto 例程 / gate 闸门 / block 拦截 / irrev 不可逆执行） */
const LOG_KIND_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  auto: MdAutoAwesome,
  gate: MdShield,
  block: MdWarningAmber,
  irrev: MdMailOutline,
};

/** agentId → 环节（STAGE_AGENT 反转；雷达深链用） */
const AGENT_STAGE: Record<string, Stage> = Object.fromEntries(
  Object.entries(STAGE_AGENT).map(([stage, agent]) => [agent, stage as Stage]),
);

/* ------------------------------------------------------------------ *
 * WheelAvatar — 6 色轮 + 首二字（原型 avatar helper L672 / AVC L559）
 * ------------------------------------------------------------------ */
function WheelAvatar({
  text,
  index,
  size,
}: {
  text: string;
  index: number;
  size: number;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        backgroundColor: AVATAR_WHEEL[index % AVATAR_WHEEL.length],
      }}
    >
      {text.slice(0, 2)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * SecHead — 区块头（原型 .sec-head：h3 18px + 右对齐 meta；meta 为 🔒 IA 契约句）
 * ------------------------------------------------------------------ */
function SecHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <h3 className="text-lg font-bold text-navy-700 dark:text-white">
        {title}
      </h3>
      <span className="ml-auto text-xs font-semibold text-gray-600 dark:text-gray-400">
        {meta}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pill — 原型 .pill 四色（nu 中性 / 健康度三态 gd·wn·cr，三态不得压缩）
 * ------------------------------------------------------------------ */
type PillTone = 'nu' | HealthBand;

// M1-C F005（D-F/S4）：PILL_TONE 收敛到 lib/display/health-tone.ts 单点
//（canonical 即本页原值，本页零漂移），本页副本已删。

function Pill({
  tone = 'nu',
  children,
}: {
  tone?: PillTone;
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

/* ------------------------------------------------------------------ *
 * 雷达数据组装（RSC 侧，全字段可序列化）
 * ------------------------------------------------------------------ */
interface RadarProject {
  linkId: string;
  name: string;
  game: string;
  market: string | null;
  budgetText: string | null;
  health: HealthBand;
  cur: Stage;
}

interface RadarItem {
  id: string;
  /** null = 创建时无项目上下文 → 极简卡 */
  project: RadarProject | null;
  /** 卡内环节标（agentId 反查；无则回退项目当前环节 / brief） */
  env: Stage;
  title: string;
  amt: string;
  irreversible: boolean;
}

function buildRadarItem(
  item: PendingItem,
  project: RadarProject | null,
): RadarItem {
  // harm 经契约层读取：脏数据降级 null 渲染占位，绝不抛错（D2）
  const harm = readContractSlot(
    harmSchema,
    item.harm,
    `today.pending.${item.id}.harm`,
  );
  const env: Stage =
    (item.agentId && AGENT_STAGE[item.agentId]) || project?.cur || 'brief';
  const amtParts: string[] = [];
  if (harm?.scope) amtParts.push(harm.scope);
  if (harm?.quantity != null) amtParts.push(`${harm.quantity} 个对象`);
  if (harm?.amount != null) {
    const money = formatBudget(harm.amount, harm.currency ?? null);
    if (money) amtParts.push(money);
  }
  return {
    id: item.id,
    project,
    env,
    title: harm?.summary ?? item.toolName,
    amt: amtParts.length ? amtParts.join(' · ') : `工具「${item.toolName}」`,
    irreversible: harm?.irreversible === true,
  };
}

/* ------------------------------------------------------------------ *
 * RadarCard — 「需要你确认」待办卡（原型 .rcard，SurfaceCard 承载；server component）
 * ------------------------------------------------------------------ */
function RadarCard({ item, index }: { item: RadarItem; index: number }) {
  const envName = ENV_META[item.env].name;
  const EnvIcon = AGENT_ICONS[STAGE_AGENT[item.env]];
  const href = item.project
    ? `/admin/campaigns/${item.project.linkId}?env=${item.env}`
    : null;
  return (
    <SurfaceCard className="flex flex-col gap-3.5 p-[22px]">
      {/* rc-top：avatar 42（游戏名首二字+色轮）+ 项目全名 + 三 pill（极简卡省略此段） */}
      {item.project && (
        <div className="flex items-center gap-2.5">
          <WheelAvatar text={item.project.game} index={index} size={42} />
          <div className="min-w-0">
            <b className="text-sm font-bold text-navy-700 dark:text-white">
              {item.project.name}
            </b>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Pill>{item.project.market ?? PENDING_TEXT.fill}</Pill>
              <Pill>{item.project.budgetText ?? PENDING_TEXT.fill}</Pill>
              <Pill tone={item.project.health}>
                {HEALTH_LABEL[item.project.health]}
              </Pill>
            </div>
          </div>
        </div>
      )}
      {/* rc-ask：环节 lbl + 待办标题 + amt（🔒🚪 irrev 红标 = harm.irreversible 条件渲染） */}
      <div className="rounded-2xl bg-lightPrimary p-[15px] dark:bg-white/5">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-bold text-brand-500 dark:text-brand-400">
          <EnvIcon size={14} />
          {envName} · 需要你
        </div>
        <b className="block text-sm font-bold text-navy-700 dark:text-white">
          {item.title}
        </b>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          {item.amt}
          {item.irreversible && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-micro font-bold text-red-500 dark:text-red-400">
                <MdWarningAmber size={13} />
                对外不可撤销
              </span>
            </>
          )}
        </div>
      </div>
      {/* rc-foot：clock 停在「环节」 + 「进入项目」Link 直落 ?env=（极简卡无深链） */}
      <div className="mt-auto flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <MdAccessTime size={14} />
          停在「{envName}」
        </span>
        <span className="flex-1" />
        {href && item.project && (
          <Link
            href={href}
            data-enter={item.project.linkId}
            data-goenv={item.env}
          >
            <Button
              variant="solid"
              size="sm"
              rightIcon={<MdChevronRight size={16} />}
            >
              进入项目
            </Button>
          </Link>
        )}
      </div>
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------------ *
 * 页面（原型 viewToday：无页内标题——「今天」26px 标题在 navbar S2-3）
 * ------------------------------------------------------------------ */
export default async function TodayPage() {
  const ctx = await buildToolContext();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  // 雷达 + KPI「待你确认」同一次查询派生（D-D 防两处各算）
  const pending = await aggregatePending(ctx);
  const projectIds = [
    ...new Set(pending.flatMap((p) => (p.projectId ? [p.projectId] : []))),
  ];
  const [projectRows, projectCount, autoToday, feedRows] = await Promise.all([
    projectIds.length
      ? prisma.project.findMany({
          where: { tenantId: ctx.tenantId, id: { in: projectIds } },
          include: { game: true },
        })
      : Promise.resolve([]),
    prisma.project.count({ where: { tenantId: ctx.tenantId } }),
    prisma.operationLog.count({
      where: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        createdAt: { gte: startOfToday },
      },
    }),
    prisma.operationLog.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        kind: true,
        summary: true,
        actor: true,
        createdAt: true,
      },
    }),
  ]);

  const projectMap = new Map<string, RadarProject>(
    projectRows.map((row) => {
      const goal = parseProjectGoal(row.goal);
      // 与 [id]/page.tsx 同一 HealthInput 组装口径（D2/D15：分子无存处 → 恒 cr）
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
      return [
        row.id,
        {
          linkId: row.slug ?? row.id,
          name: row.name,
          game: row.game?.name ?? row.name,
          market: row.market,
          budgetText: formatBudget(
            row.budgetTotal == null ? null : Number(row.budgetTotal),
            row.currency,
          ),
          health: health.band,
          cur: row.cur,
        },
      ];
    }),
  );

  const radar = pending.map((p) =>
    buildRadarItem(p, p.projectId ? projectMap.get(p.projectId) ?? null : null),
  );

  // KPI ×4：名称/图标/顺序与原型逐字一致；有真源接真源，无存处「待接入」，delta 无存处不渲染（D-D）
  const kpis = [
    {
      name: '待你确认',
      value: String(pending.length),
      icon: MdNotificationsNone,
    },
    { name: 'Agent 今日完成', value: String(autoToday), icon: MdAutoAwesome },
    { name: '进行中项目', value: String(projectCount), icon: MdOutlineFolder },
    { name: '本月有效触达', value: PENDING_TEXT.connect, icon: MdTrendingUp },
  ];

  return (
    <div className="mt-3">
      {/* V1 KPI ×4 — MiniStatistics（真值 / 待接入；delta 无存处不渲染） */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <MiniStatistics
              key={k.name}
              name={k.name}
              value={k.value}
              icon={<Icon />}
              iconBg="bg-lightPrimary"
            />
          );
        })}
      </div>

      {/* V1 需要你确认（sec-head + 🔒 meta IA 契约句 + 雷达卡 / 可见空态） */}
      <section className="mt-6">
        <SecHead
          title="需要你确认"
          meta={`${radar.length} 个待办在等你 · 点进去从当前环节继续`}
        />
        {radar.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {radar.map((item, i) => (
              <RadarCard key={item.id} item={item} index={i} />
            ))}
          </div>
        ) : (
          // D-A 空态：可见文案硬渲染（绝不 null——§4.3 反静默空白；基线与 waitFor 锚此）
          <SurfaceCard className="p-[22px]">
            <p className="text-compact text-gray-600 dark:text-gray-400">
              今天没有需要你确认的事——Agent
              推进中，对外动作会先停在这里等你拍板。
            </p>
          </SurfaceCard>
        )}
      </section>

      {/* V1 Agent 编队（AgentSquad grid variant + 🔒 meta；client island） */}
      <section className="mt-6">
        <SecHead
          title="Agent 编队"
          meta="5 位环节专家 + 1 位合规 · 各司其职，需要时协同"
        />
        <AgentSquad variant="grid" />
      </section>

      <section className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* V1 Agent 活动 card-head + 🔒 sub 主动式宣示 + feed（OperationLog 真数据 / 可见空态） */}
        <SurfaceCard>
          <div className="flex flex-wrap items-center gap-2.5 px-[22px] pt-5">
            <h4 className="text-base font-bold text-navy-700 dark:text-white">
              Agent 活动
            </h4>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              · 昨夜与今晨自动完成，无需你介入
            </span>
          </div>
          <div className="px-[22px] pb-4 pt-1">
            {feedRows.length > 0 ? (
              feedRows.map((f) => {
                const Icon = LOG_KIND_ICONS[f.kind] ?? MdAutoAwesome;
                const actorLabel =
                  f.actor && isAgentId(f.actor)
                    ? getPersona(f.actor).name
                    : f.actor ?? '系统';
                return (
                  <div
                    key={f.id}
                    className="flex items-center gap-3.5 border-b border-gray-100 py-3 last:border-b-0 dark:border-white/10"
                  >
                    <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-900 dark:text-brand-400">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="block text-compact font-bold text-navy-700 dark:text-white">
                        {f.summary ?? f.kind}
                      </b>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {actorLabel}
                      </span>
                    </div>
                    <time className="whitespace-nowrap text-micro text-gray-400">
                      {formatRelativeTime(f.createdAt, now)}
                    </time>
                  </div>
                );
              })
            ) : (
              <p className="py-3 text-compact text-gray-600 dark:text-gray-400">
                暂无 Agent 活动记录——例程与闸门动作会在这里留痕。
              </p>
            )}
          </div>
        </SurfaceCard>

        <div className="flex flex-col gap-5">
          {/* V1 chartcard：区块保留，指标无存处「待接入」（M4 MetricSnapshot 落地后回接图表） */}
          <SurfaceCard className="p-[22px]">
            <div className="mb-1.5 flex items-end justify-between">
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  本月自动完成
                </div>
                <div className="mt-0.5 text-3xl font-extrabold text-navy-700 dark:text-white">
                  {PENDING_TEXT.connect}
                </div>
              </div>
            </div>
            <div className="grid h-[110px] w-full place-items-center rounded-2xl bg-lightPrimary dark:bg-white/5">
              <span className="text-xs text-gray-400">
                趋势图待指标数据源接入
              </span>
            </div>
          </SurfaceCard>

          {/* 🔒 V1 团队负荷（裁决 #8：免责 eyebrow 逐字必须；负荷度量无存处「待接入」） */}
          <SurfaceCard className="p-5">
            <div className="mb-3.5 text-micro font-bold uppercase tracking-wide text-gray-400">
              团队负荷 · 单一角色，仅用于分工
            </div>
            <p className="text-compact text-gray-600 dark:text-gray-400">
              {PENDING_TEXT.connect} · 负荷度量尚无数据源。
            </p>
          </SurfaceCard>
        </div>
      </section>
    </div>
  );
}
