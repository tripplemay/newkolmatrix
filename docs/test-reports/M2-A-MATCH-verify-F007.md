# M2-A-MATCH 首轮验收 — F007（match_plan/evaluate_creator 工具 + canvas ADR-28 + uiSyntax 注入）

- **署名：** Andy/evaluator-subagent（隔离上下文，fan-out 单 feature）
- **日期：** 2026-07-22
- **阶段：** verifying（首轮）· fix_rounds=0
- **被验实物：** commit `fb8d8c1`（工作树 HEAD `3d93f72` 全量代码）
- **结论：PASS**（acceptance 逐项全过）

## 验收方法

评估基于实物：代码静读 + L1 全量（lint/tsc/test:unit）+ 真机 executeTool 直调
（独立夹具租户，`${process.pid}` 后缀隔离，不触碰共享 dev tenant——验收期间存在并行
subagent 操作共享库，实测 OperationLog 计数在两次查询间变化，故全部写路径走夹具租户）。
L1 前置：`prisma generate` 已先跑；本机无 `.nvmrc`（Node v25.7.0，全部测试本机通过，
无 jsdom/localStorage 类用例受影响）。

**L2 用量注明（授权口径：仅 embedText 与可选真对话，最小用量）：**
- 真网关 embedText 共 **4 次短文本调用**：验证脚本 3 次（evaluate_creator 两因子齐备 /
  pending 降级 / EMBEDDING_MISSING 路径各 1）+ `agent:smoke` 内 search_kols 1 次。
- 候选/组合生成走 **P7 mock 向量注入**（`generateCandidates(projectId, { embed: mockEmbed })`），
  零网关调用。
- **[L2] 可选真对话未执行**（授权口径内为可选项；工具执行链已由 executeTool 直调全路径
  覆盖，chat 运行时装配链 persona-router→toAiSdkTools→executeTool 经静读 + orch:smoke 佐证）。

## Acceptance 逐项判定

| # | 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | 两工具 class:'internal'，柱一注册表 | **PASS** | `src/lib/agent/tools/match-plan.ts:109-117` / `evaluate-creator.ts:137-148`（class:'internal', source:'native', 无 buildHarm）；`tools/index.ts:20-21` NATIVE_TOOLS 注册；单测 `match-tools.test.ts` 契约块过 |
| 2 | match_plan：projectId→现行组合+PlanKol 摘要 | **PASS** | 真机直调：夹具项目生成一轮后返回 3 组（A/B/C 名序稳定、均 draft、恰 1 recommended）、每组成员携 matchScore 降序 + 非空 reasons + 名称、metrics 宽松解析（budgetUsd 恒 null P6 / people=成员数）；现行轮口径复用 `currentRoundPlanIds` 单点（`surface-data.ts`，F005 页面同源）；三口径（id/publicId/slug）均实测解析；未知项目→`PROJECT_NOT_FOUND` 不抛错；零 plans→`plans:[]` 空态不编数据 |
| 3 | evaluate_creator：projectId+kol idOrPublicId→matchScore.compute 单人评估+reasons | **PASS** | 真机直调（真网关 embedText）：两因子齐备→`score=0.18`（=0.7×sim(clamp 0)+0.3×0.6 受众契合，与 `MATCH_WEIGHTS` 公式可复算一致）+ pending=false + reasons 含「向量相似度…」「受众契合 60%（来源：游戏知识库受众画像）」；audienceDemo null→pending=true + reason「受众数据待接入」（FR-11.6）；embedding 缺失→`EMBEDDING_MISSING` + evaluation:null（P2 不编分）；未知 KOL→`KOL_NOT_FOUND`；评分复用 `computeMatchScore` + F003 导出的 `buildQueryText`/`loadKnowledgeAudience`（:533 三处复用铁律，无内联重算——静读证实） |
| 4 | match persona tools 扩四件（registry.ts） | **PASS** | `src/lib/agent/registry.ts:100` = `['search_kols','get_kol_detail','match_plan','evaluate_creator']`；单测断言相等 + 其他 6 人格不误挂两工具（逐人格断言过）；装配链 `persona-router.ts:80`→`to-ai-sdk-tools.ts`（经 getTool→executeTool）静读确认四工具可流入 chat 运行时 |
| 5 | canvas ADR-28：路由键改 type + 受控 register API | **PASS** | `canvas-registry.tsx:50-53` resolveCanvasKey（type 优先/工具名回退）+ `:24-32` registerCanvasRenderer（重名抛错）；单测 4 用例过：type 优先（异工具名携 type 仍命中）/ 回退键 / 未注册返回 null 不抛错（NFR-S6）/ register 注入 + 重名拒（含对既有 'search_kols' 键重注册拒） |
| 6 | MatchPlanCard 新 canvas 卡（沿 KolResultCards 先例） | **PASS** | `src/components/copilot/canvas/MatchPlanCard.tsx`（92 行）：SurfaceCard 流 + 展示串走 `match-format`（formatWan/formatRisk 单点，与 F005 同源）；found:false / 零组 / 有组三态均覆盖；数据一律 props 传入，无 dangerouslySetInnerHTML（FR-12.16 红线 grep 零命中） |
| 7 | search_kols 卡迁新 API 行为零变更 | **PASS** | `search-kols.ts` SearchKolsOutput 无 type 字段（静读接口定义）→ 恒走工具名回退键；KolResultCards 本批零改动（git log 末次改动在 FE-REFACTOR 批）；`CopilotPanel.tsx:100` hasCanvasRenderer 判定带 output（唯一调用点，签名 output 可选、向后兼容）；单测「无 type 输出走工具名回退键」过 |
| 8 | uiSyntax 注入 prompt（buildSystemPrompt 增「你的产出形态：{uiSyntax}」段） | **PASS** | `registry.ts:63`（第五段，与 personaBoundary UI 卡同源字段）；单测全 7 人格 systemPrompt 逐个断言含 `你的产出形态：${p.uiSyntax}` + match 锚定「对比矩阵」，过 |
| 9 | 单测：工具 zod 契约+mock 出参形状+registry 映射+prompt 拼接含 uiSyntax | **PASS** | `tests/unit/match-tools.test.ts` 13 用例独跑 13/13 过（zod 契约含 strip/双必填/空串拒；registry+人格映射；uiSyntax；canvas 路由以契约形状 mock 出参驱动）；出参形状另经真机直调实测补强（本报告 #2/#3） |
| 10 | 真对话属 L2 留验收授权 | **PASS**（边界项） | 可选项未执行，见上方 L2 用量注明；不构成缺口 |
| 11 | lint + tsc + test:unit 绿 | **PASS** | `next lint` ✔ 0 errors 0 warnings；`tsc --noEmit` exit 0；`test:unit` 28 文件 307/307 全过 |

## 回归面

- `npm run agent:smoke` 全断言过（柱一 executeTool 直调无回归）。
- `npm run orch:smoke` 全断言过（persona 边界 / handoff / 编排路由无回归）。

## 观察项（不影响判定）

1. commit `fb8d8c1` message 称单测「18 用例」，实物为 13 个 `it` 用例——验收只依据实物与
   acceptance（不要求用例数），叙述性偏差记录在案。
2. `canvas-registry` 内建渲染器经 `ensureBuiltinRenderers` 直接 set（绕过 register 的重名抛错）——
   幂等防 HMR 重估的合理设计，且单测证实经受控 API 对内建键重注册会被拒，无双语义风险。
3. spec F007「agent:smoke 扩段」标注可选，未扩段——非缺口。

## D-H 清理记录

- 夹具租户 `test-tenant-m2a-f007-eval-*` 级联删除，残留夹具 Kol=0、夹具 tenant=0（实测）。
- 我方 agent:smoke 触发的 1 条 PendingAction（`__smoke_outbound__`）+ 1 条 gate OperationLog
  已定向删除。
- 终态实测：`{matchPlan:0, planKol:0, matchCandidate:0, pendingAction:0, operationLog:0}`
  （测量时点值；并行 subagent 各自清理自身产物）。
- 验证脚本沉淀为可复跑测试产物：`scripts/test/m2a-f007-tool-verify.ts`（自带夹具+自清理）。
