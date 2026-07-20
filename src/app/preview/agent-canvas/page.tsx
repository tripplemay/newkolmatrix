// AGENT-FOUNDATION F010 — Generative Canvas 视觉基线预览页（确定性，不接活 LLM/DB）
//
// 用固定夹具还原 hello-agent 端到端产物的「画布」形态：专家头（柱三 ExpertScope）+ 消息气泡 +
// search_kols → KOL 卡片流（柱四 canvas-registry/KolResultCards）+ 一次协同交接（柱二编排 handoff）。
// 供 tests/visual/agent-canvas.spec.ts 截确定性基线（浅色，viewport ≥1440px）。
// 独立路由，不套 admin 外壳（无侧栏/活的 Copilot），保证像素确定。

'use client';

import { MdGroups, MdBolt } from 'react-icons/md';
import ChatBubble from 'components/common/ChatBubble';
import PanelHeader from 'components/common/PanelHeader';
import SectionLabel from 'components/common/SectionLabel';
import ExpertScope from 'components/copilot/ExpertScope';
import KolResultCards from 'components/copilot/canvas/KolResultCards';
import { personaBoundary } from 'lib/agent/registry';
import { CANVAS_FIXTURE, HANDOFF_FIXTURE } from './fixture';

function StaticHandoffCard() {
  const from =
    personaBoundary(HANDOFF_FIXTURE.fromAgent)?.name ??
    HANDOFF_FIXTURE.fromAgent;
  const to =
    personaBoundary(HANDOFF_FIXTURE.toAgent)?.name ?? HANDOFF_FIXTURE.toAgent;
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <SectionLabel className="mb-2">
        <MdGroups size={15} className="text-brand-500" />
        协同交接 · 多 Agent 联动 · 点开看交接
      </SectionLabel>
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex w-full items-center justify-between gap-2 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-navy-700">
            <span className="text-brand-600">{from}</span>
            <span className="text-gray-400">→</span>
            <span className="text-brand-600">{to}</span>
          </span>
        </div>
        <div className="border-t border-gray-100 px-3 py-2">
          <div className="text-xs text-gray-600">{HANDOFF_FIXTURE.summary}</div>
          <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-500">
            <MdBolt size={13} className="text-brand-500" />
            交接物：{HANDOFF_FIXTURE.artifactType}（
            {HANDOFF_FIXTURE.artifactRef}）
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentCanvasPreview() {
  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-[420px]">
        <PanelHeader
          className="mb-3"
          title="Copilot · 多 Agent 编队"
          subtitle="hello-agent 端到端产物：自然语言 → search_kols → KOL 卡片流 → 一次协同交接"
        />

        {/* 柱三：专家 Agent 头（duty + 否定式护栏） */}
        <ExpertScope agentId="match" />

        {/* 消息流：用户指令 + 专家应答（FE-REFACTOR F001：复用真实 ChatBubble，与生产同一呈现层） */}
        <div className="mt-3 space-y-3">
          <ChatBubble role="user">
            找《坦克世界》题材的游戏解说 KOL，给我候选
          </ChatBubble>
          <ChatBubble role="agent">
            已按受众与题材从创作者库匹配到 3 位候选，按匹配度排序如下：
          </ChatBubble>

          {/* 柱四：generative canvas —— search_kols → KOL 卡片流 */}
          <KolResultCards output={CANVAS_FIXTURE} />

          {/* 柱二编排：一次协同交接可视化（match → reach） */}
          <StaticHandoffCard />
        </div>
      </div>
    </div>
  );
}
