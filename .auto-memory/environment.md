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
| 运行 | Docker 全栈：`newkolmatrix-app`(`127.0.0.1:3300`→`:3000`,nginx 反代,卷 `newkolmatrix-materials`→`/app/materials` M1-D 素材文件) + `newkolmatrix-db`(pgvector/pg16,卷 `newkolmatrix-pgdata`,不暴露端口) + `newkolmatrix-migrate`(一次性 migrate+seed) |
| 部署目录 | `/opt/apps/newkolmatrix`（放 `docker-compose.prod.yml` + `.env`：`POSTGRES_PASSWORD`+`AIGCGATEWAY_API_KEY`，不入 git） |
| 镜像 | app `ghcr.io/tripplemay/newkolmatrix:{sha\|latest}`（runner 最小）+ tools `...-tools:{sha\|latest}`（migrate/seed） |
| 部署方式 | 手动 `deploy-prod` workflow_dispatch（人类闸门）；`up -d --wait` 先 migrate 后 app；详见 `docs/dev/deploy.md` |
| apify-kol 外采（M2-B 起） | 同宿主容器 `apify-kol-service-service-1`（`kol-shared` docker 网络别名 `apify-kol:3003`，不暴露公网）；app 经 `APIFY_KOL_BASE_URL`+`APIFY_KOL_API_KEY`（BUSINESS 只读 key，VPS `.env`）拉取；kol-sync 例程每夜 03:00；**零投喂零充值**（TikHub spend 人工闸门）；本地 dev 不可达内网（L2 走 ssh 隧道 `-L 3004:localhost:3004`） |
| ⚠️ image_tag 格式 | **必须填完整 40 位 SHA**（镜像 tag 取 `github.sha`）。填 7 位短 SHA 会在 pull 阶段直接失败：`failed to resolve reference ...: not found`。回滚同理。2026-07-22 实测踩中 |
| ⚠️ compose 同步 | `docker-compose.prod.yml` 在 VPS 是**人工副本**（deploy-prod 不同步）。改 compose 的批次上线前必须先 `scp docker-compose.prod.yml deploysvr:/opt/apps/newkolmatrix/`（M1-D 实操；旧版备份 `.bak-m1c`） |

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
