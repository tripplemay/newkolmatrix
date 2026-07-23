'use client';
// ARCH-M05 F011 — Delivery 环节语法面「条件台账 verify」（V7 全 11 元素，原型 L798-804）。
// 五套语法互不相同（D8/FR-7.10）：本环节唯一语法 = 逐行条件核对台账。
//
// 🔒 反向 guardrail（D8）：这里刻意没有 KPI 行 / 图表 / AI 推荐卡 / 批量放款——一律不得补。
// 🚪 payout 闸门（D6 stub）：M0.5 只做触发与确认卡 UI——GateConfirm + mock 确认流
//（确认 → Toast + 行转本地「已放款」态）；真实 payout 工具与 /api/actions 两步票据 pending
// 链路实装归 M3，接线时替换 confirmPayout 内的本地状态更新。
//
// 条件单元三态 ok（齐·绿）/ miss（缺·琥珀）/ 🔒 na（—·灰，不适用），不得压成二态；
// ready=false 行的按钮位由 🔒「条件未齐」灰字**替代**（不得改成 disabled 按钮）。

import React from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { MdCheck, MdErrorOutline, MdOutlineShield } from 'react-icons/md';
import Button from 'components/common/Button';
import DataTable, {
  DataTableColumnMeta,
} from 'components/common/DataTable';
import GateConfirm from 'components/common/GateConfirm';
import SurfaceCard from 'components/common/SurfaceCard';
import { useToast } from 'components/common/Toast';
import {
  DeliveryCondition,
  DeliveryLedgerRow,
  mockDeliveryLedger,
} from 'lib/data/mock/env-delivery';

/** 条件单元三态样式（原型 .cond ok/miss/na：绿+check / 琥珀+alert / 灰「—」无图标） */
const COND_STYLE: Record<
  DeliveryCondition,
  { label: string; className: string; Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | null }
> = {
  ok: {
    label: '齐',
    className: 'text-green-500 dark:text-green-400',
    Icon: MdCheck,
  },
  miss: {
    label: '缺',
    className: 'text-amber-500 dark:text-amber-400',
    Icon: MdErrorOutline,
  },
  // 🔒 na = 不适用（如无需 Key 的合作），语义独立于 miss，不得并入
  na: { label: '—', className: 'text-gray-400', Icon: null },
};

function CondCell({ value }: { value: DeliveryCondition }) {
  const { label, className, Icon } = COND_STYLE[value];
  return (
    <span
      className={`inline-flex items-center gap-[5px] text-compact font-bold ${className}`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
      {label}
    </span>
  );
}

const columnHelper = createColumnHelper<DeliveryLedgerRow>();
const RIGHT: DataTableColumnMeta = { align: 'right' };

export default function DeliveryEnv({ projectId }: { projectId: string }) {
  const toast = useToast();
  // 已放款行（mock 本地态；M3 接真 payout 链路后由服务端状态驱动）。不可变更新（新建 Set）。
  const [paidIds, setPaidIds] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // 🚪 当前待确认放款的行（null = 闸门关闭）
  const [gateTarget, setGateTarget] = React.useState<DeliveryLedgerRow | null>(
    null,
  );

  const confirmPayout = React.useCallback(() => {
    if (!gateTarget) return;
    // D6 stub：真实资金动作归 M3-B（/api/actions 两步票据 + payout 工具）；此处仅本地转已放款态
    setPaidIds((prev) => new Set([...prev, gateTarget.id]));
    toast(`已放款 ${gateTarget.pay} 给 ${gateTarget.who}（mock）`);
    setGateTarget(null);
  }, [gateTarget, toast]);

  const columns = React.useMemo(
    () => [
      // ① 创作者 / 交付：🔒 纯色方块 av 36px（色由 mock r.av 指定，非色轮）+ 名 +
      //    sub 交付物 + 🔒 note 附注条件渲染（「 · 合同待补签」等三句逐字）
      columnHelper.accessor('who', {
        header: '创作者 / 交付',
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex items-center gap-[11px]">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-xs font-bold text-white"
                style={{ background: row.av }}
              >
                {row.who.slice(0, 2)}
              </span>
              <div>
                <b className="block text-sm font-bold text-navy-700 dark:text-white">
                  {row.who}
                </b>
                <small className="text-micro text-gray-600 dark:text-gray-400">
                  {row.sub}
                  {row.note != null && ` · ${row.note}`}
                </small>
              </div>
            </div>
          );
        },
      }),
      // ②-⑥ 条件列 ×5：内容 / Key / 合同 / 托管 / #ad（每单元三态）
      columnHelper.accessor('content', {
        header: '内容',
        cell: (info) => <CondCell value={info.getValue()} />,
      }),
      columnHelper.accessor('key', {
        header: 'Key',
        cell: (info) => <CondCell value={info.getValue()} />,
      }),
      columnHelper.accessor('contract', {
        header: '合同',
        cell: (info) => <CondCell value={info.getValue()} />,
      }),
      columnHelper.accessor('escrow', {
        header: '托管',
        cell: (info) => <CondCell value={info.getValue()} />,
      }),
      columnHelper.accessor('ad', {
        header: '#ad',
        cell: (info) => <CondCell value={info.getValue()} />,
      }),
      // ⑦ 放款：金额右对齐 800 + 🚪 放款红 gate（仅 ready）/ 🔒「条件未齐」灰字（替代按钮位）
      columnHelper.accessor('pay', {
        header: '放款',
        meta: RIGHT,
        cell: (info) => {
          const row = info.row.original;
          const paid = paidIds.has(row.id);
          return (
            <div>
              <div className="font-extrabold tabular-nums text-navy-700 dark:text-white">
                {row.pay}
              </div>
              {paid ? (
                // 已放款态（GateConfirm 确认后行转此态，mock）
                <span className="mt-1.5 inline-flex items-center gap-[5px] text-compact font-bold text-green-500 dark:text-green-400">
                  <MdCheck className="h-4 w-4 shrink-0" aria-hidden />
                  已放款
                </span>
              ) : row.ready ? (
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-1.5"
                  onClick={() => setGateTarget(row)}
                >
                  放款
                </Button>
              ) : (
                // 🔒 替代按钮位的灰字（不得改成 disabled 按钮）
                <small className="block text-micro text-gray-400">
                  条件未齐
                </small>
              )}
            </div>
          );
        },
      }),
    ],
    [paidIds],
  );

  return (
    // projectId 预留：M3 真数据按项目取 Deal 台账（deliveryCheck.row 消费面）；M0.5 mock 单项目
    <div data-project-id={projectId}>
      {/* 台账 7 列（common/DataTable） */}
      <DataTable data={mockDeliveryLedger} columns={columns} />

      {/* 🔒 底部 shield 声明（逐字）：本环节没有 AI 推荐卡，不提供绕过入口 */}
      <SurfaceCard className="mt-4 flex items-center gap-2.5 px-[18px] py-[15px] text-compact text-gray-700 dark:text-gray-400">
        <MdOutlineShield className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          这里
          <b className="font-bold text-navy-700 dark:text-white">
            {' '}
            没有 AI 推荐卡
          </b>
          ——只有条件是否满足。放款逐笔执行，必须消费合同、托管与披露证据；缺什么显什么，不提供绕过入口。
        </span>
      </SurfaceCard>

      {/* 🚪 payout 闸门确认卡：harm 3 行（收款方/金额/依据）+ 资金 irrev（D6 stub，见文件头注释） */}
      {gateTarget && (
        <GateConfirm
          isOpen
          onClose={() => setGateTarget(null)}
          onConfirm={confirmPayout}
          title="确认放款"
          harmRows={[
            { label: '收款方', value: gateTarget.who },
            {
              label: '金额',
              value: <span className="tabular-nums">{gateTarget.pay}</span>,
            },
            { label: '依据', value: '交付证据 + 托管条件已齐' },
          ]}
          irrevText="资金动作 · 放款后不可撤销"
          confirmText="确认放款"
        >
          即将向{' '}
          <b className="font-bold text-navy-700 dark:text-white">
            {gateTarget.who}
          </b>{' '}
          放款。此动作消费合同、托管与交付证据。
        </GateConfirm>
      )}
    </div>
  );
}
