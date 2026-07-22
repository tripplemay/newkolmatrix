# M2-A-MATCH 首轮验收记录 — F003 候选生成 + 组合生成服务（src/lib/match/）

- **署名：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **阶段：** verifying（首轮，fan-out 单 feature 验收）
- **被验对象：** `src/lib/match/generate-candidates.ts` + `src/lib/match/build-plans.ts` +
  `tests/integration/match-services.test.ts`（commit 00b2ca4 + fix bdda9d1，HEAD=3d93f72）
- **验收依据：** features.json F003 acceptance + `docs/specs/M2-A-MATCH-spec.md` §2 F003 / §4 / §5
- **结论：F003 = PASS（acceptance 12/12 项逐条 PASS）**

## 0. 环境前置（testing-env-patterns 对照）

- `npx prisma generate` 先于 tsc（§3 规约）→ 执行完成
- vitest environment='node' 无 jsdom，Node 版本坑（§4）不适用；仓内无 `.nvmrc`
- 端口纪律遵守：未起任何 dev/standalone server，全程代码/测试/DB 层验证
- DB 基线态（验收前实测）：`{"matchPlan":0,"planKol":0,"matchCandidate":0,"pendingAction":0,"operationLog":0,"tenants":["dev"]}`

## 1. 逐条 acceptance 判定

| # | acceptance 条目 | 判定 | 证据 |
|---|---|---|---|
| 1 | generateCandidates：gameId→getKnowledgeHeads(['audience']) 受众画像 + Project name/goal 构造查询 | PASS | `generate-candidates.ts:76-90 loadKnowledgeAudience`（getKnowledgeHeads(gameId,['audience']) → slices 扁平化，空→null）+ `:94-108 buildQueryText`（name/gameName/goal.targetExposure/受众标签拼接）；集成测夹具（audience 知识链头）实跑过该路径 |
| 2 | embedText【P7】注入可替换，单测/集成测 mock 向量不打网关 | PASS | `:53-55 GenerateCandidatesDeps{embed?}` + `:119 deps.embed ?? embedText`；集成测 `match-services.test.ts:41-45 mockEmbed`（e1 基向量）全程零网关调用；[L2] 默认绑定真网关路径另验（§4） |
| 3 | pgvector cosine topN=20（复用 search-kols.ts:54-81 SQL 范式） | PASS | `:144-153` SQL 与 search-kols.ts:62-66 同范式（tenantId 圈定 + `embedding IS NOT NULL` + `<=>` 排序 + LIMIT 参数化）；`CANDIDATE_TOP_N=20`（:30）；真实规模实测：dev tenant 2524 带 embedding KOL 池 → total 恒 20（§3） |
| 4 | 逐候选 matchScore.compute | PASS | `:167-171` 调 `computeMatchScore`（F002 单一真相源），无内联重算；集成测断言 sim 0.8 + interests 命中 → 0.74 = 0.8×0.7+0.6×0.3 加权值精确落库 |
| 5 | MatchCandidate upsert 幂等；【P4】已 kept/dropped 不回退 pending | PASS | `:180-197` update 分支（shared）不含 verdict；schema.prisma:340 `@@unique([projectId, kolId])` 幂等键；集成测断言 1（二跑 created=0/updated=total）+ 断言 2（kept/dropped 刷新后原样、matchScore 照常刷新）8/8 过；变异 1 击杀（§2） |
| 6 | doubts 规则化 + preJudge 分档 | PASS | `:174-176`（pending→'受众数据待接入'；score<0.5→'相似度存疑'）+ `:46-50 resolvePreJudge`（≥0.75 高/≥0.55 中/其余 ?）；集成测首跑断言四档 doubts/preJudge 逐值验证（1.0→高 / 0.74→中 / 0.3→存疑+?） |
| 7 | buildMatchPlans：候选(≠dropped) 规则化 3 组【P1 无 LLM 打分】，A/B/C 沿 mock 命名语义 | PASS | `build-plans.ts:164-171`（verdict not dropped + matchScore 非 null）；pickPrecision/pickBalanced/pickHeadline 纯规则函数，全文件零 LLM/网关引用；命名 `'A · 生活流精投组'/'B · 均衡组'/'C · 头部拉动组'` 与退役 mock（`git show 693c215:src/lib/data/mock/env-match.ts` L46/57/68）逐字一致，B recommended=true 对应 mock `best:true` |
| 8 | 每组 PlanKol ≤10 人 + reasons 可解释 | PASS | `PLAN_MAX_MEMBERS=10`（:21）三选组函数均 slice/上限收口；reasons 经 `assertPlanKolReasons`（写侧 zod 非空，match.ts:66-70）三段式=匹配分+入选规则+粉丝分层；真实规模实测三组各恰 10 人（§3） |
| 9 | metrics：reachTotal=Σfollowers 真值 / budgetUsd=null（P6）/ risk 由 doubts 占比分档 / people | PASS | `buildMetrics:121-137`（Σfollowers 已知项求和、全缺→null 不编造；budgetUsd 恒 null；resolveRisk 按 doubtRatio 1/3、2/3 分档；people=组员数）；集成测 parsePlanMetrics 合形断言 + 真实规模实测 metrics 实值核对（§3：全员 scorePending → doubtRatio=1 → risk=high 规则一致） |
| 10 | 【P4】新 3 组 draft + 旧 draft→superseded 同事务，approved 永不动 | PASS | `:220-254 prisma.$transaction`（updateMany 圈定 `status:'draft'` + 3 组 create 同事务）；集成测断言 4（二跑 3 draft + 3 superseded）+ 断言 5（approved 行原样、superseded 只 2）；变异 2 击杀（§2） |
| 11 | 集成测试打真库 mock 向量：幂等刷新/人工 verdict 保留/supersede/approved 不动 +【D20】status/verdict 流转变异断言 | PASS | `tests/integration/match-services.test.ts` 8/8 PASS（真库 + 夹具独立租户 pid 后缀，afterAll Cascade 清理）；6 条变异断言逐条注明杀点；变异活性实证 3/3 击杀（§2）——D20 义务不止于命名，实测能杀 |
| 12 | lint + tsc + test:unit 绿 | PASS | `next lint`：No ESLint warnings or errors；`tsc --noEmit` exit 0（prisma generate 前置后）；`npm run test:unit`：28 files / 307 tests 全 PASS（含本 feature 集成测） |

## 2. D20 变异断言活性实证（隔离 worktree，产品代码零触碰）

在 scratchpad 隔离 worktree（`git worktree add … HEAD`）中逐个植入变异 → 跑集成测 → 复原，
主工作树产品代码全程未动：

| 变异 | 植入点 | 预期杀点 | 实测 |
|---|---|---|---|
| 1. upsert update 分支回写 `verdict:'pending'` | generate-candidates.ts upsert update | 断言 2（P4 verdict 保留） | ✅ 击杀（断言 2 FAIL + 断言 3 连带 FAIL，2 failed/6 passed） |
| 2. supersede 圈定丢 `status:'draft'` | build-plans.ts updateMany where | 断言 5（approved 永不动） | ✅ 击杀（断言 5 FAIL，1 failed/7 passed） |
| 3. 候选圈定丢 `verdict:{not:'dropped'}` | build-plans.ts findMany where | 断言 3（dropped 出局） | ✅ 击杀（断言 3 FAIL，1 failed/7 passed） |

三个变异均被**设计所指的断言**精准命中（非旁路失败），status/verdict 两个状态机的流转
变异测试义务成立。worktree 验毕移除（`git worktree remove --force` + prune）。

## 3. 对抗性实测：真实规模候选池（Generator 测试未覆盖的边界）

夹具测试池仅 4 KOL 无法触发 topN 截断；Evaluator 以 dev tenant（2524 带 embedding KOL）+
临时项目 + mock 向量独立实测：

- 一跑：`total=20, created=20`（topN=20 上限在 2524 池上生效）；二跑：`created=0, updated=20`（幂等）
- buildMatchPlans：3 组 draft，B recommended=true，三组各恰 10 人（上限收口）
- metrics 实值：`budgetUsd:null` 恒成立；`reachTotal` = 组员 Σfollowers 真值（A/B 28810、C 54630）；
  全员 scorePending（临时项目无 game→知识画像 null 降级）→ doubtRatio=1 → `risk:"high"` 分档一致
- sampleReasons 三段可解释：`["匹配分 8%","入选规则：…","粉丝分层：长尾（2,130）"]`
- 测毕清理：plans（PlanKol Cascade）→ candidates → project，清理后三表计数 0/0/0

## 4. [L2] 最小用量真网关（授权口径：spec §4，仅 embedText）

默认绑定 `deps.embed ?? embedText` 的生产路径实测 1 次真网关 embedding 调用
（临时项目，无 deps 注入）：`total=20`，真 cosine 组合分 top3 ≈ 0.4508/0.4500/0.4480，
preJudge 全 '?'（<0.55 分档一致），scorePending=true（无 game 降级语义一致）。测毕清理，
matchCandidate 计数归 0。**真网关用量：1 次 embedding，无对话调用。**

## 5. D-H 终态复核

验收全部动作完成后全表实测：
`{"matchPlan":0,"planKol":0,"matchCandidate":0,"pendingAction":0,"operationLog":0,"tenants":["dev"]}`
——Match 三表零行 + PendingAction/OperationLog 清态 + 夹具租户无残留（集成测 afterAll Cascade 生效）。

## 6. 备注（不影响判定）

- dev tenant 带 embedding KOL 实数 2524（总 KOL 2525，1 行无 embedding）——恰验证
  `embedding IS NOT NULL` 过滤与「P2 定案：score null 仅当 embedding 缺失→根本不入池」语义。
- 阈值常量（SCORE_DOUBT_THRESHOLD / PRE_JUDGE_BANDS / FOLLOWER_TIERS / RISK_BANDS）代码内
  明确标注「示意值，上线以真实数据校准」——与 spec 口径一致，非缺陷；导出常量可测（已测）。
- fix commit bdda9d1（夹具租户独立化）为 building 期 CI 竞态前置消化，非质量债；
  夹具租户 pid 后缀 + 检索按 project.tenantId 圈定使断言确定（total 恒 4），设计合理。
