// AGENT-FOUNDATION F007 — 协同交接可视化（还原设计稿 .collab）
//
// 以「A→B」呈现 F006 的 handoff：可展开看交接对 / 摘要 / 交接物（FR-9.5）。
// 数据来自 GET /api/handoffs（落 F002 Handoff 表的真实交接）。
// FE-REFACTOR F003：容器/呈现拆分——本组件只负责取数与列表编排，单卡呈现在 common/HandoffCard。

'use client';

import { useEffect, useState } from 'react';
import { MdGroups } from 'react-icons/md';
import HandoffCard from 'components/common/HandoffCard';
import SectionLabel from 'components/common/SectionLabel';
import SurfaceCard from 'components/common/SurfaceCard';
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
    <SurfaceCard className="p-3">
      <SectionLabel className="mb-2">
        <MdGroups size={15} className="text-brand-500" />
        协同交接 · 多 Agent 联动 · 点开看交接
      </SectionLabel>
      <div className="flex flex-col gap-1.5">
        {handoffs.slice(0, 5).map((h) => (
          <HandoffCard
            key={h.id}
            fromName={agentName(h.fromAgent)}
            toName={agentName(h.toAgent)}
            summary={h.summary}
            artifactType={h.artifactType}
            artifactRef={h.artifactRef}
          />
        ))}
      </div>
    </SurfaceCard>
  );
}
