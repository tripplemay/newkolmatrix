# M3-B-DELIVERY · F011 验收报告

- **Feature**：F011 — BL-BRIEF-GOAL：goal 确认写入口（工具 + API + 服务三件套）
- **验收角色**：Evaluator（隔离 subagent，fresh context 自行取证）
- **署名**：Andy/evaluator-subagent
- **阶段**：verifying（fix_rounds=0，首轮）
- **HEAD**：`8ecd7ae`
- **日期**：2026-07-23
- **判定**：**PASS**

---

## 1. 取证范围（实物，不采信转述）

| 类型 | 文件 |
|---|---|
| 服务（单一真相源） | `src/lib/projects/set-goal.ts` |
| 工具（柱一 internal） | `src/lib/agent/tools/confirm-brief-goal.ts` |
| API 入口 | `src/app/api/projects/[id]/goal/route.ts` |
| zod schema | `src/lib/data/schemas/project.ts` |
| 守卫真判 | `src/lib/domain/env-guards.ts`（:127-129）· `src/lib/display/env-guard-messages.ts`（:13） |
| 推进硬闸 | `src/lib/domain/env-advance.ts`（:90-97 组装 goal） |
| 工具注册 | `src/lib/agent/tools/index.ts`（:19/37）· `registry.ts`（人格 orchestrator :91 / strategy :107） |
| V4 brief 面 | `src/components/envs/brief/index.tsx`（结构基线） |
| backlog | `backlog.json` |

**测试产物（本次新增，未改任何产品代码）：**
- `tests/integration/set-project-goal.evaluator-probe.test.ts`（独立探针，6 用例，走 API/HTTP 第二入口）

---

## 2. Acceptance 逐条核对

| # | acceptance 项 | 结论 | 证据 |
|---|---|---|---|
| 1 | 服务层单一真相源（工具与 API 共用，不各写一份） | ✅ PASS | 全仓 grep：唯一向 `Project.goal` 写 `data:` 的位置是 `set-goal.ts:83`。工具与 route 均 `import { setProjectGoal }` 委托，输出仅透传 `r.goal`，无第二份写逻辑 |
| 2 | zod：targetExposure 非负整数 / periodStart<periodEnd / ISO date，坏入参 400 明示 | ✅ PASS | `projectGoalSchema`：`z.number().int().nonnegative()` + `z.iso.date()`；`setProjectGoalInputSchema.refine(periodStart<periodEnd)`。route 对坏入参返回 400 + 逐字段 `issues`。探针对抗：负浮点/NaN/3.14/缺字段/`2026-13-01`/倒置/零长度/字符串不强转 **全部被拒**；`targetExposure=0` 合法边界纳入；PATCH 倒置→400 且 `issues.path` 含 `periodEnd` |
| 3 | confirm_brief_goal 注册 + 挂 strategy+orchestrator + class=internal（无确认框 D27） | ✅ PASS | `NATIVE_TOOLS` 含 `confirmBriefGoalTool`；`getTool('confirm_brief_goal')` 命中，`class='internal'`、`buildHarm===undefined`；orchestrator（registry :91）+ strategy（:107）均声明。探针：executeTool 走 internal 分支直执行落库，**不产生 PendingAction**（count 前后一致），输出无 `harm`/`pendingActionId` |
| 4 | 写入 OperationLog 留痕 | ✅ PASS | 服务在 `$transaction` 内 `project.update` + `operationLog.create` 同事务；`kind='auto'`、`payload.action='project.goal_confirmed'`、from/to 可追溯。探针验证：API 入口 actor=`operator`；工具入口 actor=人格名（`strategy`）——审计可分辨来源 |
| 5 | V4 brief 面 19 元素零结构变更（grep 证无新增区块） | ✅ PASS | `git diff 09fbb1a..HEAD -- src/components/envs/brief/` **为空**（09fbb1a = 本批 planning 完成锚点）；brief/index.tsx `button/Button/onClick` 计数=0（裁决 #1「卡内不加按钮」）；无 `/goal`/`setProjectGoal`/`confirm_brief_goal` 引用（处置入口走 Copilot） |
| 6 | 端到端：新建(goal=null)→→match 拒 BRIEF_GOAL_NOT_CONFIRMED→确认 goal→放行→advanceStage 成功 | ✅ PASS | 双入口验证：Generator 测走工具入口，本探针走 PATCH API 入口。链路：新建 goal=null/cur=brief → `advanceStage` 返回 `ok=false` reason=`BRIEF_GOAL_NOT_CONFIRMED` 且 `logId=null`（拒绝不留痕）→ 确认目标 → `advanceStage` 放行 cur=`match`、maxReached=`match`。env-guards.ts:129 `ctx.goal==null ? deny : allow`，env-advance.ts 经 `parseProjectGoal(project.goal)` 组装 |
| 7 | backlog.json 移除 BL-BRIEF-GOAL | ✅ PASS | `backlog.json` = `[]` |

---

## 3. L1 结果

| 项 | 结果 |
|---|---|
| tsc（产品代码 + 本探针） | ✅ 无错误。注：`npx tsc --noEmit` 全仓有 3 处报错，**全部落在其它并行 evaluator 的探针文件**（`tests/unit/delivery-check.evaluator-probe.test.ts`、`tests/unit/partner-adapters.evaluator-probe.test.ts`，属 F002/F004 验收范围），不涉及 F011 产品代码或本探针文件 |
| lint（F011 三文件） | ✅ No ESLint warnings or errors |
| Generator 集成测 `set-project-goal.test.ts` | ✅ 12/12 |
| Evaluator 探针 `set-project-goal.evaluator-probe.test.ts` | ✅ 6/6 |
| 守卫回归 `env-guards.test.ts` + `env-advance.test.ts` | ✅ 50/50 |
| 合并复跑（稳定性） | ✅ 18/18，两连稳 |

## 4. L2

F011 为纯本地 DB 写入 + 服务端守卫判定，**无任何外部服务 / 计费 / 生产写入 / 资金 / key 动作**——不存在 L2 维度。P1「零真实资金/发 key 外呼」对本 feature 平凡满足（confirm_brief_goal 是 internal，不碰钱与 key）。故无「[L2] 未执行，待授权」适用项。

## 5. 独立视角补充观察（非阻断）

- **单一真相源的强证据**：不是靠 import 注释自证，而是全仓 grep 证明 `Project.goal` 的写 `data:` 只有一处（`set-goal.ts:83`）；两个入口都无法绕过服务自行写库。
- **service schema 与 tool schema 的分工正确**：tool 用不带 refine 的 `inputSchema`（executeTool 只跑基础 zod），period 倒置在 `run()` 里翻成模型可读的 `INVALID_PERIOD`（不抛裸 zod 给对话）；route 用带 refine 的 `setProjectGoalInputSchema`，倒置在 400 层被 refine 拦。两条路径都不会把非法周期写进库。
- **单租户 dev 的正确表现**：route 经 `getDevTenantId()` 服务端解析租户（不信任 URL/入参租户）；探针首轮误在夹具租户建项目导致 404，修正为 dev tenant 后通过——属测试设计修正，非产品缺陷。

## 6. Soft-watch

无。F011 acceptance 全代码层实装且实测通过，无偏离项、无数字层无证据项、无待补兜底。

---

## 7. 结构化返回

```json
{
  "feature_id": "F011",
  "result": "PASS",
  "description": "goal 确认三件套（lib/projects/set-goal.ts 单一服务 + confirm_brief_goal internal 工具 + PATCH /api/projects/[id]/goal）全部 acceptance 通过。单一真相源经全仓 grep 证实（仅 set-goal.ts:83 一处写 Project.goal，工具与 API 均委托）；zod 逐字段校验 + refine(periodStart<periodEnd) 坏入参 400 明示（含 PATCH 入口 refine 生效）；工具注册且挂 strategy+orchestrator、class=internal 无确认框（executeTool 不产 PendingAction）；OperationLog 同事务留痕（API actor=operator / 工具 actor=人格）；V4 brief 面 diff 空、0 按钮（零结构变更）；端到端双入口（工具+API）均实现 新建goal=null→→match拒BRIEF_GOAL_NOT_CONFIRMED→确认→放行到match；backlog.json 已移除 BL-BRIEF-GOAL。L1：Generator 测 12/12 + 探针 6/6 + 守卫回归 50/50，tsc/lint 于 F011 范围洁净。无 L2 维度、无资金/key 动作。",
  "steps_to_reproduce": "npx prisma generate && npx vitest run tests/integration/set-project-goal.test.ts tests/integration/set-project-goal.evaluator-probe.test.ts（18/18 通过）；git diff 09fbb1a..HEAD -- src/components/envs/brief/（空=零结构变更）；cat backlog.json（[]）"
}
```
