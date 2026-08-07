// M5.1b-TENANT-INJECTION F005 — ALS 在 **RSC / route handler / scheduler** 三执行上下文的传播实测。
//
// 【为什么不能用 mock 糊过去】审计 Q2-C 点名「ALS 在 Next 三种执行上下文里的传播需实测」。
// mock 一个 ALS、或在单测里手写 `als.run(...)` 再断言 `getStore()` 有值，测的是
// AsyncLocalStorage 这个 Node API 本身——它当然是对的。真正会坏的是**接线**：入口有没有把
// 作用域建起来、建的是不是这个租户、并发请求之间会不会串。故本文件一律走**产品入口本体**：
//   (a) RSC       → src/app/admin/knowledge/page.tsx 的 default export（真 server component）
//   (b) route     → src/app/api/nav-badges/route.ts 的 GET
//   (c) scheduler → src/lib/jobs/scheduler.ts 的 ROUTINES['health-scan'].run（真调度执行体）
// 三条都打真库。
//
// 【本文件全程在「开关开 + 仍连特权串」下跑，这是刻意的隔离】
//   process.env.DB_APP_ROLE_RUNTIME='1' → `prisma` 代理的第三分支激活：**无 ALS 作用域即抛**
//   MissingTenantScopeError（fail-closed）。同时**删掉** DATABASE_URL_APP → 运行时 client 仍解析
//   到 DATABASE_URL（app-role.ts:resolveRuntimeDatabaseUrl：开关开但没配 APP 串 → null → 回落）。
//   于是本文件测的是**传播**这一件事，而不是 RLS 强制：
//     · 传播坏了（入口没包/包错租户）→ 当场 MissingTenantScopeError 或读到别人的数据 → 红；
//     · RLS 强制（连 kol_app、跨租户零行的 DB 层证据）是 **F006** 的验收面，不在这里混。
//   两件事分开才能让失败指向唯一原因。DATABASE_URL_APP 在本机 .env 里**是配着的**，
//   所以必须显式 delete，不能指望它恰好没配。
//
// 【夹具与断言都走 privilegedDb】fixture 建/删与「库里到底有几行」的核对一律用特权 client：
// 它不读开关、不进 ALS，因此「测试脚手架」与「被测机制」不共用同一条会被变异影响的路径——
// 变异证活时脚手架不会跟着一起坏（否则红了也分不清是谁坏的）。
//
// 【变异锚（acceptance ④）—— 四条**实跑过**，实测结果如下（完整输出见 commit 正文）】
//   1. 摘掉 route 入口的 withSessionTenant（改回 requireSessionIdentity + 直调 leaf）
//      → 2 条红；stderr 明示 `MissingTenantScopeError`，不是「200 + 零计数」
//   2. 摘掉 RSC 入口的 withSessionTenant                → 2 条红（同样 MissingTenantScopeError）
//   3. 摘掉 scheduler health-scan 的 withTenant         → 2 条红（同样 MissingTenantScopeError）
//   4. 把入口包裹的租户换成**另一个**租户               → 4 条红
//      ↑ 这条第一次跑只红了 2 条：并发用例当时只断言「这批请求里出现过 A 和 B」，
//        而 A/B 互换作用域后集合仍是 {A,B} → 空绿。据此把并发断言加固成**逐条配对**
//        （expectScopeMatchesQuery：这次查询的租户 == ALS 租户 == DB 会话变量租户），
//        重跑同一变异 → 4 条红。盲区是变异找出来的，不是想出来的。
//
// 【实测发现（acceptance ⑤ 如实登记）】
//   · 三个上下文**都传播得了**，没有「传播不了」需要替代接线的情况。
//   · RSC 的作用域只覆盖**数据装配段**，不覆盖 JSX 渲染——理由写在 page.tsx 的调用点旁。
//     若将来在 JSX 内 await 取数（Suspense 流式子树），那次访问落在作用域外 → 开关开时
//     当场 MissingTenantScopeError，属 fail-closed，不会静默读错租户。
//   · **RSC loader 的兜底 catch 会把 fail-closed 吞成静默空态**：
//     src/lib/insight/cross-surface-data.ts:124 与 src/lib/insight/surface-data.ts:154 都是
//     「catch → 返回空态」。这类 loader 若在 M5.2 被包裹，忘了包/包错时用户看到的是**空白页**
//     而不是报错——正是 app-role.ts 点名的「没数据但不报错」形态。本批选的
//     knowledge/page-data.ts **没有**这种 catch，故 ①(a) 能红成 MissingTenantScopeError。
//     M5.2 铺开时须逐个 loader 决定：要么让 MissingTenantScopeError 穿透 catch，要么不包它。
//
// 【夹具纪律】独一前缀；收尾两层（按登记 id 精确删 + **不从登记表派生**的全表前缀普查）；
// 清理段每步独立 try/catch 只告警（testing-env-patterns.md §9.1）。

import { AsyncLocalStorage } from 'node:async_hooks';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/* ================================================================== *
 * 支点一（顺序用例）：真会话链 —— 只替换最外层的 next-auth `auth()`
 *
 * 与 tests/unit/session-tenant-context.test.ts 同一口径：mock 掉 session-tenant 等于把被测
 * 对象换成假的。这里 session-tenant → tenant-entry → withTenant → 代理 全是真的，
 * 只有「cookie 里那张 JWT 长什么样」被替换（那是 Auth.js 的行为，不是本仓的）。
 * ================================================================== */
const authSeam = vi.hoisted(() => ({
  session: null as { user?: Record<string, unknown> } | null,
}));

vi.mock('../../src/lib/auth/index', () => ({
  auth: async () => authSeam.session,
}));

/* ================================================================== *
 * 支点二（并发用例）：租户身份注入缝
 *
 * 【为什么并发用例不能用支点一 —— vitest 的动态 import mock 在并发下失效（实测）】
 * `readSessionIdentity` 对 `./index` 用的是**动态** import（session-tenant.ts 文件头写明理由：
 * 不让 scripts / 显式租户路径拖上 next-auth 模块图）。vitest 4.1.10 对这种动态 import 的 mock
 * **只在顺序调用下成立**：两个 `readSessionIdentity()` 放进同一个 `Promise.all` 时，其中一路会
 * 拿到**未被 mock 的真模块**，当场撞 next-auth 的
 * ``​`headers` was called outside a request scope``。
 * 20 行探针可复现（与本仓产品代码无关）：mock `src/lib/auth/index` → 顺序调两次 readSessionIdentity
 * 全走 mock；改成 `Promise.all([readSessionIdentity(), readSessionIdentity()])` → 真模块泄漏。
 * 一旦泄漏，真模块进入缓存，其后所有调用都走真链。
 *
 * 故并发用例改用 session-tenant.ts 自己文件头指定的那个注入点（「模块边界就是那个点」），
 * 用**测试侧 ALS** 承载「这次调用是谁的会话」——模块级可变量会被后写的那个覆盖，
 * 测不出「并发不串」。被替换的仍然只有「会话从哪来」；
 * 入口 → withSessionTenant → withTenant → ALS → 代理 → 数据访问点 全程是真的，
 * 而那一段正是 F005 要证的东西。会话解析本身由 tests/unit/session-tenant-context.test.ts 守。
 *
 * seam 返回 null 时**回落真链**（`actual.requireSessionIdentity()`）——顺序用例因此仍走支点一。
 * ================================================================== */
const identitySeam = vi.hoisted(() => ({
  read: null as null | (() => { tenantId: string; actor: string } | null),
}));

vi.mock('../../src/lib/auth/session-tenant', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/auth/session-tenant')>();
  return {
    ...actual,
    requireSessionIdentity: async () =>
      identitySeam.read?.() ?? actual.requireSessionIdentity(),
  };
});

/* ================================================================== *
 * 支点三：数据访问点探针
 *
 * 三个 leaf（route/RSC/例程各自真正碰库的那个函数）被**包**了一层——不是替换：
 * `importOriginal` 拿到真实现，探针记完当下的 ALS 与 DB 事实后**继续调真函数**。
 * 于是同一条用例既能断言「数据访问点看到的 tenantId」，也能断言「真读回来的是谁的数据」。
 * ================================================================== */
const probeSeam = vi.hoisted(() => ({
  record: null as null | ((label: string, leafTenantId: string) => Promise<void>),
}));

vi.mock('../../src/lib/nav/badge-counts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/nav/badge-counts')>();
  return {
    ...actual,
    getNavBadgeCounts: async (tenantId: string) => {
      await probeSeam.record?.('route', tenantId);
      return actual.getNavBadgeCounts(tenantId);
    },
  };
});

vi.mock('../../src/lib/knowledge/page-data', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/lib/knowledge/page-data')>();
  return {
    ...actual,
    getKnowledgePageData: async (opts: { tenantId: string }) => {
      await probeSeam.record?.('rsc', opts.tenantId);
      return actual.getKnowledgePageData(opts);
    },
  };
});

vi.mock('../../src/lib/jobs/routines/health-scan', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/lib/jobs/routines/health-scan')
  >();
  return {
    ...actual,
    runHealthScan: async (tenantId: string, now: Date) => {
      await probeSeam.record?.('routine', tenantId);
      return actual.runHealthScan(tenantId, now);
    },
  };
});

import KnowledgePage from '../../src/app/admin/knowledge/page';
import { GET as navBadgesGet } from '../../src/app/api/nav-badges/route';
import { privilegedDb } from '../../src/lib/db/privileged';
import { prisma } from '../../src/lib/db/prisma';
import { getRuntimeDb } from '../../src/lib/db/runtime';
import {
  MissingTenantScopeError,
  getTenantTxScope,
  withTenant,
} from '../../src/lib/db/tenant-scope';
import { ROUTINES } from '../../src/lib/jobs/scheduler';
import { getKnowledgePageData } from '../../src/lib/knowledge/page-data';
import { getNavBadgeCounts } from '../../src/lib/nav/badge-counts';
import { runHealthScan } from '../../src/lib/jobs/routines/health-scan';
import type { KnowledgeGameData } from '../../src/lib/knowledge/page-contract';

if (!process.env.DATABASE_URL) {
  // 刻意不 skip：静默跳过的隔离测试比没有测试更危险（沿用 F001/F002 口径）。
  throw new Error('[F005] 缺 DATABASE_URL —— 本文件断言真事务/真请求行为，必须有真库');
}

/* ------------------------------------------------------------------ *
 * 会话 ALS 与探针实现
 * ------------------------------------------------------------------ */
/**
 * 顺序用例：走**真会话链**（auth() → JWT → session-tenant → tenant-entry）。
 * 顺序执行下 vitest 的动态 import mock 成立（见支点二头注）。
 */
async function asSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  authSeam.session = {
    user: { id: `u-${tenantId}`, email: `${tenantId}@f005.local`, tenantId },
  };
  try {
    return await fn();
  } finally {
    authSeam.session = null;
  }
}

/** 并发用例：每路请求各自的会话身份由测试侧 ALS 承载（见支点二头注）。 */
const sessionAls = new AsyncLocalStorage<{ tenantId: string; actor: string }>();
identitySeam.read = () => sessionAls.getStore() ?? null;

function asConcurrentSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return sessionAls.run({ tenantId, actor: `${tenantId}@f005.local` }, fn);
}

interface ProbeRecord {
  label: string;
  /**
   * 这次数据访问**自己**要查的租户（leaf 的入参，来自入口解析出的会话/注册表身份）。
   *
   * 有了它才能逐条断言「作用域的租户 == 这次查询的租户」。只断言「一批请求里出现过 A 和 B」
   * 是**不够**的：两个并发请求各自被包进对方的作用域时，集合仍然是 {A,B} —— 这个盲区由
   * 变异 4（把入口包裹的租户换成另一个租户）实测暴露，据此加固。
   */
  leafTenantId: string;
  /** 数据访问点当下的 ALS 作用域租户（undefined = 压根没有作用域）。 */
  alsTenantId: string | undefined;
  /** 同一时刻 DB 会话变量里的租户（RLS policy 真正认的那个值）。 */
  dbTenantId: string | null;
  /** 事务号：用来证明「同一次请求的数据访问都在同一个事务里」「并发请求各在各的事务里」。 */
  txid: string;
}
const probes: ProbeRecord[] = [];
let probeArmed = true;

probeSeam.record = async (label: string, leafTenantId: string) => {
  if (!probeArmed) return;
  const scope = getTenantTxScope();
  // 刻意经**产品代理** `prisma` 发这条查询：探针本身就是一个数据访问点，
  // 用直连 client 问出来的答案证明不了「业务查询落在哪」。
  const rows = await prisma.$queryRawUnsafe<
    Array<{ t: string | null; x: string }>
  >(`SELECT current_setting('app.tenant_id', true) AS t, txid_current()::text AS x`);
  probes.push({
    label,
    leafTenantId,
    alsTenantId: scope?.tenantId,
    dbTenantId: rows[0]?.t ?? null,
    txid: rows[0]?.x ?? '',
  });
};

function probesOf(label: string): ProbeRecord[] {
  return probes.filter((p) => p.label === label);
}

/**
 * 每条记录逐条自洽：**这次查询要的租户 == ALS 作用域的租户 == DB 会话变量的租户**。
 * 三者任一错位都是一次跨租户事故的形状（查 A 的数据却在 B 的作用域里 = RLS 一开就零行或读错人）。
 */
function expectScopeMatchesQuery(records: ProbeRecord[]): void {
  for (const p of records) {
    expect({ als: p.alsTenantId, db: p.dbTenantId }).toEqual({
      als: p.leafTenantId,
      db: p.leafTenantId,
    });
  }
}

/* ------------------------------------------------------------------ *
 * 开关：fail-closed 打开，但连接串仍是特权（见文件头「刻意的隔离」）
 * ------------------------------------------------------------------ */
const ORIGINAL_SWITCH = process.env.DB_APP_ROLE_RUNTIME;
const ORIGINAL_APP_URL = process.env.DATABASE_URL_APP;

function enableFailClosed(): void {
  process.env.DB_APP_ROLE_RUNTIME = '1';
  delete process.env.DATABASE_URL_APP;
}

/* ------------------------------------------------------------------ *
 * 夹具：A / B 两个租户，各自可分辨的数据
 * ------------------------------------------------------------------ */
const TAG = `f005als-${process.pid}`;
const SLUG = { a: `${TAG}-a`, b: `${TAG}-b` } as const;
const tenantIds: { a: string; b: string } = { a: '', b: '' };

/** A：2 项目 / 1 条 pending（另 1 条 executed 不计）/ 1 游戏；B：1 项目 / 0 pending / 1 游戏。 */
const FIXTURE = {
  a: { projects: 2, pending: 1, game: `${TAG}-a-game` },
  b: { projects: 1, pending: 0, game: `${TAG}-b-game` },
} as const;

async function seedTenant(key: 'a' | 'b'): Promise<string> {
  const slug = SLUG[key];
  const tenant = await privilegedDb.tenant.create({
    data: { slug, name: slug },
  });
  await privilegedDb.project.createMany({
    data: Array.from({ length: FIXTURE[key].projects }, (_, i) => ({
      tenantId: tenant.id,
      name: `${slug}-p${i + 1}`,
      slug: `${slug}-p${i + 1}`,
    })),
  });
  await privilegedDb.game.create({
    data: { tenantId: tenant.id, name: FIXTURE[key].game, slug: FIXTURE[key].game },
  });
  const pendingRows = Array.from({ length: FIXTURE[key].pending }, (_, i) => ({
    tenantId: tenant.id,
    kind: 'outbound',
    toolName: 'send_outreach',
    payloadHash: `${slug}-pending-${i}`,
    harmJson: { action: 'f005-fixture' },
    status: 'pending' as const,
  }));
  await privilegedDb.pendingAction.createMany({
    data: [
      ...pendingRows,
      // 非 pending 不计入徽标 today —— 防止 ①(b) 因「随便数了个数」而空绿
      {
        tenantId: tenant.id,
        kind: 'outbound',
        toolName: 'send_outreach',
        payloadHash: `${slug}-executed`,
        harmJson: { action: 'f005-fixture' },
        status: 'executed' as const,
      },
    ],
  });
  return tenant.id;
}

beforeAll(async () => {
  tenantIds.a = await seedTenant('a');
  tenantIds.b = await seedTenant('b');
});

beforeEach(() => {
  probes.length = 0;
  probeArmed = true;
  enableFailClosed();
});

afterAll(async () => {
  // 开关先复原：清理段自己不该受被测开关影响。
  if (ORIGINAL_SWITCH === undefined) delete process.env.DB_APP_ROLE_RUNTIME;
  else process.env.DB_APP_ROLE_RUNTIME = ORIGINAL_SWITCH;
  if (ORIGINAL_APP_URL === undefined) delete process.env.DATABASE_URL_APP;
  else process.env.DATABASE_URL_APP = ORIGINAL_APP_URL;

  // ① 按登记 id 精确删（每步独立 try/catch 只告警：清理段一抛就同时干掉
  //    「首因可见」与「环境干净」两件事）
  for (const id of [tenantIds.a, tenantIds.b].filter(Boolean)) {
    for (const step of [
      () => privilegedDb.operationLog.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.pendingAction.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.gameKnowledge.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.material.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.game.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.project.deleteMany({ where: { tenantId: id } }),
      () => privilegedDb.tenant.deleteMany({ where: { id } }),
    ]) {
      try {
        await step();
      } catch (err) {
        console.warn('[F005] 清理步骤失败（继续）:', err);
      }
    }
  }
  // ② **不从登记表派生**的普查：按前缀全表搜（登记表本身漏了什么，这一层才看得见）
  const [tenants, projects, games, logs, pendings] = await Promise.all([
    privilegedDb.tenant.count({ where: { name: { startsWith: TAG } } }),
    privilegedDb.project.count({ where: { name: { startsWith: TAG } } }),
    privilegedDb.game.count({ where: { name: { startsWith: TAG } } }),
    privilegedDb.operationLog.count({ where: { summary: { contains: TAG } } }),
    privilegedDb.pendingAction.count({
      where: { payloadHash: { startsWith: TAG } },
    }),
  ]);
  if (tenants + projects + games + logs + pendings !== 0) {
    throw new Error(
      `[F005] 夹具残留：tenants=${tenants} projects=${projects} games=${games} logs=${logs} pendings=${pendings}`,
    );
  }
});

/* ================================================================== *
 * ① 三个执行上下文各自的传播实测
 * ================================================================== */

describe('①(b) route handler 执行上下文：GET /api/nav-badges', () => {
  it('数据访问点拿到会话租户的 ALS 作用域，且真读回本租户的计数', async () => {
    const res = await asSession(tenantIds.a, () => navBadgesGet());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      today: FIXTURE.a.pending,
      projects: FIXTURE.a.projects,
    });

    const [probe] = probesOf('route');
    expect(probe).toBeDefined();
    // ALS 侧：作用域存在且是**会话那个**租户
    expect(probe.alsTenantId).toBe(tenantIds.a);
    // DB 侧：RLS policy 真正读的那个会话变量也已就位（不是只有 JS 里有个变量）
    expect(probe.dbTenantId).toBe(tenantIds.a);
  });

  it('🔒 反证：同一个 leaf 在作用域外调用 → MissingTenantScopeError（不是 200 + 零计数）', async () => {
    // 这条把「上面那条为什么绿」钉死：绿**只可能**因为入口真的建了作用域。
    probeArmed = false; // 让错误来自产品 leaf 本身，而不是探针
    await expect(getNavBadgeCounts(tenantIds.a)).rejects.toBeInstanceOf(
      MissingTenantScopeError,
    );
  });
});

describe('①(a) RSC 执行上下文：/admin/knowledge 的 server component', () => {
  it('渲染路径上的数据装配拿到会话租户的作用域，且渲染出本租户的游戏', async () => {
    const element = await asSession(tenantIds.a, () =>
      KnowledgePage({ searchParams: Promise.resolve({}) }),
    );
    const games = (element.props as { games: KnowledgeGameData[] }).games;
    expect(games.map((g) => g.name)).toEqual([FIXTURE.a.game]);

    const [probe] = probesOf('rsc');
    expect(probe).toBeDefined();
    expect(probe.alsTenantId).toBe(tenantIds.a);
    expect(probe.dbTenantId).toBe(tenantIds.a);
  });

  it('🔒 反证：同一个 leaf 在作用域外调用 → MissingTenantScopeError', async () => {
    probeArmed = false;
    await expect(
      getKnowledgePageData({ tenantId: tenantIds.a }),
    ).rejects.toBeInstanceOf(MissingTenantScopeError);
  });
});

describe('①(c) scheduler 执行上下文：ROUTINES health-scan（无会话面，租户来自注册表 slug）', () => {
  it('例程执行体拿到显式租户的作用域，扫描与留痕都落在该租户上', async () => {
    const def = ROUTINES.find((r) => r.name === 'health-scan');
    expect(def).toBeDefined();

    // 注意：这里**没有任何会话**——auth() 会返回 null。租户全靠注册表 slug → systemTenantId。
    const result = (await def!.run(SLUG.a)) as { scanned: number; logged: number };
    expect(result).toEqual({
      scanned: FIXTURE.a.projects,
      logged: FIXTURE.a.projects,
    });

    const [probe] = probesOf('routine');
    expect(probe).toBeDefined();
    expect(probe.alsTenantId).toBe(tenantIds.a);
    expect(probe.dbTenantId).toBe(tenantIds.a);

    // 事务提交后真落库（特权连接直查，绕开一切作用域）
    const logged = await privilegedDb.operationLog.count({
      where: { tenantId: tenantIds.a, kind: 'auto', actor: 'strategy' },
    });
    expect(logged).toBe(FIXTURE.a.projects);
  });

  it('🔒 反证：同一个 leaf 在作用域外调用 → MissingTenantScopeError', async () => {
    probeArmed = false;
    await expect(
      runHealthScan(tenantIds.a, new Date()),
    ).rejects.toBeInstanceOf(MissingTenantScopeError);
  });
});

/* ================================================================== *
 * ② 跨请求不串：并发 ≥2 个不同租户，各自读到自己的租户
 *   （B3 那条「连接池残留」在 DB 侧，这一组是它在**应用层**的对应面）
 * ================================================================== */

describe('② 并发不同租户互不串（应用层）', () => {
  it('route：A / B 两个并发请求各读到自己的计数，且各在各的事务里', async () => {
    const [resA, resB] = await Promise.all([
      asConcurrentSession(tenantIds.a, () => navBadgesGet()),
      asConcurrentSession(tenantIds.b, () => navBadgesGet()),
    ]);
    expect(await resA.json()).toEqual({
      today: FIXTURE.a.pending,
      projects: FIXTURE.a.projects,
    });
    expect(await resB.json()).toEqual({
      today: FIXTURE.b.pending,
      projects: FIXTURE.b.projects,
    });

    const seen = probesOf('route');
    expect(seen).toHaveLength(2);
    // 两个租户都到场（否则下面的逐条断言可能在「两路都是同一个租户」下空绿）
    expect(new Set(seen.map((p) => p.leafTenantId))).toEqual(
      new Set([tenantIds.a, tenantIds.b]),
    );
    // 逐条配对：谁的查询就在谁的作用域里（互换作用域时集合仍相等，只有这条抓得到）
    expectScopeMatchesQuery(seen);
    // 两个请求不共用事务：串租户最常见的形态就是「挤进同一个事务」
    expect(new Set(seen.map((p) => p.txid)).size).toBe(2);
  });

  it('RSC：A / B 两个并发渲染各拿到自己的游戏', async () => {
    const [elA, elB] = await Promise.all([
      asConcurrentSession(tenantIds.a, () =>
        KnowledgePage({ searchParams: Promise.resolve({}) }),
      ),
      asConcurrentSession(tenantIds.b, () =>
        KnowledgePage({ searchParams: Promise.resolve({}) }),
      ),
    ]);
    expect(
      (elA.props as { games: KnowledgeGameData[] }).games.map((g) => g.name),
    ).toEqual([FIXTURE.a.game]);
    expect(
      (elB.props as { games: KnowledgeGameData[] }).games.map((g) => g.name),
    ).toEqual([FIXTURE.b.game]);

    const seen = probesOf('rsc');
    expect(seen).toHaveLength(2);
    expect(new Set(seen.map((p) => p.leafTenantId))).toEqual(
      new Set([tenantIds.a, tenantIds.b]),
    );
    expectScopeMatchesQuery(seen);
    expect(new Set(seen.map((p) => p.txid)).size).toBe(2);
  });

  it('scheduler：两条并发例程各作用在自己的租户上（对照租户一根毫毛不动）', async () => {
    const def = ROUTINES.find((r) => r.name === 'health-scan')!;
    const before = await privilegedDb.operationLog.count({
      where: { tenantId: tenantIds.b },
    });

    const [ra, rb] = (await Promise.all([def.run(SLUG.a), def.run(SLUG.b)])) as Array<{
      scanned: number;
    }>;
    expect(ra.scanned).toBe(FIXTURE.a.projects);
    expect(rb.scanned).toBe(FIXTURE.b.projects);

    const seen = probesOf('routine');
    expect(seen).toHaveLength(2);
    expect(new Set(seen.map((p) => p.leafTenantId))).toEqual(
      new Set([tenantIds.a, tenantIds.b]),
    );
    expectScopeMatchesQuery(seen);
    expect(new Set(seen.map((p) => p.txid)).size).toBe(2);

    // B 只多了自己这一轮的留痕，没被 A 那轮碰过
    const after = await privilegedDb.operationLog.count({
      where: { tenantId: tenantIds.b },
    });
    expect(after - before).toBe(FIXTURE.b.projects);
  });
});

/* ================================================================== *
 * ③ enterWith vs run 的选型依据（实测，不是「按惯例」）
 *
 * 结论：选 **run**。理由不是「enterWith 在本仓不能用」——下面第二条实测它在
 * 事务回调里同样能被读到；而是 **enterWith 没有出口**，它的「不泄漏」取决于调用点
 * 恰好落在第一个 await 之后这种看不见的性质（第三条实测：落在 await 之前就泄漏到调用方）。
 * withTenant 要的是「作用域与事务同生共死」——事务一提交，那个 tx 句柄就是**死的**
 * （第四条实测：拿它再查会抛 PrismaClientKnownRequestError）。这个性质必须由结构保证，
 * 不能由调用点的书写位置碰巧保证。run 的回调边界就是那个结构。
 * ================================================================== */

describe('③ enterWith vs run 的选型有实测依据', () => {
  it('run：作用域严格随回调结束——withTenant 返回后 getTenantTxScope() 为 undefined', async () => {
    let inside: string | undefined;
    await withTenant(tenantIds.a, async () => {
      inside = getTenantTxScope()?.tenantId;
    });
    expect(inside).toBe(tenantIds.a);
    expect(getTenantTxScope()).toBeUndefined();
  });

  it('enterWith 在事务回调内**同样能读到**（故不是「它在本仓不成立」）', async () => {
    const probeAls = new AsyncLocalStorage<{ tenantId: string }>();
    let inside: string | undefined;
    await getRuntimeDb().$transaction(async () => {
      probeAls.enterWith({ tenantId: tenantIds.a });
      await new Promise((r) => setImmediate(r));
      inside = probeAls.getStore()?.tenantId;
    });
    expect(inside).toBe(tenantIds.a);
  });

  it('🔒 enterWith 的致命差别：写在第一个 await 之前就**泄漏到调用方**（run 不会）', async () => {
    const probeAls = new AsyncLocalStorage<{ tenantId: string }>();

    async function entryWithEnterWith(): Promise<void> {
      probeAls.enterWith({ tenantId: tenantIds.a }); // 同步段 = 调用方的执行上下文
      await new Promise((r) => setImmediate(r));
    }
    await entryWithEnterWith();
    // 入口已经返回、"请求"已经结束，作用域却还在调用方身上
    expect(probeAls.getStore()?.tenantId).toBe(tenantIds.a);
    probeAls.enterWith(undefined as unknown as { tenantId: string }); // 复位

    async function entryWithRun(): Promise<void> {
      await probeAls.run({ tenantId: tenantIds.a }, async () => {
        await new Promise((r) => setImmediate(r));
      });
    }
    await entryWithRun();
    expect(probeAls.getStore()).toBeUndefined();
  });

  it('🔒 泄漏为什么致命：事务提交后那个 tx 句柄已经死了，再用必抛', async () => {
    let leaked: { $queryRawUnsafe: (q: string) => Promise<unknown> } | null = null;
    await withTenant(tenantIds.a, async (tx) => {
      leaked = tx as unknown as typeof leaked;
    });
    expect(leaked).not.toBeNull();
    await expect(leaked!.$queryRawUnsafe('SELECT 1')).rejects.toThrow();
  });
});
