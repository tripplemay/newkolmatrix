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
import { distributeKeysTool } from './distribute-keys';
import { checkDeliverablesTool, trackDeliveryTool } from './delivery-tracking';
import { confirmBriefGoalTool } from './confirm-brief-goal';
import { draftReportTool } from './draft-report';
import { computeRoiTool } from './compute-roi';
import { computeRoiPortfolioTool } from './compute-roi-portfolio';
import { checkComplianceTool } from './check-compliance';
import { proposePlanTool } from './propose-plan';
import { handoffToTool } from './handoff-to';
import { consultSpecialistTool } from './consult-specialist';
import { createShareLinkTool } from './create-share-link';
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
  distributeKeysTool as unknown as ToolDefinition<never, unknown>, // M3-B F006（outbound，key 分发过闸门）
  trackDeliveryTool as unknown as ToolDefinition<never, unknown>, // M3-B F007（internal，台账只读）
  checkDeliverablesTool as unknown as ToolDefinition<never, unknown>, // M3-B F007（internal，条件核对 = deliveryCheck 产物）
  confirmBriefGoalTool as unknown as ToolDefinition<never, unknown>, // M3-B F011（internal，brief 目标确认写入口）
  draftReportTool as unknown as ToolDefinition<never, unknown>, // M4 F006（internal，周报起草落库——只起草不采纳）
  computeRoiTool as unknown as ToolDefinition<never, unknown>, // M4 F005（internal，ROI 对账只读 = roi.compute + attribution.gaps 产物）
  createShareLinkTool as unknown as ToolDefinition<never, unknown>, // M4 F008（outbound 白名单第 6，对外分享过闸门——链接一经生成即暴露）
  computeRoiPortfolioTool as unknown as ToolDefinition<never, unknown>, // M4.5 F003（internal，跨项目 ROI 对比 = 装配 + 两纯函数产物组合）
  checkComplianceTool as unknown as ToolDefinition<never, unknown>, // M4.5 F011（internal，合规红线核查单 = 链头读取器产物 + 溯源；不给判定）
  proposePlanTool as unknown as ToolDefinition<never, unknown>, // M4.5 F004（internal，行动计划卡 + 计划留痕；认可不解锁执行权）
  handoffToTool as unknown as ToolDefinition<never, unknown>, // M4.5 F005（internal，循环内接力——仅 orchestrator 持有；落 Handoff 行 + prepareStep 切换）
  consultSpecialistTool as unknown as ToolDefinition<never, unknown>, // M4.7 F002（internal，前台内部咨询专家——仅前台持有；起受限子 loop）
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
