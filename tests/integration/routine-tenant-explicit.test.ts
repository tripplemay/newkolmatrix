// M5-AUTH-RLS F010（spec D-3）— 例程/脚本租户显式化的**行为级**证据（打真库）。
//
// 源码普查（tests/unit/system-context-convergence.test.ts）只能证"写法对了"。
// 这里证的是运行时语义：
//   ① 解析路径通：注册表声明的 slug 经 systemTenantId 能变成真租户 id
//   ② 指名一个不存在的租户 → **抛错**，而不是悄悄回落到 dev
//      —— 这正是 acceptance「某 script 摘显式租户 → throw」的同构证明：
//         收敛后租户只能来自入参，入参不对就没有第二条路可走。
//   ③ 例程真的作用在**被告知的**那个租户上（不是恒作用于某个默认租户）
//
// 【本文件自给自足，不依赖库里预先存在任何租户（修复：CI unit job 红）】
// 初版拿 `dev` 租户当解析对象与对照组。本机绿是因为本机 dev 库早就 seed 过；
// **CI unit job 的库是 migrate 之后的空库**，没有 dev 租户 → tenantIdBySlug 抛 → 3 条红。
// 这与本批 F007 那次 psql 缺陷是同一族：**跨环境形态差**（本机有的东西 CI 没有）。
// 现在改成本文件自建 A / B 两个探针租户：
//   · 解析、执行、对照全用它们 —— 在任何一个刚迁移完的空库上都成立；
//   · 对照组从「dev 零变化」换成「B 零变化」，比原来更强：两边都是本文件自己造的，
//     不受别的测试文件并发写库影响。
// 「dev 租户有没有 seed」是环境准备（seed:kol / seed:projects）的事，不该由这个
// 验证"租户显式化"的文件来断言——那是把两件不同的事绑在一起。
//
// 夹具纪律（M4.7/M4.8 两层）：独一前缀；收尾 ① 按登记 id 精确删 ② 不从登记表派生的前缀普查。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEV_TENANT_SLUG, systemContext, systemTenantId } from '../../src/lib/agent/context';
import { ROUTINES } from '../../src/lib/jobs/scheduler';
import { prisma } from '../../src/lib/db/prisma';

const TAG = `f010-${process.pid}`;
/** A = 被告知的租户（例程应当作用于它）；B = 对照租户（应当一根毫毛都不动）。 */
const SLUG = { a: `${TAG}-a`, b: `${TAG}-b` };
const tenantIds: { a: string; b: string } = { a: '', b: '' };

async function seedProbeTenant(key: 'a' | 'b'): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: { slug: SLUG[key], name: SLUG[key] },
  });
  await prisma.project.create({
    data: {
      tenantId: tenant.id,
      name: `${SLUG[key]}-project`,
      slug: `${SLUG[key]}-project`,
    },
  });
  return tenant.id;
}

beforeAll(async () => {
  tenantIds.a = await seedProbeTenant('a');
  tenantIds.b = await seedProbeTenant('b');
});

afterAll(async () => {
  // ① 按登记 id 精确删
  for (const id of [tenantIds.a, tenantIds.b].filter(Boolean)) {
    await prisma.operationLog.deleteMany({ where: { tenantId: id } });
    await prisma.project.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
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

describe('F010 例程租户解析（真库，自给自足）', () => {
  it('注册表把租户写在了注册处：四条例程声明同一个 slug（= DEV_TENANT_SLUG）', () => {
    // 声明面断言不打库：它问的是"代码里写没写清楚"，与本环境 seed 了什么无关。
    const slugs = ROUTINES.map((r) => r.tenantSlug);
    expect(slugs.every((s) => !!s?.trim())).toBe(true);
    expect(new Set(slugs).size).toBe(1);
    expect(slugs[0]).toBe(DEV_TENANT_SLUG);
  });

  it('解析路径通：systemTenantId(存在的 slug) → 该租户的 id', async () => {
    expect(await systemTenantId(SLUG.a)).toBe(tenantIds.a);
    expect(await systemTenantId(SLUG.b)).toBe(tenantIds.b);
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

  it('例程真的作用在被告知的那个租户上（喂 A → 只扫到 A 的项目，B 一行未动）', async () => {
    const healthScan = ROUTINES.find((r) => r.name === 'health-scan')!;
    const logsBeforeB = await prisma.operationLog.count({ where: { tenantId: tenantIds.b } });

    const result = (await healthScan.run(SLUG.a)) as { scanned: number; logged: number };

    // A 里只有 1 个项目 —— 扫到 1 就是"按告知的租户取数"；
    // 若它偷偷用了别的租户（或某个硬编码默认租户），这里的计数立刻对不上。
    expect(result).toEqual({ scanned: 1, logged: 1 });
    const probeLogs = await prisma.operationLog.findMany({
      where: { tenantId: tenantIds.a },
      select: { summary: true },
    });
    expect(probeLogs).toHaveLength(1);
    expect(probeLogs[0]!.summary).toContain(`${SLUG.a}-project`);
    // 对照租户 B 不该被这次执行碰到一行
    expect(await prisma.operationLog.count({ where: { tenantId: tenantIds.b } })).toBe(
      logsBeforeB,
    );
  });

  it('systemContext 的 actor 带 system: 前缀（无会话面的留痕身份可辨认）', async () => {
    const ctx = await systemContext(SLUG.a);
    expect(ctx.actor).toBe(`system:${SLUG.a}`);
    expect(ctx.tenantId).toBe(tenantIds.a);
  });
});
