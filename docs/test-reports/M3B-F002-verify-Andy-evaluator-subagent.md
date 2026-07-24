# M3-B-DELIVERY · F002 验收报告

- **Feature：** F002 — `deliveryCheck.row` 纯函数（domain 层）+ D20 变异测试
- **验收角色：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **阶段：** verifying（fix_rounds=0，首轮）
- **时间：** 2026-07-23
- **判定：** **PASS**
- **代码基线：** HEAD=`13eebb0`；产品代码零改动（变异复核后 md5 校验一致，`git status` clean）

---

## 0. 取证方式

- 状态文件、spec、evaluator.md、`.auto-memory/` 均自磁盘读取，未采信任何转述。
- L1 环境前置：`npx prisma generate` 先行（`testing-env-patterns.md` §3）；Node v25.7.0（仓库无 `.nvmrc` / `engines`，无版本约束需对齐）。
- 被测实物：`src/lib/domain/delivery-check.ts`（232 行）+ `tests/unit/delivery-check.test.ts`（57 用例）。
- 变异检测力**独立复核**：直接改**产品实现**造 8 个真变异体 + 1 个阴性对照，跑测试观察翻红；每体跑完由 `/tmp` 备份还原产品代码。

---

## 1. 逐条 acceptance 对照

| # | acceptance 项 | 结论 | 证据 |
|---|---|---|---|
| 1 | 纯函数无 DB 读（ctx 传入） | ✅ PASS | 文件内 `grep -E "^import\|prisma\|fetch\(\|new Date\|Math.random\|await\|async"` 零命中（仅注释里出现「不读 DB」字样）。入参 `DeliveryCheckInput` 携带 deal+deliverables，函数无任何 IO / 非确定性源。探针「入参深度 `Object.freeze` 不抛错」通过 → 确实不写入参，非「碰巧无人观察」。 |
| 2 | 全矩阵单测（五条件×四态 + required/na 组合；na 不计入 ready 正例 + missing 阻断 ready 负例） | ✅ PASS | `五条件×四态（required=true）` = 5×4=20 用例全绿；`required=false×四态` = 4 用例；正例「na 不计入 ready」（:208）+ 负例「任一必需 missing 阻断」（:214 遍历 5 类）+ pending/NA_BUT_REQUIRED/ROW_ABSENT/空 deliverables 负例齐备。57/57 passed。 |
| 3 | 缺口清单逐条可分支（「缺什么显什么」） | ✅ PASS | `DeliveryGapReason` = 6 值字符串字面量联合（MISSING/PENDING/NA_BUT_REQUIRED/ROW_ABSENT/DEAL_BLOCKED/DEAL_DEFAULTED）；`gaps[]` 每条带 kind+reason+note，逐条列出（测试 :264「多条件同时缺→逐条列出」）。消费端 `lib/delivery/check.ts:describeGaps` 用 `switch(reason)` 分支渲染，证可分支非自由文本。 |
| 4 | D20 变异测试（na 压 met / missing 放行 → 翻红） | ✅ PASS | 测试内建 7 变异体 A–G 全绿。**独立复核**（改真实现）见 §2：8/8 破坏性变异体被捕获翻红，阴性对照（纯注释改动）保持全绿 → 断言组有真检测力，非死测。 |
| 5 | 三处复用铁律注释就位（页面/工具/服务端同一函数） | ✅ PASS | 三处均经装配壳 `lib/delivery/check.ts → checkDeliveryRow`，无内联重算（全仓 `grep "=== 'met'\|=== 'na'\|status === 'missing'"` 排除 domain 后**零命中**）：① 页面 `lib/delivery/surface-data.ts`；② 工具 `agent/tools/delivery-tracking.ts:check_deliverables`（集成测 :174 断言输出与 `checkDeliveryRow` 直算逐字相等）；③ 服务端 `agent/tools/payout.ts` buildHarm+execute 双跑 `resolveAndAssertReady`。文件头注释 ①②③ 就位。 |

---

## 2. 变异检测力独立复核（改真实现，非依赖内建变异体）

方法：`/tmp/mutate.py` 逐个改 `src/lib/domain/delivery-check.ts`，跑 `npx vitest run tests/unit/delivery-check.test.ts`，每体跑后从 `/tmp/delivery-check.ORIG.ts` 还原。

> 注：首轮误用 `--reporter=basic`（vitest 4 已不支持，致每次退出非零）——被**阴性对照 M9 也翻红**当场识破，修正 runner 后复跑。此即「0 findings 需检测器活性证明」的实践：阴性对照存在才发现 harness 失真。

| 变异体（改产品实现） | 期望 | 实测 | 捕获断言（对点性抽验） |
|---|---|---|---|
| M1 required 的 na 视同 met | RED | ✅ RED 7 failed | `五条件×na→ready=false`(5) + `NA_BUT_REQUIRED 负例` + 行为组 |
| M2 missing 放行 | RED | ✅ RED 9 failed | — |
| M3 pending 视同已满足 | RED | ✅ RED 8 failed | — |
| M4 三态压二态（na→miss） | RED | ✅ RED 12 failed | — |
| M5 ROW_ABSENT 不阻断（fail-open） | RED | ✅ RED 3 failed | `条件行整类缺失负例` + `空 deliverables 负例` + 行为组 |
| M6 忽略 Deal blocked/defaulted | RED | ✅ RED 4 failed | — |
| M7 ready 恒 true | RED | ✅ RED 23 failed | — |
| M8 缺口清单被清空 | RED | ✅ RED 9 failed | — |
| **M9 纯注释改动（阴性对照）** | **GREEN** | ✅ **GREEN 57 passed** | 不该翻红者未翻红 → 断言不是「见改就红」 |

8/8 破坏性变异体被捕获，阴性对照保持绿。资金闸门判据的最要命退化方向（na→met、missing/pending 放行、ROW_ABSENT fail-open、忽略 Deal 终态）均有对点断言拦截。

---

## 3. Evaluator 独立探针（补实现方未覆盖的边角）

新增 `tests/unit/delivery-check.evaluator-probe.test.ts`（测试产物，6 用例全绿），覆盖实现方套件未触及的脏输入契约：

- **同 kind 重复行** → 取输入序首条，结论不随重复摇摆，缺口不因重复行重复列；
- **未知 kind 混入** → 被忽略，conditions 恒五条不污染 ready；
- **入参深度 `Object.freeze`** → 不抛错（证真不写入参）；
- **复合缺口**（条件缺 + Deal blocked）→ 两级缺口并列不互吞，顺序 = 列序后接 Deal 级；
- **required=false 的 missing** → 不阻断 ready 但单元仍显 `miss`（三态诚实，不静默改写 na）。

结论：脏输入下仍确定、仍 fail-safe 向拒付，未发现契约漏洞。

---

## 4. L1 全量门

| 门 | 命令 | 结果 |
|---|---|---|
| 类型 | `npx tsc --noEmit` | ✅ exit 0 |
| Lint | `npx next lint` | ✅ No ESLint warnings or errors（含新增探针文件） |
| 单测（F002 专项） | `npx vitest run tests/unit/delivery-check.test.ts` | ✅ 57/57 |
| 全量单测/集成测 | `npx vitest run` | ✅ 64 files / 775 passed |
| Evaluator 探针 | `npx vitest run …evaluator-probe.test.ts` | ✅ 6/6 |

---

## 5. L2 / 资金边界

- 本 feature 为 domain 纯函数，**无外部服务 / 无写入 / 无资金动作**，无 L2 验收项。
- P1 硬约束（禁真实资金动作 / 真实 key 外呼）在 F002 层面天然满足：函数无 IO。
- [L2] 未涉及，无待授权项。

---

## 6. 判定

**F002 = PASS（首轮，fix_rounds=0）。** 5/5 acceptance 全代码层 PASS；D20 检测力经改真实现独立复核确认；无 soft-watch 遗留。

- 产品代码复核后已还原，`git status` 对产品代码 clean；仅新增测试产物 `tests/unit/delivery-check.evaluator-probe.test.ts`（可由编排者纳入 commit）。
