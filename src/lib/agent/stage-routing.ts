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

export const STAGES: Stage[] = [
  'brief',
  'match',
  'reach',
  'delivery',
  'insight',
];

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

/**
 * 环节深链 href（ARCH-M05 F007：URL 态 ?env=，kimi §6.1 / 裁决 #4）。
 * 旧 ?stage= 深链由项目详情页兼容重写（读到即 router.replace 为 ?env=）。
 * 命名歧义警示（architecture §6.1）：URL `?env=` 指五环节（本文件 Stage 类型）；
 * CopilotContext.env 是运行环境（default/sandbox/production）——同名不同义，不得互相赋值。
 */
export function stageHref(projectId: string, stage: Stage): string {
  return `/admin/campaigns/${projectId}?env=${stage}`;
}

/** 环节路由结果 = 一个可用于初始化 useChat 的目标 copilot context（+ stage 元信息 + ?env= 深链）。 */
export interface StageTarget extends CopilotContext {
  stage: Stage;
  /** 环节深链（?env=）：today 待办直落等入口统一由此取 href（F007 迁移）。 */
  href: string;
}

/** 路由到「某项目的某环节」：环节落地面按 env 静态映射渲染（D22）。 */
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
    href: stageHref(projectId, stage),
  };
}

/**
 * 解析 orchestrator 指令。
 * - `enter:<projectId>:<stage>` → 进入某项目某环节（返回 StageTarget）
 * - `pick:<...>` / `env:<...>` → EXTENSION POINT（本批识别但只做最小处理）
 */
export function parseOrchestratorDirective(
  directive: string,
): StageTarget | null {
  const [verb, ...rest] = directive.split(':');
  if (verb === 'enter' && rest.length >= 2) {
    const [projectId, stage] = rest;
    if (isStage(stage)) return routeToStage(projectId, stage);
  }
  return null;
}
