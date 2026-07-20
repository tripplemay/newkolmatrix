// AGENT-FOUNDATION F006 — persona router
//
// 按 copilot context（route + env + agentId）选人格并收窄工具子集，注入 F005 的 streamText runtime。
// 单一 /api/agent 承载所有专家，不起独立进程（PRD §12.6 / FR-12.1）——路由只换人格 + 工具子集，不换端点。
//
// 【框架焊死】context key 格式、selectPersona 机制、工具子集收窄机制稳定。
// 【EXTENSION POINT】defaultAgentForRoute 的 route→agent 映射精度随 IA（F008）真实路由充实。

import { DEFAULT_AGENT_ID, getPersona, isAgentId, type AgentId, type AgentPersona } from './registry';

export type CopilotEnv = 'default' | 'sandbox' | 'production';

/** copilot 上下文（架构稿 §4.3）。React 层以完整 key 初始化 useChat；服务端仍须校验，不信任客户端范围。 */
export interface CopilotContext {
  route: string;
  projectId: string | null;
  env: CopilotEnv;
  agentId: AgentId;
}

/** context key：route:projectId:env:agentId（架构稿 §4.3）。projectId 为空用 '-'。 */
export type CopilotContextKey = string;

export function buildContextKey(ctx: CopilotContext): CopilotContextKey {
  return `${ctx.route}:${ctx.projectId ?? '-'}:${ctx.env}:${ctx.agentId}`;
}

const ENVS: CopilotEnv[] = ['default', 'sandbox', 'production'];

export function parseContextKey(key: CopilotContextKey): CopilotContext {
  const parts = key.split(':');
  if (parts.length !== 4) {
    throw new Error(`[persona-router] 非法 context key（需 route:projectId:env:agentId）: ${key}`);
  }
  const [route, projectId, env, agentId] = parts;
  if (!ENVS.includes(env as CopilotEnv)) throw new Error(`[persona-router] 非法 env: ${env}`);
  if (!isAgentId(agentId)) throw new Error(`[persona-router] 非法 agentId: ${agentId}`);
  return {
    route,
    projectId: projectId === '-' ? null : projectId,
    env: env as CopilotEnv,
    agentId,
  };
}

/**
 * route → 默认人格映射。IA（侧栏 4 项 + 项目内五环节，D21/D22）真实路由落地后在此充实。
 * EXTENSION POINT：本批给最小映射，覆盖最小跑通验证需要的路由。
 */
export function defaultAgentForRoute(route: string): AgentId {
  if (route.includes('/creators') || route.includes('/discovery') || route.includes('/match')) return 'match';
  if (route.includes('/knowledge') || route.includes('/brief') || route.includes('/strategy')) return 'strategy';
  if (route.includes('/reach')) return 'reach';
  if (route.includes('/delivery')) return 'delivery';
  if (route.includes('/insight')) return 'insight';
  return DEFAULT_AGENT_ID; // 工作区层 → orchestrator
}

/** 选人格（校验 agentId）。 */
export function selectPersona(ctx: CopilotContext): AgentPersona {
  return getPersona(ctx.agentId);
}

/** 收窄工具子集 = 该人格绑定的工具名（F005 toAiSdkTools 消费）。 */
export function personaToolSubset(persona: AgentPersona): string[] {
  return persona.tools;
}
