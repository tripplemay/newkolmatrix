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
import PlanCard from './PlanCard';
import PlanCardDraft from './PlanCardDraft';
import ConsultationNote from './ConsultationNote';

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
    // propose_plan 输出携带 type:'action_plan'（M4.5 F004 行动计划卡）
    ['action_plan', PlanCard as unknown as ComponentType<{ output: never }>],
    // consult_specialist 输出携带 type:'consultation'（M4.7 F008 协作痕迹）——
    // 专家隐入内部，但"谁给的结论、读了什么"必须看得见，否则单一前台就成了黑箱。
    [
      'consultation',
      ConsultationNote as unknown as ComponentType<{ output: never }>,
    ],
  ];
  for (const [type, comp] of builtin) {
    if (!CANVAS_REGISTRY.has(type)) CANVAS_REGISTRY.set(type, comp);
  }
}

ensureBuiltinRenderers();

/* ────────────────────────────────────────────────────────────────
   渐进渲染面（M4.5 F008 裁决 C）：模型**正在写**工具入参时的卡片
   —— 与结果渲染器分开两张表：键不同（工具名 vs 结果 type）、
   数据不同（partial input vs 完整 output）、诚实边界不同（渐进态不出闸门标注）。
   扩展一种渐进卡 = registerCanvasDraftRenderer 一条。
   ──────────────────────────────────────────────────────────────── */

const CANVAS_DRAFT_REGISTRY = new Map<
  string,
  ComponentType<{ input: never }>
>();

/** 注册某工具的「入参流式」渐进渲染器（键 = 工具名——此刻还没有 output，谈不上结果 type）。 */
export function registerCanvasDraftRenderer(
  toolName: string,
  component: ComponentType<{ input: never }>,
): void {
  if (CANVAS_DRAFT_REGISTRY.has(toolName)) {
    throw new Error(`[canvas] 渐进渲染器重名: ${toolName}（禁止双语义并存）`);
  }
  CANVAS_DRAFT_REGISTRY.set(toolName, component);
}

function ensureBuiltinDraftRenderers(): void {
  if (!CANVAS_DRAFT_REGISTRY.has('propose_plan')) {
    CANVAS_DRAFT_REGISTRY.set(
      'propose_plan',
      PlanCardDraft as unknown as ComponentType<{ input: never }>,
    );
  }
}

ensureBuiltinDraftRenderers();

export function hasCanvasDraftRenderer(toolName: string): boolean {
  return CANVAS_DRAFT_REGISTRY.has(toolName);
}

/** 渲染「正在写」的工具入参；无注册器 → null（对话面回退为「调用工具 X…」一行字）。 */
export function renderToolInputDraft(toolName: string, input: unknown) {
  const Comp = CANVAS_DRAFT_REGISTRY.get(toolName);
  if (!Comp) return null;
  return <Comp input={(input ?? {}) as never} />;
}

/**
 * 渲染分支判定（单一真相源，供 UI 与单测共用）：一个工具 part 在某状态下该出哪种渲染。
 * 三分支**互斥**——同一 part 不会同时出渐进卡与结果卡（重复渲染/闪烁的机械防线）。
 */
export type ToolRenderMode = 'canvas' | 'draft' | 'label';

export function pickToolRenderMode(
  toolName: string,
  state: string | undefined,
  output: unknown,
): ToolRenderMode {
  if (state === 'output-available' && hasCanvasRenderer(toolName, output)) {
    return 'canvas';
  }
  if (
    (state === 'input-streaming' || state === 'input-available') &&
    hasCanvasDraftRenderer(toolName)
  ) {
    return 'draft';
  }
  return 'label';
}

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
