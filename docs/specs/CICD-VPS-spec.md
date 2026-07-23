# CICD-VPS — CI + Docker CD 到 VPS 规格

> **批次 ID：** CICD-VPS
> **类型：** 基础设施批次（CI/CD 配置 + 上线执行）
> **Spec lock：** 2026-07-14，Planner Andy，用户批准（并授权 Andy 代执行全部部署操作）
> **参照：** 旧 kolmatrix（`tripplemay/kolmatrix`）已在本 VPS 跑通的 Docker CI/CD（`/opt/apps/kolmatrix/.github/workflows/`）

---

## 1. 背景与目标

DS-FOUNDATION 完成后，用户需要 CI（push 自动检查）+ CD（Docker 部署到 VPS）以便**在线上逐版本验收**后续重构版本。

**探查到的 VPS 现状（real values，Planner 铁律 1 已核）：**
- 共享多应用服务器：`deploysvr`（IP 存于 GitHub Secrets / 本地钥匙串，不入 git），Ubuntu 24.04.4 · Node 20.20 · PM2 7 · nginx 1.24(active) · Docker 29 · rsync · 4 CPU / 7.8G RAM / 111G 空闲
- **旧 kolmatrix 已在跑**：docker compose（`kolmatrix-app-1`→:3001 healthy + postgres + redis），域名 `kol.guangai.ai`(HTTPS)，目录 `/opt/apps/kolmatrix`，仍是旧 repo。**本批次全程不碰它及其他 app**（nextpanel/aigc/tokenizer/invoce/apify）
- 已占端口：3000/3001/3003/3004/3010/3100/3200/3201/3205/8000/8021/5432/5433/6379…
- 旧 repo 有成熟 Docker CI/CD 到同一 VPS（build-push→ghcr / deploy-prod→appleboy ssh-action compose pull+up），secret 名 `PROD_HOST`/`PROD_USER`/`PROD_SSH_KEY`

**目标：** 复用旧 repo 的 Docker CI/CD 模式，让 newkolmatrix push 后自动 CI + 构建镜像推 ghcr，手动触发部署到**新子域名 newkol.guangai.ai（端口 3300）**，与旧 kolmatrix 共存。

---

## 2. 关键设计决策（real values）

| # | 决策 | 值 |
|---|---|---|
| D1 | 部署目标 | 新子域名 `newkol.guangai.ai`，与旧 `kol.guangai.ai` 共存，旧版不动 |
| D2 | 容器端口 | 宿主 `127.0.0.1:3300` → 容器 `:3000`（3300 现空闲） |
| D3 | 部署目录 | `/opt/apps/newkolmatrix`（与 `/opt/apps/kolmatrix` 并列） |
| D4 | 运行时 | Docker（Next standalone 镜像），契合 VPS 惯例 + 旧 kolmatrix |
| D5 | 镜像仓库 | `ghcr.io/tripplemay/newkolmatrix`（public repo → 免费；包设 public 供 VPS 免认证 pull） |
| D6 | 部署触发 | production **手动 workflow_dispatch**（harness 铁律：deploy/prod 永留人类闸门；本批用户授权 Andy 代触发首次） |
| D7 | secret 名 | 复用 `PROD_HOST` / `PROD_USER` / `PROD_SSH_KEY`（新 repo 独立配置，值 = deploysvr） |
| D8 | visual baseline | **在 CI/linux 重生**（mac 截图与 linux 字体渲染不 pixel-match；参旧 repo `update-visual-baselines.yml`） |
| D9 | 前端-only | 无 postgres/redis/prisma；compose 单 app 服务；`.env` 极简 |
| D10 | Node | Dockerfile 用 node 20/22-alpine（构建在容器内，与宿主 20.20 兼容） |

---

## 3. 功能范围

**In scope（机件，F001-F007，executor:generator）：** Dockerfile + compose + 3 workflows（ci / build-push / deploy-prod）+ visual regression + 部署文档/nginx conf/env。

**Go-live 执行（§7，Andy 代执行，用户授权）：** DNS A 记录（Cloudflare API，token 取自本地钥匙串）、certbot 证书、GitHub secrets、ghcr 包 public、VPS 部署目录 + docker network、nginx conf 应用、首次部署触发、newkol.guangai.ai 在线验证。

**Out of scope：** 后端/DB（前端-only）；旧 kolmatrix 迁移/切换；kol.guangai.ai 变更；其他 VPS app。

---

## 4. Feature 明细（executor:generator，commit tag `feat(CICD-VPS-F00N):`）

### F001 — Docker 化（priority: high）
- `next.config.js` 加 `output: 'standalone'`
- `Dockerfile`：多阶段（deps → build → runner），node 20/22-alpine，非 root user，copy `.next/standalone` + `.next/static` + `public`，`EXPOSE 3000`，`CMD ["node","server.js"]`
- `.dockerignore`（node_modules/.next/.git/模板目录/tests 等）
- **AC：** 本地 `docker build -t newkolmatrix .` 成功；`docker run -p 3300:3000` 起容器，curl `localhost:3300` 返 200 且渲染 dashboard；镜像瘦（standalone，非全量 node_modules）

### F002 — docker-compose.prod.yml（priority: high）
- 单 `app` 服务：`image: ghcr.io/tripplemay/newkolmatrix:${IMAGE_TAG:-latest}`，`ports: "127.0.0.1:3300:3000"`，`restart: unless-stopped`，`healthcheck`（curl localhost:3000），`env_file: .env`（可选），独立 `container_name: newkolmatrix-app`
- **AC：** `docker compose -f docker-compose.prod.yml config` 校验通过；引用 ghcr 镜像 + 端口 3300 + healthcheck 正确

### F003 — CI 工作流 ci.yml（priority: high）
- `on: push/pull_request` 到 main，`paths-ignore`: `progress.json`/`features.json`/`backlog.json`/`.auto-memory/**`/`docs/**`
- jobs（Node 20，`npm ci`）：`lint`（next lint）、`typecheck`（tsc --noEmit）、`build`（next build）
- **AC：** 合法 YAML；push 后三 job 全绿（Evaluator 在 Actions 核）

### F004 — 视觉回归（priority: medium）
- 装 `@playwright/test`；`playwright.config.ts`；`tests/visual/dashboard.spec.ts` 起 built app 截 dashboard 与 baseline 比对（合理 threshold）
- `.github/workflows/update-visual-baselines.yml`（手动 dispatch）：在 CI/linux 重生 baseline PNG 并 commit（因 mac↔linux 字体差）
- CI 加 `visual` job（装 chromium，起 app，跑视觉比对）
- **AC：** playwright 配置就位；update-visual-baselines 手动跑一次在 linux 生成 `tests/screenshots/baseline/en-dashboard.png` 入库；CI visual job 对齐该 baseline 通过

### F005 — build-push.yml（priority: high）
- `on: push main + workflow_dispatch`；docker/setup-buildx + docker/login(ghcr, `GITHUB_TOKEN`) + docker/build-push-action@v6，`push: true`，tags = `ghcr.io/tripplemay/newkolmatrix:${sha}` + `:latest`；`permissions: packages: write`
- **AC：** 合法 YAML；push 后镜像出现在 ghcr（Evaluator 核 `ghcr.io/tripplemay/newkolmatrix` 有 sha + latest tag）

### F006 — deploy-prod.yml（priority: high）
- `on: workflow_dispatch`（inputs：`image_tag` 默认 latest，回滚填 good SHA）
- `appleboy/ssh-action@v1`（`PROD_HOST`/`PROD_USER`/`PROD_SSH_KEY`）→ `cd /opt/apps/newkolmatrix` → `docker compose -f docker-compose.prod.yml pull` → `up -d` → 健康检查 `curl -f localhost:3300`（失败即非 0 退出）
- **AC：** 合法 YAML；**仅** workflow_dispatch（无 push 触发，防误部署）；SSH/compose/健康检查逻辑正确；不含任何触碰旧 kolmatrix/其他 app 的命令

### F007 — 部署文档 + nginx conf + env（priority: high）
- `docs/dev/deploy.md`：一次性 setup 清单（DNS、certbot、3 secrets、ghcr public、VPS 目录 + network、nginx conf 应用）+ 日常部署流程（push→CI→build-push→手动 deploy-prod）+ 回滚
- `deploy/nginx/newkol.guangai.ai.conf`：80→certbot+301，443 ssl 反代 `127.0.0.1:3300`，`/_next/static/` 缓存，gzip；证书路径 `/etc/letsencrypt/live/newkol.guangai.ai/`
- `.env.example`（前端-only，极简）；`.auto-memory/environment.md` 更新（**只写非敏感**：newkol.guangai.ai / 3300 / 目录 / ghcr；host/key/token 一律不写，注明走 GitHub Secrets + 本地钥匙串）
- **AC：** 文档含全部 setup 步骤可照做；nginx conf 语法正确指向 3300；environment.md 无任何 secret / IP / key

---

## 5. 车道与编排
- 车道：快车道（单机 Andy）
- building：**串行**（配置文件互相依赖：compose 依赖镜像名、deploy 依赖 compose、visual 依赖 playwright）
- verifying：单隔离 evaluator（核 workflow YAML 合法 + CI 绿 + 镜像推 ghcr + 本地 docker build/run + deploy-prod 仅手动且逻辑正确 + 文档完整）
- **注：** `newkol.guangai.ai` 真正在线依赖 §7 go-live（含 DNS/证书/secrets）；验收阶段可核的是「机件正确 + CI/build-push 自动跑绿」，live-site 在 §7 执行后验证

## 6. 验收总纲
- YAML 门：3 workflow `actionlint`/合法
- CI 门：push 后 ci.yml lint+typecheck+build 全绿
- 镜像门：build-push 后 ghcr 有镜像
- 容器门：本地 `docker build` + `docker run` 服务 200
- 安全门：deploy-prod 仅 workflow_dispatch；无触碰旧 app 命令；environment.md 无 secret/IP
- signoff → `docs/test-reports/CICD-VPS-signoff-YYYY-MM-DD.md`

## 7. Go-live 执行（Andy 代执行，用户 2026-07-14 授权 — 铁律 6 记账）
机件验收通过后，Andy 按序执行（**首次部署上线前停下与用户确认一次**）：
1. Cloudflare API（token 取自本地钥匙串，不落盘不打印）建 DNS A 记录 `newkol.guangai.ai` → `<deploysvr host/IP from secret manager>`（proxied 状态与用户确认）
2. GitHub secrets（`gh secret set`）：`PROD_HOST`/`PROD_USER`/`PROD_SSH_KEY`（值来自 deploysvr 部署密钥）
3. VPS：建 `/opt/apps/newkolmatrix`、放 docker-compose.prod.yml + .env、docker network（如需）、apply nginx conf + `nginx -t` + reload
4. certbot 签 `newkol.guangai.ai` 证书（DNS 生效后）
5. ghcr 包 `newkolmatrix` 设 public
6. **[确认点]** 触发首次 `deploy-prod`（或等价 compose up）→ 验证 `https://newkol.guangai.ai` 在线渲染 dashboard
- 全程只操作 newkolmatrix 相关资源，旧 kolmatrix / 其他 app / kol.guangai.ai 不碰
