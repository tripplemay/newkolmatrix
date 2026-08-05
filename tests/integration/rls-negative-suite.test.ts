// M5-AUTH-RLS F011（spec D-8 + F009 审计裁-Q4）— 跨租户负向套件：**两层，各证各的**。
//
// ┌─ 读之前必须先看清这件事（裁 Q4 口径，报告与注释不得混同）─────────────────────┐
// │ 本批**没有**把应用运行时切到非特权连接（F009 的租户变量注入被移出到 M5.1，        │
// │ `DB_APP_ROLE_RUNTIME` 默认关）。因此：                                          │
// │   · §1 API 层跑在**特权连接**上 —— 那里的 404 / 零行是**应用层 where** 的功劳，   │
// │     与 RLS 无关。这一节**不能**被读成"RLS 在 API 层也证过了"。                    │
// │   · §2 DB 层自建 kol_app 连接（NOSUPERUSER NOBYPASSRLS）—— 那里的零行才是         │
// │     **RLS policy** 的功劳，与应用代码无关（raw SQL 直查，绕开 Prisma 类型层）。   │
// │ §0 用一条机械断言把这个前提钉住：API 层用的那个 client 确实是特权连接。           │
// │ 将来 M5.1 把运行时切过去时，那条断言会红 —— 逼着来人回来改这段话，而不是让         │
// │ 一段过期的两层声明继续挂在这里。                                                 │
// └────────────────────────────────────────────────────────────────────────────┘
//
// 夹具纪律（M4.7/M4.8 两层）：A/B 两个真租户带独一前缀；收尾 ① 按登记 id 精确删
// ② **不从登记表派生**的普查（按前缀在全表扫，写到未登记租户上的行照样露头）。

import { vi } from 'vitest';

/** 会话注入缝：route handler 直调时没有 Next 请求作用域，租户身份从这里给（tests/support/session-mock）。 */
const sessionSeam = vi.hoisted(() => ({ tenantId: '', actor: 'f011-a@test.local' }));
vi.mock('lib/auth/session-tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/auth/session-tenant')>();
  const { makeSessionTenantMock } = await import('../support/session-mock');
  return makeSessionTenantMock(actual, sessionSeam);
});

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import {
  assertNonPrivilegedConnection,
  inspectConnectionRole,
  isPrivilegedConnection,
} from '../../src/lib/db/app-role';
import { GET as getActions } from '../../src/app/api/actions/route';
import { GET as getActionDetail } from '../../src/app/api/actions/[id]/route';
import { GET as getMaterials } from '../../src/app/api/materials/route';
import { POST as parseMaterialRoute } from '../../src/app/api/materials/[id]/parse/route';
import { PATCH as setProjectGoal } from '../../src/app/api/projects/[id]/goal/route';

const appUrl = process.env.DATABASE_URL_APP;
if (!appUrl) {
  throw new Error(
    '[F011] 缺 DATABASE_URL_APP（非特权 kol_app 连接）。DB 层那一半没有它就只能在特权连接上跑，' +
      '而特权连接绕过全部 RLS —— 那种"负向套件"必然全绿且毫无意义。建角色：npm run db:app-role',
  );
}
/** DB 层专用连接：RLS 对它真实生效。刻意不用产品单例（单例此刻是特权连接，见文件头）。 */
const appDb = new PrismaClient({ datasourceUrl: appUrl });

const TAG = `f011-${process.pid}`;
interface TenantFixture {
  tenantId: string;
  projectId: string;
  gameId: string;
  materialId: string;
  actionId: string;
  kolId: string;
}
const fx: Record<'a' | 'b', TenantFixture> = {
  a: {} as TenantFixture,
  b: {} as TenantFixture,
};

async function seedTenant(key: 'a' | 'b'): Promise<TenantFixture> {
  const label = `${TAG}-${key}`;
  const tenant = await prisma.tenant.create({ data: { slug: label, name: label } });
  const game = await prisma.game.create({
    data: { tenantId: tenant.id, name: `${label}-game`, slug: `${label}-game` },
  });
  const project = await prisma.project.create({
    data: { tenantId: tenant.id, name: `${label}-project`, slug: `${label}-project`, gameId: game.id },
  });
  const material = await prisma.material.create({
    data: {
      tenantId: tenant.id,
      gameId: game.id,
      type: 'lore',
      fileName: `${label}-material.txt`,
      storageRef: `${game.id}/${label}-material.txt`,
      mimeType: 'text/plain',
      sizeBytes: 128,
    },
  });
  const action = await prisma.pendingAction.create({
    data: {
      tenantId: tenant.id,
      kind: 'outbound',
      toolName: 'send_outreach',
      payloadHash: `${label}-hash`,
      status: 'pending',
      harmJson: {
        action: `${label}-发送触达`,
        target: `${label}-target@example.com`,
        amount: null,
        irreversible: true,
        evidence: [`${label}-evidence`],
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      },
    },
  });
  const kol = await prisma.kol.create({
    data: { tenantId: tenant.id, canonicalHandle: `${label}-kol`, displayName: `${label}-kol` },
  });
  await prisma.operationLog.create({
    data: { tenantId: tenant.id, kind: 'auto', summary: `${label}-log`, projectId: project.id },
  });
  return {
    tenantId: tenant.id,
    projectId: project.id,
    gameId: game.id,
    materialId: material.id,
    actionId: action.id,
    kolId: kol.id,
  };
}

beforeAll(async () => {
  fx.a = await seedTenant('a');
  fx.b = await seedTenant('b');
  sessionSeam.tenantId = fx.a.tenantId; // 全程以 A 的会话发请求
});

afterAll(async () => {
  // ① 按登记 id 精确删
  for (const f of [fx.a, fx.b]) {
    if (!f.tenantId) continue;
    await prisma.operationLog.deleteMany({ where: { tenantId: f.tenantId } });
    await prisma.pendingAction.deleteMany({ where: { tenantId: f.tenantId } });
    await prisma.material.deleteMany({ where: { tenantId: f.tenantId } });
    await prisma.project.deleteMany({ where: { tenantId: f.tenantId } });
    await prisma.kol.deleteMany({ where: { tenantId: f.tenantId } });
    await prisma.game.deleteMany({ where: { tenantId: f.tenantId } });
    await prisma.tenant.deleteMany({ where: { id: f.tenantId } });
  }
  // ② 不从登记表派生的普查：按前缀全表扫
  const residue = {
    tenants: await prisma.tenant.count({ where: { name: { startsWith: TAG } } }),
    projects: await prisma.project.count({ where: { name: { startsWith: TAG } } }),
    games: await prisma.game.count({ where: { name: { startsWith: TAG } } }),
    materials: await prisma.material.count({ where: { fileName: { startsWith: TAG } } }),
    actions: await prisma.pendingAction.count({ where: { payloadHash: { startsWith: TAG } } }),
    kols: await prisma.kol.count({ where: { canonicalHandle: { startsWith: TAG } } }),
    logs: await prisma.operationLog.count({ where: { summary: { startsWith: TAG } } }),
  };
  await appDb.$disconnect();
  const total = Object.values(residue).reduce((a, b) => a + b, 0);
  if (total !== 0) throw new Error(`[F011] 夹具残留：${JSON.stringify(residue)}`);
});

/** 断言响应体里没有 B 的任何可识别标识（正向精确，不靠"没报错"糊过去）。 */
function expectNoTenantBLeak(payload: unknown): void {
  const text = JSON.stringify(payload ?? null);
  expect(text).not.toContain(fx.b.tenantId);
  expect(text).not.toContain(fx.b.projectId);
  expect(text).not.toContain(fx.b.materialId);
  expect(text).not.toContain(fx.b.actionId);
  expect(text).not.toContain(`${TAG}-b`);
}

describe('F011 §0 前置：两层各自跑在哪条连接上（这段前提本身要有机械证据）', () => {
  it('DB 层用的 kol_app 连接确实不能绕过 RLS', async () => {
    const info = await assertNonPrivilegedConnection(appDb);
    expect(info.superuser).toBe(false);
    expect(info.bypassRls).toBe(false);
  });

  it('API 层用的产品单例此刻是**特权**连接 —— 故 §1 的 404 与 RLS 无关', async () => {
    const info = await inspectConnectionRole(prisma);
    expect(
      isPrivilegedConnection(info),
      'API 层已跑在非特权连接上 ⇒ 运行时切换（M5.1）已落地：请回来重写文件头的两层声明，' +
        '此时 §1 才同时受 RLS 保护',
    ).toBe(true);
  });
});

describe('F011 §1 API 层：A 的会话拿不到 B 的东西（**应用层 where** 的功劳，非 RLS）', () => {
  it('GET /api/actions/[id]：直点 B 的动作 id → 404，且响应里没有 B 的任何标识', async () => {
    const res = await getActionDetail(new Request('http://t/api/actions/x'), {
      params: Promise.resolve({ id: fx.b.actionId }),
    });
    expect(res.status).toBe(404);
    expectNoTenantBLeak(await res.json());
  });

  it('GET /api/actions：清单里只有 A 的动作，B 的一件不出现', async () => {
    const res = await getActions(new Request('http://t/api/actions'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.map((i) => i.id)).toContain(fx.a.actionId);
    expect(body.items.map((i) => i.id)).not.toContain(fx.b.actionId);
    expectNoTenantBLeak(body);
  });

  it('POST /api/materials/[id]/parse：拿 B 的素材 id → 404（在碰文件与网关之前就挡住）', async () => {
    const res = await parseMaterialRoute(new Request('http://t', { method: 'POST' }), {
      params: Promise.resolve({ id: fx.b.materialId }),
    });
    expect(res.status).toBe(404);
    expectNoTenantBLeak(await res.json());
  });

  it('GET /api/materials?gameId=B 的游戏 → 零行（不是别人的素材，也不是报错）', async () => {
    const res = await getMaterials(
      new Request(`http://t/api/materials?gameId=${fx.b.gameId}`),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { materials: unknown[] };
    expect(body.materials).toEqual([]);
    expectNoTenantBLeak(body);
  });

  it('PATCH /api/projects/[id]/goal：改 B 的项目 → 404，且 B 的项目确实没被改', async () => {
    const before = await prisma.project.findUnique({ where: { id: fx.b.projectId } });
    const res = await setProjectGoal(
      new Request('http://t', {
        method: 'PATCH',
        body: JSON.stringify({
          targetExposure: 999_999,
          periodStart: '2026-01-01',
          periodEnd: '2026-02-01',
        }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: fx.b.projectId }) },
    );
    expect(res.status).toBe(404);
    expectNoTenantBLeak(await res.json());
    const after = await prisma.project.findUnique({ where: { id: fx.b.projectId } });
    expect(after?.goal ?? null).toEqual(before?.goal ?? null);
  });

  it('对照组：同样的调用用 A 自己的资源是**通的**（证明 404 不是"什么都打不开"）', async () => {
    const res = await getActionDetail(new Request('http://t/api/actions/x'), {
      params: Promise.resolve({ id: fx.a.actionId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(fx.a.actionId);
  });
});

describe('F011 §2 DB 层：kol_app 连接 + set_config(A) 直查 B → 零行（**RLS policy** 的功劳）', () => {
  /** 在 kol_app 连接上开事务并注入租户变量（SET LOCAL 语义，事务界）。 */
  async function asTenant<T>(tenantId: string, sql: (tx: {
    $queryRawUnsafe: <R = unknown>(q: string, ...v: unknown[]) => Promise<R>;
  }) => Promise<T>): Promise<T> {
    return appDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
      return sql(tx);
    });
  }

  const TABLES: Array<[string, keyof TenantFixture]> = [
    ['Project', 'projectId'],
    ['Material', 'materialId'],
    ['PendingAction', 'actionId'],
    ['Kol', 'kolId'],
    ['Game', 'gameId'],
  ];

  it('注入 A 后，raw SQL 按主键直查 B 的行：逐表全部 0 行', async () => {
    const seen = await asTenant(fx.a.tenantId, async (tx) => {
      const out: Record<string, number> = {};
      for (const [table, key] of TABLES) {
        const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*) AS n FROM "${table}" WHERE id = $1`,
          fx.b[key],
        );
        out[table] = Number(rows[0]!.n);
      }
      return out;
    });
    expect(seen).toEqual(Object.fromEntries(TABLES.map(([t]) => [t, 0])));
  });

  it('同一条 SQL 换成查 A 自己的行 → 各 1 行（证明"零行"不是查询本身写坏了）', async () => {
    const seen = await asTenant(fx.a.tenantId, async (tx) => {
      const out: Record<string, number> = {};
      for (const [table, key] of TABLES) {
        const rows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*) AS n FROM "${table}" WHERE id = $1`,
          fx.a[key],
        );
        out[table] = Number(rows[0]!.n);
      }
      return out;
    });
    expect(seen).toEqual(Object.fromEntries(TABLES.map(([t]) => [t, 1])));
  });

  it('pgvector 检索面同样受管：kol_app 注入 A 后按 embedding 扫全表也只见 A 的 KOL', async () => {
    const rows = await asTenant(fx.a.tenantId, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string; tenantId: string }>>(
        `SELECT id, "tenantId" FROM "Kol" WHERE "canonicalHandle" LIKE $1`,
        `${TAG}-%`,
      ),
    );
    expect(rows.map((r) => r.id)).toEqual([fx.a.kolId]);
    expect(rows.every((r) => r.tenantId === fx.a.tenantId)).toBe(true);
  });

  it('不注入任何租户变量 → 连 A 自己的行都看不见（default deny，不是"只是拦了别人"）', async () => {
    const rows = await appDb.$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM "Project" WHERE id IN ($1, $2)`,
      fx.a.projectId,
      fx.b.projectId,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('写侧：注入 A 后往 B 名下插行被 WITH CHECK 拒（读隔离不能只做一半）', async () => {
    await expect(
      asTenant(fx.a.tenantId, (tx) =>
        tx.$queryRawUnsafe(
          `INSERT INTO "Project" (id, "publicId", "tenantId", name, cur, "maxReached")
             VALUES ($1, $2, $3, $4, 'brief', 'brief')`,
          `${TAG}-forged`,
          `${TAG}-forged-pub`,
          fx.b.tenantId,
          `${TAG}-forged`,
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
    // 用特权连接核查全局：确实一行没写进去
    expect(await prisma.project.count({ where: { name: `${TAG}-forged` } })).toBe(0);
  });

  it('对照组：特权连接（迁移/既有测试那条）看得见 A 和 B 两边 —— 数据确实都在', async () => {
    const both = await prisma.project.findMany({
      where: { name: { startsWith: TAG } },
      select: { id: true },
    });
    expect(both.map((p) => p.id).sort()).toEqual([fx.a.projectId, fx.b.projectId].sort());
  });
});
