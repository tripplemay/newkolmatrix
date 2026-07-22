-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('lore', 'art', 'gameplay_doc', 'review', 'data', 'video');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('pending', 'parsing', 'parsed', 'failed');

-- CreateEnum
CREATE TYPE "KnowledgeKind" AS ENUM ('selling_point', 'audience', 'compliance_redline');

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "type" "MaterialType" NOT NULL,
    "source" TEXT,
    "fileName" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'pending',
    "parseError" TEXT,
    "parsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameKnowledge" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "kind" "KnowledgeKind" NOT NULL,
    "content" TEXT NOT NULL,
    "structured" JSONB,
    "sourceMaterialIds" TEXT[],
    "confidence" DOUBLE PRECISION,
    "generatedBy" TEXT NOT NULL DEFAULT 'strategy',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Material_publicId_key" ON "Material"("publicId");

-- CreateIndex
CREATE INDEX "Material_tenantId_idx" ON "Material"("tenantId");

-- CreateIndex
CREATE INDEX "Material_gameId_idx" ON "Material"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameKnowledge_publicId_key" ON "GameKnowledge"("publicId");

-- CreateIndex
CREATE INDEX "GameKnowledge_tenantId_idx" ON "GameKnowledge"("tenantId");

-- CreateIndex
CREATE INDEX "GameKnowledge_gameId_kind_idx" ON "GameKnowledge"("gameId", "kind");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameKnowledge" ADD CONSTRAINT "GameKnowledge_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
