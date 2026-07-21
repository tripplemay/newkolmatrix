-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('brief', 'match', 'reach', 'delivery', 'insight');

-- AlterTable
ALTER TABLE "OperationLog" ADD COLUMN     "payloadJson" JSONB,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "budgetTotal" DECIMAL(14,2),
ADD COLUMN     "cur" "Stage" NOT NULL DEFAULT 'brief',
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "gameId" TEXT,
ADD COLUMN     "goal" JSONB,
ADD COLUMN     "market" TEXT,
ADD COLUMN     "maxReached" "Stage" NOT NULL DEFAULT 'brief';

-- CreateIndex
CREATE INDEX "OperationLog_projectId_idx" ON "OperationLog"("projectId");

-- CreateIndex
CREATE INDEX "Project_gameId_idx" ON "Project"("gameId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
