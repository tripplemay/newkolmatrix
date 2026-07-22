# M2-A-MATCH F002 验收记录 — domain/match-score.ts 可解释评分纯函数

- **署名：** Andy/evaluator-subagent
- **日期：** 2026-07-22
- **阶段：** verifying（首轮，fan-out 单 feature 验收）
- **结论：** **PASS**（acceptance 8/8 项逐条判定通过）
- **依据：** 代码实物 + 单测运行输出 + 全套 test:unit + 覆盖率 + DB 实测（D-H 清态核查）。未采信任何实现叙述。

---

## 逐条 acceptance 判定

### 1. matchScore.compute 纯函数（无 IO）— PASS

- 实物：`src/lib/domain/match-score.ts`（143 行）。唯一 import 为 `import type { AudienceSlice } from 'lib/data/schemas/knowledge'`（type-only，编译期擦除）；全文件无 DB / 网关 / fetch / async / 副作用。
- 命名注记（role-context §13 命名漂移条款）：acceptance 写 `matchScore.compute` 为概念名；实物导出 `computeMatchScore`，与 D7 约定及 health.ts 先例（`computeHealth`，health.ts:181）完全一致——功能等价，非缺陷。architecture §5.4 表以 `matchScore.compute` 概念名登记且落点 `domain/match-score.ts` 已翻 ✅ M2-A。

### 2. 输入/输出契约 — PASS

- `MatchScoreInput`（:43-47）= `{similarity: number, audienceDemo: unknown|null, knowledgeAudience: AudienceSlice[]|null}`，与 acceptance 逐字段一致。
- `MatchScoreResult`（:50-57）= `{score, reasons[], pending}`；score 经 `clamp01` 恒 [0,1]（:59-62, :131），单测不变式断言全组合 20 例（test :155-169）。
- embedding 缺失候选不调本函数的 P2 定案在 docstring 明记（:37-39），责任归调用方 F003。

### 3. audienceDemo null → 纯向量分 + pending=true + reason「受众数据待接入」（FR-11.6）— PASS

- 代码：:119 缺失收集 → :122-128 返回 `{score: similarity, pending: true}`；canonical 文案常量 `REASON_AUDIENCE_PENDING = '受众数据待接入'`（:28，供 DB doubts / 页面「待核」同源引用）。
- 单测：test :30-39 断言 score=0.83 纯向量直通 + pending=true + reasons 含该文案；形状提不出信号的 6 种脏输入（'broken'/42/{}/{interests:'x'}/{interests:[]}/{interests:[1]}）同样降级不抛错（test :54-64，D2）。
- 附加：知识画像缺失有独立降级 reason `REASON_KNOWLEDGE_AUDIENCE_PENDING`（:31），null 与空数组两态均测（test :41-52）。

### 4. 知识受众画像参与加权时 reason 注明来源 — PASS

- 代码：:138 `受众契合 X%（来源：游戏知识库受众画像）`。
- 单测：test :106-113 断言 reasons 含「游戏知识库受众画像」。

### 5. 权重常量导出 — PASS

- `export const MATCH_WEIGHTS = {similarity: 0.7, audience: 0.3}`（:20-25），带「不得散落成魔数（HEALTH_WEIGHTS 先例）」注记。
- 单测断言权重和为 1（test :24-26）；组合分公式用常量引用而非魔数复算（test :103, :121, :129）。

### 6. 三处复用铁律注明（architecture :533）— PASS

- 注明：文件头 :9-11 明记「页面数据通道（F005 RSC 组装）/ 工具层（F007 evaluate_creator）/ 例程（F006 nightly-screen 经 F003 服务）共用本函数——单一真相源，后续 feature 不得内联重算评分」。
- 实物交叉验证（超出注明本身）：全仓 grep `computeMatchScore` 消费点仅两处——`src/lib/match/generate-candidates.ts:167`（F003 服务，供 F005 页面 lazy 与 F006 例程）+ `src/lib/agent/tools/evaluate-creator.ts:120`（F007 工具，注释明记「不内联重算」）；grep `MATCH_WEIGHTS` / 权重数值 domain 外零内联重算（唯一命中 `KolResultCards.tsx:38` 为 search_kols 相似度展示百分比，与匹配评分无关）。architecture §5.4 表已登记「三处复用齐全」。

### 7. 单测边界全覆盖，不打库不打网关 — PASS

- `tests/unit/match-score.test.ts`（12 用例，零 mock 零 IO——文件仅 import vitest + 被测纯函数 + 类型）：
  - similarity 0 / 1（:66-79）；越界 1.7 / -0.3 / NaN 钳位（:81-91）
  - null 降级：audienceDemo null（:30）+ knowledgeAudience null/[]（:41）+ 脏形状 ×6（:54）
  - 画像有无：两因子齐备加权 0.8×0.7+0.6×0.3（:95-104）/ 全命中 fit=1 / 零命中 fit=0 且 pending=false（:115-130）/ percent 全 0 不除零（:132-140）
  - 权重和=1（:24-26）
  - 不变式：reasons 恒非空（PlanKol.reasons 写侧非空上游保证，:144-153）+ score∈[0,1] 全组合（:155-169）
- 运行：`npx vitest run tests/unit/match-score.test.ts` → **12 passed (12)**。
- 覆盖率：`vitest run --coverage` → domain 层 97.84% Stmts / 97.27% Branch / **100% Funcs** / 98.21% Lines（门 ≥80 lines，远超）。

### 8. lint + tsc + test:unit 绿 — PASS

- `npx prisma generate`（L1 前置，testing-env-patterns §3）→ `npx tsc --noEmit` exit 0。
- `npm run lint` → `✔ No ESLint warnings or errors`（0 errors / 0 warnings，无 §15 矩阵触发项）。
- `npm run test:unit` → **28 files passed, 307 passed (307)**，含集成测试（夹具租户）。

---

## 产物纪律核查（D-H）

全套测试跑毕后 DB 实测（`node --env-file=.env` + Prisma count）：

```json
{"matchPlan":0,"planKol":0,"matchCandidate":0,"pendingAction":0,"operationLog":0}
```

Match 三表 + PendingAction + OperationLog 全零行，清态保持。本 feature 验收自身零 DB 写入（纯函数单测）。

## L2 注记

F002 为纯函数（无 IO），acceptance 无任何真网关项——**本 feature 无 L2 项，未产生网关用量**。真 embedText 调用属 F003/F005 验收范围。

## 环境注记

- 本机 Node v25.7.0，仓内无 `.nvmrc`（无版本锁约束）；测试全为 node 环境纯函数/真库，无 jsdom，Node 25 localStorage pattern（testing-env-patterns §4）不适用。
- 未起任何 dev/standalone server（端口纪律，:3000 留 READINESS）。
- 未修改任何产品代码；临时脚本仅落 scratchpad。
