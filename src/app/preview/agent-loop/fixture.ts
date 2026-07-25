// M4.5-AGENT-LOOP F006 — agent-loop 视觉基线的确定性夹具
//
// 静态载荷（形状 = 各 feature 的真实产物类型），供 /preview/agent-loop 渲染。
// 视觉基线须确定性（不接活的 LLM/DB）——故用固定夹具，与 agent-canvas 基线同理。
// 数据虚构、仅供截图，不入库。

import type { ProposePlanOutput } from 'lib/agent/tools/propose-plan';
import type { PersonaSwitchData } from 'components/copilot/PersonaSwitchNote';

/** F004 行动计划卡：三步计划，含一条模型低报闸门的步骤（服务端已强制标出）。 */
export const PLAN_FIXTURE: ProposePlanOutput = {
  type: 'action_plan',
  planId: 'fx-plan-1',
  title: '本季度复盘与对外分享',
  projectId: 'fx-proj-1',
  items: [
    {
      title: '先算一遍跨项目 ROI，找出证据缺口',
      toolName: 'compute_roi_portfolio',
      needsGate: false,
      gateUnderreported: false,
      toolKnown: true,
      note: null,
    },
    {
      title: '按缺口起草季度复盘周报',
      toolName: 'draft_report',
      needsGate: false,
      gateUnderreported: false,
      toolKnown: true,
      note: '只落草案，不采纳',
    },
    {
      title: '生成对外分享链接',
      toolName: 'create_share_link',
      needsGate: true,
      gateUnderreported: true, // 模型曾声明不需确认——服务端复核后强制标出
      toolKnown: true,
      note: '链接一经生成即暴露',
    },
  ],
  needsGateCount: 1,
  disclosure:
    '这是一份计划，还没有执行任何一步。标了「需你确认」的动作会逐个停在你面前等你拍板——认可这份计划只是留个痕，不会替你确认任何一步。',
  createdAt: '2026-07-25T00:00:00.000Z',
};

/** F006 循环内接力：编排 → 洞察。 */
export const PERSONA_SWITCH_FIXTURE: PersonaSwitchData = {
  from: 'orchestrator',
  to: 'insight',
  atStep: 1,
};
