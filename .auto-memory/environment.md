---
name: environment
description: 生产/Staging 环境地址、服务器配置、测试账号（很少变）
type: reference
---

## 验收环境（newkolmatrix 重构版）

| 项目 | 值 |
|---|---|
| 域名 | `https://newkol.guangai.ai`（HTTPS） |
| VPS | `deploysvr`（共享多应用机；host/user/key 存 GitHub Secrets `PROD_HOST/PROD_USER/PROD_SSH_KEY`，不入 git） |
| 运行 | Docker 全栈：`newkolmatrix-app`(`127.0.0.1:3300`→`:3000`,nginx 反代) + `newkolmatrix-db`(pgvector/pg16,卷 `newkolmatrix-pgdata`,不暴露端口) + `newkolmatrix-migrate`(一次性 migrate+seed) |
| 部署目录 | `/opt/apps/newkolmatrix`（放 `docker-compose.prod.yml` + `.env`：`POSTGRES_PASSWORD`+`AIGCGATEWAY_API_KEY`，不入 git） |
| 镜像 | app `ghcr.io/tripplemay/newkolmatrix:{sha\|latest}`（runner 最小）+ tools `...-tools:{sha\|latest}`（migrate/seed） |
| 部署方式 | 手动 `deploy-prod` workflow_dispatch（人类闸门）；`up -d --wait` 先 migrate 后 app；详见 `docs/dev/deploy.md` |

## 旧 kolmatrix（共存，不碰）

- 旧 MVP 仍在 `kol.guangai.ai`（docker-compose，容器 `kolmatrix-app-1` :3001 + postgres + redis），repo = 旧 `tripplemay/kolmatrix`，目录 `/opt/apps/kolmatrix`
- newkolmatrix 全程只操作自己的资源，旧版及其他 VPS app（nextpanel/aigc/tokenizer/invoce/apify）不受影响

## 本地开发

| 项目 | 值 |
|---|---|
| Dev Server | `next dev` → http://localhost:3000 |
| 平台 | macOS（darwin） |

## 测试账号（如有）

- 暂无（前端-only，无认证）

<!-- 写入规则：由 Planner 统一维护。credential（SSH key / CF token / IP）绝不明文入 git，只存 GitHub Secrets / 本地钥匙串。 -->
