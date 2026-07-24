// M3-B-DELIVERY F004 — partner 适配器层单测（选择器分支 + mock 契约 + 零外呼断言）
//
// acceptance 对应：
// - env 选择器行为（恒 mock；配了非 mock provider → 明示拒绝不静默回落）
// - mock 实现契约（可观测标记落 OperationLog / 入参校验 / mocked=true / partnerRef=null）
// - **CI 与本地零外呼**：把 fetch 换成会抛错的哨兵，跑完整条 mock 路径——
//   任何一次网络调用都会让用例翻红（P1 零真实资金动作的机械化守门）

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const created: Array<Record<string, unknown>> = [];

// prisma 换成记账替身：单测不打库，只验适配器写了什么
vi.mock('lib/db/prisma', () => ({
  prisma: {
    operationLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { id: `log-${created.length}` };
      },
    },
  },
}));

const {
  getEscrowPartner,
  getKeyDistributor,
  MockEscrowPartner,
  MockKeyDistributor,
  PartnerError,
  RELEASED_MARKER,
  DISTRIBUTED_MARKER,
} = await import('../../src/lib/ops/partner');

const ctx = { tenantId: 'tenant-1', agentId: 'delivery' };

const releaseInput = {
  dealId: 'deal-1',
  payee: 'MeepleMax',
  amount: 1600,
  currency: 'USD',
  basis: '合同 sign-1 + 托管 esc-1 + 披露证据 ev-1',
  escrowRef: 'esc-1',
  idempotencyKey: 'pa-1',
};

const distributeInput = {
  dealId: 'deal-1',
  recipient: 'MeepleMax',
  keyRefs: ['pool-001', 'pool-002'],
  idempotencyKey: 'pa-2',
};

/** 网络哨兵：任何外呼都翻红（零外呼断言的实现，不是靠「读代码觉得没有」）。 */
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  created.length = 0;
  fetchSpy = vi.fn(() => {
    throw new Error('禁止外呼：本批 partner 适配器必须零网络调用（P1）');
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('env 选择器（本批恒 mock，prod 不 fail-fast）', () => {
  it('未配 provider → Mock 实现', () => {
    expect(getEscrowPartner()).toBeInstanceOf(MockEscrowPartner);
    expect(getKeyDistributor()).toBeInstanceOf(MockKeyDistributor);
  });

  it('production 下依然回落 mock（与 ops/email 的差异：本层无真实现，fail-fast 无收益）', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(getEscrowPartner()).toBeInstanceOf(MockEscrowPartner);
    expect(getKeyDistributor()).toBeInstanceOf(MockKeyDistributor);
  });

  it('显式 provider=mock → 受支持', () => {
    vi.stubEnv('ESCROW_PARTNER_PROVIDER', 'mock');
    vi.stubEnv('KEY_DISTRIBUTOR_PROVIDER', 'mock');
    expect(getEscrowPartner()).toBeInstanceOf(MockEscrowPartner);
    expect(getKeyDistributor()).toBeInstanceOf(MockKeyDistributor);
  });

  it('配了未实装的 provider → 明示拒绝（不静默回落 mock，防「以为在真放款」）', () => {
    vi.stubEnv('ESCROW_PARTNER_PROVIDER', 'stripe');
    expect(() => getEscrowPartner()).toThrowError(PartnerError);
    vi.stubEnv('KEY_DISTRIBUTOR_PROVIDER', 'steam');
    expect(() => getKeyDistributor()).toThrowError(PartnerError);
  });
});

describe('MockEscrowPartner 契约', () => {
  it('release 写 RELEASED_MARKER 留痕 + mocked=true + partnerRef=null', async () => {
    const r = await getEscrowPartner().release(releaseInput, ctx);
    expect(r.mocked).toBe(true);
    expect(r.partnerRef).toBeNull(); // 没有真实单据就不编一个
    expect(created).toHaveLength(1);
    const log = created[0] as { summary: string; kind: string; actor: string };
    expect(log.summary).toContain(RELEASED_MARKER);
    expect(log.summary).toContain('MeepleMax');
    expect(log.summary).toContain('1600 USD');
    expect(log.kind).toBe('auto');
    expect(log.actor).toBe('delivery');
  });

  it('留痕载荷带 dealId / 幂等键 / mocked 标记（供闸门与验收观测）', async () => {
    await getEscrowPartner().release(releaseInput, ctx);
    const payload = (created[0] as { payloadJson: Record<string, unknown> })
      .payloadJson;
    expect(payload.dealId).toBe('deal-1');
    expect(payload.idempotencyKey).toBe('pa-1');
    expect(payload.mocked).toBe(true);
  });

  it('非正金额 / 空依据 → PartnerError（明示拒绝不静默成功）', async () => {
    await expect(
      getEscrowPartner().release({ ...releaseInput, amount: 0 }, ctx),
    ).rejects.toThrowError(PartnerError);
    await expect(
      getEscrowPartner().release({ ...releaseInput, basis: '' }, ctx),
    ).rejects.toThrowError(PartnerError);
    expect(created).toHaveLength(0); // 拒绝路径不留副作用
  });

  it('ctx.db 在场时写入走事务客户端（与 executed+irrev 同事务）', async () => {
    const txCreated: Array<Record<string, unknown>> = [];
    const db = {
      operationLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          txCreated.push(args.data);
          return { id: 'tx-log' };
        },
      },
    };
    await getEscrowPartner().release(releaseInput, {
      ...ctx,
      db: db as never,
    });
    expect(txCreated).toHaveLength(1);
    expect(created).toHaveLength(0); // 没有绕过事务写全局 prisma
  });
});

describe('MockKeyDistributor 契约', () => {
  it('distribute 写 DISTRIBUTED_MARKER 留痕 + 返回分发清单 + mocked=true', async () => {
    const r = await getKeyDistributor().distribute(distributeInput, ctx);
    expect(r.mocked).toBe(true);
    expect(r.distributedRefs).toEqual(['pool-001', 'pool-002']);
    expect(r.partnerRef).toBeNull();
    const log = created[0] as {
      summary: string;
      payloadJson: Record<string, unknown>;
    };
    expect(log.summary).toContain(DISTRIBUTED_MARKER);
    expect(log.summary).toContain('2 个 key');
    expect(log.summary).toContain('不可回收');
    expect(log.payloadJson.keyRefs).toEqual(['pool-001', 'pool-002']);
  });

  it('空清单 → PartnerError（空分发是无意义动作，不静默成功）', async () => {
    await expect(
      getKeyDistributor().distribute({ ...distributeInput, keyRefs: [] }, ctx),
    ).rejects.toThrowError(PartnerError);
    expect(created).toHaveLength(0);
  });

  it('返回的清单是副本（调用方改动不回写入参）', async () => {
    const refs = ['pool-001'];
    const r = await getKeyDistributor().distribute(
      { ...distributeInput, keyRefs: refs },
      ctx,
    );
    r.distributedRefs.push('pool-999');
    expect(refs).toEqual(['pool-001']);
  });
});

describe('P1 零外呼断言', () => {
  it('跑完两条 mock 路径后，fetch 一次都没被调用', async () => {
    await getEscrowPartner().release(releaseInput, ctx);
    await getKeyDistributor().distribute(distributeInput, ctx);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
