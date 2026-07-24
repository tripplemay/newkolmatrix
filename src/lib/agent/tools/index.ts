// AGENT-FOUNDATION F005 — native 工具装配入口
//
// 唯一注册 native 工具的地方。加 native 工具 = 在这里往 NATIVE_TOOLS 加一条。
// MCP 工具（source:'mcp'）为扩展点：未来在此按需从 MCP client 拉取并 register，本批不实装。

import { getTool, registerTool } from './registry';
import { searchKolsTool } from './search-kols';
import { getKolDetailTool } from './get-kol-detail';
import { sendOutreachTool } from './send-outreach';
import { computeHealthTool } from './compute-health';
import { matchPlanTool } from './match-plan';
import { evaluateCreatorTool } from './evaluate-creator';
import { createProjectTool } from './create-project';
import { draftEmailTool, refineEmailTool } from './email-drafting';
import { commitQuoteTool } from './commit-quote';
import { payoutTool } from './payout';
import type { ToolDefinition } from './types';

const NATIVE_TOOLS: ToolDefinition<never, unknown>[] = [
  searchKolsTool as unknown as ToolDefinition<never, unknown>,
  getKolDetailTool as unknown as ToolDefinition<never, unknown>,
  sendOutreachTool as unknown as ToolDefinition<never, unknown>, // outbound（F009 闸门）
  computeHealthTool as unknown as ToolDefinition<never, unknown>, // M1-B F003（internal，health.compute 薄封装）
  matchPlanTool as unknown as ToolDefinition<never, unknown>, // M2-A F007（internal，现行组合查询）
  evaluateCreatorTool as unknown as ToolDefinition<never, unknown>, // M2-A F007（internal，单人可解释评估）
  createProjectTool as unknown as ToolDefinition<never, unknown>, // M2-C F001（internal，项目创建+留痕）
  draftEmailTool as unknown as ToolDefinition<never, unknown>, // M3-A F006（internal，起草——只生成不发送）
  refineEmailTool as unknown as ToolDefinition<never, unknown>, // M3-A F006（internal，改写）
  commitQuoteTool as unknown as ToolDefinition<never, unknown>, // M3-A F006（outbound，报价承诺过闸门）
  payoutTool as unknown as ToolDefinition<never, unknown>, // M3-B F005（outbound，放款过闸门 + 服务端二次校验）
];

let registered = false;

/** 幂等注册（防 Next dev HMR 模块重估导致的重名报错）。 */
function ensureNativeToolsRegistered(): void {
  if (registered) return;
  for (const t of NATIVE_TOOLS) {
    if (!getTool(t.name)) registerTool(t);
  }
  registered = true;
}

ensureNativeToolsRegistered();

/** 本批 native 工具名（route 用它取全集；F006 persona router 会按人格收窄子集）。 */
export function getNativeToolNames(): string[] {
  ensureNativeToolsRegistered();
  return NATIVE_TOOLS.map((t) => t.name);
}

export { ensureNativeToolsRegistered };
