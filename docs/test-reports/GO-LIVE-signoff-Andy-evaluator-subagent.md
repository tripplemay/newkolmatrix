# GO-LIVE 批次 Signoff — 全栈首次上线基建

- **批次：** GO-LIVE（全栈部署基建：prod compose + pgvector Postgres + env + migrate/seed 装配 + healthcheck 修复 + deploy-prod/runbook 全栈化）
- **Evaluator：** Andy/evaluator-subagent（隔离 fresh context，未参与实现）
- **署名日期：** 2026-07-20
- **验收 HEAD：** `a8d8c7f`（F003 实现 commit `2200a99`）
- **整体批次结论：** **PASS — 无阻断。全栈 go-live 基建就绪。**

---

## 1. F001–F003 最终状态

| Feature | 标题 | 隔离验收 | 结论 | 报告 |
|---|---|---|---|---|
| F001 | 全栈 prod compose：pgvector + env + healthcheck 修复 | verifying 首轮 | **PASS (4/4)** | GO-LIVE-F001-verify-Andy-evaluator-subagent.md |
| F002 | 迁移+seed 装配（one-shot tools + pgvector 扩展 + 幂等 seed） | verifying 首轮 | **PASS (4/4)** | GO-LIVE-F002-verify-Andy-evaluator-subagent.md |
| F003 | deploy-prod 全栈化 + runbook + 本地 prod-stack 全链路验证 | verifying 首轮 | **PASS (4/4)** | GO-LIVE-F003-verify-Andy-evaluator-subagent.md |

- F001/F002 已用户裁决 done（completed_features=2）；F003 本轮首轮 PASS，转呈用户拍板。
- 三 feature 均首轮通过，`fix_rounds=0`，无 fixing→reverifying 循环。

## 2. 批次末全栈就绪回归（F001–F003 整条链）

本轮亲跑 prod 镜像栈（复刻 deploy-prod 同款 `up -d --wait --wait-timeout 600`）一次性复验整条链：

| 回归项 | 结果 | 证据 |
|---|---|---|
| compose config 合法（变量派生/healthcheck/隔离） | ✅ | `docker compose config` exit 0；DATABASE_URL 由 POSTGRES_* 派生指向 db:5432；healthcheck 命中 `/api/health`；独立容器名/卷/网络 |
| db(pgvector) 起 + healthy | ✅ | `newkolmatrix-db` healthy，`pg_isready` healthcheck；vector 扩展 0.8.5 |
| migrate one-shot（migrate deploy + 幂等 seed）先于 app | ✅ | up.log：db Healthy→migrate Started→migrate Exited(0)→app Started→app Healthy；migrate 2 migrations applied |
| seed ~2500 KOL + 非空 embedding | ✅ | 独立直连 db：Kol total=**2524**，with_embedding=**2524**，1024 维 |
| 向量检索 search_kols 通 | ✅ | cosine sanity top-5 语义相关（WoT 题材单调递增） |
| app healthy + /api/health 200 | ✅ | `curl /api/health` HTTP=200 `{"ok":true}` |
| hello-agent e2e 闭环（NL→search_kols→卡片流 + 人格切换 + handoff + 0 error） | ✅ | `E2E_BASE=http://127.0.0.1:3300` **6/6**，15 卡，0 console error |
| 两镜像 CI 推送 | ✅ | build-push run 29758599584（F003 commit）success，app(runner) + tools 两 build-push step |
| CI 最新 HEAD 四 job success | ✅ | ci.yml run 29758600010（commit 2200a99）：Build/Visual regression/Typecheck/Lint 全 success |
| runbook 覆盖人工闸门项 | ✅ | deploy.md 六项一次性 setup + 日常部署 + 回滚 + 隔离声明；environment.md 一致 |
| 资源隔离（旧 kolmatrix/其他 app 不受扰） | ✅ | down -v 只清 prod 栈；kolmatrix/invoce 容器全程 Up 6 days healthy；dev 卷保留 |

**回归结论：整条 F001→F002→F003 链在 prod 镜像栈上端到端跑通，无阻断缺陷。**

## 3. 整体批次结论

**PASS。** 全栈首次 go-live 的部署基建（DB 自带容器 / env 注入 / migrate+seed 装配 / healthcheck 修复 / deploy-prod 全栈化 / runbook）已就绪并经 prod 镜像栈端到端实证。批次目标（「使首次全栈 go-live 可成」）达成。纯基建，未改产品代码（`git show --stat 2200a99` = 仅 workflows/docs/e2e-script/env-memory）。

## 4. 首次真实 go-live 人工闸门清单（提醒用户：以下仍待人工执行，不在本批）

本批只产出「清单 + 命令 + 就绪证明」，**部署触发与一次性 VPS 设置为人类闸门，须由用户手动执行**（harness 铁律：deploy/prod 永留人类闸门）。按 `docs/dev/deploy.md`「一次性 setup」逐项：

- [ ] **① DNS**：Cloudflare 加 A 记录 `newkol` → deploysvr 公网 IP（zone guangai.ai）。
- [ ] **② GitHub Secrets**（newkolmatrix repo）：`PROD_HOST` / `PROD_USER` / `PROD_SSH_KEY`（deploysvr 部署私钥 PEM 全文）。
- [ ] **③ ghcr 两个包都设 Public**：GitHub Packages → `newkolmatrix` **和** `newkolmatrix-tools` → 各自 Change visibility → Public（VPS 免认证 pull）。**两个都要，漏 tools 则 migrate 拉不到镜像。**
- [ ] **④ VPS 部署目录 + compose + `.env`**：`/opt/apps/newkolmatrix` 放 `docker-compose.prod.yml`；创建 `.env`（**绝不入 git**）含 `POSTGRES_PASSWORD`（强随机）+ `AIGCGATEWAY_API_KEY`（真实网关 key），`chmod 600`。DATABASE_URL 无需手写（compose 派生）。
- [ ] **⑤ nginx**：放 `deploy/nginx/newkol.guangai.ai.conf`，`nginx -t`（证书就位前先不 reload）。
- [ ] **⑥ 证书**：DNS 生效后 `certbot certonly --webroot ... -d newkol.guangai.ai`，`nginx -t && systemctl reload nginx`。
- [ ] **⑦ 触发部署**：GitHub Actions → Deploy to Production → Run（`image_tag=latest` 或指定 SHA）。**首次会建库表 + pgvector 扩展 + 灌 ~2500 KOL seed（对 ~2500 条算 embedding，可能数分钟，`--wait-timeout 600`）。**
- [ ] **⑧ 验证**：`https://newkol.guangai.ai` 可访问；`docker compose ... logs -f migrate` 看迁移/seed 进度、`... logs -f app` 看应用。

> 隔离提醒：全程只操作 newkolmatrix 资源（`/opt/apps/newkolmatrix`、`newkolmatrix-*` 容器、`newkol.guangai.ai`），旧 kolmatrix（`kol.guangai.ai:3001`）及其他 VPS app 不受影响。

## 5. 已知下游（不在本批，spec §6）

- 首次真实 go-live 执行（上 §4 人类闸门）。
- 生产可观测性（日志/监控/告警）、备份策略、CDN——后续批次按需。

---

_signoff：GO-LIVE 批次隔离验收全 PASS（F001–F003 各 4/4，批次末回归全绿）。首次真实部署留人类闸门。Andy/evaluator-subagent, 2026-07-20。_
</content>
