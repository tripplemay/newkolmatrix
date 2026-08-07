// M5.1b-TENANT-INJECTION F004 — 迁移后各调用点的**原子性归属**验证。
//
// 【判据比「注入失败看回滚」更强，理由在这】
// 常规做法是往函数内部注入一个失败、看它自己回滚。那只能证明「它开了个事务」，
// **证不了它开的是不是调用方那个事务**——而审计 B1-4 实测到的缺陷恰恰是「它另开了一个，
// 于是调用方回滚带不走它」。
//
// 本文件改用：**从外层 withTenant（同租户）调用被测函数，然后让外层抛错**。
//   · 若被测点确实迁到了 withTenant → 同租户嵌套复用外层事务 → 外层回滚把它一起带走 → 零残留
//   · 若它仍走自己的 prisma.$transaction → 要么另开事务独立提交（残留，红），
//     要么在 ALS 作用域内拿到 TransactionClient 而 $transaction 不存在（当场炸，红）
// 两种退化都逃不过。这条判据同时覆盖了 acceptance ③ 的「回滚后零残留」与「确实在同一事务里」。
//
// 【已由既有用例覆盖的 3 处，不重复造（acceptance ③ 允许）】
//   · gate.ts:364 executePendingAction  → tests/integration/create-share-link.test.ts:218
//     （pending→confirm 窗口内项目被删 → execute 拒 + 无 irrev 行 + 业务回滚无 ShareLink 行）
//     与 tests/integration/payout-gate.test.ts:274（业务写入随事务回滚：无 Payout 行）
//   · auth/register.ts:110 registerAccount → tests/integration/auth-register.test.ts:192
//     （事务内最后一步失败 → 前面两张表全部回滚，真 Postgres 非 mock）
// 本文件补的是其余 4 处 + acceptance ② 的反向断言。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { privilegedDb } from '../../src/lib/db/privileged';
import { withTenant } from '../../src/lib/db/tenant-scope';
import { confirmPendingAction, createPendingAction, rejectPendingAction } from '../../src/lib/agent/gate/gate';
import { registerDealRefs, registerKeyPool, verifyDeliverable } from '../../src/lib/delivery/register';
import type { ToolContext } from '../../src/lib/agent/tools/types';

if (!process.env.DATABASE_URL) {
  throw new Error('[F004] 缺 DATABASE_URL —— 本文件断言真事务行为，必须有真库');
}

const TAG = `f004atomic-${process.pid}`;
const ORIGINAL_SWITCH = process.env.DB_APP_ROLE_RUNTIME;

let tenantId = '';
let projectId = '';
let ctx: ToolContext;

/** 外层刻意抛的哨兵——用它做 rejects.toBe，确保回滚是被我们触发的那次。 */
const ROLLBACK = new Error('[F004] 外层刻意抛错以触发回滚');

beforeAll(async () => {
  delete process.env.DB_APP_ROLE_RUNTIME; // 全程开关关（写不受 RLS 阻挡）
  const tenant = await privilegedDb.tenant.create({
    data: { name: 'F004 atomicity', slug: `${TAG}-tenant` },
    select: { id: true },
  });
  tenantId = tenant.id;
  const project = await privilegedDb.project.create({
    data: { tenantId, name: `${TAG}-project`, cur: 'delivery' },
    select: { id: true },
  });
  projectId = project.id;
  ctx = { tenantId, agentId: 'delivery', projectId, env: 'default' };
});

afterAll(async () => {
  if (ORIGINAL_SWITCH === undefined) delete process.env.DB_APP_ROLE_RUNTIME;
  else process.env.DB_APP_ROLE_RUNTIME = ORIGINAL_SWITCH;
  // 清理：每步独立 try/catch，只告警不抛（清理段自己一抛就同时干掉首因可见与环境干净）。
  try {
    if (tenantId) await privilegedDb.tenant.delete({ where: { id: tenantId } });
  } catch (err) {
    console.warn(`[F004] 清理租户失败（不掩盖测试结果）：${(err as Error).message}`);
  }
  // 第二层：不从登记表派生的前缀普查——变异实跑时若某点独立提交，残留只有它兜得住。
  try {
    const strays = await privilegedDb.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM "Tenant" WHERE slug LIKE $1',
      `${TAG}-%`,
    );
    for (const row of strays) {
      try {
        await privilegedDb.tenant.delete({ where: { id: row.id } });
      } catch (err) {
        console.warn(`[F004] 普查清理 ${row.id} 失败：${(err as Error).message}`);
      }
    }
  } catch (err) {
    console.warn(`[F004] 前缀普查失败（不掩盖测试结果）：${(err as Error).message}`);
  }
});

async function makeDeal(handle: string): Promise<string> {
  const kol = await privilegedDb.kol.create({
    data: { tenantId, canonicalHandle: `${TAG}-${handle}`, displayName: handle },
    select: { id: true },
  });
  const deal = await privilegedDb.deal.create({
    data: {
      tenantId,
      projectId,
      kolId: kol.id,
      status: 'negotiating',
      termsJson: { amount: 100, currency: 'USD', deliverables: ['1 条'], scope: null } as unknown as Prisma.InputJsonValue,
      deliverables: {
        create: [
          { tenantId, kind: 'content', required: true, status: 'missing' },
          { tenantId, kind: 'contract', required: true, status: 'missing' },
          { tenantId, kind: 'escrow', required: true, status: 'missing' },
        ],
      },
    },
    select: { id: true },
  });
  return deal.id;
}

async function makePending(toolName: string): Promise<string> {
  const env = await createPendingAction(
    toolName,
    { probe: toolName },
    {
      action: toolName,
      summary: 'F004 原子性夹具',
      targets: ['f004-target'],
      evidence: 'F004 夹具证据',
      irreversible: true,
    } as never,
    ctx,
  );
  return env.pendingActionId ?? (env as unknown as { id: string }).id;
}

/* ================================================================== *
 * gate.ts 两处（:249 confirm / :431 reject）
 * ================================================================== */

describe('gate.ts 的写入归属于调用方事务', () => {
  it('confirmPendingAction（gate.ts:249）随外层回滚 → 状态仍是 pending', async () => {
    const paId = await makePending('f004_confirm');
    await expect(
      withTenant(tenantId, async () => {
        await confirmPendingAction(paId, ctx);
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
    const after = await privilegedDb.pendingAction.findUnique({
      where: { id: paId },
      select: { status: true, ticketHash: true },
    });
    // 若 confirm 另开事务独立提交，这里会是 'confirmed' + 非空 ticketHash
    expect(after?.status).toBe('pending');
    expect(after?.ticketHash).toBeNull();
  });

  it('rejectPendingAction（gate.ts:431）随外层回滚 → 状态仍是 pending', async () => {
    const paId = await makePending('f004_reject');
    await expect(
      withTenant(tenantId, async () => {
        await rejectPendingAction(paId, ctx);
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
    const after = await privilegedDb.pendingAction.findUnique({
      where: { id: paId },
      select: { status: true },
    });
    expect(after?.status).toBe('pending');
  });
});

/* ================================================================== *
 * delivery/register.ts 三处（:96 refs / :203 verify / :289 keys）
 * ================================================================== */

describe('delivery/register.ts 的写入归属于调用方事务', () => {
  it('registerDealRefs（:96）随外层回滚 → contractRef 未落库、条件未翻', async () => {
    const dealId = await makeDeal('refs');
    await expect(
      withTenant(tenantId, async () => {
        await registerDealRefs(dealId, { contractRef: 'sign-f004' }, { tenantId, actor: 'test' });
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
    const deal = await privilegedDb.deal.findUnique({
      where: { id: dealId },
      select: { contractRef: true, status: true },
    });
    expect(deal?.contractRef).toBeNull();
    expect(deal?.status).toBe('negotiating');
  });

  it('verifyDeliverable（:203）随外层回滚 → 条件状态未变', async () => {
    const dealId = await makeDeal('verify');
    const cond = await privilegedDb.deliverable.findFirst({
      where: { dealId, kind: 'content' },
      select: { id: true },
    });
    await expect(
      withTenant(tenantId, async () => {
        await verifyDeliverable(cond!.id, { status: 'met', evidenceRef: 'f004-证据' }, { tenantId, actor: 'test' });
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
    const after = await privilegedDb.deliverable.findUnique({
      where: { id: cond!.id },
      select: { status: true, evidenceRef: true },
    });
    expect(after?.status).toBe('missing');
    expect(after?.evidenceRef).toBeNull();
  });

  it('registerKeyPool（:289）随外层回滚 → key 条目零残留', async () => {
    const dealId = await makeDeal('keys');
    const before = await privilegedDb.gameKey.count({ where: { tenantId } });
    await expect(
      withTenant(tenantId, async () => {
        await registerKeyPool(dealId, { keyRefs: [`${TAG}-key-1`, `${TAG}-key-2`] }, { tenantId, actor: 'test' });
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
    expect(await privilegedDb.gameKey.count({ where: { tenantId } })).toBe(before);
  });
});

/* ================================================================== *
 * acceptance ② 的**反向**断言：白名单事务不得混进 withTenant 租户路径
 * ================================================================== */

describe('acceptance ②：auth/register.ts 的注册事务走 privilegedDb，不随租户事务回滚', () => {
  it('在外层 withTenant 内注册 → 外层回滚，但注册的租户/用户**仍在**（证明它走的是独立的特权连接）', async () => {
    const { registerAccount } = await import('../../src/lib/auth/register');
    const email = `${TAG}-reg@test.local`;
    let newTenantId: string | null = null;
    await expect(
      withTenant(tenantId, async () => {
        const r = await registerAccount({
          email,
          password: 'Str0ng!Passw0rd',
          name: 'F004',
          tenantName: `${TAG}-registered`,
        });
        if (r.ok) newTenantId = r.account.tenantId;
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);

    // 关键断言：注册不是租户路径的一部分——它必须**逃出**外层回滚。
    // 若哪天有人把 register.ts 改成走 withTenant，这里会红，逼他回来读 spec D-5 与 F003 白名单。
    expect(newTenantId, '注册应当成功（走特权连接，不受外层事务影响）').toBeTruthy();
    const survived = await privilegedDb.user.findUnique({
      where: { email },
      select: { id: true, tenantId: true },
    });
    expect(survived, '注册写入必须逃出外层回滚——它走的是 privilegedDb 的独立事务').not.toBeNull();

    // 清理这次注册出来的租户（不进主登记表，靠前缀普查也能兜）
    try {
      if (newTenantId) await privilegedDb.tenant.delete({ where: { id: newTenantId } });
    } catch (err) {
      console.warn(`[F004] 清理注册租户失败：${(err as Error).message}`);
    }
  });
});
