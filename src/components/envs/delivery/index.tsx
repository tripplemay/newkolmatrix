'use client';
// ARCH-M05 F011 → M3-B-DELIVERY F009 — Delivery 环节语法面「条件台账 verify」（V7 全 11 元素，原型 L798-804）。
// 五套语法互不相同（D8/FR-7.10）：本环节唯一语法 = 逐行条件核对台账。
//
// 🔒 反向 guardrail（D8）：这里刻意没有 KPI 行 / 图表 / AI 推荐卡 / 批量放款——一律不得补。
//
// 数据源 = RSC 组装 `loadDeliverySurfaceData`（lib/delivery/surface-data）：
// 每行的条件三态与 `ready` 都是 `deliveryCheck` 真值（三处复用铁律 ①），**不在本组件另判一次**；
// 已放款态来自 Payout(released) 真值（原 mock 的本地 paidIds 已退役）。mock env-delivery 已退役。
//
// 🚪 payout 闸门真链路（F009，D6 stub 全数替换）：放款 = outbound →
//   POST /api/delivery/payout（executeTool 薄封装 → pending 信封，副作用零发生）
//   → GET /api/actions/[id]（服务端详情，确认卡渲染**真 harm**，前端不改写不筛选——§9.5）
//   → POST /api/actions/[id]/confirm（签票）→ POST /api/actions/[id]/execute（消费票）
//   → router.refresh()（RSC 重组装，条件/金额/已放款态随库更新）。
// 条件未齐时服务端在落 PendingAction 之前就拒（P6）——前端把原话 toast 出来，不重新判定。
//
// 条件单元三态 ok（齐·绿）/ miss（缺·琥珀）/ 🔒 na（—·灰，不适用），不得压成二态；
// ready=false 行的按钮位由 🔒「条件未齐」灰字**替代**（不得改成 disabled 按钮）。

import React from 'react';
import { useRouter } from 'next/navigation';
import { createColumnHelper } from '@tanstack/react-table';
import { MdCheck, MdErrorOutline, MdOutlineShield } from 'react-icons/md';
import Button from 'components/common/Button';
import DataTable, { DataTableColumnMeta } from 'components/common/DataTable';
import GateConfirm from 'components/common/GateConfirm';
import SurfaceCard from 'components/common/SurfaceCard';
import { useToast } from 'components/common/Toast';
import {
  DELIVERY_EMPTY_TEXT,
  EMPTY_DELIVERY_SURFACE,
  type DeliveryCondition,
  type DeliveryLedgerRow,
  type DeliverySurfaceData,
} from 'lib/display/delivery-format';

/** 条件单元三态样式（原型 .cond ok/miss/na：绿+check / 琥珀+alert / 灰「—」无图标） */
const COND_STYLE: Record<
  DeliveryCondition,
  {
    label: string;
    className: string;
    Icon: React.ComponentType<{
      className?: string;
      'aria-hidden'?: boolean;
    }> | null;
  }
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

/** 真 harm 视图（GET /api/actions/[id] 返回；渲染不改写——§9.5 确认卡只做呈现） */
interface HarmView {
  summary?: string;
  targets?: string[];
  amount?: number;
  currency?: string;
  evidence?: string;
}

interface GateFlow {
  row: DeliveryLedgerRow;
  pendingActionId: string;
  harm: HarmView;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function DeliveryEnv({
  projectId,
  data = EMPTY_DELIVERY_SURFACE,
}: {
  projectId: string;
  /** RSC 组装的真数据（M3-B F009）；缺省空表（D2 降级，绝不抛错） */
  data?: DeliverySurfaceData;
}) {
  const toast = useToast();
  const router = useRouter();
  // 🚪 当前待确认放款（null = 闸门关闭）
  const [gate, setGate] = React.useState<GateFlow | null>(null);
  const [busy, setBusy] = React.useState<'start' | 'confirm' | null>(null);

  /** 🚪 放款真链第一步：POST /api/delivery/payout → pending 信封 → GET 详情 → 确认卡（真 harm） */
  const startPayout = React.useCallback(
    async (row: DeliveryLedgerRow) => {
      setBusy('start');
      try {
        const res = await fetch('/api/delivery/payout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ projectId, dealId: row.id }),
        });
        const out = await readJson(res);
        if (!res.ok) {
          toast(String(out.error ?? '放款发起失败')); // 服务端拒绝原文透传（缺什么显什么）
          return;
        }
        const detail = await fetch(`/api/actions/${String(out.pendingActionId)}`);
        const card = await readJson(detail);
        if (!detail.ok) {
          toast(String(card.error ?? '读取待确认动作失败'));
          return;
        }
        setGate({
          row,
          pendingActionId: String(out.pendingActionId),
          harm: (card.harm ?? {}) as HarmView,
        });
      } finally {
        setBusy(null);
      }
    },
    [projectId, toast],
  );

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
        toast(String(exec.error ?? '执行失败')); // 含服务端二次校验的拒绝（P6）
        setGate(null);
        return;
      }
      toast(`已放款 ${gate.row.pay} 给 ${gate.row.who}`);
      setGate(null);
      router.refresh(); // RSC 重组装：条件 / 已放款态随库更新（服务端为真相）
    } finally {
      setBusy(null);
    }
  }, [gate, router, toast]);

  const columns = React.useMemo(
    () => [
      // ① 创作者 / 交付：🔒 纯色方块 av 36px（色由行 av 指定，非色轮）+ 名 +
      //    sub 交付物 + 🔒 note 附注条件渲染
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
          return (
            <div>
              <div className="font-extrabold tabular-nums text-navy-700 dark:text-white">
                {row.pay}
              </div>
              {row.paid ? (
                // 已放款态（Payout released 真值，服务端驱动）
                <span className="mt-1.5 inline-flex items-center gap-[5px] text-compact font-bold text-green-500 dark:text-green-400">
                  <MdCheck className="h-4 w-4 shrink-0" aria-hidden />
                  已放款
                </span>
              ) : row.ready ? (
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-1.5"
                  loading={busy === 'start'}
                  onClick={() => startPayout(row)}
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
    [busy, startPayout],
  );

  return (
    // projectId：放款闸门发起时随 dealId 一并提交（人格与项目上下文）
    <div data-project-id={projectId}>
      {/* 台账 7 列（common/DataTable）；空态 = 还没有交易（D2 诚实，不假造行） */}
      <DataTable
        data={data.rows}
        columns={columns}
        emptyText={DELIVERY_EMPTY_TEXT}
      />

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

      {/* 🚪 payout 闸门确认卡：harm 3 行（收款方/金额/依据）+ 资金 irrev。
          行值全部来自服务端 harm（§9.5：确认卡只呈现，不改写不筛选）。 */}
      {gate && (
        <GateConfirm
          isOpen
          onClose={() => setGate(null)}
          onConfirm={confirmGate}
          confirmLoading={busy === 'confirm'}
          title="确认放款"
          harmRows={[
            { label: '收款方', value: (gate.harm.targets ?? []).join('、') },
            {
              label: '金额',
              value: (
                <span className="tabular-nums">
                  {gate.harm.amount != null
                    ? `${gate.harm.amount} ${gate.harm.currency ?? ''}`.trim()
                    : gate.row.pay}
                </span>
              ),
            },
            { label: '依据', value: gate.harm.evidence ?? '—' },
          ]}
          irrevText="资金动作 · 放款后不可撤销"
          confirmText="确认放款"
        >
          {gate.harm.summary ?? (
            <>
              即将向{' '}
              <b className="font-bold text-navy-700 dark:text-white">
                {gate.row.who}
              </b>{' '}
              放款。此动作消费合同、托管与交付证据。
            </>
          )}
        </GateConfirm>
      )}
    </div>
  );
}
