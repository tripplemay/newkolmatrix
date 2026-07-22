'use client';
// ARCH-M05 F003 — Agent 编队花名册（裁决 #7：单组件 variant 'grid' | 'compact'，同一数据源两种密度）。
// - grid：today 页 6 元卡片网格（原型 .sqcard，F006 消费）
// - compact：Copilot 面板内嵌紧凑名册（原型 .squad-c，仅编排上下文，S3-7 🔒）
// 数据 = registry 6 位专家人格（编排 Agent 自身不进名册）+ mock now/status。

import { MdAutoAwesome } from 'react-icons/md';
import { personaBoundary, type AgentId } from 'lib/agent/registry';
import { AGENT_THEME } from 'lib/agent/agent-theme';
import SurfaceCard from './SurfaceCard';
// M1-C F003：AGENT_ICONS 迁出至 server-safe 单点（agent-icons.ts）——RSC 无法从
// 'use client' 模块 import 非组件导出。此处保留 re-export，既有 client 消费方
//（CopilotPanel 等）零改动。
import { AGENT_ICONS } from './agent-icons';

export { AGENT_ICONS };

export interface SquadMember {
  agentId: AgentId;
  /** 当前在做什么（一句话） */
  now: string;
  /** 状态短语（运行中 / 待确认 / 待采纳…） */
  status: string;
}

// ARCH-M05 mock — 原型 ROSTER（L1018-1022）静态编队状态；M1 起由 Agent 运行时喂真值。
export const SQUAD_MOCK: SquadMember[] = [
  { agentId: 'strategy', now: '监测 4 个项目健康度', status: '运行中' },
  { agentId: 'match', now: '为料理次元筛 3 组方案', status: '待确认' },
  { agentId: 'reach', now: '起草 12 封邀约', status: '待确认' },
  { agentId: 'delivery', now: '核对 5 笔交付条件', status: '待确认' },
  { agentId: 'insight', now: '生成萌宠农场复盘', status: '待采纳' },
  { agentId: 'compliance', now: '巡检全部内容 #ad 披露', status: '运行中' },
];

export interface AgentSquadProps {
  variant: 'grid' | 'compact';
  members?: SquadMember[];
  className?: string;
}

function CompactRoster({ members }: { members: SquadMember[] }) {
  return (
    <SurfaceCard className="px-4 py-3">
      <div className="mb-1 text-micro font-bold uppercase tracking-wide text-gray-400">
        Agent 编队 · 各司其职
      </div>
      {members.map((m) => {
        const p = personaBoundary(m.agentId);
        const theme = AGENT_THEME[m.agentId];
        if (!p) return null;
        return (
          <div
            key={m.agentId}
            className="flex items-center gap-2 border-t border-gray-100 py-2 text-xs first:border-t-0 dark:border-white/10"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: theme.color }}
            />
            <b className="shrink-0 font-bold text-navy-700 dark:text-white">
              {p.name}
            </b>
            <span className="min-w-0 flex-1 truncate text-micro text-gray-600 dark:text-gray-400">
              {m.now}
            </span>
            <span className="shrink-0 text-mini font-bold text-brand-500 dark:text-brand-400">
              {m.status}
            </span>
          </div>
        );
      })}
    </SurfaceCard>
  );
}

function GridRoster({ members }: { members: SquadMember[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {members.map((m) => {
        const p = personaBoundary(m.agentId);
        const theme = AGENT_THEME[m.agentId];
        const Icon = AGENT_ICONS[m.agentId];
        if (!p) return null;
        return (
          <SurfaceCard key={m.agentId} className="flex gap-3.5 p-5">
            <span
              className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px]"
              style={{
                backgroundColor: `${theme.color}1A`,
                color: theme.color,
              }}
            >
              <Icon size={22} />
            </span>
            <div className="min-w-0">
              <b className="block text-sm font-bold text-navy-700 dark:text-white">
                {p.name}
              </b>
              <div className="mt-1 text-micro leading-normal text-gray-600 dark:text-gray-400">
                {p.duty}
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 text-micro text-brand-500 dark:text-brand-400">
                <MdAutoAwesome size={13} className="shrink-0" />
                <span className="truncate">
                  {m.now} · {m.status}
                </span>
              </div>
            </div>
          </SurfaceCard>
        );
      })}
    </div>
  );
}

export default function AgentSquad({
  variant,
  members = SQUAD_MOCK,
  className,
}: AgentSquadProps) {
  const body =
    variant === 'compact' ? (
      <CompactRoster members={members} />
    ) : (
      <GridRoster members={members} />
    );
  if (!className) return body;
  return <div className={className}>{body}</div>;
}
