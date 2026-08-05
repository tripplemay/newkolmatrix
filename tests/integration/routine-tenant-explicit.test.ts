// M5-AUTH-RLS F010（spec D-3）— 例程/脚本租户显式化的**行为级**证据（打真库）。
//
// 源码普查（tests/unit/system-context-convergence.test.ts）只能证"写法对了"。
// 这里证的是运行时语义：
//   ① 注册表声明的 slug 真能解析成租户 id（例程不会因为收敛而在启动时哑火）
//   ② 指名一个不存在的租户 → **抛错**，而不是悄悄回落到 dev
//      —— 这正是 acceptance「某 script 摘显式租户 → throw」的同构证明：
//         收敛后租户只能来自入参，入参不对就没有第二条路可走。
//   ③ 例程执行体拿不到"默认租户"：run 必须被喂一个 slug

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEV_TENANT_SLUG, systemContext, systemTenantId } from '../../src/lib/agent/context';
import { ROUTINES } from '../../src/lib/jobs/scheduler';
import { prisma } from '../../src/lib/db/prisma';

/** 一次性探针租户：用来证明"例程作用在被告知的那个租户上"，而不是恒作用于 dev。 */
const TAG = `f010-${process.pid}`;
let probeTenantId = '';

beforeAll(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: TAG, name: TAG } });
  probeTenantId = tenant.id;
  await prisma.project.create({
    data: { tenantId: probeTenantId, name: `${TAG}-project`, slug: `${TAG}-project` },
  });
});

afterAll(async () => {
  // ① 按登记 id 精确删
  if (probeTenantId) {
    await prisma.operationLog.deleteMany({ where: { tenantId: probeTenantId } });
    await prisma.project.deleteMany({ where: { tenantId: probeTenantId } });
    await prisma.tenant.deleteMany({ where: { id: probeTenantId } });
  }
  // ② 不从登记表派生的普查：按前缀全表搜
  const [tenants, projects, logs] = await Promise.all([
    prisma.tenant.count({ where: { name: { startsWith: TAG } } }),
    prisma.project.count({ where: { name: { startsWith: TAG } } }),
    prisma.operationLog.count({ where: { summary: { contains: TAG } } }),
  ]);
  if (tenants + projects + logs !== 0) {
    throw new Error(`[F010] 夹具残留：tenants=${tenants} projects=${projects} logs=${logs}`);
  }
});

describe('F010 例程租户解析（真库）', () => {
  it('每条例程注册的 tenantSlug 都能解析出真实租户 id', async () => {
    const resolved = await Promise.all(
      ROUTINES.map(async (r) => [r.name, await systemTenantId(r.tenantSlug)] as const),
    );
    for (const [name, tenantId] of resolved) {
      expect(tenantId, `${name} 的租户解析为空`).toMatch(/^\w+$/);
    }
    // 四条当前指向同一个 dev 租户（与注册表声明一致，不是巧合）
    const devId = await systemTenantId(DEV_TENANT_SLUG);
    expect(resolved.map(([, id]) => id)).toEqual(resolved.map(() => devId));
  });

  it('指名不存在的租户 → 抛错，绝不回落 dev（收敛后没有第二条路）', async () => {
    const bogus = `__f010-no-such-tenant-${process.pid}__`;
    await expect(systemTenantId(bogus)).rejects.toThrow(/未找到 tenant/);
    await expect(systemContext(bogus)).rejects.toThrow(/未找到 tenant/);
  });

  it('例程执行体经 run(slug) 拿租户：喂坏 slug 时在碰业务逻辑之前就抛', async () => {
    const healthScan = ROUTINES.find((r) => r.name === 'health-scan');
    expect(healthScan).toBeDefined();
    await expect(healthScan!.run(`__f010-no-such-tenant-${process.pid}__`)).rejects.toThrow(
      /未找到 tenant/,
    );
  });

  it('例程真的作用在被告知的那个租户上（喂探针租户 → 只扫到它的项目，dev 零变化）', async () => {
    const healthScan = ROUTINES.find((r) => r.name === 'health-scan')!;
    const devTenantId = await systemTenantId(DEV_TENANT_SLUG);
    const devLogsBefore = await prisma.operationLog.count({ where: { tenantId: devTenantId } });

    const result = (await healthScan.run(TAG)) as { scanned: number; logged: number };

    // 探针租户里只有 1 个项目 —— 扫到 1 就是"按告知的租户取数"，
    // 若它偷偷用了 dev（当前有 4 个项目）这里立刻对不上
    expect(result).toEqual({ scanned: 1, logged: 1 });
    const probeLogs = await prisma.operationLog.findMany({
      where: { tenantId: probeTenantId },
      select: { summary: true },
    });
    expect(probeLogs).toHaveLength(1);
    expect(probeLogs[0]!.summary).toContain(`${TAG}-project`);
    // dev 租户不该被这次执行碰到一行
    expect(await prisma.operationLog.count({ where: { tenantId: devTenantId } })).toBe(
      devLogsBefore,
    );
  });

  it('systemContext 的 actor 带 system: 前缀（无会话面的留痕身份可辨认）', async () => {
    const ctx = await systemContext(DEV_TENANT_SLUG);
    expect(ctx.actor).toBe(`system:${DEV_TENANT_SLUG}`);
    expect(ctx.tenantId).toBe(await systemTenantId(DEV_TENANT_SLUG));
  });
});
