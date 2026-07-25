# M4-INSIGHT F004 测试用例 — MetricSnapshot 装配服务（spend 真源聚合）

> 作者：Evaluator（隔离验收，Andy/evaluator-subagent） · 日期：2026-07-24 · 被测：`src/lib/insight/metric-snapshot.ts` @ `1000eb0`
> 环境：本地 dev DB（`localhost:5434/kolmatrix`，`prisma migrate status` = up to date）· L1 · 零外部调用

## 1. 证据来源

| 层 | 产物 | 结果 |
|---|---|---|
| Generator 自带集成测 | `tests/integration/metric-snapshot.test.ts`（8 用例） | 8 passed |
| **Evaluator 独立探针** | `tests/integration/metric-snapshot.evaluator-probe.test.ts`（8 用例，独立夹具不复用 Generator 数据） | 8 passed |
| 闭环在环证据 | `npm run insight:e2e` ①段（装配 spendSource/spend/三 null） | 3/3 ✓（全 23 断言绿） |
| 变异检测（10 变异） | 只读 worktree `/tmp/f004-mut`，逐条变异 → 跑 16 用例 | **10/10 全被杀死** |

## 2. Acceptance 逐条映射

| # | acceptance 条款 | 覆盖用例 | 结论 |
|---|---|---|---|
| 1 | 有 released payout → `sum(payout.amount)` + `spendSource=payout` | Gen「spendSource 三分支」①（2000.75）+ 探针 P4（跨 2 Deal 求和 30.12） | ✓ |
| 2 | 无 released 有 committed quote → `sum(quote.amount)` + `spendSource=quote` | Gen ②（1250.75，proposed 不计）+ 探针 P2（blocked payout 不锁源 → 回落 quote；rejected 不计） | ✓ |
| 3 | 两者皆无 → `spend=null` + `spendSource=none` | Gen ③ + 探针 P5（兄弟空项目） | ✓ |
| 4 | 仅 USD 计入（非 USD 不换汇，沿 budgetUsd 口径） | Gen「USD 口径与诚实降级」（EUR/JPY 进 `nonUsdExcluded`，全非 USD → spend=null 但源标注保留） | ✓ |
| 5 | reach / conversions / roi 恒 null | Gen 单项目路径 + 探针 P6（跨项目路径同证）+ e2e ① | ✓ |
| 6 | 跨项目聚合（V12）按项目分组 | Gen「跨项目聚合」+ 探针 P6（顺序 + 逐项目口径 + 值三元组） | ✓ |
| 7 | 集成测覆盖三种 spendSource 分支 + 空态 | 三分支 describe + 空态项目 | ✓ |
| 8 | 夹具租户隔离 | Gen（他租户不串入）+ 探针 P3（**反向**：他租户视角读本租户项目 → 空态、不泄露） | ✓ |
| 9 | on-read 装配壳沿 `lib/delivery/check.ts` 先例 | `InsightLoadCtx` / `loadProjectSpend` / `loadTenantProjectSpends` 与 `DeliveryLoadCtx` / `loadDeliveryCheck` / `loadProjectDeliveryChecks` 同构 | ✓ |
| 10 | MetricSnapshot 表写入口最小实装 | Gen 两用例 + 探针 P7（tenantId 落列 / 显式 date 生效 / 重复调用追加两行非 upsert） | ✓ |

## 3. Evaluator 探针补的空白（Generator 测未覆盖处）

| 探针 | 补的是什么 | 为什么 Generator 测证不了 |
|---|---|---|
| P1 精度 | `0.10+0.20+0.30 === 0.6` | Gen 用 1400.50+600.25，二进制可精确表示，朴素浮点相加同样得 2000.75 |
| P2 状态过滤 | `blocked` payout / `rejected` quote | Gen 只证了 prepared / proposed |
| P3 反向越权 | 拿他租户 tenantId 读本租户项目 | Gen 只证了「他租户数据不串入」单向 |
| P4/P5 | 跨 Deal / 跨 Thread 求和；兄弟项目不互串 | Gen 用总和兜底，未逐项目证 |
| P6 排序契约 | `createdAt asc` 稳定序 | Gen 断言前先 `sort()`，排序退化不可见 |
| P7 写入口语义 | tenantId 落列 / 显式 date / 追加语义 | Gen 只查了 spend / source / 三 null |

## 4. 变异矩阵（检测器活性证明）

只读 worktree 复制 HEAD → 逐条变异产品文件 → 跑 16 用例 → `git checkout` 还原（主工作树产品代码全程零改动）。

| # | 变异 | 结果 |
|---|---|---|
| M1 | 源优先级倒置（quote > payout） | 6 failed ☠ |
| M2 | 去 `payout.status='released'` 过滤 | 6 failed ☠ |
| M3 | 去 `quote.status='committed'` 过滤 | 4 failed ☠ |
| M4 | 去 `tenantId` 过滤（越权） | 4 failed ☠ |
| M5 | 分整数累加 → 浮点串加 | 2 failed ☠（含探针 P1） |
| M6 | 非 USD 混入 sum | 4 failed ☠ |
| M7 | 无源 `spend` 填 0 冒充 | 6 failed ☠ |
| M8 | reach/conversions/roi 填 0 | 2 failed ☠ |
| M9 | 跨项目排序倒置 | 1 failed ☠（**仅探针 P6 捕获**） |
| M10 | 快照 `spendSource` 硬编码 | 1 failed ☠ |

10/10 全杀 —— P1 诚实降级铁律（不填 0）、P3 真源优先级、租户隔离三条均有活检测器。

## 5. 观察项（非本 feature 缺陷）

- **[soft-watch] 币种大小写**：`row.currency === 'USD'` 严格匹配。写侧 `/api/reach/quote`（`z.string().length(3)`）与 `commit_quote`（`min(3).max(3)`）均未服务端 `toUpperCase()`，写入 `'usd'` 会被静默归为非 USD 排除。此为**沿用既有 budgetUsd 口径**（`commit-quote.ts:105` 同款严格比较，M3-A 起），非 F004 引入；建议后续在写侧统一归一化。
- **[info] 工作树他 feature 探针的 tsc 报错**：`tests/unit/share-adapter.evaluator-probe.test.ts`(2) / `tests/integration/eval-m4-f005-delegation.test.ts`(6) 未跟踪文件有类型错误，属并行 Evaluator 在制品，与 F004 无关；F004 相关文件 tsc 0 error。
- **[info] 夹具零残留**：跑完全部用例后 dev DB `MetricSnapshot` 0 行、无残留 fixture 租户。
