'use client';
// ARCH-M05 F009 — Match 环节语法面：「对比矩阵 compare」（原型 match() L771-782 /
// ui-inventory V5 全 22 元素 / architecture.md §6.3 Match 行）。
//
// 五套语法互不相同（D8 / FR-7.10）：本面 = `.cmatrix` 组合列×指标行对比矩阵
//（130px 行标 + 3 组合列，min-w 700 横滚，独立结构非 DataTable）
// + 「Agent 拿不准 · 待你裁定」候选表（common/DataTable 5 列）。
//
// 🔒 本环节刻意无闸门（V5 闸门列「无（刻意）」）：批准组合 = internal 动作——只让
// 方案生效并交给触达谈判，不发任何邮件，所以没有确认弹窗（D27 解释义务由底部
// shield 声明逐字承担）。mock 反馈 = Toast，不真切环节（真 MatchPlan approve →
// cur='reach' 推进归 M2）。
//
// 「待核」= 字段缺失 / 契约层 null（裁决 #2，isPendingVerification）——低置信度不显裸分。

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { MdOutlineRemoveRedEye, MdShield } from 'react-icons/md';
import Button from 'components/common/Button';
import DataTable from 'components/common/DataTable';
import SurfaceCard from 'components/common/SurfaceCard';
import { useToast } from 'components/common/Toast';
import ProjectAvatar from 'components/project/ProjectAvatar';
import {
  PENDING_TEXT,
  isPendingVerification,
  readContractSlot,
} from 'lib/data/provenance';
import {
  matchCandidateListSchema,
  matchPlanListSchema,
  mockMatchCandidates,
  mockMatchPlans,
  type MatchCandidate,
  type MatchPlan,
} from 'lib/data/mock/env-match';

/* ------------------------------------------------------------------ *
 * 契约层读取（D2）：校验失败 → null 降级走占位 / 空态，绝不抛错
 * ------------------------------------------------------------------ */

const PLANS: MatchPlan[] | null = readContractSlot(
  matchPlanListSchema,
  mockMatchPlans,
  'envMatch.plans',
);
const CANDIDATES: MatchCandidate[] =
  readContractSlot(
    matchCandidateListSchema,
    mockMatchCandidates,
    'envMatch.candidates',
  ) ?? [];

/* ------------------------------------------------------------------ *
 * V5-1..12 `.cmatrix` 对比矩阵（独立结构非 DataTable，D8）
 * ------------------------------------------------------------------ */

/** V5-6..9 指标行 ×4（原型 rows L771：触达 / 预算 / 风险 / 规模） */
const METRIC_ROWS: ReadonlyArray<{
  label: string;
  key: 'reach' | 'cost' | 'risk' | 'people';
}> = [
  { label: '触达', key: 'reach' },
  { label: '预算', key: 'cost' },
  { label: '风险', key: 'risk' },
  { label: '规模', key: 'people' },
];

/** minibars 满色阈值（原型 b>=7 → hi） */
const MINIBAR_HI = 7;

/* 单元通用样式（原型 .cmatrix>div：16/18 padding + 底部分隔线；foot 行无分隔线） */
const CELL_PAD = 'px-[18px] py-4';
const CELL = `${CELL_PAD} border-b border-gray-100 dark:border-white/10`;
/** 行标样式（原型 .rowlab：12px sub 700 居中对齐） */
const ROWLAB = `${CELL} flex items-center text-xs font-bold text-gray-700 dark:text-gray-400`;
/** 🔒 V5-11 pick 列淡紫底贯穿全行（原型 .cell.pick：brand-50 / 暗色 12% 紫） */
const PICK_BG = 'bg-brand-50 dark:bg-brand-400/10';

function CompareMatrix({
  plans,
  onApprove,
}: {
  plans: MatchPlan[];
  onApprove: (plan: MatchPlan) => void;
}) {
  // V5-1 `.compare` 横滚容器 > `.cmatrix` 网格：130px 行标 + 3 组合列，min-w 700
  return (
    <div className="overflow-x-auto">
      <SurfaceCard className="grid min-w-[700px] grid-cols-[130px_repeat(3,minmax(170px,1fr))] overflow-hidden">
        {/* 表头行：空行标 + V5-2 col-h ×3 */}
        <div className={CELL} aria-hidden />
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`${CELL}${
              plan.best
                ? // 🔒 V5-4 best 渐变高亮底（原型 .col-h.best 135deg 双紫）
                  ' bg-gradient-to-br from-[rgba(117,81,255,0.08)] to-[rgba(66,42,251,0.1)]'
                : ''
            }`}
          >
            <b className="text-sm font-bold text-navy-700 dark:text-white">
              {plan.name}
            </b>
            {/* 🔒 V5-3 「★ Agent 推荐」仅 best；其余 &nbsp; 占位保高 */}
            <small className="mt-[3px] block text-micro font-extrabold text-brand-500 dark:text-brand-400">
              {plan.best ? '★ Agent 推荐' : ' '}
            </small>
            {/* 🔒 V5-5 minibars 6 根迷你柱（纯 CSS：>=7 满色，其余 35% 不透明度） */}
            <div className="mt-[5px] flex h-6 items-end gap-[3px]" aria-hidden>
              {plan.bars.map((bar, i) => (
                <i
                  key={i}
                  className={`flex-1 rounded-sm bg-brand-500 ${
                    bar >= MINIBAR_HI ? 'opacity-100' : 'opacity-35'
                  }`}
                  style={{ height: `${bar * 11}%` }}
                />
              ))}
            </div>
          </div>
        ))}

        {/* V5-6..9 指标行：触达 / 预算 / 风险 / 规模 */}
        {METRIC_ROWS.map(({ label, key }) => (
          <React.Fragment key={key}>
            <div className={ROWLAB}>{label}</div>
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`${CELL}${plan.best ? ` ${PICK_BG}` : ''}`}
              >
                <b className="text-base font-bold tabular-nums text-navy-700 dark:text-white">
                  {plan[key]}
                </b>
              </div>
            ))}
          </React.Fragment>
        ))}

        {/* 🔒 V5-10 行「依据」推荐理由段 */}
        <div className={ROWLAB}>依据</div>
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`${CELL}${plan.best ? ` ${PICK_BG}` : ''}`}
          >
            <small className="block text-micro leading-4 text-gray-700 dark:text-gray-400">
              {plan.basis}
            </small>
          </div>
        ))}

        {/* V5-12 foot「批准这组」×3（best 实心 / 其余 ghost）——internal 不弹框：
            🔒 刻意无闸门（V5-22 / D27），点击仅 Toast 反馈，无确认弹窗 */}
        <div className={CELL_PAD} aria-hidden />
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`${CELL_PAD}${plan.best ? ` ${PICK_BG}` : ''}`}
          >
            <Button
              variant={plan.best ? 'solid' : 'ghost'}
              size="sm"
              onClick={() => onApprove(plan)}
            >
              批准这组
            </Button>
          </div>
        ))}
      </SurfaceCard>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * V5-13..20 「Agent 拿不准 · 待你裁定」候选表（common/DataTable 5 列）
 * ------------------------------------------------------------------ */

/** V5-20 「审阅」ghost + eye → Toast（原型 [data-review] L996 文案逐字） */
function ReviewButton({ name }: { name: string }) {
  const toast = useToast();
  return (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={<MdOutlineRemoveRedEye className="h-4 w-4" aria-hidden />}
      onClick={() => toast(`已打开 ${name} 的可信度证据`)}
    >
      审阅
    </Button>
  );
}

/** V5-19 初判 pill 三态（原型 .pill 高 gd / 中 wn / ? nu，不得合并；runs KIND_PILL 同族用色） */
const FIT_PILL_TONE: Record<MatchCandidate['fit'], string> = {
  高: 'bg-horizonGreen-50 text-horizonGreen-500 dark:bg-horizonGreen-500/10',
  中: 'bg-horizonOrange-50 text-horizonOrange-700 dark:bg-horizonOrange-500/10 dark:text-horizonOrange-500',
  '?': 'bg-lightPrimary text-gray-700 dark:bg-white/10 dark:text-gray-400',
};

const columnHelper = createColumnHelper<MatchCandidate>();

/* V5-15 FUZZY 表 5 列（创作者 / 受众匹配 / 存疑原因 / 初判 / 审阅位） */
const FUZZY_COLUMNS = [
  columnHelper.accessor('name', {
    header: '创作者',
    // V5-16 who：avatar 36（色轮序 i+2，原型 avatar(f.name,i+2,36)）+ 名 + 平台粉丝
    cell: (info) => (
      <span className="flex items-center gap-[11px]">
        <ProjectAvatar
          label={info.getValue()}
          index={info.row.index + 2}
          size={36}
        />
        <span>
          <b className="block text-sm font-bold text-navy-700 dark:text-white">
            {info.getValue()}
          </b>
          <small className="text-micro text-gray-700 dark:text-gray-400">
            {info.row.original.plat}
          </small>
        </span>
      </span>
    ),
  }),
  columnHelper.accessor('match', {
    header: '受众匹配',
    // 🔒 V5-17 受众匹配二形态（裁决 #2）：字段缺失 / 契约层 null → 「待核」
    //（低置信度不显裸分）；有值即显（isPendingVerification 机械判定）
    cell: (info) => {
      const value = info.getValue();
      return isPendingVerification(value) ? (
        <span className="font-semibold text-gray-600 dark:text-gray-400">
          {PENDING_TEXT.verify}
        </span>
      ) : (
        <span className="font-bold tabular-nums">{value}</span>
      );
    },
  }),
  columnHelper.accessor('why', {
    header: '存疑原因',
    // V5-18 存疑原因灰字（原型 color:var(--sub)）
    cell: (info) => (
      <span className="text-gray-700 dark:text-gray-400">
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.accessor('fit', {
    header: '初判',
    cell: (info) => (
      <span
        className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-micro font-bold ${
          FIT_PILL_TONE[info.getValue()]
        }`}
      >
        {info.getValue()}
      </span>
    ),
  }),
  columnHelper.display({
    id: 'review',
    header: '',
    cell: (info) => <ReviewButton name={info.row.original.name} />,
  }),
];

/* ------------------------------------------------------------------ *
 * 语法面（挂载契约：default export + { projectId }，ProjectDetail 静态映射）
 * ------------------------------------------------------------------ */

export default function MatchEnv({ projectId }: { projectId: string }) {
  const toast = useToast();

  // V5-22 批准 = internal（🔒 刻意无闸门 / 无确认弹窗，D27）：文案逐字对照原型
  // [data-approve] 处理器 L995；mock 不真切环节（真 approve → cur='reach' 归 M2）。
  const handleApprove = (plan: MatchPlan) =>
    toast(`方案「${plan.name}」已生效，交给触达谈判`);

  return (
    <div data-project={projectId}>
      {PLANS ? (
        <CompareMatrix plans={PLANS} onApprove={handleApprove} />
      ) : (
        // D2：契约层 null → 占位渲染，绝不抛错 / 填 0
        <SurfaceCard className="p-6 text-sm text-gray-600 dark:text-gray-400">
          {PENDING_TEXT.connect}
        </SurfaceCard>
      )}

      <section className="mt-[26px]">
        {/* V5-13 sec-head「Agent 拿不准 · 待你裁定」+ V5-14 meta「N 位候选」（原型 L778） */}
        <div className="mb-4 flex items-center gap-2.5">
          <h3 className="text-lg font-bold text-navy-700 dark:text-white">
            Agent 拿不准 · 待你裁定
          </h3>
          <span className="ml-auto text-compact font-semibold text-gray-700 dark:text-gray-400">
            {CANDIDATES.length} 位候选
          </span>
        </div>
        <DataTable
          data={CANDIDATES}
          columns={FUZZY_COLUMNS}
          emptyText="暂无待裁定候选——匹配 Agent 拿不准的判断会放到这里等你拍板。"
        />
      </section>

      {/* 🔒 V5-21 底部 shield 声明（原型 L782 逐字，D27 解释必须） */}
      <p className="mt-3.5 flex items-start gap-1.5 text-compact text-gray-700 dark:text-gray-400">
        <MdShield className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          批准组合只是让方案<b>生效并交给触达谈判</b>
          ——内部动作，不发任何邮件，所以没有确认弹窗。
        </span>
      </p>
    </div>
  );
}
