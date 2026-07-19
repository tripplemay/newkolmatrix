// AGENT-FOUNDATION F005 — 唯一工具注册表（柱一）
//
// 单一权威注册表：加一个工具 = 往这里 register 一条，不改 route 核心（FR-12.12 / 可扩展性）。
// F006 persona router 会按人格从此表收窄工具子集；executeTool 是唯一执行入口（架构稿 §5.2）。

import type { ToolDefinition } from './types';

const registry = new Map<string, ToolDefinition<never, unknown>>();

/** 注册一个工具（重名即抛，避免双语义并存）。 */
export function registerTool<TInput, TOutput>(def: ToolDefinition<TInput, TOutput>): void {
  if (registry.has(def.name)) {
    throw new Error(`[tools] 工具重名: ${def.name}（禁止双语义并存，架构稿 §5.2）`);
  }
  registry.set(def.name, def as unknown as ToolDefinition<never, unknown>);
}

/** 取工具定义；不存在返回 undefined。 */
export function getTool(name: string): ToolDefinition<never, unknown> | undefined {
  return registry.get(name);
}

/** 列出全部已注册工具定义。 */
export function listTools(): ToolDefinition<never, unknown>[] {
  return [...registry.values()];
}

/** 全部工具名。 */
export function getToolNames(): string[] {
  return [...registry.keys()];
}
