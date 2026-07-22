# M2-A-MATCH F005 验收记录 — match 语法面接真 + mock 退役

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **对象 commit：** `0b81a18`（feat(M2-A-MATCH-F005)），验收于 HEAD `3d93f72`
- **结论：PASS**（逐条判定见下；页面运行时行为按批次口径由 READINESS 视觉/探针套件覆盖，本记录以代码/测试/DB 层为准）
- **L2 用量声明：** 真网关 embedText ×1（bge-m3，xg 项目查询文本一条，spec §4 授权口径内最小用量）；未做真对话。

## 逐条 acceptance 判定

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | campaigns/[id] RSC 扩组装 match 面数据（可序列化） | PASS | `src/app/admin/campaigns/[id]/page.tsx:48`（`loadMatchSurfaceData` → `project.match`）；`ProjectDetail.tsx:271-280` match 分支显式传 `data` prop，其余环节保持 `{ projectId }` 挂载契约（`ENV_SURFACE` 不动）；`MatchSurfaceData` 全字段纯数据可序列化 |
| 2 | 展示串格式化单点 `src/lib/display/match-format.ts`（万级串/待核/低中高/P5 bars top6 归一 0-9） | PASS | 文件实存 174 行：`formatWan`/`formatBudgetUsd`（null→待核 P6）/`formatRisk`/`deriveBars`（钳制 0-9、恒 6 根）；`tests/unit/match-format.test.ts` 15 用例全绿；DB 实测样例 plan `cost:"待核"`、bars `[5,4,4,4,4,4]` |
| 3 | 【P2】首访 lazy 生成 + 失败静默降级（CI 无凭据构建渲染安全） | PASS | `surface-data.ts:47-59`；DB 层行为实测（脚本 Phase A/B/C）：A1-A4 无凭据不抛错 + 返回空态 + `console.warn` 发出 + 零写库；B1 `cur=brief` 不触发生成；C1-C2 真网关 lazy 一次生成 3 plans + 20 candidates + 30 PlanKol（每组 10 ≤10）；D2 plans 已存在不重复生成 |
| 4 | match/index.tsx 接真 prop：矩阵/待裁定表消费真数据，scorePending→「待核」（裁决 #2） | PASS | `match/index.tsx:278-288` readContractSlot 序列化边界再校验（.length(3) 锁）；`toCandidateView`：scorePending/分缺失→`match:null`→`isPendingVerification`→`PENDING_TEXT.verify`（:218-227）；DB 实测 C9：20/20 候选 view 与 DB 行 scorePending/matchScore 严格对账一致 |
| 5 | 「批准这组」接 approve API→toast+router.refresh+跳 ?env=reach；「审阅」保持 toast | PASS | `match/index.tsx:293-309` POST `/api/match/plans/{id}/approve`（路由实存 F004）→ 成功 toast（原型 L995 文案逐字）→ `onApproved`；`ProjectDetail.tsx:275-279` setEnv('reach')+router.replace(?env=reach)+router.refresh；失败 409/5xx→toast 服务端信息不切环节；ReviewButton 保持 toast（:168-180，原型 L996 文案） |
| 6 | 布局零变更（ui-inventory V5 22 元素 🔒 逐项保持） | PASS | `git diff 693c215..0b81a18 -- match/index.tsx`：变更仅供给侧（mock import→view 契约 import、模块常量→prop、approve handler）；V5-1 横滚容器/V5-3 ★推荐/V5-4 best 渐变/V5-5 minibars/V5-10 依据/V5-11 pick 底/V5-12 foot ×3/FUZZY 5 列/V5-17 待核二形态/V5-19 pill 三态/V5-20 审阅/V5-21 shield 逐字——JSX 结构零改动。唯一文案变化 = D2 空态占位（PENDING_TEXT.connect→新空态句），不在 22 元素清单内且为 spec 硬要求（空态基线态文案） |
| 7 | mock/env-match.ts 退役：needle 全仓 grep 零代码残留 + mock/index.ts 翻牌 | PASS | 文件已删（F005 commit -132 行）；`grep -rn "env-match\|mockMatchPlans\|matchPlanListSchema" src/ tests/ scripts/` 命中仅 5 处注释性退役注记，零 import/零代码引用；`mock/index.ts:13` 登记行翻牌（~~env-match.ts~~ 已退役） |
| 8 | project-match.png 基线逐处对账后重生 + waitFor 校准 + 空态文案硬断言（§4.3） | PASS | `tests/visual/workbench.spec.ts:38-52`：waitFor「待你裁定」+ 空态硬断言 ×2（「组合方案尚未生成…」/「暂无待裁定候选…」）；darwin 基线 0b81a18 重生（后随 F008 全量再重生 46c0359）；linux 基线经 update-visual-baselines 两轮（7eb8401 + 5ed8dfc）；HEAD CI Visual regression job success |
| 9 | 运行时改→验→复原实证（RSC 组装层） | PASS | Evaluator 独立复做（DB 层，不起 server）：Phase D——plan rationale 写入 sentinel → `loadMatchSurfaceData` 再取 → `basis` 精确等于 sentinel（真 DB 直读非缓存/mock）→ 复原确认（D3）；测毕 Match 三表清零（E1，复查确认） |
| 10 | 两视口实测 | PASS（委托口径） | 页面运行时行为按批次验收口径由 READINESS 视觉/探针套件覆盖（端口纪律，:3000 专用）；代码层横滚保障实存（V5-1 `overflow-x-auto` + `min-w-[700px]`，diff 零变更）；1500px 基线经 CI Visual 全绿 |
| 11 | lint + tsc + test:unit + test:visual 绿 | PASS | 本机（prisma generate 前置后）：`next lint` 0 errors 0 warnings；`tsc --noEmit` exit 0；`vitest run` 307/307（28 文件，含集成测打真库）。test:visual 依 CI：F005 首推仅 Visual job 红（旧 linux 基线，§4.4 意图变更预期红；Lint/Typecheck/Unit/Build 均绿），基线重生后 F006→HEAD `3d93f72` CI 五 job 全绿（含 Visual regression success，run 29951617484） |

## DB 层行为实测摘要（脚本：scratchpad/f005-verify.ts，实质检查 20/20 PASS）

- 前置基线态：Match 三表 0 行（xg cur='reach' 为 seed canonical 值，非冒烟残留——`scripts/seed/canonical-projects.ts:61`）
- lazy 真生成（L2 embedText ×1）：MatchPlan=3（A 生活流精投/B 均衡 best/C 头部拉动，恰一组 recommended）、MatchCandidate=20、PlanKol=30（每组 10）
- 视图契约：plans 过 `matchPlanViewListSchema`（.length(3)）、candidates 过列表 schema；cost 恒「待核」（P6）；bars 恒 6 根 0-9（P5）；reach 万级串/risk 低中高/people「N 人」；fit 三态
- 裁决 #2 对账：受众数据全 null 现状下 20/20 候选 scorePending=true → view match=null（显示层「待核」），与 DB 行严格一致
- 清态复原（D-H）：测毕 Match 三表 0 + PendingAction 0 + OperationLog 0（终态复查确认）

## 观察项（非缺陷，不影响判定）

1. **并行验收交叉污染（环境现象）：** 脚本运行窗口内 PendingAction/OperationLog 各出现 1 行，经查为并行 fan-out 验收进程的 `gate:smoke` 中间态（toolName `__smoke_outbound__`，actor orchestrator，20:50:23），该脚本自带清理（gate-smoke.ts:106-112），随后复查全库归零。脚本中仅有的 2 个 FAIL 均由此瞬时污染引起，与 F005 无关。多 subagent 同库并行验收时，清态断言宜按「本 feature 产物归属」而非全表计数——供 fan-out 汇总参考。
2. Kol 计数本地为 2524（叙述口径 2525），非 F005 范围，不展开。
