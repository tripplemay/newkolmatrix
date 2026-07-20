// AGENT-FOUNDATION F007 — Generative Canvas 协议：工具结果 type → React 组件（柱四）
//
// canvas 协议：agent 工具调用的输出按「工具名」映射到一个 React 渲染组件。
// 可扩展铁律：新增一种工具结果的画布渲染 = 往 CANVAS_REGISTRY 加一条，不改对话面核心。
// EXTENSION POINT：get_kol_detail 详情卡、组合态方案卡、周报卡等随 M1-M4 工具落地时在此注册。

'use client';

import type { ComponentType } from 'react';
import KolResultCards, { type SearchKolsOutput } from './KolResultCards';

/** 工具名 → 画布渲染组件（output 为该工具的返回结构）。 */
const CANVAS_REGISTRY: Record<string, ComponentType<{ output: never }>> = {
  search_kols: KolResultCards as unknown as ComponentType<{ output: never }>,
};

/** 是否有该工具的画布渲染器。 */
export function hasCanvasRenderer(toolName: string): boolean {
  return toolName in CANVAS_REGISTRY;
}

/** 渲染某工具结果为画布组件；无注册器则返回 null（对话面回退为文本）。 */
export function renderToolResult(toolName: string, output: unknown) {
  const Comp = CANVAS_REGISTRY[toolName];
  if (!Comp) return null;
  return <Comp output={output as never} />;
}

export type { SearchKolsOutput };
