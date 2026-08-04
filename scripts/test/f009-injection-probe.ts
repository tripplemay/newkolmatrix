// M5-AUTH-RLS F009 —— **开工前探针，不是实现**（pre-impl-adjudication；裁决见
// docs/specs/M5-AUTH-RLS-F009-preimpl-audit.md）。
//
// 目的：在真库、真 RLS（F008 已落）、真 kol_app 连接（F007 已建）上，实测 spec D-7
// 「单例 client extension 每操作事务内 set_config」这一机制假设是否成立。
// 结论不靠读 Prisma 文档，靠这里的输出——报告里每条断言都对应下面某个 case 的一行打印。
//
// 跑法（零外呼、零 schema 改动；只在 dev 租户下建/删一行探针 Project）：
//   node --env-file=.env --import tsx scripts/test/f009-injection-probe.ts
//
// 需要两条连接：DATABASE_URL（特权，看全局真相）+ DATABASE_URL_APP（kol_app，受 RLS 约束）。

import { PrismaClient } from '@prisma/client';

const appUrl = process.env.DATABASE_URL_APP;
const privilegedUrl = process.env.DATABASE_URL;
if (!appUrl || !privilegedUrl) {
  throw new Error(
    '[f009-probe] 需要 DATABASE_URL（特权）与 DATABASE_URL_APP（kol_app）两条连接串。' +
      '建角色：npm run db:app-role',
  );
}

const app = new PrismaClient({ datasourceUrl: appUrl });
const privileged = new PrismaClient({ datasourceUrl: privilegedUrl });

function say(id: string, verdict: string): void {
  console.log(`[${id}] ${verdict}`);
}

/** spec D-7 字面机制 = Prisma 官方 RLS 范例：每个操作自开一个批量事务，先 set_config 再执行。 */
function extendWithTenant(tenantId: string) {
  return app.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await app.$transaction([
            app.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId),
            query(args),
          ]);
          return result as unknown;
        },
      },
    },
  });
}

async function main(): Promise<void> {
  const devTenant = await privileged.tenant.findUnique({ where: { slug: 'dev' } });
  if (!devTenant) throw new Error('[f009-probe] dev 租户不存在（先 npm run seed:kol）');
  const tenantId = devTenant.id;

  // ── B2 语义层：这三件事都发生在「租户已知」之前 ─────────────────────────────
  const anyUser = await privileged.user.findFirst({ select: { email: true } });
  if (anyUser) {
    const viaPrivileged = await privileged.user.findUnique({
      where: { email: anyUser.email },
      select: { tenantId: true },
    });
    const viaApp = await app.user.findUnique({
      where: { email: anyUser.email },
      select: { tenantId: true },
    });
    say(
      'B2-1 登录查用户',
      `特权=${viaPrivileged ? '命中' : 'null'} / kol_app 无租户变量=${viaApp ? '命中' : 'null'}` +
        `（null ⇒ 登录不可能：租户正是这次查询的产物）`,
    );
  }

  try {
    await app.$transaction(async (tx) => {
      await tx.tenant.create({ data: { slug: `f009probe-${process.pid}`, name: 'probe' } });
    });
    say('B2-2 注册建租户', 'kol_app 下成功（与 F008 policy 预期不符，请复核）');
  } catch (err) {
    const msg = (err as Error).message.replace(/\s+/g, ' ');
    say(
      'B2-2 注册建租户',
      `kol_app 无租户变量下被拒：${/row-level security|42501/i.test(msg) ? 'RLS WITH CHECK 违例' : msg.slice(0, 80)}`,
    );
  }

  const slugLookup = await app.tenant.findUnique({ where: { slug: 'dev' } });
  say(
    'B2-3 slug→租户解析',
    `kol_app 无租户变量 tenant.findUnique(slug=dev) = ${slugLookup ? '命中' : 'null'}` +
      `（null ⇒ systemContext / F010 无会话面在 kol_app 下不可用）`,
  );

  // ── B1 机制层：扩展能覆盖什么、不能覆盖什么 ────────────────────────────────
  const ext = extendWithTenant(tenantId);

  say('B1-1 单次操作', `扩展后 project.findMany 得 ${(await ext.project.findMany({ take: 3 })).length} 行（>0 = 注入生效）`);

  const rawAfter = await app.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM "Project"`,
  );
  say(
    'B1-2 raw SQL 面',
    `紧接着的裸 raw 查询得 ${Number(rawAfter[0]!.n)} 行（0 = $allModels 不覆盖 7 处 raw SQL）`,
  );

  const itx = await ext.$transaction(async (tx) => {
    const inside = await tx.$queryRawUnsafe<Array<{ v: string | null }>>(
      `SELECT current_setting('app.tenant_id', true) AS v`,
    );
    const rows = await tx.project.findMany({ take: 3 });
    return { varInsideTx: inside[0]!.v, rows: rows.length };
  });
  say(
    'B1-3 interactive 事务内',
    `事务连接上的 app.tenant_id=${JSON.stringify(itx.varInsideTx)}，同事务 findMany 却得 ${itx.rows} 行` +
      `（变量为 NULL 而仍有行 ⇒ 查询根本没在这个事务里执行）`,
  );

  const probeName = `f009-atomicity-probe-${process.pid}`;
  try {
    await ext.$transaction(async (tx) => {
      await tx.project.create({ data: { tenantId, name: probeName, slug: probeName } });
      throw new Error('故意抛错：调用方期望整个事务回滚');
    });
  } catch {
    /* 预期路径 */
  }
  const survived = await privileged.project.count({ where: { name: probeName } });
  await privileged.project.deleteMany({ where: { name: probeName } });
  say(
    'B1-4 原子性',
    `调用方事务回滚后那一行仍存在 = ${survived}（1 ⇒ 写操作逃出了调用方事务，$transaction 的原子性被静默废掉）`,
  );

  // ── B3 连接池语义：非事务局部的 set_config 会残留在某条连接上 ────────────────
  await app.$executeRawUnsafe(`SELECT set_config('app.tenant_id', $1, false)`, tenantId);
  const parallel = await Promise.all(Array.from({ length: 12 }, () => app.project.count()));
  say(
    'B3 会话级变量残留',
    `set_config(local=false) 后 12 次并发 count = [${parallel.join(',')}]` +
      `（有非零 ⇒ 变量粘在某条池连接上，后续无关请求可能继承别人的租户上下文）`,
  );
}

main()
  .catch((err) => {
    console.error('[f009-probe] 失败：', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all([app.$disconnect(), privileged.$disconnect()]);
  });
