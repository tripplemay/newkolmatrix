'use client';
// ARCH-M05 F015 — 洞察页（跨项目 ROI 看板 + 周报，ui-inventory V12 全 14 元素，原型 L864-879）。
// 结构：标题 + 🔒 lede（对外分享需单独确认句）→ KPI ×4（MiniStatistics，花费无 delta 形态保留）
// → ROI 走势 chartcard（LineAreaChart 8 点）+ 各项目 ROI chartcard（🔒 badge 文字型 + BarChart 4 柱）
// → sec-head+meta + DataTable 5 列（数值右对齐 tabular-nums；🔒 ROI 绿/琥珀二色，非红）
// → retro 周报卡（渐变淡紫）+ 「采纳为周报」internal（Toast）
// + 🚪 「生成对外分享报告」红 gate（GateConfirm，scope=quarterly，裁决 #3）。
// mock 走 F004 契约层（readContractSlot，D2：null → 占位，绝不抛错/填 0）。

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import {
  MdCheck,
  MdOutlineAttachMoney,
  MdOutlineAutoAwesome,
  MdOutlineShield,
  MdOutlineTrendingUp,
} from 'react-icons/md';
import MiniStatistics from 'components/card/MiniStatistics';
import BarChart from 'components/charts/BarChart';
import LineAreaChart from 'components/charts/LineAreaChart';
import Button from 'components/common/Button';
import DataTable, {
  type DataTableColumnMeta,
} from 'components/common/DataTable';
import GateConfirm from 'components/common/GateConfirm';
import PageHeader from 'components/common/PageHeader';
import SurfaceCard from 'components/common/SurfaceCard';
import { useToast } from 'components/common/Toast';
import { GRAY_600, WHITE } from 'lib/design-tokens';
import { PENDING_TEXT, readContractSlot } from 'lib/data/provenance';
import {
  insightKpiListSchema,
  mockInsightKpis,
  mockPortfolio,
  mockProjectRoi,
  mockRoiTrend,
  mockShareGate,
  mockWeeklyDraft,
  portfolioListSchema,
  projectRoiSchema,
  roiTrendSchema,
  shareGateSchema,
  weeklyDraftSchema,
  type InsightKpi,
  type PortfolioRow,
  type ProjectRoiBar,
} from 'lib/data/mock/insight';

/* ------------------------------------------------------------------ *
 * 契约层读取（D2：任一 slot 坏/缺 → null → 该 section 占位，不打死页面）
 * ------------------------------------------------------------------ */

const KPIS = readContractSlot(insightKpiListSchema, mockInsightKpis, 'insight.kpis');
const ROI_TREND = readContractSlot(roiTrendSchema, mockRoiTrend, 'insight.roiTrend');
const PROJECT_ROI = readContractSlot(projectRoiSchema, mockProjectRoi, 'insight.projectRoi');
const PORTFOLIO = readContractSlot(portfolioListSchema, mockPortfolio, 'insight.portfolio');
const WEEKLY_DRAFT = readContractSlot(weeklyDraftSchema, mockWeeklyDraft, 'insight.weeklyDraft');
const SHARE_GATE = readContractSlot(shareGateSchema, mockShareGate, 'insight.shareGate');

/* ------------------------------------------------------------------ *
 * KPI 图标映射（原型 trend/money/spark/check → Md 线性图标，随 ic-circle 33px 字号）
 * ------------------------------------------------------------------ */

const KPI_ICONS: Record<InsightKpi['id'], React.ReactElement> = {
  reach: <MdOutlineTrendingUp aria-hidden />,
  spend: <MdOutlineAttachMoney aria-hidden />,
  roi: <MdOutlineAutoAwesome aria-hidden />,
  conversion: <MdCheck aria-hidden />,
};

/* ------------------------------------------------------------------ *
 * 图表 options（Horizon ApexCharts 语言，对照原型 svg 形态）
 * ------------------------------------------------------------------ */

/** ROI 走势：brand 平滑面积线（渐变 .28→0）+ 末点圆标（原型 areaChart） */
function roiAreaOptions(points: number[]) {
  return {
    chart: { toolbar: { show: false }, sparkline: { enabled: true } },
    colors: ['var(--color-500)'],
    stroke: { curve: 'smooth', width: 3.5, lineCap: 'round' },
    fill: {
      type: 'gradient',
      gradient: { type: 'vertical', opacityFrom: 0.28, opacityTo: 0 },
    },
    markers: {
      size: 0,
      strokeWidth: 3,
      discrete: [
        {
          seriesIndex: 0,
          dataPointIndex: points.length - 1,
          size: 4.5,
          fillColor: WHITE,
          strokeColor: 'var(--color-500)',
        },
      ],
      hover: { size: 5 },
    },
    dataLabels: { enabled: false },
    tooltip: { theme: 'dark' },
    xaxis: { categories: points.map((_, i) => `W${i + 1}`) },
    yaxis: { show: false },
    grid: { show: false },
  };
}

/** 各项目 ROI：4 柱 rx10 + 底标签；hi 柱 brand（原型垂直渐变以实色近似——
 * ApexCharts distributed 柱不支持逐柱渐变），其余 brand-50 淡紫 */
function projectRoiBarOptions(bars: ProjectRoiBar[]) {
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
        style: { colors: GRAY_600, fontSize: '11px', fontWeight: '500' },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { show: false },
    grid: { show: false },
  };
}

/* ------------------------------------------------------------------ *
 * DataTable 5 列（数值列 meta.align='right' + tabular-nums）
 * ------------------------------------------------------------------ */

/** 原型 6 色 avatar 轮（AVC）就近映射 token：#422afb/#01b574/#ffb547/#3965ff/#ee5d50/#7551ff */
const AVATAR_BG = [
  'bg-brand-500',
  'bg-horizonGreen-500',
  'bg-horizonOrange-500',
  'bg-horizonBlue-500',
  'bg-horizonRed-400',
  'bg-brand-400',
];

const rightAlign = { align: 'right' } satisfies DataTableColumnMeta;
const columnHelper = createColumnHelper<PortfolioRow>();

function numCell(value: string) {
  return <span className="tabular-nums">{value}</span>;
}

const PORTFOLIO_COLUMNS = [
  columnHelper.accessor('name', {
    header: '项目',
    cell: (info) => (
      <div className="flex items-center gap-[11px]">
        <span
          className={`grid h-9 w-9 flex-none place-items-center rounded-full text-xs font-bold text-white ${
            AVATAR_BG[info.row.index % AVATAR_BG.length]
          }`}
        >
          {info.getValue().slice(0, 2)}
        </span>
        <b className="font-bold text-navy-700 dark:text-white">
          {info.getValue()}
        </b>
      </div>
    ),
  }),
  columnHelper.accessor('spend', {
    header: '花费',
    meta: rightAlign,
    cell: (info) => numCell(info.getValue()),
  }),
  columnHelper.accessor('reach', {
    header: '触达',
    meta: rightAlign,
    cell: (info) => numCell(info.getValue()),
  }),
  columnHelper.accessor('conv', {
    header: '转化',
    meta: rightAlign,
    cell: (info) => numCell(info.getValue()),
  }),
  // 🔒 ROI 二色：达标绿 / 偏低琥珀（horizonOrange）——「偏低」不是「错误」，不得用红
  columnHelper.accessor('roi', {
    header: 'ROI',
    meta: rightAlign,
    cell: (info) => (
      <span
        className={`font-extrabold tabular-nums ${
          info.row.original.up
            ? 'text-horizonGreen-500'
            : 'text-horizonOrange-500'
        }`}
      >
        {info.getValue()}
      </span>
    ),
  }),
];

/* ------------------------------------------------------------------ *
 * 页面
 * ------------------------------------------------------------------ */

export default function InsightPage() {
  const toast = useToast();
  const [shareOpen, setShareOpen] = React.useState(false);

  // internal 动作（无闸门）：文案沿原型共用 [data-adopt] 处理器（L1002）逐字
  const handleAdopt = () => toast('复盘结论已采纳，加入下季度默认组合');

  // 🚪 D6 stub：M0.5 只做触发与确认卡 UI——真实 create_share_link 工具
  // （scope='quarterly'，服务端 pending→confirm 闸门链路）实装归 M4；
  // 此处 mock 流：确认即 Toast，不打 /api/gate。scope 区分见 mock/insight.ts 裁决 #3 注。
  const handleShareConfirm = () => {
    setShareOpen(false);
    if (SHARE_GATE) toast(SHARE_GATE.successToast);
  };

  return (
    <div className="mt-2">
      {/* V12 #1 标题 + #2 🔒 lede（IA 契约句：对外分享需单独确认，不得删） */}
      <PageHeader
        title="洞察"
        subtitle={
          <span className="block max-w-[76ch]">
            跨项目 ROI 与周报——把 4 个项目的结果拉平对比。对外分享报告需
            <b>单独确认</b>（对外动作，链接生成后数据可能被转发）。
          </span>
        }
      />

      {/* V12 #3 KPI ×4（花费无 delta 形态保留：delta null 即不渲染 small） */}
      {KPIS ? (
        <div className="mt-[22px] grid grid-cols-1 gap-5 sm:grid-cols-2 3xl:grid-cols-4">
          {KPIS.map((kpi) => (
            <MiniStatistics
              key={kpi.id}
              name={kpi.name}
              icon={KPI_ICONS[kpi.id]}
              iconBg="bg-lightPrimary"
              value={
                <span className="tabular-nums">
                  {kpi.value}
                  {kpi.delta !== null && (
                    <small className="ml-1.5 text-xs font-bold text-horizonGreen-500">
                      {kpi.delta}
                    </small>
                  )}
                </span>
              }
            />
          ))}
        </div>
      ) : (
        <SurfaceCard className="mt-[22px] p-6 text-sm text-gray-600">
          {PENDING_TEXT.connect}
        </SurfaceCard>
      )}

      {/* V12 #4/#5 双 chartcard（原型 grid-2 = 1.6fr:1fr） */}
      <div className="mt-[26px] grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        {/* #4 ROI 走势（LineAreaChart 8 点） */}
        <SurfaceCard className="p-[22px]">
          {ROI_TREND ? (
            <>
              <div className="mb-1.5 flex items-end justify-between">
                <div>
                  <div className="text-compact text-gray-700 dark:text-gray-400">
                    {ROI_TREND.sub}
                  </div>
                  <div className="mt-0.5 text-3xl font-extrabold tracking-tight text-navy-700 tabular-nums dark:text-white">
                    {ROI_TREND.big}
                  </div>
                </div>
                <span className="inline-flex items-center gap-[5px] rounded-xl bg-horizonGreen-50 px-[11px] py-1.5 text-compact font-bold text-horizonGreen-500 dark:bg-horizonGreen-500/10">
                  <MdOutlineTrendingUp className="h-4 w-4" aria-hidden />
                  {ROI_TREND.badge}
                </span>
              </div>
              <div className="h-[130px] w-full">
                <LineAreaChart
                  chartData={[{ name: '综合 ROI', data: ROI_TREND.points }]}
                  chartOptions={roiAreaOptions(ROI_TREND.points)}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">{PENDING_TEXT.connect}</p>
          )}
        </SurfaceCard>

        {/* #5 各项目 ROI（BarChart 4 柱）——🔒 badge 文字型「料理次元领先」，不得改数字型 */}
        <SurfaceCard className="p-[22px]">
          {PROJECT_ROI ? (
            <>
              <div className="mb-1.5 flex items-end justify-between">
                <div>
                  <div className="text-compact text-gray-700 dark:text-gray-400">
                    {PROJECT_ROI.sub}
                  </div>
                  <div className="mt-0.5 text-3xl font-extrabold tracking-tight text-navy-700 tabular-nums dark:text-white">
                    {PROJECT_ROI.big}
                  </div>
                </div>
                <span className="inline-flex items-center gap-[5px] rounded-xl bg-horizonGreen-50 px-[11px] py-1.5 text-compact font-bold text-horizonGreen-500 dark:bg-horizonGreen-500/10">
                  {PROJECT_ROI.badge}
                </span>
              </div>
              <div className="h-[192px] w-full">
                <BarChart
                  chartData={[
                    {
                      name: 'ROI',
                      data: PROJECT_ROI.bars.map((b) => b.value),
                    },
                  ]}
                  chartOptions={projectRoiBarOptions(PROJECT_ROI.bars)}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">{PENDING_TEXT.connect}</p>
          )}
        </SurfaceCard>
      </div>

      {/* V12 #6 sec-head + meta；#7 表 5 列；#8 数值右对齐 tabular-nums；#9 🔒 ROI 二色 */}
      <div className="mt-[26px]">
        <div className="mb-4 flex items-center gap-2.5">
          <h3 className="text-lg font-bold text-navy-700 dark:text-white">
            各项目 ROI
          </h3>
          {PORTFOLIO && (
            <span className="ml-auto text-compact font-semibold text-gray-700 dark:text-gray-400">
              {PORTFOLIO.length} 个在跑项目
            </span>
          )}
        </div>
        <DataTable
          data={PORTFOLIO ?? []}
          columns={PORTFOLIO_COLUMNS}
          emptyText={PENDING_TEXT.connect}
        />
      </div>

      {/* V12 #10-#13 retro 周报卡（渐变淡紫）+ 采纳（internal）+ 🚪 分享（gate） */}
      {WEEKLY_DRAFT && (
        <div className="mt-5 rounded-[20px] bg-gradient-to-br from-brandSoft-a to-brandSoft-b p-6">
          <div className="mb-[11px] flex items-center gap-[7px] text-xs font-bold text-brand-500 dark:text-brand-400">
            <MdOutlineAutoAwesome className="h-4 w-4" aria-hidden />
            {WEEKLY_DRAFT.label}
          </div>
          <p className="text-compact leading-[1.65] text-navy-700 dark:text-white">
            {WEEKLY_DRAFT.body}
          </p>
          <div className="mt-[17px] flex flex-wrap gap-[11px]">
            <Button variant="solid" size="sm" onClick={handleAdopt}>
              采纳为周报
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

      {/* 🚪 V12 #14 确认卡（GateConfirm）：harm 行/irrev/确认文案由 mock 传参（scope=quarterly） */}
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
