// M3-B-DELIVERY F008 — 交付登记服务（三端点的业务实现，P4）
//
// 为什么是人工登记（P4 / U2）：合同签署与资金托管在**外部**真实完成（电子签平台 / 托管方），
// 本系统只登记引用 + 记录状态 —— 无 partner webhook 时，人工登记是唯一诚实的状态来源，
// 比「假装自动回调」符合 D2 诚实降级。
//
// 三个动作都是 internal（可撤销、不对外、不花钱，D27）：不过闸门，但**都写 OperationLog 留痕**。
// 事务纪律（M3-A F004-low soft-watch 同款范式转正）：一个登记动作里的
// 「写引用 + 翻条件 + 推进状态 + 留痕」在**同一个 $transaction** 内，不留半成品。

import { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import { advanceDealTo } from 'lib/delivery/deal-status';
import { assertKeyRefNotPlaintext } from 'lib/delivery/key-ref';
import { checkDeliveryRow, type DeliveryCheckResult } from 'lib/domain/delivery-check';
import type {
  RegisterKeysInput,
  RegisterRefsInput,
  VerifyDeliverableInput,
} from 'lib/data/schemas/delivery';

export interface RegisterCtx {
  tenantId: string;
  /** 操作者（单角色 dev：'operator'）。 */
  actor?: string | null;
}

export class DeliveryRegisterError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID',
    message: string,
  ) {
    super(message);
    this.name = 'DeliveryRegisterError';
  }
}

/** 事务内重算条件（登记后的即时反馈，调用方不必再查一次）。 */
async function recheck(
  tx: Prisma.TransactionClient,
  dealId: string,
): Promise<DeliveryCheckResult> {
  const deal = await tx.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      status: true,
      deliverables: {
        select: {
          kind: true,
          status: true,
          required: true,
          evidenceRef: true,
          note: true,
        },
      },
    },
  });
  if (!deal) throw new DeliveryRegisterError('NOT_FOUND', '交易不存在');
  return checkDeliveryRow({
    deal: { id: deal.id, status: deal.status as never },
    deliverables: deal.deliverables.map((d) => ({
      kind: d.kind as never,
      status: d.status as never,
      required: d.required,
      evidenceRef: d.evidenceRef,
      note: d.note,
    })),
  });
}

// ───────────────────────── ① 登记 contract / escrow 单号 ─────────────────────────

export interface RegisterRefsResult {
  dealId: string;
  contractRef: string | null;
  escrowRef: string | null;
  dealStatus: string;
  /** 本次置为 met 的条件 */
  metKinds: string[];
  check: DeliveryCheckResult;
}

/**
 * 登记外部合同 / 托管单号：写引用 → 对应条件置 met → Deal 推进（signed / escrowed）。
 *
 * 推进规则（P4）：登记 contractRef → 至少 signed；登记 escrowRef → 至少 escrowed
 *（两者同时登记则一次到 escrowed，途经 signed 由 advanceDealTo 逐级走）。
 * 已越过该阶段的 Deal 不倒流（advanceDealTo 幂等）。
 */
export async function registerDealRefs(
  dealId: string,
  input: RegisterRefsInput,
  ctx: RegisterCtx,
): Promise<RegisterRefsResult> {
  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findFirst({
      where: { id: dealId, tenantId: ctx.tenantId },
      select: {
        id: true,
        projectId: true,
        status: true,
        contractRef: true,
        escrowRef: true,
      },
    });
    if (!deal) throw new DeliveryRegisterError('NOT_FOUND', '交易不存在');
    if (deal.status === 'defaulted') {
      throw new DeliveryRegisterError(
        'CONFLICT',
        '交易已违约收尾（defaulted），不接受新的登记',
      );
    }

    const metKinds: string[] = [];
    const data: { contractRef?: string; escrowRef?: string } = {};
    if (input.contractRef != null) {
      data.contractRef = input.contractRef;
      metKinds.push('contract');
    }
    if (input.escrowRef != null) {
      data.escrowRef = input.escrowRef;
      metKinds.push('escrow');
    }

    await tx.deal.update({ where: { id: deal.id }, data });
    for (const kind of metKinds) {
      // 登记即满足该条件；证据引用 = 登记的单号（人可回溯到外部系统）
      await tx.deliverable.updateMany({
        where: { dealId: deal.id, kind: kind as never },
        data: {
          status: 'met',
          evidenceRef:
            kind === 'contract' ? data.contractRef : data.escrowRef,
          verifiedBy: ctx.actor ?? 'operator',
        },
      });
    }

    // 状态推进：托管优先（更靠后的阶段）
    const target = data.escrowRef != null ? 'escrowed' : 'signed';
    let dealStatus = deal.status as string;
    if (deal.status !== 'blocked') {
      const adv = await advanceDealTo(deal.id, target, {
        tenantId: ctx.tenantId,
        db: tx,
        actor: ctx.actor ?? 'operator',
        reason: `登记${data.contractRef != null ? '合同' : ''}${
          data.escrowRef != null ? '托管' : ''
        }单号`,
      });
      dealStatus = adv.changed ? adv.to : adv.from;
    }
    // blocked 的交易：允许登记引用与条件，但**不推进状态**——恢复需人显式处理（D2 不替人决定）

    await tx.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.actor ?? 'operator',
        summary: `交付登记：${metKinds
          .map((k) => (k === 'contract' ? '合同' : '托管'))
          .join(' + ')}单号已登记`,
        projectId: deal.projectId,
        payloadJson: {
          dealId: deal.id,
          contractRef: data.contractRef ?? deal.contractRef,
          escrowRef: data.escrowRef ?? deal.escrowRef,
          metKinds,
        },
      },
    });

    const check = await recheck(tx, deal.id);
    return {
      dealId: deal.id,
      contractRef: data.contractRef ?? deal.contractRef,
      escrowRef: data.escrowRef ?? deal.escrowRef,
      dealStatus,
      metKinds,
      check,
    };
  });
}

// ───────────────────────── ② Deliverable 人工核验 ─────────────────────────

export interface VerifyDeliverableResult {
  deliverableId: string;
  dealId: string;
  kind: string;
  status: string;
  evidenceRef: string | null;
  check: DeliveryCheckResult;
}

/** 人工核验一条交付条件（met / missing / na + 证据引用 + 核验人）。 */
export async function verifyDeliverable(
  deliverableId: string,
  input: VerifyDeliverableInput,
  ctx: RegisterCtx,
): Promise<VerifyDeliverableResult> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.deliverable.findFirst({
      where: { id: deliverableId, tenantId: ctx.tenantId },
      select: {
        id: true,
        dealId: true,
        kind: true,
        status: true,
        deal: { select: { projectId: true, status: true } },
      },
    });
    if (!row) throw new DeliveryRegisterError('NOT_FOUND', '交付条件不存在');
    if (row.deal.status === 'defaulted') {
      throw new DeliveryRegisterError(
        'CONFLICT',
        '交易已违约收尾（defaulted），不接受核验变更',
      );
    }

    const updated = await tx.deliverable.update({
      where: { id: row.id },
      data: {
        status: input.status,
        // 显式传 null = 撤回证据（与「不传 = 保持原值」可区分）
        ...(input.evidenceRef !== undefined
          ? { evidenceRef: input.evidenceRef }
          : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        verifiedBy: input.verifiedBy ?? ctx.actor ?? 'operator',
      },
      select: { id: true, kind: true, status: true, evidenceRef: true },
    });

    await tx.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: input.verifiedBy ?? ctx.actor ?? 'operator',
        summary: `交付核验：${row.kind} ${row.status} → ${input.status}`,
        projectId: row.deal.projectId,
        payloadJson: {
          dealId: row.dealId,
          deliverableId: row.id,
          kind: row.kind,
          from: row.status,
          to: input.status,
          evidenceRef: input.evidenceRef ?? null,
        },
      },
    });

    return {
      deliverableId: updated.id,
      dealId: row.dealId,
      kind: updated.kind,
      status: updated.status,
      evidenceRef: updated.evidenceRef,
      check: await recheck(tx, row.dealId),
    };
  });
}

// ───────────────────────── ③ key 池登记 ─────────────────────────

export interface RegisterKeysResult {
  dealId: string;
  /** 本次新登记的条目数（重复引用跳过，不重复建） */
  registered: number;
  /** 因已登记而跳过的引用 */
  skipped: string[];
  /** 该交易当前可发放（reserved）条目数 */
  available: number;
}

/**
 * 登记 key 池条目（**引用不是明文 key 值**，P8：写入口守卫在此）。
 * 幂等：同一 Deal 下重复引用跳过不重复建。
 */
export async function registerKeyPool(
  dealId: string,
  input: RegisterKeysInput,
  ctx: RegisterCtx,
): Promise<RegisterKeysResult> {
  // 写入口守卫：形似明文激活码一律拒（在事务外先拦——不合法输入不该开事务）
  for (const ref of input.keyRefs) assertKeyRefNotPlaintext(ref);

  return prisma.$transaction(async (tx) => {
    const deal = await tx.deal.findFirst({
      where: { id: dealId, tenantId: ctx.tenantId },
      select: { id: true, projectId: true, status: true },
    });
    if (!deal) throw new DeliveryRegisterError('NOT_FOUND', '交易不存在');
    if (deal.status === 'defaulted') {
      throw new DeliveryRegisterError(
        'CONFLICT',
        '交易已违约收尾（defaulted），不接受 key 登记',
      );
    }

    const existing = await tx.gameKey.findMany({
      where: { dealId: deal.id },
      select: { keyRef: true },
    });
    const known = new Set(existing.map((k) => k.keyRef));
    const unique = Array.from(new Set(input.keyRefs));
    const fresh = unique.filter((ref) => !known.has(ref));
    const skipped = unique.filter((ref) => known.has(ref));

    if (fresh.length > 0) {
      await tx.gameKey.createMany({
        data: fresh.map((keyRef) => ({
          tenantId: ctx.tenantId,
          dealId: deal.id,
          keyRef,
          status: 'reserved' as const,
        })),
      });
    }

    await tx.operationLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: 'auto',
        actor: ctx.actor ?? 'operator',
        summary: `key 池登记：新增 ${fresh.length} 条${
          skipped.length > 0 ? `（跳过已存在 ${skipped.length} 条）` : ''
        }`,
        projectId: deal.projectId,
        payloadJson: {
          dealId: deal.id,
          registered: fresh, // 引用，非明文 key
          skipped,
        },
      },
    });

    const available = await tx.gameKey.count({
      where: { dealId: deal.id, status: 'reserved' },
    });
    return {
      dealId: deal.id,
      registered: fresh.length,
      skipped,
      available,
    };
  });
}
