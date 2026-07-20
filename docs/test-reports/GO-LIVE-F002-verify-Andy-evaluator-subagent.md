# GO-LIVE F002 首轮独立验收报告

- **Feature：** F002 — 迁移 + seed 装配（one-shot tools 服务，含 pgvector 扩展 + 幂等 seed）
- **验收对象 commit：** `98a13b1`（`feat(GO-LIVE-F002)`）
- **阶段：** verifying（首轮，fix_rounds=0）
- **Evaluator：** Andy/evaluator-subagent（隔离 fresh context，未参与实现）
- **验收方式：** 亲读 3 个交付文件 + 独立重建两个镜像 + 本机 docker 全栈实测（含真实 bge-m3 网关 embedding）+ 独立 DB/向量检索取证 + 幂等复跑 + down -v 清理
- **日期：** 2026-07-20
- **整体结论：PASS（4/4 clause PASS，首轮通过）**

---

## 前置：交付物与环境确认

- 3 个交付文件 `Dockerfile` / `docker-compose.prod.yml` / `scripts/deploy/migrate-seed.sh` 工作树 `git status` clean，均属 commit `98a13b1`（`git show --stat` 确认）。
- `.env` 已 gitignore（`git check-ignore .env` exit 0）；临时 env 文件写入 scratchpad（repo 外，600 权限），真实 `AIGCGATEWAY_API_KEY` 从 `.env` 注入不落 repo、验收后 `shred` 删除。**本报告不含任何密钥明文。**
- 独立重建：`docker build -t ghcr.io/tripplemay/newkolmatrix:latest .`（runner，默认目标）+ `docker build --target tools -t ...-tools:latest .`（tools），两镜像均 build 成功。runner=380MB / tools=2.28GB。
- 网络隔离：新 compose db **不映射宿主端口**；旧 `kolmatrix-postgres`(:5432)/`kolmatrix-redis`(:6379)/`invoce-*` 全程 Up 6 days 未受扰动。

---

## 逐条 acceptance 验收

### Clause 1 — 本地全栈跑 migrate/seed one-shot：全表 + pgvector 扩展建好（`\dx` 见 vector、`Kol` 表在） → **PASS**

`docker compose up -d` 编排实测（orchestration 生效）：
```
Container newkolmatrix-db Healthy
Container newkolmatrix-migrate Starting → Exited
Container newkolmatrix-app Starting → Started
```
migrate 容器 `ExitCode=0 Status=exited OOMKilled=false`；日志：
```
2 migrations found in prisma/migrations
Applying migration `20260718000000_init`
Applying migration `20260720000000_pendingaction_input`
All migrations have been successfully applied.
```
独立 DB 取证（不依赖 seed 日志）：
```
-- pg_extension:  vector | 0.8.5
-- public tables: Game Handoff Kol OperationLog PendingAction Project Tenant User _prisma_migrations (9 表)
-- _prisma_migrations: 20260718000000_init=finished, 20260720000000_pendingaction_input=finished
```
`CREATE EXTENSION vector` 在 `20260718000000_init/migration.sql` 首行（先于 `Kol.embedding vector(1024)` 建表），实测扩展 0.8.5 已装、全表齐、`Kol` 表在。

### Clause 2 — seed 幂等：连跑两次第二次不重复灌/不报错；灌后 `Kol`≈2500 且 embedding 非空 → **PASS**

首跑（Kol 空 → 灌）：`解析 2524 行，去重后 2524 条` → `upsert 2524/2524` → 26 批真实 bge-m3 embedding（`累计 2524/2524`）→ `KOL 总数=2524，含非空 embedding=2524（本次新 embed 2524）` → `✅ 迁移 + 首次 seed 完成`。

二跑（`docker compose run --rm migrate`）：
```
No pending migrations to apply.
[migrate-seed] Kol 已有 2524 条 → 跳过 seed（幂等，不重复灌）
[migrate-seed] ✅ 迁移完成（seed 跳过）
```
二跑后独立计数：`total=2524 | with_embedding=2524`（未增、未重复灌、无报错，`run --rm` 正常完成并移除容器）。

独立 DB 断言：`Kol` 2524 条、`embedding` 全部非空（2524/2524）、`vector_dims=1024`。≈2500 达标（2524）。

> 观察 O1（非缺陷）：二跑的幂等由 `migrate-seed.sh` 的 count-guard 快路径实现（Kol 非空→整体跳过 seed），故 `import-kol-csv.ts` 内层「仅 embed IS NULL」的 upsert 级幂等在二跑未被独立触发。acceptance 「连跑两次不重复灌不报错」按 one-shot 层已满足；内层为双保险，代码可见其设计（唯一键 upsert + 仅补 NULL embedding），不影响判定。

### Clause 3 — prod 镜像栈内 `search_kols` 有结果（向量检索通） → **PASS**

两路独立证据（均在 prod tools/app 镜像 + pgvector 栈内）：
1. seed 内 cosine sanity（真实链路 NL→bge-m3→top-K）：query=`"World of Tanks 坦克世界 游戏解说 replay"` → top-5 语义相关（`The Best Replays World of Tanks` d=0.3095、`PWN-G | WoT Replays` d=0.3166 …），返回非空。
2. Evaluator 独立自相似向量检索（`embedding <=> query::vector ORDER BY LIMIT 5`，取一条 WoT KOL 的 embedding 作查询向量）：自身 d=0.0000，其后依次 `PWN-G | WoT Replays` 0.0616、`__X__` 0.1064、`The_Viper_UA` 0.1420、`SKIFler` 0.2564 —— 排序单调、语义连贯，pgvector 检索在 seeded 数据上有序返回结果。

`search_kols` 工具实现 `src/lib/agent/tools/search-kols.ts` 存在于 tools/runner 镜像；app runner 侧 `/api/handoffs` 200（见 Clause 4 备注），佐证 app 能连库查询。

### Clause 4 — tools 镜像/服务与 app runner 分离（runner 仍最小，不含 prisma CLI/脚本/CSV） → **PASS**

runner 镜像内实测（`docker run --entrypoint sh runner`）：
```
scripts/deploy/migrate-seed.sh : No such file or directory
scripts/seed/                   : No such file or directory
scripts/seed/data/*.csv         : No such file or directory
prisma/                          : No such file or directory
node_modules/.bin/prisma        : No such file or directory
node_modules/.bin/tsx           : No such file or directory
which prisma                     : (空)
runner 根目录仅：node_modules  package.json  public  server.js
```
tools 镜像内实测：
```
scripts/deploy/migrate-seed.sh : -rwxr-xr-x（+x 已设）
scripts/seed/import-kol-csv.ts : 存在
scripts/seed/data/*.csv        : 380569 bytes（~372K）
prisma/schema.prisma + migrations（init + pendingaction_input）: 齐
node_modules/.bin/prisma       : prisma 6.19.3
node_modules/.bin/tsx          : 存在
```
Dockerfile 结构印证：`tools` 目标 `FROM build`（含全量 source + node_modules 的 prisma CLI/tsx devDeps），`runner` 目标独立 `FROM node:20-alpine` 仅 COPY `.next/standalone` + `.next/static` + `public`。两目标物理分离，runner 最小性成立。镜像体积 runner 380MB vs tools 2.28GB 佐证。

> 备注：runner 虽无 prisma **CLI**，但 standalone 追踪的 `@prisma/client` 运行时已随 `node_modules` 打包 → app `/api/handoffs` 返回 `200 {"handoffs":[]}`（缺表时会 500，现建表后正常），证 runner 最小化未破坏运行时 DB 访问。

---

## L1 环境前置检查（防误报）

- Node/镜像：Dockerfile 全程 `node:20-alpine`，对齐 `.nvmrc`/VPS，无版本漂移。
- `prisma generate`：deps 阶段 `npm ci` 的 postinstall 已跑（schema 先于 `npm ci` COPY），tools 内 `prisma -v` 正常加载 schema。
- 无跨 tenant RLS 视角问题（本批单 dev tenant seed，`psql -U kol` superuser 视角计数）。
- 无已知环境误报命中。

## 隔离与清理

- 全程仅操作 newkolmatrix 资源；旧 kolmatrix / invoce 容器 Up 6 days 未受扰动。
- `docker compose down -v` 清理：`newkolmatrix-app/migrate/db` 容器 + `newkolmatrix-pgdata` 卷 + `newkolmatrix_default` 网络全部移除；残留 `newkolmatrix-dev-pgdata` 为既有本地 dev 卷（非本次创建），未误删。
- 临时 env（含真实网关 key）验收后 `shred` 删除，磁盘无密钥残留。

---

## 结论

| Clause | 判定 |
|---|---|
| 1 migrate/seed one-shot：全表 + pgvector 扩展 | **PASS** |
| 2 seed 幂等（连跑两次不重复灌）+ Kol≈2500 embedding 非空 | **PASS** |
| 3 prod 镜像栈内 search_kols 有结果 | **PASS** |
| 4 tools/runner 分离（runner 最小） | **PASS** |

**F002 整体 verdict：PASS（4/4）。** 首轮 verifying 即通过，无 FAIL/PARTIAL。1 条观察项 O1（二跑幂等走 count-guard 快路径，内层 upsert 级幂等未独立触发；非缺陷）如实记录，不构成扣分。转呈用户拍板。
