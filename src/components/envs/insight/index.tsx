'use client';
// ARCH-M05 F012 — Insight 环节「对照账本 reconcile」语法面（ui-inventory V8 全 19 元素，原型 L806-817）。
// 五套环节语法互不相同（D8/FR-7.10）：本环节 = 对账原目标——差异表 + 证据缺口 + 图 + 复盘草案。
// 挂载契约：default export + { projectId }（ProjectDetail ENV_SURFACE 静态映射，F007）。
// 结构：.recon 双列（对照表 DataTable 4 列「三值三样式」+ 证据缺口卡 🔒 gaprow ×3）
// → grid-2（渠道 chartcard BarChart 5 柱 + 受众构成 donut 150 🔒 中心叠加读数 + legend 4 行）
// → retro 卡（渐变淡紫 dlbl+正文）+「采纳结论」internal（无弹窗 → Toast）
// + 🚪「生成对外分享报告」红 gate（GateConfirm，scope=project，裁决 #3 与跨项目洞察页区分）。
// mock 走 F004 契约层（readContractSlot，D2：null → 占位，绝不抛错/填 0）。

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import {
  MdOutlineAutoAwesome,
  MdOutlineShield,
  MdOutlineTrendingUp,
  MdWarningAmber,
} from 'react-icons/md';
import BarChart from 'components/charts/BarChart';
import PieChart from 'components/charts/PieChart';
import Button from 'components/common/Button';
import DataTable, {
  type DataTableColumnMeta,
} from 'components/common/DataTable';
import GateConfirm from 'components/common/GateConfirm';
import SurfaceCard from 'components/common/SurfaceCard';
import { useToast } from 'components/common/Toast';
import { PENDING_TEXT, readContractSlot } from 'lib/data/provenance';
import {
  audienceSchema,
  channelChartSchema,
  envShareGateSchema,
  gapListSchema,
  mockAudience,
  mockChannelChart,
  mockEnvShareGate,
  mockGaps,
  mockReconRows,
  mockRetro,
  reconListSchema,
  retroSchema,
  type AudienceSegment,
  type AudienceTone,
  type ChannelBar,
  type ReconRow,
} from 'lib/data/mock/env-insight';

/* ------------------------------------------------------------------ *
 * 契约层读取（D2：任一 slot 坏/缺 → null → 该 section 占位，不打死页面）
 * ------------------------------------------------------------------ */

const RECON = readContractSlot(reconListSchema, mockReconRows, 'envInsight.recon');
const GAPS = readContractSlot(gapListSchema, mockGaps, 'envInsight.gaps');
const CHANNEL_CHART = readContractSlot(channelChartSchema, mockChannelChart, 'envInsight.channelChart');
const AUDIENCE = readContractSlot(audienceSchema, mockAudience, 'envInsight.audience');
const RETRO = readContractSlot(retroSchema, mockRetro, 'envInsight.retro');
const SHARE_GATE = readContractSlot(envShareGateSchema, mockEnvShareGate, 'envInsight.shareGate');

/* ------------------------------------------------------------------ *
 * 对照表 4 列（V8 #1-#4）：指标 / 原目标灰 / 实际 navy-700 fw700 / 差异 fw800
 * 绿 up 红 down——「三值三样式」不得统一（原型 L808-810）
 * ------------------------------------------------------------------ */

const rightAlign = { align: 'right' } satisfies DataTableColumnMeta;
const reconColumn = createColumnHelper<ReconRow>();

const RECON_COLUMNS = [
  reconColumn.accessor('metric', { header: '指标' }),
  // 原目标：灰 muted（原型 td.num 默认灰阶）
  reconColumn.accessor('target', {
    header: '原目标',
    meta: rightAlign,
    cell: (info) => (
      <span className="tabular-nums text-gray-600">{info.getValue()}</span>
    ),
  }),
  // 实际：navy-700 · fw700（原型 font-weight:700 color:var(--head)）
  reconColumn.accessor('actual', {
    header: '实际',
    meta: rightAlign,
    cell: (info) => (
      <b className="font-bold text-navy-700 tabular-nums dark:text-white">
        {info.getValue()}
      </b>
    ),
  }),
  // 差异：fw800，up 绿 / down 红（原型 font-weight:800 green/red）
  reconColumn.accessor('delta', {
    header: '差异',
    meta: rightAlign,
    cell: (info) => (
      <span
        className={`font-extrabold tabular-nums ${
          info.row.original.up ? 'text-horizonGreen-500' : 'text-horizonRed-500'
        }`}
      >
        {info.getValue()}
      </span>
    ),
  }),
];

/* ------------------------------------------------------------------ *
 * 图表 options（Horizon ApexCharts 语言，对照原型 svg 形态；F015 同口径）
 * ------------------------------------------------------------------ */

/** 渠道 5 柱：rx10 + 底部标签；hi 柱 brand（原型垂直渐变 brand→40% 透明，
 * ApexCharts distributed 柱不支持逐柱渐变——以 --color-500 实色近似，spec V8 允许），
 * 其余 brand-50 淡紫 */
function channelBarOptions(bars: ChannelBar[]) {
  return {
    chart: { toolbar: { show: false } },
    colors: bars.map((b) => (b.hi ? 'var(--color-500)' : 'var(--color-50)')),
    plotOptions: {
      bar: { distributed: true, borderRadius: 10, columnWidth: '50%' },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: { theme: 'dark' },
    xaxis: {
      categories: bars.map((b) => b.label),
      labels: {
        style: { colors: '#A3AED0', fontSize: '11px', fontWeight: '500' },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { show: false },
    grid: { show: false },
  };
}

/** tone → 图色（原型 AUDIENCE 色轮就近映射 token：brand 走 CSS 变量随主题，
 * 其余为 tailwind.config horizonGreen/Orange/Blue-500 定值） */
const AUDIENCE_CHART_COLORS: Record<AudienceTone, string> = {
  brand: 'var(--color-500)',
  green: '#01B574', // horizonGreen-500
  orange: '#FFB547', // horizonOrange-500
  blue: '#3965FF', // horizonBlue-500
};

/** tone → legend sw 色块类（同一 token 源，图例与图色不漂移） */
const AUDIENCE_SWATCH_CLASSES: Record<AudienceTone, string> = {
  brand: 'bg-brand-500',
  green: 'bg-horizonGreen-500',
  orange: 'bg-horizonOrange-500',
  blue: 'bg-horizonBlue-500',
};

/** 受众构成 donut：150 盒 4 段。原型 donut()（stroke18 · r61 → 环外 70/内 52）
 * → 孔径 ≈74%；rotate(−90°) 使首段起于 12 点顺时针 = ApexCharts startAngle 0（等价）。
 * 圆角段头（stroke-linecap:round）ApexCharts 饼图不支持——直角段头近似
 * （同 BarChart hi 渐变近似口径，元素不减）。 */
function audienceDonutOptions(segments: AudienceSegment[]) {
  return {
    chart: { toolbar: { show: false } },
    colors: segments.map((s) => AUDIENCE_CHART_COLORS[s.tone]),
    labels: segments.map((s) => s.label),
    dataLabels: { enabled: false },
    legend: { show: false },
    stroke: { width: 0 },
    plotOptions: {
      pie: {
        startAngle: 0,
        endAngle: 360,
        expandOnClick: false,
        donut: { size: '74%' },
      },
    },
    tooltip: { theme: 'dark' },
  };
}

/* ------------------------------------------------------------------ *
 * 组件
 * ------------------------------------------------------------------ */

export default function InsightEnv({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [shareOpen, setShareOpen] = React.useState(false);

  // V8 #18 internal 动作（无弹窗）：文案逐字原型 [data-adopt] 处理器（L1002）
  const handleAdopt = () => {
    if (RETRO) toast(RETRO.adoptToast);
  };

  // 🚪 D6 stub：M0.5 只做触发与确认卡 UI——真实 create_share_link 工具
  // （scope='project'，服务端 pending→confirm 闸门链路）实装归 M4；
  // 此处 mock 流：确认即 Toast（逐字原型 onok L1003），不打 /api/gate。
  // scope=project 与跨项目洞察页（/admin/insight，scope=quarterly）区分——裁决 #3。
  const handleShareConfirm = () => {
    setShareOpen(false);
    if (SHARE_GATE) toast(SHARE_GATE.successToast);
  };

  return (
    <div>
      {/* V8 #1-#4 对照表 + #5-#6 证据缺口卡（原型 .recon 1.15fr/.85fr 双列） */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <DataTable
          data={RECON ?? []}
          columns={RECON_COLUMNS}
          emptyText={PENDING_TEXT.connect}
        />

        <SurfaceCard className="p-[22px]">
          {GAPS ? (
            <>
              {/* #5 eyebrow「证据缺口 3」（计数取数据行数，原型 GAPS.length） */}
              <div className="mb-3 text-micro font-bold uppercase tracking-[0.04em] text-gray-600">
                证据缺口 {GAPS.length}
              </div>
              {/* #6 🔒 gaprow ×3：琥珀 alert + 诚实归因边界三句（逐字，不得删） */}
              {GAPS.map((gap) => (
                <div
                  key={gap}
                  className="flex items-start gap-[11px] border-b border-gray-100 py-[13px] text-compact text-navy-700 last:border-b-0 last:pb-0 dark:border-white/10 dark:text-white"
                >
                  <MdWarningAmber
                    className="mt-[1px] h-3.5 w-3.5 shrink-0 text-horizonOrange-500"
                    aria-hidden
                  />
                  <span>{gap}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-gray-600">{PENDING_TEXT.connect}</p>
          )}
        </SurfaceCard>
      </div>

      {/* V8 #7-#10 渠道 chartcard + #11-#14 受众构成（原型 .grid-2.sec 1.6fr/1fr） */}
      <div className="mt-[26px] grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <SurfaceCard className="p-[22px]">
          {CHANNEL_CHART ? (
            <>
              <div className="mb-1.5 flex items-end justify-between">
                <div>
                  {/* #7 chart-sub + #8 chart-big */}
                  <div className="text-compact text-gray-700 dark:text-gray-400">
                    {CHANNEL_CHART.sub}
                  </div>
                  <div className="mt-0.5 text-3xl font-extrabold tracking-tight text-navy-700 tabular-nums dark:text-white">
                    {CHANNEL_CHART.big}
                  </div>
                </div>
                {/* #9 绿 badge「达标」（trend 图标） */}
                <span className="inline-flex items-center gap-[5px] rounded-xl bg-horizonGreen-50 px-[11px] py-1.5 text-compact font-bold text-horizonGreen-500 dark:bg-horizonGreen-500/10">
                  <MdOutlineTrendingUp className="h-4 w-4" aria-hidden />
                  {CHANNEL_CHART.badge}
                </span>
              </div>
              {/* #10 BarChart 5 柱（原型 barChart h:160 + 22 底标签带） */}
              <div className="h-[182px] w-full">
                <BarChart
                  chartData={[
                    {
                      name: '有效安装占比',
                      data: CHANNEL_CHART.bars.map((b) => b.value),
                    },
                  ]}
                  chartOptions={channelBarOptions(CHANNEL_CHART.bars)}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">{PENDING_TEXT.connect}</p>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-[22px]">
          {AUDIENCE ? (
            <>
              {/* #11 eyebrow「受众构成」 */}
              <div className="mb-3.5 text-micro font-bold uppercase tracking-[0.04em] text-gray-600">
                受众构成
              </div>
              <div className="flex items-center gap-[22px]">
                {/* #12 donut 150（PieChart type=donut）+ #13 🔒 中心叠加读数
                    「71% / 休闲玩家」（绝对定位覆盖层，不得删） */}
                <div className="relative h-[150px] w-[150px] shrink-0">
                  <PieChart
                    type="donut"
                    chartData={AUDIENCE.segments.map((s) => s.pct)}
                    chartOptions={audienceDonutOptions(AUDIENCE.segments)}
                  />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <div className="text-[22px] font-extrabold text-navy-700 tabular-nums dark:text-white">
                        {AUDIENCE.center.value}
                      </div>
                      <div className="text-micro text-gray-700 dark:text-gray-400">
                        {AUDIENCE.center.label}
                      </div>
                    </div>
                  </div>
                </div>
                {/* #14 legend 4 行（sw 色块 + 标签 + 右对齐 %） */}
                <div className="flex flex-1 flex-col gap-[11px]">
                  {AUDIENCE.segments.map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center gap-2.5 text-compact text-gray-700 dark:text-gray-400"
                    >
                      <span
                        className={`h-3 w-3 flex-none rounded ${AUDIENCE_SWATCH_CLASSES[s.tone]}`}
                        aria-hidden
                      />
                      {s.label}
                      <b className="ml-auto font-bold text-navy-700 tabular-nums dark:text-white">
                        {s.pct}%
                      </b>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">{PENDING_TEXT.connect}</p>
          )}
        </SurfaceCard>
      </div>

      {/* V8 #15-#17 retro 复盘草案卡（渐变淡紫 dlbl + 正文含归因限制）
          + #18「采纳结论」internal + #19 🚪「生成对外分享报告」红 gate */}
      {RETRO && (
        <div className="mt-5 rounded-[20px] bg-gradient-to-br from-[rgba(117,81,255,0.08)] to-[rgba(66,42,251,0.06)] p-6">
          <div className="mb-[11px] flex items-center gap-[7px] text-xs font-bold text-brand-500 dark:text-brand-400">
            <MdOutlineAutoAwesome className="h-4 w-4" aria-hidden />
            {RETRO.label}
          </div>
          <p className="text-compact leading-[1.65] text-navy-700 dark:text-white">
            {RETRO.body}
          </p>
          <div className="mt-[17px] flex flex-wrap gap-[11px]">
            <Button variant="solid" size="sm" onClick={handleAdopt}>
              采纳结论
            </Button>
            {SHARE_GATE && (
              <Button
                variant="danger"
                size="sm"
                leftIcon={<MdOutlineShield className="h-4 w-4" aria-hidden />}
                onClick={() => setShareOpen(true)}
              >
                生成对外分享报告
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 🚪 #19 确认卡（GateConfirm）：harm 2 行（数据范围=本项目汇总指标 · 不含联系方式 /
          有效期 14 天）+ irrev「对外 · 链接生成后数据可能被转发」——scope=project（裁决 #3） */}
      {SHARE_GATE && (
        <GateConfirm
          isOpen={shareOpen}
          onClose={() => setShareOpen(false)}
          onConfirm={handleShareConfirm}
          title={SHARE_GATE.title}
          harmRows={SHARE_GATE.harmRows}
          irrevText={SHARE_GATE.irrev}
          confirmText={SHARE_GATE.confirmText}
        >
          {SHARE_GATE.body}
        </GateConfirm>
      )}
    </div>
  );
}
