// M5-AUTH-RLS F008（spec D-6）— RLS 落库后的**行为级**证明，不是"迁移文件里写了 policy"的自我确认。
//
// 三条真断言，全部在真库上、用两条真连接跑：
//   ① 覆盖面：库里开了 RLS 的表集合 == prisma/schema.prisma 里带 tenantId 的表 + Tenant
//      （**从 schema 实物解析**，不是抄一份表名清单——抄的清单在下次加表时不会红，那就是漏表的来源）
//   ② default deny：kol_app 连接**不设** app.tenant_id → 每张表零行（不是报错，是看不见）
//   ③ 租户可见性 + 写侧 WITH CHECK：设了 A 只见 A；往 B 名下写会被拒
//   ④ 特权连接（迁移/既有测试那条）完全不受影响 —— D-8 的前提，本身也要有证据
//
// 夹具纪律（M4.7/M4.8 两层）：本文件建的租户带 pid 前缀；收尾 ① 按登记 id 精确删
// ② **不从登记表派生**的普查：按前缀在全表扫一遍，写到未登记租户上的残留照样露头。

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const privilegedUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_URL_APP;
if (!privilegedUrl) throw new Error('[F008] 缺 DATABASE_URL（特权连接）');
if (!appUrl) {
  throw new Error(
    '[F008] 缺 DATABASE_URL_APP（非特权 kol_app 连接）。没有它就只能在特权连接上跑，' +
      '而特权连接绕过全部 RLS —— 那种"测试"必然全绿且毫无意义。建角色：npm run db:app-role',
  );
}

/** 迁移 / seed / 既有测试用的特权连接（RLS 对它不生效，这正是要被证明的事）。 */
const privileged = new PrismaClient({ datasourceUrl: privilegedUrl });
/** 应用运行时目标角色 kol_app（NOSUPERUSER NOBYPASSRLS），RLS 对它真实生效。 */
const app = new PrismaClient({ datasourceUrl: appUrl });

const TAG = `f008rls-${process.pid}`;
const tenantIds: { a: string; b: string } = { a: '', b: '' };

/** 在 kol_app 连接上开一个事务，先注入租户变量（SET LOCAL 语义：只活在本事务内）。 */
async function asTenant<T>(
  tenantId: string | null,
  fn: (tx: Omit<PrismaClient, '$transaction' | '$connect' | '$disconnect' | '$on' | '$use' | '$extends'>) => Promise<T>,
): Promise<T> {
  return app.$transaction(async (tx) => {
    if (tenantId !== null) {
      await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
    }
    return fn(tx);
  });
}

/** schema.prisma 实物 → 应当受 RLS 约束的表名集合（带 tenantId 的 model + Tenant）。 */
function expectedRlsTablesFromSchema(): string[] {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
  const withTenant = models
    .filter(([, , body]) => /^\s*tenantId\s/m.test(body))
    .map(([, name]) => name);
  return [...withTenant, 'Tenant'].sort();
}

beforeAll(async () => {
  // 夹具用**特权连接**建（此刻还没有租户上下文可用；这也正是 F009 报告里点名的先有鸡先有蛋问题）。
  for (const key of ['a', 'b'] as const) {
    const tenant = await privileged.tenant.create({
      data: { slug: `${TAG}-${key}`, name: `${TAG}-${key}` },
    });
    tenantIds[key] = tenant.id;
    await privileged.project.create({
      data: { tenantId: tenant.id, name: `${TAG}-${key}-project`, slug: `${TAG}-${key}-project` },
    });
    await privileged.kol.create({
      data: { tenantId: tenant.id, canonicalHandle: `${TAG}-${key}-kol`, displayName: `${TAG}-${key}` },
    });
    await privileged.operationLog.create({
      data: { tenantId: tenant.id, kind: 'auto', summary: `${TAG}-${key}-log` },
    });
  }
});

afterAll(async () => {
  // ① 按登记 id 精确删
  for (const id of [tenantIds.a, tenantIds.b].filter(Boolean)) {
    await privileged.operationLog.deleteMany({ where: { tenantId: id } });
    await privileged.project.deleteMany({ where: { tenantId: id } });
    await privileged.kol.deleteMany({ where: { tenantId: id } });
    await privileged.tenant.deleteMany({ where: { id } });
  }
  // ② 不从登记表派生的普查：按前缀全表搜，写到未登记租户上的行照样露头
  const [tenants, projects, kols, logs] = await Promise.all([
    privileged.tenant.count({ where: { name: { startsWith: TAG } } }),
    privileged.project.count({ where: { name: { startsWith: TAG } } }),
    privileged.kol.count({ where: { canonicalHandle: { startsWith: TAG } } }),
    privileged.operationLog.count({ where: { summary: { startsWith: TAG } } }),
  ]);
  await Promise.all([privileged.$disconnect(), app.$disconnect()]);
  if (tenants + projects + kols + logs !== 0) {
    throw new Error(
      `[F008] 夹具残留：tenants=${tenants} projects=${projects} kols=${kols} logs=${logs}`,
    );
  }
});

describe('F008 ① 覆盖面：RLS 表集合 == schema 实物（防漏表）', () => {
  it('每张带 tenantId 的表 + Tenant 都 ENABLE 了 RLS，且集合完全相等', async () => {
    const expected = expectedRlsTablesFromSchema();
    expect(expected).toHaveLength(24); // 23 张带 tenantId + Tenant（侦察实测口径）

    const rows = await privileged.$queryRawUnsafe<
      Array<{ relname: string; relrowsecurity: boolean }>
    >(
      `SELECT c.relname, c.relrowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`,
    );
    const enabled = rows.filter((r) => r.relrowsecurity).map((r) => r.relname).sort();
    // 双向相等：少一张 = 漏表；多一张 = 库里有 schema 之外的表在裸奔（也要暴露）
    expect(enabled).toEqual(expected);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it('每张表的 policy 都是 USING + WITH CHECK 双侧，且认的是 app.tenant_id', async () => {
    const expected = expectedRlsTablesFromSchema();
    const rows = await privileged.$queryRawUnsafe<
      Array<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>
    >(
      `SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public'`,
    );
    expect(rows.map((r) => r.tablename).sort()).toEqual(expected);
    for (const row of rows) {
      expect(row.policyname).toBe('tenant_isolation');
      const column = row.tablename === 'Tenant' ? 'id' : 'tenantId';
      // pg 回显时只给需要的标识符加引号（id 裸奔、"tenantId" 带引号），故两种都认
      const columnPattern = new RegExp(`(^|[^\\w"])"?${column}"?\\s*=`);
      for (const clause of [row.qual, row.with_check]) {
        expect(clause, `${row.tablename} 缺一侧 policy 表达式`).toBeTruthy();
        expect(clause).toContain(`current_setting('app.tenant_id'::text, true)`);
        expect(clause, `${row.tablename} policy 认错了列`).toMatch(columnPattern);
      }
    }
  });
});

describe('F008 ② default deny：kol_app 不设租户变量 → 零行（不是报错）', () => {
  it('逐表普查：24 张表在 kol_app 无变量下全部零行，且其中 ≥5 张在特权连接下确有数据', async () => {
    const tables = expectedRlsTablesFromSchema();
    const appCounts: Record<string, number> = {};
    const privilegedCounts: Record<string, number> = {};
    for (const table of tables) {
      const [appRows, privRows] = await Promise.all([
        app.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM "${table}"`),
        privileged.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM "${table}"`),
      ]);
      appCounts[table] = Number(appRows[0]!.n);
      privilegedCounts[table] = Number(privRows[0]!.n);
    }
    const leaking = Object.entries(appCounts).filter(([, n]) => n !== 0);
    expect(leaking).toEqual([]);
    // 非空洞证明：若全库恰好都空，上面那条断言毫无意义
    const nonEmpty = Object.entries(privilegedCounts).filter(([, n]) => n > 0);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(5);
  });

  it('无变量的 SELECT 不抛错，只是看不见（default deny 的语义是零行而非 42501）', async () => {
    await expect(app.project.findMany({ take: 5 })).resolves.toEqual([]);
    await expect(app.tenant.count()).resolves.toBe(0);
  });

  it('raw SQL 走同一条路（DB 侧 RLS，不依赖 Prisma 类型层）', async () => {
    const rows = await app.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM "Kol" WHERE embedding IS NOT NULL`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });
});

describe('F008 ③ 设了变量：只见本租户，且写不进别人名下', () => {
  it('A 只见 A 的项目 / KOL / 留痕，B 的一条都不出现', async () => {
    const seen = await asTenant(tenantIds.a, async (tx) => ({
      projects: await tx.project.findMany({ where: { name: { startsWith: TAG } } }),
      kols: await tx.kol.findMany({ where: { canonicalHandle: { startsWith: TAG } } }),
      logs: await tx.operationLog.findMany({ where: { summary: { startsWith: TAG } } }),
      tenants: await tx.tenant.findMany({ where: { name: { startsWith: TAG } } }),
    }));
    expect(seen.projects.map((p) => p.name)).toEqual([`${TAG}-a-project`]);
    expect(seen.kols.map((k) => k.canonicalHandle)).toEqual([`${TAG}-a-kol`]);
    expect(seen.logs.map((l) => l.summary)).toEqual([`${TAG}-a-log`]);
    expect(seen.tenants.map((t) => t.id)).toEqual([tenantIds.a]);
    // 正向精确：B 的任何标识都不该出现在返回字节里
    expect(JSON.stringify(seen)).not.toContain(tenantIds.b);
    expect(JSON.stringify(seen)).not.toContain(`${TAG}-b`);
  });

  it('切到 B 同理（说明看到的是变量决定的，不是"恰好只有一条"）', async () => {
    const projects = await asTenant(tenantIds.b, (tx) =>
      tx.project.findMany({ where: { name: { startsWith: TAG } } }),
    );
    expect(projects.map((p) => p.name)).toEqual([`${TAG}-b-project`]);
  });

  it('按 id 直查别人的行也是零行（不是 403，是根本看不见）', async () => {
    const found = await asTenant(tenantIds.a, (tx) =>
      tx.project.findMany({ where: { tenantId: tenantIds.b } }),
    );
    expect(found).toEqual([]);
  });

  it('WITH CHECK 写侧：A 的上下文往 B 名下 INSERT 被拒', async () => {
    await expect(
      asTenant(tenantIds.a, (tx) =>
        tx.project.create({
          data: { tenantId: tenantIds.b, name: `${TAG}-a-forged`, slug: `${TAG}-a-forged` },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
    // 真的没写进去（用特权连接看全局，绕过 RLS 才是可信的核查视角）
    await expect(
      privileged.project.count({ where: { name: `${TAG}-a-forged` } }),
    ).resolves.toBe(0);
  });

  it('WITH CHECK 写侧：写自己名下正常放行（隔离不是"全都写不了"）', async () => {
    const created = await asTenant(tenantIds.a, (tx) =>
      tx.project.create({
        data: { tenantId: tenantIds.a, name: `${TAG}-a-own`, slug: `${TAG}-a-own` },
      }),
    );
    expect(created.tenantId).toBe(tenantIds.a);
    await privileged.project.deleteMany({ where: { name: `${TAG}-a-own` } });
  });

  it('UPDATE 把自己的行搬去 B 名下同样被 WITH CHECK 拒', async () => {
    await expect(
      asTenant(tenantIds.a, (tx) =>
        tx.project.updateMany({
          where: { name: `${TAG}-a-project` },
          data: { tenantId: tenantIds.b },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
    const still = await privileged.project.findFirst({ where: { name: `${TAG}-a-project` } });
    expect(still?.tenantId).toBe(tenantIds.a);
  });

  it('SET LOCAL 语义：变量只活在事务内，事务结束后不残留（下一条查询回到零行）', async () => {
    const inside = await asTenant(tenantIds.a, (tx) =>
      tx.project.count({ where: { name: { startsWith: TAG } } }),
    );
    expect(inside).toBe(1);
    // 同一个 client、同一个连接池，事务外再查 —— 必须回到 default deny
    const outside = await app.project.count({ where: { name: { startsWith: TAG } } });
    expect(outside).toBe(0);
  });
});

describe('F008 ④ 特权连接不受影响（D-8 的前提本身要有证据）', () => {
  it('迁移/既有测试那条连接看得见两个租户的全部夹具行', async () => {
    const [projects, tenants] = await Promise.all([
      privileged.project.findMany({ where: { name: { startsWith: TAG } } }),
      privileged.tenant.findMany({ where: { name: { startsWith: TAG } } }),
    ]);
    expect(projects.map((p) => p.name).sort()).toEqual([`${TAG}-a-project`, `${TAG}-b-project`]);
    expect(tenants).toHaveLength(2);
  });

  it('特权连接也不需要设 app.tenant_id（它是绕过 RLS，不是"恰好设过"）', async () => {
    const rows = await privileged.$queryRawUnsafe<Array<{ v: string | null }>>(
      `SELECT current_setting('app.tenant_id', true) AS v`,
    );
    expect(rows[0]!.v).toBeNull();
    await expect(privileged.kol.count()).resolves.toBeGreaterThan(0);
  });
});
