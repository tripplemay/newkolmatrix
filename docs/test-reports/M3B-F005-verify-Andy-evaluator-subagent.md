# M3-B-DELIVERY F005 验收报告 — payout 工具（outbound）+ 服务端二次校验（无绕过入口）

- **批次**：M3-B-DELIVERY
- **Feature**：F005（`payout` 工具 outbound + 服务端二次校验 + P1 零真实资金动作）
- **验收角色**：Evaluator（隔离 subagent，署名 Andy/evaluator-subagent）
- **阶段**：verifying（fix_rounds=0，首轮）
- **日期**：2026-07-23
- **结论**：**PASS**
- **修改边界声明**：本次验收未改动任何产品代码 / 文档基线；仅新增测试产物
  `tests/integration/payout-gate.evaluator-probe.test.ts` 与本报告。

---

## 1. 取证方式（不依赖任何转述）

自磁盘读取：`progress.json`（status=verifying）、`features.json`（F005 acceptance）、
`docs/specs/M3-B-DELIVERY-spec.md`（§P1/P5/P6 + F005 行）、`.auto-memory/`（MEMORY/项目状态/环境/evaluator 角色）。
产品代码通读：`src/lib/agent/tools/payout.ts`、`src/lib/delivery/check.ts`、
`src/lib/delivery/deal-status.ts`、`src/lib/domain/delivery-check.ts`、
`src/lib/agent/execute.ts`、`src/lib/agent/gate/gate.ts`、`src/lib/ops/partner/*`、
`src/lib/agent/registry.ts`、`src/app/api/delivery/payout/route.ts`、`prisma/schema.prisma`。

**环境前置检查（防误报）**：`npx prisma generate` 已跑；`prisma migrate status` = up to date（8 迁移）；
本地 Postgres 容器 `newkolmatrix-dev-db`（:5434，healthy）；Node v25.7.0；本波次未起 :3000。

---

## 2. Acceptance 逐条核对（features.json F005）

| # | Acceptance 项 | 结果 | 证据 |
|---|---|---|---|
| 1 | payout 注册且挂 delivery 人格 | ✅ | `registry.ts:156` delivery.tools 含 `payout`；`tools/index.ts:33` 入 NATIVE_TOOLS；双向同源断言（人格声明 ⊆ 注册表 & native 名单含 payout）通过 |
| 2 | class=outbound + async buildHarm 三行（收款方 / 金额+币种 / 依据含合同+托管+披露证据引用）| ✅ | `payout.ts:235` class='outbound'；`buildHarm` 返回 Promise（探针断言 `instanceof Promise`）；harm.targets=[收款方]、amount+currency、evidence 含「合同 sign-P1 · 托管 esc-P1 · #ad 披露 shot://ad1 · 内容 …」 |
| 3 | 无令牌 → pending 信封 | ✅ | `execute.ts:40` outbound 且无 confirmationToken → `createPendingAction` 返回 pending 信封；探针断言 `isPendingEnvelope=true` + 确认前 Payout=0 / RELEASED_MARKER=0 |
| 4a | ready=false 直调 → buildHarm 阶段即拒，PendingAction **不产生** | ✅ | 探针覆盖 3 类缺口：MISSING（Generator 已测）+ **NA_BUT_REQUIRED** + **ROW_ABSENT**（本评审补测）；三者均在落 PendingAction 前抛错，`pendingAction.count` 不变 |
| 4b | 绕过前端直打 execute 亦拒 | ✅ | 两条独立路径实证：① pending→confirm 窗口内条件退化 → 消费票时 execute 端二次校验拒（failed）；② **完全绕过闸门**（伪造 confirmationToken 直调 executeTool，连 PendingAction 都不建）→ 执行体内 `resolveAndAssertReady` 仍拒。证明硬闸落在执行体内，不依赖闸门链路 |
| 5 | 执行后 Payout released + gateLogId 非空 + Deal 推进 + irrev 留痕同事务 | ✅ | 全链探针：status=released、gateLogId=paId、releasedAt 非空、amount=880.25（Decimal(14,2) 无漂移）、Deal→completed、irrev(ref=paId)=1、RELEASED_MARKER 恰好 +1 |
| 6 | 失败 → failed 无 irrev 行（+ 业务写入回滚）| ✅ | **写后失败**探针（provider 配 'stripe' 使 partner 在 payout.create(prepared) **之后**抛错）→ Payout 行随事务回滚为 0、PendingAction=failed、irrev=0、marker 不变、Deal 状态未推进。补足 Generator「create 前抛错」用例未覆盖的「写后回滚」证明 |
| 7 | 幂等重入不双放（幂等键=PendingAction.id）| ✅ | 同 gateActionId 重放执行体 → already=true、Payout 仍 1、marker 未增；票已消费重放 → 409 |
| 8 | P1 全程零真实付款外呼（mock 观测标记）| ✅ | 整 suite 期间 `globalThis.fetch` 计数探针 = **0**；`getEscrowPartner()` 恒 `MockEscrowPartner`，非 mock provider 取值一律抛「未实装」；源码 grep 无 REAL/Stripe 放款分支（仅 types.ts 注释提及 M5） |

**8/8 全 PASS。**

---

## 3. 独立对抗测试（本评审新增，与 Generator 交付测试互补）

文件：`tests/integration/payout-gate.evaluator-probe.test.ts` — **15 用例全绿**（1.28s）。

覆盖 Generator `payout-gate.test.ts`（12 用例）未触及的对抗面：

1. **防模型转述金额**：模型直填 `amount:999999 / payee:attacker / currency:BTC` → 披露仍取库内 termsJson 快照（1234.5 EUR）与库内创作者名。
2. **单号未登记诚实降级**：contractRef/escrowRef=null → 依据写「已核验（未登记单号）」，不编造单号。
3. **P6 两类未覆盖缺口**：`NA_BUT_REQUIRED`（必需却标 na）+ `ROW_ABSENT`（条件行整类缺失）。
4. **完全绕过闸门**：伪造 confirmationToken 直调 executeTool → 执行体内二次校验独立成立。
5. **写后失败原子性**：prepared 行已写入后 partner 抛错 → 整事务回滚，无孤儿行、无 irrev。
6. **跨租户越权**：B 租户 ctx 取 A 租户 dealId → 明示「交易不存在」，不泄露不放款。
7. **P1 进程级证明**：fetch 计数探针恒 0（不靠「读代码觉得没外呼」）。
8. **行为观测（记录非判定）**：同一 Deal 二次人工确认可再放款——幂等键是 PendingAction.id（非 dealId），符合 spec 口径；每笔仍强制过人确认红闸门。供 M5 接真时决策，非缺陷。

### 检测器活性证明（D20 变异，隔离 worktree，主树零改动）

在 `/tmp` detached worktree 注入 3 个变异体，验证探针会翻红：

| 变异体 | 破坏点 | 翻红用例数 |
|---|---|---|
| M1 | 移除 execute 阶段二次校验（只 buildHarm 判一次）| 2（绕过闸门 + 条件退化）|
| M2 | `ready` 判定恒放行 | 4（NA_BUT_REQUIRED + ROW_ABSENT + 绕过 + 退化）|
| M3 | 幂等短路失效 | 1（全链 marker 计数 ≠ 1）|

三变异均被捕获 → 探针非「空转绿」。worktree 已 `--force` 移除，主树 `git status` 干净，
dev DB 遗留探针租户=0、Payout 行=0（afterAll 自清理生效）。

---

## 4. 回归与静态检查

- **Generator F005 套件**：`payout-gate.test.ts` 12/12 PASS。
- **F005 邻接回归**：`deal-generation` + `delivery-surface` + `gate-http-regression` 18/18 PASS。
- **delivery:e2e 闭环**：24 断言全绿；用量申报「真实资金动作 0 · 真实 key 发放 0」；夹具自清理。
- **tsc**：F005 产品代码（payout.ts / delivery/* / ops/partner/*）+ 本评审探针文件 **零 tsc 错误**。

---

## 5. L2 边界与授权状态

- 本批 P1 硬约束：**零真实资金动作**。F005 源码不存在真实放款路径（选择器恒 mock，非 mock provider 抛错，无 REAL 分支）——放款验证全走 mock 适配器路径，属 [L1] 可验证。
- **[L2] 真实 Stripe/托管放款外呼**：本批不实装，规划留 M5（`ops/partner/types.ts` 注释）。当前无「应 L2 验证却未授权」的遗漏项——因为真实路径根本不存在，无可误触开关。
- 未授权任何真实外部服务 / 计费 / 生产写入；本次验收全程仅打本地 dev DB。

---

## 6. Soft-watch / 备注（不阻断）

1. **幂等口径观测**：同一 Deal 可多次放款（幂等键=PendingAction.id）。符合 spec 明写口径，非缺陷；M5 接真时若需「一 Deal 一放款」的业务级去重，属新增需求，非本批回归。已在探针 §5 如实记录。
2. **并行评审 tsc 噪声（非本 feature）**：`npx tsc --noEmit` 报 4 处 TS7018，全部落在**其他** evaluator subagent 的探针文件（`delivery-check.evaluator-probe` / `partner-adapters.evaluator-probe` / `m3b-f003-evaluator`），与 F005 无关，由对应 feature 的验收者处置。本报告不越界修改。

---

## 7. 结论

**F005 = PASS。** payout 工具的 outbound 门控、P6 服务端二次校验（buildHarm + execute 各一道、
执行体内独立成立、无绕过入口）、执行/失败事务原子性、幂等、P1 零真实资金动作八项 acceptance
全部代码层实装且以实测（含 D20 变异活性证明）为据。
