// M2-A-MATCH F007 — Generative Canvas：match_plan → 对比矩阵简版卡（柱四）
//
// 消费 match_plan 工具输出（type:'match_plan'，ADR-28 结果 type 路由），渲染现行轮
// 组合的紧凑对比卡（沿 KolResultCards 先例：SurfaceCard 流 + brand 强调）。
// 完整对比矩阵在项目页 match 环节（F005）；此卡是对话面内的摘要形态。

'use client';

import { MdStar } from 'react-icons/md';
import Badge from 'components/common/Badge';
import SurfaceCard from 'components/common/SurfaceCard';
import { formatRisk, formatWan } from 'lib/display/match-format';
import type { MatchPlanOutput, MatchPlanSummary } from 'lib/agent/tools/match-plan';

export type { MatchPlanOutput };

const STATUS_LABEL: Record<string, string> = {
  draft: '现行草案',
  approved: '已批准',
  superseded: '已被取代',
};

function PlanCard({ plan }: { plan: MatchPlanSummary }) {
  const m = plan.metrics;
  return (
    <SurfaceCard interactive className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-bold text-navy-700 dark:text-white">
            <span className="truncate">{plan.name}</span>
            {plan.recommended && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-micro font-extrabold text-brand-500">
                <MdStar size={12} aria-hidden /> Agent 推荐
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-600">
            触达 {formatWan(m?.reachTotal ?? null)} · 风险{' '}
            {formatRisk(m?.risk ?? null)} · {m != null ? `${m.people} 人` : '—'}
          </div>
        </div>
        <Badge size="sm" shape="pill" className="shrink-0">
          {STATUS_LABEL[plan.status] ?? plan.status}
        </Badge>
      </div>
      <p className="mt-2 text-micro leading-4 text-gray-700 dark:text-gray-400">
        {plan.rationale}
      </p>
      {plan.members.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {plan.members.slice(0, 5).map((member) => (
            <span
              key={member.kolId}
              className="rounded-md bg-gray-100 px-1.5 py-0.5 text-mini font-medium text-gray-600 dark:bg-white/5 dark:text-gray-300"
            >
              {member.name ?? '（未命名）'} · {Math.round(member.matchScore * 100)}%
            </span>
          ))}
          {plan.members.length > 5 && (
            <span className="text-mini text-gray-400">
              +{plan.members.length - 5}
            </span>
          )}
        </div>
      )}
    </SurfaceCard>
  );
}

export default function MatchPlanCard({ output }: { output: MatchPlanOutput }) {
  if (!output.found) {
    return <div className="text-xs text-gray-600">未找到该项目。</div>;
  }
  if (output.plans.length === 0) {
    return (
      <div className="text-xs text-gray-600">
        「{output.projectName}」还没有组合方案——进入匹配环节后由匹配 Agent
        自动筛查生成。
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="text-micro font-semibold uppercase tracking-wide text-gray-400">
        「{output.projectName}」现行组合 · {output.plans.length} 组
      </div>
      {output.plans.map((plan) => (
        <PlanCard key={plan.id} plan={plan} />
      ))}
    </div>
  );
}
