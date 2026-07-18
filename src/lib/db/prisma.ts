// AGENT-FOUNDATION F002 — Prisma client 单例
//
// Next.js dev 下模块热重载会反复 new PrismaClient → 连接风暴。用 globalThis 单例兜底。
// 向量列（Kol.embedding vector(1024)）为 Unsupported 类型，读写走 raw SQL（F004 灌向量 / F005 cosine 检索），
// 不经此 client 的类型化 API——这是 pgvector + Prisma 的既定分工（D3）。

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
