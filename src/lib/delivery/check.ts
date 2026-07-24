// M3-B-DELIVERY F005 — deliveryCheck 的数据装配壳（有 DB；纯判定在 domain/delivery-check.ts）。
//
// 三处复用铁律（domain/delivery-check.ts 文件头 ①②③）的**共同装配点**：
// V7 台账（F009）/ check_deliverables 工具（F007）/ payout 服务端二次校验（F005）
// 都经本文件加载事实，再交同一个纯函数判定——「加载 → 判定」这段舞步只有一份实现
// （recompute-status.ts 同款分层）。

import type { Prisma } from '@prisma/client';
import { prisma } from 'lib/db/prisma';
import {
  checkDeliveryRow,
  type DeliverableKind,
  type DeliverableStatus,
  type DealStatus,
  type DeliveryCheckResult,
} from 'lib/domain/delivery-check';

export interface DeliveryLoadCtx {
  tenantId: string;
  /** 执行事务客户端（闸门 execute 路径传入，校验读的是事务内一致快照）。 */
  db?: Prisma.TransactionClient;
}

/** 一个 Deal 的核对结果 + 渲染/披露所需的周边事实。 */
export interface LoadedDeliveryRow {
  dealId: string;
  projectId: string;
  kolId: string;
  /** 创作者展示名（放款披露的收款方、台账行 who） */
  who: string;
  status: DealStatus;
  contractRef: string | null;
  escrowRef: string | null;
  /** 条款快照（金额/币种/交付物/范围）——放款金额取此处，不取模型转述 */
  terms: {
    amount: number | null;
    currency: string | null;
    deliverables: string[];
    scope: string | null;
  };
  check: DeliveryCheckResult;
}

/** termsJson 读侧宽松降级（D2：脏数据不崩，缺什么显 null）。 */
function readTerms(raw: unknown): LoadedDeliveryRow['terms'] {
  const t = (typeof raw === 'object' && raw != null ? raw : {}) as Record<
    string,
    unknown
  >;
  const amount = typeof t.amount === 'number' ? t.amount : null;
  const currency = typeof t.currency === 'string' ? t.currency : null;
  const deliverables = Array.isArray(t.deliverables)
    ? t.deliverables.filter((d): d is string => typeof d === 'string')
    : [];
  const scope = typeof t.scope === 'string' ? t.scope : null;
  return { amount, currency, deliverables, scope };
}

const DEAL_SELECT = {
  id: true,
  projectId: true,
  kolId: true,
  status: true,
  contractRef: true,
  escrowRef: true,
  termsJson: true,
  kol: { select: { displayName: true, handle: true } },
  deliverables: {
    select: {
      kind: true,
      status: true,
      required: true,
      evidenceRef: true,
      note: true,
    },
  },
} as const;

type DealRow = {
  id: string;
  projectId: string;
  kolId: string;
  status: string;
  contractRef: string | null;
  escrowRef: string | null;
  termsJson: unknown;
  kol: { displayName: string | null; handle: string | null };
  deliverables: {
    kind: string;
    status: string;
    required: boolean;
    evidenceRef: string | null;
    note: string | null;
  }[];
};

function toLoadedRow(deal: DealRow): LoadedDeliveryRow {
  const check = checkDeliveryRow({
    deal: { id: deal.id, status: deal.status as DealStatus },
    deliverables: deal.deliverables.map((d) => ({
      kind: d.kind as DeliverableKind,
      status: d.status as DeliverableStatus,
      required: d.required,
      evidenceRef: d.evidenceRef,
      note: d.note,
    })),
  });
  return {
    dealId: deal.id,
    projectId: deal.projectId,
    kolId: deal.kolId,
    who: deal.kol.displayName ?? deal.kol.handle ?? deal.kolId,
    status: deal.status as DealStatus,
    contractRef: deal.contractRef,
    escrowRef: deal.escrowRef,
    terms: readTerms(deal.termsJson),
    check,
  };
}

/** 单个 Deal 的条件核对（不存在返回 null——调用方决定是 404 还是明示拒绝）。 */
export async function loadDeliveryCheck(
  dealId: string,
  ctx: DeliveryLoadCtx,
): Promise<LoadedDeliveryRow | null> {
  const db = ctx.db ?? prisma;
  const deal = await db.deal.findFirst({
    where: { id: dealId, tenantId: ctx.tenantId },
    select: DEAL_SELECT,
  });
  if (!deal) return null;
  return toLoadedRow(deal as unknown as DealRow);
}

/** 一个项目下全部 Deal 的条件核对（V7 台账数据源，F009）。按 createdAt 升序稳定。 */
export async function loadProjectDeliveryChecks(
  projectId: string,
  ctx: DeliveryLoadCtx,
): Promise<LoadedDeliveryRow[]> {
  const db = ctx.db ?? prisma;
  const deals = await db.deal.findMany({
    where: { projectId, tenantId: ctx.tenantId },
    select: DEAL_SELECT,
    orderBy: { createdAt: 'asc' },
  });
  return (deals as unknown as DealRow[]).map(toLoadedRow);
}

/** 缺口清单 → 一行人类可读摘要（拒绝原因 / 台账附注共用，避免两处各写一套文案）。 */
export function describeGaps(check: DeliveryCheckResult): string {
  const LABEL: Record<DeliverableKind, string> = {
    content: '内容',
    key: 'Key',
    contract: '合同',
    escrow: '托管',
    ad_disclosure: '#ad 披露',
  };
  return check.gaps
    .map((g) => {
      if (g.kind == null) {
        return g.reason === 'DEAL_BLOCKED'
          ? '交易处于争议/暂停（blocked）'
          : '交易已违约收尾（defaulted）';
      }
      const label = LABEL[g.kind];
      switch (g.reason) {
        case 'MISSING':
          return `${label} 缺`;
        case 'PENDING':
          return `${label} 未核验`;
        case 'NA_BUT_REQUIRED':
          return `${label} 被标为不适用但本合作必需`;
        case 'ROW_ABSENT':
          return `${label} 条件行缺失`;
        default:
          return `${label} 不齐`;
      }
    })
    .join('、');
}
