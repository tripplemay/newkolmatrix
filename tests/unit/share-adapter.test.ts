// M4-INSIGHT F007 — share 适配器层单测（选择器分支 + mock 契约 + 零外呼断言）
//
// acceptance 对应（沿 partner-adapters.test.ts 先例）：
// - env 选择器行为（恒 mock；prod 无 key 不 fail-fast；配了非 mock provider → 明示拒绝不静默回落）
// - mock 实现契约（SHARE_CREATED_MARKER 落 OperationLog / payloadRef+token 形状 / token 每次不同 /
//   **token 明文不入日志不落库** / mocked=true / publicUrl=null / 入参校验）
// - **CI 与本地零外呼**：把 fetch 换成会抛错的哨兵，跑完整条 mock 路径——
//   任何一次网络调用都会让用例翻红（P4 零真实公开暴露的机械化守门）

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShareLinkCreateInput } from '../../src/lib/ops/share/types';

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
  getShareLinkService,
  MockShareLinkService,
  ShareError,
  SHARE_CREATED_MARKER,
} = await import('../../src/lib/ops/share');

const ctx = { tenantId: 'tenant-1', agentId: 'insight' };

const projectInput: ShareLinkCreateInput = {
  scope: 'project',
  projectId: 'proj-1',
  expiresAt: new Date('2026-08-30T00:00:00.000Z'),
  idempotencyKey: 'pa-1',
};

const quarterlyInput: ShareLinkCreateInput = {
  scope: 'quarterly',
  projectId: null,
  expiresAt: null,
  idempotencyKey: 'pa-2',
};

/** 网络哨兵：任何外呼都翻红（零外呼断言的实现，不是靠「读代码觉得没有」）。 */
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  created.length = 0;
  fetchSpy = vi.fn(() => {
    throw new Error(
      '禁止外呼：本批 share 适配器必须零网络调用（P4 零真实公开暴露）',
    );
  });
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('env 选择器（本批恒 mock，prod 不 fail-fast）', () => {
  it('未配 provider → Mock 实现', () => {
    expect(getShareLinkService()).toBeInstanceOf(MockShareLinkService);
  });

  it('production 下依然回落 mock（与 ops/email 的差异：本层无真实现，fail-fast 无收益）', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(getShareLinkService()).toBeInstanceOf(MockShareLinkService);
  });

  it('显式 provider=mock → 受支持', () => {
    vi.stubEnv('SHARE_LINK_PROVIDER', 'mock');
    expect(getShareLinkService()).toBeInstanceOf(MockShareLinkService);
  });

  it('配了未实装的 provider → 明示拒绝（不静默回落 mock，防「以为生成了真实链接」）', () => {
    vi.stubEnv('SHARE_LINK_PROVIDER', 'cdn');
    expect(() => getShareLinkService()).toThrowError(ShareError);
  });
});

describe('MockShareLinkService 契约', () => {
  it('createShareLink 返回 payloadRef + token 形状 + mocked=true + publicUrl=null', async () => {
    const r = await getShareLinkService().createShareLink(projectInput, ctx);
    expect(r.payloadRef).toMatch(/^share-payload:project:proj-1:/);
    expect(r.token).toMatch(/^[0-9a-f]{64}$/); // 32 字节加密强随机 → 64 位 hex
    expect(r.mocked).toBe(true);
    expect(r.publicUrl).toBeNull(); // 没有真实可公开访问的地址就不编一个
  });

  it('写 SHARE_CREATED_MARKER 留痕（kind=auto / actor / payloadRef 在场）', async () => {
    const r = await getShareLinkService().createShareLink(projectInput, ctx);
    expect(created).toHaveLength(1);
    const log = created[0] as { summary: string; kind: string; actor: string };
    expect(log.summary).toContain(SHARE_CREATED_MARKER);
    expect(log.summary).toContain(r.payloadRef);
    expect(log.summary).toContain('未产生任何真实可公开访问的链接');
    expect(log.kind).toBe('auto');
    expect(log.actor).toBe('insight');
  });

  it('留痕载荷带 scope / projectId / 幂等键 / mocked / expiresAt（供闸门与验收观测）', async () => {
    await getShareLinkService().createShareLink(projectInput, ctx);
    const payload = (created[0] as { payloadJson: Record<string, unknown> })
      .payloadJson;
    expect(payload.scope).toBe('project');
    expect(payload.projectId).toBe('proj-1');
    expect(payload.idempotencyKey).toBe('pa-1');
    expect(payload.mocked).toBe(true);
    expect(payload.expiresAt).toBe('2026-08-30T00:00:00.000Z');
  });

  it('token 明文不入日志（ADR-25：明文仅返回值出现一次，hash 落库归 F008 调用方）', async () => {
    const r = await getShareLinkService().createShareLink(projectInput, ctx);
    expect(JSON.stringify(created)).not.toContain(r.token);
  });

  it('token 与 payloadRef 每次调用都不同（加密强随机，不可预测）', async () => {
    const svc = getShareLinkService();
    const a = await svc.createShareLink(projectInput, ctx);
    const b = await svc.createShareLink(projectInput, ctx);
    expect(a.token).not.toBe(b.token);
    expect(a.payloadRef).not.toBe(b.payloadRef);
  });

  it('scope=quarterly 跨项目：projectId=null / expiresAt=null 合法', async () => {
    const r = await getShareLinkService().createShareLink(quarterlyInput, ctx);
    expect(r.payloadRef).toMatch(/^share-payload:quarterly:cross-project:/);
    const payload = (created[0] as { payloadJson: Record<string, unknown> })
      .payloadJson;
    expect(payload.projectId).toBeNull();
    expect(payload.expiresAt).toBeNull();
  });

  it('scope=project 缺 projectId / 空幂等键 → ShareError（明示拒绝不静默成功）', async () => {
    await expect(
      getShareLinkService().createShareLink(
        { ...projectInput, projectId: null },
        ctx,
      ),
    ).rejects.toThrowError(ShareError);
    await expect(
      getShareLinkService().createShareLink(
        { ...projectInput, idempotencyKey: '' },
        ctx,
      ),
    ).rejects.toThrowError(ShareError);
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
    await getShareLinkService().createShareLink(projectInput, {
      ...ctx,
      db: db as never,
    });
    expect(txCreated).toHaveLength(1);
    expect(created).toHaveLength(0); // 没有绕过事务写全局 prisma
  });
});

describe('P4 零外呼断言', () => {
  it('跑完 mock 创建路径后，fetch 一次都没被调用', async () => {
    await getShareLinkService().createShareLink(projectInput, ctx);
    await getShareLinkService().createShareLink(quarterlyInput, ctx);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
