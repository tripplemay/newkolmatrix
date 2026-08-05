#!/usr/bin/env bash
# M5-AUTH-RLS F007（spec D-5）— 在**已存在**的库上幂等建 kol_app 角色。
#
# 为什么不能只靠 compose 的 initdb 钩子：`/docker-entrypoint-initdb.d/` 只在**数据卷为空**时
# 跑一次。dev / prod 的 pgdata 早就有数据了，那条路径对既有库永远不会触发——所以必须有这个
# 可反复执行的 bootstrap（prod 的人工前置步同样用它，见 docs/dev/deploy.md）。
#
# 用法：
#   npm run db:app-role                      # 本机 dev（默认口令 kol_app_dev_password）
#   KOL_APP_PASSWORD=xxx bash scripts/db/bootstrap-app-role.sh
#   DB_CONTAINER=newkolmatrix-db KOL_APP_PASSWORD=xxx bash scripts/db/bootstrap-app-role.sh   # 生产容器
#
# 执行通道（按序探测，避免"本机没装 psql 就没法建角色"）：
#   1. 本机有 psql 且有 DATABASE_URL → 直连
#   2. 否则 docker exec 进 DB 容器（DB_CONTAINER 显式指定，或按 pgvector 镜像自动找）
#
# 自检口（供回归测试与人工排障）：
#   bash scripts/db/bootstrap-app-role.sh --print-psql-url 'postgresql://u:p@h:5432/db?schema=public'
#   → 打印剥掉 Prisma 专用参数后、真正喂给 psql 的那条连接串，不连库不改任何东西。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/create-app-role.sql"

# Prisma 的连接串里带的是**Prisma 自己的**查询参数，libpq 不认。喂给 psql 会当场失败：
#   psql: error: invalid URI query parameter: "schema"   （CI 实测 exit 2，M5-AUTH-RLS F007 首版缺陷）
# 本机没撞是因为本机没装 psql、走的是 docker exec 通道——两条通道的入参形态不同，
# 只测其中一条就会漏掉这一类问题。故这里显式剥离，并保留 libpq 认识的参数（如 sslmode）。
PRISMA_ONLY_PARAMS='schema|connection_limit|pool_timeout|pgbouncer|socket_timeout|statement_cache_size|sslidentity|sslpassword|connect_timeout_ms'

strip_prisma_params() {
  local url="$1" base query out='' kv key
  case "$url" in
    *\?*) base="${url%%\?*}"; query="${url#*\?}" ;;
    *) printf '%s' "$url"; return 0 ;;
  esac
  local IFS='&'
  for kv in $query; do
    [ -n "$kv" ] || continue
    key="${kv%%=*}"
    if printf '%s' "$key" | grep -Eq "^(${PRISMA_ONLY_PARAMS})$"; then continue; fi
    out="${out:+$out&}$kv"
  done
  printf '%s' "${base}${out:+?$out}"
}

# 自检口：只打印，不连库（回归测试 tests/unit/db-bootstrap-url.test.ts 调它）
if [ "${1:-}" = '--print-psql-url' ]; then
  strip_prisma_params "${2:-}"
  echo
  exit 0
fi

[ -f "$SQL_FILE" ] || { echo "[db] 找不到 $SQL_FILE" >&2; exit 1; }

APP_PASSWORD="${KOL_APP_PASSWORD:-}"
if [ -z "$APP_PASSWORD" ]; then
  APP_PASSWORD="kol_app_dev_password"
  echo "[db] KOL_APP_PASSWORD 未设 → 用本机 dev 默认口令（只对 localhost 容器有效，生产必须显式设置）" >&2
fi

if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  PSQL_URL="$(strip_prisma_params "$DATABASE_URL")"
  echo "[db] 通道：本机 psql + DATABASE_URL（特权连接）"
  exec psql "$PSQL_URL" -v ON_ERROR_STOP=1 -v app_password="$APP_PASSWORD" -f "$SQL_FILE"
fi

CONTAINER="${DB_CONTAINER:-}"
if [ -z "$CONTAINER" ]; then
  CONTAINER="$(docker ps --filter ancestor=pgvector/pgvector:pg16 --format '{{.Names}}' | head -n 1 || true)"
fi
if [ -z "$CONTAINER" ]; then
  # 兜底：任何名字/镜像里带 postgres|pgvector 的运行中容器（CI 的 service 容器名是随机哈希，
  # 镜像 tag 也可能不是 pg16——按 ancestor 精确匹配会漏）
  CONTAINER="$(docker ps --format '{{.Names}} {{.Image}}' \
    | grep -Ei 'postgres|pgvector' | head -n 1 | awk '{print $1}' || true)"
fi
if [ -z "$CONTAINER" ]; then
  echo "[db] 既无 psql+DATABASE_URL，也找不到 Postgres 容器。请装 postgresql-client 或设 DB_CONTAINER=<容器名>" >&2
  exit 1
fi

PG_USER="${POSTGRES_USER:-kol}"
PG_DB="${POSTGRES_DB:-kolmatrix}"
echo "[db] 通道：docker exec ${CONTAINER}（psql -U ${PG_USER} -d ${PG_DB}，特权连接）"
docker exec -i "$CONTAINER" psql -U "$PG_USER" -d "$PG_DB" \
  -v ON_ERROR_STOP=1 -v app_password="$APP_PASSWORD" -f - < "$SQL_FILE"
