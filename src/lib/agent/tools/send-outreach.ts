// AGENT-FOUNDATION F009 → M3-A-REACH-CRM F003 — send_outreach 工具（outbound/native，接真投递）
//
// 单人聚焦语法（P7：批量发信归 M3-B+）：向一位创作者发送触达邮件。
// - buildHarm（async，§9.5）：从 DB 读 Kol.contactEmail 构造如实披露；未录入联系方式 →
//   抛明示错误，动作在落 PendingAction 之前被拒（P3 明示拒绝不猜）。
// - execute：幂等重入检查（P6，gateLogId 查重）→ 复核联系方式与披露一致 → EmailSender
//   发送（env 选择器：默认 mock 不外呼，真发仅配 RESEND_API_KEY）→ OutreachMessage
//   (direction=sent, gateLogId, providerMessageId) 落库 + OutreachThread upsert +
//   crmInfer 复用重算 status（三处复用铁律 ②）+ 状态推进事件留痕。
// - 经闸门 execute 进入时 ctx.db = 执行事务（F002）：业务落库与 executed+irrev 同一事务；
//   外部真投递无法进事务，以 gateActionId 为幂等键（§9.8：日志至少一次、副作用恰好一次）。

import { z } from 'zod';
import { prisma } from 'lib/db/prisma';
import { getEmailSender } from 'lib/ops/email';
import { inferCrmStatus } from 'lib/domain/crm-infer';
import type { ToolContext, ToolDefinition } from './types';
import { HARM_LABEL, type Harm } from '../gate/harm';

// P5（观测点零迁移）：SENT_MARKER 已转正至 MockEmailSender，此处 re-export 保持既有导入路径有效。
export { SENT_MARKER } from 'lib/ops/email';

const inputSchema = z.object({
  projectId: z.string().min(1).describe('项目 id（触达线程归属）'),
  kolId: z
    .string()
    .min(1)
    .describe('创作者 Kol.id（收件地址取库内 contactEmail，不接受直填邮箱）'),
  subject: z.string().min(1).describe('邮件主题'),
  body: z.string().min(1).describe('邮件正文（纯文本）'),
  language: z
    .string()
    .optional()
    .describe('正文语言（如 en / zh / ru，NFR-I2）'),
});

type SendOutreachInput = z.infer<typeof inputSchema>;

interface SendOutreachOutput {
  sent: true;
  /** true = 幂等重入（同一闸门动作已发过，未重复外呼）。 */
  already: boolean;
  to: string;
  threadId: string;
  messageId: string;
  providerMessageId: string | null;
  /** true = MockEmailSender（未真实外呼）。 */
  mocked: boolean;
}

/** 明示拒绝（P3）：定死文案锚点，测试断言引用。 */
export const NO_CONTACT_EMAIL_MSG =
  '该创作者未录入联系邮箱——拒绝猜测或杜撰地址（P3）。请先在创作者抽屉录入 contactEmail 再发起触达。';

async function resolveKol(
  input: Pick<SendOutreachInput, 'kolId'>,
  ctx: ToolContext,
): Promise<{
  id: string;
  displayName: string | null;
  handle: string | null;
  contactEmail: string;
}> {
  const db = ctx.db ?? prisma;
  const kol = await db.kol.findFirst({
    where: { id: input.kolId, tenantId: ctx.tenantId },
    select: { id: true, displayName: true, handle: true, contactEmail: true },
  });
  if (!kol) throw new Error(`[send_outreach] 创作者不存在: ${input.kolId}`);
  if (!kol.contactEmail)
    throw new Error(`[send_outreach] ${NO_CONTACT_EMAIL_MSG}`);
  return { ...kol, contactEmail: kol.contactEmail };
}

/** async buildHarm（§9.5）：收件人从 DB 读真值披露，不信任模型转述；无 contactEmail 在此即拒。 */
async function buildHarm(
  input: SendOutreachInput,
  ctx: ToolContext,
): Promise<Harm> {
  const kol = await resolveKol(input, ctx);
  const who = kol.displayName ?? kol.handle ?? kol.id;
  return {
    action: 'send_outreach',
    summary: `向创作者 ${who} 发送触达邮件「${input.subject}」`,
    targets: [`${who} <${kol.contactEmail}>`], // 真实收件地址如实披露
    quantity: 1,
    irreversible: true,
    evidence: `正文：${input.body.slice(0, 60)}${
      input.body.length > 60 ? '…' : ''
    }`,
    expiresAt: new Date().toISOString(), // gate 会以其 TTL 覆盖为准
    label: HARM_LABEL,
  };
}

async function run(
  input: SendOutreachInput,
  ctx: ToolContext,
): Promise<SendOutreachOutput> {
  const db = ctx.db ?? prisma;

  // ── 幂等重入（P6）：同一闸门动作已产生 sent 消息 → 不再外呼不再落库 ──
  if (ctx.gateActionId) {
    const existing = await db.outreachMessage.findFirst({
      where: {
        tenantId: ctx.tenantId,
        gateLogId: ctx.gateActionId,
        direction: 'sent',
      },
      select: { id: true, threadId: true, providerMessageId: true },
    });
    if (existing) {
      const kol = await resolveKol(input, ctx);
      return {
        sent: true,
        already: true,
        to: kol.contactEmail,
        threadId: existing.threadId,
        messageId: existing.id,
        providerMessageId: existing.providerMessageId,
        mocked: false,
      };
    }
  }

  const kol = await resolveKol(input, ctx); // 执行时刻复核（P3：missing → 明示拒绝 → failed）

  // ── 披露一致性复核：确认卡披露的收件地址必须与当前库内地址一致 ──
  // pending→confirm 窗口内 contactEmail 被改动 → 拒发并要求重新发起（新一轮披露、新的确认）。
  if (ctx.gateActionId) {
    const pa = await db.pendingAction.findUnique({
      where: { id: ctx.gateActionId },
      select: { harmJson: true },
    });
    const targets = (pa?.harmJson as { targets?: unknown } | null)?.targets;
    const disclosed =
      Array.isArray(targets) &&
      targets.some(
        (t) => typeof t === 'string' && t.includes(kol.contactEmail),
      );
    if (!disclosed) {
      throw new Error(
        '[send_outreach] 收件地址在确认后发生变更，与确认卡披露不一致——拒发。请重新发起（新一轮披露）。',
      );
    }
  }

  const project = await db.project.findFirst({
    where: { id: input.projectId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!project)
    throw new Error(`[send_outreach] 项目不存在: ${input.projectId}`);

  // ── 外部副作用先行（无法进 DB 事务）：幂等键 = PendingAction.id（P6）──
  const sender = getEmailSender();
  const sendResult = await sender.send(
    {
      to: kol.contactEmail,
      subject: input.subject,
      bodyText: input.body,
      idempotencyKey:
        ctx.gateActionId ?? `direct-${input.projectId}-${input.kolId}`,
    },
    ctx,
  );

  // ── 业务落库（经闸门时在执行事务内，与 executed+irrev 同 commit/回滚）──
  const thread = await db.outreachThread.upsert({
    where: {
      projectId_kolId: { projectId: input.projectId, kolId: input.kolId },
    },
    create: {
      tenantId: ctx.tenantId,
      projectId: input.projectId,
      kolId: input.kolId,
      status: 'pending_send',
    },
    update: {},
  });

  const message = await db.outreachMessage.create({
    data: {
      tenantId: ctx.tenantId,
      threadId: thread.id,
      direction: 'sent',
      subject: input.subject,
      body: input.body,
      language: input.language ?? null,
      gateLogId: ctx.gateActionId ?? null, // 经闸门必非空（:468）；null 仅可能出现在被绕过的异常路径
      providerMessageId: sendResult.providerMessageId,
      sentAt: new Date(),
    },
  });

  // ── crmInfer 复用重算（三处复用铁律 ②：不得内联实现推断）──
  const [messages, signals, quotes] = await Promise.all([
    db.outreachMessage.findMany({
      where: { threadId: thread.id },
      select: { direction: true },
    }),
    db.signal.findMany({
      where: { threadId: thread.id },
      select: { id: true, type: true, payloadJson: true, detectedAt: true },
    }),
    db.quote.findMany({
      where: { threadId: thread.id },
      select: { status: true },
    }),
  ]);
  const inferred = inferCrmStatus({
    messages,
    signals: signals.map((s) => ({
      id: s.id,
      type: s.type,
      payload: s.payloadJson,
      detectedAt: s.detectedAt,
    })),
    quotes,
  });

  if (inferred.status !== thread.status) {
    await db.outreachThread.update({
      where: { id: thread.id },
      data: { status: inferred.status },
    });
    // 状态推进事件留痕（ADR-21：Signal + OperationLog 承载领域事件；ref 语义单一留给 PA，
    // 线程上下文入 payloadJson）。
    await db.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.agentId,
        summary: `触达状态推进：${thread.status} → ${inferred.status}`,
        projectId: input.projectId,
        payloadJson: {
          threadId: thread.id,
          from: thread.status,
          to: inferred.status,
        },
      },
    });
  }

  return {
    sent: true,
    already: false,
    to: kol.contactEmail,
    threadId: thread.id,
    messageId: message.id,
    providerMessageId: sendResult.providerMessageId,
    mocked: sendResult.mocked,
  };
}

export const sendOutreachTool: ToolDefinition<
  SendOutreachInput,
  SendOutreachOutput
> = {
  name: 'send_outreach',
  description:
    '向一位创作者发送触达邮件（对外·不可撤销）。收件地址取库内 contactEmail（未录入会明示拒绝）。这是 outbound 动作——服务端会强制停在你确认前，不会由 AI 直接发出。',
  class: 'outbound',
  source: 'native',
  inputSchema,
  buildHarm,
  execute: run,
};
