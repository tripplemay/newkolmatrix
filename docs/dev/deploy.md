# 部署 Runbook — newkolmatrix → deploysvr（newkol.guangai.ai）

> CICD-VPS 批次交付。CI 自动检查 + 手动 Docker 部署到 VPS。**与旧 kolmatrix（kol.guangai.ai）共存，全程不碰旧 app / 其他 VPS app。**

## 拓扑

| 项 | 值 |
|---|---|
| 域名 | `newkol.guangai.ai`（HTTPS） |
| VPS | `deploysvr`（root），nginx 反代 |
| 容器端口 | `127.0.0.1:3300` → 容器 `:3000` |
| 部署目录 | `/opt/apps/newkolmatrix` |
| 镜像 | `ghcr.io/tripplemay/newkolmatrix:{sha|latest}` |
| 容器名 | `newkolmatrix-app` |

## 工作流（`.github/workflows/`）

| workflow | 触发 | 作用 |
|---|---|---|
| `ci.yml` | push/PR main | lint + typecheck + build + visual regression |
| `build-push.yml` | push main / 手动 | 构建镜像推 ghcr（`sha` + `latest` tag） |
| `deploy-prod.yml` | **仅手动 workflow_dispatch** | SSH deploysvr → compose pull → up -d → 健康检查 |
| `update-visual-baselines.yml` | 手动 | 在 CI(linux) 重生视觉 baseline 并 commit |

## 一次性 setup（首次上线前，逐项执行）

1. **DNS**：Cloudflare 加 A 记录 `newkol` → deploysvr 公网 IP（zone `guangai.ai`）。
2. **GitHub Secrets**（newkolmatrix repo → Settings → Secrets → Actions）：
   - `PROD_HOST` = deploysvr 公网 IP
   - `PROD_USER` = 部署用户（如 root）
   - `PROD_SSH_KEY` = deploysvr 部署私钥（PEM 全文）
3. **ghcr 包 public**：首次 build-push 后，GitHub → Packages → `newkolmatrix` → Package settings → Change visibility → Public（VPS 免认证 pull）。
4. **VPS 部署目录**：
   ```bash
   ssh deploysvr
   mkdir -p /opt/apps/newkolmatrix && cd /opt/apps/newkolmatrix
   # 放入 docker-compose.prod.yml（从 repo 拷贝）
   ```
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
push main → ci.yml 自动检查 + build-push.yml 自动推镜像（tag=sha）
         → 手动去 Actions 跑 deploy-prod（image_tag 填 sha 或 latest）
         → 验证 https://newkol.guangai.ai
```

首次部署（目录/compose 就位后）：GitHub Actions → Deploy to Production → Run（image_tag=latest）。

## 回滚

Deploy to Production → Run，`image_tag` 填**上一个 good SHA**（ghcr 保留每个 sha 的不可变 tag）。

## 视觉 baseline

CI 视觉回归用 **linux** baseline。首次配置或 dashboard 视觉有意变更后：Actions → Update visual baselines → Run（在 CI 重生 `tests/screenshots/baseline/en-dashboard-linux.png` 并自动 commit）。本地开发用 `-darwin` baseline（`npm run test:visual:update` 生成）。

## 安全

- SSH 私钥 / Cloudflare token 等 secret **绝不入 git**，只存 GitHub Secrets / 本地钥匙串。
- `deploy-prod` 仅手动触发（harness 铁律：deploy/prod 永留人类闸门）。
- 所有命令只作用于 newkolmatrix 相关资源（`/opt/apps/newkolmatrix`、`newkolmatrix-app` 容器、`newkol.guangai.ai`），旧 kolmatrix 与其他 app 不受影响。
