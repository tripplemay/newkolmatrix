# M4-INSIGHT F001 验收结论（Evaluator 隔离验收，原样落盘）

> 批次：M4-INSIGHT · feature：F001「迁移：MetricSnapshot/WeeklyReport/ShareLink 三表 + ShareLinkScope 枚举」
> 验收基线：HEAD `fc905c1`（F001 实现 commit `45f4d75`）· 验收时间：2026-07-24
> 验收环境：本地 dev DB `newkolmatrix-dev-db`（localhost:5434/kolmatrix）· L2 未授权，全程零外呼

```
feature_id: F001
result: PASS
```

## acceptance_checklist（逐条，不删减）

1. ✓ **migration 落 prisma/migrations 且 db:migrate 干净** — `prisma/migrations/20260724183013_m4_insight_three_tables/migration.sql` 在场；`prisma migrate status` = "Database schema is up to date!"（9 migrations found）；空库全量重放 `migrate deploy` 9/9 成功（scratch DB `kolmatrix_eval_f001`，验后已 DROP）。
2. ✓ **MetricSnapshot 字段与 spec §4 逐项一致** — DB `\d` 实测：projectId text NOT NULL(FK→Project ON DELETE CASCADE)、date timestamp(3) NOT NULL、spend numeric(14,2) NULL、currency text NULL、spendSource text NULL、reach integer NULL、conversions integer NULL、roi double precision NULL、id/tenantId/createdAt 齐；索引 `(tenantId)` + `(projectId,date)` 与 spec §4 一致。
3. ✓ **WeeklyReport 一致** — projectId text NULL（P10 双态）、period NOT NULL、draftContent NOT NULL、adopted boolean NOT NULL DEFAULT false、adoptedAt NULL、generatedBy NOT NULL DEFAULT `'insight'::text`、createdAt/updatedAt 齐；索引 `(tenantId)`+`(projectId)`。
4. ✓ **ShareLink 一致** — projectId text NULL、scope `"ShareLinkScope"` NOT NULL、payloadRef text NOT NULL、tokenHash NULL、expiresAt NULL、revokedAt NULL、gateLogId NULL、createdAt；索引 `(tenantId)`+`(projectId)`；表上无 FK 约束（软引用，理由记于 migration 头 + schema 注释，D13 先例）。
5. ✓ **ShareLinkScope 枚举两值 project/quarterly** — pg_enum 实测 `project,quarterly`（顺序一致）；生成的 Prisma client 导出 `{"project":"project","quarterly":"quarterly"}`。
6. ✓ **gateLogId 软引用列在场（ShareLink）** — 列存在且无 FK 约束，注释标 `→ PendingAction.id（软引用；生成经闸门必非空）`。
7. ✓ **migration 含单向回滚说明** — 头部给出 `DROP TABLE "ShareLink"; DROP TABLE "WeeklyReport"; DROP TABLE "MetricSnapshot"; DROP TYPE "ShareLinkScope";`；**实测可执行**：在 scratch DB 按该序执行全部成功，回到 21 业务表 + 16 枚举（= 本批前基线），证明回滚说明真实有效且无不可逆残留（无 `ALTER TYPE ADD VALUE` 类）。
8. ✓ **RLS 例外理由在 spec §4 记录（单租户 D4，与既有 21 表一致）** — spec §4 L51 明写「单租户 dev 不建 RLS policy（AGENT-FOUNDATION D4 既定，全部既有 21 表同口径），M5 真实认证时统一补」；migration 头 + `prisma/schema.prisma` L630-631 同步登记；D4 溯源核实（AGENT-FOUNDATION-spec L76 / architecture ADR-04 L1791）；DB 实测 `pg_policies` 全库 0 条 → 与既有 21 表口径一致，非本批新开例外，符合 `framework/patterns/database-patterns.md` §8「例外须显式登记」。
9. ✓ **tsc + 既有测试不破** — 干净 HEAD(`fc905c1`) worktree 下 `tsc --noEmit` = 0 错（0 行输出）；`vitest run` = 74 文件 / 915 用例全绿（无 .env，网关凭据未注入，零外呼）。
10. ✓ **expand-only（description 声明）** — `git show 45f4d75 -- prisma/schema.prisma` 零删除行（纯新增）；migration.sql 无任何既有表 ALTER，仅 CREATE TYPE×1 / CREATE TABLE×3 / CREATE INDEX×6 / ADD FK×2（两 FK 均落在新表上）；DB 计数 24 业务表（21+3）+ 17 枚举（16+1）。

## evidence

- `npx prisma migrate status` → `9 migrations found in prisma/migrations` / `Database schema is up to date!`
- `npx prisma migrate diff --from-schema-datasource --to-schema-datamodel --exit-code` → `No difference detected.`（exit 0，dev 库无漂移）；空库重放后同命令同样 `No difference detected.`
- `DATABASE_URL=…/kolmatrix_eval_f001 npx prisma migrate deploy` → `All migrations have been successfully applied.`（9/9 从空库）
- `docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix -c '\d "MetricSnapshot"' -c '\d "WeeklyReport"' -c '\d "ShareLink"'` → 字段/类型/默认值/索引/FK 如上逐项核对
- `SELECT typname, string_agg(enumlabel, ',' ORDER BY enumsortorder) … WHERE typname='ShareLinkScope'` → `ShareLinkScope | project,quarterly`
- 计数实测：`enum_count=17`；`table_count=25`（含 `_prisma_migrations`，即 24 业务表）；`rls_policies=0`；`SELECT count(*) FROM "ShareLink"` = **0 行**（零真实公开暴露佐证）
- 回滚实测（scratch DB，`ON_ERROR_STOP=1`）：`DROP TABLE`×3 + `DROP TYPE`×1 全成功 → `tables_after_rollback=22`（21+`_prisma_migrations`）、`enums_after_rollback=16`
- 干净 HEAD worktree（`git worktree add --detach /tmp/f001-head HEAD`）：`npx tsc --noEmit` exit 0；`npx vitest run` exit 0，`Test Files 74 passed (74)` `Tests 915 passed (915)` `Duration 40.33s`
- Prisma client 可用性：`prisma.metricSnapshot/weeklyReport/shareLink` 均为对象；`ShareLinkScope` 枚举导出正确
- `git show --stat 45f4d75` → 仅 features.json / migration.sql / schema.prisma / progress.json 四文件，180 insertions，schema.prisma 侧 0 deletions

## description

不适用 —— F001 判定 **PASS**：9 条 acceptance 项 + expand-only 声明全部满足，无 blocking / 无 minor 缺陷。

## steps_to_reproduce

不适用（PASS）。复现验收本身的命令序列：

```bash
set -a; . ./.env; set +a
npx prisma migrate status
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
docker exec newkolmatrix-dev-db psql -U kol -d postgres -c "CREATE DATABASE kolmatrix_eval_f001;"
DATABASE_URL="postgresql://kol:kol_dev_password@localhost:5434/kolmatrix_eval_f001?schema=public" npx prisma migrate deploy
docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix -c '\d "MetricSnapshot"' -c '\d "WeeklyReport"' -c '\d "ShareLink"'
docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix_eval_f001 -v ON_ERROR_STOP=1 \
  -c 'DROP TABLE "ShareLink"; DROP TABLE "WeeklyReport"; DROP TABLE "MetricSnapshot"; DROP TYPE "ShareLinkScope";'
git worktree add --detach /tmp/f001-head HEAD && ln -s $PWD/node_modules /tmp/f001-head/node_modules
cd /tmp/f001-head && npx tsc --noEmit && DATABASE_URL=…/kolmatrix npx vitest run
# scratch DB 与 worktree 验后均已清理
```

## 备注（不影响 F001 判定，供编排者知悉）

- 当前**工作区** `tsc --noEmit` 有 2 处报错，均来自并行验收产生的未跟踪探针文件 `tests/unit/share-adapter.evaluator-probe.test.ts`（TS7005 @178:9 / TS2749 @206:27），非 HEAD 产品代码、非 F001 回归；干净 HEAD 下 tsc 为 0 错。建议该探针作者在提交前修好类型，否则会把工作区 tsc 门带红。
- 本次验收未修改任何产品代码、未改 `progress.json` / `features.json`、未新增测试产物（F001 为纯 schema 迁移，证据链全部由可复现命令构成）；创建的 scratch DB 与 git worktree 均已清理；L2 网关未调用（全程无凭据环境，零外呼、零对外副作用）。

---

*签名：Andy/evaluator-subagent（隔离上下文验收，结论不受协商）*
