// M3-B-DELIVERY F009 — V7 交付台账数据组装（RSC 侧；沿 M3-A F008 loadReachSurfaceData 先例）
//
// 数据源 = 项目下全部 Deal 的 deliveryCheck 产物（三处复用铁律 ①：**页面渲染的 ready
// 与 payout 服务端硬闸是同一个纯函数的判定**，不在此另判一次）+ 已放款事实（Payout released）。
// 失败静默降级空表（CI 无库安全，reach/match 先例同款）。

import { prisma } from 'lib/db/prisma';
import { getDevTenantId } from 'lib/agent/context';
import { describeGaps, loadProjectDeliveryChecks } from 'lib/delivery/check';
import {
  EMPTY_DELIVERY_SURFACE,
  formatPayout,
  ledgerAvColor,
  type DeliveryLedgerRow,
  type DeliverySurfaceData,
} from 'lib/display/delivery-format';

/**
 * 行附注（V7 🔒 note 条件渲染）：优先人工写在条件行上的 note（原型「合同待补签」类），
 * 其次由缺口清单合成（「缺什么显什么」，与 payout 拒绝原因同一套文案）；都没有 → null。
 */
function noteOf(
  conditionNotes: (string | null)[],
  gapSummary: string,
): string | null {
  const manual = conditionNotes.filter(Boolean).join(' · ');
  if (manual) return manual;
  return gapSummary || null;
}

export async function loadDeliverySurfaceData(
  projectId: string,
): Promise<DeliverySurfaceData> {
  try {
    const tenantId = await getDevTenantId();
    const checks = await loadProjectDeliveryChecks(projectId, { tenantId });
    if (checks.length === 0) return EMPTY_DELIVERY_SURFACE;

    // 已放款事实（服务端真值；原 mock 的本地 paidIds 态退役）
    const released = await prisma.payout.findMany({
      where: {
        tenantId,
        status: 'released',
        dealId: { in: checks.map((c) => c.dealId) },
      },
      select: { dealId: true },
    });
    const paidDeals = new Set(released.map((p) => p.dealId));

    const rows: DeliveryLedgerRow[] = checks.map((c) => ({
      id: c.dealId,
      who: c.who,
      av: ledgerAvColor(c.kolId),
      sub: c.terms.deliverables.join('、') || '—',
      note: noteOf(
        c.check.conditions.map((x) => x.note),
        describeGaps(c.check),
      ),
      content: c.check.byKind.content.cell,
      key: c.check.byKind.key.cell,
      contract: c.check.byKind.contract.cell,
      escrow: c.check.byKind.escrow.cell,
      ad: c.check.byKind.ad_disclosure.cell,
      pay: formatPayout(c.terms.amount, c.terms.currency),
      ready: c.check.ready,
      paid: paidDeals.has(c.dealId),
    }));

    return { rows };
  } catch (err) {
    console.error('[delivery/surface] 组装失败，降级空表:', err);
    return EMPTY_DELIVERY_SURFACE;
  }
}
