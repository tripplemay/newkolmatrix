// M3-B-DELIVERY F005 — Evaluator 独立对抗探针（验收产物，Andy/evaluator-subagent）
//
// 与 payout-gate.test.ts（Generator 交付）互补，覆盖其未触及的对抗面：
// 1. **入参防篡改**：模型直填 amount/payee → 披露金额仍取库内 termsJson 快照
// 2. **P6 三类未覆盖缺口**：NA_BUT_REQUIRED（required 却标 na）/ ROW_ABSENT（条件行整类缺失）
//    —— Generator 只测了 MISSING 一类
// 3. **完全绕过闸门**：伪造 confirmationToken 直调 executeTool（连 PendingAction 都不建）
//    → 执行体内二次校验仍拒（证明硬闸在执行体内，不依赖闸门链路）
// 4. **事务原子性的「写后失败」证明**：payout.create(prepared) 已发生之后再失败
//    （provider 配非 mock）→ prepared 行必须随事务回滚 + failed + 无 irrev
//    （Generator 的退化用例在 create 之前就抛错，证不到「写后回滚」）
// 5. **跨租户越权**：B 租户 ctx 拿 A 租户 dealId → 明示「交易不存在」
// 6. **P1 零外呼的进程级证明**：整个 suite 期间 globalThis.fetch 被计数探针替换，
//    断言调用次数恒 0（不依赖「读代码觉得没外呼」）
// 7. **行为观测（非判定）**：同一 Deal 第二次人工确认可再次放款——幂等键按 spec 是
//    PendingAction.id，故非「重入」；此处只如实记录行为供 M5 接真时决策
//
// 夹具租户按 pid 独立（test-tenant-m3b-payout-probe-*），CI / 本地并行安全。
// 本文件只读产品代码、只写测试夹具，不改任何 src/ 产物。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/lib/db/prisma';
import { executeTool } from '../../src/lib/agent/execute';
import {
  confirmPendingAction,
  executePendingAction,
} from '../../src/lib/agent/gate/gate';
import { isPendingEnvelope } from '../../src/lib/agent/gate/harm';
import { getTool } from '../../src/lib/agent/tools/registry';
import { getNativeToolNames } from '../../src/lib/agent/tools';
import { listPersonas } from '../../src/lib/agent/registry';
import { RELEASED_MARKER } from '../../src/lib/ops/partner';
import type { ToolContext } from '../../src/lib/agent/tools/types';

const SLUG_A = `test-tenant-m3b-payout-probe-a-${process.pid}`;
const SLUG_B = `test-tenant-m3b-payout-probe-b-${process.pid}`;

let tenantA: string;
let tenantB: string;
let projectA: string;
let ctxA: ToolContext;
let ctxB: ToolContext;

/** 整个 suite 的外呼计数探针（P1：零真实资金动作 ⇒ 零 fetch）。 */
let fetchCalls = 0;
let originalFetch: typeof globalThis.fetch;

type Cond = {
  kind: 'content' | 'key' | 'contract' | 'escrow' | 'ad_disclosure';
  status: 'pending' | 'met' | 'missing' | 'na';
  required: boolean;
  evidenceRef?: string | null;
};

const ALL_MET: Cond[] = [
  { kind: 'content', status: 'met', required: true, evidenceRef: 'video://x1' },
  { kind: 'key', status: 'na', required: false },
  { kind: 'contract', status: 'met', required: true },
  { kind: 'escrow', status: 'met', required: true },
  {
    kind: 'ad_disclosure',
    status: 'met',
    required: true,
    evidenceRef: 'shot://ad1',
  },
];

let kolSeq = 0;

/** 造一个 Deal（条件行完全由调用方指定 —— 便于构造 ROW_ABSENT 等异常形态）。 */
async function makeDeal(opts: {
  tenantId: string;
  projectId: string;
  label: string;
  terms: Record<string, unknown>;
  conds: Cond[];
  status?: 'negotiating' | 'delivering' | 'completed' | 'blocked';
  contractRef?: string | null;
  escrowRef?: string | null;
}): Promise<string> {
  kolSeq += 1;
  const kol = await prisma.kol.create({
    data: {
      tenantId: opts.tenantId,
      canonicalHandle: `probe-${process.pid}-${kolSeq}`,
      displayName: opts.label,
    },
  });
  const deal = await prisma.deal.create({
    data: {
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      kolId: kol.id,
      status: opts.status ?? 'negotiating',
      termsJson: opts.terms as unknown as Prisma.InputJsonValue,
      contractRef: opts.contractRef === undefined ? 'sign-P1' : opts.contractRef,
      escrowRef: opts.escrowRef === undefined ? 'esc-P1' : opts.escrowRef,
      deliverables: {
        create: opts.conds.map((c) => ({
          tenantId: opts.tenantId,
          kind: c.kind,
          status: c.status,
          required: c.required,
          evidenceRef: c.evidenceRef ?? null,
        })),
      },
    },
  });
  return deal.id;
}

const markers = (tenantId: string) =>
  prisma.operationLog.count({
    where: { tenantId, summary: { contains: RELEASED_MARKER } },
  });

async function cleanTenant(tenantId: string) {
  await prisma.operationLog.deleteMany({ where: { tenantId } });
  await prisma.pendingAction.deleteMany({ where: { tenantId } });
  await prisma.project.deleteMany({ where: { tenantId } }); // 级联 deal/deliverable/payout
  await prisma.kol.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

beforeAll(async () => {
  getNativeToolNames();
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    fetchCalls += 1;
    throw new Error(
      `[probe] 探针拦截：本批不应有任何外呼（P1）。目标=${String(args[0])}`,
    );
  }) as typeof globalThis.fetch;

  const a = await prisma.tenant.create({
    data: { slug: SLUG_A, name: 'M3B payout 探针租户 A' },
  });
  tenantA = a.id;
  const b = await prisma.tenant.create({
    data: { slug: SLUG_B, name: 'M3B payout 探针租户 B' },
  });
  tenantB = b.id;
  const p = await prisma.project.create({
    data: { tenantId: tenantA, name: 'payout 探针项目 A' },
  });
  projectA = p.id;
  await prisma.project.create({
    data: { tenantId: tenantB, name: 'payout 探针项目 B' },
  });
  ctxA = { tenantId: tenantA, agentId: 'delivery', projectId: projectA, env: 'default' };
  ctxB = { tenantId: tenantB, agentId: 'delivery', projectId: null, env: 'default' };
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await cleanTenant(tenantA);
  await cleanTenant(tenantB);
  await prisma.$disconnect();
});

// ───────────────────────────── 1. 契约 ─────────────────────────────

describe('[probe] 契约：outbound + buildHarm async + 人格挂载', () => {
  it('payout 在注册表、class=outbound、buildHarm 是 async 函数', async () => {
    const tool = getTool('payout');
    expect(tool).toBeTruthy();
    expect(tool?.class).toBe('outbound');
    expect(tool?.source).toBe('native');
    // async：调用返回 Promise（不是同步返回对象）——acceptance 明写 async buildHarm
    const ret = tool?.buildHarm?.({ dealId: 'nope' } as never, ctxA);
    expect(ret).toBeInstanceOf(Promise);
    await expect(ret as Promise<unknown>).rejects.toThrowError();
  });

  it('delivery 人格声明 payout，且 native 名单含 payout（双向同源）', () => {
    const delivery = listPersonas().find((p) => p.id === 'delivery');
    expect(delivery?.tools).toContain('payout');
    expect(getNativeToolNames()).toContain('payout');
  });

  it('入参 schema 只认 dealId：空串拒、缺字段拒', async () => {
    await expect(executeTool('payout', { dealId: '' }, ctxA)).rejects.toThrowError(
      /入参校验失败/,
    );
    await expect(executeTool('payout', {}, ctxA)).rejects.toThrowError(
      /入参校验失败/,
    );
  });
});

// ─────────────── 2. 披露取库内快照（不接受模型转述金额）───────────────

describe('[probe] harm 三行 + 防模型转述金额', () => {
  it('模型直填 amount/payee → 披露仍取 termsJson 快照与库内创作者名', async () => {
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeSnapshot',
      terms: { amount: 1234.5, currency: 'EUR', deliverables: ['1 长视频'] },
      conds: ALL_MET,
    });
    // 攻击载荷：模型试图直填金额与收款方
    const r = await executeTool(
      'payout',
      { dealId, amount: 999999, payee: 'attacker@evil.test', currency: 'BTC' },
      ctxA,
    );
    expect(isPendingEnvelope(r.output)).toBe(true);
    if (!isPendingEnvelope(r.output)) throw new Error('unreachable');
    const harm = r.output.harm;
    expect(harm.amount).toBe(1234.5); // 库内快照，不是 999999
    expect(harm.currency).toBe('EUR'); // 不是 BTC
    expect(harm.targets).toEqual(['ProbeSnapshot']); // 不是 attacker@evil.test
    expect(harm.irreversible).toBe(true);
    expect(harm.label).toBe('对外·不可撤销');
    // 三行齐：收款方 / 金额+币种 / 依据（合同 + 托管 + 披露证据）
    expect(harm.evidence).toContain('合同 sign-P1');
    expect(harm.evidence).toContain('托管 esc-P1');
    expect(harm.evidence).toContain('#ad 披露 shot://ad1');
    // 副作用零发生
    expect(await prisma.payout.count({ where: { tenantId: tenantA, dealId } })).toBe(0);
    expect(await markers(tenantA)).toBe(0);
  });

  it('单号未登记 → 依据如实写「已核验（未登记单号）」，不编造单号', async () => {
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeNoRefs',
      terms: { amount: 300, currency: 'USD' },
      conds: [
        { kind: 'content', status: 'met', required: true },
        { kind: 'key', status: 'na', required: false },
        { kind: 'contract', status: 'met', required: true },
        { kind: 'escrow', status: 'met', required: true },
        { kind: 'ad_disclosure', status: 'met', required: true },
      ],
      contractRef: null,
      escrowRef: null,
    });
    const r = await executeTool('payout', { dealId }, ctxA);
    if (!isPendingEnvelope(r.output)) throw new Error('应停在闸门');
    expect(r.output.harm.evidence).toContain('合同 已核验（未登记单号）');
    expect(r.output.harm.evidence).toContain('托管 已核验（未登记单号）');
    expect(r.output.harm.evidence).not.toMatch(/sign-|esc-/);
  });
});

// ─────────────── 3. P6 服务端二次校验：Generator 未覆盖的缺口类 ───────────────

describe('[probe] P6 未覆盖缺口类 + 完全绕过闸门', () => {
  it('required=true 却标 na（数据异常）→ buildHarm 拒，PendingAction 不产生', async () => {
    const before = await prisma.pendingAction.count({ where: { tenantId: tenantA } });
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeNaRequired',
      terms: { amount: 400, currency: 'USD' },
      conds: [
        { kind: 'content', status: 'met', required: true },
        { kind: 'key', status: 'na', required: false },
        { kind: 'contract', status: 'met', required: true },
        { kind: 'escrow', status: 'met', required: true },
        { kind: 'ad_disclosure', status: 'na', required: true }, // 异常：必需却标不适用
      ],
    });
    await expect(executeTool('payout', { dealId }, ctxA)).rejects.toThrowError(
      /被标为不适用但本合作必需/,
    );
    expect(await prisma.pendingAction.count({ where: { tenantId: tenantA } })).toBe(
      before,
    );
    expect(await prisma.payout.count({ where: { tenantId: tenantA, dealId } })).toBe(0);
  });

  it('条件行整类缺失（只建 3 行）→ fail-safe 拒付，明示哪几类缺行', async () => {
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeRowAbsent',
      terms: { amount: 500, currency: 'USD' },
      conds: [
        { kind: 'content', status: 'met', required: true },
        { kind: 'contract', status: 'met', required: true },
        { kind: 'escrow', status: 'met', required: true },
      ],
    });
    await expect(executeTool('payout', { dealId }, ctxA)).rejects.toThrowError(
      /条件行缺失/,
    );
  });

  it('完全绕过闸门（伪造 confirmationToken 直调 executeTool）+ 条件未齐 → 执行体内仍拒', async () => {
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeForgedToken',
      terms: { amount: 600, currency: 'USD' },
      conds: [
        { kind: 'content', status: 'missing', required: true },
        { kind: 'key', status: 'na', required: false },
        { kind: 'contract', status: 'met', required: true },
        { kind: 'escrow', status: 'met', required: true },
        { kind: 'ad_disclosure', status: 'met', required: true },
      ],
    });
    const markersBefore = await markers(tenantA);
    await expect(
      executeTool(
        'payout',
        { dealId },
        { ...ctxA, confirmationToken: 'forged-token-not-from-gate' },
      ),
    ).rejects.toThrowError(/无绕过入口/);
    // 连 PendingAction 都没建（本路径根本不过闸门），且零副作用
    expect(await prisma.payout.count({ where: { tenantId: tenantA, dealId } })).toBe(0);
    expect(await markers(tenantA)).toBe(markersBefore);
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.status).toBe('negotiating');
  });

  it('跨租户：B 租户 ctx 拿 A 租户 dealId → 明示「交易不存在」（不泄露也不放款）', async () => {
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeTenantIso',
      terms: { amount: 700, currency: 'USD' },
      conds: ALL_MET,
    });
    await expect(executeTool('payout', { dealId }, ctxB)).rejects.toThrowError(
      /交易不存在/,
    );
    expect(await prisma.payout.count({ where: { dealId } })).toBe(0);
  });
});

// ─────────────── 4. 真链 + 事务原子性（写后失败必回滚）───────────────

describe('[probe] 真链 pending→confirm→execute 与失败回滚', () => {
  it('全链：released + gateLogId + releasedAt + Deal completed + irrev + marker 恰好 1', async () => {
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeHappyPath',
      terms: { amount: 880.25, currency: 'USD', deliverables: ['1 长视频'] },
      conds: ALL_MET,
    });
    const before = await markers(tenantA);
    const r = await executeTool('payout', { dealId }, ctxA);
    if (!isPendingEnvelope(r.output)) throw new Error('应停在闸门');
    const paId = r.output.pendingActionId;
    // 确认前：零副作用
    expect(await prisma.payout.count({ where: { tenantId: tenantA, dealId } })).toBe(0);
    expect(await markers(tenantA)).toBe(before);

    const conf = await confirmPendingAction(paId, ctxA);
    const exec = await executePendingAction(paId, conf.ticket, ctxA);
    const out = exec.output as { released: boolean; mocked: boolean; amount: number };
    expect(out.released).toBe(true);
    expect(out.mocked).toBe(true);
    expect(out.amount).toBe(880.25);

    const payout = await prisma.payout.findFirst({
      where: { tenantId: tenantA, dealId },
    });
    expect(payout?.status).toBe('released');
    expect(payout?.gateLogId).toBe(paId); // 幂等键 = PendingAction.id
    expect(payout?.releasedAt).not.toBeNull();
    expect(Number(payout?.amount)).toBe(880.25); // Decimal(14,2) 无精度漂移
    expect(payout?.currency).toBe('USD');

    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.status).toBe('completed');

    const irrev = await prisma.operationLog.count({
      where: { tenantId: tenantA, kind: 'irrev', ref: paId },
    });
    expect(irrev).toBe(1);
    expect(await markers(tenantA)).toBe(before + 1); // mock 放款只发生一次

    const pa = await prisma.pendingAction.findUnique({ where: { id: paId } });
    expect(pa?.status).toBe('executed');

    // 幂等：同 gateActionId 重放执行体 → already=true，不双放
    const replay = (await getTool('payout')!.execute({ dealId } as never, {
      ...ctxA,
      confirmationToken: 'internal',
      gateActionId: paId,
    })) as { already: boolean };
    expect(replay.already).toBe(true);
    expect(await prisma.payout.count({ where: { tenantId: tenantA, dealId } })).toBe(1);
    expect(await markers(tenantA)).toBe(before + 1);
  });

  it('写后失败（Payout prepared 已写入后 partner 抛错）→ 整事务回滚 + failed + 无 irrev', async () => {
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeRollback',
      terms: { amount: 950, currency: 'USD' },
      conds: ALL_MET,
    });
    const before = await markers(tenantA);
    const r = await executeTool('payout', { dealId }, ctxA);
    if (!isPendingEnvelope(r.output)) throw new Error('应停在闸门');
    const paId = r.output.pendingActionId;
    const conf = await confirmPendingAction(paId, ctxA);

    // 有人把 provider 配成非 mock（期待真实行为）→ 选择器必须明示拒绝，不静默回落 mock。
    // 该抛错发生在 payout.create(prepared) **之后**，用于证明「写后失败也整体回滚」。
    const saved = process.env.ESCROW_PARTNER_PROVIDER;
    process.env.ESCROW_PARTNER_PROVIDER = 'stripe';
    try {
      await expect(
        executePendingAction(paId, conf.ticket, ctxA),
      ).rejects.toThrowError(/未实装|mock/);
    } finally {
      if (saved === undefined) delete process.env.ESCROW_PARTNER_PROVIDER;
      else process.env.ESCROW_PARTNER_PROVIDER = saved;
    }

    // prepared 行必须随事务回滚（不留孤儿）
    expect(await prisma.payout.count({ where: { tenantId: tenantA, dealId } })).toBe(0);
    const pa = await prisma.pendingAction.findUnique({ where: { id: paId } });
    expect(pa?.status).toBe('failed');
    expect(
      await prisma.operationLog.count({
        where: { tenantId: tenantA, kind: 'irrev', ref: paId },
      }),
    ).toBe(0);
    expect(await markers(tenantA)).toBe(before); // 未发生 mock 放款
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    expect(deal?.status).toBe('negotiating'); // 状态未被推进
  });

  it('pending→confirm 窗口内条件退化 → 绕过前端直打 execute 被拒（execute 端二次校验独立成立）', async () => {
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeDegrade',
      terms: { amount: 1000, currency: 'USD' },
      conds: ALL_MET,
    });
    const before = await markers(tenantA);
    const r = await executeTool('payout', { dealId }, ctxA);
    if (!isPendingEnvelope(r.output)) throw new Error('应停在闸门');
    const paId = r.output.pendingActionId;
    const conf = await confirmPendingAction(paId, ctxA); // 票已签发（人已确认）

    // 条件退化发生在签票之后、消费之前
    await prisma.deliverable.updateMany({
      where: { dealId, kind: 'content' },
      data: { status: 'missing', evidenceRef: null },
    });

    await expect(
      executePendingAction(paId, conf.ticket, ctxA),
    ).rejects.toThrowError(/无绕过入口/);
    expect(await prisma.payout.count({ where: { tenantId: tenantA, dealId } })).toBe(0);
    expect(await markers(tenantA)).toBe(before);
    expect(
      (await prisma.pendingAction.findUnique({ where: { id: paId } }))?.status,
    ).toBe('failed');
  });
});

// ─────────────── 5. 行为观测（记录，不作判定）───────────────

describe('[probe] 行为观测：幂等边界（spec 口径 = PendingAction.id）', () => {
  it('同一 Deal 第二次人工确认 → 再次放款成功（记录当前口径，供 M5 接真时决策）', async () => {
    const dealId = await makeDeal({
      tenantId: tenantA,
      projectId: projectA,
      label: 'ProbeSecondPayout',
      terms: { amount: 100, currency: 'USD' },
      conds: ALL_MET,
    });
    const r1 = await executeTool('payout', { dealId }, ctxA);
    if (!isPendingEnvelope(r1.output)) throw new Error('应停在闸门');
    const c1 = await confirmPendingAction(r1.output.pendingActionId, ctxA);
    await executePendingAction(r1.output.pendingActionId, c1.ticket, ctxA);

    // 第二笔：全新 PendingAction（需人再确认一次红闸门）
    const r2 = await executeTool('payout', { dealId }, ctxA);
    const secondStoppedAtGate = isPendingEnvelope(r2.output);
    expect(secondStoppedAtGate).toBe(true); // 至少必须再次停在人确认前
    if (!isPendingEnvelope(r2.output)) throw new Error('unreachable');
    const c2 = await confirmPendingAction(r2.output.pendingActionId, ctxA);
    await executePendingAction(r2.output.pendingActionId, c2.ticket, ctxA);

    const count = await prisma.payout.count({ where: { tenantId: tenantA, dealId } });
    // 当前实现：两笔独立 Payout（幂等键是 PendingAction.id，不是 dealId）
    expect(count).toBe(2);
  });
});

// ─────────────── 6. P1：整 suite 零外呼 ───────────────

describe('[probe] P1 零真实资金动作', () => {
  it('全过程 globalThis.fetch 调用次数 = 0', () => {
    expect(fetchCalls).toBe(0);
  });

  it('ops/partner 层无真实 provider 分支：非 mock 取值一律明示拒绝', async () => {
    const { getEscrowPartner } = await import('../../src/lib/ops/partner');
    const saved = process.env.ESCROW_PARTNER_PROVIDER;
    try {
      process.env.ESCROW_PARTNER_PROVIDER = 'real';
      expect(() => getEscrowPartner()).toThrowError(/未实装/);
      process.env.ESCROW_PARTNER_PROVIDER = 'mock';
      expect(getEscrowPartner().constructor.name).toBe('MockEscrowPartner');
      delete process.env.ESCROW_PARTNER_PROVIDER;
      expect(getEscrowPartner().constructor.name).toBe('MockEscrowPartner');
    } finally {
      if (saved === undefined) delete process.env.ESCROW_PARTNER_PROVIDER;
      else process.env.ESCROW_PARTNER_PROVIDER = saved;
    }
  });
});
