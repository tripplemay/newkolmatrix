// M5.1b-TENANT-INJECTION F002 — withTenant 三条硬语义 + B1-4 原子性回归 + B3 残留回归。
//
// 【为什么必须打真库】本文件断言的全是只有真事务才能给出的事实：内外层是不是**同一个事务**
//（txid_current 相同）、回滚后库里**还剩几行**、SET LOCAL 的变量在事务结束后**是否还粘在
// 连接上**。mock 一个 tx 只能证明「代码调了它」，证不了这三件事——而审计 B1-4 / B3 实测到的
// 缺陷恰恰全在这三件事上（官方范例式 $extends 回滚后行仍在、set_config(local=false) 粘连接池）。
//
// 【与 F001 那份测试不重叠】F001 的 tenant-injection-proxy 钉的是**代理解析到谁**（三分支、
// 两实例、raw 转发）；本文件钉的是 **withTenant 自身的事务语义**（嵌套、原子性、变量生命周期）。
// 两者失效模式不同：代理解析对了但嵌套开了第二事务，F001 全绿而本文件必红。
//
// 【承接的硬约束（M5.1 spec-lock 稽核 → M5.1b spec §4.1）】
// F001 已在 tenant-scope.ts 写下 set_config 那一行，但**不得以此抵扣本 feature 的 ①(a)**：
// 本文件必须自带 set_config 断言，并实跑「第三参 true → false」的变异证明 ③ 会红。
//
// 【变异锚（acceptance ④，四条，实跑记录见 commit 正文）】
//   1. set_config 第三参 true → false            → ③ 必须红
//   2. 同租户嵌套改成再开一个事务                 → ②(ii) 必须红
//   3. 跨租户嵌套的抛错摘掉                       → ①(c) 必须红
//   4. withTenant 的错误传播吞掉（catch 后 return）→ ② 必须红
//
// 【夹具纪律】沿用 F011/F001 两层：独一前缀 + 收尾（按登记 id 精确删 + **不从登记表派生**的
// 全表前缀普查）。清理段每步独立 try/catch 只告警——清理段自己一抛，就同时干掉「首因可见」
// 与「环境干净」两件事，而 e2e 失败正是清理最该生效的时刻（testing-env-patterns.md §9.1）。

import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { privilegedDb } from '../../src/lib/db/privileged';
import { getRuntimeDb } from '../../src/lib/db/runtime';
import {
  CrossTenantNestingError,
  getTenantTxScope,
  withTenant,
} from '../../src/lib/db/tenant-scope';

if (!process.env.DATABASE_URL) {
  // 刻意不 skip：静默跳过的隔离测试比没有测试更危险（沿用 F001 的口径）。
  throw new Error('[F002] 缺 DATABASE_URL —— 本文件断言真事务行为，必须有真库');
}

/** 开关是进程级事实；本文件全程在「开关关」下跑（写不受 RLS 阻挡），跑完复原。 */
const ORIGINAL_SWITCH = process.env.DB_APP_ROLE_RUNTIME;
afterEach(() => {
  if (ORIGINAL_SWITCH === undefined) delete process.env.DB_APP_ROLE_RUNTIME;
  else process.env.DB_APP_ROLE_RUNTIME = ORIGINAL_SWITCH;
});

const TAG = `f002scope-${process.pid}`;
/** 提交路径落库、需要精确清理的 Tenant id 登记表。 */
const committedTenantIds: string[] = [];

function slugFor(name: string): string {
  return `${TAG}-${name}`;
}

/** 从**特权连接**查，绕开一切事务与作用域——「库里到底还剩几行」只能这样问。 */
async function countTenantBySlug(slug: string): Promise<number> {
  const rows = await privilegedDb.$queryRawUnsafe<Array<{ c: number }>>(
    'SELECT count(*)::int AS c FROM "Tenant" WHERE slug = $1',
    slug,
  );
  return rows[0].c;
}

/** 当前连接上的 app.tenant_id（未设 → null）。 */
async function readTenantVar(
  client: { $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T> },
): Promise<string | null> {
  const rows = await client.$queryRawUnsafe<Array<{ v: string | null }>>(
    `SELECT current_setting('app.tenant_id', true) AS v`,
  );
  const v = rows[0]?.v;
  return v === undefined || v === '' ? null : v;
}

async function txid(
  client: { $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T> },
): Promise<string> {
  const rows = await client.$queryRawUnsafe<Array<{ x: string }>>(
    'SELECT txid_current()::text AS x',
  );
  return rows[0].x;
}

afterAll(async () => {
  // 第一层：按登记 id 精确删。每步独立 try/catch——清理段绝不可再抛。
  for (const id of committedTenantIds.splice(0)) {
    try {
      await privilegedDb.tenant.delete({ where: { id } });
    } catch (err) {
      console.warn(`[F002] 清理登记夹具 ${id} 失败（不掩盖测试结果）：${(err as Error).message}`);
    }
  }
  // 第二层：**不从登记表派生**的全表前缀普查。变异实跑时「嵌套另起事务」会让内层写独立提交，
  // 那种残留没有进过登记表，只有普查兜得住——这正是两层不重叠的意义。
  try {
    const strays = await privilegedDb.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT id FROM "Tenant" WHERE slug LIKE $1',
      `${TAG}-%`,
    );
    for (const row of strays) {
      try {
        await privilegedDb.tenant.delete({ where: { id: row.id } });
      } catch (err) {
        console.warn(`[F002] 普查清理 ${row.id} 失败：${(err as Error).message}`);
      }
    }
    const left = await privilegedDb.$queryRawUnsafe<Array<{ c: number }>>(
      'SELECT count(*)::int AS c FROM "Tenant" WHERE slug LIKE $1',
      `${TAG}-%`,
    );
    if (left[0].c > 0) {
      console.warn(`[F002] ⚠️ 前缀普查后仍有 ${left[0].c} 行残留（${TAG}-*），请人工核`);
    }
  } catch (err) {
    console.warn(`[F002] 前缀普查清理失败（不掩盖测试结果）：${(err as Error).message}`);
  }
});

/* ================================================================== *
 * ①(a) 事务内 SET LOCAL —— 且先于回调执行
 * ================================================================== */

describe('①(a) withTenant 在事务内 SET LOCAL app.tenant_id', () => {
  it('回调拿到控制权时变量**已经**设好（证明 set_config 先于 fn，不是事后补的）', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const tenantId = `${TAG}-a1`;
    const seen = await withTenant(tenantId, async (tx) => readTenantVar(tx));
    expect(seen).toBe(tenantId);
  });

  it('变量确实设在**这个事务**里：同事务读得到，且事务号与回调一致', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const tenantId = `${TAG}-a2`;
    const { inTxVar, inTxId } = await withTenant(tenantId, async (tx) => ({
      inTxVar: await readTenantVar(tx),
      inTxId: await txid(tx),
    }));
    expect(inTxVar).toBe(tenantId);
    // 事务外（新事务）读不到同一个事务号 —— 证明上面那个确实是一次独立事务
    const outsideId = await txid(getRuntimeDb());
    expect(outsideId).not.toBe(inTxId);
  });
});

/* ================================================================== *
 * ①(b) 同租户嵌套复用既有 tx，不开第二事务
 * ================================================================== */

describe('①(b) 同租户嵌套 withTenant 复用既有事务', () => {
  it('内外层 txid_current() 相同 = 同一个事务（机械判据，不接受「看代码没开」）', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const tenantId = `${TAG}-b1`;
    const { outerId, innerId } = await withTenant(tenantId, async (outerTx) => {
      const outerId = await txid(outerTx);
      const innerId = await withTenant(tenantId, async (innerTx) => txid(innerTx));
      return { outerId, innerId };
    });
    expect(innerId).toBe(outerId);
  });

  it('嵌套不重设变量：内层看到的仍是外层设的那个租户', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const tenantId = `${TAG}-b2`;
    const innerVar = await withTenant(tenantId, async () =>
      withTenant(tenantId, async (innerTx) => readTenantVar(innerTx)),
    );
    expect(innerVar).toBe(tenantId);
  });

  it('ALS 作用域在嵌套内外是同一份（tx 引用相同）', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const tenantId = `${TAG}-b3`;
    const same = await withTenant(tenantId, async () => {
      const outerScope = getTenantTxScope();
      return withTenant(tenantId, async () => getTenantTxScope()?.tx === outerScope?.tx);
    });
    expect(same).toBe(true);
  });
});

/* ================================================================== *
 * ①(c) 跨租户嵌套 → 抛
 * ================================================================== */

describe('①(c) 跨租户嵌套 withTenant 抛 CrossTenantNestingError', () => {
  it('断言错误**类型**而非字符串：改成静默切换或静默沿用都逃不过', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    await expect(
      withTenant(`${TAG}-c-outer`, async () => {
        return withTenant(`${TAG}-c-inner`, async () => 'should-not-reach');
      }),
    ).rejects.toBeInstanceOf(CrossTenantNestingError);
  });

  it('错误带上内外层租户 id，便于定位（不是一句笼统报错）', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    // 显式标注泛型与回调返回类型：内层 withTenant 作为外层回调的返回值时，T 的推断会互相
    // 引用，tsc 判 TS7011（隐式 any 返回）。这里把两层的 T 都钉成 null。
    const attempt = withTenant<null>(
      `${TAG}-c2-outer`,
      async (): Promise<null> => withTenant<null>(`${TAG}-c2-inner`, async () => null),
    );
    const err = await attempt.catch((e: unknown) => e as CrossTenantNestingError);
    expect(err).toBeInstanceOf(CrossTenantNestingError);
    expect(err.outerTenantId).toBe(`${TAG}-c2-outer`);
    expect(err.innerTenantId).toBe(`${TAG}-c2-inner`);
  });
});

/* ================================================================== *
 * ② B1-4 原子性回归（预写死判据，不可降级）
 *    审计探针实测：官方范例式注入下「回滚后那一行仍存在 = 1」。本节要的是它的反面。
 * ================================================================== */

describe('② B1-4 原子性回归：回滚后库里零残留', () => {
  it('(i) 单层：事务内写一行后抛错 → 真查库计数为 0', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const slug = slugFor('atomic-single');
    const boom = new Error('[F002] 故意抛错以触发回滚');
    await expect(
      withTenant(`${TAG}-atomic1`, async (tx) => {
        await tx.tenant.create({ data: { name: 'F002 atomic single', slug } });
        // 写完立刻在同事务内确认「确实写进去了」——否则计数为 0 可能只是因为压根没写
        expect(await countTenantInTx(tx, slug)).toBe(1);
        throw boom;
      }),
    ).rejects.toBe(boom);
    // 从特权连接查真实落库情况（不受任何事务/作用域影响）
    expect(await countTenantBySlug(slug)).toBe(0);
  });

  it('(ii) 嵌套：外层与内层各写一行，外层抛错 → **两行都不许剩**', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const outerSlug = slugFor('atomic-nested-outer');
    const innerSlug = slugFor('atomic-nested-inner');
    const boom = new Error('[F002] 嵌套场景故意抛错');
    const tenantId = `${TAG}-atomic2`;
    await expect(
      withTenant(tenantId, async (outerTx) => {
        await outerTx.tenant.create({ data: { name: 'F002 nested outer', slug: outerSlug } });
        await withTenant(tenantId, async (innerTx) => {
          await innerTx.tenant.create({ data: { name: 'F002 nested inner', slug: innerSlug } });
        });
        throw boom;
      }),
    ).rejects.toBe(boom);
    // 这一条正是变异 2（嵌套另起事务）的杀手：内层若独立提交，回滚带不走它。
    expect(await countTenantBySlug(outerSlug)).toBe(0);
    expect(await countTenantBySlug(innerSlug)).toBe(0);
  });

  it('(iii) 错误必须原样上抛 —— 吞掉错误 = 调用方以为成功了', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const sentinel = new Error('[F002] 这个错误对象必须原样到达调用方');
    await expect(
      withTenant(`${TAG}-atomic3`, async () => {
        throw sentinel;
      }),
    ).rejects.toBe(sentinel); // toBe：同一个对象，不是「某个错误」
  });

  it('(iv) 提交路径确实能落库 —— 防止上面三条因「压根没写成」而空绿', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const slug = slugFor('atomic-commit');
    const created = await withTenant(`${TAG}-atomic4`, async (tx) =>
      tx.tenant.create({ data: { name: 'F002 commit path', slug }, select: { id: true } }),
    );
    committedTenantIds.push(created.id);
    expect(await countTenantBySlug(slug)).toBe(1);
  });
});

/** 在给定事务客户端里数 —— 用于「写进去了吗」的同事务自证。 */
async function countTenantInTx(
  tx: { $queryRawUnsafe: <T>(q: string, ...v: unknown[]) => Promise<T> },
  slug: string,
): Promise<number> {
  const rows = await tx.$queryRawUnsafe<Array<{ c: number }>>(
    'SELECT count(*)::int AS c FROM "Tenant" WHERE slug = $1',
    slug,
  );
  return rows[0].c;
}

/* ================================================================== *
 * ③ B3 残留回归（预写死判据，不可降级）
 *    审计实测：set_config(local=false) 后 12 次并发里有 1 次看得见别人的数据。
 * ================================================================== */

describe('③ B3 残留回归：变量不粘连接池', () => {
  it('withTenant 结束后，连续 12 次无关查询都读不到 app.tenant_id', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const tenantId = `${TAG}-b3leak`;
    await withTenant(tenantId, async (tx) => {
      expect(await readTenantVar(tx)).toBe(tenantId); // 事务内确实设了
    });
    // 事务外连查 12 次（对齐审计 B3 的并发口径）——is_local=true 时每次都应为 null。
    // 第三参改成 false 时，变量会粘在归还给连接池的那条连接上，这里必现原值。
    const after: Array<string | null> = [];
    for (let i = 0; i < 12; i += 1) {
      after.push(await readTenantVar(getRuntimeDb()));
    }
    expect(after.filter((v) => v !== null)).toEqual([]);
  });

  it('12 路并发 withTenant 互不串租户：每路只看得见自己的 id', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const ids = Array.from({ length: 12 }, (_, i) => `${TAG}-conc-${i}`);
    const seen = await Promise.all(
      ids.map((id) => withTenant(id, async (tx) => readTenantVar(tx))),
    );
    expect(seen).toEqual(ids);
  });

  it('并发结束后连接池上同样不留残留', async () => {
    delete process.env.DB_APP_ROLE_RUNTIME;
    const after: Array<string | null> = [];
    for (let i = 0; i < 12; i += 1) {
      after.push(await readTenantVar(getRuntimeDb()));
    }
    expect(after.filter((v) => v !== null)).toEqual([]);
  });
});
