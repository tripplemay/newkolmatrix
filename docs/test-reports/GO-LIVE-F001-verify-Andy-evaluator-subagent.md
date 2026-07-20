# GO-LIVE F001 独立验收报告 — 全栈 prod compose（pgvector + env 注入 + healthcheck 修复）

- **Feature：** F001（全栈 prod compose：pgvector Postgres + env 注入 + healthcheck 修复）
- **验收轮次：** 首轮 verifying
- **验收对象 commit：** `6ec384d` feat(GO-LIVE-F001)
- **Evaluator：** Andy/evaluator-subagent（隔离 fresh context，未参与实现）
- **验收方式：** 亲自读配置 + 亲自跑 docker compose 起全栈（colima linux/arm64，Compose 5.1.1）
- **整体判定：`PASS`（4/4 clause PASS，2 条观察项如实记录，见 §3）**
- **日期：** 2026-07-20

---

## 1. 待验对象（磁盘取证）

| 文件 | 关键行 |
|---|---|
| `docker-compose.prod.yml` | db 服务 L10–25；app 服务 L27–51；volumes L53–55 |
| `src/app/api/health/route.ts` | `runtime='nodejs'` L8；`GET` 返 `{ok:true}` 200 L11–13 |
| `.env.example` | 生产段 L33–42（仅占位） |

---

## 2. 独立验证执行链（真实命令输出片段）

### 2.1 compose config 插值校验（`--env-file` 临时 env）
临时 env 仅含 `POSTGRES_PASSWORD=eval_test_pw_9f3a21bc` + `AIGCGATEWAY_API_KEY=pk_eval_dummy_not_a_real_key`（非真实 key；F001 存活/连通不需真 key）。

```
services:
  app:
    environment:
      AIGCGATEWAY_API_KEY: pk_eval_dummy_not_a_real_key
      AIGCGATEWAY_BASE_URL: https://aigc.guangai.ai/v1
      DATABASE_URL: postgresql://kol:eval_test_pw_9f3a21bc@db:5432/kolmatrix?schema=public   # 指向容器网 db:5432，密码单一来源派生
    depends_on:
      db: { condition: service_healthy }
    healthcheck.test: node -e "...http.get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1))..."   # 命中 /api/health，非 /admin/dashboards/default
  db:
    image: pgvector/pgvector:pg16
    healthcheck.test: pg_isready -U kol -d kolmatrix
    # db 无 ports 段（不暴露宿主端口）
networks: { default: { name: newkolmatrix_default } }
volumes:  { newkolmatrix-pgdata: { name: newkolmatrix-pgdata } }
```

### 2.2 镜像来源（独立重建）
spec §1.1 记 ghcr `latest` = commit `26ee34b`（在 F001 commit 之前，不含 `/api/health`）。为消除镜像来源歧义，从当前 HEAD `6ec384d` 源码**重建**并按 compose 期望打 tag：
```
Successfully built 2b04261ef6b5
Successfully tagged ghcr.io/tripplemay/newkolmatrix:latest   # 58s，含 /app/.next/server/app/api/health/route.js
```

### 2.3 起栈（`up -d`）
```
Container newkolmatrix-db  Started
Container newkolmatrix-db  Waiting → Healthy      # depends_on 生效：db healthy 后 app 才启动
Container newkolmatrix-app Started
# ps:
newkolmatrix-app  ...  Up (health: starting)  127.0.0.1:3300->3000/tcp
newkolmatrix-db   ...  Up (healthy)           5432/tcp        # 仅容器端口，无宿主映射
```

### 2.4 app 存活 + healthcheck
```
curl http://127.0.0.1:3300/api/health   →  {"ok":true}   HTTP_STATUS=200
docker inspect --format '{{.State.Health.Status}}' newkolmatrix-app  →  healthy
```

### 2.5 app→db 连通 + 容器内 env
```
docker exec newkolmatrix-app printenv DATABASE_URL
  → postgresql://kol:eval_test_pw_9f3a21bc@db:5432/kolmatrix?schema=public
printenv NODE_ENV / AIGCGATEWAY_BASE_URL / AIGCGATEWAY_API_KEY
  → production / https://aigc.guangai.ai/v1 / pk_eval_dummy_not_a_real_key
docker exec newkolmatrix-app node -e "net.connect(5432,'db')..."
  → TCP_OK db:5432 reachable
```

### 2.6 db pgvector + 不暴露宿主端口
```
psql -tAc "SELECT default_version FROM pg_available_extensions WHERE name='vector'"  → 0.8.5   # pgvector 就绪（F002 才 CREATE EXTENSION）
docker inspect newkolmatrix-db --format '{{json .NetworkSettings.Ports}}'  → {"5432/tcp":null}
docker inspect newkolmatrix-db --format '{{json .HostConfig.PortBindings}}' → {}             # 新 db 无宿主端口绑定
# 注：宿主 127.0.0.1:5432 开放属【旧 kolmatrix-postgres 0.0.0.0:5432->5432】，非本栈；本栈 db 未映射宿主端口
```

### 2.7 Prisma 路由行为（区分「缺 DB 连接」vs「缺表 F002」）
```
POST /api/agent {"message":"找美妆KOL"}  → HTTP 500
  {"error":"...PrismaClientKnownRequestError: The table `public.Tenant` does not exist in the current database."}
# app 日志: prisma:error The table public.Tenant does not exist
```
→ 这是**缺表**（F002 迁移未跑）错误，非 DB-连接错误。Prisma 已成功连上 db 并把 query 打到 Postgres 才收到「表不存在」。按 spec 依赖链（§5：F001→F002）与本任务约束，缺表属 F002 范围，**不判 F001 FAIL**。

### 2.8 隔离 + 清理
```
docker compose ... down -v  → app/db/network/volume 全 Removed
docker ps -a | grep newkolmatrix-(app|db)  → (clean)
docker volume ls | grep newkolmatrix-pgdata(非 dev)  → (removed)
docker ps | grep '^kolmatrix-'  → kolmatrix-redis Up 6 days / kolmatrix-postgres Up 6 days   # 旧栈未受影响
```

### 2.9 密钥安全
```
git check-ignore .env  → .env（exit 0，被忽略）
git ls-files | grep '\.env$'  → (未 tracked)
git log -p -1 -- .env.example docker-compose.prod.yml | grep -iE 'api_key|password|pk_|sk_'
  → 仅占位符（pk_your_key_here / <强随机口令> / ${POSTGRES_PASSWORD}），无真实密钥硬编码
```

---

## 3. 逐条 acceptance 判定

### Clause 1 — compose 含 db(pgvector)+app、app env 注入 DATABASE_URL/AIGCGATEWAY_*、depends_on db healthy、独立容器名/volume `PASS`
- db=pgvector/pgvector:pg16（L11）、app（L27）；depends_on `condition: service_healthy`（L40–42）实测生效（db healthy 后 app 才起）。
- 容器名 `newkolmatrix-db`/`newkolmatrix-app`（L12/L29）、volume `newkolmatrix-pgdata`（L54–55）、网络 `newkolmatrix_default`——与旧 `kolmatrix-postgres`/`kolmatrix-redis` 全隔离，起栈无冲突、旧栈无扰动。
- **观察项 O1（非缺陷，供裁决）：** 实现用 compose **变量插值**（同目录默认 `.env` / `--env-file`）注入 `POSTGRES_PASSWORD`/`AIGCGATEWAY_API_KEY`，并由 `POSTGRES_PASSWORD` **单一来源派生** `DATABASE_URL`（L37）；spec D-GL2 / acceptance 字面写「`env_file` 注入 DATABASE_URL」。二者机制不同但**可观测终态一致**（容器内 DATABASE_URL/AIGCGATEWAY_* 已正确populated，见 §2.5），且插值派生**避免密码在 .env 重复两处**（生成者注释 L36 已说明），安全属性（密钥仅来自服务器端 gitignore 的 `.env`、repo 只放 `.env.example`）完全保持。判 PASS；建议 Planner 视需要把 spec「env_file 注入」措辞对齐到「compose 同目录 `.env` 插值 + 单一来源派生」。

### Clause 2 — app healthcheck 命中 200 端点 `/api/health`，不再 307 重定向路由 `PASS`
- compose healthcheck 命中 `http://127.0.0.1:3000/api/health`（L43–51），非 `/admin/dashboards/default`。
- 实测 `curl /api/health` → 200 `{"ok":true}`；route 源码 `runtime='nodejs'`（L8）+ `GET` 返 200（L11–13）。healthcheck 实测翻 `healthy`。

### Clause 3 — 本地 up：app+db 起、app healthy、能连 db（/api/health 200、Prisma 路由不因缺 DB 500）`PASS`
- db healthy、app healthy、`/api/health` 200、app→db:5432 TCP 通、容器内 DATABASE_URL 正确（§2.3–2.5）。
- **观察项 O2（F002 依赖，非 F001 缺陷）：** Prisma 路由 `/api/agent` 仍 500，但错误为 `public.Tenant does not exist`（**缺表**，F002 迁移未跑），非「缺 DB 连接」。F001-相关断言（db 可达、DATABASE_URL 正确、无 DB-连接错误）全部满足；缺表按 spec §5 依赖链归 F002。

### Clause 4 — 密钥只走 env、`.env` 不入 git（`.env.example` 仅占位）`PASS`
- `.env` 被 gitignore（check-ignore exit 0）且未 tracked；`.env.example` 生产段（L33–42）仅占位符；末次 commit diff 无真实密钥；`:?` 必填校验（L16/L39）缺 `.env` 时 fail-fast。

---

## 4. 结论

F001 整体 **PASS（4/4 clause PASS）**。全栈 compose 可本地起栈：pgvector db 自带且不暴露宿主端口、app 经服务器端 `.env` 注入正确 env、healthcheck 修至 `/api/health` 200 并实测翻 healthy、app 连通容器网 db:5432、与旧 kolmatrix 完全隔离、密钥不入 git。两条观察项（O1 env_file 机制措辞、O2 Prisma 缺表属 F002）如实记录，均不构成 F001 FAIL/PARTIAL。

> 说明：F001 仅到「app 连通 db（TCP + DATABASE_URL 正确）」；返数据的 Prisma 路由需 F002 迁移建表后才可测，本报告未越界测 F002。
