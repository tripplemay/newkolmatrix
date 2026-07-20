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
import { defaultAgentForRoute } from './persona-router';
import type { AgentId } from './registry';
import type { ToolContext } from './tools/types';

// 环节路由纯函数已抽到 client-safe 的 stage-routing.ts（供 IA 页面复用，避免 client bundle 拉入 prisma）；
// orchestrator 从那里 re-export，保持 F006 的对外接口不变。
export {
  routeToStage,
  parseOrchestratorDirective,
  isStage,
  STAGE_AGENT,
  STAGES,
  STAGE_LABEL,
  type Stage,
  type StageTarget,
} from './stage-routing';

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
export async function aggregatePending(
  ctx: ToolContext,
): Promise<PendingItem[]> {
  const rows = await prisma.pendingAction.findMany({
    where: { tenantId: ctx.tenantId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      kind: true,
      toolName: true,
      status: true,
      harmJson: true,
      createdAt: true,
    },
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
