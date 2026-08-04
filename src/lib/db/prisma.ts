// AGENT-FOUNDATION F002 — Prisma client 单例
//
// Next.js dev 下模块热重载会反复 new PrismaClient → 连接风暴。用 globalThis 单例兜底。
// 向量列（Kol.embedding vector(1024)）为 Unsupported 类型，读写走 raw SQL（F004 灌向量 / F005 cosine 检索），
// 不经此 client 的类型化 API——这是 pgvector + Prisma 的既定分工（D3）。

import { PrismaClient } from '@prisma/client';
import { resolveRuntimeDatabaseUrl } from './app-role';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// M5-AUTH-RLS F007（spec D-5）— 应用运行时连接串与迁移连接串分离：
//   DATABASE_URL      特权（kol / postgres）：prisma migrate、seed、既有 vitest 集成测走它，行为不变
//   DATABASE_URL_APP  非特权（kol_app，NOBYPASSRLS）：RLS policy 对它真实生效
// 单例只在 `DB_APP_ROLE_RUNTIME=1` 时才切过去（理由见 app-role.ts：租户变量注入未落地前
// 切过去 = 全查询零行）。刻意**不改 schema.prisma 的 datasource**：那会连 `prisma migrate`
// 的连接一起改掉，而迁移必须保持特权（D-5：建表 / 建 policy 需要 owner 权限）。
const appDatabaseUrl = resolveRuntimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(appDatabaseUrl ? { datasourceUrl: appDatabaseUrl } : {}),
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
