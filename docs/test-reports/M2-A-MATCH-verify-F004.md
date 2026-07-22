# M2-A-MATCH F004 验收记录 — 批准动线 + →reach 守卫解锁（S10 消解）

- **署名：** Andy/evaluator-subagent（隔离上下文，fan-out 单 feature 验收）
- **日期：** 2026-07-22
- **阶段：** verifying（首轮）
- **被验对象：** commit `693c215 feat(M2-A-MATCH-F004)`（铁律 10 归属核对 ✓，该 commit 落 approve-plan.ts / 两 route / env-guards 扩展 / match-approve.test.ts）
- **结论：PASS**（acceptance 7 项全 PASS，0 PARTIAL / 0 FAIL）

## 环境与前置

- L1 前置（testing-env-patterns）：`npx prisma generate` 已跑；vitest 全 node 环境（无 jsdom），Node 25 localStorage 坑不适用；repo 无 `.nvmrc`。
- 端口纪律遵守：未起任何 dev/standalone server，路由层验证 = 直调 route handler（`POST` 导出函数）。
- DB 基线态（验收前实测）：`{matchPlan:0, planKol:0, matchCandidate:0, pendingAction:0, operationLog:0}` + 1 tenant + 4 canonical 项目 —— D-H 基线成立。

## 逐条 acceptance 判定

### 1. POST /api/match/plans/{id}/approve：internal 动作（不产生 PendingAction、无确认弹窗）— PASS

- 实物：`src/app/api/match/plans/[id]/approve/route.ts`（薄封装）→ `src/lib/match/approve-plan.ts`（批准语义全在服务层）。
- `grep -rn pendingAction src/lib/match/ src/app/api/match/` = **空**（approve 路径零 PendingAction 写入点）。
- 路由直调探针全程断言 `PendingAction 计数 == 基线 0`（含批准/重放/409/404/refresh 全流程）✓。
- 双口径：批准用 `publicId` 直调成功（approve-plan.ts:50 `OR:[{id},{publicId}]`）✓。

### 2. 事务 = 目标 plan approved + approvedBy/At + 同项目其余 draft→superseded — PASS

- 实物：approve-plan.ts:72-85 `prisma.$transaction([update(approved+approvedBy+approvedAt), updateMany(draft→superseded)])` 同事务原子。
- 集成测试变异断言 1（match-approve.test.ts:100-129）+ 直调探针 DB 断言：planB approved / approvedBy='operator' / approvedAt 落库 / planA superseded ✓；全项目 approved 恒 ≤1 守恒断言 ✓。

### 3. 随后 advanceStage → reach（S10 首个生产消费者；advance 失败不回滚批准，响应注明）— PASS

- 实物：approve-plan.ts:90-94 批准后调 `advanceStage`；route.ts:41-43 响应带 `advance:{ok,reason,cur}` 注明。
- 集成测试变异断言 2：批准后真推进 cur match→reach + maxReached=reach + OperationLog(kind=auto) 留痕 ✓。
- 集成测试变异断言 6：已在 reach 的项目批准新 draft → 批准生效、推进被拒（reason=DEPENDENCY_NOT_IMPLEMENTED，reach→delivery 归 M3）、互不回滚 ✓。
- 注：实装 advanceStage 无 target 参数（推进到 next stage），cur='match' 时 next 恒为 reach，与 spec 写法 `advanceStage(projectId,'reach')` 语义等价，不构成偏差。

### 4. env-guards →reach 真判定 + EnvGuardContext 扩 hasApprovedMatchPlan + 零残留 — PASS

- env-guards.ts:122-127：reach 分支 = `hasApprovedMatchPlan ? allow() : deny('MATCH_PLAN_NOT_APPROVED')`，D9 占位已替换。
- `hasApprovedMatchPlan` 为**必填非可选**（:58-62，防「忘了查」静默降级掩盖调用方 bug）；守卫保持纯函数不读 DB ✓。
- 两调用点同步组装：`env-advance.ts:74-84`（恒查不按分支，消「漏组装」缺口）+ `campaigns/[id]/page.tsx:43-72`（RSC 查好传 ProjectDetail → canEnter ctx :114-119）✓。
- grep 字面量残留核查：`DEPENDENCY_NOT_IMPLEMENTED` 现存命中 = 类型定义 :37 + delivery :130 / insight :133（M3 依赖表未建，spec 明文保留）+ 展示层文案映射——**→reach 分支零残留** ✓。
- 单测（env-guards.test.ts:143-183）：无批准拒 MATCH_PLAN_NOT_APPROVED / 有批准放行 / 真判定理由与 D9 占位可区分 / hasApprovedMatchPlan 不旁路其他守卫（M3 两条仍拒 + goal 判据不受影响）✓。

### 5. POST /api/match/refresh?projectId= 手动重跑入口（本批无 UI 按钮）— PASS

- 实物：`src/app/api/match/refresh/route.ts`（三口径 slug/id/publicId 解析；失败 502 明示，与 F005 lazy 静默降级刻意区分）。
- 直调探针：缺 projectId → 400 ✓；项目不存在 → 404 ✓；真跑 → 200，`candidates.total=20`（topN）+ `plans:3` ✓；重跑后 approved plan 不动（P4）✓。
- 无 UI 入口：`grep -rn "match/refresh" src/` 除路由自身零命中 ✓（符合「本批无 UI 按钮」）。
- **[L2] 真网关用量注明：embedText × 1（bge-m3，短查询文本单次往返，直调探针 D3 段），在 spec §4 授权口径内（最小用量）。**

### 6. 集成测试：事务原子/单选/canEnter('reach') 放行/未批准拒/幂等或 409 +【D20】变异断言 — PASS

- `tests/integration/match-approve.test.ts` 7 用例全过（打真库，夹具租户 `test-tenant-m2a-approve-<pid>` 独立化，afterAll Cascade 清零）。
- 六条 D20 变异断言逐条在案：①漏 supersede/半事务 ②守卫未解锁/advance 未接线 ③守卫恒放行（假守卫）④重放重写 approvedAt ⑤多选（approved>1）⑥advance 失败连带回滚——每条有对应杀变异断言。
- 「批准后 canEnter('reach') 放行」补充直证：探针断言批准前 `canEnter(reach).allowed===false` → 批准+advance 后 `===true` ✓。
- 未批准拒：advanceStage 拒 MATCH_PLAN_NOT_APPROVED、游标不动、零留痕（掺水指标防护）✓。
- 重复批准：200 already=true、approvedAt 不改写、advance=null 不重推进（幂等）✓；superseded → 409（PLAN_SUPERSEDED）✓；不存在 → 404 ✓。

### 7. lint + tsc + test:unit 绿 — PASS

```
npm run test:unit  → Test Files 28 passed (28) · Tests 307 passed (307)
npx tsc --noEmit   → exit 0
npm run lint       → ✔ No ESLint warnings or errors
```

## 路由层直调探针（本次验收产物，scratchpad 临时脚本，不入仓）

19/19 断言 PASS。覆盖：approve 200/幂等 200/409/404 · publicId 双口径 · PendingAction 恒 0 · canEnter 前拒后放 · refresh 400/404/200 真跑 · P4 approved 不动 · D-H 终态复原。

## D-H 清态复原（实测）

- 探针用**临时项目**（不动 4 canonical 项目），测毕 OperationLog 显式删除 + 项目级联删除（三表 FK Cascade）。
- 终态计数实测 == 基线：`{matchPlan:0, planKol:0, matchCandidate:0, pendingAction:0, operationLog:0}` ✓。

## Soft-watch（不阻断）

- 无。lint 0 warnings；无 acceptance 偏离项。

## 复现关键命令

```bash
npx prisma generate
npx vitest run tests/integration/match-approve.test.ts tests/unit/env-guards.test.ts   # 39/39
npm run test:unit && npx tsc --noEmit && npm run lint
grep -rn "DEPENDENCY_NOT_IMPLEMENTED" src/    # 仅类型定义 + delivery/insight(M3) + 文案映射
grep -rn "hasApprovedMatchPlan" src/          # 两调用点组装 + 守卫 + 客户端 prop
node --env-file=.env --import tsx <scratchpad>/f004-route-probe.ts   # 19 断言（含 L2 embedText ×1）
```
