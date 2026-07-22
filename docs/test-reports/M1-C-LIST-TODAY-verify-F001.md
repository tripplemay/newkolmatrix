# M1-C-LIST-TODAY — F001 列表页 RSC 直读 Project · 隔离验收分报告

- **验收人：** Andy/evaluator-subagent（fresh context，fan-out feature agent）
- **日期：** 2026-07-22
- **被验对象：** main HEAD `5a666a9`（F001 实现 commit `7f86062` + force-dynamic 修复 `42a534a`）
- **环境：** 本地 standalone `http://127.0.0.1:3000`（HEAD 构建产物）+ dev DB（容器 `newkolmatrix-dev-db`，pg16/pgvector，四 canonical 项目 seed 态）
- **结论：PASS**（acceptance 全条命中，零缺陷）

---

## 1. 逐条 acceptance 判定

### 1.1 去 'use client' 转 RSC — PASS

- `grep -n "use client" src/app/admin/campaigns/page.tsx` 仅命中 :8-9 **注释**，无指令；`useRouter / router.push / useState / useEffect` 全零命中。
- 页面为 `export default async function CampaignsPage()`（:55），RSC 内直调 prisma。
- 附加实证（`42a534a` 修复项）：`export const dynamic = 'force-dynamic'`（:21）在案，且经 §1.6 数据变异实测证实为**运行时查库**而非构建期冻结。

### 1.2 getDevTenantId + findMany(include game, orderBy createdAt asc) — PASS

- `page.tsx:56-61`：`getDevTenantId()` → `prisma.project.findMany({ where: { tenantId }, include: { game: true }, orderBy: { createdAt: 'asc' } })`，与 spec §2 F001 逐字段一致（含 where tenantId）。

### 1.3 Planner 修订口径：createdAt asc 卡序 = mock 序 xg/lc/aw/mf — PASS

- seed 实物（`scripts/seed/canonical-projects.ts:54-99,113`）：`SEED_PROJECTS` 数组固定 xg→lc→aw→mf 顺序 for 循环 upsert，createdAt 单调递增。
- DB 实测：`SELECT string_agg(slug,',' ORDER BY "createdAt" ASC)` → `xg,lc,aw,mf`。
- SSR 实测：页面 4 个 anchor 依序 `xg?env=reach / lc?env=match / aw?env=delivery / mf?env=insight`；avatar 色轮按 index 稳定（lc index1 = `#01B574` 观测在案），零重排零错位。

### 1.4 「进入」钮 Link 化，client 泄漏归零 — PASS

- 代码：`page.tsx:136-144` `<Link href={stageHref(p.linkId, p.cur)}>` 包 Button；`stageHref`（stage-routing.ts:47-49）产出 `/admin/campaigns/{id}?env={stage}`。
- SSR HTML 实证：静态 HTML 含 **4 个真实 `<a href="/admin/campaigns/...">` 标签**（非 flight 数据转义），f008 §4 断言复活前提成立。
- Button 为 'use client' island（`components/common/Button.tsx:1`）——acceptance 明示无碍；页面自身无任何 client hook。

### 1.5 字段映射复用 M1-B display 层 — PASS

- game=`row.game?.name ?? row.name`（:82，关联 Game.name，avatar 首二字「星轨/料理/暗域/萌宠」SSR 在案）。
- budget=`formatBudget`（:84-87）：SSR 实测 `$18,000 / $12,000 / $9,000 / $7,500` 与 mock 串同形。
- goal=`formatGoalText(parseProjectGoal(goal))`（:67,88）：SSR 实测 4 条 D9 合成串（`目标曝光 300 万 · 周期 2026-07-01 ～ 2026-07-31` 等）。
- health=RSC 内 `computeHealth`（:68-77）：null 因子组装与 `[id]/page.tsx:42-51` **逐字段一致**（targetExposure=goal?.targetExposure??null / actualExposure=null / budgetTotal Number 转换 / budgetSpent=null / periodStart / periodEnd / now / blockerCount:0），逐行比对确认。
- PILL_TONE 走 `lib/display/health-tone` 单点、HEALTH_LABEL 走 `lib/display/health-label` 单点（F005 收敛消费方，import 实证）。
- mock 引用：`grep mockProjects|mock/projects|mock/today src/app/admin/campaigns/` 仅 :8 注释提及，零实际 import。

### 1.6 DB 数据实证（spec §5：改行→变→复原）— PASS

| 步骤 | 操作 | 结果 |
|---|---|---|
| 基线 | curl /admin/campaigns | 原名《星轨协议》· 全球公测预热在案；oplog=0, pending=0 |
| 改 | `UPDATE "Project" SET name='《星轨协议》· EVAL-F001-MUTATION' WHERE slug='xg'` | UPDATE 1 |
| 验 | curl 同页 | `EVAL-F001-MUTATION` 出现 ×2（HTML+flight）——**不重启不重建即变，force-dynamic 运行时读库证实** |
| 复原 | `npm run seed:projects`（幂等 upsert） | 4 行 ✓；curl 复测变异串归 0、原名回归 ×2；createdAt 序仍 xg,lc,aw,mf；PendingAction 仍 0 |

### 1.7 【D2 延续】四项目 health 全 cr = 预期 — PASS（非缺陷）

- SSR 实测 health pill 文案：`>风险<` ×4，`>正常<`/`>注意<` ×0（HEALTH_LABEL.cr='风险'）。
- 与详情页同源同值（同一 computeHealth + 同一 null 因子组装），spec §4 预告分值 xg26/lc37/aw23/mf20 与并行例程巡检落痕吻合（26/37/23/20，见 §3 备注）。

### 1.8 campaigns.png 基线对账重生 + waitFor 保留 — PASS

- 对账记录：commit `7f86062` 正文明载「campaigns-darwin.png 重生：21,987px 漂移目检对账=纯数据级（pill×4 变红 + goal 句×4 换合成串），布局结构零变化」，Bin 284562→273440。
- linux 基线经 update-visual-baselines workflow 重生（`11e67ba` chore(visual) [skip ci]）。
- waitFor『只做进入』保留：`tests/visual/workbench.spec.ts:26` 实物在案。
- **独立复证**：本机针对性复跑 `BASE=http://127.0.0.1:3000 npx playwright test -c tests/visual/playwright.evaluator.config.ts -g "campaigns list visual baseline"` → **1 passed (2.3s)**，当前 HEAD 渲染与 darwin 基线一致。

### 1.9 lint + tsc + test:unit 绿 — PASS

- 前置（testing-env-patterns §3）：`npx prisma generate` 先行。
- `npx tsc --noEmit` → exit 0，零错误。
- `npm run lint` → `✔ No ESLint warnings or errors`（0 err / 0 warn，无 §15 矩阵触发）。
- `npm run test:unit` → **12 files / 139 tests 全 passed**（715ms）。
- 本机 Node v25.7.0、项目无 `.nvmrc`；全套本机绿，无版本误报面。

---

## 2. 判定汇总

| Acceptance 条目 | 判定 |
|---|---|
| 去 'use client' 转 RSC | PASS |
| getDevTenantId + findMany(include game, createdAt asc) | PASS |
| Planner 修订卡序（零重排零色轮错位） | PASS |
| 进入钮 Link 化（真实 anchor，client 泄漏归零） | PASS |
| display 层复用（game/budget/goal/health 逐字段） | PASS |
| D2 全 cr 预期非缺陷 | PASS（确认非缺陷） |
| campaigns.png 对账重生 + waitFor 保留 | PASS |
| lint + tsc + test:unit | PASS |
| spec §5 F001（RSC grep + DB 改行→变→复原 + 真实 anchor） | PASS |

**F001 = PASS，0 问题。**

## 3. 夹具与环境备注（供汇总者与就绪回归 agent 知悉）

- 本 agent 的数据变更（xg 改名）已按「改→验→立即恢复」闭环，Project 四行 seed 复原、序不变、PendingAction 全程 0。
- **在途观察（非 F001 缺陷、非本 agent 产生）**：最终态检查发现 OperationLog=4 行（kind=auto, actor=strategy, 例程巡检 ×4，写入 09:42:49 UTC）。时间线排除本 agent 全部操作（seed 脚本无 OperationLog 写点、curl 仅只读列表页、unit 跑于该时刻前 4 分钟）；与并行 F004 验收 agent 手动触发 `routine:health-scan` 的验收步骤吻合。**未清除**——属他人在途夹具，清除会干扰其验收；campaigns 页不消费 OperationLog，对本 feature 判定无影响。基线态最终复零由 F004 agent / 就绪回归 agent 按 D-H 收口。
- 未执行项：无 L2 面（本 feature 无外部调用/计费依赖，全部验收面 L1 本地完成）。
