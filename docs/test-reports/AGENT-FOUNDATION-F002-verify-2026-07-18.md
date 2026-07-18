# AGENT-FOUNDATION F002 — 隔离验收报告（首轮 verifying）

> **批次：** AGENT-FOUNDATION · **Feature：** F002（且仅 F002）全栈化 + DB/pgvector + Prisma schema（单角色）+ 运行时表（闸门 + 交接）
> **验收日期：** 2026-07-18
> **验收形态：** 隔离 evaluator subagent（fresh context，无自评铁律）
> **被验提交：** `a2e8715`（F002 主体）+ `21d4d11`（Dockerfile deps 阶段 COPY prisma 修复）；当前 HEAD `ad0173f`
> **验收环境：** macOS darwin / Node v25.7.0 / npm 10.8.2 / Docker 29.3.1 / 本地容器 `newkolmatrix-dev-db`（pgvector/pgvector:pg16，host 5434，Up healthy）
> **验收人：** Andy/evaluator-subagent

---

## 总判定：**PASS**

F002 的 10 条 acceptance（features.json 权威副本）+ spec §F002 增补项（无 Approval / D-INTEROP publicId·slug）+ 数据门 / 构建门 / 密钥门 / 互操作门（spec §6）**全部 PASS，无 PARTIAL / FAIL**。证据均为亲自运行的命令输出与亲自读到的 DDL / DB 实测，未采信任何实现叙述。

---

## 逐条 acceptance 验收（证据）

### C1 — prisma migrate 成功 · PASS
- `node --env-file=.env prisma migrate deploy` 退出码 **0**，输出 `1 migration found` / `No pending migrations to apply.`（幂等成立 → migrate 机制正确）。
- `_prisma_migrations` 实测：`20260718000000_init | finished=2026-07-18 07:48:26+00 | rolled_back=NULL | applied_steps=1`（干净应用，无回滚）。

### C2 — pgvector 经自定义 SQL migration `CREATE EXTENSION IF NOT EXISTS vector`（D3，不依赖预览开关）· PASS
- `prisma/migrations/20260718000000_init/migration.sql:4` = `CREATE EXTENSION IF NOT EXISTS vector;`（建表前执行）。
- `prisma/schema.prisma` **无** `previewFeatures` / `postgresqlExtensions` / datasource `extensions`（grep 仅命中注释）。generator block 仅 `provider = "prisma-client-js"`。
- DB 实测：`pg_extension` 中 `vector 0.8.5` 已装。

### C3 — Kol.embedding 为 vector(1024) · PASS
- `format_type(atttypid, atttypmod)` on `pg_attribute`（Kol.embedding）= **`vector(1024)`**（非 schema 声明推断，取自 DB 实列）。
- schema.prisma:78 `embedding Unsupported("vector(1024)")?`；migration.sql:55 `"embedding" vector(1024)`。

### C4 — schema 含 Tenant / User（单 dev 用户，无 role/scope/权限字段）· PASS
- `User` 实列 = `id / tenantId / email / name / createdAt`——**无 role、无 scope**。
- 全库扫描 `information_schema.columns`：无任何列名含 `role` 或 `scope`。
- `Tenant` 占位表存在（id/publicId/slug/name/createdAt）。

### C5 — Kol D15 字段契约位（audienceDemo/credibility/brandSafety/dataSource/fieldProvenance）全部 nullable · PASS
- DB 实测五列全部 `nullable=YES`：`audienceDemo(jsonb)` / `credibility(jsonb)` / `brandSafety(jsonb)` / `dataSource(text)` / `fieldProvenance(jsonb)`。
- smoke 断言 `kolA.audienceDemo===null && kolA.fieldProvenance===null` 通过（默认不填充）。

### C6 — 业务实体带 owner 标记（String? = Leo/Ada/Kai，D29 非权限非枚举）· PASS
- `Kol.owner (text, nullable=YES)` / `Project.owner` / `Game.owner` 均为 text，非 enum。
- smoke 实写 `owner: 'Leo'` / `'Ada'` 并断言 `kolA.owner==='Leo'` 通过（纯字符串分工标记，非权限层）。

### C7 — 三张运行时表存在（PendingAction 三态 / OperationLog append-only / Handoff）· PASS
- **PendingAction** 列 = `id/tenantId/kind/toolName/payloadHash/harmJson/status/confirmationTokenHash/expiresAt/createdAt`；enum `PendingActionStatus` = **pending / confirmed / executed**（三态）。`harmJson` JSONB NOT NULL 为 F009 harm 结构落点。
- **OperationLog** 列 = `id/tenantId/kind/actor/summary/ref/createdAt`——**无 updatedAt**（append-only 成立）；enum `OperationLogKind` = **auto / gate / block / irrev**。
- **Handoff** 列 = `id/tenantId/projectId/fromAgent/toAgent/artifactType/artifactRef/summary/messagesJson/createdAt`（架构稿 §5.4 信封字段齐全）。

### C8 — docker-compose.dev.yml 起本地 postgres+pgvector · PASS
- `docker-compose.dev.yml` 用镜像 `pgvector/pgvector:pg16`，容器 `newkolmatrix-dev-db`，`127.0.0.1:5434->5432`，含 healthcheck。
- `docker inspect .State.Health.Status` = **healthy**；容器实测在跑。

### C9 — .env.example 加 DATABASE_URL 无明文密钥 · PASS
- `.env.example:14` = `DATABASE_URL=postgresql://kol:kol_dev_password@localhost:5434/kolmatrix?schema=public`。
- `kol_dev_password` 是**本机 dev throwaway 口令**（仅对 localhost:5434 容器有效），**非真实生产 secret**——文件自身注释「真实生产 DATABASE_URL 走部署环境注入，绝不入 git」。判定：可接受。
- 真实 `.env`：`git check-ignore .env` 退出 0（已 gitignore）；`git ls-files .env` 空（未追踪）。
- 全仓 secret 模式扫描（sk- / AKIA / PRIVATE KEY / Bearer）在 tracked 文件中**零命中**。

### C10 — build + tsc --noEmit + lint 绿 · PASS
- 删 `tsconfig.tsbuildinfo` + `prisma generate` 后 `tsc --noEmit` 退出码 **0**。
- `next lint` 退出码 **0**：`✔ No ESLint warnings or errors`（`next lint` deprecation 警告为工具提示，非 lint error）。
- `next build` 退出码 **0**：`✓ Compiled successfully in 7.5s` + `✓ Generating static pages (10/10)`，无 error / Failed。

---

## spec §F002 增补项

### S1 — 无 User.role/scope、无 Approval 表 · PASS
- `pg_tables` 无任何表名含 `approval`；全库无 role/scope 列（见 C4）。

### S2 —（D-INTEROP）核心实体带稳定对外标识 publicId/slug · PASS
- `Tenant/Project/Game`：`publicId`（unique）+ `slug`（unique）。`Kol`：`publicId`（unique，`Kol_publicId_key`）。
- 唯一索引齐全：`{Tenant,Project,Game}_{publicId,slug}_key` + `Kol_publicId_key` + `Kol_tenantId_canonicalHandle_key`（F004 幂等 upsert 键）。
- 观察（非缺陷）：Kol 有 publicId 无 slug（Tenant/Project/Game 二者兼具）。acceptance 措辞为「public id / slug」（择一即可），Kol 以 publicId 满足稳定对外标识，另有 canonicalHandle 作规范化锚点——判 PASS。

---

## 验收总纲门（spec §6，本 feature 相关门）

| 门 | 结果 | 关键证据 |
|---|---|---|
| **数据门** | PASS | migrate deploy exit0（幂等）+ 自定义 CREATE EXTENSION vector + Kol.embedding=vector(1024) + D15 全 nullable + 三运行时表齐 + `npm run db:smoke` 9/9 exit0（真实向量 round-trip cosine 检索 + 级联清理无残留） |
| **构建门** | PASS | tsc0 / lint0 / build0（10/10 static pages） |
| **密钥门** | PASS | .env gitignored + 未 track；.env.example 仅 dev throwaway 口令非生产 secret；无硬编码真实密钥 |
| **互操作门** | PASS | publicId/slug 稳定标识就位；EXTENSION POINT 注释 4 处（schema.prisma:11/102/118/182）；仅留插座——无 JSON-LD/schema.org/GEO 内容本体实装（git grep src/·prisma/ 仅命中描述性注释） |

> 注：RLS 门不在 F002 范围——spec D4 明定单租户、真实认证/多租户 RLS 留 M5，本批不建 RLS policy（database-patterns §8 被 D4 spec 决策显式豁免，非缺陷）。

---

## db:smoke 独立核验（亲自运行 + 读脚本）

- 读 `scripts/test/db-smoke.ts`：确认它对 Kol.embedding 做**真实向量插入**（raw SQL `UPDATE "Kol" SET embedding = $1::vector`，两个不同 seed 向量 vecA/vecB）+ **cosine 检索**（`embedding <=> $1::vector` ORDER BY，以 vecA 为 query 断言 top-1=自身 kolA 且距离排序 自身<他者）。非 mock，为 prod-shaped 端到端。
- 运行前 counts `tenant=0 user=0 kol=0`；运行 `npm run db:smoke` → **9/9 断言通过，exit 0**；运行后 counts 归 **`tenant=0 user=0 kol=0`**（`finally` 级联清理生效，无残留，不污染 F004 将灌的真实数据）。

---

## 修改边界声明

本次验收**仅新增本报告 + 追加 progress.json 的 evaluator_feedback（F002 条目）**；未修改任何产品代码（schema / migration / docker-compose / src / Dockerfile / package.json 等一律未动）。

---

## 结论

**F002 = PASS（10/10 acceptance + 2/2 spec 增补项 + 4/4 相关门全 PASS，首轮 fix_rounds=0）。** 结论原样落盘，供编排者呈用户拍板；用户确认 PASS 后该 feature 置 done、开工 F003。

— Andy/evaluator-subagent
