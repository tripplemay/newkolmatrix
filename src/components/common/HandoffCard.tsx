// FE-REFACTOR F003 — 协同交接卡（纯呈现，props-only）。
// 从 HandoffCollab 拆出：容器负责取数（fetch /api/handoffs → props），本组件只管渲染——
// 使 agent-canvas 预览页可用夹具 props 复用同一呈现层，消除手抄克隆与视觉回归盲区（BL-FE-02）。

'use client';

import { useState } from 'react';
import { MdExpandMore, MdBolt } from 'react-icons/md';

export interface HandoffCardProps {
  fromName: string;
  toName: string;
  summary: string | null;
  artifactType: string | null;
  artifactRef: string | null;
  /** false = 静态展示（无展开交互、无 chevron），供确定性预览/截图 */
  collapsible?: boolean;
  defaultOpen?: boolean;
}

function HeaderContent({
  fromName,
  toName,
}: {
  fromName: string;
  toName: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-navy-700 dark:text-white">
      <span className="text-brand-600">{fromName}</span>
      <span className="text-gray-400">→</span>
      <span className="text-brand-600">{toName}</span>
    </span>
  );
}

export default function HandoffCard({
  fromName,
  toName,
  summary,
  artifactType,
  artifactRef,
  collapsible = true,
  defaultOpen = false,
}: HandoffCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <HeaderContent fromName={fromName} toName={toName} />
          <MdExpandMore
            size={16}
            className={`shrink-0 text-gray-400 transition ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      ) : (
        <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
          <HeaderContent fromName={fromName} toName={toName} />
        </div>
      )}
      {open && (
        <div className="border-t border-gray-100 px-3 py-2 dark:border-white/5">
          <div className="text-xs text-gray-600 dark:text-gray-300">
            {summary ?? '（无摘要）'}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-500">
            <MdBolt size={13} className="text-brand-500" />
            交接物：{artifactType ?? '—'}（{artifactRef ?? '—'}）
          </div>
        </div>
      )}
    </div>
  );
}
