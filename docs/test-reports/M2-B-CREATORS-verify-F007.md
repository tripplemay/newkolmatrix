# M2-B-CREATORS F007 验收记录 — 评分升级端到端验证

- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-23
- **对象：** features.json F007（commit `7321292`，交付物 = `tests/integration/score-upgrade.test.ts` 221 行）
- **结论：** **PASS**（逐项判定见下；2 条注记随附探针证据闭环，不构成缺陷）

## 验收环境

- 本地 dev DB（`newkolmatrix-dev-db` healthy）；基线态实测：Kol 2526（2524 归一 `user_upload` + 2 视觉夹具，其中 1 行 `crawl`=VK-FULL）、Match 三表/PendingAction/OperationLog 全 0、仅 dev 租户。
- L1 前置：`npx prisma generate` 已跑；Node v25.7.0（仓内无 `.nvmrc`；本批无 jsdom/localStorage 类测试，不触发 testing-env-patterns §4 风险面）。
- 工作树 clean（除 F008 验收记录 untracked）——所跑测试文件即 commit `7321292` 原样交付物。
- 端口纪律遵守：全程未起 dev/standalone server（F007 验收无视觉项）。

## 逐条 acceptance 判定

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | 集成测试打真库 mock 向量 | PASS | `score-upgrade.test.ts` 打真库（pid 隔离夹具租户 `test-tenant-m2b-upgrade-*`）+ `mockEmbed` 注入（:33-37，P7 不打网关）；实跑 `npx vitest run tests/integration/score-upgrade.test.ts` → **4/4 passed（474ms）** |
| 2 | 外采派生 interests 入场 → generateCandidates scorePending=false 真路径 | PASS | 夹具经 **F002 真派生管道**产出（:82-88 `deriveAudienceDemo({matchedTags:['fps']})`，与 F003 sync 落库同形——`sync.ts:174-187` 同函数同写形）→ 真 `generateCandidates` 跑（:127）→ 断言 `scorePending=false`（:145）绿 |
| 3 | 「受众数据待接入」doubt 消失 | PASS | :146 `doubts` 不含 `REASON_AUDIENCE_PENDING`（canonical 常量同源引用）绿 |
| 4 | preJudge 分档变化 | PASS（注记 A） | 产品行为正确，三重证据：(a) 代码 `generate-candidates.ts:182` preJudge=resolvePreJudge(加权分)；(b) 同 run 必绿的回归套件 `match-services.test.ts:177-190` 钉死分档数学事实（sim 0.8 纯向量应 '高'（high=0.75），interests 入场加权 0.74 → 断言 **'中'**）；(c) **evaluator 探针**在外采派生路径复现分档变化（deriveAudienceDemo 夹具，sim=0.8 → 0.74 → preJudge='中'，4 断言全 PASS，见附录） |
| 5 | matchScore = 0.7 similarity + 0.3 audienceFit 加权断言 | PASS | :147-150 `1.0*MATCH_WEIGHTS.similarity + 0.6*MATCH_WEIGHTS.audience = 0.88` toBeCloseTo(5) 绿；权重常量 pin `match-score.ts:20-25`（0.7/0.3）；探针交叉：0.8/0.6 → 0.74 |
| 6 | evaluate_creator 消费真 audienceDemo 同断言 | PASS（注记 B） | 交付物 :162-185 以 `computeMatchScore` 直调（同 DB 行 audienceDemo + 同知识切片）≡ 落库值断言 + 代码实证 `evaluate-creator.ts:76,120-124` 工具将 `kol.audienceDemo` 原样喂入同一 `computeMatchScore`（三处复用铁律，无内联重算）；**evaluator L2 探针实际执行工具**（真网关 1 次 embedText）：`found=true`、`evaluation.pending=false`、reasons 含 **「受众契合 60%（来源：游戏知识库受众画像）」**——工具端到端消费真 audienceDemo 直接证据 |
| 7 | interests 全空行仍降级待核（D2 回归） | PASS | :153-160 `scorePending=true` + doubts 含「受众数据待接入」+ matchScore=0.8 纯向量直通，绿 |
| 8 | match 面候选列 scorePending=false 显真 %（真库集成断言） | PASS | :187-220 真 `loadMatchSurfaceData`：降级行上待裁定表且 `match=null`（待核）；升级行无 doubts 正确离表；`toCandidateView` 消费真库行 → **'88%'**。显示映射单点 `match-format.ts:170-173`（scorePending→null→「待核」，有值显 %）为 `surface-data.ts:96-108` 唯一消费路径 |
| 9 | M2-A D20 全量回归无损（match-services/match-approve/nightly-screen 套件绿） | PASS | 显式实跑三套件：**3 files / 20 tests 全绿（704ms）**；全量 run 内亦绿 |
| 10 | lint + tsc + test:unit 绿 | PASS | `next lint` → No ESLint warnings or errors（0/0）；`tsc --noEmit` exit 0；`npm run test:unit` → **34 files / 356 tests 全绿**。旁证：commit `7321292` CI「CI」+「Build & Push image」双 workflow conclusion=success |

## 注记（不构成缺陷，soft-watch 记账）

- **注记 A（preJudge 断言位置）：** F007 新套件 `score-upgrade.test.ts` 自身无显式 preJudge 断言（其夹具 0.88→'高' 与纯向量 1.0→'高' 同档，无法展示分档变化；:217 仅 passthrough）。分档变化事实由同 run 必绿的 `match-services.test.ts:183`（0.74→'中'）+ 本次 evaluator 派生路径探针闭环。**建议**下批次顺手在 score-upgrade.test.ts 补 1 行派生路径 preJudge 断言（把探针不变式收编进仓内套件）。
- **注记 B（工具执行形态）：** 交付物未实际执行 `evaluate_creator`（该工具 `embedText` 直连网关无注入点——M2-A 既有设计，P7 边界下套件内不打网关属正当），以直调等价 + 同源代码证据替代；本次验收以 L2 最小用量实际执行工具补齐端到端直接证据。

## L2 用量申明（授权口径内）

- **embedding 真调用：** 1 次 `embedText`（bge-m3，查询文本约 20 token）——evaluate_creator 工具端到端探针，最小用量。
- **TikHub：** 零调用零投喂（P1 铁律遵守；`/admin/seeds` 未触碰）。apify-kol：F007 验收范围不涉，未调用。

## 产物纪律（D-H）

- 探针夹具租户（`eval-f007-probe-*`）测毕级联删除；终态复核：Kol 2526（crawl 1 + user_upload 2525）、MatchCandidate/MatchPlan/PlanKol/PendingAction/OperationLog = 0、仅 dev 租户——与验收前基线完全一致。2 行视觉夹具与 2524 Kol 属基线态，未动。
- 未修改任何产品代码；探针脚本置于会话 scratchpad，未入仓。

## 附录：evaluator 探针（复现步骤）

真库 + mock 向量夹具（FPS 60/二次元 40 知识受众画像；`deriveAudienceDemo({matchedTags:['fps']})` 产出 audienceDemo；Kol embedding `[0.8,0.6,0,…]`，查询 mock `[1,0,…]` → sim=0.8）：

1. `generateCandidates(projectId, { embed: mockEmbed })` → 断言：sim 0.8 ≥ PRE_JUDGE_BANDS.high(0.75)（纯向量应'高'）✓ / scorePending=false ✓ / matchScore≈0.74 ✓ / **preJudge='中'（分档变化）** ✓
2. `evaluateCreatorTool.execute({projectId, kolIdOrPublicId}, {tenantId, agentId:'match'})`（真网关 1 次 embed）→ found=true ✓ / pending=false ✓ / reasons 含「受众契合 60%（来源：游戏知识库受众画像）」✓
3. 级联清理 + 基线复核 ✓

7/7 断言 PASS（2026-07-23 实跑输出在案）。
