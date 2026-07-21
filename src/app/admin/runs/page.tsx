'use client';
// ARCH-M05 F016 — Agent 记录页（原型 viewRuns L880-892 / ui-inventory V13 全 10 元素）。
//
// 只读留痕，无闸门点（V13）：标题｜🔒 lede「谁、何时、做了什么…永久可查」｜KPI ×4
//（MiniStatistics，全部无 delta）｜🔒 筛选 chips ×5（on 实心紫；runFilter URL 化
// ?type=，D7/裁决 #4）｜DataTable 4 列 append-only 流（时间 nowrap tabular-nums /
// Agent 主题色 dot+名 / 动作 / 🔒 类型 pill 四态不合并）｜🔒 底部 shield 拦截说明。
//
// 数据经 F004 契约层（readContractSlot）读 mock/runs.ts（D2：null → 占位，绝不抛错）；
// M1 接真 OperationLog（§7.7 as-built 7 列）时换数据源，UI 零返工。

import { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createColumnHelper } from '@tanstack/react-table';
import type { IconType } from 'react-icons';
import {
  MdAutoAwesome,
  MdCheck,
  MdShield,
  MdWarningAmber,
} from 'react-icons/md';
import MiniStatistics from 'components/card/MiniStatistics';
import DataTable from 'components/common/DataTable';
import PageHeader from 'components/common/PageHeader';
import { agentTheme } from 'lib/agent/agent-theme';
import { getPersona, type AgentId } from 'lib/agent/registry';
import { PENDING_TEXT, readContractSlot } from 'lib/data/provenance';
import {
  mockRunKpiValues,
  mockRunLog,
  runKpiValuesSchema,
  runLogSchema,
  type RunKind,
  type RunKpiValues,
  type RunRow,
} from 'lib/data/mock/runs';

/* ------------------------------------------------------------------ *
 * 契约层读取（D2）：校验失败 → null 降级走占位/空态，绝不抛错
 * ------------------------------------------------------------------ */

const RUN_LOG: RunRow[] =
  readContractSlot(runLogSchema, mockRunLog, 'runs.log') ?? [];
const KPI_VALUES: RunKpiValues | null = readContractSlot(
  runKpiValuesSchema,
  mockRunKpiValues,
  'runs.kpiValues',
);

/* ------------------------------------------------------------------ *
 * V13-3 KPI ×4（原型 L881：spark/shield/alert/check，全部无 delta）
 * ------------------------------------------------------------------ */

const KPI_CARDS: Array<{
  key: keyof RunKpiValues;
  name: string;
  Icon: IconType;
}> = [
  { key: 'autoToday', name: '今日自动动作', Icon: MdAutoAwesome },
  { key: 'gatePending', name: '需你确认', Icon: MdShield },
  { key: 'blocked', name: '已拦截', Icon: MdWarningAmber },
  { key: 'irrevLogged', name: '不可逆留痕', Icon: MdCheck },
];

/* ------------------------------------------------------------------ *
 * V13-4 筛选 chips ×5（原型 L882 filters；?type= URL 化，裁决 #4）
 * ------------------------------------------------------------------ */

const RUN_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'auto', label: '自动完成' },
  { key: 'gate', label: '需确认' },
  { key: 'block', label: '已拦截' },
  { key: 'irrev', label: '不可逆' },
] as const;
type RunFilterKey = (typeof RUN_FILTERS)[number]['key'];

/** 边界校验（D7 URL 即状态）：未知 ?type= 值回落「全部」，不抛错。 */
function isRunFilterKey(v: string | null): v is RunFilterKey {
  return v !== null && RUN_FILTERS.some((f) => f.key === v);
}

/* ------------------------------------------------------------------ *
 * V13-9 类型 pill 四态（原型 L880 KIND：gd/ac/wn/cr，不得合并）
 * ------------------------------------------------------------------ */

const KIND_PILL: Record<RunKind, { label: string; tone: string }> = {
  auto: {
    label: '自动完成',
    tone: 'bg-horizonGreen-50 text-horizonGreen-500 dark:bg-horizonGreen-500/10',
  },
  gate: {
    label: '需你确认',
    tone: 'bg-brand-50 text-brand-500 dark:bg-brand-400/10 dark:text-brand-400',
  },
  block: {
    label: '已拦截',
    tone: 'bg-horizonOrange-50 text-horizonOrange-700 dark:bg-horizonOrange-500/10 dark:text-horizonOrange-500',
  },
  irrev: {
    label: '不可逆 · 已留痕',
    tone: 'bg-horizonRed-50 text-horizonRed-500 dark:bg-horizonRed-500/10 dark:text-horizonRed-400',
  },
};

function RunKindPill({ kind }: { kind: RunKind }) {
  const meta = KIND_PILL[kind];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-micro font-bold ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}

/** V13-7 Agent 单元：主题色 dot + 名（agent-theme 色表 + registry 人格名）。 */
function RunAgentCell({ actor }: { actor: AgentId }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-semibold text-navy-700 dark:text-white">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: agentTheme(actor).color }}
        aria-hidden
      />
      {getPersona(actor).name}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * V13-5..9 DataTable 4 列（时间 / Agent / 动作 / 类型）
 * ------------------------------------------------------------------ */

const columnHelper = createColumnHelper<RunRow>();
const COLUMNS = [
  columnHelper.accessor('at', {
    header: '时间',
    cell: (info) => (
      <span className="whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-600">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor('actor', {
    header: 'Agent',
    cell: (info) => <RunAgentCell actor={info.getValue()} />,
  }),
  columnHelper.accessor('summary', {
    header: '动作',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('kind', {
    header: '类型',
    cell: (info) => <RunKindPill kind={info.getValue()} />,
  }),
];

/* ------------------------------------------------------------------ *
 * 页面（useSearchParams 须 Suspense 包裹，Next 15；沿 CopilotPanel 范式）
 * ------------------------------------------------------------------ */

function RunsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawType = searchParams.get('type');
  const filter: RunFilterKey = isRunFilterKey(rawType) ? rawType : 'all';
  const rows =
    filter === 'all' ? RUN_LOG : RUN_LOG.filter((r) => r.kind === filter);

  const setFilter = (key: RunFilterKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'all') params.delete('type');
    else params.set('type', key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="mt-3">
      {/* V13-1 标题 + V13-2 🔒 lede（原型 L887 逐字） */}
      <PageHeader
        title="Agent 记录"
        subtitle={
          <>
            全编队自动动作的完整留痕——<b>谁、何时、做了什么</b>
            。不可逆动作（发信 / 报价 / 放款）单独标注、永久可查。
          </>
        }
      />
      {/* V13-3 KPI ×4（全部无 delta） */}
      <div className="mt-[22px] grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {KPI_CARDS.map(({ key, name, Icon }) => (
          <MiniStatistics
            key={key}
            name={name}
            value={KPI_VALUES?.[key] ?? PENDING_TEXT.connect}
            icon={<Icon className="h-7 w-7" />}
            iconBg="bg-lightPrimary"
          />
        ))}
      </div>
      <section className="mt-[26px]">
        {/* V13-4 🔒 筛选 chips ×5（on 实心紫；runFilter URL 化 ?type=） */}
        <div className="mb-3.5 flex flex-wrap items-center gap-2">
          {RUN_FILTERS.map(({ key, label }) => {
            const on = key === filter;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(key)}
                className={`rounded-full border px-[15px] py-2 text-xs font-semibold transition ${
                  on
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:text-brand-500 dark:border-white/10 dark:bg-navy-700 dark:text-gray-600 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {/* V13-5..9 append-only 流（4 列；空态友好，D2） */}
        <DataTable
          data={rows}
          columns={COLUMNS}
          emptyText="暂无动作留痕——Agent 完成的每一步都会按时间在这里永久记录。"
        />
        {/* V13-10 🔒 底部 shield 拦截说明（原型 L892 逐字） */}
        <p className="mt-3.5 flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-600">
          <MdShield className="mt-px h-4 w-4 shrink-0" aria-hidden />
          不可逆动作均为你确认后执行并留痕；拦截项由对应 Agent 主动停下并说明原因。
        </p>
      </section>
    </div>
  );
}

export default function RunsPage() {
  return (
    <Suspense
      fallback={
        <div className="mt-4 text-sm text-gray-600">加载 Agent 记录…</div>
      }
    >
      <RunsPageInner />
    </Suspense>
  );
}
