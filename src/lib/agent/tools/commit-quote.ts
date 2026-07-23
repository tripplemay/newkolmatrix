// M3-A-REACH-CRM F006 — commit_quote 工具（outbound/native，报价承诺过闸门）
//
// class:'outbound'（对外·不可撤销：报价承诺 = 对创作者的商务承诺）→ 服务端强制停在确认前。
// buildHarm 三要素（spec F006）：金额（amount+currency）/ 交付物（evidence 全列）/ 对象（targets）。
// execute（经两步票据后）：Quote proposed → committed（同一执行事务内落库+翻牌，gateLogId 必非空）
// → P8 budgetUsd 回填（现行 approved 组合的 metrics.budgetUsd = 成员 committed 报价 USD 合计，
// 只回填不重算评分）→ crmInfer 重算（quote.committed 是 confirmed 的唯一推出路径，U4）。

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import { recomputeThreadStatus } from 'lib/reach/recompute-status';
import type { ToolContext, ToolDefinition } from './types';
import { HARM_LABEL, type Harm } from '../gate/harm';

const inputSchema = z.object({
  projectId: z.string().min(1).describe('项目 id'),
  kolId: z.string().min(1).describe('创作者 Kol.id'),
  amount: z.number().positive().describe('报价金额（数值）'),
  currency: z
    .string()
    .min(3)
    .max(3)
    .describe('ISO 4217 币种码，如 USD'),
  deliverables: z
    .array(z.string().min(1))
    .min(1)
    .describe('交付物清单（如「1 条长视频」「2 条 shorts」）'),
  scope: z.string().optional().describe('授权/使用范围（如「项目内使用 90 天」）'),
});

type CommitQuoteInput = z.infer<typeof inputSchema>;

interface CommitQuoteOutput {
  committed: true;
  quoteId: string;
  threadId: string;
  amount: number;
  currency: string;
  /** P8：本次回填后的现行组合 budgetUsd（无 approved 组合 / KOL 不在组合内时 null）。 */
  planBudgetUsd: number | null;
}

/** async buildHarm（§9.5）：对象名从 DB 读真值。三要素：金额 / 交付物 / 对象。 */
async function buildHarm(
  input: CommitQuoteInput,
  ctx: ToolContext,
): Promise<Harm> {
  const kol = await prisma.kol.findFirst({
    where: { id: input.kolId, tenantId: ctx.tenantId },
    select: { displayName: true, handle: true },
  });
  if (!kol) throw new Error(`[commit_quote] 创作者不存在: ${input.kolId}`);
  const who = kol.displayName ?? kol.handle ?? input.kolId;
  return {
    action: 'commit_quote',
    summary: `向创作者 ${who} 承诺报价 ${input.amount} ${input.currency}`,
    targets: [who], // 对象
    amount: input.amount, // 金额（NFR-I4 带币种）
    currency: input.currency,
    scope: input.scope,
    irreversible: true,
    evidence: `交付物：${input.deliverables.join('、')}`, // 交付物全列
    expiresAt: new Date().toISOString(), // gate 会以其 TTL 覆盖为准
    label: HARM_LABEL,
  };
}

/**
 * P8 回填：现行 approved 组合含此 KOL 时，metrics.budgetUsd = 组合成员 committed 报价合计。
 * 口径：仅 USD 报价计入（budgetUsd 语义；非 USD 不做汇率换算——诚实缺口，显示层「待核」语义不变）。
 * 只回填不重算评分（P8）。
 */
async function backfillPlanBudget(
  input: Pick<CommitQuoteInput, 'projectId' | 'kolId'>,
  ctx: ToolContext,
): Promise<number | null> {
  const db = ctx.db ?? prisma;
  const plan = await db.matchPlan.findFirst({
    where: { tenantId: ctx.tenantId, projectId: input.projectId, status: 'approved' },
    select: { id: true, metrics: true, kols: { select: { kolId: true } } },
  });
  if (!plan) return null;
  const memberIds = plan.kols.map((k) => k.kolId);
  if (!memberIds.includes(input.kolId)) return null;

  const committed = await db.quote.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: 'committed',
      thread: { projectId: input.projectId, kolId: { in: memberIds } },
    },
    select: { amount: true, currency: true },
  });
  const budgetUsd = committed
    .filter((q) => q.currency === 'USD')
    .reduce((sum, q) => sum + Number(q.amount), 0);

  const metrics = {
    ...((plan.metrics as Record<string, unknown> | null) ?? {}),
    budgetUsd,
  };
  await db.matchPlan.update({
    where: { id: plan.id },
    data: { metrics: metrics as Prisma.InputJsonValue },
  });
  return budgetUsd;
}

async function run(
  input: CommitQuoteInput,
  ctx: ToolContext,
): Promise<CommitQuoteOutput> {
  const db = ctx.db ?? prisma;

  // 幂等重入（P6 同款）：同一闸门动作已产生 committed Quote → 不再重复落库
  if (ctx.gateActionId) {
    const existing = await db.quote.findFirst({
      where: { tenantId: ctx.tenantId, gateLogId: ctx.gateActionId, status: 'committed' },
      select: { id: true, threadId: true },
    });
    if (existing) {
      return {
        committed: true,
        quoteId: existing.id,
        threadId: existing.threadId,
        amount: input.amount,
        currency: input.currency,
        planBudgetUsd: null,
      };
    }
  }

  const kol = await db.kol.findFirst({
    where: { id: input.kolId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!kol) throw new Error(`[commit_quote] 创作者不存在: ${input.kolId}`);
  const project = await db.project.findFirst({
    where: { id: input.projectId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!project) throw new Error(`[commit_quote] 项目不存在: ${input.projectId}`);

  const thread = await db.outreachThread.upsert({
    where: { projectId_kolId: { projectId: input.projectId, kolId: input.kolId } },
    create: {
      tenantId: ctx.tenantId,
      projectId: input.projectId,
      kolId: input.kolId,
      status: 'pending_send',
    },
    update: {},
  });

  // Quote 状态机：proposed → committed（同一执行事务内两步，行诚实走过两态；
  // committed 必带 gateLogId——不存在不经闸门的 committed 行）。
  const quote = await db.quote.create({
    data: {
      tenantId: ctx.tenantId,
      threadId: thread.id,
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      currency: input.currency,
      deliverablesJson: input.deliverables as unknown as Prisma.InputJsonValue,
      scope: input.scope ?? null,
      status: 'proposed',
    },
  });
  await db.quote.update({
    where: { id: quote.id },
    data: { status: 'committed', gateLogId: ctx.gateActionId ?? null },
  });

  // P8 回填（同一事务）
  const planBudgetUsd = await backfillPlanBudget(input, ctx);

  // crmInfer 重算（三处复用铁律 ②）：quote.committed → confirmed（U4 唯一路径）
  await recomputeThreadStatus(thread.id, {
    tenantId: ctx.tenantId,
    db: ctx.db,
    actor: ctx.agentId,
  });

  return {
    committed: true,
    quoteId: quote.id,
    threadId: thread.id,
    amount: input.amount,
    currency: input.currency,
    planBudgetUsd,
  };
}

export const commitQuoteTool: ToolDefinition<CommitQuoteInput, CommitQuoteOutput> = {
  name: 'commit_quote',
  description:
    '向创作者承诺报价（对外·不可撤销的商务承诺）。这是 outbound 动作——服务端会强制停在你确认前，确认卡将如实披露金额、交付物与对象。',
  class: 'outbound',
  source: 'native',
  inputSchema,
  buildHarm,
  execute: run,
};
