'use client';
// ARCH-M05 F013 — 创作者详情抽屉（ui-inventory V10，34 元素，原型 L926-973 / CSS L366-398）。
// Chakra Drawer（白名单原语）右滑 · width min(520px,96vw) · Esc + 遮罩关闭为 Drawer 自带。
// 🔒 5 处 ProvenanceTag（badge variant）是 D15 溯源差异化核心，逐处不得删；
// 深字段经 lib/data/provenance 契约层：null → 待接入/待补充/待核 占位、无数据点、无溯源徽标
//（读写不对称 §7.5.2）；🔒 专家判断 dw-jc ×3 各带 Agent 主题色彩条（agent-theme），不得合并。

import React from 'react';
import { Drawer, DrawerContent, DrawerOverlay } from '@chakra-ui/modal';
import {
  MdAttachMoney,
  MdAutoAwesome,
  MdClose,
  MdMailOutline,
  MdOutlineFolder,
  MdOutlinePeopleAlt,
  MdOutlineRemoveRedEye,
  MdOutlineShield,
  MdPlayCircleOutline,
  MdTrendingUp,
} from 'react-icons/md';
import type { IconType } from 'react-icons';
import Button from 'components/common/Button';
import ProvenanceTag from 'components/common/ProvenanceTag';
import { useToast } from 'components/common/Toast';
import PieChart from 'components/charts/PieChart';
import CircularProgress from 'components/charts/CircularProgress';
import LineAreaChart from 'components/charts/LineAreaChart';
import Progress from 'components/progress';
import { AGENT_THEME } from 'lib/agent/agent-theme';
import {
  PENDING_TEXT,
  resolveProvenance,
  type ResolvedProvenance,
} from 'lib/data/provenance';
import {
  CREATOR_PROV_FIELDS,
  type CreatorJudge,
  type CreatorShare,
  type MockCreator,
} from 'lib/data/mock/creators';
import {
  AVATAR_WHEEL,
  BRAND_500,
  CHART_AMBER,
  CHART_BLUE,
  CHART_GREEN,
  CHART_VIOLET,
} from 'lib/design-tokens';
import { CreatorAvatar, Pill, credTone } from './creator-ui';

/* ------------------------------------------------------------------ *
 * 图表配置（原型 donut L523 / areaChart h88；数据一律来自 mock 契约层）
 * ------------------------------------------------------------------ */

/** 原型 renderDrawer DC 四色轮（donut 分段） */
const DONUT_COLORS = [BRAND_500, CHART_GREEN, CHART_AMBER, CHART_BLUE];
/** 原型样本 thumb 渐变第二色轮 */
const SAMPLE_GRADIENT = [CHART_VIOLET, CHART_GREEN, CHART_BLUE];

function donutOptions(labels: string[]) {
  return {
    chart: { type: 'donut', toolbar: { show: false } },
    labels,
    colors: DONUT_COLORS,
    dataLabels: { enabled: false },
    legend: { show: false },
    stroke: { width: 0 },
    tooltip: { enabled: false },
    states: {
      hover: { filter: { type: 'none' } },
      active: { filter: { type: 'none' } },
    },
    plotOptions: { pie: { donut: { size: '70%' }, expandOnClick: false } },
  };
}

/** 近 8 周趋势（LineAreaChart h88，基于模板 MiniArea 口径收敛为 brand 色） */
const TREND_OPTIONS = {
  chart: {
    height: '88px',
    toolbar: { show: false },
    redrawOnParentResize: true,
  },
  tooltip: { enabled: false },
  dataLabels: { enabled: false },
  stroke: { curve: 'smooth', width: 3.5 },
  xaxis: {
    categories: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'],
    labels: { show: false },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: { show: false },
  legend: { show: false },
  grid: { show: false },
  fill: {
    type: 'gradient',
    gradient: {
      shade: 'light',
      type: 'vertical',
      opacityFrom: 0.28,
      opacityTo: 0,
    },
  },
  colors: [BRAND_500],
};

/** avatar 色轮位 → Progress 色名（年龄段条随创作者主题色；0 位= brand 默认） */
const WHEEL_PROGRESS_COLOR: Array<
  React.ComponentProps<typeof Progress>['color']
> = [undefined, 'green', 'amber', 'blue', 'red', 'purple'];

/* ------------------------------------------------------------------ *
 * 局部小件
 * ------------------------------------------------------------------ */

/** dw-sec 卡：card 底 · 16px 圆角 · 18px 内距（对照原型 .dw-sec） */
function Section({
  icon: Icon,
  title,
  prov,
  provLabel,
  children,
}: {
  icon: IconType;
  title: string;
  /** null = 数据缺失不渲染溯源徽标（读写不对称 §7.5.2） */
  prov?: ResolvedProvenance | null;
  provLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-[18px] dark:border-white/10 dark:bg-navy-800">
      <div className="mb-3.5 flex items-center gap-2">
        <Icon
          size={14}
          aria-hidden
          className="flex-none text-gray-700 dark:text-gray-400"
        />
        <b className="text-sm font-bold text-navy-700 dark:text-white">
          {title}
        </b>
        {prov ? (
          <ProvenanceTag
            className="ml-auto"
            variant="badge"
            provenance={prov}
            label={provLabel}
          />
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** kb-h 小节标（11px 大写 muted） */
function KbHead({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mb-[9px] text-micro font-bold uppercase tracking-wide text-gray-600 dark:text-gray-500${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </div>
  );
}

/** D2 占位（null → 待接入/待补充/待核，绝不抛错、绝不填 0） */
function PendingNote({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={`m-0 text-compact text-gray-600 dark:text-gray-400${
        className ? ` ${className}` : ''
      }`}
    >
      {children}
    </p>
  );
}

/** dw-kv 键值行 */
function KvRow({
  label,
  value,
  valueClass,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-[9px] text-compact text-gray-700 last:border-b-0 dark:border-white/10 dark:text-gray-400">
      <span>{label}</span>
      <b
        className={`text-right font-bold ${
          valueClass ?? 'text-navy-700 dark:text-white'
        }`}
      >
        {value}
      </b>
    </div>
  );
}

/** 🔒 dw-ring：64px 环 + 下标签（CircularProgress port 件）；null → 待核占位 */
function RingStat({ pct, label }: { pct: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-micro text-gray-700 dark:text-gray-400">
      {pct === null ? (
        <span className="grid h-16 w-16 place-items-center rounded-full bg-lightPrimary text-micro font-bold text-gray-600 dark:bg-navy-700">
          {PENDING_TEXT.verify}
        </span>
      ) : (
        <div className="h-16 w-16">
          <CircularProgress title="" percentage={pct} />
        </div>
      )}
      <span>{label}</span>
    </div>
  );
}

/** kb-bar 行：100px 标签 + Progress 轨 + 右对齐 % */
function ShareBars({
  items,
  color,
}: {
  items: CreatorShare[];
  color?: React.ComponentProps<typeof Progress>['color'];
}) {
  return (
    <div className="flex flex-col gap-[9px]">
      {items.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[100px_1fr_42px] items-center gap-2.5 text-xs text-gray-700 dark:text-gray-400"
        >
          <span>{item.label}</span>
          <Progress value={item.pct} color={color} />
          <b className="text-right font-bold tabular-nums text-navy-700 dark:text-white">
            {item.pct}%
          </b>
        </div>
      ))}
    </div>
  );
}

/** 🔒 专家 Agent 判断 ×3：匹配/触达/合规各带主题色彩条（agent-theme），不得合并 */
const JUDGES: Array<{
  id: keyof typeof AGENT_THEME;
  name: string;
  pick: (judge: CreatorJudge) => string;
}> = [
  { id: 'match', name: '匹配 Agent', pick: (judge) => judge.match },
  { id: 'reach', name: '触达 Agent', pick: (judge) => judge.reach },
  { id: 'compliance', name: '合规 Agent', pick: (judge) => judge.comp },
];

/* ------------------------------------------------------------------ *
 * 抽屉主体
 * ------------------------------------------------------------------ */

export interface CreatorDrawerProps {
  /** null 时不渲染内容（保持 Drawer 关闭动画由 isOpen 控制） */
  creator: MockCreator | null;
  /** 全量列表行序（avatar 色轮 / 样本渐变 / 年龄段条色） */
  index: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function CreatorDrawer({
  creator,
  index,
  isOpen,
  onClose,
}: CreatorDrawerProps) {
  const toast = useToast();
  if (creator === null) return null;

  const { deep } = creator;
  const wheelColor = AVATAR_WHEEL[index % AVATAR_WHEEL.length];
  const barColor = WHEEL_PROGRESS_COLOR[index % WHEEL_PROGRESS_COLOR.length];
  const provOf = (field: string) => resolveProvenance(creator, field);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right">
      {/* scrim：navy 半透明 + blur + z-110（原型 .drawer-scrim；须盖过 z-40 的 Copilot 面板） */}
      <DrawerOverlay className="!z-[105] !bg-navy-900/50 backdrop-blur-[3px]" />
      <DrawerContent
        aria-label="创作者详情"
        // 无 ChakraProvider（本项目无 theme）：右贴边/上下贴边由 Slide 过渡的 fixed 定位提供，
        // 高度与宽度经 !important 类自给（theme 缺省时 $100vh 不解析，沿 F005 GateConfirm 覆盖法）。
        // z-110 须落在 content-container 上（Chrome 中 fixed 容器自建 stacking context，
        // 仅设 content z 会被困在容器内、压不过 z-105 scrim）；containerProps 只有 style 能透传
        //（其 className 会被组件内部 spread 覆盖）。
        containerProps={{ style: { zIndex: 110 } }}
        className="!z-[110] flex !h-screen !w-[min(520px,96vw)] !max-w-[min(520px,96vw)] flex-col overflow-hidden !bg-background-100 !shadow-[-20px_17px_40px_4px_rgba(112,144,176,0.18)] dark:!bg-navy-900 dark:!shadow-none"
      >
        {/* dw-head：avatar 52 + 名 + small + 关闭钮 + 徽标 ×3 + 🔒 匹配 Agent 判断块 */}
        <div className="border-b border-gray-200 bg-white px-[22px] pb-4 pt-5 dark:border-white/10 dark:bg-navy-800">
          <div className="flex items-center gap-[13px]">
            <CreatorAvatar name={creator.name} index={index} size={52} />
            <div className="min-w-0">
              <b className="block truncate text-lg font-bold text-navy-700 dark:text-white">
                {creator.name}
              </b>
              <small className="text-xs text-gray-700 dark:text-gray-400">
                {creator.plat} · {creator.fans}粉丝 · {creator.genre}
              </small>
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="ml-auto grid h-9 w-9 flex-none place-items-center rounded-[10px] bg-lightPrimary text-gray-700 transition hover:text-brand-500 dark:bg-navy-700 dark:text-gray-400"
            >
              <MdClose size={18} aria-hidden />
            </button>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-[7px]">
            <Pill tone={creator.match === null ? 'nu' : 'ac'}>
              受众匹配{' '}
              {creator.match === null
                ? PENDING_TEXT.verify
                : `${creator.match}%`}
            </Pill>
            <Pill tone={credTone(creator.cred)}>可信度 {creator.cred} 级</Pill>
            <Pill tone="nu">复用 {creator.reuse} 个项目</Pill>
          </div>
          {/* 🔒 dw-summary 淡紫块 */}
          <div className="mt-[13px] flex items-start gap-2 rounded-xl bg-brand-50 px-[13px] py-[11px] text-compact leading-relaxed text-navy-700 dark:bg-navy-700 dark:text-white">
            <MdAutoAwesome
              size={14}
              aria-hidden
              className="mt-px flex-none text-brand-500 dark:text-brand-300"
            />
            <span>
              <b className="font-bold">匹配 Agent：</b>
              {deep.judge.match}
            </span>
          </div>
        </div>

        {/* dw-body：滚动区 */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-[22px] pb-6 pt-[18px]">
          {/* § 受众画像 + 🔒 ProvenanceTag「Apify 采集 · 3 天前 · 可信度 高」 */}
          <Section
            icon={MdOutlinePeopleAlt}
            title="受众画像"
            prov={deep.aud ? provOf(CREATOR_PROV_FIELDS.audience) : null}
            provLabel="Apify 采集 · 3 天前 · 可信度 高"
          >
            {deep.aud ? (
              <>
                {/* 地域 donut 118 + 中心叠加 + legend ×3 */}
                <div className="mb-4 flex items-center gap-[18px]">
                  <div className="relative h-[118px] w-[118px] flex-none">
                    <PieChart
                      type="donut"
                      chartData={deep.aud.region.map((r) => r.pct)}
                      chartOptions={donutOptions(
                        deep.aud.region.map((r) => r.label),
                      )}
                    />
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                      <div>
                        <div className="text-mini text-gray-700 dark:text-gray-400">
                          主区
                        </div>
                        <div className="text-compact font-extrabold text-navy-700 dark:text-white">
                          {deep.aud.region[0].label}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-[11px]">
                    {deep.aud.region.map((r, k) => (
                      <div
                        key={r.label}
                        className="flex items-center gap-2.5 text-compact text-gray-700 dark:text-gray-400"
                      >
                        <span
                          aria-hidden
                          className="h-3 w-3 flex-none rounded"
                          style={{
                            background: DONUT_COLORS[k % DONUT_COLORS.length],
                          }}
                        />
                        {r.label}
                        <b className="ml-auto font-bold tabular-nums text-navy-700 dark:text-white">
                          {r.pct}%
                        </b>
                      </div>
                    ))}
                  </div>
                </div>
                {/* 🔒 粉丝真实性 + 🔒 活跃度 双 ring 64 */}
                <div className="mb-3.5 mt-1.5 flex justify-center gap-[26px]">
                  <RingStat pct={deep.real} label="粉丝真实性" />
                  <RingStat pct={deep.active} label="活跃度" />
                </div>
                <KbHead>年龄段</KbHead>
                <div className="mb-3">
                  <ShareBars items={deep.aud.age} color={barColor} />
                </div>
                <KbHead>游戏品类偏好</KbHead>
                <ShareBars items={deep.aud.games} />
                <div className="mt-2.5">
                  <KvRow
                    label="性别（男 / 女）"
                    value={`${deep.aud.gender[0]}% / ${deep.aud.gender[1]}%`}
                  />
                </div>
              </>
            ) : (
              <PendingNote>
                {PENDING_TEXT.verify} · 受众数据采集未完成，完成后由匹配 Agent
                重新评估
              </PendingNote>
            )}
          </Section>

          {/* § 内容表现 + 🔒 ProvenanceTag「平台 API · 实测」 */}
          <Section
            icon={MdTrendingUp}
            title="内容表现"
            prov={deep.perf ? provOf(CREATOR_PROV_FIELDS.performance) : null}
            provLabel="平台 API · 实测"
          >
            {deep.perf ? (
              <>
                {/* dw-mini ×3 */}
                <div className="mb-3.5 grid grid-cols-3 gap-3">
                  {[
                    ['均播放', deep.perf.plays],
                    ['互动率', deep.perf.er],
                    ['完播率', deep.perf.cr],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl bg-lightPrimary p-3 dark:bg-navy-700"
                    >
                      <div className="text-micro text-gray-700 dark:text-gray-400">
                        {label}
                      </div>
                      <div className="mt-0.5 text-[17px] font-extrabold tabular-nums text-navy-700 dark:text-white">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
                <KbHead>近 8 周播放趋势</KbHead>
                <div className="h-[88px] w-full">
                  <LineAreaChart
                    chartData={[{ name: '周播放', data: deep.perf.trend }]}
                    chartOptions={TREND_OPTIONS}
                  />
                </div>
                {/* dw-deliver ×3 */}
                {deep.deliver ? (
                  <div className="mt-3 grid grid-cols-3 gap-2.5">
                    {[
                      [deep.deliver.reach, '历史有效触达'],
                      [deep.deliver.conv, '平均转化'],
                      [deep.deliver.cpm, 'CPM'],
                    ].map(([value, label]) => (
                      <div
                        key={label}
                        className="text-center text-micro text-gray-700 dark:text-gray-400"
                      >
                        <b className="mb-0.5 block text-[15px] font-bold tabular-nums text-navy-700 dark:text-white">
                          {value}
                        </b>
                        {label}
                      </div>
                    ))}
                  </div>
                ) : (
                  <PendingNote className="mt-3">
                    {PENDING_TEXT.connect} · 历史投放数据未同步
                  </PendingNote>
                )}
              </>
            ) : (
              <PendingNote>
                {PENDING_TEXT.connect} · 平台 API 未接通，播放与互动数据暂缺
              </PendingNote>
            )}
          </Section>

          {/* § 合作历史（无溯源徽标）+ 🔒 空态句 */}
          <Section icon={MdMailOutline} title="合作历史">
            {deep.collab.length > 0 ? (
              <div className="flex flex-col gap-[9px]">
                {deep.collab.map((entry) => (
                  <div
                    key={`${entry.proj}-${entry.form}`}
                    className="flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2.5 text-compact text-navy-700 dark:border-white/10 dark:text-gray-200"
                  >
                    <MdOutlineFolder
                      size={14}
                      aria-hidden
                      className="flex-none text-gray-700 dark:text-gray-400"
                    />
                    <div>
                      <b className="font-bold text-navy-700 dark:text-white">
                        《{entry.proj}》
                      </b>{' '}
                      · {entry.form} · {entry.price}
                    </div>
                    <span className="ml-auto whitespace-nowrap text-micro font-bold text-horizonGreen-500">
                      准时 · {entry.quality}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <PendingNote>与我方暂无合作记录。</PendingNote>
            )}
            <KbHead className="mt-3.5">竞品公开合作</KbHead>
            <div className="flex flex-wrap gap-1.5">
              {deep.rival.map((r) => (
                <Pill key={r} tone="nu">
                  {r}
                </Pill>
              ))}
            </div>
            <div className="mt-3">
              <KvRow label="平均响应" value={deep.resp} />
              <KvRow label="上次合作" value={deep.last} />
            </div>
          </Section>

          {/* § 商务与档期 + 🔒 ProvenanceTag「CRM · 历史成交」+ kv ×5 */}
          <Section
            icon={MdAttachMoney}
            title="商务与档期"
            prov={deep.price ? provOf(CREATOR_PROV_FIELDS.commerce) : null}
            provLabel="CRM · 历史成交"
          >
            {deep.price ? (
              <>
                <KvRow label="长视频报价" value={deep.price.video} />
                <KvRow label="短视频报价" value={deep.price.short} />
                <KvRow label="直播报价" value={deep.price.live} />
                <KvRow
                  label="竞品限制"
                  value={deep.exclusive ?? PENDING_TEXT.fill}
                />
                <KvRow
                  label="档期"
                  value={deep.schedule ?? PENDING_TEXT.fill}
                />
              </>
            ) : (
              <PendingNote>
                {PENDING_TEXT.fill} · CRM 未录入商务信息
              </PendingNote>
            )}
          </Section>

          {/* § 合规与风险 + 🔒 ProvenanceTag「合规 Agent 核验」+ kv ×3（#ad 彩色值） */}
          <Section
            icon={MdOutlineShield}
            title="合规与风险"
            prov={provOf(CREATOR_PROV_FIELDS.compliance)}
            provLabel="合规 Agent 核验"
          >
            <KvRow
              label="#ad 披露历史"
              value={deep.risk.ad}
              valueClass={
                deep.risk.adWarn
                  ? 'text-horizonOrange-500'
                  : 'text-horizonGreen-500'
              }
            />
            <KvRow label="延迟交付" value={`${deep.risk.late} 次`} />
            <KvRow label="品牌安全评分" value={`${deep.risk.safety} 级`} />
          </Section>

          {/* § 内容样本 + 🔒 ProvenanceTag「平台 · 近 30 天」+ 🔒 样本 ×3（渐变 thumb） */}
          <Section
            icon={MdPlayCircleOutline}
            title="内容样本"
            prov={deep.samples ? provOf(CREATOR_PROV_FIELDS.samples) : null}
            provLabel="平台 · 近 30 天"
          >
            {deep.samples ? (
              <div className="grid grid-cols-3 gap-[11px]">
                {deep.samples.map((sample, k) => (
                  <div key={sample.title}>
                    <div
                      className="mb-[7px] grid h-[66px] place-items-center rounded-[10px] text-white"
                      style={{
                        background: `linear-gradient(135deg, ${wheelColor}, ${
                          SAMPLE_GRADIENT[k % SAMPLE_GRADIENT.length]
                        })`,
                      }}
                    >
                      <MdPlayCircleOutline size={22} aria-hidden />
                    </div>
                    <div className="line-clamp-2 text-micro font-semibold leading-snug text-navy-700 dark:text-white">
                      {sample.title}
                    </div>
                    <div className="mt-1 text-mini text-gray-700 dark:text-gray-400">
                      {sample.views}播放 · 互动 {sample.er}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <PendingNote>
                {PENDING_TEXT.connect} · 平台内容样本未同步
              </PendingNote>
            )}
          </Section>

          {/* § 专家 Agent 判断 + 🔒 dw-jc ×3（三 Agent 主题色彩条，不得合并） */}
          <Section icon={MdAutoAwesome} title="专家 Agent 判断">
            <div className="flex flex-col gap-2.5">
              {JUDGES.map((j) => {
                const color = AGENT_THEME[j.id].color;
                return (
                  <div
                    key={j.id}
                    className="rounded-r-xl border-l-[3px] bg-lightPrimary px-3.5 py-[11px] dark:bg-navy-700"
                    style={{ borderLeftColor: color }}
                  >
                    <b
                      className="mb-[3px] block text-xs font-bold"
                      style={{ color }}
                    >
                      {j.name}
                    </b>
                    <span className="text-micro leading-relaxed text-gray-700 dark:text-gray-400">
                      {j.pick(deep.judge)}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        {/* dw-foot：两按钮 flex-1 */}
        <div className="flex gap-2.5 border-t border-gray-200 bg-white px-[22px] py-3.5 dark:border-white/10 dark:bg-navy-800">
          <Button
            variant="secondary"
            className="flex-1"
            leftIcon={<MdOutlineRemoveRedEye size={15} aria-hidden />}
            onClick={() => toast('已标记关注该创作者')}
          >
            标记关注
          </Button>
          <Button
            variant="solid"
            className="flex-1"
            leftIcon={<MdOutlinePeopleAlt size={15} aria-hidden />}
            onClick={() => {
              toast(
                `已把 ${creator.name} 加入《料理次元》匹配候选池，匹配 Agent 会重排`,
              );
              onClose();
            }}
          >
            加入某项目匹配
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
