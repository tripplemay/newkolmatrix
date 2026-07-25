# M4-INSIGHT · F006 验收报告

- **Feature：** F006 — `draft_report` 内部工具 + WeeklyReport 落库（P6 / P10 / P5）
- **验收人：** Andy / evaluator-subagent（隔离上下文，fresh context；仅取磁盘实物与实测输出）
- **阶段：** verifying（首轮，fix_rounds=0）
- **日期：** 2026-07-24
- **结论：** ✅ **PASS**（含 2 条 soft-watch 观察项，均不属 acceptance 面）
- **执行者：** generator（本条非 executor:evaluator，纯验收）

---

## 0. 取证环境（L1 前置检查，对照 `framework/patterns/testing-env-patterns.md`）

| 项 | 事实 |
|---|---|
| Prisma client | §3 规矩：`npx prisma generate` 先于 tsc 已跑 ✓ |
| DB | `newkolmatrix-dev-db` :5434 Up(healthy)；`\d "WeeklyReport"` 10 列 + 2 索引 + projectId FK 在场 |
| Node | v25.7.0；仓内无 `.nvmrc`（§4 不构成版本误报）；本 feature 无 jsdom 面 |
| 被测提交 | HEAD `fc905c1`（代码基线 `f6a631b`，GitHub CI = success） |
| 命令 | `npx vitest run tests/integration/draft-report.test.ts` · `npx tsc --noEmit` · 自建探针 ×2 |

**L2 授权状态：** 用户**未授权**真网关调用。全程 `AIGCGATEWAY_BASE_URL` 被显式改写为本进程内 127.0.0.1 stub，
API key 为假值 → **真网关 `https://aigc.guangai.ai` 零访问**（探针尾行自证：`网关调用总数（全部指向本地 stub）= 8；真网关调用 = 0`）。
`INSIGHT_E2E_REAL_LLM=1` 真网关最小用量 **[L2] 未执行，待授权**。

被测产物（git-tracked）：`src/lib/insight/weekly-report.ts`(345) · `src/lib/agent/tools/draft-report.ts`(48) ·
`src/lib/agent/registry.ts`(insight 人格 tools) · `src/lib/agent/tools/index.ts`(NATIVE_TOOLS +1) ·
`src/app/api/insight/adopt/route.ts` · `tests/integration/draft-report.test.ts`(288)。

**Evaluator 新增测试产物（未提交，交编排者处置，防与并行 fan-out 抢 git）：**
`scripts/test/f006-eval-probe.ts`（20 断言独立探针）· `scripts/test/f006-router-check.mts`（人格运行时暴露核验）。

---

## 1. Acceptance 逐条核对

> acceptance 原文（features.json F006）：draft_report 注册且挂 insight 人格；class=internal；经 gateway chat 起草（无凭据/SKIP 时固定草案 + 明示降级，不静默）→ WeeklyReport 落库（draftContent 非空 / adopted=false / projectId 区分 scope P10）；采纳服务置 adopted=true + adoptedAt（幂等：重复采纳不改写 adoptedAt）；采纳是 internal（无 PendingAction）；集成测覆盖起草落库 + 采纳幂等；LLM 经注入缝 mock（真网关 L2 留验收）

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | draft_report 注册且挂 insight 人格 | ✓ | `tools/index.ts` NATIVE_TOOLS 含 `draftReportTool`；`registry.ts:171` insight tools=`['compute_roi','draft_report','create_share_link']`；**运行时**核验：`personaToolSubset(insight)` → 三工具，`toAiSdkTools` 暴露键含 `draft_report`（不止声明，确实可被该人格调用） |
| 2 | class=internal | ✓ | 注册表实物 `name=draft_report class=internal source=native buildHarm=undefined`；直调后 `PendingAction=0` |
| 3 | 经 gateway chat 起草 | ✓ | 探针 A1/A2/A3：默认 caller 实际发出 `POST /v1/chat/completions`，wire `model=deepseek-v3`(=`REPORT_CHAT_MODEL`)、`max_tokens=4000`（长文档）；A4 system 含「绝不编造 / 证据不足」诚实铁律；A5 user 段含 `<FACTS>` + spend 真值 `987.65` + 口径「已放款」+ 缺口行 |
| 3b | 长文模型路由插座 | ✓ | `AIGCGATEWAY_REPORT_MODEL=eval-big-long-doc-model` 重跑 → wire `model=eval-big-long-doc-model`，插座真生效（NFR-P8 同 M1-D VISION_MODEL 先例；未配时回落默认 chat 模型，见观察 K） |
| 4 | 无凭据/SKIP → 固定草案 + 明示降级，不静默 | ✓ | 探针 C1 `degraded=true` + 首行 `【降级草案】` + 含「证据不足」；C2 `console.warn('…降级固定草案（明示，不静默）')` 实捕获；C3 降级路径网关调用数 3→3（零外呼）；C4 固定草案仍含真实 spend `987.65`。「SKIP」= `insight:e2e` 默认清凭据分支（`insight-e2e.ts:42-48`）与 `weekly-draft-routine.test.ts:26` 同法，均落此降级面 |
| 5 | → WeeklyReport 落库：draftContent 非空 / adopted=false | ✓ | 探针 A7 直读库行：`draftContent`=LLM 产物、`adopted=false`、`adoptedAt=null`、`generatedBy='insight'`；集成测 12/12 同向 |
| 6 | projectId 区分 scope（P10 双态） | ✓ | 探针 G：同一 period `2031-W01` 下 `projectId=null`（跨项目 V12）与 `projectId=<proj>`（项目复盘 V8）落**两条独立行**，id 不同；schema `projectId String?` + FK 在库 |
| 7 | 采纳置 adopted=true + adoptedAt | ✓ | 探针 E1：`adopted=true`、`adoptedAt` 为 Date；`api/insight/adopt` 路由复用同一服务（无第二实现） |
| 8 | 幂等：重复采纳不改写 adoptedAt | ✓ | E1 **并发**两路 adopt → 仅 1 路 `alreadyAdopted=false`，两路 adoptedAt 毫秒级相等（原子条件 `updateMany where adopted:false`）；E2 串行第三次 `alreadyAdopted=true` 且库行 adoptedAt 未变 |
| 9 | 采纳是 internal（无 PendingAction） | ✓ | 探针 H1：起草 ×6 + 采纳 ×4 + 工具直调后 `PendingAction count=0`；H2 工具输出 `adopted=false`（只起草不采纳，采纳留人确认）；`draft-report.ts` 无 buildHarm |
| 10 | 集成测覆盖起草落库 + 采纳幂等 | ✓ | `tests/integration/draft-report.test.ts` **12/12 passed**（注册与人格 2 / 起草落库 2 / 同周期重入 2 / 采纳幂等+异常 2 / 降级+直调+入参契约 3 / isoWeekPeriod 1） |
| 11 | LLM 经注入缝 mock（真网关 L2 留验收） | ✓ | `ReportLlmCaller` 注入缝在场；**CI 无凭据条件复现**（`AIGCGATEWAY_*` 置空跑同一套）→ 仍 12/12 且 mock 用例 `degraded=false`，证明注入 caller **无条件调用**（c09ef41 静默改道回归已钉死）。真网关 [L2] 未授权未执行 |

**逐条结果：11/11 ✓（无 ✗）。**

---

## 2. 超出 acceptance 的独立对抗核验（Evaluator 自建，非 Generator 测试重跑）

| 项 | 结果 | 说明 |
|---|---|---|
| D LLM 返回空白草案 | ✓ | stub 回 `'   '` → 明示抛 `LLM 返回空草案（不落空行）`，库行数 2→2 **零落库**（不写空报告） |
| F 跨租户采纳 | ✓ | 用租户 B 采纳租户 A 的报告 → 抛「采纳失败：报告不存在」，A 的行 `adopted` 仍 false（不静默改写他人数据） |
| 诚实边界（P1） | ✓ | LLM 路径 system 明令不得编造 reach/conversions/ROI；降级草案固定尾句「触达 / 转化 / ROI：本期无数据源，证据不足，不做归因结论」；两路径都不填 0、不猜 ROI |
| 三处复用（P2）落实 | ✓ | `loadFactLines` 直接调 `computeRoi` / `attributionGaps` / `loadProjectSpend`，无内联重算；例程 `weekly-draft` 与工具共用 `draftWeeklyReport` 单一实现（grep 全仓仅此一处起草） |
| 零真实副作用 | ✓ | 全程无 outbound：无邮件、无资金、无公开链接；网关只打本地 stub；探针夹具租户自清理（复核 `Tenant like 'test-tenant-m4-f006-eval%'` = 0，`WeeklyReport period like '2031-%'` = 0） |

---

## 3. Soft-watch 观察项（不属 acceptance，不阻断）

| # | 观察 | 复现 | 影响 / 建议 |
|---|---|---|---|
| S1 | **降级固定草案里项目名带 XML 实体**：`escapeForXml` 用于 LLM prompt 防注入，但 `factLineToText` 被降级草案复用 → 名为 `R&D <alpha>` 的项目在**用户可见**草案中显示为 `R&amp;D &lt;alpha&gt;` | 探针 I | 纯展示层瑕疵，仅在无网关凭据时可见；真实项目名（中文）几乎不含 `&<>`。建议下批把转义下沉到 prompt 组装处 |
| S2 | **同周期并发起草会堆重复行**：`findFirst → create` 非原子，`(tenantId, projectId, period)` 无唯一约束 → 两路并发起草产出 2 行 | 探针 J（rows=2） | 顺序重入的覆盖策略（文件头承诺）已由集成测证实有效；例程侧另有 `runExclusive` 互斥。仅「工具与例程真同刻并发」才触发，UI 读取按 createdAt desc 不致错值。建议下批加唯一约束或 upsert |
| S3 | **[L2] 真网关起草未执行**：默认 `AIGCGATEWAY_REPORT_MODEL` 未配 → 长文周报实际仍走 `deepseek-v3`（与通用 chat 同模型），「长文用大模型」在 prod 默认态未差异化 | 代码 `REPORT_CHAT_MODEL` 默认回落 | 插座已验证可路由；真模型选择属运维配置。授权后建议跑 `INSIGHT_E2E_REAL_LLM=1 npm run insight:e2e` 复核真网关长文可用性与耗时 |

---

## 4. 证据附录（关键输出摘录）

```
$ npx vitest run tests/integration/draft-report.test.ts
 Test Files  1 passed (1)      Tests  12 passed (12)

$ AIGCGATEWAY_BASE_URL= AIGCGATEWAY_API_KEY= npx vitest run tests/integration/draft-report.test.ts   # CI 无凭据条件复现
 Test Files  1 passed (1)      Tests  12 passed (12)

$ node --env-file=.env --import tsx scripts/test/f006-eval-probe.ts
[probe] stub gateway = http://127.0.0.1:56230/v1（真网关全程不可达）
✅ A1 默认 caller 真发出 gateway chat 请求（/chat/completions） — url=/v1/chat/completions count=1
✅ A2 模型路由 = REPORT_CHAT_MODEL — wire model=deepseek-v3 / expect=deepseek-v3
✅ A3 长文输出档 max tokens=4000 — wire=4000
✅ A4 system prompt 含诚实铁律（绝不编造 / 证据不足）
✅ A5 prompt 事实段 = spend 真源 + 口径 + 证据缺口 — spend命中=true
✅ A6 有凭据路径 degraded=false 且草案 = LLM 产物
✅ A7 WeeklyReport 落库：draftContent 非空 / adopted=false / projectId=null（跨项目 scope）
✅ G P10 双态：同周期 projectId=null 与非空各自独立行（scope 区分）
✅ D LLM 返回空草案 → 明示抛错且零落库 — rows 2→2
✅ C1 无凭据 → degraded=true + 首行明示降级 + 诚实边界
✅ C2 降级同时 console.warn 告警（不静默） — warns=1
✅ C3 降级路径零网关调用 — calls 3→3
✅ C4 降级固定草案仍基于库内真实 spend 事实
❌ I〔观察〕降级草案中项目名无 XML 实体外泄（→ S1，非 acceptance）
✅ E1 并发采纳：仅一路写入，adoptedAt 两路一致（原子条件 updateMany） — winners=1
✅ E2 串行重复采纳幂等：adoptedAt 未被改写
✅ F 跨租户采纳被拒且未改写他人报告
✅ H1 draft_report 直调 + 采纳全程零 PendingAction（internal，无闸门） — pendingAction=0
✅ H2 工具直调输出 adopted=false（只起草不采纳）
❌ J〔观察〕同周期并发起草不堆重复行 — rows=2（→ S2，非 acceptance）
[probe] 18/20 断言通过
[probe] 网关调用总数（全部指向本地 stub）= 8；真网关调用 = 0

$ AIGCGATEWAY_REPORT_MODEL=eval-big-long-doc-model node --env-file=.env --import tsx scripts/test/f006-eval-probe.ts
✅ A2 模型路由 = REPORT_CHAT_MODEL — wire model=eval-big-long-doc-model / expect=eval-big-long-doc-model

$ npx tsx scripts/test/f006-router-check.mts
insight 收窄工具子集 = ["compute_roi","draft_report","create_share_link"]
draft_report 在子集 = true
注册表命中 name/class/source/buildHarm = draft_report internal native undefined
toAiSdkTools 暴露键 = [ 'compute_roi', 'draft_report', 'create_share_link' ]

$ npx tsc --noEmit    # 唯一报错源 = 并行 evaluator 的 tests/unit/share-adapter.evaluator-probe.test.ts（F007/F008 面），
                      # 与 F006 产品代码及本探针无关；F006 相关文件零错
```

**零真实对外副作用核证：** 本次验收未发起任何真实网关调用、未发送邮件、未产生资金动作、未生成任何可公开访问链接；
所有写库操作均在自建隔离夹具租户内并已清理。
