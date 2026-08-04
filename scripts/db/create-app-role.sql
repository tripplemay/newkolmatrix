-- M5-AUTH-RLS F007（spec D-5）— 非特权应用角色 kol_app（RLS 的硬前置）
--
-- 【为什么必须有这一步】
-- dev / prod 的 DB 用户 `kol` 与 CI 的 `postgres` 都是 SUPERUSER + BYPASSRLS。超级用户
-- **无条件绕过所有 RLS policy**，且不报错——不建非特权角色，F008 那 23 张表的 policy
-- 一条都不会生效，而应用看起来"一切正常"（M5 侦察点名的最大静默风险）。
--
-- 【分工（D-5）】
--   迁移 / seed / 既有 vitest 集成测 → 继续走特权连接 DATABASE_URL（行为完全不变）
--   应用运行时 / RLS 负向套件       → 走 kol_app，连接串在 DATABASE_URL_APP
--
-- 【幂等】可重复执行：角色已存在则只收敛属性与口令，不 DROP、不改任何业务数据。
--
-- 【用法】必须以**特权连接**执行（建角色 + 授权需要 superuser）：
--   npm run db:app-role                                    # 本机 dev（scripts/db/bootstrap-app-role.sh）
--   psql "$DATABASE_URL" -v app_password="$KOL_APP_PASSWORD" -f scripts/db/create-app-role.sql
--   生产：见 docs/dev/deploy.md「M5-AUTH-RLS 部署前置人工步」
--
-- 【执行顺序】建议在 `prisma migrate deploy` 之后跑：第 3 步 GRANT ON ALL TABLES 只覆盖
-- 执行当下已存在的表；第 4 步的 DEFAULT PRIVILEGES 才管未来新表。空库上先跑也可以
--（dev 容器 initdb 路径就是空库先跑），届时靠第 4 步兜住随后迁移建出的表。

\set ON_ERROR_STOP on

-- 1) 角色本体。CREATE 仅在缺失时执行（\gexec 拼串），ALTER 恒执行 → 属性/口令收敛到期望态。
--    NOBYPASSRLS 是本文件存在的全部理由；NOCREATEDB / NOCREATEROLE / NOREPLICATION 是最小权面。
SELECT 'CREATE ROLE kol_app LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kol_app')
\gexec

ALTER ROLE kol_app
  WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD :'app_password';

-- 2) 连接与 schema 可见性
GRANT CONNECT ON DATABASE :"DBNAME" TO kol_app;
GRANT USAGE ON SCHEMA public TO kol_app;

-- 3) 常规 DML。**不给** DDL / TRUNCATE / REFERENCES：应用运行时不建表、不改表结构，
--    也不许 TRUNCATE（TRUNCATE 不受 RLS 约束，给了等于开一扇绕过隔离的后门）。
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kol_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kol_app;

-- 4) 未来由迁移连接（= 当前执行者）新建的表/序列自动带同样授权。
--    没有这条，每加一张表都要人工补 GRANT，漏一次 = 应用运行时 42501 permission denied。
ALTER DEFAULT PRIVILEGES FOR ROLE :"USER" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kol_app;
ALTER DEFAULT PRIVILEGES FOR ROLE :"USER" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kol_app;

-- 5) 自证：属性不符期望就让整条脚本失败，而不是"建完了但仍是特权角色"。
DO $$
DECLARE r record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcanlogin
    INTO r FROM pg_roles WHERE rolname = 'kol_app';
  IF r IS NULL THEN
    RAISE EXCEPTION 'kol_app 角色不存在（CREATE ROLE 未生效）';
  END IF;
  IF r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR NOT r.rolcanlogin THEN
    RAISE EXCEPTION 'kol_app 属性不符 D-5 期望：super=% bypassrls=% createdb=% canlogin=%',
      r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcanlogin;
  END IF;
END $$;

\echo '[db] kol_app 就绪：NOSUPERUSER NOBYPASSRLS NOCREATEDB + public schema 常规 DML'
