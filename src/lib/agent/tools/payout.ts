// M3-B-DELIVERY F005 — payout 工具（outbound/native，放款过闸门 + 服务端二次校验）
//
// class:'outbound'（对外·不可撤销：资金动作）→ 服务端强制停在确认前。
//
// ── P6 防绕过铁律（FR-8.2.4.2「无绕过入口」的服务端实现）──
// `buildHarm` 与 `execute` **各重跑一次 deliveryCheck**：
//   ① buildHarm 阶段 ready=false → 抛错，动作在落 PendingAction **之前**被拒（连待办都不产生）
//   ② execute 阶段再核一次 → 即使有人绕过前端直打 /api/actions/[id]/execute，
//      或在 pending→confirm 窗口内条件退化（证据被撤回/条件被改 missing），一样拒
// 前端条件渲染（V7 只给 ready 行放款按钮）只是 UX；服务端这两道才是硬闸。
//
// ── P1 零真实资金动作 ──
// 「执行」= 消费票 → mock `EscrowPartner.release()`（写 RELEASED_MARKER 日志，零外呼）
// → `Payout prepared→released` + gateLogId + Deal 推进 completed，**同一事务**。
// 本批不接任何真实付款接口，也不留可误触的开关（ops/partner/index.ts 选择器恒 mock）。
//
// 金额来源：`Deal.termsJson` 快照（committed Quote 的冻结条款），**不接受模型转述金额**——
// 与 §9.5「buildHarm 从 DB 读真值」同一纪律。

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import { describeGaps, loadDeliveryCheck } from 'lib/delivery/check';
import { advanceDealTo } from 'lib/delivery/deal-status';
import { getEscrowPartner } from 'lib/ops/partner';
import type { ToolContext, ToolDefinition } from './types';
import { HARM_LABEL, type Harm } from '../gate/harm';

const inputSchema = z.object({
  dealId: z
    .string()
    .min(1)
    .describe('交易 Deal.id（金额与依据取库内条款快照，不接受直填金额）'),
});

type PayoutInput = z.infer<typeof inputSchema>;

interface PayoutOutput {
  released: true;
  /** true = 幂等重入（同一闸门动作已放过，未重复放款）。 */
  already: boolean;
  payoutId: string;
  dealId: string;
  payee: string;
  amount: number;
  currency: string;
  dealStatus: string;
  /** true = mock EscrowPartner（**未发生任何真实资金动作**，P1）。 */
  mocked: boolean;
}

/** 明示拒绝文案锚点（测试断言引用，沿 NO_CONTACT_EMAIL_MSG 先例）。 */
export const PAYOUT_NOT_READY_MSG =
  '交付条件未齐——服务端拒绝放款（FR-8.2.4.2：无绕过入口）';
export const PAYOUT_DEAL_NOT_FOUND_MSG = '交易不存在';
export const PAYOUT_NO_AMOUNT_MSG =
  '条款快照缺金额/币种——拒绝猜测放款金额（P3 明示拒绝不猜）';

interface ResolvedPayout {
  dealId: string;
  projectId: string;
  payee: string;
  amount: number;
  currency: string;
  basis: string;
  escrowRef: string | null;
}

/**
 * 加载 + 服务端校验（buildHarm 与 execute 共用同一实现——两处各调一次，
 * 但**判定逻辑只有一份**，不存在「披露时用一套规则、执行时用另一套」的缝）。
 */
async function resolveAndAssertReady(
  input: PayoutInput,
  ctx: ToolContext,
): Promise<ResolvedPayout> {
  const row = await loadDeliveryCheck(input.dealId, {
    tenantId: ctx.tenantId,
    db: ctx.db,
  });
  if (row == null) {
    throw new Error(`[payout] ${PAYOUT_DEAL_NOT_FOUND_MSG}: ${input.dealId}`);
  }
  if (!row.check.ready) {
    // 缺什么说什么（不是一句「条件不足」）——人据此知道去补哪一项
    throw new Error(
      `[payout] ${PAYOUT_NOT_READY_MSG}。当前缺口：${describeGaps(row.check)}`,
    );
  }
  if (row.terms.amount == null || !row.terms.currency) {
    throw new Error(`[payout] ${PAYOUT_NO_AMOUNT_MSG}（deal=${row.dealId}）`);
  }

  // 依据三件套：合同 + 托管 + 披露证据引用（缺引用则如实写「已核验」而不是编造单号）
  const disclosure = row.check.byKind.ad_disclosure;
  const content = row.check.byKind.content;
  const basis = [
    `合同 ${row.contractRef ?? '已核验（未登记单号）'}`,
    `托管 ${row.escrowRef ?? '已核验（未登记单号）'}`,
    `#ad 披露 ${disclosure?.evidenceRef ?? '已核验（未登记证据引用）'}`,
    `内容 ${content?.evidenceRef ?? '已核验（未登记证据引用）'}`,
  ].join(' · ');

  return {
    dealId: row.dealId,
    projectId: row.projectId,
    payee: row.who,
    amount: row.terms.amount,
    currency: row.terms.currency,
    basis,
    escrowRef: row.escrowRef,
  };
}

/** async buildHarm（§9.5）：三行 = 收款方 / 金额+币种 / 依据。ready=false 在此即拒（不落 PendingAction）。 */
async function buildHarm(
  input: PayoutInput,
  ctx: ToolContext,
): Promise<Harm> {
  const r = await resolveAndAssertReady(input, ctx);
  return {
    action: 'payout',
    summary: `向 ${r.payee} 放款 ${r.amount} ${r.currency}`,
    targets: [r.payee], // ① 收款方
    amount: r.amount, // ② 金额（NFR-I4 带币种）
    currency: r.currency,
    irreversible: true,
    evidence: `依据：${r.basis}`, // ③ 依据（合同 + 托管 + 披露证据引用）
    expiresAt: new Date().toISOString(), // gate 会以其 TTL 覆盖为准
    label: HARM_LABEL,
  };
}

async function run(input: PayoutInput, ctx: ToolContext): Promise<PayoutOutput> {
  const db = ctx.db ?? prisma;

  // ── 幂等重入（P6，幂等键 = PendingAction.id）：同一闸门动作已放款 → 不重复放 ──
  if (ctx.gateActionId) {
    const existing = await db.payout.findFirst({
      where: {
        tenantId: ctx.tenantId,
        gateLogId: ctx.gateActionId,
        status: 'released',
      },
      select: { id: true, dealId: true, payee: true, amount: true, currency: true },
    });
    if (existing) {
      const deal = await db.deal.findUnique({
        where: { id: existing.dealId },
        select: { status: true },
      });
      return {
        released: true,
        already: true,
        payoutId: existing.id,
        dealId: existing.dealId,
        payee: existing.payee,
        amount: Number(existing.amount),
        currency: existing.currency,
        dealStatus: deal?.status ?? 'unknown',
        // 重入路径不重新调 partner——本批恒 mock，如实报 true（M5 接真后应按原记录推断）
        mocked: true,
      };
    }
  }

  // ── 服务端二次校验（P6）：execute 阶段重跑 deliveryCheck ──
  // 绕过前端直打 execute、或 pending→confirm 窗口内条件退化，都在这里被拒。
  const r = await resolveAndAssertReady(input, ctx);

  // Payout 状态机：prepared → released（同一执行事务内两步，行诚实走过两态；
  // released 必带 gateLogId——不存在不经闸门的 released 行）。
  const payout = await db.payout.create({
    data: {
      tenantId: ctx.tenantId,
      dealId: r.dealId,
      payee: r.payee,
      amount: new Prisma.Decimal(r.amount.toFixed(2)),
      currency: r.currency,
      basis: r.basis,
      status: 'prepared',
    },
    select: { id: true },
  });

  // 外部副作用面（本批 = mock，零外呼、零真实资金动作）
  const release = await getEscrowPartner().release(
    {
      dealId: r.dealId,
      payee: r.payee,
      amount: r.amount,
      currency: r.currency,
      basis: r.basis,
      escrowRef: r.escrowRef,
      idempotencyKey: ctx.gateActionId ?? payout.id,
    },
    { tenantId: ctx.tenantId, db: ctx.db, agentId: ctx.agentId },
  );

  await db.payout.update({
    where: { id: payout.id },
    data: {
      status: 'released',
      gateLogId: ctx.gateActionId ?? null,
      releasedAt: new Date(),
    },
  });

  // Deal 推进到 completed（逐级走主线，不跳态——服务在 deal-status.ts）
  const advanced = await advanceDealTo(r.dealId, 'completed', {
    tenantId: ctx.tenantId,
    db: ctx.db,
    actor: ctx.agentId,
    reason: '放款完成',
  });

  return {
    released: true,
    already: false,
    payoutId: payout.id,
    dealId: r.dealId,
    payee: r.payee,
    amount: r.amount,
    currency: r.currency,
    dealStatus: advanced.changed ? advanced.to : advanced.from,
    mocked: release.mocked,
  };
}

export const payoutTool: ToolDefinition<PayoutInput, PayoutOutput> = {
  name: 'payout',
  description:
    '向创作者放款（对外·不可撤销的资金动作）。这是 outbound 动作——服务端会强制停在你确认前，' +
    '且交付条件未齐时服务端直接拒绝，不存在绕过入口。金额取交易条款快照，不接受直填。',
  class: 'outbound',
  source: 'native',
  inputSchema,
  buildHarm,
  execute: run,
};
