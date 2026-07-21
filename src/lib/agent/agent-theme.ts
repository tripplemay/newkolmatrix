// ARCH-M05 F003 — Agent 主题色本地色表（原型 interaction-prototype-v2.html L1008-1016 AGENTS.c / en）。
// spec S3-1：cop-head 渐变随专家主题色——registry 只读消费，不把展示色写进 registry（保持柱一纯净）。
// client-safe：无 prisma / 无服务端依赖。

import type { AgentId } from './registry';

export interface AgentTheme {
  /** 专家主题色（原型 AGENTS.c） */
  color: string;
  /** 英文名（副标题用，原型 AGENTS.en） */
  en: string;
}

export const AGENT_THEME: Record<AgentId, AgentTheme> = {
  orchestrator: { color: '#422AFB', en: 'Orchestrator' },
  strategy: { color: '#422AFB', en: 'Strategy' },
  match: { color: '#01B574', en: 'Match' },
  reach: { color: '#FF9B05', en: 'Outreach' },
  delivery: { color: '#3965FF', en: 'Delivery' },
  insight: { color: '#7551FF', en: 'Insight' },
  compliance: { color: '#E31A1A', en: 'Compliance' },
};

export function agentTheme(id: AgentId): AgentTheme {
  return AGENT_THEME[id];
}
