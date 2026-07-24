// M3-B-DELIVERY F007 — Evaluator 独立探针（不属产品实现，仅验收取证用）
//
// 与 Generator 的 tests/integration/delivery-tools.test.ts 相互独立：
// 后者用 2 笔固定夹具；本探针用**随机化矩阵夹具（24 笔）**做以下四类独立核：
//
// A. 内部一致性不变式：ready ⟺ gaps 为空 ⟺ gapSummary 为空（首轮验收曾观测到
//    「ready=false 但 gapSummary=''」的单次异常，本探针用 240 次调用尝试复现）
// B. 「不内联重算」的第二种独立核法（除 grep 外）：工具输出的 conditions/ready/gaps
//    与 domain 纯函数 checkDeliveryRow 按库内事实直算的结果**逐字相等**（24 组矩阵全覆盖）
// C. internal 语义硬核：直调既不产生 PendingAction，也不产生任何 DB 写（全表计数不变）
// D. 可序列化 + 输入契约 + 租户隔离（check_deliverables 只吃 dealId，跨租户不得读出）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import {
  DELIVERABLE_KINDS,
  checkDeliveryRow,
  type DeliverableStatus,
  type DealStatus,
} from '../../src/lib/domain/delivery-check';
import type { ToolContext } from '../../src/lib/agent/tools/types';
import type {
  CheckDeliverablesOutput,
  TrackDeliveryOutput,
} from '../../src/lib/agent/tools/delivery-tracking';

const SLUG = `test-tenant-m3b-f007probe-${process.pid}`;

const STATUSES: DeliverableStatus[] = ['pending', 'met', 'missing', 'na'];
const DEAL_STATUSES: DealStatus[] = [
  'negotiating',
  'signed',
  'escrowed',
  'delivering',
  'completed',
  'blocked',
  'defaulted',
];

let tenantId: string;
let projectId: string;
let otherTenantId: string;
let otherTenantDealId: string;
let ctx: ToolContext;
const dealIds: string[] = [];

/** 确定性伪随机（同一次验收可复现；不用 Math.random 以免报告无法复跑）。 */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: SLUG, name: 'F007 evaluator probe 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'F007 probe 项目' },
  });
  projectId = p.id;
  ctx = { tenantId, agentId: 'delivery', projectId, env: 'default' };

  // 24 笔矩阵夹具：五条件状态 × required 组合 × Deal 七态轮转（含 blocked / defaulted）
  const rnd = prng(20260723);
  for (let i = 0; i < 24; i += 1) {
    const kol = await prisma.kol.create({
      data: {
        tenantId,
        canonicalHandle: `f007probe-${process.pid}-${i}`,
        displayName: `Probe${i}`,
      },
    });
    const deal = await prisma.deal.create({
      data: {
        tenantId,
        projectId,
        kolId: kol.id,
        status: DEAL_STATUSES[i % DEAL_STATUSES.length],
        termsJson: {
          amount: 1000 + i,
          currency: 'USD',
          deliverables: ['视频', 'key'],
          scope: `probe-${i}`,
        } as unknown as Prisma.InputJsonValue,
        contractRef: i % 3 === 0 ? `sign-${i}` : null,
        escrowRef: i % 4 === 0 ? `esc-${i}` : null,
        deliverables: {
          // i===23 故意只建 3 类行（触发 ROW_ABSENT 分支）
          create: DELIVERABLE_KINDS.filter(
            (_k, ki) => !(i === 23 && ki >= 3),
          ).map((kind) => ({
            tenantId,
            kind,
            status: STATUSES[Math.floor(rnd() * STATUSES.length)],
            required: rnd() > 0.3,
            note: rnd() > 0.6 ? `note-${kind}-${i}` : null,
            evidenceRef: rnd() > 0.7 ? `ev-${kind}-${i}` : null,
          })),
        },
      },
    });
    dealIds.push(deal.id);
  }

  // 跨租户样本（check_deliverables 只吃 dealId，不得读出他租户数据）
  const ot = await prisma.tenant.create({
    data: { slug: `${SLUG}-other`, name: 'F007 probe 他租户' },
  });
  otherTenantId = ot.id;
  const op = await prisma.project.create({
    data: { tenantId: otherTenantId, name: '他租户项目' },
  });
  const okol = await prisma.kol.create({
    data: {
      tenantId: otherTenantId,
      canonicalHandle: `f007probe-other-${process.pid}`,
      displayName: 'OtherTenantKol',
    },
  });
  const od = await prisma.deal.create({
    data: {
      tenantId: otherTenantId,
      projectId: op.id,
      kolId: okol.id,
      status: 'delivering',
      termsJson: {
        amount: 9999,
        currency: 'USD',
      } as unknown as Prisma.InputJsonValue,
      deliverables: {
        create: DELIVERABLE_KINDS.map((kind) => ({
          tenantId: otherTenantId,
          kind,
          status: 'met' as DeliverableStatus,
          required: true,
        })),
      },
    },
  });
  otherTenantDealId = od.id;
}, 60_000);

afterAll(async () => {
  for (const tid of [tenantId, otherTenantId]) {
    if (!tid) continue;
    await prisma.operationLog.deleteMany({ where: { tenantId: tid } });
    await prisma.pendingAction.deleteMany({ where: { tenantId: tid } });
    await prisma.project.deleteMany({ where: { tenantId: tid } });
    await prisma.kol.deleteMany({ where: { tenantId: tid } });
    await prisma.tenant.deleteMany({ where: { id: tid } });
  }
  await prisma.$disconnect();
});

// ───────────────────────── A. 不变式（异常复现尝试）─────────────────────────

describe('A. ready ⟺ gaps 空 ⟺ gapSummary 空（不变式，10×24=240 次调用）', () => {
  it('240 次 check_deliverables 调用中不变式恒成立', async () => {
    const violations: string[] = [];
    for (let round = 0; round < 10; round += 1) {
      for (const dealId of dealIds) {
        const out = (await executeTool('check_deliverables', { dealId }, ctx))
          .output as CheckDeliverablesOutput;
        const row = out.row!;
        const gapsEmpty = row.gaps.length === 0;
        const summaryEmpty = row.gapSummary === '';
        if (row.ready !== gapsEmpty || gapsEmpty !== summaryEmpty) {
          violations.push(
            `round=${round} deal=${dealId} ready=${row.ready} gaps=${
              row.gaps.length
            } summary=${JSON.stringify(row.gapSummary)}`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  }, 120_000);

  it('track_delivery 的 readyCount 与逐行 ready 自洽，且非 ready 行必有非空缺口摘要', async () => {
    const out = (await executeTool('track_delivery', { projectId }, ctx))
      .output as TrackDeliveryOutput;
    expect(out.total).toBe(dealIds.length);
    expect(out.readyCount).toBe(out.rows.filter((r) => r.ready).length);
    for (const r of out.rows) {
      if (!r.ready) {
        expect(
          r.gaps.length,
          `deal ${r.dealId} 非 ready 却无缺口`,
        ).toBeGreaterThan(0);
        expect(r.gapSummary, `deal ${r.dealId} 非 ready 却无摘要`).not.toBe('');
      } else {
        expect(r.gaps).toEqual([]);
        expect(r.gapSummary).toBe('');
      }
    }
  });
});

// ───────────────── B. 不内联重算（与 domain 纯函数逐字比对，24 组）─────────────────

describe('B. check_deliverables / track_delivery 输出 = deliveryCheck 产物', () => {
  it('24 组矩阵：conditions / ready / gaps 与纯函数直算逐字相等', async () => {
    for (const dealId of dealIds) {
      const deal = await prisma.deal.findUniqueOrThrow({
        where: { id: dealId },
      });
      const rows = await prisma.deliverable.findMany({ where: { dealId } });
      const expected = checkDeliveryRow({
        deal: { id: dealId, status: deal.status as DealStatus },
        deliverables: rows.map((d) => ({
          kind: d.kind as never,
          status: d.status as never,
          required: d.required,
          evidenceRef: d.evidenceRef,
          note: d.note,
        })),
      });
      const out = (await executeTool('check_deliverables', { dealId }, ctx))
        .output as CheckDeliverablesOutput;
      expect(out.found, dealId).toBe(true);
      expect(out.row?.conditions, dealId).toEqual(expected.conditions);
      expect(out.row?.ready, dealId).toBe(expected.ready);
      expect(out.row?.gaps, dealId).toEqual(expected.gaps);
      // 五条件恒五行（含 ROW_ABSENT 补位），三态不得压二态
      expect(out.row?.conditions).toHaveLength(5);
      expect(out.row?.conditions.map((c) => c.kind)).toEqual([
        ...DELIVERABLE_KINDS,
      ]);
    }
  }, 120_000);

  it('track_delivery 每行与 check_deliverables 单查结果一致（两工具同一判定口径）', async () => {
    const track = (await executeTool('track_delivery', { projectId }, ctx))
      .output as TrackDeliveryOutput;
    for (const row of track.rows) {
      const single = (
        await executeTool('check_deliverables', { dealId: row.dealId }, ctx)
      ).output as CheckDeliverablesOutput;
      expect(single.row).toEqual(row);
    }
  }, 120_000);

  it('三态可分辨：矩阵夹具中 ok / miss / na 三种单元均出现（未被压成二态）', async () => {
    const track = (await executeTool('track_delivery', { projectId }, ctx))
      .output as TrackDeliveryOutput;
    const cells = new Set(
      track.rows.flatMap((r) => r.conditions.map((c) => c.cell)),
    );
    expect([...cells].sort()).toEqual(['miss', 'na', 'ok']);
  });
});

// ───────────────────────── C. internal 只读语义 ─────────────────────────

describe('C. internal：不过闸门 + 零写入', () => {
  it('两工具 class=internal / source=native / 无 buildHarm', () => {
    for (const name of ['track_delivery', 'check_deliverables']) {
      const tool = getTool(name)!;
      expect(tool, name).toBeTruthy();
      expect(tool.class, name).toBe('internal');
      expect(tool.source, name).toBe('native');
      expect(tool.buildHarm, name).toBeUndefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('直调不产生 PendingAction / OperationLog，且不改动任何交付行（只读）', async () => {
    // 计数按本租户 scope——集成测并行跑，全库计数会被他文件夹具污染（Evaluator 自证：
    // 首版用全库计数误红，非产品缺陷；本租户内计数才是本工具「零写入」的真信号）。
    const scoped = async () => ({
      pending: await prisma.pendingAction.count({ where: { tenantId } }),
      logs: await prisma.operationLog.count({ where: { tenantId } }),
      deals: await prisma.deal.count({ where: { tenantId } }),
      deliverables: await prisma.deliverable.count({ where: { tenantId } }),
      keys: await prisma.gameKey.count({ where: { tenantId } }),
      payouts: await prisma.payout.count({ where: { tenantId } }),
    });
    const before = await scoped();
    const snapshotBefore = await prisma.deliverable.findMany({
      where: { tenantId },
      orderBy: [{ dealId: 'asc' }, { kind: 'asc' }],
      select: { id: true, status: true, required: true, updatedAt: true },
    });

    await executeTool('track_delivery', { projectId }, ctx);
    for (const dealId of dealIds.slice(0, 5)) {
      await executeTool('check_deliverables', { dealId }, ctx);
    }

    expect(await scoped()).toEqual(before);
    expect(
      await prisma.deliverable.findMany({
        where: { tenantId },
        orderBy: [{ dealId: 'asc' }, { kind: 'asc' }],
        select: { id: true, status: true, required: true, updatedAt: true },
      }),
    ).toEqual(snapshotBefore);
  }, 60_000);

  it('delivery 人格声明的工具全部在注册表；全人格同源断言（无悬空工具名）', () => {
    const delivery = listPersonas().find((p) => p.id === 'delivery')!;
    expect(delivery.tools).toEqual(
      expect.arrayContaining(['track_delivery', 'check_deliverables']),
    );
    const dangling: string[] = [];
    for (const p of listPersonas()) {
      for (const name of p.tools) {
        if (!getTool(name)) dangling.push(`${p.id}:${name}`);
      }
    }
    expect(dangling).toEqual([]);
    // 反向：两工具确实进了 native 装配名单（不是只在人格里写了名字）
    expect(getNativeToolNames()).toEqual(
      expect.arrayContaining(['track_delivery', 'check_deliverables']),
    );
  });
});

// ───────────────── D. 可序列化 / 输入契约 / 租户隔离 ─────────────────

/** 深检：产物中不得含 Date / Decimal / 非 plain 对象（画布渲染需 JSON 安全）。 */
function assertJsonSafe(value: unknown, path = '$'): string[] {
  const bad: string[] = [];
  if (value === null) return bad;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return bad;
  if (
    t === 'undefined' ||
    t === 'function' ||
    t === 'bigint' ||
    t === 'symbol'
  ) {
    return [`${path}: ${t}`];
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => bad.push(...assertJsonSafe(v, `${path}[${i}]`)));
    return bad;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return [`${path}: 非 plain 对象（${(value as object).constructor?.name}）`];
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    bad.push(...assertJsonSafe(v, `${path}.${k}`));
  }
  return bad;
}

describe('D. 序列化 / 输入契约 / 隔离', () => {
  it('track_delivery 产物 JSON 安全（无 Date/Decimal/class 实例）且往返无损', async () => {
    const out = (await executeTool('track_delivery', { projectId }, ctx))
      .output as TrackDeliveryOutput;
    expect(assertJsonSafe(out)).toEqual([]);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    expect(out.rows.length).toBeGreaterThan(0);
    const r = out.rows[0];
    expect(typeof r.dealId).toBe('string');
    expect(typeof r.who).toBe('string');
    expect(typeof r.dealStatus).toBe('string');
    expect(r.deliverables).toEqual(['视频', 'key']);
  });

  it('输入契约：坏入参一律被 zod 拒（类型错 / 空串 / 缺字段 / 数字）', async () => {
    const badCases: [string, unknown][] = [
      ['check_deliverables', {}],
      ['check_deliverables', { dealId: '' }],
      ['check_deliverables', { dealId: 123 }],
      ['check_deliverables', { dealId: null }],
      ['track_delivery', {}],
      ['track_delivery', { projectId: '' }],
      ['track_delivery', { projectId: 7 }],
      ['track_delivery', { projectId, dealId: 5 }],
      ['track_delivery', undefined],
    ];
    for (const [name, input] of badCases) {
      await expect(
        executeTool(name, input, ctx),
        `${name} ${JSON.stringify(input)} 应被拒`,
      ).rejects.toThrowError(/入参校验失败/);
    }
  });

  it('未知 dealId / 未知 projectId → 空态诚实（不抛错、不编造）', async () => {
    const c = (
      await executeTool('check_deliverables', { dealId: 'no-such-deal' }, ctx)
    ).output as CheckDeliverablesOutput;
    expect(c).toEqual({ found: false, row: null });
    const t = (
      await executeTool('track_delivery', { projectId: 'no-such-project' }, ctx)
    ).output as TrackDeliveryOutput;
    expect(t.total).toBe(0);
    expect(t.rows).toEqual([]);
  });

  it('租户隔离：他租户 dealId 不可经 check_deliverables / track_delivery 读出', async () => {
    const c = (
      await executeTool(
        'check_deliverables',
        { dealId: otherTenantDealId },
        ctx,
      )
    ).output as CheckDeliverablesOutput;
    expect(c.found, '跨租户 Deal 被读出').toBe(false);
    const t = (
      await executeTool(
        'track_delivery',
        { projectId, dealId: otherTenantDealId },
        ctx,
      )
    ).output as TrackDeliveryOutput;
    expect(t.total).toBe(0);
  });
});
