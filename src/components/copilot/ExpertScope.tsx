// AGENT-FOUNDATION F007 — 专家 Agent 头：职责 + 否定式护栏卡（还原设计稿 .cop-scope）
//
// 对话面顶部常驻显示当前专家 duty + 隔离边界（AI 行为边界，D13 升级版「我不会替你做什么」）。
// 消费 F006 registry.personaBoundary（client-safe，无 prisma）。

'use client';

import { personaBoundary } from 'lib/agent/registry';

export default function ExpertScope({ agentId }: { agentId: string }) {
  const p = personaBoundary(agentId);
  if (!p) return null;
  return (
    <div className="rounded-2xl border-l-4 border-brand-500 bg-white px-3 py-2.5 shadow-sm dark:bg-navy-700">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        <span className="text-sm font-bold text-navy-700 dark:text-white">{p.name}</span>
        <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-400/10">
          {p.uiSyntax}
        </span>
      </div>
      <div className="mt-2 flex gap-2 text-xs">
        <span className="shrink-0 font-semibold text-gray-400">职责</span>
        <span className="text-gray-700 dark:text-gray-200">{p.duty}</span>
      </div>
      <div className="mt-1 flex gap-2 text-xs">
        <span className="shrink-0 font-semibold text-gray-400">隔离</span>
        <span className="text-gray-500 dark:text-gray-400">{p.isolation}</span>
      </div>
    </div>
  );
}
