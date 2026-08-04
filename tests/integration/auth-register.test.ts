// M5-AUTH-RLS F005（spec D-4）— 开放注册的行为级测试（打真库，真 bcrypt 摘要）。
//
// 为什么是集成测试：本 feature 的三条硬断言（事务原子性、DB 唯一约束翻译成 409、
// 留痕落库）都只有在真库上才成立——原子性尤其：mock 的 $transaction 回滚是假的，
// 它只能证明「代码里写了 transaction」，证不了「失败时库里真的什么都没留下」。
//
// 夹具隔离：租户名/邮箱带 pid；收尾两层——① 按登记的租户 id 精确删除后核证本文件前缀
// 的行归零；② **不从登记表派生**的普查：按留痕内容搜探针域名，写到未登记租户上的行照样露头。
// 计数一律按前缀收窄，不用整表 count（并行跑别的文件同刻在建/删租户，整表基线随机红）。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/db/prisma';
import { POST } from '../../src/app/api/auth/register/route';
import {
  EMAIL_TAKEN_MESSAGE,
  WEAK_PASSWORD_MESSAGE,
  registerAccount,
  registerInputSchema,
} from '../../src/lib/auth/register';
import { AUTH_AUDIT_ACTOR, AUTH_AUDIT_MARKER } from '../../src/lib/auth/audit';
import { verifyPassword } from '../../src/lib/auth/password';

const TAG = `f005-${process.pid}`;
/** 独一无二的口令与邮箱本地部分——隐私断言在全表上搜这两个串。 */
const PROBE_PASSWORD = `Zq7Unique${process.pid}Pass1`;
const PROBE_LOCALPART = `privacy-probe-${process.pid}`;

/** 本测试创建的租户 id（收尾精确删除）。 */
const createdTenantIds = new Set<string>();

/**
 * 计数一律**按本文件的夹具前缀收窄**，不用整表 count。
 * 理由（实测教训）：vitest 并行跑多个文件，别的文件同刻也在建/删租户——整表基线在单独跑
 * 时恒绿、在全量跑时随机红。这类断言不是"更严"，是**不可靠**。
 */
async function tagCounts(): Promise<{
  tenants: number;
  users: number;
  logs: number;
}> {
  const tenantIds = [...createdTenantIds];
  return {
    tenants: await prisma.tenant.count({ where: { name: { startsWith: TAG } } }),
    users: await prisma.user.count({ where: { email: { contains: TAG } } }),
    logs: tenantIds.length
      ? await prisma.operationLog.count({
          where: { tenantId: { in: tenantIds } },
        })
      : 0,
  };
}

function registerRequest(body: unknown): Request {
  return new Request('http://test.local/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function post(body: unknown): Promise<{
  status: number;
  json: { created?: boolean; error?: string; tenantId?: string; email?: string };
}> {
  const res = await POST(registerRequest(body));
  const json = (await res.json()) as Awaited<ReturnType<typeof post>>['json'];
  if (json.tenantId) createdTenantIds.add(json.tenantId);
  return { status: res.status, json };
}

const goodInput = (suffix: string) => ({
  tenantName: `${TAG}-${suffix} 工作室`,
  name: '操盘手',
  email: `${TAG}-${suffix}@example.com`,
  password: `Passw0rd${process.pid}`,
});

beforeAll(async () => {
  // 前置洁净：上一轮若异常中断留下同前缀行，先归零（同 pid 重跑才可能撞上）
  expect(await tagCounts()).toEqual({ tenants: 0, users: 0, logs: 0 });
});

afterAll(async () => {
  for (const tenantId of createdTenantIds) {
    await prisma.operationLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  // 第一层（按登记表）：本文件夹具前缀的行全部归零
  const residue = {
    tenants: await prisma.tenant.count({ where: { name: { startsWith: TAG } } }),
    users: await prisma.user.count({ where: { email: { contains: TAG } } }),
  };
  /**
   * 第二层（**不从登记表派生**）：按留痕内容普查——任何写到「我从没登记过的租户」上的
   * 认证留痕都会在这里露出来（登记表只保证"登记了的都清了"，挡不住写歪的那一行）。
   */
  const strayLogs = await prisma.operationLog.count({
    where: { summary: { contains: 'probe-domain.example' } },
  });
  await prisma.$disconnect();
  expect({ ...residue, strayLogs }).toEqual({
    tenants: 0,
    users: 0,
    strayLogs: 0,
  });
});

describe('POST /api/auth/register — 注册即建租户（事务）', () => {
  it('合法注册 → 201 + Tenant/User 同时在场 + 只存 bcrypt 摘要', async () => {
    const input = goodInput('happy');
    const { status, json } = await post(input);
    expect(status).toBe(201);
    expect(json.created).toBe(true);
    expect(json.tenantId).toBeTruthy();

    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    expect(user).not.toBeNull();
    expect(user!.tenantId).toBe(json.tenantId);
    expect(user!.name).toBe('操盘手');
    // 口令只以 bcrypt 摘要形态落库，且明文不等于摘要
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user!.passwordHash).not.toContain(input.password);
    expect(await verifyPassword(input.password, user!.passwordHash!)).toBe(true);

    const tenant = await prisma.tenant.findUnique({
      where: { id: json.tenantId! },
    });
    expect(tenant!.name).toBe(input.tenantName);
  });

  it('注册后同一份凭据能通过真 authorize（自动登录的服务端半边）', async () => {
    const input = goodInput('signin');
    expect((await post(input)).status).toBe(201);

    // 生产装配（Prisma + bcrypt），与 /api/auth 的 Credentials provider 同一条路径
    const { prismaAuthorizeDeps } = await import('../../src/lib/auth');
    const { authorizeCredentials } = await import(
      '../../src/lib/auth/credentials'
    );
    const user = await authorizeCredentials(
      { email: input.email.toUpperCase(), password: input.password },
      prismaAuthorizeDeps,
    );
    expect(user).not.toBeNull();
    expect(user!.tenantId).toBe(
      (await prisma.user.findUnique({ where: { email: input.email } }))!
        .tenantId,
    );
  });

  it('🔒 email 冲突 → 409 明确 4xx（不是 500）且**零残留**（原子性：租户不落单）', async () => {
    const input = goodInput('dup');
    expect((await post(input)).status).toBe(201);

    const dupTenantName = `${input.tenantName}-第二次`;
    const res = await post({ ...input, tenantName: dupTenantName });
    expect(res.status).toBe(409);
    expect(res.json.error).toBe(EMAIL_TAKEN_MESSAGE);

    // 变异锚：把 tenant.create 挪出事务 → 这里会查到一个孤儿租户，本条红
    expect(await prisma.tenant.count({ where: { name: dupTenantName } })).toBe(
      0,
    );
    // 用户仍只有一个（第一次那个）
    expect(
      await prisma.user.count({ where: { email: input.email.toLowerCase() } }),
    ).toBe(1);
  });

  it('🔒 事务内**最后一步**失败 → 前面两张表全部回滚（真 Postgres 事务，不是 mock）', async () => {
    const input = registerInputSchema.parse(goodInput('rollback'));
    const before = await tagCounts();

    /**
     * 用真 `prisma.$transaction`，只把交给回调的 tx 客户端换成代理：`operationLog.create`
     * 必抛。于是 tenant.create / user.create 是**真的写进了这个事务**，然后事务真的回滚。
     *
     * 【为什么不注入假 db 或假 hash】假 db 的回滚是假的（只能证明代码里写了 transaction）；
     * 而 hash 在事务之外算，让它失败根本走不到事务里——那样的测试恒绿且什么都没证。
     */
    const failingDb = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
        prisma.$transaction(async (tx) =>
          fn(
            new Proxy(tx as object, {
              get(target, prop, receiver) {
                if (prop === 'operationLog') {
                  return {
                    create: async () => {
                      throw new Error('注入的留痕失败');
                    },
                  };
                }
                return Reflect.get(target, prop, receiver);
              },
            }),
          ),
        ),
    } as unknown as typeof prisma;

    await expect(
      registerAccount(input, { db: failingDb }),
    ).rejects.toThrow('注入的留痕失败');

    expect(await tagCounts()).toEqual(before);
    expect(
      await prisma.user.count({ where: { email: input.email.toLowerCase() } }),
    ).toBe(0);
  });

  it('邮箱大小写变体不产生第二个账号（normalizeEmail 与唯一约束同口径）', async () => {
    const input = goodInput('case');
    expect((await post(input)).status).toBe(201);
    const res = await post({
      ...input,
      email: input.email.toUpperCase(),
      tenantName: `${input.tenantName}-大写`,
    });
    expect(res.status).toBe(409);
  });
});

describe('入参校验（zod，负向用例）', () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    [
      '口令不足 10 位',
      { ...goodInput('weak1'), password: 'Ab1defgh' },
      WEAK_PASSWORD_MESSAGE,
    ],
    [
      '口令无数字',
      { ...goodInput('weak2'), password: 'OnlyLettersHere' },
      WEAK_PASSWORD_MESSAGE,
    ],
    [
      '口令无字母',
      { ...goodInput('weak3'), password: '1234567890123' },
      WEAK_PASSWORD_MESSAGE,
    ],
  ];

  for (const [name, body, message] of cases) {
    it(`${name} → 400 + 明示文案，且零落库`, async () => {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.json.error).toBe(message);
      expect(
        await prisma.user.count({
          where: { email: String(body.email).toLowerCase() },
        }),
      ).toBe(0);
      expect(
        await prisma.tenant.count({ where: { name: String(body.tenantName) } }),
      ).toBe(0);
    });
  }

  it('邮箱形状非法 / 团队名为空 / 非 JSON → 400 而不是 500', async () => {
    const bad = [
      { ...goodInput('bad1'), email: 'not-an-email' },
      { ...goodInput('bad2'), tenantName: '   ' },
      '{ oops',
    ];
    for (const body of bad) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.json.error).toBeTruthy();
    }
  });
});

describe('🔒 留痕隐私（元数据 only，spec D-4）', () => {
  it('注册落一行 OperationLog：只有事件/结果/邮箱域名', async () => {
    const input = {
      tenantName: `${TAG}-privacy 工作室`,
      email: `${PROBE_LOCALPART}@probe-domain.example`,
      password: PROBE_PASSWORD,
    };
    const { status, json } = await post(input);
    expect(status).toBe(201);

    const logs = await prisma.operationLog.findMany({
      where: { tenantId: json.tenantId! },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actor).toBe(AUTH_AUDIT_ACTOR);
    expect(logs[0].summary).toBe(
      `${AUTH_AUDIT_MARKER} register ok domain=probe-domain.example`,
    );
    expect(logs[0].payloadJson).toEqual({
      event: 'register',
      result: 'ok',
      emailDomain: 'probe-domain.example',
    });
  });

  it('🔒 全表扫描：口令明文 / 口令摘要 / 邮箱本地部分一律不在任何留痕里', async () => {
    // 断言**不从写入点清单派生**：扫整张 OperationLog，任何新增的认证留痕点漏了也会红
    const user = await prisma.user.findUnique({
      where: { email: `${PROBE_LOCALPART}@probe-domain.example` },
      select: { passwordHash: true },
    });
    expect(user?.passwordHash).toBeTruthy();

    const all = await prisma.operationLog.findMany({
      select: { actor: true, summary: true, payloadJson: true },
    });
    const raw = JSON.stringify(all);
    expect(raw, '留痕泄露了口令明文').not.toContain(PROBE_PASSWORD);
    expect(raw, '留痕泄露了口令摘要').not.toContain(user!.passwordHash);
    expect(raw, '留痕泄露了邮箱本地部分').not.toContain(PROBE_LOCALPART);
    // 域名**应当**在（这是设计里保留的那一段元数据）
    expect(raw).toContain('probe-domain.example');
  });
});

/**
 * 【空态语义登记（spec D-4，非缺陷）】
 * 新租户建成后是空的：KOL 池 per-tenant，seed 的 2500 KOL 属 dev 租户。
 * 注册用户首屏看到空态是产品当前语义（数据获取属另批），不是本 feature 的 bug。
 * 这里用一条断言把它固定成**已知且刻意**的行为，防后续验收把它当回归缺陷。
 */
describe('新租户空态（spec 语义，非缺陷）', () => {
  it('注册产生的租户除 User 与注册留痕外无业务数据', async () => {
    const input = goodInput('empty');
    const { json } = await post(input);
    const tenantId = json.tenantId!;
    const [kols, projects, games] = await Promise.all([
      prisma.kol.count({ where: { tenantId } }),
      prisma.project.count({ where: { tenantId } }),
      prisma.game.count({ where: { tenantId } }),
    ]);
    expect({ kols, projects, games }).toEqual({
      kols: 0,
      projects: 0,
      games: 0,
    });
  });
});
