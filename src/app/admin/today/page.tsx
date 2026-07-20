// AGENT-FOUNDATION F008 — 今天（驾驶舱/雷达，编排 Agent 当值）
//
// 待办雷达：直达「某项目的某环节」——复用 F006 orchestrator routeToStage 环节路由。
'use client';

import Link from 'next/link';
import Card from 'components/card';
import { MdBolt, MdChevronRight } from 'react-icons/md';
import { routeToStage, STAGE_LABEL, type Stage } from 'lib/agent/stage-routing';
import { getPersona } from 'lib/agent/registry';

// 待办：项目 + 环节（真实待办 → M3 闸门/信号）。用 routeToStage 生成直达目标。
const TODOS: Array<{ projectId: string; project: string; stage: Stage; note: string }> = [
  { projectId: 'starlight-protocol', project: '《星轨协议》', stage: 'reach', note: '12 封邀约待确认（对外·不可撤销）' },
  { projectId: 'nebula-drift', project: '《星云漂流》', stage: 'match', note: '组合态方案待复核' },
  { projectId: 'iron-vanguard', project: '《钢铁先锋》', stage: 'insight', note: 'ROI 归因周报待采纳' },
];

function TodoRow({ projectId, project, stage, note }: (typeof TODOS)[number]) {
  const target = routeToStage(projectId, stage); // 复用 F006 环节路由
  const persona = getPersona(target.agentId);
  const href = `${target.route}?stage=${target.stage}`;
  return (
    <Link href={href}>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 transition hover:border-brand-200 hover:shadow-md dark:border-white/5 dark:bg-navy-700">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-bold text-navy-700 dark:text-white">
            {project}
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-400/10">
              {STAGE_LABEL[stage]} 环节 · {persona.name}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-500">{note}</div>
        </div>
        <MdChevronRight className="shrink-0 text-gray-300" size={20} />
      </div>
    </Link>
  );
}

export default function TodayPage() {
  return (
    <div className="mt-3">
      <h1 className="mb-1 text-2xl font-bold text-navy-700 dark:text-white">今天</h1>
      <p className="mb-4 text-sm text-gray-500">编排 Agent 当值 · 需要你拍板的事项 · 点卡直落某项目的某环节</p>
      <Card extra="!p-5">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-500">
          <MdBolt className="text-brand-500" /> 需要你确认
        </div>
        <div className="grid gap-2.5">
          {TODOS.map((t) => (
            <TodoRow key={`${t.projectId}-${t.stage}`} {...t} />
          ))}
        </div>
      </Card>
    </div>
  );
}
