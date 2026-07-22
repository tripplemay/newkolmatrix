-- CreateEnum
CREATE TYPE "MatchPlanStatus" AS ENUM ('draft', 'approved', 'superseded');

-- CreateEnum
CREATE TYPE "CandidateVerdict" AS ENUM ('pending', 'kept', 'dropped');

-- CreateTable
CREATE TABLE "MatchPlan" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "status" "MatchPlanStatus" NOT NULL DEFAULT 'draft',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanKol" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "kolId" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanKol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchCandidate" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kolId" TEXT NOT NULL,
    "verdict" "CandidateVerdict" NOT NULL DEFAULT 'pending',
    "doubts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preJudge" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION,
    "scorePending" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlan_publicId_key" ON "MatchPlan"("publicId");

-- CreateIndex
CREATE INDEX "MatchPlan_tenantId_idx" ON "MatchPlan"("tenantId");

-- CreateIndex
CREATE INDEX "MatchPlan_projectId_status_idx" ON "MatchPlan"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlanKol_publicId_key" ON "PlanKol"("publicId");

-- CreateIndex
CREATE INDEX "PlanKol_tenantId_idx" ON "PlanKol"("tenantId");

-- CreateIndex
CREATE INDEX "PlanKol_planId_idx" ON "PlanKol"("planId");

-- CreateIndex
CREATE INDEX "PlanKol_kolId_idx" ON "PlanKol"("kolId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchCandidate_publicId_key" ON "MatchCandidate"("publicId");

-- CreateIndex
CREATE INDEX "MatchCandidate_tenantId_idx" ON "MatchCandidate"("tenantId");

-- CreateIndex
CREATE INDEX "MatchCandidate_kolId_idx" ON "MatchCandidate"("kolId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchCandidate_projectId_kolId_key" ON "MatchCandidate"("projectId", "kolId");

-- AddForeignKey
ALTER TABLE "MatchPlan" ADD CONSTRAINT "MatchPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanKol" ADD CONSTRAINT "PlanKol_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MatchPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanKol" ADD CONSTRAINT "PlanKol_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "Kol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCandidate" ADD CONSTRAINT "MatchCandidate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCandidate" ADD CONSTRAINT "MatchCandidate_kolId_fkey" FOREIGN KEY ("kolId") REFERENCES "Kol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
