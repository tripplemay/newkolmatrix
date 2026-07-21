// AGENT-FOUNDATION F007 — 协同交接可视化（还原设计稿 .collab）
//
// 以「A↔B」呈现 F006 的 handoff：可展开看交接对 / 逐轮台词 / 交接物 / 结论（FR-9.5）。
// 数据来自 GET /api/handoffs（落 F002 Handoff 表的真实交接）。
// FE-REFACTOR F003：容器/呈现拆分——本组件只负责取数与列表编排，单卡呈现在 common/HandoffCard。
// ARCH-M05 F003 升级（S3-9~13）：虚线框容器；stage 上下文注入原型 COLLAB mock（逐轮台词/交接物/绿色结论）；
// 真实 handoff 行按交接对补 mock 台词（M1+ 由 handoff 表真实台词替换）。

'use client';

import { useEffect, useState } from 'react';
import { MdGroups } from 'react-icons/md';
import HandoffCard, { type HandoffTurn } from 'components/common/HandoffCard';
import SectionLabel from 'components/common/SectionLabel';
import SurfaceCard from 'components/common/SurfaceCard';
import { isAgentId, personaBoundary } from 'lib/agent/registry';
import { AGENT_THEME } from 'lib/agent/agent-theme';
import { COLLAB_MOCK, findCollabMockByPair, type CollabMock } from './mock';

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

function agentColor(id: string): string | undefined {
  return isAgentId(id) ? AGENT_THEME[id].color : undefined;
}

function mockTurns(m: CollabMock): HandoffTurn[] {
  return m.turns.map((t) => ({
    name: agentName(t.from),
    color: AGENT_THEME[t.from].color,
    text: t.text,
  }));
}

export default function HandoffCollab({
  stage = null,
}: {
  /** 项目详情环节（?stage=）；命中原型 COLLAB mock 时展示本环节协同（ARCH-M05 mock） */
  stage?: string | null;
}) {
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

  const mocks = (stage && COLLAB_MOCK[stage]) || [];
  if (mocks.length === 0 && (!loaded || handoffs.length === 0)) return null;

  return (
    <SurfaceCard className="border-dashed p-3">
      <SectionLabel className="mb-2">
        <MdGroups size={15} className="text-brand-500" />
        {stage
          ? '本环节协同 · 多 Agent 联动 · 点开看交接'
          : '协同交接 · 多 Agent 联动 · 点开看交接'}
      </SectionLabel>
      <div className="flex flex-col gap-1.5">
        {mocks.map((m, i) => (
          <HandoffCard
            key={`mock-${stage}-${i}`}
            fromName={agentName(m.a)}
            toName={agentName(m.b)}
            fromColor={AGENT_THEME[m.a].color}
            toColor={AGENT_THEME[m.b].color}
            summary={m.title}
            artifactType={null}
            artifactRef={null}
            turns={mockTurns(m)}
            payload={m.payload}
            outcome={m.outcome}
          />
        ))}
        {handoffs.slice(0, 5).map((h) => {
          // ARCH-M05 mock：真实 handoff 行按交接对补逐轮台词；无对应 mock 时保持旧形态
          const pairMock = findCollabMockByPair(h.fromAgent, h.toAgent);
          return (
            <HandoffCard
              key={h.id}
              fromName={agentName(h.fromAgent)}
              toName={agentName(h.toAgent)}
              fromColor={agentColor(h.fromAgent)}
              toColor={agentColor(h.toAgent)}
              summary={h.summary ?? pairMock?.title ?? null}
              artifactType={h.artifactType}
              artifactRef={h.artifactRef}
              turns={pairMock ? mockTurns(pairMock) : undefined}
              payload={pairMock?.payload}
              outcome={pairMock?.outcome}
            />
          );
        })}
      </div>
    </SurfaceCard>
  );
}
