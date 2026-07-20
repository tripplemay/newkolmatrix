// AGENT-FOUNDATION F007 — 专家 Agent 头：职责 + 否定式护栏卡（还原设计稿 .cop-scope）
//
// 对话面顶部常驻显示当前专家 duty + isolation 边界（AI 行为边界，D13 升级版「我不会替你做什么」）。
// 消费 F006 registry.personaBoundary（client-safe，无 prisma）。
// FE-REFACTOR F001：徽标/定义行收敛为 common 组件；术语统一 duty=「职责」isolation=「边界」。

'use client';

import { personaBoundary } from 'lib/agent/registry';
import Badge from 'components/common/Badge';
import DefinitionRow from 'components/common/DefinitionRow';
import SurfaceCard from 'components/common/SurfaceCard';

export default function ExpertScope({ agentId }: { agentId: string }) {
  const p = personaBoundary(agentId);
  if (!p) return null;
  return (
    <SurfaceCard className="border-l-4 border-l-brand-500 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
        <span className="text-sm font-bold text-navy-700 dark:text-white">
          {p.name}
        </span>
        <Badge>{p.uiSyntax}</Badge>
      </div>
      <DefinitionRow label="职责" className="mt-2 text-xs">
        {p.duty}
      </DefinitionRow>
      <DefinitionRow label="边界" tone="muted" className="mt-1 text-xs">
        {p.isolation}
      </DefinitionRow>
    </SurfaceCard>
  );
}
