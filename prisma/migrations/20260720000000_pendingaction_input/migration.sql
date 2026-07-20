-- AGENT-FOUNDATION F009 — PendingAction 加 inputJson（人确认后据此执行，payloadHash 绑定防篡改）
-- AlterTable
ALTER TABLE "PendingAction" ADD COLUMN "inputJson" JSONB;
