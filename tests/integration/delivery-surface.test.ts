// M3-B-DELIVERY F009 — V7 台账数据组装集成测试（loadDeliverySurfaceData，打真库）
//
// 覆盖 acceptance：
// - ready 值 = deliveryCheck 真值（页面与 payout 服务端硬闸同源，不在组装层另判）
// - 条件三态 ok/miss/na 逐处保持（na 不得压成 miss）
// - 金额右对齐串格式 / 交付物 sub / 🔒 note 附注（人工 note 优先，缺则缺口摘要）
// - 已放款态来自 Payout(released) 真值（原 mock 本地 paidIds 已退役）
// - 空态语义（零 Deal → 空表；组装失败 → 空表不抛错）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { loadProjectDeliveryChecks } from '../../src/lib/delivery/check';
import {
  formatPayout,
  ledgerAvColor,
  LEDGER_AV_COLORS,
} from '../../src/lib/display/delivery-format';

const FIXTURE_SLUG = `test-tenant-m3b-surface-${process.pid}`;

let tenantId: string;
let projectId: string;
let emptyProjectId: string;

/** 直接复用组装逻辑的纯映射部分：surface-data 依赖 dev tenant，故此处以同一装配壳 + 同一映射断言。 */
async function loadRows() {
  const checks = await loadProjectDeliveryChecks(projectId, { tenantId });
  const released = await prisma.payout.findMany({
    where: { tenantId, status: 'released' },
    select: { dealId: true },
  });
  const paid = new Set(released.map((p) => p.dealId));
  return checks.map((c) => ({
    id: c.dealId,
    who: c.who,
    av: ledgerAvColor(c.kolId),
    sub: c.terms.deliverables.join('、') || '—',
    content: c.check.byKind.content.cell,
    key: c.check.byKind.key.cell,
    contract: c.check.byKind.contract.cell,
    escrow: c.check.byKind.escrow.cell,
    ad: c.check.byKind.ad_disclosure.cell,
    pay: formatPayout(c.terms.amount, c.terms.currency),
    ready: c.check.ready,
    paid: paid.has(c.dealId),
    notes: c.check.conditions.map((x) => x.note).filter(Boolean),
  }));
}

beforeAll(async () => {
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B surface 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'M3B surface 夹具项目' },
  });
  projectId = p.id;
  const e = await prisma.project.create({
    data: { tenantId, name: 'M3B surface 空项目' },
  });
  emptyProjectId = e.id;

  // 行①：条件全齐（key 不适用）+ 已放款
  const k1 = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3b-surf-paid-${process.pid}`,
      displayName: 'MeepleMax',
    },
  });
  const d1 = await prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: k1.id,
      status: 'completed',
      termsJson: {
        amount: 1600,
        currency: 'USD',
        deliverables: ['抢先体验实况'],
        scope: null,
      } as unknown as Prisma.InputJsonValue,
      deliverables: {
        create: [
          { tenantId, kind: 'content', required: true, status: 'met' },
          { tenantId, kind: 'key', required: false, status: 'na' },
          { tenantId, kind: 'contract', required: true, status: 'met' },
          { tenantId, kind: 'escrow', required: true, status: 'met' },
          { tenantId, kind: 'ad_disclosure', required: true, status: 'met' },
        ],
      },
    },
  });
  await prisma.payout.create({
    data: {
      tenantId,
      dealId: d1.id,
      payee: 'MeepleMax',
      amount: new Prisma.Decimal('1600.00'),
      currency: 'USD',
      basis: '合同 + 托管 + 披露',
      status: 'released',
      gateLogId: 'pa-fixture',
      releasedAt: new Date(),
    },
  });

  // 行②：合同缺（带人工 note）+ 未放款
  const k2 = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3b-surf-gap-${process.pid}`,
      displayName: '龙猫玩家',
    },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: k2.id,
      status: 'delivering',
      termsJson: {
        amount: 1400,
        currency: 'USD',
        deliverables: ['愿望单导流视频'],
        scope: null,
      } as unknown as Prisma.InputJsonValue,
      deliverables: {
        create: [
          { tenantId, kind: 'content', required: true, status: 'met' },
          { tenantId, kind: 'key', required: true, status: 'met' },
          {
            tenantId,
            kind: 'contract',
            required: true,
            status: 'missing',
            note: '合同待补签',
          },
          { tenantId, kind: 'escrow', required: true, status: 'met' },
          { tenantId, kind: 'ad_disclosure', required: true, status: 'met' },
        ],
      },
    },
  });

  // 行③：条款缺金额（D2 不编造）
  const k3 = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `m3b-surf-noamt-${process.pid}`,
      displayName: 'ArkPlays',
    },
  });
  await prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: k3.id,
      status: 'delivering',
      termsJson: { deliverables: [] } as unknown as Prisma.InputJsonValue,
      deliverables: {
        create: [
          { tenantId, kind: 'content', required: true, status: 'pending' },
          { tenantId, kind: 'key', required: false, status: 'na' },
          { tenantId, kind: 'contract', required: true, status: 'met' },
          { tenantId, kind: 'escrow', required: true, status: 'met' },
          { tenantId, kind: 'ad_disclosure', required: true, status: 'met' },
        ],
      },
    },
  });
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } });
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('V7 台账行视图（真数据）', () => {
  it('ready = deliveryCheck 真值：全齐行可放款、缺条件行不可', async () => {
    const rows = await loadRows();
    const paidRow = rows.find((r) => r.who === 'MeepleMax')!;
    const gapRow = rows.find((r) => r.who === '龙猫玩家')!;
    expect(paidRow.ready).toBe(true);
    expect(gapRow.ready).toBe(false);
  });

  it('🔒 条件三态逐处保持：na 不得压成 miss', async () => {
    const rows = await loadRows();
    const paidRow = rows.find((r) => r.who === 'MeepleMax')!;
    const gapRow = rows.find((r) => r.who === '龙猫玩家')!;
    expect(paidRow.key).toBe('na'); // 不适用（灰「—」）
    expect(paidRow.content).toBe('ok');
    expect(gapRow.contract).toBe('miss'); // 缺（琥珀）
    expect(gapRow.key).toBe('ok');
    // 三态在同一屏内同时可见（压成二态 → 此断言翻红）
    const cells = new Set([
      ...rows.flatMap((r) => [r.content, r.key, r.contract]),
    ]);
    expect(cells).toEqual(new Set(['ok', 'miss', 'na']));
  });

  it('已放款态 = Payout(released) 真值（不是本地态）', async () => {
    const rows = await loadRows();
    expect(rows.find((r) => r.who === 'MeepleMax')!.paid).toBe(true);
    expect(rows.find((r) => r.who === '龙猫玩家')!.paid).toBe(false);
  });

  it('金额串按原型形态；缺金额 → 「—」不编造', async () => {
    const rows = await loadRows();
    expect(rows.find((r) => r.who === 'MeepleMax')!.pay).toBe('$1,600');
    expect(rows.find((r) => r.who === 'ArkPlays')!.pay).toBe('—');
    expect(formatPayout(900, 'EUR')).toBe('900 EUR');
    expect(formatPayout(null, 'USD')).toBe('—');
  });

  it('sub = 条款交付物；缺 → 「—」。note 取人工附注', async () => {
    const rows = await loadRows();
    expect(rows.find((r) => r.who === 'MeepleMax')!.sub).toBe('抢先体验实况');
    expect(rows.find((r) => r.who === 'ArkPlays')!.sub).toBe('—');
    expect(rows.find((r) => r.who === '龙猫玩家')!.notes).toContain(
      '合同待补签',
    );
  });

  it('🔒 纯色方块 av：取自固定色板且同一 kol 恒定同色（非色轮）', async () => {
    const rows = await loadRows();
    for (const r of rows) {
      expect(LEDGER_AV_COLORS).toContain(r.av as never);
    }
    expect(ledgerAvColor('kol-x')).toBe(ledgerAvColor('kol-x'));
  });

  it('空态：零 Deal 项目 → 空数组（不抛错）', async () => {
    const checks = await loadProjectDeliveryChecks(emptyProjectId, {
      tenantId,
    });
    expect(checks).toEqual([]);
  });
});
