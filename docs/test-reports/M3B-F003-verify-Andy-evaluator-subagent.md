# M3-B-DELIVERY · F003 验收报告（隔离 evaluator subagent）

- **Feature**：F003 — Deal 生成接线（commit_quote → Deal）+ Deal 资金状态机
- **executor**：generator（本报告为 evaluator 首轮 verifying）
- **验收人**：Andy / evaluator-subagent（fresh context，自行磁盘取证）
- **日期**：2026-07-23
- **结论**：**PASS**
- **实现 commit**：`1f326f4 feat(M3-B-DELIVERY-F003)`

---

## 0. 取证边界与独立性声明

- 全程未读取 Generator 的实现叙述作为输入；结论只依据 spec §5 F003 acceptance + P2/P3 决策 + 实测证据。
- 未修改任何产品代码（`src/` / `prisma/` / 配置 / 文档基线）；`git status --short src/ prisma/` = 空。
- 新增测试产物一件：`tests/integration/m3b-f003-evaluator.test.ts`（65 用例，合法边表与断言独立推导，不 import 实现常量）。
- D20 检测力用「改产品代码源 → 跑测试看翻红」独立复核，复核后逐次 `git checkout` 还原（见 §3）。
- 环境前置：Node v25.7.0；本地 Postgres `newkolmatrix-dev-db`:5434 healthy；`prisma generate` 先行；`migrate status` = up to date（8 迁移）。

---

## 1. Acceptance 逐条判定

| # | acceptance 条款 | 判定 | 证据 |
|---|---|---|---|
| 1 | commit_quote 执行后**同事务**落 Deal（projectId+kolId upsert 幂等）+ 五条 Deliverable | **PASS** | 集成测 + e2e ①；同事务性用回滚探针独立取证（§2.1） |
| 2 | content/contract/escrow/ad_disclosure required=true；key 视 Quote.deliverables 含 key 交付 → required 或 na | **PASS** | 五条件 kind 集合精确校验；无 key → `{required:false,status:'na'}`；含 key → `{required:true,status:'pending'}` |
| 3 | termsJson 含金额/币种/交付物/范围快照 | **PASS** | 断言 `amount/currency/deliverables/scope/snapshotAt` 全项（非 USD/EUR + 中文范围也过） |
| 4 | dealAdvance 纯函数流转合法态 + 非法流转拒绝 | **PASS** | 独立 7×7 矩阵（49 组）+ 拒绝码分支 + 脏值/空值不抛错不放行 + 纯函数三性 |
| 5 | D20 变异（破坏流转约束如允许跳态 → 测试翻红） | **PASS** | 8 个真实源码变异体（M1–M8）全部正确翻红（§3） |
| 6 | 集成测：commit_quote 全链后 Deal + 5 Deliverable 在场且幂等重入不重复建 | **PASS** | gateActionId 重放分支 + 服务层连调三次 + 人工核验不被覆盖 |

---

## 2. 关键取证细节

### 2.1 同事务落库（回滚探针 —— evaluator 补强）
`ensureDealForQuote` 用 `ctx.db ?? prisma`，闸门 `execute` 注入 `db: tx`（`gate.ts:371`）。
为验证 Deal 写入确实进闸门事务而非逃逸到全局连接，我构造回滚探针：在外层 `prisma.$transaction` 内调用后主动抛错，断言事务内可见 1 行、回滚后 `deal/deliverable/operationLog` 归零。真实实现通过。

**独立价值**：把实现改成 `const db = prisma`（M9，忽略 ctx.db）后——Generator 的 `deal-generation.test.ts` 仍 8/8 全绿（未覆盖同事务性），而我的探针 2 用例翻红。真实代码本身正确满足「同事务」acceptance，此为 Generator 套件的覆盖缺口，已由本报告的测试补齐；不构成 F003 缺陷。复核后 `git checkout` 还原，DB 清零。

### 2.2 「有 committed quote 必有 Deal」
夹具租户内枚举所有 `Quote(status=committed)` 反查 Deal，无孤儿。committed 报价必带 `gateLogId`（不存在不经闸门的 committed 行）。

### 2.3 P1 零资金动作（F003 范围）
生成 Deal 全程 `Payout.count=0` / `GameKey.count=0`；F003 只落交付条件，不触发任何资金/发放行。全链 `delivery:e2e` 尾部申报「真实资金动作 0 · 真实 key 发放 0」。**[L2] 未执行，待授权**：真实 partner 外呼本批不存在（mock 恒定，无 REAL 分支），无需 L2。

### 2.4 幂等三条路径
- gateActionId 重放：`dealCreated=false`，Quote/Deal 计数不变，条件仍 5 条；
- 服务层连调三次：Deal 一行、`deliverablesCreated=0`；
- `skipDuplicates` 缺行自愈只补不覆盖：人工核验 `met + evidenceRef` 原样保留。

---

## 3. D20 变异检测力独立复核（改源→翻红→还原）

对**产品源码**逐个植入变异后跑测试，确认断言有真实检测力（每次 `git checkout` 还原，最终 `git status src/` 空）：

| 变异体 | 改动 | 结果 |
|---|---|---|
| M1 | `deal-advance.ts` 跳态放行（`ti===fi+1` → `ti>fi`） | ✅ 翻红 8 failed |
| M2 | 删 `TERMINAL_STATE` 拦截（终态可复活） | ✅ 翻红 4 failed |
| M3 | `blocked → 任意态` 恒放行（含 completed） | ✅ 翻红 3 failed |
| M4 | 未知态按合法放行（脏值放行） | ✅ 翻红 2 failed |
| M5 | `deliverable-plan.ts` key 行恒 required+pending（na 压二态） | ✅ 翻红 1 failed |
| M6 | `ensure-deal.ts` Deal 初态写 signed（跳过 negotiating） | ✅ 翻红 2 failed |
| M7 | termsJson 丢 scope 快照 | ✅ 翻红 1 failed |
| M8 | 条件行 `skipDuplicates:false`（重入重复插） | ✅ 翻红 4 failed |
| M9 | `ensure-deal.ts` 忽略 ctx.db（写入逃出事务） | ✅ 我的探针翻红（Generator 套件漏检） |

变异体全部被正确捕获，检测器活性成立。

---

## 4. 测试运行汇总

| 套件 | 结果 |
|---|---|
| `tests/unit/deal-advance.test.ts`（Generator） | 72 passed |
| `tests/integration/deal-generation.test.ts`（Generator） | 8 passed |
| `tests/integration/m3b-f003-evaluator.test.ts`（Evaluator 独立） | 65 passed |
| `npm run delivery:e2e`（全链 24 断言，F003=步骤①） | 全绿，夹具已清 |
| `tsc --noEmit`（src/ + prisma/） | 0 error（产品代码干净） |

---

## 5. 观察项（非阻断，不影响 F003 PASS）

1. **key 词表会命中营销术语**：`key visual` / `Key Opinion Leader` 被 `includesKeyDelivery` 判为 key 交付。方向是**多要一个条件**（拦住放款，fail-safe），且 spec P3 明示词表保守 + F008 人工核验优先，`deliverable-plan.ts` 注释也明标「判错留人工纠正入口」。属预期设计，非缺陷。
2. **旁证（非 F003 范围）**：`tests/unit/delivery-check.evaluator-probe.test.ts` 与 `tests/unit/partner-adapters.evaluator-probe.test.ts`（F002/F004 并行 evaluator 的产物）有 `TS7018` 隐式 any 报错；产品代码不受影响。归各自 feature evaluator 处置，不在本报告 F003 判定内。
3. **DB 残留**：残留租户 `test-tenant-m3b-tools-*` 系并行 evaluator（F007）夹具，非本验收产生；我的夹具 `test-tenant-m3b-eval-f003-*` 已自清。未触碰他人夹具。

---

## 6. 结论

**F003 = PASS。** 六条 acceptance 全部有实测证据；dealAdvance 状态机 D20 检测力经 8 个真实源码变异独立复核成立；同事务落库经回滚探针取证；幂等三路径闭合；P1 零资金动作在 F003 范围内成立（生成 Deal 不产生任何 Payout/GameKey 行，全链 e2e mock 恒定无 REAL 分支）。产品代码零改动，测试产物已落盘。
