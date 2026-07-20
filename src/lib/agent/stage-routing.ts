// AGENT-FOUNDATION F006/F008 — 环节路由纯函数（client-safe，无 prisma）
//
// 从 orchestrator.ts 抽出的纯路由逻辑：项目内五环节 ↔ 目标 copilot context。
// 独立成 client-safe 模块，供 orchestrator（服务端）与 IA 页面（客户端，F008 今天待办直达）共用。

import type { CopilotContext, CopilotEnv } from './persona-router';
import type { AgentId } from './registry';

/** 项目内五环节（时间维；D22：只存在于项目空间内部）。 */
export type Stage = 'brief' | 'match' | 'reach' | 'delivery' | 'insight';

export const STAGE_AGENT: Record<Stage, AgentId> = {
  brief: 'strategy',
  match: 'match',
  reach: 'reach',
  delivery: 'delivery',
  insight: 'insight',
};

export const STAGES: Stage[] = ['brief', 'match', 'reach', 'delivery', 'insight'];

/** 环节中文名（界面显示）。 */
export const STAGE_LABEL: Record<Stage, string> = {
  brief: 'Brief',
  match: 'Match',
  reach: 'Reach',
  delivery: 'Delivery',
  insight: 'Insight',
};

export function isStage(x: string): x is Stage {
  return (STAGES as string[]).includes(x);
}

/** 环节路由结果 = 一个可用于初始化 useChat 的目标 copilot context（+ stage 元信息）。 */
export interface StageTarget extends CopilotContext {
  stage: Stage;
}

/** 路由到「某项目的某环节」：stagePanel 是环节唯一渲染入口（D22）。 */
export function routeToStage(
  projectId: string,
  stage: Stage,
  env: CopilotEnv = 'default',
): StageTarget {
  return {
    route: `/admin/campaigns/${projectId}`,
    projectId,
    env,
    agentId: STAGE_AGENT[stage],
    stage,
  };
}

/**
 * 解析 orchestrator 指令。
 * - `enter:<projectId>:<stage>` → 进入某项目某环节（返回 StageTarget）
 * - `pick:<...>` / `env:<...>` → EXTENSION POINT（本批识别但只做最小处理）
 */
export function parseOrchestratorDirective(directive: string): StageTarget | null {
  const [verb, ...rest] = directive.split(':');
  if (verb === 'enter' && rest.length >= 2) {
    const [projectId, stage] = rest;
    if (isStage(stage)) return routeToStage(projectId, stage);
  }
  return null;
}
