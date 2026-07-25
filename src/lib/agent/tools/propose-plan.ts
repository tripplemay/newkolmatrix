// M4.5-AGENT-LOOP F004 — propose_plan 工具（internal/native）+ 计划留痕
//
// F-B「行动计划卡」的数据面（U3/P4）：模型把「我打算做这几件事」产出为**结构化计划**，
// 而不是散在自然语言里。计划本身不执行任何东西——它是给人看的、可追溯的意图快照。
//
// ── 闸门如实披露前移到计划态（P4）──
// `needsGate` **不信任模型声明**：服务端按工具注册表判定，模型说「不用确认」而该工具是
// outbound 时，一律按 needsGate=true 记，并以 `gateUnderreported=true` 如实暴露这次低报。
// 同理，模型编出的工具名以 `toolKnown=false` 标出——计划卡上不能让一个不存在的工具
// 看起来像真的。
//
// ── 认可不解锁执行权（P4 红线）──
// 计划被人「认可」（/api/agent/plan-ack）只落一行留痕。后续每个 outbound 动作照旧
// 逐个走两步票据闸门——回归测试 `propose-plan.test.ts` 钉死这一点。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import type { Prisma } from '@prisma/client';
import { getTool } from './registry';
import { ensureNativeToolsRegistered } from './index';
import type { ToolContext, ToolDefinition } from './types';

const planItemSchema = z.object({
  title: z.string().min(1).max(200).describe('这一步要做什么（一句话）'),
  toolName: z
    .string()
    .min(1)
    .max(64)
    .nullish()
    .describe('这一步预计调用的工具名（没有对应工具就留空）'),
  needsGate: z
    .boolean()
    .describe('这一步是否需要人确认（服务端会按工具注册表复核，低报会被标出）'),
  note: z.string().max(500).nullish().describe('可选补充说明'),
});

const inputSchema = z.object({
  title: z.string().min(1).max(120).describe('计划标题'),
  items: z.array(planItemSchema).min(1).max(12).describe('计划步骤（1-12 条）'),
  projectId: z.string().min(1).nullish().describe('可选：计划归属项目'),
});

type ProposePlanInput = z.infer<typeof inputSchema>;

export interface PlanItem {
  title: string;
  toolName: string | null;
  /** 服务端裁定：模型声明 OR 注册表判定 outbound，取或——模型说「不用确认」不作数 */
  needsGate: boolean;
  /** true = 模型声明不需确认但该工具实为 outbound（低报，如实暴露） */
  gateUnderreported: boolean;
  /** false = 该工具名不在注册表（模型可能编了一个工具名）——卡上须标出 */
  toolKnown: boolean;
  note: string | null;
}

export interface ProposePlanOutput {
  /** 画布路由键（ADR-28 结果 type 路由）。 */
  type: 'action_plan';
  /** 计划 id = 留痕行 id（认可端点以此为幂等键）。 */
  planId: string;
  title: string;
  projectId: string | null;
  items: PlanItem[];
  /** 需要人确认的步骤数（卡上「其中 N 步需你确认」）。 */
  needsGateCount: number;
  /** 计划态如实披露语（与卡面文案同源，防前端另写一套弱化措辞）。 */
  disclosure: string;
  createdAt: string;
}

/** 留痕 summary 前缀——查询锚点。 */
export const PLAN_PROPOSED_MARKER = 'agent_plan_proposed';

/** 计划态披露文案（测试钉死；同时是卡面文案的唯一来源）。 */
export const PLAN_DISCLOSURE_MSG =
  '这是一份计划，还没有执行任何一步。标了「需你确认」的动作会逐个停在你面前等你拍板——认可这份计划只是留个痕，不会替你确认任何一步。';

/** 服务端复核一条计划步骤（不信任模型对闸门的声明）。 */
export function reviewPlanItem(item: z.infer<typeof planItemSchema>): PlanItem {
  ensureNativeToolsRegistered();
  const toolName = item.toolName ?? null;
  const def = toolName ? getTool(toolName) : null;
  const toolKnown = toolName == null ? true : def != null;
  const serverSaysGate = def?.class === 'outbound';
  return {
    title: item.title,
    toolName,
    needsGate: item.needsGate || serverSaysGate,
    gateUnderreported: serverSaysGate && !item.needsGate,
    toolKnown,
    note: item.note ?? null,
  };
}

async function run(
  input: ProposePlanInput,
  ctx: ToolContext,
): Promise<ProposePlanOutput> {
  const db = ctx.db ?? prisma;
  const items = input.items.map(reviewPlanItem);
  const needsGateCount = items.filter((i) => i.needsGate).length;
  const projectId = input.projectId ?? ctx.projectId ?? null;

  // 计划留痕（U3）：propose 即落一行，卡可追溯。计划正文是人要看的内容，故此处**存**载荷
  //（与 loop 遥测的「只存元数据」是不同用途：那是观测，这是可追溯的意图快照）。
  const row = await db.operationLog.create({
    data: {
      tenantId: ctx.tenantId,
      kind: 'auto',
      actor: ctx.agentId,
      summary: `${PLAN_PROPOSED_MARKER} ${input.title}（${items.length} 步 · 其中 ${needsGateCount} 步需确认）`,
      projectId,
      payloadJson: {
        title: input.title,
        items,
        needsGateCount,
      } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, createdAt: true },
  });

  return {
    type: 'action_plan',
    planId: row.id,
    title: input.title,
    projectId,
    items,
    needsGateCount,
    disclosure: PLAN_DISCLOSURE_MSG,
    createdAt: row.createdAt.toISOString(),
  };
}

export const proposePlanTool: ToolDefinition<
  ProposePlanInput,
  ProposePlanOutput
> = {
  name: 'propose_plan',
  description:
    '把你打算做的几件事产出为一份结构化行动计划卡（给人看、可追溯）。这不执行任何动作——' +
    '需要人确认的步骤照旧会逐个停在确认前。如实标注每步是否需要确认；服务端会按工具注册表复核你的标注。',
  class: 'internal',
  source: 'native',
  inputSchema,
  execute: run,
};
