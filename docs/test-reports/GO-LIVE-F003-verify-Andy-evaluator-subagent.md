# GO-LIVE F003 验收报告 — deploy-prod 全栈化 + runbook + 本地 prod-stack 全链路验证

- **Feature：** F003（deploy-prod.yml 全栈化 + docs/dev/deploy.md 全栈 go-live runbook + environment.md 同步 + f010-e2e E2E_BASE 覆盖 + 本地 prod-stack 全链路验证）
- **待验 commit：** `2200a99`（HEAD `a8d8c7f` = 进入 verifying）
- **Evaluator：** Andy/evaluator-subagent（隔离 fresh context，未参与实现）
- **验收方式：** 亲读 workflow/compose/runbook 配置 + 亲跑 prod 镜像栈全链路 e2e（docker 本机）
- **日期：** 2026-07-20
- **整体结论：** **PASS（4/4 clause）**

---

## 环境前置（L1 排除环境误报）

- docker Server 29.2.1；gh 2.88.1；host 有 `node_modules/playwright`（e2e 从 host 跑）。
- 本地已有 `ghcr.io/tripplemay/newkolmatrix:latest`（runner，380MB，created 2026-07-20T08:47）+ `...-tools:latest`（tools，2.28GB，created 2026-07-20T08:38）。
- **复用判定：** runner 镜像内含 `/api/health` route（`.next/server/app/api/health/route.js`，F001 产物）；tools 镜像内含 `scripts/deploy/migrate-seed.sh`(+x)、`prisma/migrations`（init + pendingaction_input）、`scripts/seed/data/kol-seed-enriched-final.csv`(380569B)、`demo-handoff.ts`、`prisma`/`tsx` bin（F002 产物）。F003 commit **未改任何产品代码**（仅 workflows/docs/e2e-script/env-memory，`git show --stat 2200a99` 确认 5 文件），故复用 F002 本地镜像有效、无来源歧义。
- 真实网关 key 从 repo `.env`（git check-ignore exit 0、未 tracked）取入 **repo 外** scratchpad 临时 env（POSTGRES_PASSWORD 随机 + 真实 AIGCGATEWAY_API_KEY[67 字符] + AIGCGATEWAY_BASE_URL=https://aigc.guangai.ai/v1）；**全程不打印 key 值、验收后 shred**。

---

## 逐条 acceptance 验收

### Clause 1 — deploy-prod.yml 含 migrate（+首次 seed）步骤，顺序正确（migrate→app up→健康检查），仍仅手动 workflow_dispatch → **PASS**

证据（`git show 2200a99 -- deploy-prod.yml` + 亲读 yaml）：
- **仅手动**：`on: workflow_dispatch`（无 push 触发），`concurrency: deploy-prod-newkolmatrix / cancel-in-progress:false`，`environment: production`。符合 harness 铁律「deploy/prod 永留人类闸门」。
- **migrate → app 顺序（经 compose depends_on）**：deploy step 2/3 `$COMPOSE up -d --wait --wait-timeout 600`；compose 内 `app.depends_on.migrate.condition=service_completed_successfully` + `migrate.depends_on.db.condition=service_healthy`。即 db healthy → migrate one-shot（`prisma migrate deploy` + 首次/幂等 seed）exit 0 → app 才起。**实测 up.log 顺序**：`db Healthy → migrate Started → migrate Exited → app Started → app Healthy`，与设计一致。
- **失败 surface migrate 日志**：`if ! $COMPOSE up -d --wait ...; then echo "❌ up 失败——migrate 日志："; $COMPOSE logs --tail 80 migrate; ... exit 1; fi`。
- **健康检查命中 /api/health（非 307）**：step 3/3 `curl -sf http://127.0.0.1:3300/api/health`（10×3s 重试），非 F008 后 307 的 `/admin/dashboards/default`。
- 观察项 O1（不扣分）：migrate 以 compose `depends_on` 声明式编排触发（单条 `up -d --wait`），而非 workflow 里独立 `compose run migrate` 步骤。spec §3 文字与 acceptance「含 migrate 步骤，顺序 migrate→app up」在效果上满足（migrate one-shot 服务由 F002 定义于 compose，depends_on 保证顺序，`--wait` 对 exit-0 one-shot 处理正常、up 返回 0）。此为机制而非缺陷，实测已验证。

### Clause 2 — deploy.md 覆盖全栈首次 go-live 每一步（一次性人工清单 + 日常部署 + 回滚），environment.md 一致 → **PASS**

逐项核对 `docs/dev/deploy.md`（非看标题，逐条对内容）：
- 一次性 setup：① DNS（Cloudflare A 记录 newkol→deploysvr）；② GitHub Secrets（PROD_HOST/PROD_USER/PROD_SSH_KEY）；③ **ghcr 两个包都设 public**（`newkolmatrix` **和** `newkolmatrix-tools`，明确点名两个）；④ VPS 部署目录 + compose + `.env`（`POSTGRES_PASSWORD` + `AIGCGATEWAY_API_KEY`，`chmod 600`，声明 DATABASE_URL 由 POSTGRES_* 派生不手写）；⑤ nginx（先 `nginx -t` 不 reload，等证书）；⑥ certbot（DNS 生效后签发 + reload）。**六项人工闸门全覆盖**。
- 日常部署：push→ci+build-push（app+tools 两镜像 tag=sha）→手动 deploy-prod→`up -d --wait` 先 migrate 后 app→`/api/health`。
- 迁移/seed 说明：depends_on `migrate service_completed_successfully`，migrate 每次幂等，seed 仅首次（Kol 空时灌 ~2500，数分钟，`--wait-timeout 600`）。
- 回滚：deploy-prod `image_tag` 填上一个 good SHA。
- 隔离声明：拓扑表 + §安全「所有命令只作用 newkolmatrix 资源，旧 kolmatrix 与其他 app 不受影响」。
- **environment.md 一致性**：拓扑（app 127.0.0.1:3300→:3000 + db pgvector/pg16 卷 newkolmatrix-pgdata 不暴露端口 + migrate 一次性）、两镜像命名、`.env`(POSTGRES_PASSWORD+AIGCGATEWAY_API_KEY)、`up -d --wait 先 migrate 后 app`、旧 kolmatrix 共存不碰——均与 deploy.md 对齐。

### Clause 3 — 本地 prod-stack 全链路验证：prod 镜像 + 全栈 compose 起栈跑 hello-agent 闭环通、无 error → **PASS（核心，亲跑）**

亲起 prod 栈（复刻 deploy-prod 同款 `up -d --wait --wait-timeout 600`）实测：
- **起栈收敛**：后台 `up --wait` 退出码 0；db healthy → migrate exited(0) → app healthy。
- **migrate/seed**：migrate 日志 26 批真实 bge-m3 embedding 累计 2524/2524；**独立直连 db 取证**（不依赖 seed 日志）`SELECT count(*), count(embedding)` = **2524 / 2524**，`pg_extension vector` = **0.8.5**。
- **向量检索（search_kols）通**：seed cosine sanity `query="World of Tanks 坦克世界 游戏解说 replay"` top-5 语义相关（The Best Replays WoT d=0.3098 … 单调递增）。
- **灌 demo-handoff**（栈内 tools 服务 `run --rm --entrypoint sh migrate -c "node --import tsx scripts/seed/demo-handoff.ts"`）→ 独立核对 Handoff 表 = 1 条 `match->reach`。
- **app 存活**：`curl /api/health` HTTP=200 `{"ok":true}`。
- **hello-agent e2e（`E2E_BASE=http://127.0.0.1:3300 node scripts/test/f010-e2e-check.mjs`）= 6 通过 / 0 失败**：
  1. ✓ match 环节常驻专家头「匹配 Agent」（route→人格）
  2. ✓ NL → 流式 loop → search_kols → KOL 卡片流在画布渲染（闭环）
  3. ✓ 画布渲染 ≥1 张候选卡（**实得 15 张**）
  4. ✓ reach 环节专家头切「触达 Agent」（≠匹配 Agent，人格随 route 切换）
  5. ✓ 协同交接可视化渲染一次 handoff（匹配 Agent→触达 Agent，来自 Handoff 表）
  6. ✓ 闭环无 console error（捕获 0 条）
- **E2E_BASE 覆盖**（F003 引入）：`f010-e2e-check.mjs` L12 `const BASE = process.env.E2E_BASE || 'http://localhost:3000'`，本次由 `E2E_BASE=http://127.0.0.1:3300` 指向 prod 栈生效。

### Clause 4 — 全程只涉 newkolmatrix 资源，隔离旧 kolmatrix/其他 app（runbook 显式声明） → **PASS**

- 起栈前基线：仅 `newkolmatrix-dev-pgdata` 卷存在（dev，不动），无 prod 栈遗留。
- 全程只操作 `docker-compose.prod.yml` 定义的 newkolmatrix-app/db/migrate + 卷 newkolmatrix-pgdata + 网络 newkolmatrix_default。
- **拆栈 `down -v`**：prod 三容器移除、卷 newkolmatrix-pgdata 移除、网络移除；`newkolmatrix-dev-pgdata` **保留**（只删 prod 卷）。
- **隔离核对**：旧 `kolmatrix-postgres` / `kolmatrix-redis` / `invoce-postgres-1` / `invoce-redis-1` 全程 `Up 6 days (healthy)` 未受扰动。
- runbook 显式声明隔离（deploy.md §拓扑 + §安全 + environment.md §旧 kolmatrix 共存不碰）。

---

## 观察项汇总

- **O1（不扣分）**：deploy-prod 的 migrate 步骤以 compose `depends_on` 声明式编排触发（`up -d --wait` 单条命令），非 workflow 内独立 `compose run migrate`。效果满足 acceptance「migrate→app up→健康检查」顺序，且 `--wait` 对 exit-0 one-shot 处理正常（实测 up.log + up 退出码 0）。机制而非缺陷。

## 安全

- 真实网关 key 全程不打印、临时 env 落 repo 外 scratchpad、验收后 `shred -u`；up.log 无明文 key；repo 无 `.env` 泄漏（`git status` 无新增敏感文件）。

## 结论

F003 **4/4 clause PASS**，首轮 verifying 即通过，无 FAIL/PARTIAL。判定转呈用户拍板。本 subagent 不改 status/completed_features/features.json/产品代码。
</content>
</invoke>
