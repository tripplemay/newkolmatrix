// ARCH-M05 F008 — Brief 环节语法面「态势简报 glance」（V4 全 19 元素；
// 原型 docs/product/interaction-prototype-v2.html SURF.brief L757-769 为浏览器级参照）。
//
// 四段硬要求落点：
// §2.1 原型：.glance 双栏（1.15fr / 1fr，L170）——左卡 eyebrow + HalfGauge + mtile ×4 +
//      🔒 blocker；右列 chartcard 曝光趋势 + timeline「Agent 推进计划」。
// §2.2 必用件：common/HalfGauge（F005 新建件首次消费，230×130 + 中央 32px 读数 + 副读数）·
//      charts/LineAreaChart（模板件，12 点 + 末点圆标）· common/SurfaceCard。
// §2.3 不得简化：🔒 blocker 阻塞卡（琥珀 + alert + 说明句逐字；处置入口走 Copilot，
//      卡内不加处置按钮——裁决 #1）、🔒 tstep cur「需要你 · 在「触达谈判」」brand 加粗、
//      🔒 连接线 + 三态圆点（灰空心 / 绿实心 / 紫+4px 光晕，纯 CSS）。
// §2.4 视觉基线由 F017 统一重生（D10 期间口径）。
//
// D8/FR-7.10：仪表 glance 语法（看方向对不对）——五环节结构互不相同，不得退化成表。
// D2 契约：深字段经 lib/data/provenance.readContractSlot 读取；null → 「待接入」占位
//（blocker null = 无阻塞，不渲染阻塞卡）；绝不抛错 / 填 0。
'use client';

import type { ReactNode } from 'react';
import {
  MdAccessTime,
  MdAutoAwesome,
  MdCheck,
  MdTrendingUp,
  MdWarningAmber,
} from 'react-icons/md';
import type { IconType } from 'react-icons';
import HalfGauge from 'components/common/HalfGauge';
import SurfaceCard from 'components/common/SurfaceCard';
import LineAreaChart from 'components/charts/LineAreaChart';
import { PENDING_TEXT, readContractSlot } from 'lib/data/provenance';
import {
  briefBlockerSchema,
  briefGaugeSchema,
  briefMetricTilesSchema,
  briefTimelineSchema,
  briefTrendSchema,
  getEnvBrief,
  type BriefTimelineStep,
} from 'lib/data/mock/env-brief';

/* ------------------------------------------------------------------ *
 * chartcard options — 沿 F006 today chartcard 改造（模板 lineChartOptionsTotalSpent
 * 族：smooth 3.5 + 渐变面 + 末点圆标 r5 白底描边，对照原型 areaChart L505-513）。
 * 图表库需要具体色值（SVG 渲染管线不解析 Tailwind class）。
 * ------------------------------------------------------------------ */
const BRAND = '#422AFB';

function trendChartOptions(lastPointIndex: number) {
  return {
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
      colors: ['#FFFFFF'],
      // 原型 areaChart 末点圆标（r4.5 白底描边，L513）
      discrete: [
        {
          seriesIndex: 0,
          dataPointIndex: lastPointIndex,
          fillColor: '#FFFFFF',
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
}

/* ------------------------------------------------------------------ *
 * Eyebrow — 原型 .eyebrow（11px/700/uppercase/muted，L36；同 F006 团队负荷 eyebrow）
 * ------------------------------------------------------------------ */
function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`text-micro font-bold uppercase tracking-wide text-gray-400${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * PendingSlot — D2 占位（契约层 null → 待接入，绝不抛错 / 填 0）
 * ------------------------------------------------------------------ */
function PendingSlot({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-white/10">
      {label} · {PENDING_TEXT.connect}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * TimelineStep — 原型 .tstep（L179-185）：🔒 连接线 + 三态圆点，纯 CSS。
 * 圆点三态（不得压缩）：todo 灰空心 / done 绿实心 / cur 紫 + 4px brand-50 光晕。
 * ------------------------------------------------------------------ */
const WHO_ICONS: Record<BriefTimelineStep['state'], IconType> = {
  done: MdCheck,
  cur: MdAutoAwesome,
  todo: MdAccessTime,
};

const DOT_TONE: Record<BriefTimelineStep['state'], string> = {
  todo: 'border-gray-300 bg-white dark:border-white/20 dark:bg-navy-700',
  done: 'border-green-500 bg-green-500',
  cur: 'border-brand-500 bg-brand-500 ring-4 ring-brand-50 dark:ring-brand-400/20',
};

function TimelineStep({
  step,
  isLast,
}: {
  step: BriefTimelineStep;
  isLast: boolean;
}) {
  const WhoIcon = WHO_ICONS[step.state];
  return (
    <div className={`relative pl-[26px]${isLast ? '' : ' pb-[18px]'}`}>
      {/* 🔒 连接线（末步不画，原型 :last-child::before display:none） */}
      {!isLast && (
        <span
          aria-hidden
          className="absolute bottom-[-2px] left-[7px] top-[9px] w-0.5 bg-gray-200 dark:bg-white/10"
        />
      )}
      {/* 🔒 三态圆点（12px · border 2.5px） */}
      <span
        aria-hidden
        className={`absolute left-0.5 top-1 h-3 w-3 rounded-full border-[2.5px] ${
          DOT_TONE[step.state]
        }`}
      />
      <b className="text-sm font-bold text-navy-700 dark:text-white">
        {step.title}
      </b>
      <p className="mt-[3px] text-xs text-gray-600 dark:text-gray-400">
        {step.desc}
      </p>
      {/* who 行：🔒 cur 态 brand 加粗（「需要你 · 在「触达谈判」」逐字自 mock） */}
      <div
        className={`mt-[5px] flex items-center gap-[5px] text-[11.5px] ${
          step.state === 'cur'
            ? 'font-bold text-brand-500 dark:text-brand-400'
            : 'text-gray-400'
        }`}
      >
        <WhoIcon size={14} />
        {step.who}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * BriefEnv — 态势简报 glance（挂载契约：default export + { projectId }，F007）
 * ------------------------------------------------------------------ */
export default function BriefEnv({ projectId }: { projectId: string }) {
  const brief = getEnvBrief(projectId);
  // D2：五段深字段逐段经契约层读取；任一段 null（含脏数据降级）→ 该段占位，页面不塌。
  const gauge = readContractSlot(
    briefGaugeSchema,
    brief.gauge,
    `envBrief.${projectId}.gauge`,
  );
  const tiles = readContractSlot(
    briefMetricTilesSchema,
    brief.metrics,
    `envBrief.${projectId}.metrics`,
  );
  const blocker = readContractSlot(
    briefBlockerSchema,
    brief.blocker,
    `envBrief.${projectId}.blocker`,
  );
  const trend = readContractSlot(
    briefTrendSchema,
    brief.trend,
    `envBrief.${projectId}.trend`,
  );
  const timeline = readContractSlot(
    briefTimelineSchema,
    brief.timeline,
    `envBrief.${projectId}.timeline`,
  );

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.15fr_1fr]">
      {/* 左卡：V4-1 eyebrow + V4-2/3/4 HalfGauge + V4-5~8 mtile ×4 + 🔒 V4-9 blocker */}
      <SurfaceCard className="p-[22px]">
        <Eyebrow>目标健康度 · 有效曝光达成</Eyebrow>
        {gauge ? (
          <div className="flex flex-col items-center pb-1 pt-2.5">
            {/* HalfGauge：230×130 stroke18 圆头 + 中央 32px 读数 + 副读数（组件内建） */}
            <HalfGauge percent={gauge.percent} subValue={gauge.sub} />
          </div>
        ) : (
          <div className="pt-2.5">
            <PendingSlot label="曝光达成" />
          </div>
        )}
        {tiles ? (
          <div className="mt-[18px] grid grid-cols-2 gap-3.5">
            {tiles.map((t) => (
              <div
                key={t.name}
                className="rounded-[14px] bg-lightPrimary p-3.5 dark:bg-white/5"
              >
                <div className="text-[11.5px] font-semibold text-gray-600 dark:text-gray-400">
                  {t.name}
                </div>
                <div className="mt-1 text-[19px] font-extrabold tabular-nums text-navy-700 dark:text-white">
                  {t.value}
                </div>
                {/* mt-s 副行（V4 硬性：各 tile 必含） */}
                <div className="text-micro text-gray-400">{t.sub}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-[18px]">
            <PendingSlot label="项目指标" />
          </div>
        )}
        {/* 🔒 blocker 阻塞卡（琥珀 horizonOrange + alert + 说明句逐字；null = 无阻塞。
            处置入口走 Copilot prompt 路径——裁决 #1，卡内不加处置按钮。 */}
        {blocker && (
          <div className="mt-4 flex gap-3 rounded-2xl bg-horizonOrange-50 p-[15px] dark:bg-horizonOrange-400/10">
            <MdWarningAmber
              size={18}
              className="shrink-0 text-horizonOrange-500"
            />
            <div>
              <b className="block text-compact font-bold text-navy-700 dark:text-white">
                {blocker.title}
              </b>
              <p className="mt-[3px] text-xs text-gray-600 dark:text-gray-400">
                {blocker.text}
              </p>
            </div>
          </div>
        )}
      </SurfaceCard>

      {/* 右列：V4-10 chartcard 曝光趋势 + V4-11~19 timeline */}
      <div className="flex flex-col gap-5">
        <SurfaceCard className="p-[22px]">
          {trend ? (
            <>
              <div className="mb-1.5 flex items-end justify-between">
                <div>
                  <div className="text-[12.5px] text-gray-600 dark:text-gray-400">
                    {trend.sub}
                  </div>
                  <div className="mt-0.5 text-3xl font-extrabold tabular-nums text-navy-700 dark:text-white">
                    {trend.big}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-xl bg-green-50 px-2.5 py-1.5 text-compact font-bold text-green-500 dark:bg-green-400/10 dark:text-green-400">
                  <MdTrendingUp size={14} />
                  {trend.badge}
                </span>
              </div>
              {/* LineAreaChart 12 点 · h130（原型 areaChart {id:'brief',h:130}） */}
              <div className="h-[130px] w-full">
                <LineAreaChart
                  chartData={[{ name: trend.sub, data: [...trend.series] }]}
                  chartOptions={trendChartOptions(trend.series.length - 1)}
                />
              </div>
            </>
          ) : (
            <PendingSlot label="曝光趋势" />
          )}
        </SurfaceCard>

        {/* timeline「Agent 推进计划」（原型 .timeline padding 4px 22px 22px） */}
        <SurfaceCard className="px-[22px] pb-[22px] pt-1">
          <Eyebrow className="pb-3 pt-5">Agent 推进计划</Eyebrow>
          {timeline ? (
            timeline.map((step, i) => (
              <TimelineStep
                key={step.title}
                step={step}
                isLast={i === timeline.length - 1}
              />
            ))
          ) : (
            <div className="pb-2">
              <PendingSlot label="推进计划" />
            </div>
          )}
        </SurfaceCard>
      </div>
    </div>
  );
}
