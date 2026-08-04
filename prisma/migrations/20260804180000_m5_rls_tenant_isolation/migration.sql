-- M5-AUTH-RLS F008（spec D-6）— 行级安全：23 张带 tenantId 的表 + Tenant 自身。
--
-- 【policy 形状】USING / WITH CHECK 双侧同式（列名按 Prisma 实物驼峰带引号）：
--     "tenantId" = current_setting('app.tenant_id', true)
--   · 读侧 USING：查不到别的租户的行；
--   · 写侧 WITH CHECK：也**写不进**别的租户（否则 A 可以往 B 名下插数据，读隔离等于白做）。
--   · 第二参数 true = missing_ok：变量没设时返回 NULL 而不是报错，`tenantId = NULL` → NULL
--     → 既不为真也不为假 → **零行（default deny）**。这就是"没注入租户上下文就什么都看不见"的锚点。
--   · Tenant 表按自己的 id 隔离（用户只看得见自己那一行租户）。
--
-- 【谁受约束】policy 默认 TO PUBLIC。SUPERUSER 与 BYPASSRLS 角色**无条件绕过**——
--   dev/prod 的 kol、CI 的 postgres 因此完全不受影响（迁移、seed、既有 135 个测试文件行为不变，D-8）；
--   真正被约束的是 F007 建的 kol_app（NOSUPERUSER NOBYPASSRLS）。
--
-- 【刻意不加 FORCE ROW LEVEL SECURITY】表 owner（kol）需要保留绕过能力：迁移、seed、
--   运维脚本、既有集成测试都在 owner 连接上跑。加 FORCE 会把它们一并锁死，等于在本批
--   顺手翻修 123 个测试文件——那不在本批范围（D-8 明文）。
--
-- 【回滚安全】本迁移是纯 expand：不建表、不改列、不动一行数据，只加 policy 元数据。
--   回滚到上一个镜像（旧代码 + 特权连接）时，policy 对特权连接不生效，行为与迁移前完全一致。
--   要彻底撤销：对每张表 `ALTER TABLE "X" DISABLE ROW LEVEL SECURITY;`（policy 留着无害）。
--
-- 【幂等】ENABLE 可重复执行；policy 先 DROP IF EXISTS 再 CREATE。

-- ── Tenant 自身：按 id 隔离 ──
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Tenant";
CREATE POLICY "tenant_isolation" ON "Tenant"
  USING ("id" = current_setting('app.tenant_id', true))
  WITH CHECK ("id" = current_setting('app.tenant_id', true));

-- ── 带 tenantId 的业务表（23 张，与 prisma/schema.prisma 实物一一对应）──

ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Deal";
CREATE POLICY "tenant_isolation" ON "Deal"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Deliverable" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Deliverable";
CREATE POLICY "tenant_isolation" ON "Deliverable"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Game" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Game";
CREATE POLICY "tenant_isolation" ON "Game"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "GameKey" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "GameKey";
CREATE POLICY "tenant_isolation" ON "GameKey"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "GameKnowledge" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "GameKnowledge";
CREATE POLICY "tenant_isolation" ON "GameKnowledge"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Handoff" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Handoff";
CREATE POLICY "tenant_isolation" ON "Handoff"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Kol" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Kol";
CREATE POLICY "tenant_isolation" ON "Kol"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "MatchCandidate" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "MatchCandidate";
CREATE POLICY "tenant_isolation" ON "MatchCandidate"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "MatchPlan" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "MatchPlan";
CREATE POLICY "tenant_isolation" ON "MatchPlan"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Material" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Material";
CREATE POLICY "tenant_isolation" ON "Material"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "MetricSnapshot" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "MetricSnapshot";
CREATE POLICY "tenant_isolation" ON "MetricSnapshot"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "OperationLog" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "OperationLog";
CREATE POLICY "tenant_isolation" ON "OperationLog"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "OutreachMessage" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "OutreachMessage";
CREATE POLICY "tenant_isolation" ON "OutreachMessage"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "OutreachThread" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "OutreachThread";
CREATE POLICY "tenant_isolation" ON "OutreachThread"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Payout" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Payout";
CREATE POLICY "tenant_isolation" ON "Payout"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "PendingAction" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "PendingAction";
CREATE POLICY "tenant_isolation" ON "PendingAction"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "PlanKol" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "PlanKol";
CREATE POLICY "tenant_isolation" ON "PlanKol"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Project";
CREATE POLICY "tenant_isolation" ON "Project"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Quote" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Quote";
CREATE POLICY "tenant_isolation" ON "Quote"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ShareLink" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "ShareLink";
CREATE POLICY "tenant_isolation" ON "ShareLink"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Signal" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "Signal";
CREATE POLICY "tenant_isolation" ON "Signal"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "User";
CREATE POLICY "tenant_isolation" ON "User"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "WeeklyReport" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation" ON "WeeklyReport";
CREATE POLICY "tenant_isolation" ON "WeeklyReport"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
