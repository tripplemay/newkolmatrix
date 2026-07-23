-- M3-B-DELIVERY F001（spec §4）：交付四表 Deal/Deliverable/GameKey/Payout + 五枚举
-- expand-only：纯新增表与枚举，既有表零改动（M3-A 两步票据 PendingAction 7 态直接复用）——
-- 回滚到上一个 IMAGE_TAG 时旧代码完全不受影响（既不读新表也不认识新枚举，D12）。
--
-- RLS：单租户 dev 不建 policy（AGENT-FOUNDATION D4；既有 17 表同口径），M5 真实认证时统一补。
-- 例外理由登记在 docs/specs/M3-B-DELIVERY-spec.md §4（database-patterns §8 硬要求）。
--
-- 单向回滚说明（如需彻底回退 schema，手工执行；顺序不可颠倒——先子表后父表）：
--   DROP TABLE "Payout"; DROP TABLE "GameKey"; DROP TABLE "Deliverable"; DROP TABLE "Deal";
--   DROP TYPE "PayoutStatus"; DROP TYPE "GameKeyStatus"; DROP TYPE "DeliverableStatus";
--   DROP TYPE "DeliverableKind"; DROP TYPE "DealStatus";
-- 本迁移未修改任何既有表 / 既有枚举，故无 ADD VALUE 类不可逆残留（对比 M3-A 的
-- PendingActionStatus ADD VALUE——那类值无法原位删除）。

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('negotiating', 'signed', 'escrowed', 'delivering', 'completed', 'blocked', 'defaulted');

-- CreateEnum
CREATE TYPE "DeliverableKind" AS ENUM ('content', 'key', 'contract', 'escrow', 'ad_disclosure');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('pending', 'met', 'missing', 'na');

-- CreateEnum
CREATE TYPE "GameKeyStatus" AS ENUM ('reserved', 'distributed');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('prepared', 'released', 'blocked');

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kolId" TEXT NOT NULL,
    "quoteId" TEXT,
    "termsJson" JSONB NOT NULL,
    "contractRef" TEXT,
    "escrowRef" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'negotiating',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "kind" "DeliverableKind" NOT NULL,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'pending',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "evidenceRef" TEXT,
    "verifiedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "keyRef" TEXT NOT NULL,
    "status" "GameKeyStatus" NOT NULL DEFAULT 'reserved',
    "distributedAt" TIMESTAMP(3),
    "gateLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "payee" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "basis" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'prepared',
    "gateLogId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deal_tenantId_idx" ON "Deal"("tenantId");

-- CreateIndex
CREATE INDEX "Deal_kolId_idx" ON "Deal"("kolId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_projectId_kolId_key" ON "Deal"("projectId", "kolId");

-- CreateIndex
CREATE INDEX "Deliverable_tenantId_idx" ON "Deliverable"("tenantId");

-- CreateIndex
CREATE INDEX "Deliverable_dealId_idx" ON "Deliverable"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_dealId_kind_key" ON "Deliverable"("dealId", "kind");

-- CreateIndex
CREATE INDEX "GameKey_tenantId_idx" ON "GameKey"("tenantId");

-- CreateIndex
CREATE INDEX "GameKey_dealId_idx" ON "GameKey"("dealId");

-- CreateIndex
CREATE INDEX "Payout_tenantId_idx" ON "Payout"("tenantId");

-- CreateIndex
CREATE INDEX "Payout_dealId_idx" ON "Payout"("dealId");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "Kol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameKey" ADD CONSTRAINT "GameKey_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
