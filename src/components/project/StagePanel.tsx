// AGENT-FOUNDATION F008 — stagePanel：环节唯一渲染入口（D22）
//
// 五环节（Brief/Match/Reach/Delivery/Insight）只经此组件渲染——「stagePanel 是环节唯一渲染入口」。
// 每环节绑定对应专家 Agent（复用 F006 STAGE_AGENT + registry 人格）。
// 业务内容（真实环节工作台）→ M1-M4；本批渲染环节专家职责 + 界面语法占位。
// FE-REFACTOR F001：徽标/定义行收敛为 common 组件；术语统一 duty=「职责」isolation=「边界」。

'use client';

import Card from 'components/card';
import Badge from 'components/common/Badge';
import DefinitionRow from 'components/common/DefinitionRow';
import { STAGE_AGENT, STAGE_LABEL, type Stage } from 'lib/agent/stage-routing';
import { getPersona } from 'lib/agent/registry';

export default function StagePanel({ stage }: { stage: Stage }) {
  const persona = getPersona(STAGE_AGENT[stage]);
  return (
    <Card extra="!p-6 mt-4">
      <div className="flex items-center gap-2">
        <Badge variant="solid" size="sm">
          {STAGE_LABEL[stage]} 环节
        </Badge>
        <span className="text-sm font-semibold text-navy-700 dark:text-white">
          {persona.name}
        </span>
        <Badge>{persona.uiSyntax}</Badge>
      </div>
      <div className="mt-4 grid gap-3 text-sm">
        <DefinitionRow label="职责">{persona.duty}</DefinitionRow>
        <DefinitionRow label="边界" tone="muted">
          {persona.isolation}
        </DefinitionRow>
      </div>
      <div className="mt-5 rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-white/10">
        {STAGE_LABEL[stage]} 环节工作台（{persona.uiSyntax}）落地 → M1-M4。
        <br />
        右侧 Copilot 已切到「{persona.name}」，可直接对话推进本环节。
      </div>
    </Card>
  );
}
