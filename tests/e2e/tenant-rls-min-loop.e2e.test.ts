// M5.1b-TENANT-INJECTION F006 — `DB_APP_ROLE_RUNTIME=1` 下的**最小闭环 e2e** + 跨租户零行。
//
// 这是本批「机制成立」的定论所在：开关真开着、运行时真连 kol_app（NOSUPERUSER NOBYPASSRLS）、
// RLS policy 真生效的条件下，走通 spec D-6 定死的六段。审计 B2-1/2/3 实测过「切过去就没人能
// 登录」——本文件就是「引导白名单（F003）确实解开了那把锁、ALS 注入（F001/F002/F005）确实
// 把租户送到了 policy 认的那个会话变量里」的证明。
//
// 【运行方式：`npm run rls:e2e`（唯一入口）】
//   开关由那条 script 以**进程级 env 前缀**给出（`DB_APP_ROLE_RUNTIME=1`），
//   **不改 .env 默认值** —— 改了会污染其余 148 个测试文件的运行前提（spec §5.1）。
//   收集范围由 vitest.e2e.config.ts 单独定义，**不进** `npm run test:unit`（见该文件头注：
//   为什么是「另开 config」而不是「加 skip 分支」）。
//   前提不齐（开关没开 / 没配 DATABASE_URL_APP / 运行时没解析到 kol_app）→ **抛错**，
//   不 skip：静默跳过的隔离测试比没有测试更危险（沿用 F001/F002/F005 口径）。
//
// 【三条 client 各司其职，别混】
//   · `prisma`（产品代理）  → 经 ALS 落到 withTenant 的事务上，**RLS 对它生效**。被测对象。
//   · `getRuntimeDb()`      → 运行时 client 本体（此刻 = kol_app）。哨兵与「连的是谁」的证据。
//   · `privilegedDb`        → 恒 DATABASE_URL（owner），**绕过 RLS**。只用于建/删夹具与
//                             「库里到底有没有这一行」的对照——它是脚手架，不是被测对象。
//   跨租户零行那一段的说服力全靠这个分工：同一行，privilegedDb 看得见、kol_app 看不见。
//
// 【变异证活（acceptance ④）—— 两条实跑记录见 commit 正文】
//   1. 把 F003 白名单里的登录查询改回租户路径（privilegedDb → prisma 代理）→ §2(a) 必须红
//      （复现审计 B2-1「没人能登录」）
//   2. 摘掉某个入口的 ALS 作用域 → 对应段必须红成 MissingTenantScopeError
//
// 【夹具纪律（acceptance ⑤）】A/B 两租户带独一前缀；收尾两层——① 按登记 id 精确删
// ② **不从登记表派生**的全表前缀普查，且清单覆盖**软引用表**（OperationLog / PendingAction
// 无 FK、不随 Tenant 级联）。清理段每步独立 try/catch 只告警（testing-env-patterns.md §9.1）。

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** 会话注入缝：直调 route/RSC 时没有 Next 请求作用域，租户身份从这里给（tests/support/session-mock）。 */
const sessionSeam = vi.hoisted(() => ({ tenantId: '', actor: 'f006@test.local' }));
vi.mock('../../src/lib/auth/session-tenant', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/auth/session-tenant')>();
  const { makeSessionTenantMock } = await import('../support/session-mock');
  return makeSessionTenantMock(actual, sessionSeam);
});

import KnowledgePage from '../../src/app/admin/knowledge/page';
import { GET as navBadgesGet } from '../../src/app/api/nav-badges/route';
import { prismaAuthorizeDeps } from '../../src/lib/auth/index';
import { authorizeCredentials } from '../../src/lib/auth/credentials';
import { hashPassword } from '../../src/lib/auth/password';
import { registerAccount } from '../../src/lib/auth/register';
import {
  PrivilegedConnectionError,
  inspectConnectionRole,
  isAppRoleRuntimeEnabled,
  resolveAppDatabaseUrl,
  resolveRuntimeDatabaseUrl,
  runConnectionRoleSentinel,
} from '../../src/lib/db/app-role';
import { privilegedDb } from '../../src/lib/db/privileged';
import { prisma } from '../../src/lib/db/prisma';
import { getRuntimeDb } from '../../src/lib/db/runtime';
import { withTenant } from '../../src/lib/db/tenant-scope';
import { ROUTINES } from '../../src/lib/jobs/scheduler';
import type { KnowledgeGameData } from '../../src/lib/knowledge/page-contract';

/* ------------------------------------------------------------------ *
 * 前提校验：不齐就抛（不 skip）
 * ------------------------------------------------------------------ */
const appUrl = resolveAppDatabaseUrl();
if (!process.env.DATABASE_URL) {
  throw new Error('[F006] 缺 DATABASE_URL —— 夹具与对照组要特权连接');
}
if (!appUrl) {
  throw new Error(
    '[F006] 缺 DATABASE_URL_APP（非特权 kol_app 连接）。没有它，"RLS 真生效"这个前提不成立，' +
      '整套闭环会在特权连接上全绿而毫无意义。建角色：npm run db:app-role',
  );
}
if (!isAppRoleRuntimeEnabled()) {
  throw new Error(
    '[F006] DB_APP_ROLE_RUNTIME 未开。本文件的全部意义就是"开关真开着"，' +
      '请用 `npm run rls:e2e` 跑（该 script 以进程级 env 前缀给开关，不改 .env 默认值）。',
  );
}
if (resolveRuntimeDatabaseUrl() !== appUrl) {
  throw new Error(
    '[F006] 运行时连接串没有解析到 kol_app —— 开关与连接串必须同时成立，' +
      '否则被测的是"特权连接下的假闭环"。',
  );
}

/* ------------------------------------------------------------------ *
 * 夹具
 * ------------------------------------------------------------------ */
const TAG = `f006rls-${process.pid}`;
const SLUG = { a: `${TAG}-a`, b: `${TAG}-b` } as const;
const PASSWORD = 'F006pass123';

interface TenantFixture {
  tenantId: string;
  gameId: string;
  pendingActionId: string;
  email: string;
  projects: number;
  pending: number;
  gameName: string;
}
const fx: Record<'a' | 'b', TenantFixture> = {
  a: {} as TenantFixture,
  b: {} as TenantFixture,
};
/** 注册段（§3）新建的租户 —— 它不带 TAG 前缀的 slug，故单独登记以便精确清理。 */
let registeredTenantId: string | null = null;

async function seedTenant(key: 'a' | 'b', projects: number, pending: number) {
  const slug = SLUG[key];
  const passwordHash = await hashPassword(PASSWORD);
  const tenant = await privilegedDb.tenant.create({ data: { slug, name: slug } });
  const email = `${slug}@f006.local`;
  await privilegedDb.user.create({
    data: { tenantId: tenant.id, email, name: slug, passwordHash },
  });
  await privilegedDb.project.createMany({
    data: Array.from({ length: projects }, (_, i) => ({
      tenantId: tenant.id,
      name: `${slug}-p${i + 1}`,
      slug: `${slug}-p${i + 1}`,
    })),
  });
  const gameName = `${slug}-game`;
  const game = await privilegedDb.game.create({
    data: { tenantId: tenant.id, name: gameName, slug: gameName },
  });
  const action = await privilegedDb.pendingAction.create({
    data: {
      tenantId: tenant.id,
      kind: 'outbound',
      toolName: 'send_outreach',
      payloadHash: `${slug}-pending`,
      harmJson: { action: 'f006-fixture' },
      status: 'pending',
    },
  });
  fx[key] = {
    tenantId: tenant.id,
    gameId: game.id,
    pendingActionId: action.id,
    email,
    projects,
    pending,
    gameName,
  };
}

beforeAll(async () => {
  await seedTenant('a', 2, 1);
  await seedTenant('b', 1, 1);
});

afterAll(async () => {
  const ids = [fx.a.tenantId, fx.b.tenantId, registeredTenantId].filter(
    (v): v is string => Boolean(v),
  );
  // ① 按登记 id 精确删。软引用表（OperationLog / PendingAction 无 FK 不级联）必须逐个点名。
  for (const id of ids) {
    for (const step of [
      () => privilegedDb.operationLog.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.pendingAction.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.gameKnowledge.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.material.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.game.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.project.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.user.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.tenant.deleteMany({ where: { id } }),
    ]) {
      try {
        await step();
      } catch (err) {
        console.warn('[F006] 清理步骤失败（继续）:', err);
      }
    }
  }
  // ② **不从登记表派生**的普查：按前缀在全表扫。登记表本身漏了什么，只有这一层看得见。
  const [tenants, users, projects, games, logs, pendings] = await Promise.all([
    privilegedDb.tenant.count({ where: { name: { startsWith: TAG } } }),
    privilegedDb.user.count({ where: { email: { startsWith: TAG } } }),
    privilegedDb.project.count({ where: { name: { startsWith: TAG } } }),
    privilegedDb.game.count({ where: { name: { startsWith: TAG } } }),
    privilegedDb.operationLog.count({ where: { summary: { contains: TAG } } }),
    privilegedDb.pendingAction.count({ where: { payloadHash: { startsWith: TAG } } }),
  ]);
  const residue = tenants + users + projects + games + logs + pendings;
  if (residue !== 0) {
    throw new Error(
      `[F006] 夹具残留：tenants=${tenants} users=${users} projects=${projects} ` +
        `games=${games} logs=${logs} pendings=${pendings}`,
    );
  }
});

/** 静音 logger：哨兵那两条用例本来就要触发告警/错误日志，不必污染输出。 */
const quietLogger = { warn: () => {}, error: () => {}, info: () => {} };

/* ================================================================== *
 * §1 前提与哨兵（acceptance ③）
 * ================================================================== */

describe('§1 运行时真的连在 kol_app 上，哨兵放行', () => {
  it('运行时 client 的连接角色 = 非特权（不是"配了串但没用上"）', async () => {
    const info = await inspectConnectionRole(getRuntimeDb());
    expect({ superuser: info.superuser, bypassRls: info.bypassRls }).toEqual({
      superuser: false,
      bypassRls: false,
    });
  });

  it('哨兵：开关开 + kol_app 连接 → status=ok 且 enforced=true', async () => {
    await expect(
      runConnectionRoleSentinel(getRuntimeDb(), process.env, quietLogger),
    ).resolves.toMatchObject({ status: 'ok', enforced: true });
  });

  it('🔒 反向自证：同样开关开、连接串配回特权 → 抛 PrivilegedConnectionError', async () => {
    // 同一个函数、同一份 env，只换连接 —— 若它对两条连接给同一个结论，这道安全装置就是坏的。
    await expect(
      runConnectionRoleSentinel(
        privilegedDb,
        { DB_APP_ROLE_RUNTIME: '1', DATABASE_URL_APP: appUrl },
        quietLogger,
      ),
    ).rejects.toBeInstanceOf(PrivilegedConnectionError);
  });
});

/* ================================================================== *
 * §2 (a) 登录成功 —— 走 F003 引导白名单的特权路径
 * ================================================================== */

describe('§2 (a) 登录：kol_app 运行时下仍能登录（审计 B2-1 那把锁已解开）', () => {
  it('正确凭据 → 认到本人，且解析出的租户是 A', async () => {
    // 这条查询的输入只有 email，租户是它的**产物** —— 在 kol_app 下没有 app.tenant_id 可设，
    // 唯一出路就是 F003 把它划进引导白名单走 privilegedDb。变异证活见文件头 ④-1。
    const user = await authorizeCredentials(
      { email: fx.a.email, password: PASSWORD },
      prismaAuthorizeDeps,
    );
    expect(user).not.toBeNull();
    expect(user).toMatchObject({ email: fx.a.email, tenantId: fx.a.tenantId });
  });

  it('错误口令 → null（证明上一条不是"恒返回一个用户"）', async () => {
    await expect(
      authorizeCredentials(
        { email: fx.a.email, password: `${PASSWORD}-wrong` },
        prismaAuthorizeDeps,
      ),
    ).resolves.toBeNull();
  });

  it('🔒 白名单不是可选项：同一条查询走 kol_app 且无租户变量 → 恒 null（审计 B2-1 的形态）', async () => {
    // 直接问运行时 client（= kol_app，此刻没有任何 app.tenant_id）：这正是 F003 之前
    // 登录路径的样子。**不报错、就是查不到** —— 审计 B2-1 实测的「切过去就没人能登录」。
    // 把这条钉成常驻断言，比只在变异时看一眼更靠得住：谁哪天把登录挪出白名单，
    // 上面那条 (a) 会红，而这条会解释红的原因。
    const viaAppRole = await getRuntimeDb().user.findUnique({
      where: { email: fx.a.email },
      select: { id: true },
    });
    expect(viaAppRole).toBeNull();

    // 对照：同一条查询在特权连接上查得到 —— 证明「查不到」是 RLS 的功劳，不是查无此人。
    await expect(
      privilegedDb.user.findUnique({
        where: { email: fx.a.email },
        select: { id: true },
      }),
    ).resolves.not.toBeNull();
  });
});

/* ================================================================== *
 * §3 (b) 注册：新租户 + 新用户 + 留痕**三行同事务**落库
 * ================================================================== */

describe('§3 (b) 注册：三行同事务落库', () => {
  it('注册成功，且三行都在库里、同属新租户', async () => {
    const email = `${TAG}-new@f006.local`;
    const result = await registerAccount({
      tenantName: `${TAG}-new-tenant`,
      email,
      password: PASSWORD,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    registeredTenantId = result.account.tenantId;

    const [tenant, user, log] = await Promise.all([
      privilegedDb.tenant.findUnique({ where: { id: result.account.tenantId } }),
      privilegedDb.user.findUnique({ where: { id: result.account.userId } }),
      privilegedDb.operationLog.findFirst({
        where: { tenantId: result.account.tenantId, kind: 'auto' },
      }),
    ]);
    expect(tenant).not.toBeNull();
    expect(user).not.toBeNull();
    expect(log).not.toBeNull();
    expect(user!.tenantId).toBe(tenant!.id);
    expect(log!.tenantId).toBe(tenant!.id);
  });

  it('🔒 「同事务」的机械判据：中途失败 → 先写的租户行也不许留下', async () => {
    // 【为什么不能只断言"三行都在"】那条对「分三次自动提交、恰好都成功」同样成立，
    // 证不了事务性。真正的判据是**失败方向**：registerAccount 的顺序是
    // tenant.create → user.create → operationLog.create；拿一个**已注册过的 email** 去注册，
    // 租户行会先写进去、随后 user.create 撞唯一约束 P2002 —— 若三步不在一个事务里，
    // 那个孤儿租户就会留在库里。
    //
    // 【为什么不用 createdAt 逐位相同当判据（初版写法，已实测推翻）】
    // 首跑实测：同一次 registerAccount 里 tenant 与 user 的 createdAt 相差 5ms
    //（1786170715127 vs 1786170715132）。若该列取的是 Postgres 事务开始时刻，同事务内
    // 三行必然逐位相同 —— 实测既然不同，说明这个列的值不是事务开始时刻，该判据不成立。
    // 记在这里，免得后来人再试一次同一条死路。
    const orphanTenantName = `${TAG}-orphan-tenant`;
    const result = await registerAccount({
      tenantName: orphanTenantName,
      email: `${TAG}-new@f006.local`, // 与上一条用例同一个 email
      password: PASSWORD,
    });
    expect(result).toEqual({ ok: false, reason: 'email_taken' });

    const orphans = await privilegedDb.tenant.count({
      where: { name: orphanTenantName },
    });
    expect(orphans).toBe(0);
  });
});

/* ================================================================== *
 * §4 (c) 一个 API route 返回本租户数据（会话面 ALS，RLS 真生效）
 * ================================================================== */

describe('§4 (c) API route：GET /api/nav-badges', () => {
  it('A 的会话 → 200 + A 自己的计数（不是零、也不是全库）', async () => {
    sessionSeam.tenantId = fx.a.tenantId;
    const res = await navBadgesGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      today: fx.a.pending,
      projects: fx.a.projects,
    });
  });

  it('B 的会话 → 拿到的是 B 的计数（同一条 route，换个会话换一套数）', async () => {
    sessionSeam.tenantId = fx.b.tenantId;
    const res = await navBadgesGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      today: fx.b.pending,
      projects: fx.b.projects,
    });
  });
});

/* ================================================================== *
 * §5 (d) 一个 RSC page 渲染出本租户数据
 * ================================================================== */

describe('§5 (d) RSC page：/admin/knowledge', () => {
  it('A 的会话 → 渲染出 A 的游戏，且**看不见** B 的游戏', async () => {
    sessionSeam.tenantId = fx.a.tenantId;
    const element = await KnowledgePage({ searchParams: Promise.resolve({}) });
    const names = (
      element.props as { games: KnowledgeGameData[] }
    ).games.map((g) => g.name);
    expect(names).toContain(fx.a.gameName);
    expect(names).not.toContain(fx.b.gameName);
  });
});

/* ================================================================== *
 * §6 (e) 一个例程跑完并落痕（无会话面：租户来自注册表 slug）
 * ================================================================== */

describe('§6 (e) 例程：ROUTINES health-scan', () => {
  it('跑完并把留痕写进 A 名下（写路径在 kol_app 下同样过 WITH CHECK）', async () => {
    const def = ROUTINES.find((r) => r.name === 'health-scan');
    expect(def).toBeDefined();
    const before = await privilegedDb.operationLog.count({
      where: { tenantId: fx.a.tenantId },
    });

    const result = (await def!.run(SLUG.a)) as { scanned: number; logged: number };
    expect(result).toEqual({ scanned: fx.a.projects, logged: fx.a.projects });

    const after = await privilegedDb.operationLog.count({
      where: { tenantId: fx.a.tenantId },
    });
    expect(after - before).toBe(fx.a.projects);
  });
});

/* ================================================================== *
 * §7 (f) 跨租户零行 —— 必须有 **DB 层**证据，不能只有应用层 where
 * ================================================================== */

describe('§7 (f) 跨租户零行（DB 层证据）', () => {
  it('🔒 raw SQL 直查 B 的行：A 的作用域里 0 行，特权连接上 1 行', async () => {
    // 关键在于这条 SQL **没有任何租户谓词** —— 只按主键取。
    // 于是「查不到」只可能是 RLS policy 的功劳，与应用代码的 where 无关。
    const sql = 'SELECT count(*)::int AS c FROM "Game" WHERE id = $1';

    const inTenantA = await withTenant(fx.a.tenantId, async () => {
      const own = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
        sql,
        fx.a.gameId,
      );
      const foreign = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
        sql,
        fx.b.gameId,
      );
      return { own: own[0].c, foreign: foreign[0].c };
    });

    // 正对照：同一条连接、同一条 SQL，查自己的行**看得见** ——
    // 没有这一条，"0 行"也可能是连接坏了 / 表名写错了这类平凡原因。
    expect(inTenantA.own).toBe(1);
    expect(inTenantA.foreign).toBe(0);

    // 反对照：这一行**确实存在**（否则上面的 0 不证明任何隔离）。
    const privileged = await privilegedDb.$queryRawUnsafe<Array<{ c: number }>>(
      sql,
      fx.b.gameId,
    );
    expect(privileged[0].c).toBe(1);
  });

  it('🔒 产品路径同款：按主键取 B 的 PendingAction（无租户 where）→ null', async () => {
    const found = await withTenant(fx.a.tenantId, () =>
      prisma.pendingAction.findUnique({ where: { id: fx.b.pendingActionId } }),
    );
    expect(found).toBeNull();
    // 同样先证明这一行存在，再谈"看不见"
    await expect(
      privilegedDb.pendingAction.findUnique({
        where: { id: fx.b.pendingActionId },
      }),
    ).resolves.not.toBeNull();
  });

  it('🔒 写侧同样拦住：在 A 的作用域里往 B 名下插行 → 被 WITH CHECK 拒', async () => {
    // 只读方向的零行不足以说明隔离成立：能读不能写和能写不能读是两种不同的洞。
    await expect(
      withTenant(fx.a.tenantId, () =>
        prisma.operationLog.create({
          data: {
            tenantId: fx.b.tenantId,
            kind: 'auto',
            actor: 'f006-probe',
            summary: `${TAG} 越权写探针（本行不该存在）`,
          },
        }),
      ),
    ).rejects.toThrow();

    // 真没写进去（不是"抛了错但行还在"）
    const leaked = await privilegedDb.operationLog.count({
      where: { tenantId: fx.b.tenantId, summary: { contains: TAG } },
    });
    expect(leaked).toBe(0);
  });
});
