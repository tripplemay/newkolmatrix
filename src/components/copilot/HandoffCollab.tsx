// AGENT-FOUNDATION F007 — 协同交接可视化（还原设计稿 .collab）
//
// 以「A→B」呈现 F006 的 handoff：可展开看交接对 / 摘要 / 交接物（FR-9.5）。
// 数据来自 GET /api/handoffs（落 F002 Handoff 表的真实交接）。

'use client';

import { useEffect, useState } from 'react';
import { MdGroups, MdExpandMore, MdBolt } from 'react-icons/md';
import SectionLabel from 'components/common/SectionLabel';
import { personaBoundary } from 'lib/agent/registry';

interface HandoffRow {
  id: string;
  fromAgent: string;
  toAgent: string;
  artifactType: string | null;
  artifactRef: string | null;
  summary: string | null;
  createdAt: string;
}

function agentName(id: string): string {
  return personaBoundary(id)?.name ?? id;
}

function HandoffItem({ h }: { h: HandoffRow }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-navy-700 dark:text-white">
          <span className="text-brand-600">{agentName(h.fromAgent)}</span>
          <span className="text-gray-400">→</span>
          <span className="text-brand-600">{agentName(h.toAgent)}</span>
        </span>
        <MdExpandMore
          size={16}
          className={`shrink-0 text-gray-400 transition ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="border-t border-gray-100 px-3 py-2 dark:border-white/5">
          <div className="text-xs text-gray-600 dark:text-gray-300">
            {h.summary ?? '（无摘要）'}
          </div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-500">
            <MdBolt size={13} className="text-brand-500" />
            交接物：{h.artifactType ?? '—'}（{h.artifactRef ?? '—'}）
          </div>
        </div>
      )}
    </div>
  );
}

export default function HandoffCollab() {
  const [handoffs, setHandoffs] = useState<HandoffRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/handoffs')
      .then((r) => (r.ok ? r.json() : { handoffs: [] as HandoffRow[] }))
      .then((d: { handoffs?: HandoffRow[] }) => {
        if (alive) setHandoffs(d.handoffs ?? []);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  if (!loaded || handoffs.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-navy-700">
      <SectionLabel className="mb-2">
        <MdGroups size={15} className="text-brand-500" />
        协同交接 · 多 Agent 联动 · 点开看交接
      </SectionLabel>
      <div className="flex flex-col gap-1.5">
        {handoffs.slice(0, 5).map((h) => (
          <HandoffItem key={h.id} h={h} />
        ))}
      </div>
    </div>
  );
}
