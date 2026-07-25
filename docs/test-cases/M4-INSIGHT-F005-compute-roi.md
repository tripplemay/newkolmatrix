# M4-INSIGHT F005 测试用例记录 — `compute_roi` 内部工具（insight 人格）

> 作者：Evaluator（隔离 subagent，署名 `Andy/evaluator-subagent`）· 日期 2026-07-24
> 被测实物：`src/lib/agent/tools/compute-roi.ts`（commit 73f1f10）· `tools/index.ts` · `registry.ts`
> 环境：L1 本地（dev DB `localhost:5434`，`.env`）；**零网关外呼**（compute_roi 不经 `lib/ai/gateway`，L2 未授权亦无需）

## 1. 证据分层

| 来源 | 文件 | 结果 |
|---|---|---|
| Generator 交付测试 | `tests/integration/compute-roi-tool.test.ts` | 8/8 PASS |
| Evaluator 委派证明（新增） | `tests/integration/eval-m4-f005-delegation.test.ts` | 3/3 PASS |
| Evaluator 真库探针（新增） | `tests/integration/eval-m4-f005-compute-roi.probe.test.ts` | 9/9 PASS |
| 合计 | 三文件同跑 | **20/20 PASS**（`npx vitest run` 687ms） |

## 2. Evaluator 独立用例矩阵（只补 Generator 未覆盖的分支/边界）

| # | 用例 | 判据 | 结果 |
|---|---|---|---|
| E1 | 桩替换 `roi.compute`/`attribution.gaps`/`loadProjectSpend` | 输出 roi/gaps/facts 逐字等于哨兵值（内联重算必翻红） | PASS |
| E2 | 纯函数入参接线 | `computeRoi` 收到 `{spend: facts.spend, reach:null, conversions:null, actualExposure:null, targetExposure: goal}`；`attributionGaps` 收到 spend/spendSource/currency/reach/conversions | PASS |
| E3 | 人格 → router 实际子集 | `personaToolSubset(insight)` 含 `compute_roi`（不止看 registry 数组）；insight 声明的 3 个工具名全部已注册；其余 6 人格均不含 `compute_roi` | PASS |
| E4 | class/harm | `class='internal'`、`buildHarm===undefined`、`source='native'` | PASS |
| E5 | 只读语义 | 执行前后 `PendingAction`/`OperationLog`/`MetricSnapshot` 三表计数不变 | PASS |
| E6 | committed quote 弱证据分支（Generator 未覆盖） | `spendSource='quote'`、`SPEND_COMMITTED_ONLY` 且 **不含** `SPEND_ABSENT`、`byMetric.spend.committed={amount:1200.5,currency:'USD'}`、`roi=null/insufficient_evidence` | PASS |
| E7 | 非 USD 排除透传（Generator 未覆盖） | USD 1200.50 + JPY 50000 → `spend=1200.5`、`nonUsdExcluded=[{JPY,1,50000}]`（不换汇不相加） | PASS |
| E8 | 序列化契约加严 | `typeof spend==='number'`（无 Decimal 泄漏）+ JSON 往返无损 + 递归断言输出全为纯对象/数组（类实例即红） | PASS |
| E9 | 租户隔离（Generator 未覆盖） | 他租户 ctx 查同一 projectId → 抛「项目不存在」，不出数 | PASS |
| E10 | 输入契约边界（Generator 只覆盖缺字段） | `projectId:''` 拒、`projectId:123` 拒、多余键 `{bogus, roi:999}` 被剥离且不污染输出 | PASS |

## 3. 变异检测（D20 · 检测器活性证明）

方法：`git worktree` 只读副本内改产品代码（**主工作树产品代码零改动**），跑上述三文件。

| 变异 | 注入内容 | 结果 | 由谁杀 |
|---|---|---|---|
| M1 | 工具层内联重算 ROI（绕过 `roi.compute`） | **killed** 2 failed | 仅 Evaluator 委派证明（Generator 8/8 仍绿） |
| M2 | 分子缺时 `roi ?? 0` 伪造零 | **killed** 4 failed | Generator + Evaluator |
| M3 | `gaps:[] / complete:true` 吞空缺口 | **killed** 5 failed | Generator + Evaluator |
| M4 | `findFirst` 去掉 `tenantId` 过滤 | **killed** 2 failed | 仅 Evaluator 探针 |
| M5 | `class` 误标 `outbound` | **killed** 15 failed | Generator + Evaluator |
| M6 | 输出塞 `new Date()`（破坏画布序列化契约） | **killed** 2 failed | Generator + Evaluator |

**6/6 全杀** → 断言均为承重断言，非空转。

## 4. 环境与副作用核证

- 夹具租户 `test-tenant-m4-f005probe-{a,b}-<pid>` 跑后自动清理：复核 `slug contains 'f005'` = 0 行
- `ShareLink` 0 行 / `PendingAction` 0 行（本 feature 只读，无闸门票、无对外暴露）
- `npx prisma generate` 已前置（testing-env-patterns §3）；`npx tsc --noEmit` 中本 feature 相关文件 0 错
- **零真实对外副作用**：无网关调用、无邮件、无分享链接、无资金动作

## 5. 遗留观察（不构成 FAIL/PARTIAL）

1. **Generator 测试对「不内联重算」的证据强度不足**：其断言为「与纯函数直算逐字相等」，在本批分子恒 null 的口径下，一个内联重算实现同样能通过（M1 实测 8/8 绿）。产品实现本身确为委派（grep + 桩证明双证），故判 PASS；新增的 `eval-m4-f005-delegation.test.ts` 已把该缺口补成常驻守门。
2. Generator 测试未覆盖跨租户越权（M4 仅被 Evaluator 探针杀）；实现正确（`where` 带 `tenantId`），探针已常驻。
