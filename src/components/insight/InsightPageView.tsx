'use client';
// ARCH-M05 F015 → M4-INSIGHT F010 — 洞察页视图（跨项目 ROI 看板 + 周报，ui-inventory V12 全 14 元素，原型 L864-879）。
// 结构：标题 + 🔒 lede（对外分享需单独确认句）→ KPI ×4（MiniStatistics，🔒 花费无 delta 形态保留）
// → ROI 走势 chartcard（LineAreaChart 8 点）+ 各项目 ROI chartcard（🔒 badge 文字型 + BarChart）
// → sec-head+meta + DataTable 5 列（数值右对齐 tabular-nums；🔒 ROI 绿/琥珀二色非红——
//   真值才上色，证据不足显中性灰，不冒充判定）
// → retro 周报卡（渐变淡紫）+ 「采纳为周报」internal（Toast）
// + 🚪 「生成对外分享报告」红 gate（scope=quarterly，裁决 #3）。
//
// 数据源 = RSC 组装 `loadCrossInsightData`（lib/insight/cross-surface-data）：spend 真源聚合 +
// roi.compute 产物 + WeeklyReport(projectId=null) 真值。mock/insight.ts 已退役。
// ROI 走势/各项目 ROI 图本批 data 恒 null（M5 无历史源）→ 占位（结构与实现保留，不编数据）。
//
// 🚪 分享闸门真链（D6 stub 全数替换，与 V8 envs/insight 同款范式）：
//   POST /api/insight/share（scope=quarterly）→ GET /api/actions/[id] 真 harm →
//   confirm → execute → refresh。本批 mock ShareLinkService：零真实公开暴露。
// 「采纳为周报」internal（P5 无弹窗）：POST /api/insight/adopt → Toast → refresh。

import React from 'react';
import { useRouter } from 'next/navigation';
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
import { PENDING_TEXT } from 'lib/data/provenance';
import {
  CROSS_RETRO_EMPTY_TEXT,
  EMPTY_CROSS_INSIGHT,
  type CrossInsightData,
  type CrossInsightKpi,
  type CrossInsightPortfolioRow,
} from 'lib/display/insight-format';

/* ------------------------------------------------------------------ *
 * KPI 图标映射（原型 trend/money/spark/check → Md 线性图标）
 * ------------------------------------------------------------------ */

const KPI_ICONS: Record<CrossInsightKpi['id'], React.ReactElement> = {
  reach: <MdOutlineTrendingUp aria-hidden />,
  spend: <MdOutlineAttachMoney aria-hidden />,
  roi: <MdOutlineAutoAwesome aria-hidden />,
  conversion: <MdCheck aria-hidden />,
};

/* ------------------------------------------------------------------ *
 * 图表 options（本批 data 恒 null → 占位；实现保留，M5 数据到位即渲染，UI 零返工）
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

/** 各项目 ROI：柱 rx10 + 底标签；hi 柱 brand 实色近似，其余 brand-50 淡紫 */
function projectRoiBarOptions(bars: { label: string; hi: boolean }[]) {
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

/** 原型 6 色 avatar 轮（AVC）就近映射 token */
const AVATAR_BG = [
  'bg-brand-500',
  'bg-horizonGreen-500',
  'bg-horizonOrange-500',
  'bg-horizonBlue-500',
  'bg-horizonRed-400',
  'bg-brand-400',
];

const rightAlign = { align: 'right' } satisfies DataTableColumnMeta;
const columnHelper = createColumnHelper<CrossInsightPortfolioRow>();

function numCell(value: string) {
  return <span className="tabular-nums">{value}</span>;
}

/** 🔒 ROI 二色（good 绿 / low 琥珀非红）；roiTone null = 证据不足 → 中性灰（不冒充判定）。 */
function roiToneClass(tone: CrossInsightPortfolioRow['roiTone']): string {
  if (tone === 'good') return 'text-horizonGreen-500';
  if (tone === 'low') return 'text-horizonOrange-500';
  return 'text-gray-500 dark:text-gray-400';
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
  columnHelper.accessor('roi', {
    header: 'ROI',
    meta: rightAlign,
    cell: (info) => (
      <span
        className={`font-extrabold tabular-nums ${roiToneClass(
          info.row.original.roiTone,
        )}`}
      >
        {info.getValue()}
      </span>
    ),
  }),
];

/* ------------------------------------------------------------------ *
 * 🚪 分享闸门真链（envs/insight 同款范式）
 * ------------------------------------------------------------------ */

interface HarmView {
  summary?: string;
  targets?: string[];
  scope?: string;
  evidence?: string;
}

interface GateFlow {
  pendingActionId: string;
  harm: HarmView;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function InsightPageView({
  data = EMPTY_CROSS_INSIGHT,
}: {
  /** RSC 组装的真数据（M4 F010）；缺省空态（D2 降级，绝不抛错） */
  data?: CrossInsightData;
}) {
  const toast = useToast();
  const router = useRouter();
  const [gate, setGate] = React.useState<GateFlow | null>(null);
  const [busy, setBusy] = React.useState<'adopt' | 'start' | 'confirm' | null>(
    null,
  );

  // 「采纳为周报」internal（P5 无弹窗）：POST /api/insight/adopt → Toast
  const handleAdopt = React.useCallback(async () => {
    if (!data.retro) return;
    setBusy('adopt');
    try {
      const res = await fetch('/api/insight/adopt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reportId: data.retro.reportId }),
      });
      const out = await readJson(res);
      if (!res.ok) {
        toast(String(out.error ?? '采纳失败'));
        return;
      }
      toast('已采纳为本周周报');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [data.retro, router, toast]);

  /** 🚪 分享真链第一步：POST /api/insight/share（scope=quarterly）→ GET 详情 → 确认卡（真 harm） */
  const startShare = React.useCallback(async () => {
    setBusy('start');
    try {
      const res = await fetch('/api/insight/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'quarterly' }),
      });
      const out = await readJson(res);
      if (!res.ok) {
        toast(String(out.error ?? '分享发起失败'));
        return;
      }
      const detail = await fetch(`/api/actions/${String(out.pendingActionId)}`);
      const card = await readJson(detail);
      if (!detail.ok) {
        toast(String(card.error ?? '读取待确认动作失败'));
        return;
      }
      setGate({
        pendingActionId: String(out.pendingActionId),
        harm: (card.harm ?? {}) as HarmView,
      });
    } finally {
      setBusy(null);
    }
  }, [toast]);

  /** 🚪 两步票据：confirm 签票 → execute 消费票 */
  const confirmGate = React.useCallback(async () => {
    if (!gate) return;
    setBusy('confirm');
    try {
      const confRes = await fetch(
        `/api/actions/${gate.pendingActionId}/confirm`,
        { method: 'POST' },
      );
      const conf = await readJson(confRes);
      if (!confRes.ok) {
        toast(String(conf.error ?? '确认失败'));
        setGate(null);
        return;
      }
      const execRes = await fetch(
        `/api/actions/${gate.pendingActionId}/execute`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ticket: conf.ticket }),
        },
      );
      const exec = await readJson(execRes);
      if (!execRes.ok) {
        toast(String(exec.error ?? '执行失败'));
        setGate(null);
        return;
      }
      toast('分享链接已生成（mock 通道 · 未对外公开暴露）');
      setGate(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [gate, router, toast]);

  return (
    <div className="mt-2">
      {/* V12 #1 标题 + #2 🔒 lede（IA 契约句：对外分享需单独确认，不得删） */}
      <PageHeader
        title="洞察"
        subtitle={
          <span className="block max-w-[76ch]">
            跨项目 ROI 与周报——把{' '}
            {data.portfolio.length > 0 ? `${data.portfolio.length} 个` : ''}
            项目的结果拉平对比。对外分享报告需
            <b>单独确认</b>（对外动作，链接生成后数据可能被转发）。
          </span>
        }
      />

      {/* V12 #3 KPI ×4（🔒 花费无 delta 形态保留：delta null 即不渲染 small；
          触达/ROI/转化无源 → 证据不足，绝不填 0） */}
      {data.kpis.length > 0 ? (
        <div className="mt-[22px] grid grid-cols-1 gap-5 sm:grid-cols-2 3xl:grid-cols-4">
          {data.kpis.map((kpi) => (
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

      {/* V12 #4/#5 双 chartcard（原型 grid-2 = 1.6fr:1fr）。ROI 历史/真值源 M5——
          本批恒 null → 占位（结构保留不编数据） */}
      <div className="mt-[26px] grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        {/* #4 ROI 走势（LineAreaChart） */}
        <SurfaceCard className="p-[22px]">
          {data.roiTrend ? (
            <>
              <div className="mb-1.5 flex items-end justify-between">
                <div>
                  <div className="text-compact text-gray-700 dark:text-gray-400">
                    {data.roiTrend.sub}
                  </div>
                  <div className="mt-0.5 text-3xl font-extrabold tracking-tight text-navy-700 tabular-nums dark:text-white">
                    {data.roiTrend.big}
                  </div>
                </div>
                <span className="inline-flex items-center gap-[5px] rounded-xl bg-horizonGreen-50 px-[11px] py-1.5 text-compact font-bold text-horizonGreen-500 dark:bg-horizonGreen-500/10">
                  <MdOutlineTrendingUp className="h-4 w-4" aria-hidden />
                  {data.roiTrend.badge}
                </span>
              </div>
              <div className="h-[130px] w-full">
                <LineAreaChart
                  chartData={[
                    { name: '综合 ROI', data: data.roiTrend.points },
                  ]}
                  chartOptions={roiAreaOptions(data.roiTrend.points)}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">{PENDING_TEXT.connect}</p>
          )}
        </SurfaceCard>

        {/* #5 各项目 ROI——🔒 badge 文字型，不得改数字型 */}
        <SurfaceCard className="p-[22px]">
          {data.projectRoi ? (
            <>
              <div className="mb-1.5 flex items-end justify-between">
                <div>
                  <div className="text-compact text-gray-700 dark:text-gray-400">
                    {data.projectRoi.sub}
                  </div>
                  <div className="mt-0.5 text-3xl font-extrabold tracking-tight text-navy-700 tabular-nums dark:text-white">
                    {data.projectRoi.big}
                  </div>
                </div>
                <span className="inline-flex items-center gap-[5px] rounded-xl bg-horizonGreen-50 px-[11px] py-1.5 text-compact font-bold text-horizonGreen-500 dark:bg-horizonGreen-500/10">
                  {data.projectRoi.badge}
                </span>
              </div>
              <div className="h-[192px] w-full">
                <BarChart
                  chartData={[
                    {
                      name: 'ROI',
                      data: data.projectRoi.bars.map((b) => b.value),
                    },
                  ]}
                  chartOptions={projectRoiBarOptions(data.projectRoi.bars)}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">{PENDING_TEXT.connect}</p>
          )}
        </SurfaceCard>
      </div>

      {/* V12 #6 sec-head + meta；#7 表 5 列；#8 数值右对齐；#9 🔒 ROI 二色（真值才上色） */}
      <div className="mt-[26px]">
        <div className="mb-4 flex items-center gap-2.5">
          <h3 className="text-lg font-bold text-navy-700 dark:text-white">
            各项目 ROI
          </h3>
          {data.portfolio.length > 0 && (
            <span className="ml-auto text-compact font-semibold text-gray-700 dark:text-gray-400">
              {data.portfolio.length} 个在跑项目
            </span>
          )}
        </div>
        <DataTable
          data={data.portfolio}
          columns={PORTFOLIO_COLUMNS}
          emptyText={PENDING_TEXT.connect}
        />
      </div>

      {/* V12 #10-#13 retro 周报卡（渐变淡紫，WeeklyReport 跨项目真值）+ 采纳（internal）+ 🚪 分享 */}
      <div className="mt-5 rounded-[20px] bg-gradient-to-br from-brandSoft-a to-brandSoft-b p-6">
        <div className="mb-[11px] flex items-center gap-[7px] text-xs font-bold text-brand-500 dark:text-brand-400">
          <MdOutlineAutoAwesome className="h-4 w-4" aria-hidden />
          洞察 Agent · 本周周报草案
        </div>
        <p className="whitespace-pre-line text-compact leading-[1.65] text-navy-700 dark:text-white">
          {data.retro?.body ?? CROSS_RETRO_EMPTY_TEXT}
        </p>
        <div className="mt-[17px] flex flex-wrap gap-[11px]">
          {/* 采纳：internal（P5）。已采纳 → disabled 事实态；无草案 → 隐藏（无目标不留假按钮） */}
          {data.retro &&
            (data.retro.adopted ? (
              <Button variant="solid" size="sm" disabled>
                已采纳
              </Button>
            ) : (
              <Button
                variant="solid"
                size="sm"
                loading={busy === 'adopt'}
                onClick={handleAdopt}
              >
                采纳为周报
              </Button>
            ))}
          <Button
            variant="danger"
            size="sm"
            leftIcon={<MdOutlineShield className="h-4 w-4" aria-hidden />}
            loading={busy === 'start'}
            onClick={startShare}
          >
            生成对外分享报告
          </Button>
        </div>
      </div>

      {/* 🚪 V12 #14 确认卡（GateConfirm）：行值全部来自服务端真 harm（§9.5 只呈现不改写）；
          scope=quarterly 数据范围行（裁决 #3 与项目级区分） */}
      {gate && (
        <GateConfirm
          isOpen
          onClose={() => setGate(null)}
          onConfirm={confirmGate}
          confirmLoading={busy === 'confirm'}
          title="确认对外分享"
          harmRows={[
            { label: '数据范围', value: gate.harm.scope ?? '—' },
            { label: '对象', value: (gate.harm.targets ?? []).join('、') },
            { label: '依据', value: gate.harm.evidence ?? '—' },
          ]}
          irrevText="对外 · 链接一经生成即暴露"
          confirmText="生成链接"
        >
          {gate.harm.summary ?? '生成对外分享链接，将暴露项目数据。'}
        </GateConfirm>
      )}
    </div>
  );
}
