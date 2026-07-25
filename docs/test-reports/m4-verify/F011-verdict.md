# M4-INSIGHT F011 验收裁定 — weekly-draft 例程（scheduler 注册表化）

- **批次：** M4-INSIGHT（status=verifying，fix_rounds=0）
- **Feature：** F011 `weekly-draft` 例程（scheduler 注册表化），executor=generator，priority=medium
- **验收者：** Andy/evaluator-subagent（隔离上下文，未继承实现叙述）
- **日期：** 2026-07-25
- **代码基线：** 实装 commit `6704c49`；验收时工作树 HEAD `b58207a`（committed 树 `tsc --noEmit` 干净 = 0 错，clean worktree 实测）
- **验收层级：** L1 本地（dev DB 真库 + 夹具租户）；**[L2] 真网关 chat 起草未执行 —— 未获用户授权**

## 结论：**PASS**（24/24 独立探针 + 4/4 generator 集成测 + 真库端到端跑通）

---

## 1. acceptance 逐条核对

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | weekly-draft 例程注册进 scheduler 注册表（沿 run-nightly-screen/run-health-scan 先例） | ✓ | `scheduler.ts:95-111` ROUTINES 第 4 项；`startScheduler()` 实跑注册 **4/4 cron task**（`f011-scheduler-check.ts` RESULT: PASS，重复调用仍 4 = 幂等）；`WEEKLY_DRAFT_CRON='0 4 * * 1'` 与 02:00/02:30/03:00 三例程零冲突；`run-weekly-draft.ts` 与 `run-nightly-screen.ts` 形状逐行同构（getDevTenantId → runExclusive → 同一执行体，非旁路） |
| 2 | `npm run routine:weekly-draft` 可跑 | ✓ | `package.json:39` 脚本在场；`AIGCGATEWAY_API_KEY= npm run routine:weekly-draft` → exit 0，输出 `✅ 周期 2026-W30 草案 cmrzb9j6r00019yrxo5lgcztf（无凭据降级固定草案）` |
| 3 | 执行 = 汇总跨项目度量 → draft_report 服务起草 → WeeklyReport(projectId=null, adopted=false) 落库 | ✓ | 真库跑：dev 4 个项目**全部**进草案（星轨协议/料理次元/暗域拓荒/萌宠农场）；夹具探针：payout 口径 `$1234.50（口径：已放款）` + quote 口径 `$777.00（口径：报价承诺额）` + 无源 `花费：无可核数额` 三分支同批穿透；落库行 `projectId=null / adopted=false / generatedBy=insight / period=2026-W30`；服务同源 = `draftWeeklyReport`（`routines/weekly-draft.ts:13,28`），与 `tools/draft-report.ts:11,44` 同一函数，例程内零 LLM 逻辑副本（grep 证） |
| 4 | 幂等/可重入（同周期重跑不重复建或明示覆盖策略） | ✓ | 未采纳覆盖：重跑 `reportId` 恒定、`count=1`、`createdAt` 未变而 `updatedAt` 前移（真覆盖写非新建）；已采纳冻结：`adoptWeeklyReport` 后重跑 → `skippedAdopted=true`、草案内容逐字节零改写、行数恒 1；`runExclusive` 互斥（上一轮未结束返回 null，generator 集成测第 3 例 + dev 库闭包跑 2→2 行不增） |
| 5 | 无网关凭据降级固定草案明示 | ✓ | `degraded=true` + 草案首行 `【降级草案】未配置 AI 网关凭据…（未经 LLM 起草）` + `console.warn` 明示；**零外呼硬证**：`globalThis.fetch` 熔断（调用即抛）下例程仍成功，fetch 调用总数 = 0；ROI 行恒 `证据不足（分子缺，不猜）`，无编造数字、无 0 冒充 |
| 6 | staging 端到端 dry-run（database-patterns §7）或 generator_handoff 明示 staging 无 fixture | ✓（N/A 分支，见 §3 观察 1） | 本项目**无 staging 环境**（`.auto-memory/environment.md` 只有 prod `newkol.guangai.ai` + 本地 dev DB；M1-C / M3-A signoff 同记「本项目无 staging」）→ §7 第一分支前提不成立。§7 实质风险（mock 单测过 ≠ 真数据跑通）由验收方**直接实跑**消解：真 dev 库（4 个真实 seed 项目 + 既有 1 行 WeeklyReport）端到端 exit 0 + 夹具三分支穿透 |

## 2. 证据清单（命令 + 关键输出）

```bash
# 前置：确认 shell 环境覆盖 --env-file（保证清凭据真生效，L2 零外呼）
AIGCGATEWAY_API_KEY=SENTINEL_EMPTY node --env-file=.env -e "…"
→ shell_wins= true  len= 14        # shell 值胜出，--env-file 不覆盖 → 清凭据可靠

# generator 集成测
npx vitest run tests/integration/weekly-draft-routine.test.ts
→ Test Files 1 passed | Tests 4 passed

# 真库端到端（清凭据，零外呼）
AIGCGATEWAY_API_KEY= npm run routine:weekly-draft
→ [insight/weekly-report] AIGCGATEWAY_* 未配置——降级固定草案（明示，不静默）
→ [routine:weekly-draft] ✅ 周期 2026-W30 草案 cmrzb9j6r00019yrxo5lgcztf（无凭据降级固定草案）
→ 库内核验：total rows=1，createdAt 19:06:09（未变）→ updatedAt 03:47:37（前移）= 覆盖非堆叠
→ 草案含 4 个真实项目 × 3 缺口行/项目（花费无可核真源 / reach 无回传源 / conversions 无回传源）

# Evaluator 独立探针（24 断言，夹具租户自建自清）
AIGCGATEWAY_API_KEY= node --env-file=.env --import tsx scripts/test/f011-eval-probe.ts
→ [结果] PASS 24 / FAIL 0
   含：fetch 熔断零外呼 / payout·quote·none 三口径穿透 / 已采纳冻结 / 覆盖非堆叠 /
       PendingAction=0 + ShareLink=0（internal-only 无 outbound 直通）/ 注册表闭包真跑

# cron 注册链路
node --env-file=.env --import tsx scripts/test/f011-scheduler-check.ts
→ registered cron tasks = 4 / ROUTINES = 4；after 2nd startScheduler = 4；RESULT: PASS

# 静态门
npx eslint src/lib/jobs/scheduler.ts src/lib/jobs/routines/weekly-draft.ts \
  scripts/jobs/run-weekly-draft.ts tests/integration/weekly-draft-routine.test.ts   → 零输出（干净）
git worktree add /tmp/f011-head-check HEAD && npx tsc --noEmit                       → exit 0（committed 树干净）
```

## 3. 观察项（不改判 PASS，供 Planner/Lead 处置）

1. **`progress.json.generator_handoff` = null** —— acceptance 第 6 项的「或」分支（明示 staging 无 fixture）字面未落盘。本项目根本无 staging 环境（environment.md 佐证），且实质覆盖已由验收方真库实跑更强满足，故不判罚；建议 done 阶段由 Planner 在 signoff 中一次性记「本项目无 staging，§7 以 dev 真库端到端替代」的通用口径，免除后续每批次重复争议。
2. **[L2] 真网关 chat 起草分支未执行**（未获授权）：例程走 `defaultLlmCaller`（不经注入缝），prod `.env` 有 `AIGCGATEWAY_API_KEY` → 上线后周一 04:00 首跑即走真 LLM 路径。该路径本地仅经代码审阅（`chatModel(REPORT_CHAT_MODEL)` + `AbortSignal.timeout(30s)` + 空草案抛错不落空行，实现无异常），未经真调用实测。**建议**：上线后手动 `npm run routine:weekly-draft`（带凭据）做一次 L2 观测，或验收阶段获授权跑 `INSIGHT_E2E_REAL_LLM=1`。
3. **`WeeklyReport` 无 `@@unique([tenantId, projectId, period])`** —— 覆盖策略靠「先 findFirst 再 update」两步 + 进程内 `runExclusive` 互斥保障。单实例部署（ADR-20 明示）下成立；若未来多实例并发，理论上可竞态出双行。本批不判罚（acceptance 只要求「不重复建或明示覆盖策略」，覆盖策略已在 `weekly-report.ts:13-14` 明示），建议记入 M5 多实例前置。
4. **旁证（非 F011 范围）**：工作树有两个**同僚 evaluator 未提交探针**触发 8 个 `tsc` 错（`tests/integration/eval-m4-f005-delegation.test.ts` 6 个 TS7018、`tests/unit/share-adapter.evaluator-probe.test.ts` 2 个 TS7005/TS2749）。committed 树 tsc 干净，与 F011 无关；请对应验收者在提交前修掉，否则会把 CI 带红。

## 4. 本次新增测试产物（无产品代码改动）

- `scripts/test/f011-eval-probe.ts` —— F011 独立探针 24 断言（夹具自清 + fetch 熔断零外呼）
- `scripts/test/f011-scheduler-check.ts` —— cron 注册链路探针（只读，注册后即 destroy）
- `docs/test-reports/m4-verify/F011-verdict.md` —— 本文件

产品代码 / `progress.json` / `features.json` 零改动（`git status` 可证）。

---

## 5. 结构化 verdict（原样，供编排者直接采信 / 落 progress.json）

```
feature_id: F011
result: PASS

acceptance_checklist:
  1. weekly-draft 注册进 scheduler 注册表（沿 nightly-screen/health-scan 先例）
     → ✓  scheduler.ts:95-111 ROUTINES 第 4 项；startScheduler() 实跑注册 4/4 cron task（f011-scheduler-check RESULT: PASS，二次调用仍 4 = 幂等）；cron '0 4 * * 1' 与 02:00/02:30/03:00 三例程零冲突；run-weekly-draft.ts 与 run-nightly-screen.ts 逐行同构（getDevTenantId → runExclusive → 同一执行体，非旁路）
  2. npm run routine:weekly-draft 可跑
     → ✓  package.json:39 在场；AIGCGATEWAY_API_KEY= npm run routine:weekly-draft 退出码 0，输出「✅ 周期 2026-W30 草案 cmrzb9j6r…（无凭据降级固定草案）」
  3. 执行 = 汇总跨项目度量 → draft_report 服务起草 → WeeklyReport(projectId=null, adopted=false) 落库
     → ✓  真 dev 库 4 个项目全部进草案；夹具探针三口径同批穿透（payout $1234.50「已放款」/ quote $777.00「报价承诺额」/ 无源「无可核数额」）；落库行 projectId=null·adopted=false·generatedBy=insight·period=2026-W30；起草服务同源 draftWeeklyReport（routines/weekly-draft.ts:13,28 与 tools/draft-report.ts:11,44 同一函数，例程内零 LLM 逻辑副本，grep 证）
  4. 幂等/可重入（同周期重跑不重复建或明示覆盖策略）
     → ✓  未采纳覆盖：reportId 恒定 + count=1 + createdAt 未变而 updatedAt 前移（真覆盖非堆叠）；已采纳冻结：adopt 后重跑 skippedAdopted=true、草案零改写、行数恒 1；runExclusive 互斥返回 null 复现
  5. 无网关凭据降级固定草案明示
     → ✓  degraded=true + 首行「【降级草案】…（未经 LLM 起草）」+ console.warn；零外呼硬证 = globalThis.fetch 熔断下例程仍成功、fetch 调用数 0；ROI 恒「证据不足（分子缺，不猜）」无编造无 0 冒充
  6. staging 端到端 dry-run（database-patterns §7）或 generator_handoff 明示 staging 无 fixture
     → ✓（N/A 分支）  本项目无 staging 环境（environment.md 仅 prod + 本地 dev DB；M1-C/M3-A signoff 同记）→ §7 第一分支前提不成立；§7 实质风险由验收方直接实跑消解（真 dev 库端到端 exit 0 + 夹具三分支穿透）。generator_handoff 字面为 null，见观察 1

evidence:
  - AIGCGATEWAY_API_KEY=SENTINEL_EMPTY node --env-file=.env -e … → shell_wins=true len=14（证清凭据真生效，L2 零外呼前置）
  - npx vitest run tests/integration/weekly-draft-routine.test.ts → Test Files 1 passed | Tests 4 passed
  - AIGCGATEWAY_API_KEY= npm run routine:weekly-draft → 「AIGCGATEWAY_* 未配置——降级固定草案（明示，不静默）」+「✅ 周期 2026-W30 草案 cmrzb9j6r00019yrxo5lgcztf」；库核验 total rows=1、createdAt 19:06:09 未变 / updatedAt 03:47:37 前移
  - AIGCGATEWAY_API_KEY= node --env-file=.env --import tsx scripts/test/f011-eval-probe.ts → [结果] PASS 24 / FAIL 0（含 fetch 熔断零外呼、三口径穿透、已采纳冻结、PendingAction=0 + ShareLink=0 internal-only、注册表闭包真跑）
  - node --env-file=.env --import tsx scripts/test/f011-scheduler-check.ts → registered cron tasks = 4 / ROUTINES = 4；after 2nd = 4；RESULT: PASS
  - npx eslint（4 个 F011 文件）→ 零输出；git worktree add HEAD + npx tsc --noEmit → exit 0（committed 树干净）
  - 实装 commit 6704c49；CI：f6a631b CI success、b58207a Build & Push success

observations（不改判 PASS）:
  1. progress.json.generator_handoff = null —— acceptance 第 6 项「或」分支字面未落盘；因项目无 staging 且实质覆盖更强，不判罚。建议 done 阶段在 signoff 记通用口径「本项目无 staging，§7 以 dev 真库端到端替代」
  2. [L2] 真网关 chat 起草未执行（未授权）。例程走 defaultLlmCaller 不经注入缝，prod .env 有 AIGCGATEWAY_API_KEY → 上线后周一 04:00 首跑即真 LLM 路径；该路径仅经代码审阅（chatModel + AbortSignal.timeout(30s) + 空草案抛错不落空行）。建议上线后带凭据手跑一次做 L2 观测
  3. WeeklyReport 无 @@unique([tenantId, projectId, period])：覆盖策略靠 findFirst→update 两步 + 进程内 runExclusive，单实例（ADR-20）成立；多实例理论可竞态双行，建议记 M5 前置
  4. 旁证（非 F011）：工作树两个同僚 evaluator 未提交探针触发 8 个 tsc 错 —— tests/integration/eval-m4-f005-delegation.test.ts（6× TS7018）、tests/unit/share-adapter.evaluator-probe.test.ts（TS7005 + TS2749）。committed 树 tsc 干净，但这两个文件若原样提交会把 CI 带红，请对应验收者提交前修掉

artifacts:
  - scripts/test/f011-eval-probe.ts（24 断言独立探针，夹具自清 + fetch 熔断）
  - scripts/test/f011-scheduler-check.ts（cron 注册链路探针，只读）
  - docs/test-reports/m4-verify/F011-verdict.md（完整裁定报告）
  - 产品代码 / progress.json / features.json 零改动（git status 证）
```

---

**署名：** Andy/evaluator-subagent（隔离上下文验收，2026-07-25）
