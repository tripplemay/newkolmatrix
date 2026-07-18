// AGENT-FOUNDATION F002 — DB schema smoke（prod-shaped，非 mock）
//
// 目的：证明 F002 schema 真实可用（不只是 DDL 存在）——连接、8 张表可查、
// Kol.embedding vector(1024) 可写入并经 cosine(<=>) 检索。用完全 ephemeral 的
// 临时数据并在结束时级联清理，不污染 F004 将灌的 dev tenant / 真实 KOL。
//
// 运行（DATABASE_URL 必须指向已 migrate 的库）：
//   docker compose -f docker-compose.dev.yml up -d
//   npm run db:smoke          # = node --env-file=.env --import tsx scripts/test/db-smoke.ts
//
// 退出码：0 = 全部断言通过；1 = 任一断言失败或异常（database-patterns §7：脚本失败视为 acceptance 不满足）。

import { prisma } from '../../src/lib/db/prisma';

const MARK = '__f002_smoke__';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

/** 生成一个确定性的 1024 维向量字面量（pgvector 文本格式 '[a,b,...]'）。 */
function vectorLiteral(seed: number): string {
  const dims = 1024;
  const arr = new Array(dims);
  for (let i = 0; i < dims; i++) {
    // 确定性、非全零、范围有界；两个不同 seed 生成可区分的向量
    arr[i] = Number((Math.sin((i + 1) * (seed + 1) * 0.001)).toFixed(6));
  }
  return `[${arr.join(',')}]`;
}

async function main(): Promise<void> {
  console.log('[db-smoke] F002 schema 端到端验证开始');

  // 1) 连接 + 8 张业务表可查（证明 client ↔ schema 对齐，无漂移）
  const [tenants, users, kols, projects, games, pending, oplog, handoff] =
    await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.kol.count(),
      prisma.project.count(),
      prisma.game.count(),
      prisma.pendingAction.count(),
      prisma.operationLog.count(),
      prisma.handoff.count(),
    ]);
  console.log(
    `[db-smoke] counts tenant=${tenants} user=${users} kol=${kols} project=${projects} game=${games} pending=${pending} oplog=${oplog} handoff=${handoff}`,
  );
  assert(true, '8 张表均可查询（client 与 schema 对齐）');

  // 2) pgvector 扩展存在 + embedding 列维度 = 1024
  const ext = await prisma.$queryRawUnsafe<Array<{ extversion: string }>>(
    `SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
  );
  assert(ext.length === 1, `pgvector 扩展已装（v${ext[0]?.extversion ?? '?'}）`);
  const coltype = await prisma.$queryRawUnsafe<Array<{ t: string }>>(
    `SELECT format_type(atttypid, atttypmod) AS t FROM pg_attribute
     WHERE attrelid = '"Kol"'::regclass AND attname = 'embedding'`,
  );
  assert(coltype[0]?.t === 'vector(1024)', `Kol.embedding = ${coltype[0]?.t}`);

  // 3) ephemeral 写入：Tenant → User → 两个 Kol（带 vector），最后级联清理
  const tenant = await prisma.tenant.create({
    data: { name: MARK, slug: `${MARK}-${Date.now()}` },
  });
  try {
    const user = await prisma.user.create({
      data: { tenantId: tenant.id, name: MARK, email: `${MARK}-${Date.now()}@local` },
    });
    assert(!!user.id, 'User 可在 Tenant 下创建（FK 生效）');

    // D29 owner + D15 契约位 nullable：创建时不填契约位，owner 填分工标记
    const kolA = await prisma.kol.create({
      data: {
        tenantId: tenant.id,
        canonicalHandle: `${MARK}-a`,
        displayName: `${MARK} A`,
        platform: 'youtube',
        owner: 'Leo',
      },
    });
    const kolB = await prisma.kol.create({
      data: {
        tenantId: tenant.id,
        canonicalHandle: `${MARK}-b`,
        displayName: `${MARK} B`,
        platform: 'twitch',
        owner: 'Ada',
      },
    });
    assert(kolA.audienceDemo === null && kolA.fieldProvenance === null, 'D15 契约位默认 null（不填充）');
    assert(kolA.owner === 'Leo', 'D29 owner 标记可写（非权限，纯字符串）');

    // 4) 向量 round-trip：raw SQL 写入 embedding（Unsupported 列走 raw），cosine 检索
    const vecA = vectorLiteral(1);
    const vecB = vectorLiteral(999);
    await prisma.$executeRawUnsafe(
      `UPDATE "Kol" SET embedding = $1::vector WHERE id = $2`,
      vecA,
      kolA.id,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "Kol" SET embedding = $1::vector WHERE id = $2`,
      vecB,
      kolB.id,
    );

    // 以 vecA 为 query，最近邻应为 kolA（cosine 距离最小）
    const nn = await prisma.$queryRawUnsafe<Array<{ id: string; distance: number }>>(
      `SELECT id, (embedding <=> $1::vector) AS distance
       FROM "Kol"
       WHERE "tenantId" = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 2`,
      vecA,
      tenant.id,
    );
    assert(nn.length === 2, 'cosine 查询返回 2 条带 embedding 的 Kol');
    assert(nn[0]?.id === kolA.id, `cosine 最近邻正确（top-1 = 自身 kolA）`);
    assert(Number(nn[0]?.distance) < Number(nn[1]?.distance), 'cosine 距离排序生效（自身 < 他者）');

    console.log('[db-smoke] ✅ 全部断言通过');
  } finally {
    // 级联清理（Tenant onDelete: Cascade → User/Kol 一并删）
    await prisma.tenant.delete({ where: { id: tenant.id } });
    console.log('[db-smoke] ephemeral 数据已级联清理');
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[db-smoke] ❌ 失败：', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
