# M4-INSIGHT F012 二轮复验 verdict（fix_rounds=2 → reverifying）

- **feature**：F012 `insight:e2e` 闭环 + 文档翻牌 + 批末新鲜度复核
- **复验者**：Andy/evaluator-subagent（隔离上下文；自行从磁盘 + git 取证，**未采信 fixing commit message 与任何实现叙述**）
- **日期**：2026-07-25
- **复验基线**：上轮复验落盘 `cdfca59` → 状态 `0ae9e17`(round1) → **修复 commit `300b5c1`**（fixing round2）→ 状态 commit `48e6fa6`（= HEAD，工作树干净）
- **被验对象**：`docs/dev/architecture.md` §8.10（修复实物）· `tests/unit/architecture-doc-freshness.test.ts`（新增例程行级断言）· 实物真相源 `src/lib/jobs/scheduler.ts` / `src/lib/jobs/routines/weekly-draft.ts` / `src/lib/insight/weekly-report.ts` / `src/lib/agent/tools/draft-report.ts` / `package.json`

## 结论：**PASS**

issue-5（§8.10 例程节）**已真实闭合**，修复内容逐条对实物核实属实、无过度声明、无新增矛盾；修复零越界（只碰 architecture.md 6 行 + 测试文件）；新增例程断言经**三道反向探针**证明为载荷断言（非恒真）；全批新鲜度终扫**零阻断残留**；L1 四件套全绿（tsc / lint / test:unit 994 / 五条 L1 闭环套件）。

> **F012 至此 acceptance 19 细项全 PASS**（首轮 15 PASS + 4 FAIL 已于 round1 CLOSED + round2 残留 issue-5 CLOSED）。批次 **12/12 PASS，零遗留 FAIL** → 本轮签发批次 signoff `docs/test-reports/M4-INSIGHT-signoff-2026-07-25.md`。

---

## 0. 环境与 L1/L2 边界

| 项 | 值 |
|---|---|
| dev DB | `newkolmatrix-dev-db` Up 4 days (healthy)；`prisma/migrations/` 实测 **9 条** |
| prisma client | 复验前 `npx prisma generate` 重生（exit 0，`testing-env-patterns` §3 防误报） |
| Node | v25.7.0 |
| **L2** | **本轮零 L2 执行**。`INSIGHT_E2E_REAL_LLM` 全程未设（`env \| grep` 实证 shell 内无 `AIGCGATEWAY_*` 与该开关）；`insight:e2e` 日志明示 `[insight/weekly-report] AIGCGATEWAY_* 未配置——降级固定草案（明示，不静默）` → **零外呼、零 token、零计费** |
| **L2 纪律（上轮教训已落地）** | 上轮曾误跑 M3-A 的 `reach:e2e`（L2 真网关）。本轮**在执行任何套件之前先逐个读脚本文件头 + grep 网关调用面**（`AIGCGATEWAY\|generateText\|streamText`），确认 `agent:smoke` / `orch:smoke` / `gate:smoke` / `delivery:e2e` / `insight:e2e` 五条均为 L1 后才跑；**`reach:e2e` 本轮明确不跑**（编排指令与 L2 未授权双重约束）。dev 库 `OutreachMessage(direction=sent)=0` 反证本轮零真实投递 |
| 零真实公开暴露 | 复跑后库终态 **`ShareLink=0` / `PendingAction(create_share_link)=0` / `MetricSnapshot=0` / `WeeklyReport=1`（M4 前既有）/ `WeeklyReport(adopted)=0`** —— 夹具自清理，本机零真实分享暴露 |
| 本次复验改动 | 产品代码 / 文档基线 / `progress.json` / `features.json` **零改动**；新增仅 2 件 evaluator 产物：本报告 + 批次 signoff。断言强度探针走**临时 git worktree**（`/tmp/f012r2-broken`，已 `git worktree remove --force` + `prune` 清理，主工作树 `git status` 干净） |

---

## 1. issue-5 是否真实闭合（对实物核，不看 commit message）

### 1.1 §8.10 标题（L1081）

| 面 | 内容 |
|---|---|
| 修复前 | `…nightly-screen 已实装，**其余 3 条随 M3-M4 表落地**` |
| 修复后 | `…**已实装 4 条 = health-scan / nightly-screen / kol-sync / weekly-draft（✅ M4 F011）**，其余 2 条（signal-sync / delivery-watch）随后续批次落地` |
| 实物 | `src/lib/jobs/scheduler.ts` `ROUTINES` 数组实测 **恰好 4 条**，逐名 = `health-scan`(L49) / `nightly-screen`(L61) / `kol-sync`(L74) / `weekly-draft`(L95)；§8.10 例程表共 6 行，未实装 = `signal-sync` + `delivery-watch` = **2 条** |
| 判定 | ✅ **计数与逐名均与实物一致**（4 已实装 / 2 未实装），首轮的「3 条」计数错误消除 |

### 1.2 weekly-draft 行（L1101）as-built 注 —— **逐子句回实物核对（防「补了但写错」）**

| 文档子句 | 实物核对 | 结论 |
|---|---|---|
| `cron 0 4 * * 1` 周一与夜间例程错峰 | `WEEKLY_DRAFT_CRON = '0 4 * * 1'`（scheduler.ts:34）；其余三例程 `0 2` / `30 2` / `0 3` → 确为错峰 | ✅ 属实 |
| 执行体 = `draftWeeklyReport` 服务，与 `draft_report` 工具**同源非旁路** | `routines/weekly-draft.ts` → `import { draftWeeklyReport } from 'lib/insight/weekly-report'`；`tools/draft-report.ts` `execute` → 同一 `draftWeeklyReport` | ✅ 属实（两侧同一函数，无第二套起草实现） |
| `WeeklyReport(projectId=null, adopted=false)` 落库 | `runWeeklyDraft` 调 `draftWeeklyReport({ projectId: null }, …)`；服务层 `create` 写 `adopted: false`（weekly-report.ts:294） | ✅ 属实 |
| 同周期重跑覆盖不堆重复 | weekly-report.ts:283-288 —— 同 `(tenantId, projectId, period)` 已有未采纳草案 → `update` 覆盖，否则 `create` | ✅ 属实 |
| 已采纳冻结跳过 | weekly-report.ts:239-247 —— `existing?.adopted` → 早返回不重起草（`skippedAdopted`） | ✅ 属实 |
| 无凭据降级固定草案明示 | weekly-report.ts:255-261 `degraded = true` + `fixedFallbackDraft`；本轮 e2e 日志实证明示行 | ✅ 属实 |
| `npm run routine:weekly-draft` 手动触发口 | `package.json:39` 在场 | ✅ 属实 |

### 1.3 与 §14 的自我矛盾是否消除

- §14 M4 行（L1779）：`+ weekly-draft 例程 … ✅ **已交付**（2026-07-24，M4-INSIGHT 批次）`
- §8.10 标题 + 表行现同为「✅ 已实装（M4 F011）」→ **两节口径一致，矛盾消除**
- 交叉终扫（§3.1）：`weekly-draft` 在 architecture.md 全文**无任何**「未实装 / 演进目标 / 待实装 / 随 M*」类标记

### 1.4 顺手改动核实：health-scan 行（是否属实、是否夹带）

commit 自述「health-scan 表行统一 ✅ 已实装标记（原措辞缺标——被新断言当场抓出）」。**独立核实两点**：

1. **该自述属实**：把 HEAD 的新测试文件放进 `0ae9e17`（修复前）状态的 worktree 实跑，失败信息首条正是
   `AssertionError: 例程 health-scan 已注册但表行未标「已实装」: expected '| \`health-scan\` | 每小时 | strategy | 重算…'` —— 断言确实当场抓出该行（原文只有「as-built 注（M1-C S7 校准）：实装频率…」，无「已实装」三字）。
2. **改后内容属实**：新注称 `M1-C F004；S7 校准：实装频率 = 每夜 0 2 * * * 非每小时` → `HEALTH_SCAN_CRON = '0 2 * * *'`（scheduler.ts:25）+ 该例程由 M1-C F004 建立（文件头注释）→ **如实，且原 S7 校准语义未被删改（只是补上标记）**，非夹带式改写。

---

## 2. 修复无越界 + 新增断言是否真的钉住实物

### 2.1 改动面（越界检查）

```
git show --stat 300b5c1  →  docs/dev/architecture.md (6 ±) ; tests/unit/architecture-doc-freshness.test.ts (43 ±)
git diff --name-only 9878e50..HEAD | grep -E '^(src/|prisma/|sdk/|package|next.config|tailwind|tsconfig|docker|\.github)'  →  零命中
```

→ round2 只触碰 §8.10（3 处 hunk：标题 + health-scan 行 + weekly-draft 行）与该测试文件；**两轮 fixing 合计对产品代码 / 配置 / 迁移零改动**。测试文件其余 diff 经逐段核对为 prettier 换行重排（`docCount` / A5 / A6 / A7 三处），**无断言语义变更**。**未越界。**

### 2.2 新增例程断言的载荷强度（audit-methodology §5，三道反向探针）

新断言实跑全绿——但「全绿」不自动构成证据。把系统置回「本应判红」的状态，用**同一份 HEAD 测试文件**实跑（临时 worktree，非重写逻辑的模拟探针，保真度高于上轮的 mjs 同构探针）：

| 探针 | 置入的缺陷态 | 实测 | 判定 |
|---|---|---|---|
| P1 | `0ae9e17` 原始文档（issue-5 缺陷态） | **FAIL** —— `例程 health-scan 已注册但表行未标「已实装」` | ✅ 断言在缺陷态判红 |
| P2 | 同上，但**单独把 health-scan 行修好**（隔离出 issue-5 的核心面） | **FAIL** —— `例程 weekly-draft 已注册但表行未标「已实装」` | ✅ **直接钉住 issue-5 本体**（不是只碰巧抓到 health-scan） |
| P3（活性/前瞻） | HEAD 文档 + 在 `ROUTINES` 注入一条虚构例程 `probe-future-routine`（文档无对应行） | **FAIL** —— `§8.10 例程表缺 probe-future-routine 行: expected undefined to be truthy` | ✅ 未来新例程注册而文档不翻 → CI 当场红（锚点缺失不会静默跳过） |

→ 新断言**双向有效**（行存在但未标 / 行根本不存在），**不是恒真**。这一类漂移自此进入 CI 机制化防线（复验建议被如实采纳）。

### 2.3 上轮 4 项修复在 HEAD 未回退（回归复核）

重跑上轮探针 `scripts/test/f012-reverify-freshness-probe.mjs`（只读）：

```
实物基线：model=24 enum=17 migrations=9 tools=18 insightTools=[compute_roi, draft_report, create_share_link]
载荷断言 7 / 缺陷态恒真 1（A6）/ HEAD 仍红 0（共 8）
```

→ issue-1/2/3/4 对应的 A1-A5 / A7 / A8 在 HEAD 全 PASS，**round2 的文档改动未碰坏上轮修复**。

---

## 3. 全批新鲜度终扫

### 3.1 本批交付物的反向漂移扫描（acceptance 判据面，决定性）

对 M4 全部交付物名逐个扫 architecture.md 中的「未实装 / 演进目标 / 待实装 / 尚未 / 随 M*」类标记：

```
MetricSnapshot · WeeklyReport · ShareLink · roi.compute · attribution.gaps ·
compute_roi · draft_report · create_share_link · weekly-draft   →  9/9 无陈旧标记
```

→ **role-context「已实装却仍标未实装」判据面：零命中，零阻断。**

### 3.2 上轮报告未闭口项逐一核对现状

| 上轮项 | 现状（本轮实测） | 处置 |
|---|---|---|
| **issue-5**（阻断） | ✅ **CLOSED**（§1 逐子句核实） | 关闭 |
| O5：A6 断言（工具名全文在场）对 issue-1 类缺陷恒真 | 未变更（round2 只重排格式）；本轮探针复现「缺陷态即为真」 | 保留 soft-watch，建议下批收窄为表区间作用域 |
| O6：顶层图/目录树「演进 M1」历史标签（L244/L251/L366/L371） | 仍在（`grep` 命中 4 处） | 保留 soft-watch（跨批历史债，非 M4 造成；acceptance 点名的是「演进 **M4**」，本轮不判阻断——与上轮同尺度） |
| O7：§5.5 事件词表 `report.adopted` / `share.created` 无 ✅ 标 | 仍无（同表 M3-B 三项同状态，词表自标「示意」） | 保留 soft-watch（既有惯例，M3-B 签收时同状态） |
| O8：round1 commit 自述「清零」过宽 | **未复发**——round2 commit message 三条自述（§8.10 标题 / weekly-draft 行 / health-scan 被断言抓出 / 994 测绿 / tsc+lint 0 错）**逐条独立复现属实**（§1.4、§2.2、§4） | 关闭观察 |
| O9：网关 `deepseek-v3` 通道对上游失效（high，部署面） | **本轮未复测**（L2 未授权，`reach:e2e` 明确不跑）——状态按上轮记录原样结转 | **转人类处置**（见 signoff soft-watch） |
| O2：`insight:e2e` 每跑一次 `OperationLog` +1 | 本轮又跑一次 e2e（终态 `OperationLog=104`），本机 `today` 视觉基线漂移再加深一格；CI 侧不受影响 | 保留 soft-watch |

### 3.3 本轮新发现（**均不阻断**，判据与理由如实登记）

| # | 内容 | 为什么不阻断 |
|---|---|---|
| O10 | §1 概览句（L36）`例程调度器已落 M1-C：node-cron + health-scan 首条例程；**其余例程随 M2-M4 表落地**` —— M4 收口后，剩余 2 条（signal-sync/delivery-watch）实际落在 M2-M4 窗口之外，措辞已不精确 | 它**没有把任何已实装例程标为未实装**（nightly-screen/kol-sync/weekly-draft 确实"随 M2-M4 表落地"了），不触碰 role-context 判据；且与 O6 同属「概览层历史措辞债」，上轮已按非阻断处置——本轮若改判即对同一族两套尺子。建议并入下批文档卫生 feature |
| O11 | §12.6 测试矩阵称 `tests/unit/` 断言「outbound 集合 = **`OUTBOUND_TOOL_NAMES`** 六工具名白名单恰好相等，多一少一都红」——**该常量与该测试全仓零命中**（`grep -r OUTBOUND_TOOL_NAMES src tests` = 0；实物 outbound 判定靠各工具 `class: 'outbound'`，实测 5 件） | 方向与 acceptance 判据相反（是「标已实装而实际未实装」的前瞻式描述债），且**早于本批**：`M2C-agent-honesty-signoff-2026-07-23.md` L86 已记录「`OUTBOUND_TOOL_NAMES` 全仓零命中 ✓」，§8.6.1 亦已把配套的承诺-兑现断言标为「演进目标（未实装）」。非 M4 造成、非 M4 acceptance 面。**顺带更正**：上轮本人报告 §1 issue-2 与首轮 verdict 第 18 项曾以「与 `OUTBOUND_TOOL_NAMES` 一致」表述——该常量不存在，**表述有误**；但其实质结论（insight 行 ⛔ 标在 outbound 那件 / §9.2「6 中 5 已实装」）经本轮独立复核**仍然成立**（class:'outbound' 实测 5 件 = send_outreach/commit_quote/payout/distribute_keys/create_share_link），结论不受影响 |
| O12 | §8.10 新标题里的计数「已实装 4 条」**无断言覆盖**（新断言只作用于表行）。若将来注册第 5 条例程并补了行标记，标题计数会静默陈旧 | 当前计数属实（=4）。属回归网可增强项，非缺陷。建议下批把标题计数纳入断言（仿 A1/A5 的 `docCount` 写法） |

> **acceptance 子句「outbound 白名单第 6 工具兑现」独立复核**：§9.2 L917 权威句「**目标态 outbound 六工具白名单 = 6 中 5 已实装**」+ 逐条 ✅ 标注，与实物（5 件 `class:'outbound'`）一致；「第 6」按 v1.0 定稿的白名单规范顺序（`send_outreach`/`send_bulk_outreach`/`commit_quote`/`payout`/`distribute_keys`/`create_share_link`，见 `docs/archive/architecture_f5-v1.0-draft.md:2682`）成立。**该子句 PASS。**

---

## 4. L1 自跑 + 重跑判定

| 动作 | 结果 |
|---|---|
| `npx prisma generate` | exit 0 |
| `npm run lint` | exit 0 —— `✔ No ESLint warnings or errors` |
| `npx tsc --noEmit` | exit 0 |
| `npm run test:unit` | exit 0 —— **82 文件 / 994 测全通过**（上轮 82/993；**差值 +1 = 新增例程行级断言**，增量可解释，无静默减测） |
| `npm run agent:smoke` | exit 0 ✅ |
| `npm run orch:smoke` | exit 0 ✅ |
| `npm run gate:smoke` | exit 0 ✅（两步票据 7 态 + 并发竞态 + D20 变异） |
| `npm run delivery:e2e` | exit 0 ✅ |
| `npm run insight:e2e` | exit 0 ✅ **22/22**（降级明示、零外呼；`⑤ 副作用零发生` / `⑥ DB 只存 tokenHash` / `⑦ publicUrl=null` / `⑦ mocked=true` 均在场） |
| `npm run reach:e2e` | **未跑（L2 未授权，编排明确禁止）** —— 上轮失败根因（外部网关上游模型下线）按 O9 结转人类处置 |
| CI（linux 权威门）@ 修复 commit `300b5c1` | run 30150329097 **5/5 success**：Lint · Typecheck · Unit + integration tests · Build · **Visual regression**；Build & Push image 亦 success。HEAD `48e6fa6` 为状态机-only commit（paths-ignore，未触发 CI，符合预期） |

**`test:visual` 本地未重跑 —— 判定理由**（audit-methodology §5 的对偶：**未换形态、未触碰被测面则不需重估**）：

1. `git diff --name-only 9878e50..HEAD` 证明两轮 fixing **零产品代码 / 零 UI / 零样式改动**，视觉基线被测面字节级未变；
2. **CI linux 权威视觉 job 在本轮修复 commit `300b5c1` 上 success**（新 run，非引用旧 run）；
3. 本地 darwin 两例已知漂移（today 相对时间 + 长寿命库 env=match 真数据）与本批无关，首轮已实证登记，且本轮 e2e 复跑按 O2 又加深一格。

→ 三条独立成立，重跑只会复现同一结论。

**其余 11 feature 的首轮 PASS 是否仍成立**：两轮 fixing 对 `src/` / `prisma/` / 配置**零改动**（§2.1 实证），产品行为面未变；另五条 L1 闭环套件本轮全绿，**无交叉破坏**。→ 11 PASS 结论继续成立。

---

## 5. 复验结论

**F012 = PASS（第 2 轮复验）。**

- issue-5 **CLOSED**：§8.10 标题计数（4 已实装 / 2 未实装）与 weekly-draft 行 as-built 注**逐子句对实物属实**，与 §14 的自我矛盾消除；顺手修的 health-scan 行经独立复现证明「被新断言抓出」属实且内容如实；
- 修复**零越界**（只碰 §8.10 六行 + 测试文件），两轮 fixing 合计**零产品代码改动**；
- 新增例程断言经**三道反向探针**（缺陷态判红 / 隔离出 weekly-draft 本体判红 / 未来例程无行判红）证明为**载荷断言**，机制化防复发到位；
- **全批新鲜度终扫零阻断残留**（M4 九个交付物名 9/9 无陈旧标记）；上轮未闭口项逐一核对，无一升级为阻断；本轮新发现 3 条（O10/O11/O12）按与上轮**同一尺度**判为非阻断并如实登记理由；
- L1 全绿（lint / tsc / 994 测 / 五条 L1 闭环套件），CI 权威门 5/5 绿 @ `300b5c1`；L2 本轮零执行、零外呼、零计费，**`reach:e2e` 明确未跑**。

**批次终局：12/12 PASS，零遗留 FAIL。** → 签发 `docs/test-reports/M4-INSIGHT-signoff-2026-07-25.md`（本轮已写盘）。

---

## 6. evaluator_feedback（供编排者**原样**写入 progress.json，不得改写）

```json
{
  "round": 3,
  "reverify_round": 2,
  "fix_rounds": 2,
  "date": "2026-07-25",
  "reverify_result": "PASS（F012）——批次 12/12 PASS，零遗留 FAIL",
  "summary": "二轮复验 PASS。issue-5（§8.10 例程节）真实闭合：标题计数「已实装 4 条 = health-scan/nightly-screen/kol-sync/weekly-draft，其余 2 条」与 ROUTINES 实物逐名一致；weekly-draft 行 as-built 注 7 个子句（cron 0 4 * * 1 / 与 draft_report 同源非旁路 / projectId=null+adopted=false 落库 / 同周期覆盖 / 已采纳冻结 / 降级明示 / 手动触发口）逐条回源码核实属实；与 §14「已交付」矛盾消除。修复零越界（只碰 §8.10 六行 + 测试文件；两轮 fixing 合计零产品代码改动）。新增例程行级断言经三道反向探针证明为载荷断言（缺陷态判红 / 隔离 weekly-draft 本体判红 / 未来例程无行判红），机制化防复发到位。全批新鲜度终扫：M4 九个交付物名 9/9 无陈旧标记，零阻断残留。L1 全绿（lint/tsc exit 0；test:unit 82 文件 994 测，+1 = 新断言；agent/orch/gate smoke + delivery:e2e + insight:e2e 22/22 五条闭环套件全绿）；CI 权威门 5/5 success @ 300b5c1（含 Visual regression）。完整证据见 docs/test-reports/m4-verify/F012-reverify2.md",
  "results": {
    "F001": "PASS", "F002": "PASS", "F003": "PASS", "F004": "PASS",
    "F005": "PASS", "F006": "PASS", "F007": "PASS", "F008": "PASS",
    "F009": "PASS", "F010": "PASS", "F011": "PASS", "F012": "PASS"
  },
  "F012_issues_closed": [
    "issue-1 CLOSED（round1）：§9.2 工具表补三行 + 表头 7→18 = NATIVE_TOOLS 实测 18",
    "issue-2 CLOSED（round1）：§8.6 insight 行 tools = registry 三件逐名对齐",
    "issue-3 CLOSED（round1）：§7.2.1 迁移 9 / 枚举 17 / 模型 24 = 实物；ShareLinkScope + 三模型行在场且约束描述与 schema 一致",
    "issue-4 CLOSED（round1）：L254 / L372 / §5.4 标题 / §6.7 存续范围四处全翻；grep「演进 M4|归 M4」= 0",
    "issue-5 CLOSED（round2）：§8.10 标题计数翻牌（4 已实装 / 2 未实装，= ROUTINES 实物）+ weekly-draft 行 as-built 注（7 子句逐条属实）+ health-scan 行补标；例程行级回归断言进 CI（三道反向探针证明载荷有效）"
  ],
  "F012_issues_open": [],
  "non_blocking": [
    "O5：新鲜度测试 A6（工具名全文在场）对 issue-1 类缺陷恒真，建议收窄为表区间作用域（round2 未变更）",
    "O6：顶层架构图/目录树历史「演进 M1」标签仍陈旧（L244/L251/L366/L371），跨多批历史债非 M4 造成",
    "O7：§5.5 事件词表 report.adopted / share.created 无 ✅ 标（M3-B 三项同状态，词表自标「示意」）",
    "O8：已关闭——round2 commit message 三条自述逐条独立复现属实，未复发 round1 的自述过宽",
    "O9（high，部署面，非本批缺陷，须人类处置）：网关 deepseek-v3 通道对上游失效（上游 DeepSeek 下线 deepseek-chat 改 v4-pro/v4-flash），影响所有真网关 chat 路径（M3-A draft_email/refine_email、M4 draft_report/weekly-draft、agent loop）；prod 已配 API_KEY 故受影响；weekly-report.ts:259 的 degraded 兜底只覆盖「凭据缺失」，网关报错直抛无 try/catch → prod weekly-draft 例程会硬失败而非降级。本轮未复测（L2 未授权，reach:e2e 明确未跑），按上轮记录原样结转",
    "O10（新，low）：§1 概览句 L36「其余例程随 M2-M4 表落地」在 M4 收口后措辞不精确（剩余 2 条实际落在窗口之外）；未把任何已实装例程标为未实装，不触碰 role-context 判据，与 O6 同族并入下批文档卫生",
    "O11（新，low）：§12.6 测试矩阵称 tests/unit 断言「outbound 集合 = OUTBOUND_TOOL_NAMES 六工具名白名单恰好相等」——该常量与该测试全仓零命中（实物靠各工具 class:'outbound'，实测 5 件）；早于本批且 M2C signoff 已记录，非 M4 面。顺带更正：上轮报告与首轮 verdict 曾表述「与 OUTBOUND_TOOL_NAMES 一致」有误，但其实质结论（§9.2「6 中 5 已实装」）经独立复核仍成立",
    "O12（新，low）：§8.10 标题计数「已实装 4 条」无断言覆盖（新断言只作用于表行），将来注册第 5 条例程时标题会静默陈旧；建议纳入 docCount 式断言",
    "O2：每跑一次 insight:e2e，dev 租户 OperationLog 净增 1 行（append-only，本轮终态 104），持续加深本机 today 视觉基线漂移；CI 侧不受影响"
  ],
  "cross_batch_check": {
    "verdict": "无交叉破坏（两轮 fixing 对 src/ prisma/ 配置零改动，结构性排除 + 五条 L1 闭环套件实跑全绿）",
    "agent:smoke": "exit 0 ✅",
    "orch:smoke": "exit 0 ✅",
    "gate:smoke": "exit 0 ✅",
    "delivery:e2e": "exit 0 ✅",
    "insight:e2e": "exit 0 ✅ 22/22",
    "reach:e2e": "未执行（L2 未授权 + 编排明确禁止；上轮误跑已披露，本轮先读脚本文件头再执行的纪律已落地）"
  },
  "l2_disclosure": "本轮零 L2 执行：INSIGHT_E2E_REAL_LLM 未设、shell 无 AIGCGATEWAY_* env、insight:e2e 走降级固定草案（日志明示），零外呼零 token 零计费；执行任何套件前先读文件头 + grep 网关调用面确认 L1 属性；reach:e2e 未跑。上轮误跑 reach:e2e 的 1 次未授权真网关调用（400 模型名校验拒绝、零 token 零计费、邮件恒 mock 步骤①中止零投递、夹具自清理）已在 signoff §L2 实测记录中如实转录留档；dev 库 OutreachMessage(direction=sent)=0 反证零真实投递",
  "verification_run": {
    "lint": "exit 0",
    "tsc": "exit 0",
    "test:unit": "exit 0 — 82 文件 / 994 测（上轮 993，+1 = 例程行级断言）",
    "insight:e2e": "exit 0 — 22/22（降级固定草案，零外呼）",
    "test:visual": "本地未重跑（理由：两轮 fixing 零产品/UI 改动 + CI linux 权威视觉 job 在 300b5c1 上 success，run 30150329097 5/5）",
    "assertion_strength_probe": "三道反向探针（临时 worktree 跑 HEAD 测试文件）：缺陷态 FAIL(health-scan) / 隔离后 FAIL(weekly-draft，issue-5 本体) / 注入虚构例程 FAIL(缺行) → 新断言为载荷断言非恒真",
    "L2": "零执行（未授权）",
    "zero_public_exposure": "库终态 ShareLink=0 / PendingAction(create_share_link)=0 / MetricSnapshot=0 / WeeklyReport=1（M4 前既有）/ OutreachMessage(sent)=0"
  },
  "signoff": "docs/test-reports/M4-INSIGHT-signoff-2026-07-25.md（本轮已写盘；docs.signoff 可填此路径）",
  "next": "F012 保持 completed；批次 12/12 PASS 零遗留 → 可置 done。O9 为部署前须人类处置项（真网关模型/通道校准 + 例程错误路径是否纳入 degraded），真网关复测需用户授权"
}
```

---

*署名：Andy/evaluator-subagent（隔离上下文二轮复验；独立取证，未采信 commit message 与任何实现叙述）· 2026-07-25*
*本报告原样落盘，任何人不得改写判定。*
