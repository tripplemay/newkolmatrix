// AGENT-FOUNDATION F006 — orchestrator 调度骨架
//
// 两件事：
// (1) 环节路由：把「进入某项目的某环节」表达为一个目标 copilot context（route+projectId+env+agentId）。
//     指令语法 enter:/pick:/env:（工作区待办直达某项目某环节，F008 驾驶舱复用）。
// (2) pending 聚合接口：聚合待拍板事项（F002 PendingAction），**原样返回、不改写/软化任何专家结论**
//     （FR-9.6 / 独立性铁则的编排侧体现——编排只汇总，不篡改闸门与专家判定）。
//
// 【框架焊死】环节路由指令格式、目标 context 结构、聚合接口签名稳定。
// 【EXTENSION POINT】pick:/env: 完整语义、聚合排序规则、compliance 跨环节调用点——最小实现，随 M1-M4 充实。

import { prisma } from 'lib/db/prisma';
import { defaultAgentForRoute, type CopilotContext, type CopilotEnv } from './persona-router';
import type { AgentId } from './registry';
import type { ToolContext } from './tools/types';

/** 项目内五环节（时间维；D22：只存在于项目空间内部）。 */
export type Stage = 'brief' | 'match' | 'reach' | 'delivery' | 'insight';

const STAGE_AGENT: Record<Stage, AgentId> = {
  brief: 'strategy',
  match: 'match',
  reach: 'reach',
  delivery: 'delivery',
  insight: 'insight',
};

const STAGES: Stage[] = ['brief', 'match', 'reach', 'delivery', 'insight'];

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
  const route = `/admin/project/${projectId}/${stage}`;
  return {
    route,
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
  // pick: / env: 的完整语义留 EXTENSION POINT（IA/环境切换真实形态落地时充实）。
  return null;
}

/** 待拍板事项（原样自 PendingAction，不改写）。 */
export interface PendingItem {
  id: string;
  kind: string;
  toolName: string;
  status: string;
  harm: unknown;
  createdAt: Date;
}

/**
 * 聚合待拍板事项（F002 PendingAction，status=pending）。
 * 铁律：原样返回，编排层不改写 harm、不软化专家/闸门结论（独立性铁则编排侧）。
 * EXTENSION POINT：排序规则（当前按 createdAt）随真实优先级策略充实。
 */
export async function aggregatePending(ctx: ToolContext): Promise<PendingItem[]> {
  const rows = await prisma.pendingAction.findMany({
    where: { tenantId: ctx.tenantId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, kind: true, toolName: true, status: true, harmJson: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    toolName: r.toolName,
    status: r.status,
    harm: r.harmJson, // 原样透传，不改写
    createdAt: r.createdAt,
  }));
}

/** 从 route 推默认人格（复用 persona-router；驾驶舱待办直达时用）。 */
export function agentForRoute(route: string): AgentId {
  return defaultAgentForRoute(route);
}
