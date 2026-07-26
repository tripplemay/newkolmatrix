// M4.7-FRONTDESK F003 — 当前环节作为**线索**注入（不是权限）
//
// 【本批根因】此前 `defaultAgentForRoute(route)` / `STAGE_AGENT[stage]` 把「用户落在
// 哪个页面」映射成「哪个专家有发言权」。于是内部的人格分区变成了用户要面对的墙：
// 在匹配页问 ROI，匹配 Agent 只能拒答并让用户自己去找洞察 Agent。
//
// 改后：受理的永远是前台，页面只作为**关注点线索**进 system——
// 明写「这是用户当前所在位置，不限制你能做什么」，免得模型把线索又读成权限。
//
// `STAGE_AGENT` **保留**：今天页雷达深链靠 `agentId → STAGE_AGENT` 反查环节，
// 与对话人格选取无关。`defaultAgentForRoute` 本批之后**唯一调用者是 smoke 脚本**
// （首轮验收 OBS-3 实测更正：它与雷达深链无关，`stage-routing.ts` 也不消费它）。
// 本批只切断「决定谁来回答」这一条用途。

import { STAGE_LABEL, isStage, type Stage } from './stage-routing';

/** 段落起始锚点（测试与 grep 用）。 */
export const STAGE_HINT_HEADING = '【当前位置】';

/**
 * 明写「线索不是权限」的那句。单独导出以便正向精确匹配钉死——
 * 这句一旦丢失或被改反，模型很可能又把页面读成权限边界（本批要根治的正是这个）。
 */
export const STAGE_HINT_NOT_A_LIMIT =
  '这只是用户当前所在的位置，用来判断他关心什么；它**不限制**你能做什么——需要别的专业判断时，照常咨询对应专家。';

/**
 * 拼当前环节线索段。
 * 传入的不是合法环节（或为空）→ 返回空串，**不注水**（同项目上下文段/知识段纪律）。
 */
export function stageHintSection(stage: string | null | undefined): string {
  if (!stage || !isStage(stage)) return '';
  const s: Stage = stage;
  return [
    '',
    '',
    `${STAGE_HINT_HEADING}用户正在「${STAGE_LABEL[s]}」环节页上。`,
    STAGE_HINT_NOT_A_LIMIT,
  ].join('\n');
}
