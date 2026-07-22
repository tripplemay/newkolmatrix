// AGENT-FOUNDATION F007 — Generative Canvas 协议：工具结果 → React 组件（柱四）
// M2-A F007 — ADR-28 兑现：路由键改结果 `type` + 受控 register API。
//
// 路由规则：工具输出携带 `type` 字符串字段 → 按 type 路由（多个工具可共用同一渲染形态）；
// 无 type 字段 → 回退按工具名路由（search_kols 迁移零变更——其输出无 type，仍走工具名键）。
// 可扩展铁律：新增一种结果形态 = registerCanvasRenderer 一条，不改对话面核心（FR-12.13）。
// 未注册键返回 null 不抛错（模型输出是不可信输入，NFR-S6）。
//
// 安全红线（FR-12.16）：canvas 只渲染受控 React 组件树，工具结果一律作为数据 props
// 传入，禁止 dangerouslySetInnerHTML 承接模型文本。

'use client';

import type { ComponentType } from 'react';
import KolResultCards, { type SearchKolsOutput } from './KolResultCards';
import MatchPlanCard from './MatchPlanCard';

const CANVAS_REGISTRY = new Map<string, ComponentType<{ output: never }>>();

/**
 * 受控 register API（ADR-28）：注册一种结果 type 的画布渲染器。
 * 重名即抛（禁止双语义并存，同 tools/registry 先例）；测试可经此注入探针组件。
 */
export function registerCanvasRenderer(
  type: string,
  component: ComponentType<{ output: never }>,
): void {
  if (CANVAS_REGISTRY.has(type)) {
    throw new Error(`[canvas] 渲染器重名: ${type}（禁止双语义并存，ADR-28）`);
  }
  CANVAS_REGISTRY.set(type, component);
}

/** 内建渲染器装配（幂等：防 Next dev HMR 模块重估导致的重名报错）。 */
function ensureBuiltinRenderers(): void {
  const builtin: Array<[string, ComponentType<{ output: never }>]> = [
    // search_kols 输出无 type 字段 → 工具名回退键（迁新 API 行为零变更）
    ['search_kols', KolResultCards as unknown as ComponentType<{ output: never }>],
    // match_plan 输出携带 type:'match_plan' → 结果 type 键（ADR-28 目标态）
    ['match_plan', MatchPlanCard as unknown as ComponentType<{ output: never }>],
  ];
  for (const [type, comp] of builtin) {
    if (!CANVAS_REGISTRY.has(type)) CANVAS_REGISTRY.set(type, comp);
  }
}

ensureBuiltinRenderers();

/** 路由键解析（ADR-28）：结果 type 优先，无 type 回退工具名。 */
function resolveCanvasKey(toolName: string, output: unknown): string {
  const t = (output as { type?: unknown } | null | undefined)?.type;
  return typeof t === 'string' && t.length > 0 ? t : toolName;
}

/** 是否有该工具结果的画布渲染器（按 type/工具名解析后判定）。 */
export function hasCanvasRenderer(toolName: string, output?: unknown): boolean {
  return CANVAS_REGISTRY.has(resolveCanvasKey(toolName, output));
}

/** 渲染某工具结果为画布组件；无注册器则返回 null（对话面回退为文本）。 */
export function renderToolResult(toolName: string, output: unknown) {
  const Comp = CANVAS_REGISTRY.get(resolveCanvasKey(toolName, output));
  if (!Comp) return null;
  return <Comp output={output as never} />;
}

export type { SearchKolsOutput };
