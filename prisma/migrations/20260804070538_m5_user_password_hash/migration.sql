-- M5-AUTH-RLS F001（spec D-1）— User expand 迁移：+passwordHash（bcrypt cost 12 摘要）。
-- 纯 expand：只加一列且 nullable，不动既有行、不加约束、不改类型 → 旧镜像与新镜像可同时跑，
-- 回滚即「不再写该列」，无需 down 迁移。RLS / 非特权角色 SQL 不在本迁移（F008/F009 面）。
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT;
