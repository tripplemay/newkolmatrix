// M4.5-AGENT-LOOP F006 — 人格切换标注（P9：切换以流内 data part 事件表达）
//
// 循环内接力（handoff_to）发生时，服务端往 UI 流写一条 `data-persona_switch`；本组件把它
// 渲染成对话里的一行接手标注。**换人这件事必须在对话里看得见**——顶部专家卡悄悄换掉一个名字，
// 用户无从知道刚才那句话是谁说的、后面这句又是谁说的。
//
// 文案与 registry 同源（personaBoundary），前端不硬编码人格名。

'use client';

import { MdSwapHoriz } from 'react-icons/md';
import { personaBoundary } from 'lib/agent/registry';

/** 服务端 `data-persona_switch` 的载荷形状（route.ts 写入端同源）。 */
export interface PersonaSwitchData {
  from?: string;
  to?: string;
  atStep?: number;
  boundary?: { name?: string } | null;
}

export default function PersonaSwitchNote({
  data,
}: {
  data: PersonaSwitchData;
}) {
  const from = typeof data.from === 'string' ? personaBoundary(data.from) : null;
  const to = typeof data.to === 'string' ? personaBoundary(data.to) : null;
  if (!to) return null;
  return (
    <div
      data-testid="persona-switch-note"
      className="flex items-center gap-1.5 rounded-lg bg-lightPrimary px-3 py-2 text-micro font-semibold text-gray-600 dark:bg-navy-700 dark:text-gray-300"
    >
      <MdSwapHoriz size={14} className="shrink-0 text-brand-500" aria-hidden />
      <span>
        {from?.name ?? '上一位专家'} 已把这件事交接给 {to.name} 接手
      </span>
    </div>
  );
}
