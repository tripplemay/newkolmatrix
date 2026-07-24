-- M4-INSIGHT F001（spec §4）：洞察三表 MetricSnapshot/WeeklyReport/ShareLink + ShareLinkScope 枚举
-- expand-only：纯新增三表 + 一枚举，既有 21 表/16 枚举零改动——回滚到上一个 IMAGE_TAG 时
-- 旧代码完全不受影响（既不读新表也不认识新枚举，D12）。
--
-- RLS：单租户 dev 不建 policy（AGENT-FOUNDATION D4；既有 21 表同口径），M5 真实认证时统一补。
-- 例外理由登记在 docs/specs/M4-INSIGHT-spec.md §4（database-patterns §8 硬要求）。
--
-- ShareLink.projectId / gateLogId 均软引用不强 FK（D13 先例）：分享一经生成即暴露，
-- 记录不随 Project 删除消失（对外暴露事实独立于项目生命周期，architecture §9.3.1）。
--
-- 单向回滚说明（如需彻底回退 schema，手工执行；先表后枚举）：
--   DROP TABLE "ShareLink"; DROP TABLE "WeeklyReport"; DROP TABLE "MetricSnapshot";
--   DROP TYPE "ShareLinkScope";
-- 三表相互无 FK 依赖（仅 MetricSnapshot/WeeklyReport → Project），上述顺序任意可行；
-- 本迁移未修改任何既有表 / 既有枚举，无 ADD VALUE 类不可逆残留。

-- CreateEnum
CREATE TYPE "ShareLinkScope" AS ENUM ('project', 'quarterly');

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "spend" DECIMAL(14,2),
    "currency" TEXT,
    "spendSource" TEXT,
    "reach" INTEGER,
    "conversions" INTEGER,
    "roi" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "period" TEXT NOT NULL,
    "draftContent" TEXT NOT NULL,
    "adopted" BOOLEAN NOT NULL DEFAULT false,
    "adoptedAt" TIMESTAMP(3),
    "generatedBy" TEXT NOT NULL DEFAULT 'insight',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "scope" "ShareLinkScope" NOT NULL,
    "payloadRef" TEXT NOT NULL,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "gateLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricSnapshot_tenantId_idx" ON "MetricSnapshot"("tenantId");

-- CreateIndex
CREATE INDEX "MetricSnapshot_projectId_date_idx" ON "MetricSnapshot"("projectId", "date");

-- CreateIndex
CREATE INDEX "WeeklyReport_tenantId_idx" ON "WeeklyReport"("tenantId");

-- CreateIndex
CREATE INDEX "WeeklyReport_projectId_idx" ON "WeeklyReport"("projectId");

-- CreateIndex
CREATE INDEX "ShareLink_tenantId_idx" ON "ShareLink"("tenantId");

-- CreateIndex
CREATE INDEX "ShareLink_projectId_idx" ON "ShareLink"("projectId");

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
