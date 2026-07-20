# 部署 Runbook — newkolmatrix → deploysvr（newkol.guangai.ai）

> CICD-VPS 批次骨架 + **GO-LIVE 批次全栈化**。CI 自动检查 + 手动 Docker 部署到 VPS。**与旧 kolmatrix（kol.guangai.ai）共存，全程不碰旧 app / 其他 VPS app。**
> **全栈**：app（standalone 运行镜像）+ db（自带 pgvector Postgres 容器）+ migrate（一次性 tools 镜像跑 migrate deploy + 首次/幂等 seed）。

## 拓扑

| 项 | 值 |
|---|---|
| 域名 | `newkol.guangai.ai`（HTTPS） |
| VPS | `deploysvr`（root），nginx 反代 |
| 容器端口 | `127.0.0.1:3300` → app 容器 `:3000` |
| 部署目录 | `/opt/apps/newkolmatrix`（放 `docker-compose.prod.yml` + `.env`） |
| app 镜像 | `ghcr.io/tripplemay/newkolmatrix:{sha\|latest}`（runner，最小） |
| tools 镜像 | `ghcr.io/tripplemay/newkolmatrix-tools:{sha\|latest}`（migrate/seed 一次性） |
| db | `pgvector/pgvector:pg16` 容器 `newkolmatrix-db` + 卷 `newkolmatrix-pgdata`（不暴露宿主端口） |
| 容器名 | `newkolmatrix-app` / `newkolmatrix-db` / `newkolmatrix-migrate`（一次性） |
| 密钥 | `/opt/apps/newkolmatrix/.env`（人工放，**绝不入 git**）：`POSTGRES_PASSWORD` + `AIGCGATEWAY_API_KEY` |

## 工作流（`.github/workflows/`）

| workflow | 触发 | 作用 |
|---|---|---|
| `ci.yml` | push/PR main | lint + typecheck + build + visual regression |
| `build-push.yml` | push main / 手动 | 构建 **app + tools 两个镜像**推 ghcr（`sha` + `latest`） |
| `deploy-prod.yml` | **仅手动 workflow_dispatch** | SSH deploysvr → compose pull → `up -d --wait`（先 migrate 后 app）→ `/api/health` 健康检查 |
| `update-visual-baselines.yml` | 手动 | 在 CI(linux) 重生视觉 baseline 并 commit |

## 一次性 setup（首次上线前，逐项执行）

1. **DNS**：Cloudflare 加 A 记录 `newkol` → deploysvr 公网 IP（zone `guangai.ai`）。
2. **GitHub Secrets**（newkolmatrix repo → Settings → Secrets → Actions）：
   - `PROD_HOST` = deploysvr 公网 IP
   - `PROD_USER` = 部署用户（如 root）
   - `PROD_SSH_KEY` = deploysvr 部署私钥（PEM 全文）
3. **ghcr 包 public**（两个包都要）：首次 build-push 后，GitHub → Packages → `newkolmatrix` **和** `newkolmatrix-tools` → 各自 Package settings → Change visibility → Public（VPS 免认证 pull）。
4. **VPS 部署目录 + compose + `.env`**：
   ```bash
   ssh deploysvr
   mkdir -p /opt/apps/newkolmatrix && cd /opt/apps/newkolmatrix
   # 放入 docker-compose.prod.yml（从 repo 拷贝）
   # 创建 .env（绝不入 git；见 repo .env.example『生产部署』段）：
   cat > .env <<'EOF'
   POSTGRES_PASSWORD=<强随机口令>
   AIGCGATEWAY_API_KEY=<真实网关 key>
   # 可选：POSTGRES_USER / POSTGRES_DB / AIGCGATEWAY_BASE_URL / IMAGE_TAG
   EOF
   chmod 600 .env
   ```
   > `DATABASE_URL` 无需手写：compose 由 `POSTGRES_*` 派生指向容器网内 `db:5432`。db 数据持久在卷 `newkolmatrix-pgdata`。
5. **nginx**：
   ```bash
   cp deploy/nginx/newkol.guangai.ai.conf /etc/nginx/sites-available/
   ln -sf /etc/nginx/sites-available/newkol.guangai.ai.conf /etc/nginx/sites-enabled/
   nginx -t   # 先不 reload，等证书就位（否则 ssl_certificate 缺失会报错）
   ```
6. **证书**（DNS 生效后）：
   ```bash
   certbot certonly --webroot -w /var/www/certbot -d newkol.guangai.ai
   nginx -t && systemctl reload nginx
   ```

## 日常部署

```
push main → ci.yml 自动检查 + build-push.yml 自动推 app + tools 两镜像（tag=sha）
         → 手动去 Actions 跑 deploy-prod（image_tag 填 sha 或 latest）
         → compose up -d --wait：先跑 migrate one-shot（migrate deploy + 首次/幂等 seed）→ 再起 app
         → /api/health 健康检查 → 验证 https://newkol.guangai.ai
```

- **迁移/seed 自动**：`up -d` 经 compose `depends_on: migrate service_completed_successfully` 先跑 `newkolmatrix-migrate`（`prisma migrate deploy` + 条件 seed），完成后才起 app。migrate 每次幂等；seed 仅首次（Kol 表空时）灌 ~2500 KOL + embedding，**首次部署可能数分钟**（`up --wait-timeout 600`）。
- **首次部署**（目录/compose/.env 就位后）：GitHub Actions → Deploy to Production → Run（image_tag=latest）。首次会建库表 + pgvector 扩展 + 灌 seed。
- **查看**：`ssh deploysvr; cd /opt/apps/newkolmatrix; docker compose -f docker-compose.prod.yml logs -f migrate`（看迁移/seed 进度）/ `... logs -f app`。

## 回滚

Deploy to Production → Run，`image_tag` 填**上一个 good SHA**（ghcr 保留每个 sha 的不可变 tag）。

## 视觉 baseline

CI 视觉回归用 **linux** baseline。首次配置或页面视觉有意变更后：Actions → Update visual baselines → Run（在 CI 重生 `tests/screenshots/baseline/*-linux.png`，当前含 `en-today-linux.png` + `agent-canvas-linux.png`，并自动 commit）。本地开发用 `-darwin` baseline（`npm run test:visual:update` 生成）。

## 安全

- SSH 私钥 / Cloudflare token 等 secret **绝不入 git**，只存 GitHub Secrets / 本地钥匙串。
- `deploy-prod` 仅手动触发（harness 铁律：deploy/prod 永留人类闸门）。
- 所有命令只作用于 newkolmatrix 相关资源（`/opt/apps/newkolmatrix`、`newkolmatrix-app` 容器、`newkol.guangai.ai`），旧 kolmatrix 与其他 app 不受影响。
