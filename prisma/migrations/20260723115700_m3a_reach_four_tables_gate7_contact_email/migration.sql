-- M3-A-REACH-CRM F001（spec §4）：触达四表 + PendingAction 7 态 + Kol.contactEmail
-- expand-contract：只加表 / 加列（全 nullable 或带默认值）/ 枚举加值不删值——回滚到上一
-- IMAGE_TAG 时旧代码不受影响（读不到新列、不认识新枚举值也不崩，D12）。
--
-- 单向回滚说明（如需彻底回退 schema，手工执行；顺序不可颠倒）：
--   DROP TABLE "Signal"; DROP TABLE "Quote"; DROP TABLE "OutreachMessage"; DROP TABLE "OutreachThread";
--   DROP TYPE "ReachStatus"; DROP TYPE "MessageDirection"; DROP TYPE "QuoteStatus";
--   ALTER TABLE "Kol" DROP COLUMN "contactEmail";
--   ALTER TABLE "PendingAction" DROP COLUMN "ticketHash", DROP COLUMN "ticketExpiresAt",
--     DROP COLUMN "ticketUsedAt", DROP COLUMN "decidedAt";
--   PendingActionStatus 新枚举值（executing/failed/rejected/expired）无法原位删除——
--   Postgres 不支持 DROP VALUE；需重建类型（CREATE TYPE new + 列改型 + swap）。expand 语义下
--   保留冗余枚举值无害，正常回退不需要处理。

-- CreateEnum
CREATE TYPE "ReachStatus" AS ENUM ('pending_send', 'sent', 'replied', 'negotiating', 'confirmed');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('draft', 'sent', 'inbound');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('proposed', 'committed', 'rejected');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PendingActionStatus" ADD VALUE 'executing';
ALTER TYPE "PendingActionStatus" ADD VALUE 'failed';
ALTER TYPE "PendingActionStatus" ADD VALUE 'rejected';
ALTER TYPE "PendingActionStatus" ADD VALUE 'expired';

-- AlterTable
ALTER TABLE "Kol" ADD COLUMN     "contactEmail" TEXT;

-- AlterTable
ALTER TABLE "PendingAction" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "ticketExpiresAt" TIMESTAMP(3),
ADD COLUMN     "ticketHash" TEXT,
ADD COLUMN     "ticketUsedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OutreachThread" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kolId" TEXT NOT NULL,
    "status" "ReachStatus" NOT NULL DEFAULT 'pending_send',
    "owner" TEXT NOT NULL DEFAULT 'reach',
    "lastSignalAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "language" TEXT,
    "gateLogId" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "deliverablesJson" JSONB NOT NULL,
    "scope" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'proposed',
    "gateLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kolId" TEXT,
    "projectId" TEXT,
    "threadId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachThread_tenantId_idx" ON "OutreachThread"("tenantId");

-- CreateIndex
CREATE INDEX "OutreachThread_kolId_idx" ON "OutreachThread"("kolId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachThread_projectId_kolId_key" ON "OutreachThread"("projectId", "kolId");

-- CreateIndex
CREATE INDEX "OutreachMessage_tenantId_idx" ON "OutreachMessage"("tenantId");

-- CreateIndex
CREATE INDEX "OutreachMessage_threadId_idx" ON "OutreachMessage"("threadId");

-- CreateIndex
CREATE INDEX "Quote_tenantId_idx" ON "Quote"("tenantId");

-- CreateIndex
CREATE INDEX "Quote_threadId_idx" ON "Quote"("threadId");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_externalId_key" ON "Signal"("externalId");

-- CreateIndex
CREATE INDEX "Signal_tenantId_idx" ON "Signal"("tenantId");

-- CreateIndex
CREATE INDEX "Signal_threadId_idx" ON "Signal"("threadId");

-- AddForeignKey
ALTER TABLE "OutreachThread" ADD CONSTRAINT "OutreachThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachThread" ADD CONSTRAINT "OutreachThread_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "Kol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "OutreachThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "OutreachThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
