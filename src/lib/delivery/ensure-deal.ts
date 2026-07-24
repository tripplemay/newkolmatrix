// M3-B-DELIVERY F003 — Deal 生成服务（commit_quote 的唯一新增接线点，P2）。
//
// 「有 committed quote 必有 Deal」是 →delivery 守卫判据（architecture §5.3① :488）的数据前提，
// 所以本服务必须在 commit_quote 的**同一执行事务**内被调用（ctx.db 传入）——报价承诺落库了
// 而 Deal 没落，会让守卫与台账看不到这段合作。
//
// 纯规则在 domain 层（`domain/deliverable-plan.ts` 五条件生成 / `domain/deal-advance.ts` 状态机），
// 本文件是它们的数据装配 + 落库壳（recompute-status.ts 同款分层）。

import type { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import { planDeliverables } from 'lib/domain/deliverable-plan';

export interface EnsureDealInput {
  projectId: string;
  kolId: string;
  /** 来源报价（软引用；Deal.quoteId） */
  quoteId: string;
  amount: number;
  currency: string;
  /** Quote.deliverablesJson 的文本清单（五条件生成的判据） */
  deliverables: readonly string[];
  scope?: string | null;
}

export interface EnsureDealCtx {
  tenantId: string;
  /** 执行事务客户端（闸门 execute 路径传入，与 Quote 翻牌 + irrev 留痕同事务）。 */
  db?: Prisma.TransactionClient;
  /** 留痕 actor（人格 id / 'operator' / 'system'）。 */
  actor?: string | null;
}

export interface EnsureDealResult {
  dealId: string;
  /** true = 本次新建（false = 命中既有 Deal，幂等重入） */
  created: boolean;
  /** 本次实际插入的条件行数（幂等重入为 0） */
  deliverablesCreated: number;
  /** true = 既有 Deal 仍在 negotiating，条款快照被刷新为本次报价 */
  termsRefreshed: boolean;
}

/** 条款快照（冻结在 Deal 上，不随 Quote 后续变动——审计需要「当时承诺了什么」）。 */
function buildTerms(input: EnsureDealInput): Prisma.InputJsonValue {
  return {
    quoteId: input.quoteId,
    amount: input.amount,
    currency: input.currency,
    deliverables: [...input.deliverables],
    scope: input.scope ?? null,
    snapshotAt: new Date().toISOString(),
  } as Prisma.InputJsonValue;
}

/**
 * 由 committed Quote 保证 Deal 与五条件行存在（幂等）。
 *
 * 幂等语义（acceptance：重入不重复建）：
 * - Deal 以 `@@unique([projectId, kolId])` 为键，已存在则复用（一人一 Deal）
 * - 五条件行以 `@@unique([dealId, kind])` + `skipDuplicates` 保证不重复插入；
 *   历史 Deal 缺行也会在此补齐（自愈，且不覆盖任何已有行的人工核验结果）
 * - 既有 Deal 仍在 `negotiating`（尚未签约）时刷新条款快照；**已推进的 Deal 条款不动**——
 *   签约/托管之后再改条款必须走人工流程，不得由一次新报价静默改写（P2 审计口径）
 */
export async function ensureDealForQuote(
  input: EnsureDealInput,
  ctx: EnsureDealCtx,
): Promise<EnsureDealResult> {
  const db = ctx.db ?? prisma;
  const plan = planDeliverables(input.deliverables);

  const existing = await db.deal.findUnique({
    where: {
      projectId_kolId: { projectId: input.projectId, kolId: input.kolId },
    },
    select: { id: true, status: true },
  });

  if (existing == null) {
    const deal = await db.deal.create({
      data: {
        tenantId: ctx.tenantId,
        projectId: input.projectId,
        kolId: input.kolId,
        quoteId: input.quoteId,
        termsJson: buildTerms(input),
        status: 'negotiating', // 初态（P2）：签约/托管/交付各自有独立推进入口
      },
      select: { id: true },
    });
    const inserted = await db.deliverable.createMany({
      data: plan.map((row) => ({
        tenantId: ctx.tenantId,
        dealId: deal.id,
        kind: row.kind,
        status: row.status,
        required: row.required,
      })),
      skipDuplicates: true,
    });
    await db.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.actor ?? null,
        summary: `交易生成：报价承诺 → Deal（negotiating）+ ${inserted.count} 条交付条件`,
        projectId: input.projectId,
        payloadJson: {
          dealId: deal.id,
          kolId: input.kolId,
          quoteId: input.quoteId,
          deliverables: plan.map((p) => ({
            kind: p.kind,
            required: p.required,
          })),
        },
      },
    });
    return {
      dealId: deal.id,
      created: true,
      deliverablesCreated: inserted.count,
      termsRefreshed: false,
    };
  }

  // ── 幂等重入 / 二次报价 ──
  const termsRefreshed = existing.status === 'negotiating';
  if (termsRefreshed) {
    await db.deal.update({
      where: { id: existing.id },
      data: { quoteId: input.quoteId, termsJson: buildTerms(input) },
    });
  }

  // 缺行自愈：只补不覆盖（skipDuplicates），已有行的人工核验结果原样保留
  const inserted = await db.deliverable.createMany({
    data: plan.map((row) => ({
      tenantId: ctx.tenantId,
      dealId: existing.id,
      kind: row.kind,
      status: row.status,
      required: row.required,
    })),
    skipDuplicates: true,
  });

  // 条款刷新时同步 key 行的必需性——**仅限尚未被人碰过的行**
  // （status 仍是初态 pending/na 且无证据、无核验人）。人的核验永远优先于关键词判定。
  if (termsRefreshed) {
    const planned = plan.find((p) => p.kind === 'key');
    if (planned != null) {
      await db.deliverable.updateMany({
        where: {
          dealId: existing.id,
          kind: 'key',
          status: { in: ['pending', 'na'] },
          evidenceRef: null,
          verifiedBy: null,
        },
        data: { required: planned.required, status: planned.status },
      });
    }
  }

  return {
    dealId: existing.id,
    created: false,
    deliverablesCreated: inserted.count,
    termsRefreshed,
  };
}
