# AGENT-FOUNDATION F009 首轮独立验收报告

- **Feature：** F009「AI→人闸门：outbound 服务端强制 403/pending + harm 如实披露 + 留痕 + 变异测试」
- **验收人：** Andy/evaluator-subagent（隔离 fresh context，未参与实现）
- **验收轮次：** 首轮（fix_rounds=0）
- **被验提交：** fc6c5f6（F009 引入）；HEAD=bbe21c3
- **整体结论：** **PASS**（7/7 acceptance 子条全 PASS）
- **日期：** 2026-07-20

---

## 取证方式（均自行落地，不采信实现叙述）

| 证据 | 命令 / 手段 | 硬结果 |
|---|---|---|
| 闸门 smoke + D20 变异 | `npm run gate:smoke` | **exit 0**，18 断言全绿 |
| Evaluator 独立探针 | 自写 `scripts/test/_gate-indep-probe-tmp.ts`（验后已删） | **exit 0**，19 检查全 PASS |
| 构造门 tsc | `rm tsconfig.tsbuildinfo; npx tsc --noEmit` | **TSC_EXIT=0** |
| CI 绿（HEAD） | `gh run view 29746679000`（HEAD=bbe21c3，workflow_dispatch） | Lint/Typecheck/Build/Visual **全 success** |
| DB 迁移落地 | psql `information_schema.columns` | PendingAction.inputJson jsonb 已加，harmJson NOT NULL、confirmationTokenHash/expiresAt 就位 |
| 源码结构判定 | 逐行读 execute.ts / gate.ts / harm.ts / to-ai-sdk-tools.ts / context.ts / route.ts | 见逐条 |

> 独立探针不复用 smoke 自我断言，专攻「断言是否真覆盖 acceptance」：120 位批量 harm 不折叠、payloadHash 抗 JSONB 重排 + 防篡改、pending 阶段 DB 令牌 NULL、internal 不落 PendingAction。

---

## 逐条 acceptance 判定

### 1. outbound 服务端强制门控 + 模型永远拿不到令牌 — **PASS**
- **唯一执行入口强制**：`executeTool`（execute.ts:16）是唯一入口（registry 唯一，`grep runTool` 仅注释）。outbound 门控在 execute.ts:36 `if (tool.class === 'outbound' && !ctx.confirmationToken)` → 返回 pending 信封，**不走** line 47 的 `tool.execute`，副作用不发生。
- **模型 loop 结构上拿不到令牌**：模型路径 route.ts:84 `buildToolContext(...)`（context.ts:37-47 **从不设** `confirmationToken`）→ to-ai-sdk-tools.ts:25 `executeTool(name,input,ctx)` → outbound 分支。令牌仅在 `confirmPendingAction`（gate.ts:127）内 `randomBytes(32)` 签发，该函数只由 `/api/gate/confirm`（人）触达。
- **pending 信封无任何 token 字段**：`PendingActionEnvelope`（harm.ts:38）只含 `status/pendingActionId/toolName/harm`。G1 断言信封无 `confirmationToken`/`token`；独立探针 P2 进一步确认 pending 阶段 DB 行 `confirmationTokenHash == NULL`、harm 亦不含 token 字段。
- **对 F006 全人格一视同仁**：门控在 executeTool，与 `ctx.agentId` 无关。smoke 以 `agentId:'reach'` 跑，独立探针亦然。
- 观察（非阻断）：字面「403」在 /api/agent 流内实现为 in-band `status:'pending'` 信封（HTTP 200 SSE），非 HTTP 403 状态码；gate/confirm|reject 错误路径用 409。核心保证（不执行副作用 + pending + harm + 模型无法自我放行）完全达成，「403/pending」为斜杠择一，接入模型 loop 的正是 pending 信封形态。

### 2. harm 单一 zod schema 如实披露 — **PASS**
- **单一 schema**：`harmSchema`（harm.ts:11-33）唯一定义，字段覆盖 动作`action`/对象`targets[]`/金额`amount`+`currency`或数量`quantity`/不可逆`irreversible`/证据`evidence`/过期`expiresAt`，红标 `label: z.literal('对外·不可撤销')`。
- **批量不折叠**：send-outreach.ts:27 `targets: input.recipients`（全名单）。独立探针 P1 以 **120 位**收件人实测：`harm.targets.length===120`、首尾如实、`Set.size===120`（无省略占位）、`quantity===120`、`irreversible===true`、红标强制、`evidence` 非空。G2 另验 3 位全名单。
- **红标强制**：createPendingAction（gate.ts:67-71）用 `label: HARM_LABEL` 覆盖并经 harmSchema 二次 parse，绕不过。
- 观察（非阻断，合批次范围）：本批仅实装 send_outreach 一个 outbound 工具（批次明言「本批无真实 outbound 工具，F009 造至少一个」）。报价/放款场景（金额/授权范围/收款方）由单一 harmSchema 的 `amount/currency/scope/targets` 字段覆盖但未接成工具，真实投递分期 M3。

### 3. 无阈值分级（D28）— **PASS**
- `grep -nE "amount|threshold|>[0-9]" execute.ts gate.ts` → **NONE**。门控分支只读 `class` 与 `confirmationToken`，与金额/数量无关，结构上不存在阈值旁路。
- G4：50 位批量与 3 位走**完全相同** pending 流程。$100 vs $10,000 因无金额分支而必然同流程。

### 4. internal 动作不弹确认框（D27 反假闸门）— **PASS**
- executeTool 只门控 outbound；internal（search_kols/get_kol_detail）直落 `tool.execute`。G3：search_kols 非 pending。独立探针 P6：internal 执行前后 `PendingAction.count` 不变（零新增）。

### 5. 令牌 只存 hash / 短 TTL / 单次 / 绑 payloadHash + 确认拒绝均留痕 — **PASS**
- **只存 hash**：`token=randomBytes(32).hex`（gate.ts:127），落库 `confirmationTokenHash=sha256(token)`（:128,:140），无明文。G5 正则 `^[a-f0-9]{64}$`；P2 pending 阶段为 NULL。
- **短 TTL**：`expiresAt = now + 15min`（TOKEN_TTL_MS gate.ts:25,:65），confirm 校验过期（:113）。P1 实测 harm.expiresAt 为 ~15min 未来时刻（gate 覆盖工具自带值）。
- **单次**：status pending→executed（:111 校验 + :140 更新）。G5 重复确认被拒。
- **绑 payloadHash**：`payloadHashOf(toolName, input, tenantId)` sha256（:43-51），confirm 对**重读的 inputJson** 二次校验（:120-124）。`stableStringify`（:28-40）递归排序 key，抗 JSONB 重排。
  - 独立探针 P3：key 乱序 → 同 hash（order-independent 成立）；内容变 → hash 变（真绑 payload 非常量）。
  - P4：直接 UPDATE DB `inputJson` 篡改 → confirm 抛「payloadHash 不匹配」且副作用未执行。
  - P5：未篡改 PA 经 JSONB 往返 confirm 成功（证 stableStringify 端到端必要）。
- **确认/拒绝均留痕**：confirm → OperationLog `kind:irrev`（:142）；reject → `kind:block`（:174）；拦截 → `kind:gate`（:85）。

### 6. 不可逆执行后写 irrev 且确认与留痕同事务 — **PASS**
- `confirmPendingAction` 用 `prisma.$transaction([ update status=executed, operationLog.create kind:irrev ])`（gate.ts:137-151），原子同事务。G5：`kind:irrev` 计数===1、可按 kind 筛（schema `@@index([kind])`）。
- 观察（非阻断）：`tool.execute`（副作用）在事务**之前**执行（gate.ts:131），故 mock 副作用不与 executed+irrev 同事务。acceptance 只要求「确认(executed)与留痕(irrev)同事务」，已满足；真实幂等投递分期 M3。

### 7. 变异测试 D20（断言验行为非源码关键字）— **PASS**
- gate-smoke.ts:93-102 变异 = 直调 `tool.execute(...)` 绕过 executeTool 门控。此路径**等价于**删掉 execute.ts:36-45 后落到 line 47 的 `tool.execute`——即「把服务端拦截退回原状、允许 Agent 直接执行 outbound」的原状等价物。
- 变异使 SENT 标记 OperationLog 发生（`afterMut > beforeMut`）。G1 断言键为 `countSent === before`；变异恰好移动 G1 所校验的那一量 → G1 必然变红。证 G1 验的是**可观测副作用**（SENT 留痕），非源码关键字（未验 'OutboundGateError'/'403' 字面）。
- 我独立判断：这是**有效**变异而非走过场——变异触碰的正是 G1 的观测量，若 G1 改为源码断言则变异无法触发。观察（非阻断）：D20 以「等价论证」（变异翻转 G1 所测量）呈现，而非以程序化切断门控后**重跑 G1 字面断言**呈现；论证成立，后续可加强为真正 toggle-and-rerun。

---

## 整体结论

**PASS —— 7/7 acceptance 子条全 PASS。** 构造门（tsc 本地 0 / CI lint+typecheck+build 在 F009 push 与 HEAD dispatch 均绿）成立；闸门 smoke exit 0（18 断言）；Evaluator 独立探针 exit 0（19 检查）；D20 变异有效。服务端强制门控在唯一执行入口落地、模型 loop 结构上拿不到令牌、harm 单一 zod 如实披露不折叠、无阈值、internal 不加闸门、令牌四安全属性齐全、确认与 irrev 留痕同事务——均以实测 + 源码行号 + DB 事实独立验证。

**非阻断观察（记录不打回）：**
1. 「403」以 in-band pending 信封（HTTP 200 SSE）实现，非 HTTP 403 状态码；核心保证完全达成。
2. 本批仅 send_outreach 一个 outbound 工具（合批次范围）；报价/放款由单一 harmSchema 字段覆盖但未接工具，M3 补。
3. 副作用 `tool.execute` 在 executed+irrev 事务之前执行；acceptance 要求的「确认与留痕同事务」已满足，真实幂等投递分期 M3。
4. D20 以等价论证呈现，成立且非空洞，后续可强化为 toggle-and-rerun。

**CI 说明：** F009 push（fc6c5f6）Lint/Typecheck/Build 全 success，唯 Visual regression failure——根因是 F008 IA 重构致驾驶舱基线漂移（F009 无 UI 面），经 baseline 重生后 HEAD=bbe21c3 的 workflow_dispatch 四 job 全 success。visual baseline 属 F010 acceptance，非 F009 判据。

**署名：** Andy/evaluator-subagent
