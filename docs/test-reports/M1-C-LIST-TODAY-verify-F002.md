# M1-C-LIST-TODAY 验收分报告 — F002 PendingAction expand（projectId/agentId）+ aggregatePending 扩列

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被验 commit：** `5bdc47a`（feat(M1-C-LIST-TODAY-F002)）；验收基于 main HEAD `5a666a9` 工作树 + 本地 dev DB（容器 newkolmatrix-dev-db）实测
- **结论：PASS（6/6 acceptance 全过，零问题）**

---

## 逐条 acceptance 判定

### 1. expand 迁移：projectId String? + agentId String?（nullable，expand-contract 回滚安全）— PASS

- **schema 实物：** `prisma/schema.prisma:187-188` — `projectId String?` + `agentId String?`（模型内注释明示 nullable expand / 软引用不强 FK，同 OperationLog D13 先例）。
- **migration 实物：** `prisma/migrations/20260722082147_pending_action_project_agent/migration.sql` — 纯 `ALTER TABLE "PendingAction" ADD COLUMN "agentId" TEXT, ADD COLUMN "projectId" TEXT;`（无 NOT NULL、无 DEFAULT、无数据改写——回滚安全的 expand 半步）。
- **库内实证：** `docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix -c '\d "PendingAction"'` → 两列均 `text` 且 Nullable；`_prisma_migrations` 含 `20260722082147_pending_action_project_agent`（已应用）。

### 2. 闸门创建点从 ToolContext 填列——只填不判，null 合法 — PASS

- **创建点唯一性：** 全仓 `grep -rn "pendingAction.create" src/` 仅命中 `src/lib/agent/gate/gate.ts:72` 一处——覆盖面完整。
- **实物：** `gate.ts:83-84` — `projectId: ctx.projectId ?? null, agentId: ctx.agentId`，无任何校验/分支（只填不判）；`ToolContext.projectId` 类型 `string | null | undefined`（tools/types.ts:26），`agentId` 非可选恒有值。
- **实证（Evaluator 独立探针，见下 §独立探针）：** 带 `projectId:'eval-proj-777'` → 列落值；ctx 完全缺省 projectId（undefined 分支）→ 库内 NULL；两态 agentId 均落 `'match'`。

### 3. aggregatePending select + 返回结构扩两字段，harm 原样透传 — PASS

- **实物：** `src/lib/agent/orchestrator.ts:55-64` select 增 `projectId: true, agentId: true`；`:73-74` 返回映射带回；`PendingItem` 接口（:31-42）扩 `projectId: string | null` + `agentId: string | null`；`:71` `harm: r.harmJson` 原样透传注释仍在，无改写逻辑。
- **实证：** 独立探针中 aggregatePending 返回 2 条，itemA `projectId=eval-proj-777 agentId=match`、itemB `projectId=null`；harm 逐字段比对（summary/action/irreversible/targets）与写入值完全一致，未被编排层改写。

### 4. 回归测试（aggregatePending 新字段 + gate 创建两态）— PASS

- **实物：** `tests/integration/pending-action-columns.test.ts`（随 F002 同 commit 落盘）——3 条 case：带 ctx.projectId 落列 / 无 projectId null 合法 / aggregatePending 原样带回（含 harm 透传断言）；打真库、fixture tenant 自建自清（env-advance 范式）。
- **实跑输出：** `npx vitest run tests/integration/pending-action-columns.test.ts --reporter=verbose` → **3/3 passed**（真库往返，非 mock）。
- **口径说明：** acceptance 括注「复用 gate 测试基座」——实现为新建集成测试文件直调产品真实 gate 路径 `createPendingAction`（而非字面扩展 `scripts/test/gate-smoke.ts`）。要求的回归覆盖面（三条断言）完整存在且通过，判实质满足。

### 5. schema 变更 + migration + 引用代码同一 commit — PASS

- `git show --stat 5bdc47a` → 同 commit 含：`prisma/schema.prisma` + `prisma/migrations/.../migration.sql` + `src/lib/agent/gate/gate.ts` + `src/lib/agent/orchestrator.ts` + `tests/integration/pending-action-columns.test.ts`。

### 6. lint + tsc + test:unit 绿 — PASS

- **本地 HEAD 实跑（L1 前置已按 testing-env-patterns §3 先 `npx prisma generate`）：**
  - `npx tsc --noEmit` → 0 errors；
  - `npm run lint` → No ESLint warnings or errors；
  - `npm run test:unit`（vitest run）→ **12 files / 139 tests 全过**（含真库集成测试）。
- **CI 归因（5bdc47a run 29903937676）：** Lint ✅ / Typecheck ✅ / Unit + integration tests ✅（acceptance 要求的三项全绿）；同 run 的 Build ❌ / Visual ❌ 系 **F001 在途缺陷连带**（log 实证：`Error occurred prerendering page "/admin/campaigns"` + `Environment variable not found: DATABASE_URL`——列表页构建期静态化连 DB，42a534a force-dynamic 修复；visual 为 campaigns.png 在途漂移，后随基线重生消解），非 F002 引入。含 F002 的后续 commits `948d327` / `2289343` / `9d4aaa4` 全 workflow 绿。

---

## Evaluator 独立探针（不依赖 Generator 测试）

脚本：scratchpad `f002-eval-probe.ts`（自建 fixture tenant `eval-probe-f002-*`，agentId 取 'match' 与 Generator 测试的 'reach' 区分；raw SQL 直读绕过 prisma client 类型层）。

```
PROBE_PASS
  SQL rowA projectId=eval-proj-777 agentId=match (期待 eval-proj-777 / match)
  SQL rowB projectId=null agentId=match (期待 null / match)
  aggregatePending itemA projectId=eval-proj-777 agentId=match; itemB projectId=null
  harm 透传 summary="Evaluator 独立探针 harm（勿改写）" irreversible=true targets=["kol-eval-1","kol-eval-2"]
CLEANUP_DONE
```

探针毕即清（operationLog → pendingAction → tenant 级联删除），实证 Tenant 表仅剩 `dev`、探针相关行数归零。

## 数据基线与环境记录

- 验收开始时 PendingAction=0 / OperationLog=0（D-H 基线态确认）；本 agent 全部写入均已恢复零行。
- 验收末次抽查见 dev tenant 下一条 `PendingAction id=evalf006fixture001 status=pending`——为**并行 F006/f008 验收 agent 的活跃夹具**（命名自明，非本 agent 产物、非产品缺陷），按共享环境纪律不代删，由其属主自清。
- Node 25.7.0，仓内无 `.nvmrc`（testing-env-patterns §4 前置不适用；vitest 固定 node 环境无 jsdom，本地全绿与 CI Node 版本无冲突面）。
- 未涉 L2（本 feature 全部验收面本地闭环，无网关/计费调用）。

## 复现步骤（一键）

```bash
cd /Users/yixingzhou/project/newkolmatrix
npx prisma generate && npx tsc --noEmit && npm run lint && npm run test:unit
npx vitest run tests/integration/pending-action-columns.test.ts --reporter=verbose
docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix -c '\d "PendingAction"'
git show --stat 5bdc47a
```
