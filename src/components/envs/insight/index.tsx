'use client';
// ARCH-M05 F012 → M4-INSIGHT F009 — Insight 环节「对照账本 reconcile」语法面（ui-inventory V8 全 19 元素，原型 L806-817）。
// 五套环节语法互不相同（D8/FR-7.10）：本环节 = 对账原目标——差异表 + 证据缺口 + 图 + 复盘草案。
// 挂载契约：default export + { projectId, data }（ProjectDetail 显式分支传真数据）。
//
// 数据源 = RSC 组装 `loadInsightSurfaceData`（lib/insight/surface-data）：
// 对照表 ROI/差异/方向 = roi.compute/compareGoal 真值（三处复用铁律①，**不在本组件另判**）；
// 证据缺口 = attribution.gaps 真值；retro = WeeklyReport 项目级复盘真值。mock env-insight.ts 已退役。
// 诚实语义（P1/P7）：分子无源 → 「证据不足」，绝不填 0；差异列**三值三样式**（up 绿 / down 红 /
// flat·null 中性灰）不得压二态；渠道/受众图卡数据源属 M5 平台回传——本批结构保留、内容为
// 「待接入」占位（空态诚实，反向 guardrail：不编数据也不删区块）。
//
// 🚪 分享闸门真链路（F009，D6 stub 全数替换；scope=project——裁决 #3 与 V12 区分）：
//   POST /api/insight/share（executeTool 薄封装 → pending 信封，副作用零发生）
//   → GET /api/actions/[id]（确认卡渲染**真 harm**，前端不改写不筛选——§9.5）
//   → POST /api/actions/[id]/confirm（签票）→ POST /api/actions/[id]/execute（消费票）
//   → router.refresh()。本批 mock ShareLinkService：零真实公开暴露。
// #18「采纳结论」internal（P5 无弹窗）：POST /api/insight/adopt → Toast → refresh。

import React from 'react';
import { useRouter } from 'next/navigation';
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
import {
  CHART_AMBER,
  CHART_BLUE,
  CHART_GREEN,
  GRAY_600,
} from 'lib/design-tokens';
import { PENDING_TEXT } from 'lib/data/provenance';
import {
  EMPTY_INSIGHT_SURFACE,
  INSIGHT_RECON_EMPTY_TEXT,
  INSIGHT_RETRO_EMPTY_TEXT,
  type InsightAudienceTone,
  type InsightReconRow,
  type InsightSurfaceData,
} from 'lib/display/insight-format';

/* ------------------------------------------------------------------ *
 * 对照表 4 列（V8 #1-#4）：指标 / 原目标灰 / 实际 navy-700 fw700 / 差异 fw800
 * 差异三值三样式：up 绿 / down 红 / flat·null 中性灰（不得压二态——direction 为
 * roi.compute/compareGoal 真值，null=数据缺无法判断，与 flat 同渲染中性但语义独立）
 * ------------------------------------------------------------------ */

const rightAlign = { align: 'right' } satisfies DataTableColumnMeta;
const reconColumn = createColumnHelper<InsightReconRow>();

/** direction → 差异列样式（三值三样式，V8 §2.3 硬要求）。 */
function deltaClass(direction: InsightReconRow['direction']): string {
  if (direction === 'up') return 'text-horizonGreen-500';
  if (direction === 'down') return 'text-horizonRed-500';
  return 'text-gray-500 dark:text-gray-400'; // flat / null（无法判断）→ 中性
}

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
      <b className="font-bold tabular-nums text-navy-700 dark:text-white">
        {info.getValue()}
      </b>
    ),
  }),
  // 差异：fw800 三值三样式（direction 真值驱动，本组件只映射样式不重判）
  reconColumn.accessor('delta', {
    header: '差异',
    meta: rightAlign,
    cell: (info) => (
      <span
        className={`font-extrabold tabular-nums ${deltaClass(
          info.row.original.direction,
        )}`}
      >
        {info.getValue()}
      </span>
    ),
  }),
];

/* ------------------------------------------------------------------ *
 * 图表 options（Horizon ApexCharts 语言，对照原型 svg 形态；F015 同口径）。
 * 本批 channel/audience 数据恒 null（M5 平台回传接真）——实现保留（V8 #7-#14
 * 元素结构不删），数据到位即恢复渲染，UI 零返工（mock 先行渲染契约的反向兑现）。
 * ------------------------------------------------------------------ */

/** 渠道 5 柱：rx10 + 底部标签；hi 柱 brand 实色近似（ApexCharts distributed 柱
 * 不支持逐柱渐变，spec V8 允许），其余 brand-50 淡紫 */
function channelBarOptions(bars: { label: string; hi: boolean }[]) {
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

/** tone → 图色（原型 AUDIENCE 色轮就近映射 token：brand 走 CSS 变量随主题） */
const AUDIENCE_CHART_COLORS: Record<InsightAudienceTone, string> = {
  brand: 'var(--color-500)',
  green: CHART_GREEN,
  orange: CHART_AMBER,
  blue: CHART_BLUE,
};

/** tone → legend sw 色块类（同一 token 源，图例与图色不漂移） */
const AUDIENCE_SWATCH_CLASSES: Record<InsightAudienceTone, string> = {
  brand: 'bg-brand-500',
  green: 'bg-horizonGreen-500',
  orange: 'bg-horizonOrange-500',
  blue: 'bg-horizonBlue-500',
};

/** 受众构成 donut：150 盒 4 段（孔径 74%；圆角段头 ApexCharts 不支持——直角近似） */
function audienceDonutOptions(
  segments: { tone: InsightAudienceTone; label: string }[],
) {
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
 * 🚪 分享闸门真链（delivery/index.tsx 同款范式）
 * ------------------------------------------------------------------ */

/** 真 harm 视图（GET /api/actions/[id] 返回；渲染不改写——§9.5 确认卡只做呈现） */
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

export default function InsightEnv({
  projectId,
  data = EMPTY_INSIGHT_SURFACE,
}: {
  projectId: string;
  /** RSC 组装的真数据（M4 F009）；缺省空态（D2 降级，绝不抛错） */
  data?: InsightSurfaceData;
}) {
  const toast = useToast();
  const router = useRouter();
  const [gate, setGate] = React.useState<GateFlow | null>(null);
  const [busy, setBusy] = React.useState<'adopt' | 'start' | 'confirm' | null>(
    null,
  );

  // V8 #18 internal 动作（P5 无弹窗）：POST /api/insight/adopt → Toast（文案沿原型 L1002）
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
      toast('复盘结论已采纳，加入下季度默认组合');
      router.refresh(); // RSC 重组装：adopted 态随库更新
    } finally {
      setBusy(null);
    }
  }, [data.retro, router, toast]);

  /** 🚪 分享真链第一步：POST /api/insight/share → pending 信封 → GET 详情 → 确认卡（真 harm） */
  const startShare = React.useCallback(async () => {
    setBusy('start');
    try {
      const res = await fetch('/api/insight/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scope: 'project', projectId }),
      });
      const out = await readJson(res);
      if (!res.ok) {
        toast(String(out.error ?? '分享发起失败')); // 服务端拒绝原文透传，不改写
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
  }, [projectId, toast]);

  /** 🚪 两步票据：confirm 签票 → execute 消费票（票仅存在于本次链式调用，不落本地状态） */
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
      // 本批 mock 通道（P4 零真实公开暴露）——如实告知，不冒充已公开
      toast('分享链接已生成（mock 通道 · 未对外公开暴露）');
      setGate(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [gate, router, toast]);

  return (
    <div>
      {/* V8 #1-#4 对照表 + #5-#6 证据缺口卡（原型 .recon 1.15fr/.85fr 双列） */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <DataTable
          data={data.recon}
          columns={RECON_COLUMNS}
          emptyText={INSIGHT_RECON_EMPTY_TEXT}
        />

        <SurfaceCard className="p-[22px]">
          {/* #5 eyebrow「证据缺口 N」（计数 = attribution.gaps 真值行数） */}
          <div className="mb-3 text-micro font-bold uppercase tracking-[0.04em] text-gray-600">
            证据缺口 {data.gaps.length}
          </div>
          {/* #6 🔒 gaprow ×N：琥珀 alert + 诚实归因边界（真值，缺什么显什么，不得删） */}
          {data.gaps.length > 0 ? (
            data.gaps.map((gap) => (
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
            ))
          ) : (
            <p className="text-sm text-gray-600">
              {data.recon.length > 0 ? '本期无证据缺口' : PENDING_TEXT.connect}
            </p>
          )}
        </SurfaceCard>
      </div>

      {/* V8 #7-#10 渠道 chartcard + #11-#14 受众构成（原型 .grid-2.sec 1.6fr/1fr）。
          数据源 = 平台渠道/受众回传（M5 入站）——本批 data.channel/data.audience 恒 null
          → 「待接入」占位（D2 空态诚实：不编数据、不删区块；实现保留，数据到位即渲染）。 */}
      <div className="mt-[26px] grid grid-cols-1 items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <SurfaceCard className="p-[22px]">
          {data.channel ? (
            <>
              <div className="mb-1.5 flex items-end justify-between">
                <div>
                  {/* #7 chart-sub + #8 chart-big */}
                  <div className="text-compact text-gray-700 dark:text-gray-400">
                    {data.channel.sub}
                  </div>
                  <div className="mt-0.5 text-3xl font-extrabold tabular-nums tracking-tight text-navy-700 dark:text-white">
                    {data.channel.big}
                  </div>
                </div>
                {/* #9 绿 badge（trend 图标） */}
                <span className="inline-flex items-center gap-[5px] rounded-xl bg-horizonGreen-50 px-[11px] py-1.5 text-compact font-bold text-horizonGreen-500 dark:bg-horizonGreen-500/10">
                  <MdOutlineTrendingUp className="h-4 w-4" aria-hidden />
                  {data.channel.badge}
                </span>
              </div>
              {/* #10 BarChart 5 柱（原型 barChart h:160 + 22 底标签带） */}
              <div className="h-[182px] w-full">
                <BarChart
                  chartData={[
                    {
                      name: '有效安装占比',
                      data: data.channel.bars.map((b) => b.value),
                    },
                  ]}
                  chartOptions={channelBarOptions(data.channel.bars)}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-600">{PENDING_TEXT.connect}</p>
          )}
        </SurfaceCard>

        <SurfaceCard className="p-[22px]">
          {data.audience ? (
            <>
              {/* #11 eyebrow「受众构成」 */}
              <div className="mb-3.5 text-micro font-bold uppercase tracking-[0.04em] text-gray-600">
                受众构成
              </div>
              <div className="flex items-center gap-[22px]">
                {/* #12 donut 150 + #13 🔒 中心叠加读数（绝对定位覆盖层，不得删） */}
                <div className="relative h-[150px] w-[150px] shrink-0">
                  <PieChart
                    type="donut"
                    chartData={data.audience.segments.map((s) => s.pct)}
                    chartOptions={audienceDonutOptions(data.audience.segments)}
                  />
                  <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                    <div>
                      <div className="text-[22px] font-extrabold tabular-nums text-navy-700 dark:text-white">
                        {data.audience.center.value}
                      </div>
                      <div className="text-micro text-gray-700 dark:text-gray-400">
                        {data.audience.center.label}
                      </div>
                    </div>
                  </div>
                </div>
                {/* #14 legend 4 行（sw 色块 + 标签 + 右对齐 %） */}
                <div className="flex flex-1 flex-col gap-[11px]">
                  {data.audience.segments.map((s) => (
                    <div
                      key={s.label}
                      className="flex items-center gap-2.5 text-compact text-gray-700 dark:text-gray-400"
                    >
                      <span
                        className={`h-3 w-3 flex-none rounded ${
                          AUDIENCE_SWATCH_CLASSES[s.tone]
                        }`}
                        aria-hidden
                      />
                      {s.label}
                      <b className="ml-auto font-bold tabular-nums text-navy-700 dark:text-white">
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

      {/* V8 #15-#17 retro 复盘草案卡（渐变淡紫 dlbl + 正文 = WeeklyReport 真值）
          + #18「采纳结论」internal + #19 🚪「生成对外分享报告」红 gate */}
      <div className="mt-5 rounded-[20px] bg-gradient-to-br from-brandSoft-a to-brandSoft-b p-6">
        <div className="mb-[11px] flex items-center gap-[7px] text-xs font-bold text-brand-500 dark:text-brand-400">
          <MdOutlineAutoAwesome className="h-4 w-4" aria-hidden />
          Agent 复盘草案 · 采纳后可复用到下个项目
        </div>
        <p className="whitespace-pre-line text-compact leading-[1.65] text-navy-700 dark:text-white">
          {data.retro?.body ?? INSIGHT_RETRO_EMPTY_TEXT}
        </p>
        <div className="mt-[17px] flex flex-wrap gap-[11px]">
          {/* #18 采纳：internal（P5）。已采纳 → disabled 事实态；无草案 → 隐藏（幽灵控件规则：无目标不留假按钮） */}
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
                采纳结论
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

      {/* 🚪 #19 确认卡（GateConfirm）：行值全部来自服务端真 harm（§9.5 只呈现不改写）；
          scope=project 数据范围行（裁决 #3 与跨项目洞察页区分） */}
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
