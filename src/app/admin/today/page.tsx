// ARCH-M05 F006 — 今天页真页（V1 全 37 元素；原型 viewToday L714-735 为浏览器级参照）。
//
// 四段硬要求落点：
// §2.1 原型：KPI ×4 / 需要你确认雷达 / Agent 编队 / Agent 活动 feed / chartcard / 团队负荷。
// §2.2 必用件：MiniStatistics（模板件首次消费，delta 有/无两态）· AgentSquad grid（首次接线）·
//      LineAreaChart（模板件，12 点 + 末点圆标）· Progress（团队负荷 track）· SurfaceCard / Button。
// §2.3 不得简化：🔒 sec-head meta IA 契约句 ×2、🔒🚪 irrev 红标（ask.outbound 条件渲染）、
//      🔒 feed sub 主动式宣示、🔒 团队负荷免责 eyebrow（裁决 #8，逐字）。
// §2.4 视觉基线由 F017 统一重生（D10 期间口径）。
//
// D2 契约：ask 深字段经 lib/data/provenance readContractSlot 读取，null = 不进雷达（绝不抛错/填 0）。
// D7 URL 即状态：「进入项目」直落 /admin/campaigns/{id}?env={env}（新约定 ?env=，F007 同批迁移路由层）。
'use client';

import { useRouter } from 'next/navigation';
import {
  MdAccessTime,
  MdAutoAwesome,
  MdCheck,
  MdChevronRight,
  MdMailOutline,
  MdNotificationsNone,
  MdOutlineEdit,
  MdOutlineFolder,
  MdShield,
  MdTrendingUp,
  MdWarningAmber,
} from 'react-icons/md';
import MiniStatistics from 'components/card/MiniStatistics';
import LineAreaChart from 'components/charts/LineAreaChart';
import Progress from 'components/progress';
import AgentSquad, { AGENT_ICONS } from 'components/common/AgentSquad';
import Button from 'components/common/Button';
import SurfaceCard from 'components/common/SurfaceCard';
import { AVATAR_WHEEL, BRAND_500, WHITE } from 'lib/design-tokens';
import { STAGE_AGENT } from 'lib/agent/stage-routing';
import { readContractSlot } from 'lib/data/provenance';
import type { HealthBand } from 'lib/domain/health';
import { HEALTH_LABEL } from 'lib/display/health-label';
import {
  ENV_NAME,
  monthlyAutoDone,
  radarAskSchema,
  teamLoads,
  todayFeed,
  todayKpis,
  todayProjects,
  type RadarAsk,
  type TodayFeedIcon,
  type TodayKpiIcon,
  type TodayProject,
} from 'lib/data/mock/today';

/* ------------------------------------------------------------------ *
 * 图标映射（原型 ic 名 → react-icons；环节图标复用 AGENT_ICONS 不复制）
 * ------------------------------------------------------------------ */
const KPI_ICONS: Record<
  TodayKpiIcon,
  React.ComponentType<{ size?: number }>
> = {
  bell: MdNotificationsNone,
  spark: MdAutoAwesome,
  folder: MdOutlineFolder,
  trend: MdTrendingUp,
};

const FEED_ICONS: Record<
  TodayFeedIcon,
  React.ComponentType<{ size?: number }>
> = {
  check: MdCheck,
  pen: MdOutlineEdit,
  trend: MdTrendingUp,
  mail: MdMailOutline,
  shield: MdShield,
  spark: MdAutoAwesome,
};

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

const PILL_TONE: Record<PillTone, string> = {
  nu: 'bg-lightPrimary text-gray-600 dark:bg-white/5 dark:text-gray-400',
  gd: 'bg-green-50 text-green-600 dark:bg-green-400/10 dark:text-green-400',
  wn: 'bg-orange-50 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400',
  cr: 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-400',
};

// M1-B F005 收敛：HEALTH_LABEL 单点在 lib/display/health-label.ts（D6），本页副本已删。

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
 * RadarCard — 「需要你确认」待办卡（原型 .rcard，SurfaceCard 承载）
 * ------------------------------------------------------------------ */
function RadarCard({
  project,
  index,
  ask,
}: {
  project: TodayProject;
  index: number;
  ask: RadarAsk;
}) {
  const router = useRouter();
  const envName = ENV_NAME[ask.env];
  const EnvIcon = AGENT_ICONS[STAGE_AGENT[ask.env]];
  // D7：?env= 新约定直落（F007 同批迁移路由层，含 ?stage= 兼容重写）
  const href = `/admin/campaigns/${project.id}?env=${ask.env}`;
  return (
    <SurfaceCard className="flex flex-col gap-3.5 p-[22px]">
      {/* rc-top：avatar 42（游戏名首二字+色轮）+ 项目全名 + 三 pill */}
      <div className="flex items-center gap-2.5">
        <WheelAvatar text={project.game} index={index} size={42} />
        <div className="min-w-0">
          <b className="text-sm font-bold text-navy-700 dark:text-white">
            {project.name}
          </b>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Pill>{project.market}</Pill>
            <Pill>{project.budget}</Pill>
            <Pill tone={project.health}>{HEALTH_LABEL[project.health]}</Pill>
          </div>
        </div>
      </div>
      {/* rc-ask：环节 lbl + 待办标题 + amt（🔒🚪 irrev 红标仅 ask.outbound 条件渲染） */}
      <div className="rounded-2xl bg-lightPrimary p-[15px] dark:bg-white/5">
        <div className="mb-2 flex items-center gap-1.5 text-micro font-bold text-brand-500 dark:text-brand-400">
          <EnvIcon size={14} />
          {envName} · 需要你
        </div>
        <b className="block text-sm font-bold text-navy-700 dark:text-white">
          {ask.title}
        </b>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          {ask.amt}
          {ask.outbound && (
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
      {/* rc-foot：clock 停在「环节」 + 「进入项目」直落 ?env= */}
      <div className="mt-auto flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
          <MdAccessTime size={14} />
          停在「{envName}」
        </span>
        <span className="flex-1" />
        <Button
          variant="solid"
          size="sm"
          rightIcon={<MdChevronRight size={16} />}
          data-enter={project.id}
          data-goenv={ask.env}
          onClick={() => router.push(href)}
        >
          进入项目
        </Button>
      </div>
    </SurfaceCard>
  );
}

/* ------------------------------------------------------------------ *
 * chartcard options — 模板 lineChartOptionsTotalSpent 改造（12 点 + 末点圆标）
 * ------------------------------------------------------------------ */
const BRAND = BRAND_500;

const AUTO_DONE_CHART_OPTIONS = {
  chart: {
    toolbar: { show: false },
    dropShadow: {
      enabled: true,
      top: 13,
      left: 0,
      blur: 10,
      opacity: 0.1,
      color: BRAND,
    },
  },
  colors: [BRAND],
  markers: {
    size: 0,
    strokeColors: BRAND,
    strokeWidth: 3,
    colors: [WHITE],
    // 原型 areaChart 末点圆标（r4.5 白底描边，L513）
    discrete: [
      {
        seriesIndex: 0,
        dataPointIndex: monthlyAutoDone.series.length - 1,
        fillColor: WHITE,
        strokeColor: BRAND,
        size: 5,
        shape: 'circle',
      },
    ],
  },
  tooltip: { theme: 'dark' },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 3.5, lineCap: 'round' },
  fill: {
    type: 'gradient',
    gradient: {
      type: 'vertical',
      shadeIntensity: 1,
      opacityFrom: 0.28,
      opacityTo: 0,
      stops: [0, 100],
    },
  },
  xaxis: {
    type: 'numeric',
    labels: { show: false },
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false },
  },
  yaxis: { show: false },
  legend: { show: false },
  grid: {
    show: false,
    padding: { left: 6, right: 10, top: 6, bottom: 6 },
  },
};

/* ------------------------------------------------------------------ *
 * 页面（原型 viewToday：无页内标题——「今天」26px 标题在 navbar S2-3）
 * ------------------------------------------------------------------ */
export default function TodayPage() {
  // D2：ask 深字段经契约层读取；null（含脏数据降级）= 今天无待办，不进雷达
  //（原型 need=PROJECTS.filter(p=>p.ask) 同语义，绝不抛错）。
  const radar = todayProjects.flatMap((project, index) => {
    const ask = readContractSlot(
      radarAskSchema,
      project.ask,
      `today.projects.${project.id}.ask`,
    );
    return ask ? [{ project, index, ask }] : [];
  });

  return (
    <div className="mt-3">
      {/* V1 KPI ×4 — MiniStatistics 模板件首次消费（delta 有/无两态不得统一） */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {todayKpis.map((k) => {
          const Icon = KPI_ICONS[k.icon];
          return (
            <MiniStatistics
              key={k.name}
              name={k.name}
              value={k.value}
              delta={k.delta ?? undefined}
              icon={<Icon />}
              iconBg="bg-lightPrimary"
            />
          );
        })}
      </div>

      {/* V1 需要你确认（sec-head + 🔒 meta IA 契约句 + 雷达卡） */}
      <section className="mt-6">
        <SecHead
          title="需要你确认"
          meta={`${radar.length} 个项目在等你 · 点进去从当前环节继续`}
        />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {radar.map((r) => (
            <RadarCard key={r.project.id} {...r} />
          ))}
        </div>
      </section>

      {/* V1 Agent 编队（AgentSquad grid variant 首次接线 + 🔒 meta） */}
      <section className="mt-6">
        <SecHead
          title="Agent 编队"
          meta="5 位环节专家 + 1 位合规 · 各司其职，需要时协同"
        />
        <AgentSquad variant="grid" />
      </section>

      <section className="mt-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* V1 Agent 活动 card-head + 🔒 sub 主动式宣示 + feed ×6 */}
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
            {todayFeed.map((f) => {
              const Icon = FEED_ICONS[f.icon];
              return (
                <div
                  key={f.title}
                  className="flex items-center gap-3.5 border-b border-gray-100 py-3 last:border-b-0 dark:border-white/10"
                >
                  <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-lightPrimary text-brand-500 dark:bg-navy-900 dark:text-brand-400">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block text-compact font-bold text-navy-700 dark:text-white">
                      {f.title}
                    </b>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {f.sub}
                    </span>
                  </div>
                  <time className="whitespace-nowrap text-micro text-gray-400">
                    {f.time}
                  </time>
                </div>
              );
            })}
          </div>
        </SurfaceCard>

        <div className="flex flex-col gap-5">
          {/* V1 chartcard：sub / big 312 / 绿 badge +18% / LineAreaChart 12 点末点圆标 */}
          <SurfaceCard className="p-[22px]">
            <div className="mb-1.5 flex items-end justify-between">
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  {monthlyAutoDone.label}
                </div>
                <div className="mt-0.5 text-3xl font-extrabold text-navy-700 dark:text-white">
                  {monthlyAutoDone.value}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-xl bg-green-50 px-2.5 py-1.5 text-compact font-bold text-green-500 dark:bg-green-400/10 dark:text-green-400">
                <MdTrendingUp size={14} />
                {monthlyAutoDone.delta}
              </span>
            </div>
            <div className="h-[110px] w-full">
              <LineAreaChart
                chartData={[
                  {
                    name: monthlyAutoDone.label,
                    data: [...monthlyAutoDone.series],
                  },
                ]}
                chartOptions={AUTO_DONE_CHART_OPTIONS}
              />
            </div>
          </SurfaceCard>

          {/* 🔒 V1 团队负荷（裁决 #8：免责 eyebrow 逐字必须；Progress track ×3） */}
          <SurfaceCard className="p-5">
            <div className="mb-3.5 text-micro font-bold uppercase tracking-wide text-gray-400">
              团队负荷 · 单一角色，仅用于分工
            </div>
            {teamLoads.map((l, i) => (
              <div
                key={l.name}
                className="mb-4 grid grid-cols-[34px_1fr_42px] items-center gap-3 last:mb-0"
              >
                <WheelAvatar text={l.name} index={i} size={34} />
                <Progress value={l.percent} />
                <span className="text-right text-xs font-bold text-gray-600 dark:text-gray-400">
                  {l.percent}%
                </span>
              </div>
            ))}
          </SurfaceCard>
        </div>
      </section>
    </div>
  );
}
