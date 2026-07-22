# M2-A-MATCH 首轮验收记录 — F006 nightly-screen 例程 + scheduler 注册表化

- **署名：** Andy/evaluator-subagent
- **日期：** 2026-07-22
- **阶段：** verifying（首轮，fan-out 单 feature 验收）
- **被验实物：** commit `a3caabe`（feat(M2-A-MATCH-F006)）落盘代码 + 本机测试运行输出 + dev DB 实测
- **结论：PASS**（acceptance 8 项逐条 PASS，无 PARTIAL/FAIL）

---

## 环境前置（L1 检查，testing-env-patterns 对照）

- `npx prisma generate` 先于 tsc 已执行（§3 pattern）；本项目无 `.nvmrc`（CI 用 workflow env NODE_VERSION），本机 Node v25.7.0 与历批验收同环境，无 jsdom/localStorage 类测试，§4 不适用。
- 端口纪律遵守：全程未起 dev/standalone server（例程验证不需要 :3000）。
- DB 基线态（验收前实测）：MatchPlan/PlanKol/MatchCandidate = 0/0/0，PendingAction = 0，OperationLog = 0，tenant 仅 `dev`，4 canonical 项目在位（料理次元 cur='match' 为 L2 样本）。

## 逐条 acceptance 判定

| # | acceptance 条目 | 判定 | 证据 |
|---|---|---|---|
| 1 | scheduler.ts 注册表化（ROUTINES 数组+循环注册） | PASS | `src/lib/jobs/scheduler.ts:39-64` `ROUTINES: ReadonlyArray<RoutineDef>` 两条目；`:102-109` for 循环 `cron.schedule`。集成测断言恰含 `['health-scan','nightly-screen']` |
| 2 | runExclusive / ROUTINES_DISABLED / 失败不炸进程语义逐条保持 | PASS | 与 M1-C 版（`git show 948d327:src/lib/jobs/scheduler.ts`）逐行对比：`runExclusive`（:73-87）逐字一致；`ROUTINES_DISABLED` 短路（:97-100）一致；每例程 `.catch` 只 console.error 不外抛（:104-107）一致。互斥语义由 `health-scan-routine.test.ts` 第 3 例活测（后到方返回 null、锁释放）✓ |
| 3 | health-scan 迁入行为零变更 | PASS | cron 常量 `HEALTH_SCAN_CRON='0 2 * * *'` 不变（:22，集成测逐字断言）；执行体（getDevTenantId→runHealthScan(tenantId,new Date())→同一日志文案）与旧版逐字一致（:43-50 vs 旧 :59-66）；`health-scan-routine.test.ts` 3/3 PASS（留痕形状/幂等/互斥） |
| 4 | routines/nightly-screen.ts：cur='match' 在跑项目逐个 generateCandidates+buildMatchPlans（approved 不动 P4） | PASS | `nightly-screen.ts:34-37` where `{tenantId, cur:'match'}`；:44-45 调 F003 单一真相源不内联重算。P4 服务层保证核到实物：`generate-candidates.ts:187-197` upsert update 分支不含 verdict；`build-plans.ts:220-224` updateMany 只圈 `status:'draft'` 同事务。集成测「approved 不动」例：draft→approved 后重跑，approved 行原样 + 新 3 组照常 ✓ |
| 5 | OperationLog(kind=auto, actor='match', payloadJson{routine:'nightly-screen'}) 照 health-scan 先例 | PASS | `nightly-screen.ts:46-61` 与 `health-scan.ts:47-56` 同构（kind=auto + actor + projectId + summary + payloadJson.routine）。L2 真机留痕实测：`{"routine":"nightly-screen","candidates":20,"candidatesCreated":20,"plans":3,"superseded":0}` |
| 6 | internal only 无 outbound（:1182） | PASS | nightly-screen.ts 导入仅 prisma/generate-candidates/build-plans；网关调用仅 embedText（embedding 检索计算）；L2 真机运行后 `PendingAction = 0` 实测（无对外动作产生） |
| 7 | 网关失败逐项目消化不中断整轮 | PASS | `nightly-screen.ts:42-71` 逐项目 try/catch，failed 计数不外抛。集成测「失败逐项目消化」例：embed 抛错 → `{projects:1,succeeded:0,failed:1}`、无新增留痕、不外抛 ✓ |
| 8 | scripts/jobs/run-nightly-screen.ts + package script | PASS | 文件在位，走 `runExclusive('nightly-screen', ...)` 同一执行体非旁路（:13-15）；package.json:34 `routine:nightly-screen` |
| 9 | cron 默认 30 2 * * *（错峰） | PASS | `NIGHTLY_SCREEN_CRON='30 2 * * *'`（scheduler.ts:25），集成测逐字断言；与 health-scan 02:00 错峰 30 分钟 |
| 10 | 集成测试：注册表两例程 / 幂等 / approved 不动 | PASS | `tests/integration/nightly-screen.test.ts` 5/5 PASS（注册表两例程+cron 逐字 / 闭环+范围圈定 cur≠match 零产物 / 幂等重跑候选不增+draft→superseded / approved 不动 / 失败消化）。夹具租户独立（slug 含 pid），afterAll 自清 ✓ |
| 11 | lint + tsc + test:unit 绿 | PASS | `npx tsc --noEmit` exit 0；`next lint` ✔ No ESLint warnings or errors（0 err 0 warn）；`vitest run` 28 文件 307/307 全 PASS |

## L2 实测记录（授权口径内）

- **真网关用量：** `npm run routine:nightly-screen` 单次运行 = embedText × 1（料理次元一个 cur='match' 项目的查询文本 embedding），最小用量，符合 spec §4「仅 embedText」授权；幂等/失败路径已由 mock 向量集成测覆盖，不重复耗真调用。
- **真机产物核验：** 20 候选（全 scorePending=true——audienceDemo 全 null 降级纯向量分，FR-11.6 预期）；3 组 draft（B 均衡组 recommended=true；metrics budgetUsd 恒 null P6 / reachTotal=Σfollowers 真值 46919·46919·55640 / risk 分档 / people=10）；PlanKol 30 行 reasons 三段可解释（匹配分+入选规则+粉丝分层）；OperationLog 1 条 actor='match' kind='auto'。
- **D-H 复原：** 测毕删除 MatchPlan 3（PlanKol 级联）/ MatchCandidate 20 / OperationLog 1；终态实测 Match 三表 0/0/0 + PendingAction 0 + OperationLog 0 + tenant 仅 dev，与验收前基线一致。

## 备注

- instrumentation.ts（M1-C 原样）仍经 `startScheduler()` 挂载注册表，nodejs runtime 限定不变——注册表化后新例程「自动获得调度」的 :1815 口径已兑现。
- 本记录仅覆盖 F006；其余 feature 由并行 fan-out 验收，批次级就绪回归归 READINESS。
