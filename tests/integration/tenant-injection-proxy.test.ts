// M5.1-TENANT-INJECTION F001（spec D-2 / D-4）— 三层 client 分工 + ALS 感知代理的**实库实测**。
//
// 【为什么必须打真库】本 feature 断言的是「代理解析到哪个真实 client / 哪个真实事务」——
// txid_current() 是否相同、未提交写入从事务外是否可见、current_user 是不是 kol_app，
// 全是只有真库才能给出的事实。mock 一个 tx client 只能证明「代码会调它」，证不了落在同一事务。
//
// 【失效模式与既有钉不重叠】rls-negative-suite §0 钉的是「开关关时单例=特权连接」（行为面），
// 本文件钉的是代理的三分支解析、两实例分工、raw 转发落事务（机制面）。
//
// 【变异锚（acceptance ⑤，实跑记录见 generator handoff）】
//   · 把分支③的抛错改成「回落运行时 client」→ ①(c) 两条用例必须红；
//   · 把代理对 $queryRawUnsafe / $executeRawUnsafe 的转发摘掉（raw 恒走运行时 client）
//     → ④ 的「事务外不可见 / 回滚零残留」必须红。
//
// 夹具纪律（沿用 F011 两层）：提交路径落库的 Tenant 行带独一前缀 + 收尾两层清理
//（按登记 id 精确删 + 不从登记表派生的全表前缀普查），跑完零残留。

import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  inspectConnectionRole,
  isPrivilegedConnection,
} from '../../src/lib/db/app-role';
import { prisma } from '../../src/lib/db/prisma';
import { privilegedDb } from '../../src/lib/db/privileged';
import { getRuntimeDb } from '../../src/lib/db/runtime';
import { MissingTenantScopeError, withTenant } from '../../src/lib/db/tenant-scope';

const privilegedUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_URL_APP;
if (!privilegedUrl) {
  throw new Error('[F001] 缺 DATABASE_URL（特权连接）——集成测试需要真库');
}
if (!appUrl) {
  throw new Error(
    '[F001] 缺 DATABASE_URL_APP（非特权 kol_app 连接）。③ 的「开关开时两连接角色不同」没有它就跑不出。' +
      '建角色：npm run db:app-role。刻意不 skip——静默跳过的隔离测试比没有测试更危险。',
  );
}

/** 开关是进程级事实；每个用例自己设、跑完复原（spec §5.1：绝不改 .env 默认值）。 */
const ORIGINAL_SWITCH = process.env.DB_APP_ROLE_RUNTIME;
afterEach(() => {
  if (ORIGINAL_SWITCH === undefined) delete process.env.DB_APP_ROLE_RUNTIME;
  else process.env.DB_APP_ROLE_RUNTIME = ORIGINAL_SWITCH;
});

const TAG = `f001proxy-${process.pid}`;
/** 提交路径落库、需要清理的 Tenant id 登记表。 */
const committedTenantIds: string[] = [];

async function countTenantById(client: typeof privilegedDb, id: string): Promise<number> {
  const rows = await client.$queryRawUnsafe<Array<{ c: number }>>(
    'SELECT count(*)::int AS c FROM "Tenant" WHERE id = $1',
    id,
  );
  return rows[0].c;
}

afterAll(async () => {
  // 第一层：按登记 id 精确删（提交路径的夹具）。
  for (const id of committedTenantIds.splice(0)) {
    try {
      await privilegedDb.tenant.delete({ where: { id } });
    } catch (err) {
      console.warn(`[F001] 清理登记夹具 ${id} 失败（不掩盖测试结果）：${(err as Error).message}`);
    }
  }
  // 第二层：不从登记表派生的全表前缀普查——变异实跑时 raw 转发被摘掉会把 INSERT 打到
  // 运行时连接上自动提交，那种残留只有普查兜得住。
  try {
    const strays = await privilegedDb.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM "Tenant" WHERE slug LIKE $1',
      `${TAG}-%`,
    );
    for (const row of strays) {
      try {
        await privilegedDb.tenant.delete({ where: { id: row.id } });
      } catch (err) {
        console.warn(`[F001] 普查清理 ${row.id} 失败（不掩盖测试结果）：${(err as Error).message}`);
      }
    }
    const left = await privilegedDb.$queryRawUnsafe<Array<{ c: number }>>(
      'SELECT count(*)::int AS c FROM "Tenant" WHERE slug LIKE $1',
      `${TAG}-%`,
    );
    if (left[0].c > 0) {
      console.warn(`[F001] ⚠️ 前缀普查后仍有 ${left[0].c} 行残留（${TAG}-*），请人工核`);
    }
  } catch (err) {
    console.warn(`[F001] 前缀普查清理失败（不掩盖测试结果）：${(err as Error).message}`);
  }
});

/* ================================================================== *
 * ① 双态语义三分支（spec D-4），各有正向用例
 * ================================================================== */

describe('①(a) ALS 有租户事务 → 代理解析为该事务的 tx client', () => {
  it('代理与 tx 的 txid_current() 相同 = 同一个事务（机械判据，不接受「看代码」）', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    await withTenant(`${TAG}-scope`, async (tx) => {
      const viaTx = await tx.$queryRawUnsafe<Array<{ tid: string }>>(
        'SELECT txid_current()::text AS tid',
      );
      const viaProxy = await prisma.$queryRawUnsafe<Array<{ tid: string }>>(
        'SELECT txid_current()::text AS tid',
      );
      expect(viaProxy[0].tid).toBe(viaTx[0].tid);
    });
  });

  it('typed 模型调用也落在同一事务：代理写入 tx 内可见、事务外（运行时连接）不可见', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const id = `${TAG}-typed`;
    const marker = new Error('rollback-marker');
    await expect(
      withTenant(`${TAG}-scope`, async (tx) => {
        await prisma.tenant.create({ data: { id, slug: id, name: id } });
        // 同一 tx client 直查：看得见（同事务）
        expect(await tx.tenant.findUnique({ where: { id } })).not.toBeNull();
        // 运行时连接直查：看不见（未提交 = 另一个事务外）
        expect(await getRuntimeDb().tenant.findUnique({ where: { id } })).toBeNull();
        throw marker; // 主动回滚，零残留
      }),
    ).rejects.toBe(marker);
    expect(await countTenantById(privilegedDb, id)).toBe(0);
  });

  it('开关开（DB_APP_ROLE_RUNTIME=1）时 ALS 作用域内照常解析到 tx，不抛', async () => {
    process.env.DB_APP_ROLE_RUNTIME = '1';
    await withTenant(`${TAG}-scope`, async (tx) => {
      const viaTx = await tx.$queryRawUnsafe<Array<{ tid: string }>>(
        'SELECT txid_current()::text AS tid',
      );
      const viaProxy = await prisma.$queryRawUnsafe<Array<{ tid: string }>>(
        'SELECT txid_current()::text AS tid',
      );
      expect(viaProxy[0].tid).toBe(viaTx[0].tid);
    });
  });
});

describe('①(b) 无 ALS + 开关未设 → 运行时 client（= 特权，与今日逐位一致，D-8）', () => {
  it('代理背后是特权连接（与 rls-negative-suite §0 同口径），普通查询照常', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const info = await inspectConnectionRole(prisma);
    expect(isPrivilegedConnection(info)).toBe(true);
    await expect(prisma.tenant.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});

describe('①(c) 无 ALS + DB_APP_ROLE_RUNTIME=1 → 抛 MissingTenantScopeError（fail-closed）', () => {
  it('模型 delegate 访问即抛，断言**类型**而非字符串', () => {
    process.env.DB_APP_ROLE_RUNTIME = '1';
    expect(() => prisma.tenant).toThrow(MissingTenantScopeError);
    let caught: unknown;
    try {
      void prisma.tenant;
    } catch (err) {
      caught = err;
    }
    // 「抛了别的错」这种退化也不放过：必须是这个独立错误类
    expect(caught).toBeInstanceOf(MissingTenantScopeError);
    expect(caught).toBeInstanceOf(Error);
  });

  it('raw 方法访问同样抛（$queryRawUnsafe 不是旁路）', () => {
    process.env.DB_APP_ROLE_RUNTIME = '1';
    expect(() => prisma.$queryRawUnsafe).toThrow(MissingTenantScopeError);
  });

  it('开关拨回未设即恢复（解析看当下 env，不是模块加载快照）', async () => {
    process.env.DB_APP_ROLE_RUNTIME = '1';
    expect(() => prisma.tenant).toThrow(MissingTenantScopeError);
    delete process.env.DB_APP_ROLE_RUNTIME;
    await expect(prisma.tenant.count()).resolves.toBeGreaterThanOrEqual(0);
  });
});

/* ================================================================== *
 * ③ privilegedDb 与运行时 client：两个实例、两种连接串来源
 * ================================================================== */

describe('③ 三层 client 的实例分工', () => {
  it('开关关：privilegedDb 与运行时 client 可指向同一串，但必须是两个实例', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const runtime = getRuntimeDb();
    expect(runtime).not.toBe(privilegedDb);
    // 同一串 → 同为特权角色（行为与今日一致）；实例不同 → 互不持有对方连接池
    const [rInfo, pInfo] = await Promise.all([
      inspectConnectionRole(runtime),
      inspectConnectionRole(privilegedDb),
    ]);
    expect(isPrivilegedConnection(rInfo)).toBe(true);
    expect(isPrivilegedConnection(pInfo)).toBe(true);
    expect(rInfo.role).toBe(pInfo.role);
  });

  it('开关开：运行时 client 切 kol_app，实测 current_user 与 privilegedDb 不同', async () => {
    process.env.DB_APP_ROLE_RUNTIME = '1';
    const runtime = getRuntimeDb();
    expect(runtime).not.toBe(privilegedDb);
    const [rInfo, pInfo] = await Promise.all([
      inspectConnectionRole(runtime),
      inspectConnectionRole(privilegedDb),
    ]);
    expect(rInfo.role).not.toBe(pInfo.role);
    expect(isPrivilegedConnection(rInfo)).toBe(false); // kol_app：RLS 对它真实生效
    expect(isPrivilegedConnection(pInfo)).toBe(true); // privilegedDb 恒特权
  });
});

/* ================================================================== *
 * ④ raw 转发落在 ALS 事务上（B1-2「raw SQL 不在覆盖面」的根治点）
 * ================================================================== */

describe('④ $queryRawUnsafe / $executeRawUnsafe 经代理落在同一事务', () => {
  it('回滚路径：事务内 raw 写 → 同事务 raw 读可见；事务外不可见；回滚零残留', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const id = `${TAG}-raw-rb`;
    const marker = new Error('rollback-marker');
    await expect(
      withTenant(`${TAG}-scope`, async () => {
        // 经代理的 $executeRawUnsafe 写入（不是 tx. 直调——测的就是代理转发）
        await prisma.$executeRawUnsafe(
          'INSERT INTO "Tenant" (id, "publicId", slug, name) VALUES ($1, $2, $3, $4)',
          id,
          `${id}-pub`,
          id,
          id,
        );
        // 经代理的 $queryRawUnsafe 读：同事务 → 看得见
        expect(await countTenantById(prisma, id)).toBe(1);
        // 运行时连接（另一个事务外视角）：未提交 → 看不见
        expect(await countTenantById(getRuntimeDb(), id)).toBe(0);
        throw marker;
      }),
    ).rejects.toBe(marker);
    // 回滚后零残留（B1-4 的反面；正式的 B1-4 回归在 F002）
    expect(await countTenantById(privilegedDb, id)).toBe(0);
  });

  it('提交路径：fn 正常返回 → 写入真实落库（事务外可见），随后清掉', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const id = `${TAG}-raw-cm`;
    committedTenantIds.push(id);
    await withTenant(`${TAG}-scope`, async () => {
      await prisma.$executeRawUnsafe(
        'INSERT INTO "Tenant" (id, "publicId", slug, name) VALUES ($1, $2, $3, $4)',
        id,
        `${id}-pub`,
        id,
        id,
      );
    });
    expect(await countTenantById(privilegedDb, id)).toBe(1);
  });
});
