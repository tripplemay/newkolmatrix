# M4-INSIGHT F004 验收 verdict（隔离验收，原样落盘）

> 被测：`src/lib/insight/metric-snapshot.ts` @ `1000eb0`（feat(M4-INSIGHT-F004)）
> 环境：本地 dev DB `localhost:5434/kolmatrix`（`prisma migrate status` = up to date）· L1 · 零外部调用 · 产品代码零改动
> 详细用例设计与变异矩阵 → `docs/test-cases/M4-INSIGHT-F004-metric-snapshot.md`

```
feature_id: F004
result: PASS

acceptance_checklist:
1. ✓ 有 released payout → sum(payout.amount) + spendSource=payout —— Gen 测 projPayout: 1400.50+600.25=2000.75/`payout`（prepared 999 与同项目 committed quote 3000 均未混入）；探针 P4 补跨 2 个 Deal 求和 10.05+20.07=30.12
2. ✓ 无 released 有 committed quote → sum(quote.amount) + spendSource=quote —— Gen 测 projQuote: 800+450.75=1250.75/`quote`（proposed 9999 不计、prepared payout 未把源锁死）；探针 P2 补 `blocked` payout 同样不构成源 → 正确回落 quote=120.40（rejected 7000 未混入）
3. ✓ 两者皆无 → spend=null + spendSource=none —— Gen projNone；探针 P5 独立空项目复证 spend/currency 双 null
4. ✓ 仅 USD 计入，非 USD 不换汇 —— EUR 500 / JPY 100000+50000 均不进 sum、按币种进 `nonUsdExcluded`；全非 USD 项目 → spend=null 但 spendSource 仍标 `payout`（「有源无 USD 值」与「无源」语义可区分，符合 P1 诚实降级）。严格 `=== 'USD'` 比较沿 `commit-quote.ts:105` budgetUsd 既有口径
5. ✓ reach/conversions/roi 恒 null —— 类型层锁死为 `null`；单项目路径（Gen）+ 跨项目路径（探针 P6）+ 快照落库（两处）+ e2e ① 四路复证
6. ✓ 跨项目聚合（V12）按项目分组 —— `loadTenantProjectSpends` 按 tenant 全项目分组；探针 P6 逐位断言 [0.6, 120.40, 30.12, null] 与 source 三元组，并证 `createdAt asc` 排序契约
7. ✓ 集成测覆盖三分支 + 空态 —— Gen 8 用例 8 passed；Evaluator 独立探针 8 用例 8 passed（独立租户/项目，不复用 Gen 夹具）
8. ✓ 夹具租户隔离 —— Gen 证「他租户 123456 不串入」；探针 P3 补**反向**越权（拿 B 的 tenantId 读 A 的项目 → spend=null/`none`，同 projectId 在正确租户下为 30.12，证明 null 来自租户过滤而非无数据）；B 的清单只含 B 的项目
9. ✓ on-read 装配壳沿 `lib/delivery/check.ts` 先例 —— `InsightLoadCtx`/`loadProjectSpend`/`loadTenantProjectSpends` 与 `DeliveryLoadCtx`/`loadDeliveryCheck`/`loadProjectDeliveryChecks` 同构；支持 `ctx.db` 事务客户端注入
10. ✓ MetricSnapshot 表写入口最小实装 —— `persistMetricSnapshot` 落行值与装配值一致；探针 P7 补 tenantId 落列 / 显式 date 生效 / 重复调用追加两行（快照语义非 upsert）

evidence:
- `npx prisma migrate status` → "Database schema is up to date!"（9 migrations，本地 dev DB :5434）
- `npx vitest run tests/integration/metric-snapshot.test.ts` → Test Files 1 passed / Tests 8 passed
- `npx vitest run tests/integration/metric-snapshot.evaluator-probe.test.ts` → Tests 8 passed（新增探针）
- `npm run insight:e2e`（默认 mock，零外呼零公开暴露）→ ①段 3/3 ✓「装配 spendSource=payout / spend=900.5（分整数累加）/ reach·conversions·roi 恒 null」；全 23 断言绿
- **变异矩阵 10/10 全杀**（只读 worktree `/tmp/f004-mut` 复制 HEAD 施加变异，主工作树产品代码全程零改动，验后 `git worktree remove`）：M1 源优先级倒置 6☠ · M2 去 released 过滤 6☠ · M3 去 committed 过滤 4☠ · M4 去 tenantId 过滤 4☠ · M5 分整数→浮点串加 2☠ · M6 非 USD 混入 4☠ · M7 无源填 0 冒充 6☠ · M8 三指标填 0 冒充 2☠ · M9 排序倒置 1☠ · M10 快照 spendSource 硬编码 1☠。M9/M5 由 Evaluator 探针独家捕获（Gen 测断言前先 sort()、且 1400.50+600.25 二进制可精确表示，证不了这两条）
- `npx tsc --noEmit` → F004 相关文件 0 error
- 夹具零残留：跑完全部用例后 dev DB `MetricSnapshot` 0 行、无残留 fixture 租户
- 产出物已 commit+push：`b58207a`（`tests/integration/metric-snapshot.evaluator-probe.test.ts` + `docs/test-cases/M4-INSIGHT-F004-metric-snapshot.md`）

observations（不影响 F004 判定）:
- [soft-watch 跨批] 币种大小写：写侧 `/api/reach/quote`（`z.string().length(3)`）与 `commit_quote`（`min(3).max(3)`）未服务端 `toUpperCase()`，写入 `'usd'` 会被静默归为非 USD 排除。属既有 budgetUsd 口径的输入归一化缺口（M3-A 起），非 F004 引入，建议后续批次在写侧统一归一化
- [info] 工作树中并行 Evaluator 的在制品探针有 tsc 报错（`tests/unit/share-adapter.evaluator-probe.test.ts` 2 处、`tests/integration/eval-m4-f005-delegation.test.ts` 6 处，均未跟踪），与 F004 无关，但若原样提交会红 CI —— 转告对应 sibling
- [info] L2 未执行：`INSIGHT_E2E_REAL_LLM=1` 真网关路径未获用户授权，未外呼（F004 本身无 LLM 依赖，不构成覆盖缺口）
```

未修改任何产品代码 / `progress.json` / `features.json`；F004 判定 PASS，`features.json` 该条无需改回 pending。

—— Andy/evaluator-subagent，2026-07-24
