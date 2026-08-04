#!/bin/bash
# M5-AUTH-RLS F007（spec D-5）— dev 容器**首次初始化**时建 kol_app 角色。
#
# 由 docker-compose.dev.yml 挂进 /docker-entrypoint-initdb.d/。注意这条路径只在数据卷为空
#（全新 `down -v` 之后）时跑一次；库已存在时走 `npm run db:app-role`（bootstrap 脚本）。
#
# 此刻库里还没有任何业务表（迁移还没跑），所以 create-app-role.sql 的 GRANT ON ALL TABLES
# 是空集——真正兜住后续迁移建出的 23 张表的是同文件里的 ALTER DEFAULT PRIVILEGES。
set -e

psql -v ON_ERROR_STOP=1 \
  -v app_password="${KOL_APP_PASSWORD:-kol_app_dev_password}" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /opt/kolmatrix/db/create-app-role.sql
