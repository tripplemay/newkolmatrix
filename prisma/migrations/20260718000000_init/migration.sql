-- AGENT-FOUNDATION F002 init migration
-- pgvector 经自定义 SQL migration 启用（D3：不用 Prisma postgresqlExtensions 预览开关）。
-- 必须先于建表——Kol.embedding = vector(1024) 依赖该扩展存在。
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('pending', 'confirmed', 'executed');

-- CreateEnum
CREATE TYPE "OperationLogKind" AS ENUM ('auto', 'gate', 'block', 'irrev');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "slug" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kol" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "canonicalHandle" TEXT NOT NULL,
    "displayName" TEXT,
    "platform" TEXT,
    "handle" TEXT,
    "profileUrl" TEXT,
    "avatarUrl" TEXT,
    "country" TEXT,
    "language" TEXT,
    "followers" INTEGER,
    "avgViews" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bio" TEXT,
    "embedding" vector(1024),
    "audienceDemo" JSONB,
    "credibility" JSONB,
    "brandSafety" JSONB,
    "dataSource" TEXT,
    "fieldProvenance" JSONB,
    "owner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "slug" TEXT,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "slug" TEXT,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingAction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "harmJson" JSONB NOT NULL,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'pending',
    "confirmationTokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "OperationLogKind" NOT NULL,
    "actor" TEXT,
    "summary" TEXT,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handoff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "fromAgent" TEXT NOT NULL,
    "toAgent" TEXT NOT NULL,
    "artifactType" TEXT,
    "artifactRef" TEXT,
    "summary" TEXT,
    "messagesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Handoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_publicId_key" ON "Tenant"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Kol_publicId_key" ON "Kol"("publicId");

-- CreateIndex
CREATE INDEX "Kol_tenantId_idx" ON "Kol"("tenantId");

-- CreateIndex
CREATE INDEX "Kol_platform_idx" ON "Kol"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "Kol_tenantId_canonicalHandle_key" ON "Kol"("tenantId", "canonicalHandle");

-- CreateIndex
CREATE UNIQUE INDEX "Project_publicId_key" ON "Project"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_publicId_key" ON "Game"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE INDEX "Game_tenantId_idx" ON "Game"("tenantId");

-- CreateIndex
CREATE INDEX "PendingAction_tenantId_idx" ON "PendingAction"("tenantId");

-- CreateIndex
CREATE INDEX "PendingAction_status_idx" ON "PendingAction"("status");

-- CreateIndex
CREATE INDEX "OperationLog_tenantId_idx" ON "OperationLog"("tenantId");

-- CreateIndex
CREATE INDEX "OperationLog_kind_idx" ON "OperationLog"("kind");

-- CreateIndex
CREATE INDEX "Handoff_tenantId_idx" ON "Handoff"("tenantId");

-- CreateIndex
CREATE INDEX "Handoff_projectId_idx" ON "Handoff"("projectId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kol" ADD CONSTRAINT "Kol_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

