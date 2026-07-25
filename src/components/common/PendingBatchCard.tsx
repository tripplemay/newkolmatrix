// M4.5-AGENT-LOOP F007 — 「已备好 N 件待确认」聚合卡（F-D）
//
// 循环放开之后，Agent 一轮能备好的动作变多，逐个点开确认会把人耗在翻页上。聚合卡把
// **全部**待确认列在一处，两条动线：
//   ① 逐个审阅 —— 展开逐条看利害后各自去对应环节确认（不在此卡内代确认）
//   ② 依次确认 —— 前端逐项调既有两步票据端点（无批量端点，见 lib/gate/batch-confirm.ts）
//
// ── D28 口径：利害列全，不折叠 ──
// 批量最容易滑向「N 件动作 · 全部确认」——那正是闸门要防的形态。故每一条的对象名单、
// 金额、依据、不可逆红标都完整展示；对象多也不省略成「等 N 人」。
//
// P7：只用既有组件语言（SurfaceCard / Button / 既有 harm 行式样），不引入新视觉语言。

'use client';

import React from 'react';
import { MdOutlineShield, MdWarningAmber } from 'react-icons/md';
import Button from './Button';
import SurfaceCard from './SurfaceCard';
import {
  confirmAndExecuteSequentially,
  type BatchConfirmResult,
} from 'lib/gate/batch-confirm';
import type { PendingBatchItem } from 'lib/gate/pending-items';

/** 空态文案（测试锚点）：没有就说没有，不假造「一切正常」之类的结论。 */
export const BATCH_EMPTY_MSG =
  '现在没有备好待确认的动作。Agent 备好对外或花钱的动作时，会完整列在这里等你拍板。';

/** 批量语义如实告知（前端不弱化）。 */
export const BATCH_DISCLOSURE_MSG =
  '「依次确认」= 逐条走完与单个确认完全相同的两步闸门，中途失败的会单列出来告诉你原因——不是一键放行。';

function HarmRows({ item }: { item: PendingBatchItem }) {
  const harm = item.harm;
  if (!harm) {
    return (
      <div className="text-micro font-semibold text-red-500">
        利害披露不可读（服务端 harm 解析失败）——不要在看不到利害的情况下确认
      </div>
    );
  }
  const rows: Array<[string, string]> = [
    ['对象', harm.targets.join('、')],
  ];
  if (harm.amount != null) {
    rows.push(['金额', `${harm.amount}${harm.currency ? ` ${harm.currency}` : ''}`]);
  }
  if (harm.quantity != null) rows.push(['数量', String(harm.quantity)]);
  if (harm.scope) rows.push(['范围', harm.scope]);
  rows.push(['依据', harm.evidence]);
  return (
    <div className="mt-1.5 overflow-hidden rounded-xl bg-lightPrimary dark:bg-navy-700">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-start justify-between gap-3 border-b border-gray-100 px-3 py-2 text-micro last:border-b-0 dark:border-white/10"
        >
          <span className="shrink-0 text-gray-600 dark:text-gray-400">
            {label}
          </span>
          {/* 名单列全不截断（D28）：break-words 而非 truncate */}
          <span className="break-words text-right font-semibold text-navy-700 dark:text-white">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ItemBlock({
  item,
  result,
  expanded,
}: {
  item: PendingBatchItem;
  result?: { ok: boolean; error: string | null; code: string | null };
  expanded: boolean;
}) {
  return (
    <li
      data-testid="pending-batch-item"
      className="border-t border-gray-100 py-2.5 first:border-t-0 dark:border-white/10"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="text-xs font-bold text-navy-700 dark:text-white">
          {item.harm?.summary ?? `工具「${item.toolName}」`}
        </b>
        {item.harm?.irreversible && (
          <span className="inline-flex items-center gap-0.5 text-mini font-bold text-red-500">
            <MdWarningAmber size={11} aria-hidden />
            对外 · 不可撤销
          </span>
        )}
        {result && (
          <span
            className={`text-mini font-bold ${
              result.ok ? 'text-green-500' : 'text-red-500'
            }`}
          >
            {result.ok
              ? '已执行'
              : `失败：${result.code ? `${result.code} · ` : ''}${result.error}`}
          </span>
        )}
      </div>
      {expanded && <HarmRows item={item} />}
    </li>
  );
}

export default function PendingBatchCard({
  items,
  onDone,
}: {
  items: PendingBatchItem[];
  /** 批量完成后的回调（消费方通常 router.refresh()）。 */
  onDone?: () => void;
}) {
  // 默认展开：利害是给人看的，默认折叠等于默认不给看（D28）
  const [expanded, setExpanded] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<BatchConfirmResult | null>(null);

  const byId = React.useMemo(() => {
    const m = new Map<string, BatchConfirmResult['items'][number]>();
    for (const r of result?.items ?? []) m.set(r.id, r);
    return m;
  }, [result]);

  const runAll = React.useCallback(async () => {
    setBusy(true);
    try {
      const r = await confirmAndExecuteSequentially(items.map((i) => i.id));
      setResult(r);
      onDone?.();
    } finally {
      setBusy(false);
    }
  }, [items, onDone]);

  if (items.length === 0) {
    return (
      <SurfaceCard className="p-[22px]" data-testid="pending-batch-empty">
        <p className="text-compact text-gray-600 dark:text-gray-400">
          {BATCH_EMPTY_MSG}
        </p>
      </SurfaceCard>
    );
  }

  const irrevCount = items.filter((i) => i.harm?.irreversible).length;

  return (
    <SurfaceCard className="p-[22px]" data-testid="pending-batch-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400">
          <MdOutlineShield size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <b className="block text-sm font-bold text-navy-700 dark:text-white">
            已备好 {items.length} 件待确认
          </b>
          <span className="text-micro text-gray-600 dark:text-gray-400">
            其中 {irrevCount} 件对外不可撤销 · 利害逐条列全，不折叠
          </span>
        </div>
      </div>

      <ul className="mt-3">
        {items.map((item) => (
          <ItemBlock
            key={item.id}
            item={item}
            expanded={expanded}
            result={byId.get(item.id)}
          />
        ))}
      </ul>

      <p className="mt-2 text-mini leading-4 text-gray-600 dark:text-gray-400">
        {BATCH_DISCLOSURE_MSG}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起利害' : '逐个审阅'}
        </Button>
        <Button size="sm" variant="danger" loading={busy} onClick={runAll}>
          依次确认全部 {items.length} 件
        </Button>
        {result && (
          <span className="text-micro font-semibold text-gray-600 dark:text-gray-400">
            成功 {result.succeeded} 件 · 失败 {result.failed} 件
          </span>
        )}
      </div>
    </SurfaceCard>
  );
}
