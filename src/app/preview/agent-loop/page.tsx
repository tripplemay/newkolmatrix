// M4.5-AGENT-LOOP F006 — 循环放开面的视觉基线预览页（确定性，不接活 LLM/DB）
//
// 沿 /preview/agent-canvas 先例：用固定夹具还原本批新增的对话面构件，供
// tests/visual/agent-loop.spec.ts 截确定性基线（浅色，viewport ≥1440px）。
// 独立路由、不套 admin 外壳（无侧栏 / 无活的 Copilot），保证像素确定。
//
// 为什么不并进 agent-canvas 页：那张基线是 `fullPage:false` 的视口截图，新卡会落在折叠线
// 以下——并进去等于「基线更新了但新卡一个像素也没被守住」。独立页才有真实覆盖。

'use client';

import ChatBubble from 'components/common/ChatBubble';
import PanelHeader from 'components/common/PanelHeader';
import ExpertScope from 'components/copilot/ExpertScope';
import PersonaSwitchNote from 'components/copilot/PersonaSwitchNote';
import PlanCard from 'components/copilot/canvas/PlanCard';
import PlanCardDraft from 'components/copilot/canvas/PlanCardDraft';
import ConsultationNote from 'components/copilot/canvas/ConsultationNote';
import PendingBatchCard from 'components/common/PendingBatchCard';
import {
  PENDING_BATCH_FIXTURE,
  PERSONA_SWITCH_FIXTURE,
  PLAN_DRAFT_FIXTURE,
  PLAN_FIXTURE,
} from './fixture';

export default function AgentLoopPreview() {
  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-[420px]">
        <PanelHeader
          className="mb-3"
          title="Copilot · 循环放开面"
          subtitle="M4.5 产物：行动计划卡（认可只留痕）+ 循环内接力标注（边界卡随之切换）+ 批量备好聚合确认面；计划卡含渐进态与最终态两形态"
        />

        {/* 起始人格边界卡 */}
        <ExpertScope agentId="orchestrator" />

        <div className="mt-3 space-y-3">
          <ChatBubble role="user">
            把这季度的复盘和对外分享安排一下
          </ChatBubble>

          {/* F008（裁决 C）：计划卡的渐进态——模型正在逐条写 items 时的形态 */}
          <PlanCardDraft input={PLAN_DRAFT_FIXTURE} />

          {/* F004：行动计划卡最终态（propose_plan → type:'action_plan' 画布路由） */}
          <PlanCard output={PLAN_FIXTURE} />

          {/* F006：循环内接力的流内标注 + 边界卡切到目标人格 */}
          <PersonaSwitchNote data={PERSONA_SWITCH_FIXTURE} />
          <ExpertScope agentId={PERSONA_SWITCH_FIXTURE.to as string} />

          <ChatBubble role="agent">
            我按你的洞察范围重新读了数据：本期分子无回传源，ROI 算不出来，已如实标注。
          </ChatBubble>

          {/* M4.7 F008：咨询痕迹三态。**收起态就要看得见"不完整"**——
              展开才说等于没说（用户不会逐条点开） */}
          <ConsultationNote
            output={{
              type: 'consultation',
              ok: true,
              agentId: 'match',
              answer: 'B 组受众重合度最高。',
              toolNames: ['match_plan', 'evaluate_creator'],
              steps: 2,
              budgetHit: false,
              insufficientEvidence: false,
              insufficientReasons: [],
            }}
          />
          <ConsultationNote
            output={{
              type: 'consultation',
              ok: true,
              agentId: 'insight',
              answer: '本期分子无回传源，ROI 算不出来。',
              toolNames: ['compute_roi'],
              steps: 2,
              budgetHit: false,
              insufficientEvidence: true,
              insufficientReasons: ['conversions: NO_CONVERSION_SOURCE'],
            }}
          />
          <ConsultationNote
            output={{
              type: 'consultation',
              ok: false,
              failureReason: '网关超时',
              agentId: 'compliance',
              answer: '',
              toolNames: [],
              steps: 0,
              budgetHit: false,
              insufficientEvidence: false,
              insufficientReasons: [],
            }}
          />

          {/* F007：批量备好聚合确认面（利害逐条列全，不折叠） */}
          <PendingBatchCard items={PENDING_BATCH_FIXTURE} />
        </div>
      </div>
    </div>
  );
}
