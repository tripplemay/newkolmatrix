// M3-B-DELIVERY F006 — Evaluator 独立对抗探针（验收产物，Andy/evaluator-subagent）
//
// 与 distribute-keys.test.ts（Generator 交付）互补，只覆盖其**未触及或未独立取证**的面：
//  A. 「同事务」硬证：把工具执行放进一个人为回滚的事务 → 三处写入（partner 留痕 /
//     GameKey 翻牌 / Deliverable 置 met）必须全部随事务消失。原测试只证「成功后都在」，
//     不能区分「同一事务」与「三条各自 autocommit」。
//  B. P1 零真实外呼硬证：全链执行期间 globalThis.fetch 被换成会抛错的哨兵 → 仍成功，
//     且哨兵零调用（原测试只断言 mocked=true 这个自述字段）。
//  C. 幂等：闸门全链层重放（票已消费）+ 「第二张票不得复用同一批 key」。
//  D. keyRef 明文三面独立核：schema 注释 / 写入口守卫 / **全库实际落库行 + 日志载荷** 扫描，
//     并探明守卫的形状盲区（小写激活码）。
//  E. 库存与入参边界：available 中混入 distributed 行、恰好相等、zod 边界（0 / 负 / 小数）。
//  F. 跨租户越权：他租户 Deal → 明示拒绝且不触碰任何 key。
//  G. harm 契约：harmSchema.parse 通过 + 三要素 + 「不折叠」（多 key 全列，无「等 N 个」）
//     + displayName 缺失时回落 handle。
//  H. 全库不变量：所有 distributed 的 GameKey 必带 distributedAt + gateLogId。
//
// 夹具租户按 pid 独立（test-tenant-m3b-f006probe-*），自清理；不改任何产品代码。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { harmSchema, isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getTool } from '../../src/lib/agent/tools/registry';
import { ensureNativeToolsRegistered } from '../../src/lib/agent/tools';
import { listPersonas } from '../../src/lib/agent/registry';
import { DISTRIBUTED_MARKER } from '../../src/lib/ops/partner';
import { registerKeyPool } from '../../src/lib/delivery/register';
import { looksLikePlaintextKey } from '../../src/lib/delivery/key-ref';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m3b-f006probe-${process.pid}`;
const OTHER_SLUG = `test-tenant-m3b-f006probe-other-${process.pid}`;

/** 典型激活码形状（与产品守卫独立实现，用于全库扫描——不复用被测正则）。 */
const PLAINTEXT_SHAPE = /^[A-Za-z0-9]{4,6}(-[A-Za-z0-9]{4,6}){2,}$/;

let tenantId: string;
let otherTenantId: string;
let projectId: string;
let otherProjectId: string;
let ctx: ToolContext;
let seq = 0;

async function makeDeal(opts: {
  handle: string;
  keys: { keyRef: string; status?: 'reserved' | 'distributed' }[];
  status?: 'delivering' | 'signed';
  tenant?: 'own' | 'other';
  displayName?: string | null;
  kolHandle?: string | null;
}): Promise<string> {
  const t = opts.tenant === 'other' ? otherTenantId : tenantId;
  const p = opts.tenant === 'other' ? otherProjectId : projectId;
  seq += 1;
  const kol = await prisma.kol.create({
    data: {
      tenantId: t,
      canonicalHandle: `${opts.handle}-${process.pid}-${seq}`,
      displayName: opts.displayName === undefined ? opts.handle : opts.displayName,
      handle: opts.kolHandle ?? null,
    },
  });
  const deal = await prisma.deal.create({
    data: {
      tenantId: t,
      projectId: p,
      kolId: kol.id,
      status: opts.status ?? 'delivering',
      termsJson: {
        amount: 500,
        currency: 'USD',
        deliverables: ['keys'],
        scope: null,
      } as unknown as Prisma.InputJsonValue,
      deliverables: {
        create: [
          { tenantId: t, kind: 'key', required: true, status: 'pending' },
        ],
      },
      gameKeys: {
        create: opts.keys.map((k) => ({
          tenantId: t,
          keyRef: k.keyRef,
          status: k.status ?? ('reserved' as const),
        })),
      },
    },
  });
  return deal.id;
}

const markerCount = (tid = tenantId) =>
  prisma.operationLog.count({
    where: { tenantId: tid, summary: { contains: DISTRIBUTED_MARKER } },
  });

beforeAll(async () => {
  ensureNativeToolsRegistered();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B F006 评审探针夹具租户' },
  });
  tenantId = t.id;
  const o = await prisma.tenant.create({
    data: { slug: OTHER_SLUG, name: 'M3B F006 探针·他租户' },
  });
  otherTenantId = o.id;
  projectId = (
    await prisma.project.create({ data: { tenantId, name: 'F006 探针项目' } })
  ).id;
  otherProjectId = (
    await prisma.project.create({
      data: { tenantId: otherTenantId, name: 'F006 探针他租户项目' },
    })
  ).id;
  ctx = { tenantId, agentId: 'delivery', projectId, env: 'default' };
});

afterAll(async () => {
  for (const tid of [tenantId, otherTenantId]) {
    await prisma.operationLog.deleteMany({ where: { tenantId: tid } });
    await prisma.pendingAction.deleteMany({ where: { tenantId: tid } });
    await prisma.project.deleteMany({ where: { tenantId: tid } });
    await prisma.kol.deleteMany({ where: { tenantId: tid } });
  }
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantId, otherTenantId] } },
  });
  await prisma.$disconnect();
});

// ───────────────── A. 同事务硬证（回滚必须抹掉全部三处写入） ─────────────────

describe('A. 执行写入与闸门收尾同一事务（回滚证）', () => {
  it('人为回滚外层事务 → partner 留痕 / GameKey 翻牌 / Deliverable met 全部消失', async () => {
    const dealId = await makeDeal({
      handle: 'TxProbe',
      keys: [{ keyRef: 'tx-001' }, { keyRef: 'tx-002' }],
    });
    const before = await markerCount();
    const tool = getTool('distribute_keys');
    expect(tool).toBeTruthy();

    await expect(
      prisma.$transaction(async (tx) => {
        const out = (await tool!.execute({ dealId, quantity: 2 } as never, {
          ...ctx,
          confirmationToken: 'probe-internal',
          gateActionId: `probe-tx-${process.pid}`,
          db: tx,
        })) as { quantity: number };
        // 事务内确认「确实写了」——否则回滚断言会被空操作伪装成通过
        expect(out.quantity).toBe(2);
        expect(
          await tx.gameKey.count({ where: { dealId, status: 'distributed' } }),
        ).toBe(2);
        throw new Error('PROBE_ROLLBACK');
      }),
    ).rejects.toThrowError(/PROBE_ROLLBACK/);

    // 三处写入全部随事务消失 = 它们确实在同一事务里
    expect(
      await prisma.gameKey.count({ where: { dealId, status: 'distributed' } }),
    ).toBe(0);
    const keys = await prisma.gameKey.findMany({ where: { dealId } });
    for (const k of keys) {
      expect(k.distributedAt).toBeNull();
      expect(k.gateLogId).toBeNull();
    }
    expect(
      (await prisma.deliverable.findFirst({ where: { dealId, kind: 'key' } }))
        ?.status,
    ).toBe('pending');
    expect(await markerCount()).toBe(before);
  });
});

// ───────────────── B. P1 零真实外呼（fetch 哨兵） ─────────────────

describe('B. P1 零真实外呼（网络哨兵）', () => {
  it('全链在 fetch 被替换为抛错哨兵下仍成功，哨兵零调用；GameKey 三字段齐', async () => {
    const dealId = await makeDeal({
      handle: 'NoNetProbe',
      keys: [{ keyRef: 'net-001' }, { keyRef: 'net-002' }, { keyRef: 'net-003' }],
    });
    const original = globalThis.fetch;
    const sentinel = vi.fn(() => {
      throw new Error('PROBE_NETWORK_CALL_ATTEMPTED');
    });
    globalThis.fetch = sentinel as unknown as typeof fetch;
    try {
      const pend = await executeTool(
        'distribute_keys',
        { dealId, quantity: 2 },
        ctx,
      );
      expect(isPendingEnvelope(pend.output)).toBe(true);
      if (!isPendingEnvelope(pend.output)) throw new Error('unreachable');
      const paId = pend.output.pendingActionId;
      const conf = await confirmPendingAction(paId, ctx);
      const exec = await executePendingAction(paId, conf.ticket, ctx);
      const out = exec.output as { mocked: boolean; keyRefs: string[] };
      expect(out.mocked).toBe(true);
      expect(out.keyRefs).toEqual(['net-001', 'net-002']);

      const distributed = await prisma.gameKey.findMany({
        where: { dealId, status: 'distributed' },
      });
      expect(distributed).toHaveLength(2);
      for (const k of distributed) {
        expect(k.distributedAt).not.toBeNull();
        expect(k.gateLogId).toBe(paId);
      }
    } finally {
      globalThis.fetch = original;
    }
    expect(sentinel).not.toHaveBeenCalled();
  });

  it('ops/partner 源码零网络客户端引用（静态面）', () => {
    for (const f of [
      'src/lib/ops/partner/index.ts',
      'src/lib/ops/partner/types.ts',
      'src/lib/ops/partner/mock-key-distributor.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toMatch(/require\(['"](node:)?https?['"]\)/);
      expect(src, f).not.toMatch(/from ['"](axios|got|node-fetch)['"]/);
    }
    const tool = readFileSync('src/lib/agent/tools/distribute-keys.ts', 'utf8');
    expect(tool).not.toMatch(/\bfetch\s*\(/);
  });
});

// ───────────────── C. 幂等（闸门全链层） ─────────────────

describe('C. 幂等重入不双发（闸门层）', () => {
  it('同票重放被拒；换新票也不能复用已发出的 key（库存已扣）', async () => {
    const dealId = await makeDeal({
      handle: 'IdemProbe',
      keys: [{ keyRef: 'idem-001' }, { keyRef: 'idem-002' }],
    });
    const pend = await executeTool(
      'distribute_keys',
      { dealId, quantity: 2 },
      ctx,
    );
    if (!isPendingEnvelope(pend.output)) throw new Error('应停在闸门');
    const paId = pend.output.pendingActionId;
    const conf = await confirmPendingAction(paId, ctx);
    await executePendingAction(paId, conf.ticket, ctx);
    const markersAfterFirst = await markerCount();

    // ① 同票重放
    await expect(
      executePendingAction(paId, conf.ticket, ctx),
    ).rejects.toThrowError();
    // ② 再确认一次（票已消费）
    await expect(confirmPendingAction(paId, ctx)).rejects.toThrowError();
    // ③ 全新一张票：同 deal 同数量 → 库存已空，明示拒绝（不复发同一批 key）
    await expect(
      executeTool('distribute_keys', { dealId, quantity: 2 }, ctx),
    ).rejects.toThrowError(/库存不足/);

    expect(
      await prisma.gameKey.count({ where: { dealId, status: 'distributed' } }),
    ).toBe(2);
    expect(await markerCount()).toBe(markersAfterFirst);
    const gateIds = new Set(
      (await prisma.gameKey.findMany({ where: { dealId } })).map(
        (k) => k.gateLogId,
      ),
    );
    expect(gateIds).toEqual(new Set([paId]));
  });
});

// ───────────────── D. keyRef 明文三面核 ─────────────────

describe('D. keyRef 存引用不存明文（三面独立核）', () => {
  it('① schema 注释在场（GameKey.keyRef 明示不存明文）', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const model = schema.slice(
      schema.indexOf('model GameKey {'),
      schema.indexOf('model Payout {'),
    );
    expect(model).toMatch(/keyRef\s+String\s*\/\/.*明文/);
    expect(schema).toMatch(/keyRef 存\*\*引用不存明文 key 值\*\*/);
  });

  it('② 写入口守卫：形似激活码的登记被服务层拒绝，一条都不入库', async () => {
    const dealId = await makeDeal({ handle: 'PlainProbe', keys: [] });
    await expect(
      registerKeyPool(
        dealId,
        { keyRefs: ['pool-900', 'ABCDE-12345-XYZ99'] },
        { tenantId, actor: 'evaluator-probe' },
      ),
    ).rejects.toThrowError(/只存引用不存明文/);
    // 全清全不入（不允许「合法的先落库」）
    expect(await prisma.gameKey.count({ where: { dealId } })).toBe(0);
  });

  it('③ 全库落库行与分发日志载荷均无明文激活码形状', async () => {
    const rows = await prisma.gameKey.findMany({ select: { keyRef: true } });
    const offenders = rows
      .map((r) => r.keyRef)
      .filter((ref) => PLAINTEXT_SHAPE.test(ref.trim()));
    expect(offenders, `疑似明文 keyRef 落库：${offenders.join(',')}`).toEqual(
      [],
    );

    const logs = await prisma.operationLog.findMany({
      where: { summary: { contains: DISTRIBUTED_MARKER } },
      select: { payloadJson: true },
    });
    for (const l of logs) {
      const refs =
        (l.payloadJson as { keyRefs?: unknown })?.keyRefs ?? ([] as unknown[]);
      for (const r of refs as string[]) {
        expect(PLAINTEXT_SHAPE.test(String(r).trim()), String(r)).toBe(false);
      }
    }
  });

  it('④ 守卫盲区取证：小写激活码不被识别（防呆非安全边界，记录事实）', () => {
    expect(looksLikePlaintextKey('ABCDE-12345-XYZ99')).toBe(true);
    // 事实记录：产品正则只认大写段，小写同形串可穿过守卫
    expect(looksLikePlaintextKey('abcde-12345-xyz99')).toBe(false);
  });
});

// ───────────────── E. 库存与入参边界 ─────────────────

describe('E. 库存不足明示拒绝 + 入参边界（P3 不猜）', () => {
  it('已 distributed 的行不计入可用库存 → 请求 2 被拒（不部分发）', async () => {
    const dealId = await makeDeal({
      handle: 'StockProbe',
      keys: [
        { keyRef: 'st-001', status: 'distributed' },
        { keyRef: 'st-002', status: 'distributed' },
        { keyRef: 'st-003' },
      ],
    });
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    await expect(
      executeTool('distribute_keys', { dealId, quantity: 2 }, ctx),
    ).rejects.toThrowError(/库存不足.*可用 1 个，请求 2 个/s);
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before,
    );
    expect(
      await prisma.gameKey.count({
        where: { dealId, status: 'distributed', gateLogId: { not: null } },
      }),
    ).toBe(0);
  });

  it('恰好等于库存 → 放行到 pending（边界不误杀）', async () => {
    const dealId = await makeDeal({
      handle: 'ExactProbe',
      keys: [{ keyRef: 'ex-001' }, { keyRef: 'ex-002' }],
    });
    const r = await executeTool('distribute_keys', { dealId, quantity: 2 }, ctx);
    expect(isPendingEnvelope(r.output)).toBe(true);
  });

  it('zod 边界：0 / 负数 / 小数 / 缺 dealId 一律拒，且不落 PendingAction', async () => {
    const dealId = await makeDeal({
      handle: 'ZodProbe',
      keys: [{ keyRef: 'zd-001' }],
    });
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    for (const bad of [
      { dealId, quantity: 0 },
      { dealId, quantity: -1 },
      { dealId, quantity: 1.5 },
      { quantity: 1 },
      { dealId: '', quantity: 1 },
    ]) {
      await expect(
        executeTool('distribute_keys', bad, ctx),
        JSON.stringify(bad),
      ).rejects.toThrowError(/入参校验失败/);
    }
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before,
    );
  });
});

// ───────────────── F. 跨租户 ─────────────────

describe('F. 跨租户越权', () => {
  it('他租户 Deal → 明示「交易不存在」，其 key 一把不动', async () => {
    const foreignDeal = await makeDeal({
      handle: 'ForeignProbe',
      keys: [{ keyRef: 'fr-001' }],
      tenant: 'other',
    });
    await expect(
      executeTool('distribute_keys', { dealId: foreignDeal, quantity: 1 }, ctx),
    ).rejects.toThrowError(/交易不存在/);
    expect(
      await prisma.gameKey.count({
        where: { dealId: foreignDeal, status: 'reserved' },
      }),
    ).toBe(1);
    expect(await markerCount(otherTenantId)).toBe(0);
  });
});

// ───────────────── G. harm 契约 ─────────────────

describe('G. buildHarm 三要素与不折叠', () => {
  it('harmSchema 校验通过；多 key 全量列引用（无「等 N 个」折叠）', async () => {
    const dealId = await makeDeal({
      handle: 'HarmProbe',
      keys: Array.from({ length: 6 }, (_, i) => ({
        keyRef: `hm-${String(i + 1).padStart(3, '0')}`,
      })),
    });
    const r = await executeTool('distribute_keys', { dealId, quantity: 5 }, ctx);
    if (!isPendingEnvelope(r.output)) throw new Error('应停在闸门');
    const harm = r.output.harm;
    expect(() => harmSchema.parse(harm)).not.toThrow();
    expect(harm.targets).toEqual(['HarmProbe']); // ① 领取方
    expect(harm.quantity).toBe(5); // ② 数量
    expect(harm.summary).toMatch(/一经发放不可回收/); // ③ 不可回收
    expect(harm.irreversible).toBe(true);
    expect(harm.label).toBe('对外·不可撤销');
    for (let i = 1; i <= 5; i += 1) {
      expect(harm.evidence).toContain(`hm-${String(i).padStart(3, '0')}`);
    }
    expect(harm.evidence).not.toContain('hm-006'); // 只披露本次
    expect(harm.evidence).not.toMatch(/等\s*\d+\s*(个|条|人)/); // 不折叠
    // 落库 harmJson 与返回一致（确认卡读的是库里的那份）
    const pa = await prisma.pendingAction.findUnique({
      where: { id: r.output.pendingActionId },
    });
    expect((pa?.harmJson as { quantity?: number })?.quantity).toBe(5);
    expect(pa?.status).toBe('pending');
  });

  it('displayName 缺失 → 回落 handle（targets 不得为空串）', async () => {
    const dealId = await makeDeal({
      handle: 'FallbackProbe',
      displayName: null,
      kolHandle: '@fallback_handle',
      keys: [{ keyRef: 'fb-001' }],
    });
    const r = await executeTool('distribute_keys', { dealId, quantity: 1 }, ctx);
    if (!isPendingEnvelope(r.output)) throw new Error('应停在闸门');
    expect(r.output.harm.targets).toEqual(['@fallback_handle']);
  });
});

// ───────────────── H. 注册 + 全库不变量 ─────────────────

describe('H. 注册同源与全库不变量', () => {
  it('distribute_keys 注册 + 挂 delivery 人格 + class=outbound + 有 buildHarm', () => {
    const tool = getTool('distribute_keys');
    expect(tool?.class).toBe('outbound');
    expect(typeof tool?.buildHarm).toBe('function');
    expect(tool?.source).toBe('native');
    const delivery = listPersonas().find((p) => p.id === 'delivery');
    expect(delivery?.tools).toContain('distribute_keys');
  });

  it('全库不变量：distributed 的 GameKey 必带 distributedAt 且 gateLogId 非空', async () => {
    const bad = await prisma.gameKey.findMany({
      where: {
        status: 'distributed',
        OR: [{ distributedAt: null }, { gateLogId: null }],
      },
      select: { id: true, keyRef: true, dealId: true },
    });
    // 说明：探针 E 的夹具用 status:'distributed' 直插库（模拟历史行），故白名单排除本探针租户
    const foreign = [] as typeof bad;
    for (const row of bad) {
      const deal = await prisma.deal.findUnique({
        where: { id: row.dealId },
        select: { tenantId: true },
      });
      if (deal && deal.tenantId !== tenantId && deal.tenantId !== otherTenantId) {
        foreign.push(row);
      }
    }
    expect(
      foreign,
      `违反不变量的行：${foreign.map((r) => r.id).join(',')}`,
    ).toEqual([]);
  });
});
