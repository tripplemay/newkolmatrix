# CICD-VPS 首轮验收报告（verifying）

> **批次：** CICD-VPS — CI + Docker CD 到 VPS（newkol.guangai.ai）
> **验收人：** Andy/evaluator-subagent（隔离上下文，fresh context）
> **日期：** 2026-07-14
> **验收层级：** L1（本地 docker + 命令输出 + GitHub Actions 实况）。**未触碰 VPS**（go-live §7 不在验收职责）。
> **判定依据：** 规格 `docs/specs/CICD-VPS-spec.md` §4 各 feature AC + §6 验收总纲；实物 = 代码/配置文件 + 命令输出 + Actions run 时间线。
> **总评级：✅ PASS（7/7 feature PASS，8/8 验收门 PASS）**

---

## 0. 验收环境自证

| 工具 | 版本 / 状态 |
|---|---|
| docker | 29.2.1（daemon 运行中） |
| gh | 已登录 tripplemay（keyring）；**token 缺 `read:packages` scope**（见 §镜像门说明） |
| actionlint | 1.7.12 |
| node | v25.7.0（本机；镜像/CI 用 node 20） |
| 本地镜像 | `newkolmatrix:test` 357MB（36 分钟前构建，直接复验，未重 build） |

---

## 1. 验收门总表（spec §6）

| 门 | 结论 | 关键证据 |
|---|---|---|
| YAML 门 | ✅ PASS | `actionlint` 4 workflow exit=0，0 issue |
| CI 门 | ✅ PASS | 最新 CI run（4acd40a）Lint/Typecheck/Build/Visual 四 job 全 success |
| 镜像门 | ✅ PASS | Build & Push run（3e24f0e）success；log 确认 sha+latest 层写入 ghcr |
| 容器门 | ✅ PASS | `docker run -p 3300:3000` → `/admin/dashboards/default` 返 200，渲染 KOLMatrix，非 root uid 1001 |
| compose 门 | ✅ PASS | `IMAGE_TAG=latest docker compose config` 通过，字段全对 |
| 安全门 | ✅ PASS | deploy-prod 仅 workflow_dispatch；脚本只操作 newkolmatrix 资源；无跨 app/全局/破坏性命令 |
| 文档门 | ✅ PASS | deploy.md setup+日常+回滚齐全；nginx conf 反代 3300 语法合理 |
| 泄密门 | ✅ PASS | 全仓无 SSH 私钥/token/明文密码；environment.md 无 IP/key |

---

## 2. 逐 feature 判定

### F001 — Docker 化 → ✅ PASS
**AC：** `output:standalone` + 多阶段非 root Dockerfile + 本地 build/run 200 渲染 dashboard + .dockerignore 排除。

证据：
- `next.config.js:12` `output: 'standalone'` ✓
- `Dockerfile` 三阶段（deps→build→runner），`node:20-alpine`（对齐 VPS Node 20.20），`addgroup/adduser` + `USER nextjs`（uid 1001 非 root），copy `.next/standalone`+`.next/static`+`public`，`EXPOSE 3000`，`CMD ["node","server.js"]` ✓
- `.dockerignore` 排除 `node_modules/.next/.git/.github/tests/docs/framework/.auto-memory/模板目录/*.md/状态机文件` ✓
- **实测：** `docker run -d --name verify-newkolm -p 3300:3000 newkolmatrix:test` → 2s 就绪 → `curl localhost:3300/admin/dashboards/default` **status=200 bytes=8336**，`<title>KOLMatrix</title>`，含 `__NEXT_DATA__`/`_next/static`（`已发现 KOL` 为客户端 NoSSR+apexcharts 渲染，初始 HTML 无此串属预期）。`docker exec id` = `uid=1001(nextjs)` 非 root ✓。用完 `docker rm -f` 已清理。
- 镜像 357MB（alpine+standalone，非全量 node_modules），符合"瘦"要求 ✓

### F002 — docker-compose.prod.yml → ✅ PASS
**AC：** config 通过；image=ghcr:${IMAGE_TAG:-latest}，ports 127.0.0.1:3300:3000，restart unless-stopped，healthcheck，container_name newkolmatrix-app。

证据（`IMAGE_TAG=latest docker compose config` 输出）：
- `image: ghcr.io/tripplemay/newkolmatrix:latest`（默认 latest）✓
- `ports: host_ip 127.0.0.1 / target 3000 / published 3300` ✓
- `restart: unless-stopped` ✓
- `container_name: newkolmatrix-app` ✓
- `healthcheck` 存在（`CMD-SHELL` + `node -e` GET `127.0.0.1:3000/admin/dashboards/default` → statusCode 200 判活）✓
- 独立网络 `newkolmatrix_default`（与旧 app 隔离）✓

> 观察（非缺陷）：healthcheck 用 `node -e` 而非 AC 字面的 `curl`。alpine node 镜像默认无 curl，用 node http 探活更健壮，功能等价且更优。判 PASS。

### F003 — CI 工作流 ci.yml → ✅ PASS
**AC：** 合法 YAML；on push/PR main + paths-ignore；Node 20 npm ci；lint+typecheck+build；push 后全绿。

证据：
- actionlint 干净 ✓
- `on: push(main, paths-ignore: .auto-memory/progress/features/backlog.json/docs/framework/design-draft/**/*.md) + pull_request(main) + workflow_dispatch` ✓
- Node 20（`NODE_VERSION: "20"`）+ `npm ci` + cache npm ✓
- 4 job：Lint / Typecheck / Build / Visual（visual 为 F004 增强）✓
- **最新 CI run（databaseId 29341057207, headSha 4acd40a）：Lint✓ Typecheck✓ Build✓ Visual✓ 全 success。** HEAD（f166b19）与该绿 run 的代码树差异仅 progress.json（paths-ignore），故绿 run 有效覆盖当前代码。

### F004 — 视觉回归 → ✅ PASS
**AC：** playwright+config+spec 比对 baseline；update-visual-baselines 在 linux 重生 PNG 并 commit；CI visual job 对齐 linux baseline 通过。

证据：
- `@playwright/test`@1.61.1（devDeps）+ `playwright.config.ts`（`snapshotPathTemplate: .../{arg}-{platform}{ext}`，webServer 起 `serve-standalone.mjs` 用实际部署 artifact）+ `tests/visual/dashboard.spec.ts`（截 dashboard，`maxDiffPixelRatio 0.02`）✓
- `update-visual-baselines.yml`（workflow_dispatch，`permissions: contents:write`）→ 在 linux 重生 `tests/screenshots/baseline` 并 commit ✓
- **实况时间线核实（Andy 叙述属实）：** CI push@3e24f0e **仅 Visual job failure**（Lint/Typecheck/Build 均 success）= linux baseline seeding gap → `Update visual baselines` run@3e24f0e success → 产出 commit `4acd40a chore(visual): update linux baselines [skip ci]`（`git log -1 -- .../en-dashboard-linux.png` = 4acd40a 确认）→ CI 重触发（workflow_dispatch）@4acd40a Visual **success**。
- baseline `tests/screenshots/baseline/en-dashboard-linux.png` 已入库（git-tracked）✓

> 观察（非缺陷）：`tests/screenshots/baseline/en-dashboard.png`（无 `-{platform}` 后缀）为早期首跑遗留，当前 config 用 `{platform}` 模板已不引用它，纯冗余文件，无害。可后续清理，不阻塞。

### F005 — build-push.yml → ✅ PASS
**AC：** 合法 YAML；on push main + dispatch；buildx+login(GITHUB_TOKEN)+build-push@v6 push:true tags sha+latest；permissions packages:write；push 后 ghcr 有镜像。

证据：
- actionlint 干净；`on: push(main) + workflow_dispatch`；`permissions: contents:read, packages:write` ✓
- `setup-buildx@v3` + `login-action@v3`（registry ghcr.io, password `GITHUB_TOKEN`）+ `build-push-action@v6`（`target: runner`, `push: true`, tags `${sha}`+`:latest`, gha cache）✓
- **镜像门实证：** Build & Push run（29340785764, 3e24f0e）job `Build + push app image` = **success**；log 确认 `#19 [auth] tripplemay/newkolmatrix:pull,push token for ghcr.io`、`#20 writing layer sha256:... DONE 106.7s`、tags `ghcr.io/tripplemay/newkolmatrix:3e24f0e...` + `:latest`。build-push-action push:true 步骤成功即证 registry 写入完成。
- 说明：本机 gh token 缺 `read:packages` scope，无法直接 `gh api .../packages` 查 tag（403），改以 CI push log 作直接证据（更权威）。ghcr 包 public 可见性属 go-live §7 步骤 5，不在验收范围。

### F006 — deploy-prod.yml → ✅ PASS（安全门核心）
**AC：** 合法 YAML；**仅** workflow_dispatch（无 push）；appleboy ssh-action → cd /opt/apps/newkolmatrix → compose pull → up -d → curl -f localhost:3300；无触碰旧 app 命令。

证据（逐行安全复核）：
- **触发面：** `on: workflow_dispatch`（inputs `image_tag` default latest, required）**唯一触发**，无 push/schedule → 无误部署风险 ✓
- `appleboy/ssh-action@v1`：host/username/key = `secrets.PROD_HOST/PROD_USER/PROD_SSH_KEY`，`envs: IMAGE_TAG` 传入 ✓
- 脚本（`set -euo pipefail`）逐行：`cd /opt/apps/newkolmatrix` → `export IMAGE_TAG` → `COMPOSE="docker compose -f docker-compose.prod.yml"` → `$COMPOSE pull` → `$COMPOSE up -d` → `curl -sf 127.0.0.1:3300/admin/dashboards/default` 10×3s 重试，失败 `$COMPOSE logs --tail 50 app; exit 1`
- **跨 app 安全扫描：** grep `kolmatrix-app|/opt/apps/kolmatrix|kol.guangai|prune|docker rm/stop/kill/rmi|--remove-orphans|systemctl|rm -rf|nextpanel|aigc|tokenizer` → 命中仅**注释行**（隔离说明）与 job name/environment url，**脚本正文 0 命中**。无 `--remove-orphans` → compose 不动跨项目容器。作用域严格限于 newkolmatrix（目录/compose/app/3300 端口）。旧 kolmatrix、kol.guangai.ai、其他 VPS app 全程不碰 ✓
- environment production + url https://newkol.guangai.ai（部署门审计可见）✓

### F007 — 部署文档 + nginx + env + environment.md → ✅ PASS
**AC：** deploy.md 含一次性 setup(DNS/certbot/secrets/ghcr public/VPS 目录/nginx)+日常+回滚；nginx conf 反代 3300 语法正确；.env.example 极简；environment.md 无 secret/IP/key。

证据：
- `docs/dev/deploy.md`：拓扑表 + workflow 表 + 一次性 setup（1 DNS / 2 三 secrets / 3 ghcr public / 4 VPS 目录 / 5 nginx 应用+`nginx -t` / 6 certbot 签证）+ 日常部署（push→CI→build-push→手动 deploy-prod）+ 回滚（image_tag 填 good SHA）+ 视觉 baseline + 安全说明 ✓
- `deploy/nginx/newkol.guangai.ai.conf`：upstream→127.0.0.1:3300 keepalive；80 server（acme-challenge webroot + 301→https）；443 ssl http2（TLSv1.2/1.3）反代 upstream，`/_next/static/` 长缓存，gzip；证书路径 `/etc/letsencrypt/live/newkol.guangai.ai/{fullchain,privkey}.pem`。语法为 nginx 1.24（VPS 版本）标准写法，`listen 443 ssl http2;` 在 1.24 正确（本机无 nginx，`nginx -t` 由 §7 setup 步骤 5 在 VPS 执行）✓
- `.env.example`：仅 `NEXT_PUBLIC_BASE_PATH=` + `NEXT_TELEMETRY_DISABLED=1`，极简，无 secret ✓
- `.auto-memory/environment.md`：host/user/key 注明"存 GitHub Secrets 不入 git"，**无明文 IP/key/token** ✓

---

## 3. 泄密门明细

```
grep -rnE "PRIVATE KEY|BEGIN OPENSSH|sk-[A-Za-z0-9]{20}|cloudflare|CF_API|Bearer ..." (yml/md/js/ts/mjs/json/conf/example，排除 node_modules/.git/.next)
→ 唯一命中：framework/patterns/web-runtime-patterns.md 的一行 grep 模式串（是"扫密码用的正则"本身，非真实 secret）
grep 密码/token 字面赋值 → 0 命中
```
结论：无 SSH 私钥 / CF token / 明文密码入库。deploysvr host/IP 不入 git，仅通过 GitHub Secrets / 本地钥匙串引用，environment.md 无 IP。**泄密门 PASS。**

---

## 4. 遗留 / 观察（非阻塞，供 Planner 参考）

1. **[cosmetic]** `tests/screenshots/baseline/en-dashboard.png`（无 platform 后缀）为首跑遗留冗余文件，当前 config 不引用，可清理。
2. **[info]** F002 healthcheck 用 `node -e` 而非 AC 字面 `curl`（alpine 无 curl，功能更优，非缺陷）。
3. **[info]** 最新绿 CI 为 workflow_dispatch 重触发（baseline commit 带 `[skip ci]` 故未自动触发）；代码树与 HEAD 一致，判定有效。
4. **[info]** GH runner 提示 Node 20 弃用警告（GitHub 侧，非本仓配置问题）。
5. **[go-live 提醒]** `https://newkol.guangai.ai` 真正在线依赖 spec §7 go-live（DNS/certbot/secrets/ghcr public/首次部署），由主上下文 Andy 授权代执行，**首次部署上线前须与用户确认一次**。本验收仅覆盖机件正确 + CI/build-push 自动绿，不含 live-site。

---

## 5. 结论

**7/7 feature PASS，8/8 验收门 PASS，0 FAIL，0 PARTIAL。**
安全门（deploy-prod 仅手动 + 严格作用域 + 不碰旧 app）作为主上下文执行真实部署前的独立安全复核，**通过**。

→ 批次可流转 `verifying → done`，signoff 见 `docs/test-reports/CICD-VPS-signoff-2026-07-14.md`。
