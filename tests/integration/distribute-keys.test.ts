// M3-B-DELIVERY F006 — distribute_keys 闸门集成测试（打真库，两步票据全链）
//
// 覆盖 acceptance：
// - 注册 + 挂 delivery 人格 + class=outbound
// - buildHarm 三要素（领取方 / key 数量 / 一经发放不可回收）+ 无令牌 → pending
// - 执行后 GameKey distributed + distributedAt + gateLogId 非空（同事务）+ key 条件置 met
// - keyRef 不含明文 key 值（写入口守卫 + 分发前复核）
// - 库存不足明示拒绝、不部分发放（P3）
// - 幂等重入不双发；P1 零真实外呼（DISTRIBUTED_MARKER 观测）

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { getTool } from '../../src/lib/agent/tools/registry';
import { listPersonas } from '../../src/lib/agent/registry';
import { DISTRIBUTED_MARKER } from '../../src/lib/ops/partner';
import {
  assertKeyRefNotPlaintext,
  looksLikePlaintextKey,
} from '../../src/lib/delivery/key-ref';
import { KEYS_OUT_OF_STOCK_MSG } from '../../src/lib/agent/tools/distribute-keys';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m3b-keys-${process.pid}`;

let tenantId: string;
let projectId: string;
let ctx: ToolContext;

async function makeDealWithKeys(opts: {
  handle: string;
  keyRefs: string[];
  status?: 'delivering' | 'blocked';
}): Promise<string> {
  const kol = await prisma.kol.create({
    data: {
      tenantId,
      canonicalHandle: `${opts.handle}-${process.pid}`,
      displayName: opts.handle,
    },
  });
  const deal = await prisma.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: kol.id,
      status: opts.status ?? 'delivering',
      termsJson: {
        amount: 1000,
        currency: 'USD',
        deliverables: ['1 条长视频', '10 个 key'],
        scope: null,
      } as unknown as Prisma.InputJsonValue,
      deliverables: {
        create: [
          { tenantId, kind: 'content', required: true, status: 'pending' },
          { tenantId, kind: 'key', required: true, status: 'pending' },
          { tenantId, kind: 'contract', required: true, status: 'met' },
          { tenantId, kind: 'escrow', required: true, status: 'met' },
          {
            tenantId,
            kind: 'ad_disclosure',
            required: true,
            status: 'pending',
          },
        ],
      },
      gameKeys: {
        create: opts.keyRefs.map((keyRef) => ({ tenantId, keyRef })),
      },
    },
  });
  return deal.id;
}

const distributedMarkerCount = () =>
  prisma.operationLog.count({
    where: { tenantId, summary: { contains: DISTRIBUTED_MARKER } },
  });

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B keys 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'M3B keys 夹具项目' },
  });
  projectId = p.id;
  ctx = { tenantId, agentId: 'delivery', projectId, env: 'default' };
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } }); // 级联 deal/gameKey/deliverable
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与契约', () => {
  it('distribute_keys 已注册、class=outbound、有 buildHarm', () => {
    const tool = getTool('distribute_keys');
    expect(tool).toBeTruthy();
    expect(tool?.class).toBe('outbound');
    expect(typeof tool?.buildHarm).toBe('function');
  });

  it('挂 delivery 人格，人格声明的工具名全部真实存在（同源断言）', () => {
    const delivery = listPersonas().find((p) => p.id === 'delivery');
    expect(delivery?.tools).toContain('distribute_keys');
    for (const name of delivery?.tools ?? []) {
      expect(getTool(name), `人格声明的工具 ${name} 不在注册表`).toBeTruthy();
    }
  });
});

describe('keyRef 明文守卫（P8：存引用不存明文）', () => {
  it('典型激活码形状被识别并拒绝', () => {
    expect(looksLikePlaintextKey('ABCDE-12345-XYZ99')).toBe(true);
    expect(looksLikePlaintextKey('A1B2C3-D4E5F6-G7H8I9-J0K1L2')).toBe(true);
    expect(() => assertKeyRefNotPlaintext('ABCDE-12345-XYZ99')).toThrowError(
      /只存引用不存明文/,
    );
  });

  it('正常引用（池条目号 / 批次号）不误伤', () => {
    for (const ref of ['pool-001', 'batch-2026-07/12', 'KEYPOOL#42', 'k-1']) {
      expect(looksLikePlaintextKey(ref), ref).toBe(false);
      expect(() => assertKeyRefNotPlaintext(ref)).not.toThrow();
    }
  });
});

describe('闸门全链', () => {
  let dealId: string;
  let paId: string;

  it('无令牌 → pending 信封，harm 三要素齐，副作用零发生', async () => {
    dealId = await makeDealWithKeys({
      handle: 'KeyReady',
      keyRefs: ['pool-001', 'pool-002', 'pool-003'],
    });
    const r = await executeTool('distribute_keys', { dealId, quantity: 2 }, ctx);
    expect(isPendingEnvelope(r.output)).toBe(true);
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    paId = r.output.pendingActionId;
    const harm = r.output.harm;
    expect(harm.targets).toEqual(['KeyReady']); // ① 领取方（不折叠）
    expect(harm.quantity).toBe(2); // ② key 数量
    expect(harm.summary).toContain('一经发放不可回收'); // ③ 不可回收
    expect(harm.evidence).toContain('pool-001'); // 引用如实列出
    expect(harm.evidence).toContain('pool-002');
    expect(harm.evidence).not.toContain('pool-003'); // 只披露本次发放的
    expect(harm.irreversible).toBe(true);
    expect(harm.label).toBe('对外·不可撤销');

    expect(
      await prisma.gameKey.count({ where: { dealId, status: 'distributed' } }),
    ).toBe(0);
    expect(await distributedMarkerCount()).toBe(0);
  });

  it('确认 + 执行：GameKey distributed + distributedAt + gateLogId；key 条件置 met', async () => {
    const conf = await confirmPendingAction(paId, ctx);
    const exec = await executePendingAction(paId, conf.ticket, ctx);
    const out = exec.output as {
      already: boolean;
      quantity: number;
      keyRefs: string[];
      mocked: boolean;
    };
    expect(out.already).toBe(false);
    expect(out.quantity).toBe(2);
    expect(out.keyRefs).toEqual(['pool-001', 'pool-002']); // 先登记先发
    expect(out.mocked).toBe(true); // P1 零真实外呼

    const keys = await prisma.gameKey.findMany({
      where: { dealId },
      orderBy: { keyRef: 'asc' },
    });
    const distributed = keys.filter((k) => k.status === 'distributed');
    expect(distributed).toHaveLength(2);
    for (const k of distributed) {
      expect(k.distributedAt).not.toBeNull();
      expect(k.gateLogId).toBe(paId); // distributed 必带 gateLogId
    }
    // 未发的那把仍是 reserved（不多发）
    expect(keys.filter((k) => k.status === 'reserved')).toHaveLength(1);

    // 交付条件 key 行置 met（本工具的执行即证据）
    const keyRow = await prisma.deliverable.findFirst({
      where: { dealId, kind: 'key' },
    });
    expect(keyRow?.status).toBe('met');
    expect(keyRow?.evidenceRef).toContain('pool-001');

    // irrev 留痕 + mock 分发标记各一次
    const irrev = await prisma.operationLog.findFirst({
      where: { tenantId, kind: 'irrev', ref: paId },
    });
    expect(irrev).not.toBeNull();
    expect(await distributedMarkerCount()).toBe(1);
  });

  it('幂等重入（执行体层）：同 gateActionId 重放 → already=true 不双发', async () => {
    const tool = getTool('distribute_keys');
    const replay = (await tool!.execute({ dealId, quantity: 2 } as never, {
      ...ctx,
      confirmationToken: 'internal',
      gateActionId: paId,
    })) as { already: boolean; quantity: number };
    expect(replay.already).toBe(true);
    expect(replay.quantity).toBe(2);
    expect(
      await prisma.gameKey.count({ where: { dealId, status: 'distributed' } }),
    ).toBe(2);
    expect(await distributedMarkerCount()).toBe(1); // 未再次调 partner
  });

  it('票重放 → 409 语义，不产生第二次发放', async () => {
    await expect(
      executePendingAction(paId, 'stale-ticket', ctx),
    ).rejects.toThrowError();
    expect(
      await prisma.gameKey.count({ where: { dealId, status: 'distributed' } }),
    ).toBe(2);
  });
});

describe('库存与状态守卫（P3 明示拒绝不猜）', () => {
  it('库存不足 → 拒绝且不部分发放（PendingAction 不产生）', async () => {
    const dealId = await makeDealWithKeys({
      handle: 'KeyShort',
      keyRefs: ['pool-101'],
    });
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    await expect(
      executeTool('distribute_keys', { dealId, quantity: 5 }, ctx),
    ).rejects.toThrowError(new RegExp(KEYS_OUT_OF_STOCK_MSG));
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before,
    );
    // 一个都没发（不「先发能发的」）
    expect(
      await prisma.gameKey.count({ where: { dealId, status: 'distributed' } }),
    ).toBe(0);
  });

  it('pending 后库存被发走 → execute 阶段复核拒绝（failed，无 irrev）', async () => {
    const dealId = await makeDealWithKeys({
      handle: 'KeyRace',
      keyRefs: ['pool-201', 'pool-202'],
    });
    const r = await executeTool('distribute_keys', { dealId, quantity: 2 }, ctx);
    if (!isPendingEnvelope(r.output)) throw new Error('应停在闸门');
    const paId = r.output.pendingActionId;
    const markersBefore = await distributedMarkerCount();

    // 窗口内 key 被别处发走
    await prisma.gameKey.updateMany({
      where: { dealId },
      data: { status: 'distributed', distributedAt: new Date() },
    });

    const conf = await confirmPendingAction(paId, ctx);
    await expect(
      executePendingAction(paId, conf.ticket, ctx),
    ).rejects.toThrowError(new RegExp(KEYS_OUT_OF_STOCK_MSG));

    const pa = await prisma.pendingAction.findUnique({ where: { id: paId } });
    expect(pa?.status).toBe('failed');
    expect(
      await prisma.operationLog.findFirst({
        where: { tenantId, kind: 'irrev', ref: paId },
      }),
    ).toBeNull();
    expect(await distributedMarkerCount()).toBe(markersBefore);
  });

  it('blocked 的交易 → 拒绝发放（不可逆动作不在争议中做）', async () => {
    const dealId = await makeDealWithKeys({
      handle: 'KeyBlocked',
      keyRefs: ['pool-301'],
      status: 'blocked',
    });
    await expect(
      executeTool('distribute_keys', { dealId, quantity: 1 }, ctx),
    ).rejects.toThrowError(/blocked/);
  });

  it('不存在的交易 → 明示拒绝', async () => {
    await expect(
      executeTool('distribute_keys', { dealId: 'nope', quantity: 1 }, ctx),
    ).rejects.toThrowError(/交易不存在/);
  });
});
