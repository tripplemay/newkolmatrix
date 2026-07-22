# M1-C-LIST-TODAY · F007 验收分报告 — architecture.md 口径校准（17 条清单，S8/S1 兑现）

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被验对象：** commit `022003e`（docs(M1-C-LIST-TODAY-F007)），架构文档现状 @ HEAD `5a666a9`（022003e 之后 architecture.md 零改动，`git log 022003e..HEAD -- docs/dev/architecture.md` 为空）
- **判定：PARTIAL** — 17 条清单逐条兑现且 A 类翻牌与实物全部一致；但按 Evaluator 文档新鲜度 clause（v1.0.6，role-context/evaluator.md）全文扫描发现 **3 处批内反向漂移残留**：本批 F004 已交付的例程调度器/instrumentation.ts 在 §4.2 / §8.10 表 / §13 三处仍标「未实装/不存在」，其中 §8.10 为同节自相矛盾（节头已翻牌、同节对照表未翻）。

---

## 1. 验收方法

1. `git show 022003e -- docs/dev/architecture.md` 全量 diff 逐 hunk 对账 17 条清单（spec §2 F007 行号为校准前行号，diff hunk 起点逐一对应）。
2. A 类 8 条翻牌逐条 grep/ls 实物（spec §5「抽查 A 类翻牌与实物一致」——实际做了全量非抽查）。
3. B/C 类改写逐条与实物交叉（vitest.config.ts / ci.yml / schema.prisma / src 目录 / advanceStage 消费面）。
4. 文档新鲜度 clause：对当前全文 50 处「未实装/演进目标」标记逐条筛查，重点核对 M1-A/B/C 已交付物是否仍被标「未实装」（反向漂移）。
5. push 验证：`git branch -r --contains 022003e` → origin/main；批次尾实质 commit `9d4aaa4`（F006）CI + Build&Push 双绿（gh run list 实证）。

## 2. 17 条清单逐条判定（行号 = 校准前 → 现行）

### A 类 8 条（「未实装」翻牌为已实装 + 实物路径）

| # | 位置 | 校准后口径 | 实物核对 | 判定 |
|---|---|---|---|---|
| 1 | :84→:84 vitest 选型 | 已装 ^4.1.10 + @vitest/coverage-v8，vitest.config.ts 在仓 | package.json:106,119 = `^4.1.10` 两件；`vitest.config.ts` 在仓 | ✅ |
| 2 | :283→:283 domain/ | 部分实装：health/env-guards/env-advance 三件已落 M1-A | `ls src/lib/domain/` = env-advance.ts + env-guards.ts + health.ts，恰三件 | ✅ |
| 3 | :481→:481 游标① | 已实装（cur/maxReached 双值列 + env-guards + env-advance + 前端拦截）+ as-built 注：仅 →brief/→match 可判，其余保守拒 DEPENDENCY_NOT_IMPLEMENTED | schema.prisma:131-132 `cur`/`maxReached`；env-guards.ts:109-123 实证 brief 无条件 / match 按 goal 判 / reach·delivery·insight 全部 `deny('DEPENDENCY_NOT_IMPLEMENTED')`——与文档逐字吻合 | ✅ |
| 4 | :654→:655 schemas/ | `src/lib/data/schemas/project.ts` 已落（M1-A F003） | 文件在仓；schema.prisma:125 注释亦指向它 | ✅ |
| 5 | :758→:759 Project 列 | Project 已有 cur/maxReached/goal/budgetTotal/currency/market/gameId；PendingAction 已有 projectId/agentId | schema.prisma:124-132 七列全在；PendingAction 块含 projectId/agentId（M1-C F002 注释） | ✅ |
| 6 | :1128→:1129 compute_health | 首例已实装：tools/compute-health.ts 薄封装 domain/health.ts，与详情/列表/今天页同源 | compute-health.ts:18-23 import domain/health；computeHealth 消费面 = today/page.tsx:44,318 + campaigns/page.tsx:30,68 + campaigns/[id]/page.tsx:17,42（三页同源属实） | ✅ |
| 7 | :1628→:1629 §12.6.1 单元/集成门 | ✅ 生效（M1-A F001/F006），unit job 起 pgvector，覆盖率门 ≥80%（include 收窄 D17） | ci.yml:63-91 unit job：services pgvector/pgvector:pg16 + migrate deploy + `test:unit:coverage`；vitest.config.ts `thresholds:{lines:80}` | ✅ |
| 8 | :1632→:1633 §12.6.2 测试形态 | vitest 已装，tests/unit/ + tests/integration/ 两层 | 两目录在仓（unit 9 件 + integration 3 件） | ✅ |

### B/C 类 9 条（措辞改写 / 拆标）

| # | 位置 | 校准内容 | 实物核对 | 判定 |
|---|---|---|---|---|
| 9 | :402→:402 §5 章头 | 拆出已实装例外（§5.3① 游标 + §5.4 health.compute/envGuards） | 与 A3/A2 实物一致 | ✅ |
| 10 | :521→:521 §5.4 拆标 | 节头逐项拆标：health.compute→domain/health.ts + envGuards→domain/env-guards.ts 已落；matchScore/crmInfer/deliveryCheck/roi/attribution 归 M2+ | 与 domain/ 目录实物一致；表格批次列 M1 已交付、M2-M4 未动（设计决策零改动） | ✅ |
| 11 | :563→:563 双重执行 | 已实装：服务端 env-advance 硬闸 M1-A + 前端 selectEnv 拦截 M1-B；as-built 注 advanceStage 唯一消费者为集成测试（S10） | 全仓 grep advanceStage：产品代码消费仅 env-advance.ts 自身，其余全在 tests/integration + scripts/test 探针——「推进写 UI 入口未建」属实 | ✅ |
| 12 | :629-635→:630-631 §6.7 | mock 已退役范围（详情 M1-B F001 / 列表+今天 M1-C F001/F003，projects/today 已删）+ 存续范围（env-\*/creators/knowledge/insight/runs） | `ls src/lib/data/mock/` 无 projects.ts/today.ts，存续文件与所列范围一致；两页无 'use client' 指令（仅注释提及） | ✅ |
| 13 | :929→:930 §7.7 断言欠账 | vitest 已装、tests/integration/ 基座已在，该断言本身仍欠 | 属实（integration 3 件中无 append-only 被拒断言） | ✅ |
| 14 | :1642-1669→:1643+ §12.6.3 | 已实装 + 两处刻意偏离：D18 原生 resolve.tsconfigPaths（未装 vite-tsconfig-paths）、D17 include 收窄至 domain/**+provenance；规划稿保留供追溯 | vitest.config.ts:`resolve:{tsconfigPaths:true}` + `include:['src/lib/domain/**','src/lib/data/provenance.ts']`；package.json grep vite-tsconfig-paths = 0；规划稿代码块仍在 | ✅ |
| 15 | :1684→:1687 CI 流程图 | 本地 + vitest；CI = lint/typecheck/unit+integration（起 pgvector）/build/visual（起 pgvector+migrate+seed） | ci.yml 实证：unit job（pgvector service + migrate）+ visual job（pgvector + migrate + seed canonical-projects） | ✅ |
| 16 | :1797-1798→:1798-1804 §14 | M0.5 置 ✅ 已交付；M1 行拆分（project+brief，M1-A/B/C 三批置 ✅，含本批交付项：列表/今天页 RSC 直读 · 雷达聚合 PendingAction 真数据 · 例程调度器 node-cron+health-scan）；M1-D 新行 | 本批交付项三件均在 M1 行标注（acceptance「本批交付项在 §14 M1 行同步标注」兑现） | ✅ |
| 17 | :1833→:1838 ADR-16 | 锁定，已兑现首例：domain/health.ts 三处复用齐全（页面 RSC + compute_health 工具 + health-scan 例程） | 三处消费实证：三页 RSC computeHealth + tools/compute-health.ts + routines/health-scan.ts:11,37 import computeHealth | ✅ |

### 清单外连带 10 处（commit 自述 sanity 扫描）抽核

- §1 总览 :36 例程翻牌 ✅ · §8.10 节头 :1157 翻牌 ✅（**但同节表格 :1161 未翻，见 §3 问题 1**）· §11.6 :1559 翻牌 ✅ · ADR-19 :1841（调度器已落 M1-C / 知识解析归 M1-D）✅ · ADR-20 :1842（已兑现，runExclusive 实证 scheduler.ts:26,56）✅ · §5.3⑤⑥ :517/519 归 M1-D ✅ · §7.6 :901 归 M1-D ✅ · §11.3 :1545 归 M1-D ✅ · OperationLog :800（projectId/payloadJson 列已落、筛选面未建）✅ 实证 schema OperationLog 块两列在 + @@index([projectId])。
- 「全文『归 M1）』stale 标注归零」：grep `归 M1）` = 0 ✅（但该 needle 收窄漏掉「归 M1/M3」变体，见 §3 问题 2）。

### 其余 acceptance 项

- **只改口径不改设计决策**：diff 逐 hunk 核对——守卫表内容、§5.4 函数表、规划稿代码块、ADR 决策本体均未动，仅状态/措辞层变更 ✅。
- **push 验证**：022003e 在 origin/main；批次尾实质 commit 9d4aaa4 的 CI + Build&Push 双 success（gh run list 实证）；022003e 之后仅 progress.json commit（5a666a9），文档零后续改动 ✅。

## 3. 问题（导致 PARTIAL 的 3 处批内反向漂移）

> 依据：role-context/evaluator.md 文档新鲜度 clause（v1.0.6）——批次含口径权威文档校准时，「已实装却仍标未实装 = 批内反向漂移，判 PARTIAL」。以下三处全部关于**本批 F004 自己交付的例程调度器/instrumentation**，恰是 F007 commit 自述「例程调度器翻牌」sanity 扫描的目标域，扫描不完整。

1. **§8.10 同节自相矛盾（:1161）**：节头 :1157 已翻为「骨架已实装（M1-C F004：lib/jobs/ scheduler + 互斥锁 + health-scan）」，但 4 行之下的对照表列头仍是「Proactive 例程（**未实装**）」。实物：src/lib/jobs/scheduler.ts + routines/health-scan.ts + src/instrumentation.ts 均在仓且接入 CI 绿。校准前节头/表格是一致的（都标未实装），F007 只翻节头引入了同节矛盾。
   复现：`sed -n '1157p;1161p' docs/dev/architecture.md`
2. **§4.2 作业通道仍标未实装（:280）**：「作业通道：调度器例程 + 信号 webhook（**演进目标，未实装，归 M1/M3**）」——调度器例程半边已在本批实装（health-scan 产物落 OperationLog、经今天页 feed/雷达呈现，正是该行描述的形态）。commit 的「归 M1）」归零 grep needle 收窄，漏掉「归 M1/M3」联写变体。
   复现：`grep -n '作业通道' docs/dev/architecture.md`
3. **§13 存在性断言失实（:1746）**：「启动校验现状（as-built）：无集中 serverEnv()、**无 `src/instrumentation.ts`**」——该文件已由本批 F004 建立（`ls src/instrumentation.ts` 在仓，nodejs runtime 启动 scheduler）。周边叙述（无集中 fail-fast、gateway 懒校验、src/lib/env.ts 不存在）仍准确，但「无 src/instrumentation.ts」的字面断言与实物直接冲突——后续读者会据此误判 instrumentation 钩子可用性。
   复现：`grep -n 'instrumentation' docs/dev/architecture.md | head -3 && ls src/instrumentation.ts`

**修复建议（fixing 阶段，均为一行级文档改动）**：:1161 列头改「Proactive 例程（骨架已实装，M1-C F004）」；:280 改「调度器例程已落 M1-C（health-scan），信号 webhook 归 M3」；:1746 改「无集中 serverEnv()；`src/instrumentation.ts` 已在（M1-C F004，仅启动例程调度，不承担 env fail-fast）」。

## 4. 次要观察（不计问题，随手可修）

- :1035「未实装（依赖 M1 knowledge 域）」——knowledge 域本批已改名 M1-D，此处里程碑引用漏改（状态标注本身准确）。
- :1112 §8.6.1「需 vitest，见 §12.6」——vitest 已装，阻塞理由过时；断言本身确未实装（状态准确）。同型问题 :929 在清单内已按正确口径修（「vitest 已装…断言仍欠」），此处可照抄。

## 5. 反向漂移全文筛查明细（新鲜度 clause 覆盖面）

当前全文 50 处「未实装/演进目标」标记逐条筛查，除 §3 三处外其余全部与实物相符（抽验实证）：prompt.ts ✗ 不存在 ✅ · src/lib/ops ✗ ✅ · src/lib/api ✗ ✅ · src/lib/env.ts ✗ ✅ · schema 无 deletedAt/platformUserId/embeddingTextHash ✅ · PendingActionStatus 恰 3 值（:780 3 态 as-built 准确）✅ · tests/unit 无 canvas-registry.test.ts（:1074 准确）✅。

## 6. 结论

- **result = PARTIAL**：acceptance 列明的 17 条清单 + §14 标注 + 游标 as-built + 设计决策零改动 + push 验证全部兑现且实物一致；扣分项全部来自新鲜度 clause 的批内反向漂移（3 处，均一行级，同属例程调度器主题）。
- 按流程 F007 应回 `pending` 进入 fixing；三处修复合计 ≤5 行文档改动，无代码面。

---

## 对抗复核（adversarial re-verification · 隔离 fresh context）

- **复核人：** Andy/evaluator-subagent（对抗复核，独立 fresh context）
- **日期：** 2026-07-22 · 复核对象：本报告 §3 三处批内反向漂移（PARTIAL 依据）· HEAD `5a666a9`（复核时点 architecture.md 相对 022003e 零改动，`git log 022003e..HEAD` 实证为空）
- **复核结论：证伪失败，维持 PARTIAL。**

### 证伪路径 1 — 逐条复现 steps_to_reproduce：三处全部复现

1. `sed -n '1157p;1161p' docs/dev/architecture.md`：:1157 节头「骨架已实装（M1-C F004：`lib/jobs/` scheduler + 互斥锁 + health-scan…）」与 :1161 表列头「Proactive 例程（**未实装**）」同节并存，逐字复现。`ls` 实证 scheduler.ts / routines/health-scan.ts / src/instrumentation.ts 三件在仓。另经 `git show 022003e` diff 交叉确认：校准前节头为「演进目标（未实装，归 M1）」（与表格一致），022003e 只翻节头、:1161 表行完全不在 diff 内——**矛盾确系 F007 commit 自身引入**，原报告归因准确。
2. `grep -n '作业通道'` → 唯一命中 :280，含「演进目标，未实装，归 M1/M3」，逐字复现。`grep -c '归 M1）'` = 0（commit「归零」自述字面为真），`grep '归 M1/M3'` 命中 :280——原报告「needle 收窄漏掉联写变体」的机理分析成立。
3. `grep -n '无 \`src/instrumentation.ts\`'` 命中 :1746；文件在仓，`git log --follow` 溯源 = 948d327（本批 F004），文件头注释自述「M1-C F004」。存在性断言与实物直接冲突，复现。

### 证伪路径 2 — 环境误报排查：不适用

testing-env-patterns.md 全部 7 条（字体子集烟测 / fire-and-forget audit / prisma generate / Node 版本 / E2E suite isolation / RLS 视角 / standalone vs dev）均针对运行时测试环境；本 3 处发现为纯静态文档 grep + 仓库文件存在性核对，无任何运行时依赖，不构成环境误报。

### 证伪路径 3 — spec 裁决 / acceptance 修订注记冲突排查：无冲突，且有两点反向加固

- spec §2 F007 的 17 条清单确不含 :280/:1161/:1746，但 **022003e commit 自述已将范围扩至「清单外连带残留 10 处（sanity 扫描补齐）：例程调度器翻牌（§1 总览/§8.10/§11.6/ADR-20 已兑现）」**——§8.10 在 commit 自declared 范围内，翻牌却只翻半节；finding 1 连「超范围苛求」的辩护空间都不存在。
- role-context/evaluator.md 文档新鲜度 clause（v1.0.6）为 Planner 制定的常设验收规范：「已实装却仍标未实装 = 批内反向漂移，判 PARTIAL」——本批含口径权威文档校准（F007 即 architecture.md），clause 命中，PARTIAL 判级为规范字面结论，非评估人裁量加严。
- spec §3 裁决 D1/D-A~D-I 无任何一条接受这些 stale 标注为预期；相反 **D-C 明文锁定「例程载体 = node-cron 进程内 + instrumentation.ts」**，:1746「无 src/instrumentation.ts」与本批裁决落地物直接抵触。§6「不在本批」仅排除 knowledge 域，与三处无涉。

### 判级复核

acceptance 主体（17 条 + §14 标注 + 游标 as-built + 设计决策零改动 + push 验证）兑现属实（本报告 §2 抽样交叉验证无异议）；3 处均为一行级文档反向漂移，未伤及设计决策与代码面——PARTIAL（而非 FAIL）判级与 clause 及缺陷量级相称，不予改判。

**revised_result = PARTIAL（维持原判，refuted = false）。**
