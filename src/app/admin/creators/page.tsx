'use client';
// ARCH-M05 F013 — 创作者库（ui-inventory V9，16 元素，原型 L821-836；常驻匹配 Agent）。
// 标题 + 🔒 IA 契约 lede + KPI ×4（MiniStatistics）+ 平台/品类两行筛选 chips（不得合并，
// 筛选态 URL 化 ?platform=&category=，裁决 #4 / D7）+ DataTable 8 列 + 🔒 整行开抽屉 +
// 🔒 底部 shield 分流声明（裁决 #5）。
// 受众匹配列：字段缺失/契约层 null → 「待核」（裁决 #2，isPendingVerification 机械判定）。

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createColumnHelper } from '@tanstack/react-table';
import {
  MdAutoAwesome,
  MdCheck,
  MdErrorOutline,
  MdOutlinePeopleAlt,
  MdOutlineShield,
  MdTrendingUp,
} from 'react-icons/md';
import MiniStatistics from 'components/card/MiniStatistics';
import Button from 'components/common/Button';
import DataTable from 'components/common/DataTable';
import PageHeader from 'components/common/PageHeader';
import { useToast } from 'components/common/Toast';
import CreatorDrawer from 'components/creators/CreatorDrawer';
import {
  CreatorAvatar,
  Pill,
  credTone,
} from 'components/creators/creator-ui';
import { isPendingVerification, PENDING_TEXT } from 'lib/data/provenance';
import {
  CATEGORY_FILTERS,
  creatorKpis,
  matchesCreatorFilters,
  mockCreators,
  PLATFORM_FILTERS,
  type MockCreator,
} from 'lib/data/mock/creators';

/** 全量行序（avatar 色轮取色，筛选后不漂移） */
const INDEX_BY_ID = new Map(mockCreators.map((c, i) => [c.id, i]));

/** KPI 图标（原型 users/spark/trend/check，ic lg 22px · ic-circle lp 底 brand 色） */
const KPI_ICONS: Record<string, JSX.Element> = {
  total: <MdOutlinePeopleAlt className="h-[22px] w-[22px]" aria-hidden />,
  reuse: <MdAutoAwesome className="h-[22px] w-[22px]" aria-hidden />,
  match: <MdTrendingUp className="h-[22px] w-[22px]" aria-hidden />,
  premium: <MdCheck className="h-[22px] w-[22px]" aria-hidden />,
};

/** URL 态边界校验：未知参数值回落到默认 chip（不信任外部输入） */
function pickFilter<T extends readonly string[]>(
  options: T,
  raw: string | null,
): T[number] {
  return raw !== null && (options as readonly string[]).includes(raw)
    ? (raw as T[number])
    : options[0];
}

/** 筛选行（fl-lbl + 5 chips；on 态实心紫）——平台/品类两行不得合并 */
function FilterRow({
  label,
  options,
  current,
  onSelect,
}: {
  label: string;
  options: readonly string[];
  current: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-0.5 text-micro font-bold uppercase tracking-wide text-gray-600">
        {label}
      </span>
      {options.map((option) => {
        const on = option === current;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(option)}
            className={`rounded-full border px-[15px] py-2 text-compact font-semibold transition ${
              on
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:text-brand-500 dark:border-white/10 dark:bg-navy-800 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

const columnHelper = createColumnHelper<MockCreator>();

function CreatorsPageInner() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // D7 / 裁决 #4：筛选态 URL 化（可分享 / 可回退 / 可深链），不入组件 state
  const platform = pickFilter(PLATFORM_FILTERS, searchParams.get('platform'));
  const category = pickFilter(CATEGORY_FILTERS, searchParams.get('category'));

  const setFilter = React.useCallback(
    (key: 'platform' | 'category', value: string, defaultValue: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === defaultValue) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      toast('匹配 Agent 已按筛选重排候选');
    },
    [searchParams, router, pathname, toast],
  );

  const filtered = React.useMemo(
    () =>
      mockCreators.filter((c) => matchesCreatorFilters(c, platform, category)),
    [platform, category],
  );

  // 🔒 整行可点开抽屉；关闭只收 isOpen（保留右滑退出动画）
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const selected =
    selectedId !== null
      ? (mockCreators.find((c) => c.id === selectedId) ?? null)
      : null;

  const columns = React.useMemo(
    () => [
      columnHelper.accessor('name', {
        header: '创作者',
        cell: (info) => {
          const c = info.row.original;
          return (
            <div className="flex items-center gap-[11px]">
              <CreatorAvatar
                name={c.name}
                index={INDEX_BY_ID.get(c.id) ?? 0}
                size={36}
              />
              <div className="min-w-0">
                <b className="block font-bold text-navy-700 dark:text-white">
                  {c.name}
                </b>
                <small className="text-micro text-gray-700 dark:text-gray-400">
                  {c.plat}
                </small>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('fans', {
        header: '粉丝',
        cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
      }),
      columnHelper.accessor('genre', {
        header: '品类',
        cell: (info) => <Pill tone="nu">{info.getValue()}</Pill>,
      }),
      columnHelper.accessor('match', {
        header: '受众匹配',
        cell: (info) => {
          const value = info.getValue();
          // 裁决 #2：字段缺失 / 契约层 null → 「待核」（机械判定，有值即显）
          if (isPendingVerification(value)) {
            return (
              <span className="font-semibold text-gray-600 dark:text-gray-500">
                {PENDING_TEXT.verify}
              </span>
            );
          }
          return (
            <span className="font-bold tabular-nums text-navy-700 dark:text-white">
              {value}%
            </span>
          );
        },
      }),
      columnHelper.accessor('reuse', {
        header: '历史合作',
        cell: (info) => (
          <span className="tabular-nums">{info.getValue()} 个项目</span>
        ),
      }),
      columnHelper.accessor('cred', {
        header: '可信度',
        cell: (info) => (
          <Pill tone={credTone(info.getValue())}>{info.getValue()} 级</Pill>
        ),
      }),
      columnHelper.accessor('ad', {
        header: '#ad',
        cell: (info) =>
          info.getValue() === 'ok' ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-horizonGreen-500">
              <MdCheck size={14} aria-hidden />
              合规
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-horizonOrange-700 dark:text-horizonOrange-500">
              <MdErrorOutline size={14} aria-hidden />
              待核
            </span>
          ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: (info) => (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              // 行内按钮不触发整行开抽屉
              e.stopPropagation();
              toast(
                `已把 ${info.row.original.name} 加入《料理次元》匹配候选池，匹配 Agent 会重排`,
              );
            }}
          >
            加入匹配
          </Button>
        ),
      }),
    ],
    [toast],
  );

  return (
    <div className="mt-3">
      {/* 标题 + 🔒 IA 契约 lede（逐字原型） */}
      <PageHeader
        title="创作者库"
        subtitle={
          <>
            跨项目发现与复用创作者——这一层
            <b className="font-bold">只做发现和分流</b>
            ，真正的触达、谈判必须回到项目内部。匹配 Agent
            已按你在跑的项目品类预排序。
          </>
        }
      />

      {/* KPI ×4（delta 有无两态不得统一） */}
      <div className="mt-[22px] grid grid-cols-1 gap-5 md:grid-cols-2 3xl:grid-cols-4">
        {creatorKpis.map((kpi) => (
          <MiniStatistics
            key={kpi.id}
            name={kpi.name}
            icon={KPI_ICONS[kpi.id]}
            iconBg="bg-lightPrimary"
            value={
              kpi.delta === null ? (
                kpi.value
              ) : (
                <>
                  {kpi.value}
                  <small className="ml-1.5 text-xs font-bold text-horizonGreen-500">
                    {kpi.delta}
                  </small>
                </>
              )
            }
          />
        ))}
      </div>

      <div className="mt-[26px]">
        {/* 平台 / 品类 两行筛选 chips（不得合并；URL 化） */}
        <div className="mb-3.5 flex flex-col gap-2">
          <FilterRow
            label="平台"
            options={PLATFORM_FILTERS}
            current={platform}
            onSelect={(v) => setFilter('platform', v, PLATFORM_FILTERS[0])}
          />
          <FilterRow
            label="品类"
            options={CATEGORY_FILTERS}
            current={category}
            onSelect={(v) => setFilter('category', v, CATEGORY_FILTERS[0])}
          />
        </div>

        {/* 表 8 列 + 🔒 整行可点开抽屉 */}
        <DataTable
          data={filtered}
          columns={columns}
          onRowClick={(c) => {
            setSelectedId(c.id);
            setDrawerOpen(true);
          }}
          emptyText="没有符合筛选的创作者"
        />

        {/* 🔒 底部 shield 分流声明（裁决 #5，逐字原型） */}
        <p className="mt-3.5 flex max-w-[76ch] items-start gap-1.5 text-compact text-gray-700 dark:text-gray-400">
          <MdOutlineShield size={14} className="mt-0.5 flex-none" aria-hidden />
          <span>
            这里只能「加入某项目的匹配候选」——不能直接发信或报价。分流后由项目内的
            <b className="font-bold">触达 Agent</b> 接手。
          </span>
        </p>
      </div>

      <CreatorDrawer
        creator={selected}
        index={selected !== null ? (INDEX_BY_ID.get(selected.id) ?? 0) : 0}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

// useSearchParams 须 Suspense 包裹（Next 15，沿 CopilotPanel 先例）
export default function CreatorsPage() {
  return (
    <Suspense
      fallback={<div className="mt-3 p-4 text-sm text-gray-400">加载创作者库…</div>}
    >
      <CreatorsPageInner />
    </Suspense>
  );
}
