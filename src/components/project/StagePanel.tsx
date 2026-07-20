// AGENT-FOUNDATION F008 — stagePanel：环节唯一渲染入口（D22）
//
// 五环节（Brief/Match/Reach/Delivery/Insight）只经此组件渲染——「stagePanel 是环节唯一渲染入口」。
// 每环节绑定对应专家 Agent（复用 F006 STAGE_AGENT + registry 人格）。
// 业务内容（真实环节工作台）→ M1-M4；本批渲染环节专家职责 + 界面语法占位。

'use client';

import Card from 'components/card';
import { STAGE_AGENT, STAGE_LABEL, type Stage } from 'lib/agent/stage-routing';
import { getPersona } from 'lib/agent/registry';

export default function StagePanel({ stage }: { stage: Stage }) {
  const persona = getPersona(STAGE_AGENT[stage]);
  return (
    <Card extra="!p-6 mt-4">
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-brand-500 px-2.5 py-1 text-xs font-bold text-white">
          {STAGE_LABEL[stage]} 环节
        </span>
        <span className="text-sm font-semibold text-navy-700 dark:text-white">
          {persona.name}
        </span>
        <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-400/10">
          {persona.uiSyntax}
        </span>
      </div>
      <div className="mt-4 grid gap-3 text-sm">
        <div className="flex gap-2">
          <span className="shrink-0 font-semibold text-gray-400">本环节专家职责</span>
          <span className="text-gray-700 dark:text-gray-200">{persona.duty}</span>
        </div>
        <div className="flex gap-2">
          <span className="shrink-0 font-semibold text-gray-400">边界</span>
          <span className="text-gray-500 dark:text-gray-400">{persona.isolation}</span>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-white/10">
        {STAGE_LABEL[stage]} 环节工作台（{persona.uiSyntax}）落地 → M1-M4。
        <br />
        右侧 Copilot 已切到「{persona.name}」，可直接对话推进本环节。
      </div>
    </Card>
  );
}
