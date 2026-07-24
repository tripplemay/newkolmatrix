// M3-B-DELIVERY F005 — payout 闸门集成测试（打真库，两步票据全链 + 服务端二次校验）
//
// 覆盖 acceptance：
// - 注册 + 挂 delivery 人格 + class=outbound
// - 无令牌 → pending 信封（副作用零发生：无 Payout 行、无 RELEASED 标记）
// - **服务端二次校验（P6）**：ready=false 直调 → buildHarm 阶段即拒（PendingAction 不产生）；
//   pending→confirm 窗口内条件退化 → 绕过前端直打 execute 亦拒（failed + 无 irrev 行）
// - 执行后 Payout released + gateLogId 非空 + Deal 推进 completed + irrev 留痕（同事务）
// - 幂等重入不双放
// - P1：全程零真实付款外呼（mock 适配器 RELEASED_MARKER 观测）

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
import { RELEASED_MARKER } from '../../src/lib/ops/partner';
import { PAYOUT_NOT_READY_MSG } from '../../src/lib/agent/tools/payout';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const FIXTURE_SLUG = `test-tenant-m3b-payout-${process.pid}`;

let tenantId: string;
let projectId: string;
let ctx: ToolContext;

/** 建一个 Deal + 五条件行；`ready` 决定条件是否全 met。 */
async function makeDeal(opts: {
  handle: string;
  amount: number;
  ready: boolean;
  status?: 'negotiating' | 'delivering' | 'blocked';
}): Promise<{ dealId: string; kolId: string }> {
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
      quoteId: null,
      status: opts.status ?? 'negotiating',
      termsJson: {
        amount: opts.amount,
        currency: 'USD',
        deliverables: ['1 条长视频'],
        scope: null,
      } as unknown as Prisma.InputJsonValue,
      contractRef: 'sign-0001',
      escrowRef: 'esc-0001',
      deliverables: {
        create: [
          {
            tenantId,
            kind: 'content',
            required: true,
            status: opts.ready ? 'met' : 'missing',
            evidenceRef: opts.ready ? 'video-链接' : null,
          },
          { tenantId, kind: 'key', required: false, status: 'na' },
          { tenantId, kind: 'contract', required: true, status: 'met' },
          { tenantId, kind: 'escrow', required: true, status: 'met' },
          {
            tenantId,
            kind: 'ad_disclosure',
            required: true,
            status: 'met',
            evidenceRef: 'ad-截图',
          },
        ],
      },
    },
  });
  return { dealId: deal.id, kolId: kol.id };
}

const releasedMarkerCount = () =>
  prisma.operationLog.count({
    where: { tenantId, summary: { contains: RELEASED_MARKER } },
  });

beforeAll(async () => {
  getNativeToolNames();
  const t = await prisma.tenant.create({
    data: { slug: FIXTURE_SLUG, name: 'M3B payout 夹具租户' },
  });
  tenantId = t.id;
  const p = await prisma.project.create({
    data: { tenantId, name: 'M3B payout 夹具项目' },
  });
  projectId = p.id;
  ctx = { tenantId, agentId: 'delivery', projectId, env: 'default' };
});

afterAll(async () => {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } }); // 级联 deal/deliverable/payout
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('注册与契约', () => {
  it('payout 已注册、class=outbound、有 buildHarm', () => {
    const tool = getTool('payout');
    expect(tool).toBeTruthy();
    expect(tool?.class).toBe('outbound');
    expect(typeof tool?.buildHarm).toBe('function');
  });

  it('挂 delivery 人格，且人格声明的工具名真实存在于注册表（同源断言）', () => {
    const delivery = listPersonas().find((p) => p.id === 'delivery');
    expect(delivery?.tools).toContain('payout');
    for (const name of delivery?.tools ?? []) {
      expect(getTool(name), `人格声明的工具 ${name} 不在注册表`).toBeTruthy();
    }
  });
});

describe('闸门：无令牌 → pending，副作用零发生', () => {
  let dealId: string;
  let paId: string;

  it('条件齐的 Deal 直调 payout → pending 信封 + harm 三行齐', async () => {
    ({ dealId } = await makeDeal({
      handle: 'PayReady',
      amount: 1600,
      ready: true,
    }));
    const r = await executeTool('payout', { dealId }, ctx);
    expect(isPendingEnvelope(r.output)).toBe(true);
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    paId = r.output.pendingActionId;
    const harm = r.output.harm;
    expect(harm.targets).toContain('PayReady'); // ① 收款方
    expect(harm.amount).toBe(1600); // ② 金额
    expect(harm.currency).toBe('USD'); //    + 币种
    expect(harm.evidence).toContain('合同 sign-0001'); // ③ 依据：合同
    expect(harm.evidence).toContain('托管 esc-0001'); //          + 托管
    expect(harm.evidence).toContain('#ad 披露 ad-截图'); //        + 披露证据引用
    expect(harm.irreversible).toBe(true);
    expect(harm.label).toBe('对外·不可撤销');

    // 副作用零发生
    expect(await prisma.payout.count({ where: { tenantId } })).toBe(0);
    expect(await releasedMarkerCount()).toBe(0);
  });

  it('确认 + 执行后：Payout released + gateLogId + Deal completed + irrev 留痕', async () => {
    const conf = await confirmPendingAction(paId, ctx);
    const exec = await executePendingAction(paId, conf.ticket, ctx);
    const out = exec.output as {
      released: boolean;
      already: boolean;
      mocked: boolean;
      amount: number;
      dealStatus: string;
    };
    expect(out.released).toBe(true);
    expect(out.already).toBe(false);
    expect(out.mocked).toBe(true); // P1：mock 适配器，零真实资金动作
    expect(out.amount).toBe(1600);
    expect(out.dealStatus).toBe('completed');

    const payout = await prisma.payout.findFirst({ where: { tenantId, dealId } });
    expect(payout?.status).toBe('released');
    expect(payout?.gateLogId).toBe(paId); // released 必带 gateLogId
    expect(payout?.releasedAt).not.toBeNull();
    expect(Number(payout?.amount)).toBe(1600);
    expect(payout?.basis).toContain('sign-0001');

    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.status).toBe('completed'); // 逐级走主线到 completed

    // irrev 留痕（与业务写入同事务）
    const irrev = await prisma.operationLog.findFirst({
      where: { tenantId, kind: 'irrev', ref: paId },
    });
    expect(irrev).not.toBeNull();
    // P1 观测标记：mock 放款发生了，且只发生一次
    expect(await releasedMarkerCount()).toBe(1);
  });

  it('幂等重入：同一执行票已消费 → 不产生第二笔 Payout / 第二次 mock 放款', async () => {
    await expect(
      executePendingAction(paId, 'any-ticket', ctx),
    ).rejects.toThrowError(); // 票已消费（409 语义）
    expect(await prisma.payout.count({ where: { tenantId, dealId } })).toBe(1);
    expect(await releasedMarkerCount()).toBe(1);
  });

  it('幂等重入（执行体层）：同 gateActionId 重放 → already=true 不双放', async () => {
    const tool = getTool('payout');
    const replay = (await tool!.execute({ dealId } as never, {
      ...ctx,
      confirmationToken: 'internal',
      gateActionId: paId,
    })) as { already: boolean };
    expect(replay.already).toBe(true);
    expect(await prisma.payout.count({ where: { tenantId, dealId } })).toBe(1);
    expect(await releasedMarkerCount()).toBe(1); // 未再次调 partner
  });
});

describe('P6 服务端二次校验（无绕过入口）', () => {
  it('ready=false 的 Deal 直调 payout → buildHarm 阶段即拒，PendingAction 不产生', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId } });
    const { dealId } = await makeDeal({
      handle: 'PayNotReady',
      amount: 900,
      ready: false, // content=missing
    });
    await expect(executeTool('payout', { dealId }, ctx)).rejects.toThrowError(
      new RegExp(PAYOUT_NOT_READY_MSG),
    );
    expect(await prisma.pendingAction.count({ where: { tenantId } })).toBe(
      before,
    );
    expect(await prisma.payout.count({ where: { tenantId, dealId } })).toBe(0);
  });

  it('拒绝信息「缺什么显什么」（不是一句条件不足）', async () => {
    const { dealId } = await makeDeal({
      handle: 'PayGapDetail',
      amount: 800,
      ready: false,
    });
    await expect(executeTool('payout', { dealId }, ctx)).rejects.toThrowError(
      /内容 缺/,
    );
  });

  it('绕过前端直打 execute：pending 后条件退化 → execute 拒 + failed + 无 irrev 行', async () => {
    const { dealId } = await makeDeal({
      handle: 'PayDegrade',
      amount: 1200,
      ready: true,
    });
    const r = await executeTool('payout', { dealId }, ctx);
    if (!isPendingEnvelope(r.output)) throw new Error('应停在闸门');
    const paId = r.output.pendingActionId;
    const markersBefore = await releasedMarkerCount();

    // pending → confirm 窗口内条件退化（证据被撤回）
    await prisma.deliverable.updateMany({
      where: { dealId, kind: 'ad_disclosure' },
      data: { status: 'missing', evidenceRef: null },
    });

    const conf = await confirmPendingAction(paId, ctx);
    await expect(
      executePendingAction(paId, conf.ticket, ctx),
    ).rejects.toThrowError(new RegExp(PAYOUT_NOT_READY_MSG));

    const pa = await prisma.pendingAction.findUnique({ where: { id: paId } });
    expect(pa?.status).toBe('failed');
    const irrev = await prisma.operationLog.findFirst({
      where: { tenantId, kind: 'irrev', ref: paId },
    });
    expect(irrev).toBeNull(); // 失败不留 irrev（G5）
    // 业务写入随事务回滚：无 Payout 行、无新的 mock 放款标记
    expect(await prisma.payout.count({ where: { tenantId, dealId } })).toBe(0);
    expect(await releasedMarkerCount()).toBe(markersBefore);
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.status).toBe('negotiating'); // 状态未被推进
  });

  it('blocked 的 Deal（条件齐）也拒放款——Deal 级缺口', async () => {
    const { dealId } = await makeDeal({
      handle: 'PayBlocked',
      amount: 700,
      ready: true,
      status: 'blocked',
    });
    await expect(executeTool('payout', { dealId }, ctx)).rejects.toThrowError(
      /争议|暂停|blocked/,
    );
  });

  it('条款快照缺金额 → 明示拒绝不猜（P3）', async () => {
    const { dealId } = await makeDeal({
      handle: 'PayNoAmount',
      amount: 500,
      ready: true,
    });
    await prisma.deal.update({
      where: { id: dealId },
      data: { termsJson: { deliverables: [] } as unknown as Prisma.InputJsonValue },
    });
    await expect(executeTool('payout', { dealId }, ctx)).rejects.toThrowError(
      /拒绝猜测放款金额/,
    );
  });

  it('不存在的 Deal → 明示拒绝', async () => {
    await expect(
      executeTool('payout', { dealId: 'deal-not-exist' }, ctx),
    ).rejects.toThrowError(/交易不存在/);
  });
});
