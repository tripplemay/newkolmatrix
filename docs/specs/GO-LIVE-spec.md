# GO-LIVE 批次 spec — 全栈首次上线基建（newkolmatrix → deploysvr）

> 用户立意（2026-07-20）：AGENT-FOUNDATION（P0 地基）收官后，把本阶段产物**部署上线**供用户确认。
> 现状：应用已全栈（F001–F010），但部署管线仍是 CICD-VPS「前端-only 时代」的，**无法把全栈应用成功拉起**。本批补齐部署基建缺口，使首次全栈 go-live 可成。
> 权威顺序（冲突时）：用户当前决策 > PRD > 交互原型 v2 及落地规范 > 综合架构合并稿 > 本 spec。

## 1. 背景与目标

### 1.1 已确认现状（部署就绪度评估，2026-07-20）
- ✅ 产品代码 F001–F010 全 done、CI 全绿；`ghcr.io/tripplemay/newkolmatrix:latest` = commit 26ee34b（含全部产品代码）已构建推送。
- ✅ 部署管线骨架在（`ci.yml` / `build-push.yml` / `deploy-prod.yml` / nginx / 回滚，CICD-VPS 交付）。
- ❌ **全栈 go-live 硬阻断**（`docker-compose.prod.yml` 标注「前端-only，无 DB/redis」）：
  1. 无 Postgres+pgvector 服务、无 `DATABASE_URL` / `AIGCGATEWAY_*` env → 所有 Prisma/网关路由运行时 500。
  2. 无迁移/seed 装配 → schema（表 + `CREATE EXTENSION vector`）与 ~2500 KOL seed 都不会跑 → search_kols 空。
  3. app healthcheck 命中 `/admin/dashboards/default`，F008 后此路由 `redirect('/admin/today')` 返回 **307 ≠ 200** → 容器判 unhealthy → `deploy-prod` 健康检查必失败（IA 重构遗留，与视觉基线漂移同类）。

### 1.2 本批目标（一句话）
补齐全栈部署基建（prod compose 加 pgvector Postgres + env + migrate/seed 装配 + 修 healthcheck + 全栈化 deploy-prod/runbook），使**首次全栈 go-live 可成**；部署触发与一次性 VPS 设置仍留人类闸门。

### 1.3 边界（不在本批）
- **纯基建批次，不改任何产品代码**（src/ 下产品逻辑不动；仅 healthcheck 目标路由属基建配置）。
- 部署**触发**（跑 `deploy-prod` workflow）= 人类闸门，不在本批自动执行。
- 首次 go-live **一次性 VPS 人工设置**（DNS / GitHub Secrets / ghcr public / server 放 compose+env_file / nginx / certbot）= 人类闸门，本批只产出**清单 + 命令**供人执行，不代执行。

## 2. 关键设计决策（用户 2026-07-20 确认）

- **D-GL1 · DB 自带容器**：prod compose 内置 **pgvector Postgres 容器**（pg16 + pgvector）+ VPS named volume 持久化。自包含，沿用旧 kolmatrix 同机隔离模式，不引入外部托管库；与旧 kolmatrix、其他 VPS app 全隔离（独立容器名/volume/网络）。
- **D-GL2 · 密钥走 server 端 `.env`（compose 插值 + 单一来源派生）**：`/opt/apps/newkolmatrix/.env`（人工创建，**绝不入 git**）经 compose 同目录 `.env` 变量插值注入 `POSTGRES_PASSWORD` + `AIGCGATEWAY_BASE_URL/API_KEY` 等；`DATABASE_URL` 不手写，由 `POSTGRES_*` **单一来源派生**指向容器网内 `db:5432`（避免密码在两处重复）。repo 只放 `.env.example` 占位。〔F001 实现落定：措辞由早期「env_file 注入 DATABASE_URL」对齐为此，容器内 env 终态与安全属性一致，evaluator O1 记录。〕
- **D-GL3 · migrate/seed 独立 one-shot**：app runner 镜像保持最小（不塞 prisma CLI/脚本/CSV）。新增 **tools 镜像目标 / one-shot compose 服务**（含 prisma CLI + migrations + schema + seed 脚本 + CSV + tsx）跑 `prisma migrate deploy` +（首次）seed。migrate 每次 deploy 幂等；seed 幂等（重复跑不炸、不重复灌）。
- **D-GL4 · 纯基建 + 人类闸门**：不改产品代码；`deploy-prod` 仅手动 workflow_dispatch（harness 铁律：deploy/prod 永留人类闸门）。
- **D-GL5 · healthcheck 修正**：app healthcheck 路由 `/admin/dashboards/default`（307）→ 改为返回 200 的稳定端点（`/admin/today` 或新增轻量 `/api/health`）。选 `/api/health`（不依赖页面渲染、最省，纯基建加一个 route handler 返回 200——判定为基建非产品逻辑）。

## 3. Feature 明细

### F001 — 全栈 prod compose：pgvector Postgres + env 注入 + healthcheck 修复（priority: high, executor: generator）
重写 `docker-compose.prod.yml` 为全栈：加 `db` 服务（pgvector/pg16 镜像 + named volume + `pg_isready` healthcheck）；`app` 服务加 `env_file`（DATABASE_URL 指向 db 服务 + AIGCGATEWAY_*）+ `depends_on: db condition healthy`；修 app healthcheck 至 200 端点（D-GL5，新增 `src/app/api/health/route.ts` 返回 `{ok:true}` 200，`runtime=nodejs`）。同步 `.env.example` 补 prod 所需键。
**acceptance：**
- [ ] `docker-compose.prod.yml` 含 `db`（pgvector）+ `app`，app `env_file` 注入 DATABASE_URL/AIGCGATEWAY_*，`depends_on` db healthy，独立容器名/volume（不碰旧 kolmatrix）。
- [ ] app healthcheck 命中返回 200 的端点（`/api/health`），不再是 307 重定向路由。
- [ ] 本地 `docker compose -f docker-compose.prod.yml up`（用本地 build 或 latest 镜像 + 临时 .env）：app + db 起来、app healthcheck 变 healthy、app 能连 db（打 `/api/health` 200，打一个 Prisma 路由不因缺 DB 500）。
- [ ] 密钥只走 env_file，`.env` 不入 git（`.env.example` 仅占位）。

### F002 — 迁移 + seed 装配（one-shot tools 服务，含 pgvector 扩展 + 幂等 seed）（priority: high, executor: generator）
新增 migrate+seed 机制（D-GL3）：Dockerfile 加 `tools`/`migrate` 目标（或复用 build 阶段产物）含 prisma CLI + `prisma/`（schema+migrations）+ `scripts/seed/`（脚本+CSV）+ tsx；prod compose 加 one-shot 服务跑 `prisma migrate deploy`（建全表 + `CREATE EXTENSION vector` D3 自定义迁移）+ 幂等 seed。**确保/加固 seed 幂等**（重复跑不重复灌、不炸）。
**acceptance：**
- [ ] 本地全栈 compose 跑 migrate/seed one-shot：全表 + pgvector 扩展建好（`\dx` 见 vector、`Kol` 表在）。
- [ ] seed 幂等：连跑两次，第二次不重复灌、不报错；灌后 `Kol` 数 ≈2500 且 embedding 非空。
- [ ] 在 prod 镜像栈内 `search_kols` 有结果（向量检索通）。
- [ ] tools 镜像/服务与 app runner 分离（app runner 仍最小，不含 prisma CLI/脚本/CSV）。

### F003 — deploy-prod 全栈化 + runbook 更新 + 本地 prod-stack 全链路验证（priority: high, executor: generator）
`deploy-prod.yml` 加 migrate/seed 一步（compose run one-shot，deploy 时先迁移再起 app）+ 健康检查等全栈就绪；改写 `docs/dev/deploy.md` 为**全栈首次 go-live runbook**（DB 供给、`DATABASE_URL`/`AIGCGATEWAY_*` 经 env_file、seed 步骤、healthcheck、**一次性人工闸门项清单**）；同步 `.auto-memory/environment.md`。本地用 prod 镜像 + 全栈 compose 起一份，跑 hello-agent e2e 闭环验证。
**acceptance：**
- [ ] `deploy-prod.yml` 含 migrate（+ 首次 seed）步骤，顺序正确（migrate → app up → 健康检查），仍仅手动 workflow_dispatch。
- [ ] `docs/dev/deploy.md` 覆盖全栈首次 go-live 每一步：一次性人工设置清单（DNS/Secrets/ghcr public/server compose+env_file/nginx/cert）+ 日常部署 + 回滚；`environment.md` 与之一致。
- [ ] **本地 prod-stack 全链路验证**：用 prod 镜像 + 全栈 compose（app+db+seed）起栈，hello-agent 闭环通（NL → search_kols → 卡片流；或复用 f010:e2e 指向该栈），闭环无 error。
- [ ] 全程只涉及 newkolmatrix 资源，不碰旧 kolmatrix / 其他 VPS app（runbook 显式声明隔离）。

## 4. 车道与编排（逐 feature 验收）

- **车道：** 默认快车道（同会话）。Planner/Generator 主上下文，Evaluator 以隔离 subagent（fresh context）逐 feature 验收。`role_assignments = null`。
- **逐 feature 验收闸门**（沿用 AGENT-FOUNDATION）：每完成一个 feature → Generator 自测 + commit + CI → 隔离 evaluator 按该 feature acceptance 独立验收（结论原样落盘）→ 转呈用户拍板 → done → 下一 feature。
- **验收形态：** 本批多为 `docker compose` 本地起栈 + 命令行证据（compose up / migrate 输出 / seed 计数 / `search_kols` 结果 / hello-agent e2e）。Evaluator 需能跑 docker（本机）。
- **批次末：** F003 通过后隔离 evaluator 做一次全栈 go-live 就绪回归 + signoff 落 `docs/test-reports/`；**首次真实部署由用户手动触发**（人类闸门），本批不含。

## 5. 依赖链
F001（全栈 compose + healthcheck 端点）→ F002（migrate/seed 装配，需 F001 的 db 服务）→ F003（deploy-prod/runbook/全链路验证，需 F001+F002）。串行。

## 6. 已知下游（不在本批）
- 首次真实 go-live 执行（人类闸门）：一次性 VPS 设置 + 手动 `deploy-prod`。
- CICD-VPS 原「go-live」遗留项在本批基建就绪后由用户闭环。
- 生产可观测性（日志/监控/告警）、备份策略、CDN——后续批次按需。

---
_spec-lock：GO-LIVE，2026-07-20。纯部署基建，不改产品代码；部署触发与一次性 VPS 设置留人类闸门。_
