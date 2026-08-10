// M5.2-TENANT-COVERAGE F003 acceptance ② — delivery/register.ts 的 3 处既有 withTenant
// 在入口包裹后**复用外层事务**，而不是另开一个。
//
// 【判据为什么用 xmin，而不是「按语义应该」】acceptance 明写不接受语义论证。
// Postgres 每行都带系统列 `xmin` = **写下这一行的事务 id**。于是：
//   在外层作用域里取 `txid_current()` → T；调 register 的函数；再读它写的那一行的 xmin。
//   · 复用外层事务 → xmin == T
//   · 另开一个事务 → xmin 是别的值
// 这是行级的物证，不依赖任何对 withTenant 实现的假设。
//
// 【§2 是鉴别力对照，不是重复用例】只有 §1 的话，「xmin == T」在「xmin 恒等于任何 txid」
// 这种坏测量下同样成立。§2 拿一次**无外层作用域**的调用做对照：它写的行 xmin 必须与
// 另一个事务里读到的 txid 不同。没有这一条，§1 证不了测量本身能分辨两种情况。
//
// 【开关全程关】本文件断言的是事务结构，与 RLS 无关；privilegedDb 建夹具、prisma 走被测路径。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  registerDealRefs,
  registerKeyPool,
  verifyDeliverable,
} from '../../src/lib/delivery/register';
import { privilegedDb } from '../../src/lib/db/privileged';
import { prisma } from '../../src/lib/db/prisma';
import { withTenant } from '../../src/lib/db/tenant-scope';

if (!process.env.DATABASE_URL) {
  throw new Error('[M5.2-F003] 缺 DATABASE_URL —— 本文件断言真事务行为，必须有真库');
}

const TAG = `m52f003-${process.pid}`;
const ORIGINAL_SWITCH = process.env.DB_APP_ROLE_RUNTIME;
const REG_CTX = { actor: 'm52-f003-test' };

let tenantId = '';
let projectId = '';

beforeAll(async () => {
  delete process.env.DB_APP_ROLE_RUNTIME;
  const tenant = await privilegedDb.tenant.create({
    data: { name: `${TAG}-tenant`, slug: `${TAG}-tenant` },
    select: { id: true },
  });
  tenantId = tenant.id;
  const project = await privilegedDb.project.create({
    data: { tenantId, name: `${TAG}-project`, cur: 'delivery' },
    select: { id: true },
  });
  projectId = project.id;
});

afterAll(async () => {
  for (const step of [
    () => privilegedDb.gameKey.deleteMany({ where: { tenantId } }),
    () => privilegedDb.deliverable.deleteMany({ where: { tenantId } }),
    () => privilegedDb.operationLog.deleteMany({ where: { tenantId } }),
    () => privilegedDb.deal.deleteMany({ where: { tenantId } }),
    () => privilegedDb.kol.deleteMany({ where: { tenantId } }),
    () => privilegedDb.project.deleteMany({ where: { tenantId } }),
    () => privilegedDb.tenant.deleteMany({ where: { id: tenantId } }),
  ]) {
    try {
      await step();
    } catch (err) {
      console.warn('[M5.2-F003] 清理步骤失败（继续）:', err);
    }
  }
  if (ORIGINAL_SWITCH === undefined) delete process.env.DB_APP_ROLE_RUNTIME;
  else process.env.DB_APP_ROLE_RUNTIME = ORIGINAL_SWITCH;
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
      termsJson: {
        amount: 100,
        currency: 'USD',
        deliverables: ['1 条'],
        scope: null,
      } as unknown as Prisma.InputJsonValue,
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

/** 当前事务 id（在谁的作用域里调，就是谁的事务）。 */
async function currentTxid(): Promise<string> {
  const rows =
    await prisma.$queryRawUnsafe<Array<{ txid: string }>>(
      'SELECT txid_current()::text AS txid',
    );
  return rows[0].txid;
}

/**
 * 某一行是被哪个事务写下的（系统列 xmin）。
 *
 * 【必须用 `prisma`（走当前作用域），不能用 privilegedDb】首版就是拿特权连接读的，三条全红且
 * 差值恰好是 1（xmin=921875 / 外层 txid=921876）—— 那不是「另开了事务」，是**另一条连接看不见
 * 未提交的版本**：MVCC 下它读到的还是 update 之前的旧行，xmin 自然是建夹具那次的事务。
 * 要证明「这一行是外层事务写的」，就必须在**外层事务内部**读它。
 */
async function rowXmin(table: string, id: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ xmin: string }>>(
    `SELECT xmin::text AS xmin FROM "${table}" WHERE id = $1`,
    id,
  );
  return rows[0].xmin;
}

/* ================================================================== *
 * §1 三处调用点在外层作用域内 → 写下的行属于**外层那个事务**
 * ================================================================== */

describe('§1 register.ts 的 3 处 withTenant 在嵌套时复用外层事务（xmin 物证）', () => {
  it('🔒 registerDealRefs：Deal 行的 xmin == 外层 txid', async () => {
    const dealId = await makeDeal('refs');
    const { outerTxid, xmin } = await withTenant(tenantId, async () => {
      const outerTxid = await currentTxid();
      await registerDealRefs(
        dealId,
        { contractRef: `${TAG}-contract` },
        { tenantId, ...REG_CTX },
      );
      return { outerTxid, xmin: await rowXmin('Deal', dealId) };
    });
    expect(xmin, 'registerDealRefs 另开了一个事务，没复用外层').toBe(outerTxid);
  });

  it('🔒 verifyDeliverable：Deliverable 行的 xmin == 外层 txid', async () => {
    const dealId = await makeDeal('verify');
    const cond = await privilegedDb.deliverable.findFirst({
      where: { dealId, kind: 'content' },
      select: { id: true },
    });
    const { outerTxid, xmin } = await withTenant(tenantId, async () => {
      const outerTxid = await currentTxid();
      await verifyDeliverable(
        cond!.id,
        { status: 'met', evidenceRef: `${TAG}-证据` },
        { tenantId, ...REG_CTX },
      );
      return { outerTxid, xmin: await rowXmin('Deliverable', cond!.id) };
    });
    expect(xmin, 'verifyDeliverable 另开了一个事务，没复用外层').toBe(outerTxid);
  });

  it('🔒 registerKeyPool：KeyRef 行的 xmin == 外层 txid', async () => {
    const dealId = await makeDeal('keys');
    const { outerTxid, xmin } = await withTenant(tenantId, async () => {
      const outerTxid = await currentTxid();
      await registerKeyPool(
        dealId,
        { keyRefs: [`${TAG}-key-1`] },
        { tenantId, ...REG_CTX },
      );
      const row = await prisma.gameKey.findFirst({
        where: { tenantId, dealId },
        select: { id: true },
      });
      return { outerTxid, xmin: await rowXmin('GameKey', row!.id) };
    });
    expect(xmin, 'registerKeyPool 另开了一个事务，没复用外层').toBe(outerTxid);
  });
});

/* ================================================================== *
 * §2 鉴别力对照：xmin 确实随事务变，不是恒等
 * ================================================================== */

describe('§2 对照：无外层作用域时，写下的行属于**另一个**事务', () => {
  it('🔒 register 自开事务写的行，其 xmin ≠ 另一个事务里读到的 txid', async () => {
    const dealId = await makeDeal('solo');
    // 无外层作用域：registerDealRefs 自己开一个事务（M5.1b 语义）
    await registerDealRefs(
      dealId,
      { contractRef: `${TAG}-solo` },
      { tenantId, ...REG_CTX },
    );
    const xmin = await rowXmin('Deal', dealId);

    // 另起一个作用域取 txid —— 与上面那次写入必然不是同一个事务
    const otherTxid = await withTenant(tenantId, () => currentTxid());

    // 没有这一条，§1 的「相等」在「xmin 恒等于任意 txid」的坏测量下同样成立
    expect(
      xmin,
      'xmin 与 txid 恒相等 —— 这个判据分辨不出两种情况，§1 因此无鉴别力',
    ).not.toBe(otherTxid);
  });
});
