# M4-INSIGHT F012 复验 verdict（fix_rounds=1 → reverifying）

- **feature**：F012 `insight:e2e` 闭环 + 文档翻牌 + 批末新鲜度复核
- **复验者**：Andy/evaluator-subagent（隔离上下文；自行从磁盘 + git 取证，**未采信 fixing commit message 的任何自述**）
- **日期**：2026-07-25
- **复验基线**：首轮验收基线 `9878e50` → 修复 commit `defa9f3` → 状态 commit `0ae9e17`（= HEAD，工作树干净）
- **被验对象**：`docs/dev/architecture.md`（修复实物）· `tests/unit/architecture-doc-freshness.test.ts`（新增回归网）· 实物真相源 `prisma/schema.prisma` / `prisma/migrations/` / `src/lib/agent/tools/index.ts` / `src/lib/agent/registry.ts` / `src/lib/jobs/scheduler.ts` / `src/lib/data/mock/index.ts`

## 结论：**PARTIAL**（首轮 4 个 FAIL **4/4 全部 CLOSED**，零新问题；但 acceptance 子句「批末新鲜度复核」仍有 **1 处残留未闭合** —— §8.10 例程节，该处已白纸黑字记在首轮证据包 `F012-recheck.md` ADVISORY-1 并被点名交给 fixing，本轮未做，而 commit 自称「锚点复查清零」）

> **不是扩大验收范围**：该残留不是复验新发明的判据，它出自**首轮同一份证据包**（`F012-recheck.md` §issue-4 ④「反向发现」+ 瑕疵登记 ADVISORY-1），且首轮修复建议第 158 行明文写「把 ADVISORY-1（§8.10 标题 + weekly-draft 行）一并纳入 grep 复核」。判据 = acceptance 原文子句「批末新鲜度复核（grep 陈旧计数 / **未实装残留** / 演进 M4 标记翻牌）」+ `role-context/evaluator.md`「文档新鲜度 clause：已实装却仍标未实装 = 批内反向漂移，判 PARTIAL」。
>
> **无双标核对**：M3-B F012 首轮 PARTIAL 的**唯一阻断**就是两行陈旧标记（L254/L372）；M4 首轮 issue-4 亦以同类两行入账。本轮同类残留若放行，即对同一判据前后两套尺子。

---

## 0. 环境与 L1/L2 边界

| 项 | 值 |
|---|---|
| dev DB | `newkolmatrix-dev-db` Up 3 days (healthy)；`prisma/migrations/` 实测 **9 条** |
| prisma client | 复验前 `npx prisma generate` 重生（exit 0，`testing-env-patterns` §3 防误报） |
| Node | v25.7.0 |
| **L2（本批 M4 面）** | **未执行（未获授权）**：`INSIGHT_E2E_REAL_LLM` 全程未设；`insight:e2e` 走脚本默认降级分支，日志明示 `[insight/weekly-report] AIGCGATEWAY_* 未配置——降级固定草案（明示，不静默）`，**M4 路径零外呼、零计费** |
| **L2（越界自我披露）** | 交叉核证时**误跑 L2 套件 `reach:e2e`（M3-A）**，发生 **1 次真实网关调用**（未获授权）。已核实封口：400 模型名校验拒绝 → 零 token 生成零计费；邮件恒 mock 且步骤①即中止 → 零真实投递；夹具已自清理。详见 §3.1 与 O9，**未再重试** |
| 零真实公开暴露 | 复跑后库终态 `ShareLink=0` / `MetricSnapshot=0` / `WeeklyReport=1`（M4 前既有那条）/ `PendingAction(create_share_link)=0` —— 夹具自清理，**本机未留下任何真实分享暴露** |
| 本次复验改动 | 产品代码、文档基线、`progress.json` / `features.json` **零改动**；新增仅 2 件 evaluator 产物：本报告 + `scripts/test/f012-reverify-freshness-probe.mjs`（只读探针） |

---

## 1. 首轮 4 个 FAIL 逐项核对（对实物核，不看 commit message）

**取证方式**：先 `git diff --stat 9878e50..HEAD` 确认改了哪些文件，再对每条 issue 分别读「文档现状」与「源码/目录实物」两侧，直接比对。

### issue-1 §「已实装工具」表未加 M4 三工具行 → ✅ **CLOSED**

| 核对面 | 实测 |
|---|---|
| 表头计数 | `architecture.md:895` = **「已实装工具（18 个，M4 校准）」**（原「7 个」） |
| 实物 | `NATIVE_TOOLS` 数组实数 **18** 条（`src/lib/agent/tools/index.ts:25-44`），末三条 `draftReportTool` / `computeRoiTool` / `createShareLinkTool` |
| 三行在场 | L913 `compute_roi \| internal \| insight`、L914 `draft_report \| internal \| insight`、L915 `create_share_link \| **outbound** \| insight` —— 三行**均在 L897-915 表区间内**（首轮 FAIL 的确切位置：当时该表 14 行止于 `distribute_keys`，三工具一行不在） |
| 行内描述是否属实（抽查） | `compute_roi` 行称「= `roi.compute` + `attribution.gaps` 产物，不内联重算」→ 与 F005 首轮 PASS 结论一致；`draft_report` 行称「`AIGCGATEWAY_REPORT_MODEL` 大模型路由插座」→ 实物 `src/lib/insight/weekly-report.ts:44` `process.env.AIGCGATEWAY_REPORT_MODEL ?? DEFAULT_CHAT_MODEL` **确在**；`create_share_link` 行称「白名单第 6 / 幂等键 = PA.id / 明文 token 仅 execute 响应现一次」→ 与 F008 首轮 PASS 及本轮 e2e ⑥ 断言一致 |

**O3 顺手项核实**：表头 7→18 **不是拍脑袋**，等于 `NATIVE_TOOLS` 实数（探针 A5 独立复算 = 18）。**如实。**

### issue-2 §8.6 名册 as-built 表 insight 行 `tools` 为 `[]` → ✅ **CLOSED**

- 文档现状（`architecture.md:1017`）：``| `insight` | 洞察 Agent | ⑤ Insight | `[compute_roi, draft_report, create_share_link⛔]`（M4 F005/F006/F008 扩三件） | …``
- 实物（`src/lib/agent/registry.ts` insight 人格）：`tools: ['compute_roi', 'draft_report', 'create_share_link']` —— **三件逐名对齐**，`⛔` 标在 outbound 那件（与 `OUTBOUND_TOOL_NAMES` 一致）
- 首轮点名的**同节自我矛盾已消除**：L1020 注解由「空 `tools` = EXTENSION POINT，各人格领域工具随 M1–M4 落地时补入」改为「**五环节人格 M1–M4 已全部补入，仅 compliance 领域工具随后续批次落地**」，与 L1022 下句「~~insight += …~~（✅ M4 已兑现）」和名册表三方一致
- **顺带核实注解新说法是否属实**：名册表内 `tools` 仍为 `[]` 的只剩 `compliance` 一行（strategy/match/reach/delivery/insight 五行均非空）→ **注解如实，未过度声明**

### issue-3 §7.2.1 权威节三表 + 一枚举 + 迁移计数 → ✅ **CLOSED**

| 项 | 文档现状 | 实物实测命令 | 实物 | 一致 |
|---|---|---|---|---|
| 迁移条数 | 「迁移（`prisma/migrations/`，**9 条**）」+ 清单末补 `20260724183013_m4_insight_three_tables`（M4 F001，expand-only，含单向回滚说明） | `ls -d prisma/migrations/*/ \| wc -l` | **9** | ✅ |
| 枚举 | 「**枚举（17 个，与实物逐字一致）**」+ 代码块补 `enum ShareLinkScope { project quarterly }` | `grep -c '^enum ' prisma/schema.prisma` | **17** | ✅ |
| 模型 | 「**模型清单（24 个）**」+ 补 `MetricSnapshot` / `WeeklyReport` / `ShareLink` 三行 | `grep -c '^model ' prisma/schema.prisma` | **24** | ✅ |

三行新增内容**逐字回 schema 核对**（防"补了但写错"）：

- `MetricSnapshot` 行称 `@@index([projectId, date])` → schema 实有该复合索引；称 `spend Decimal(14,2)?` + `spendSource（payout/quote/none）` + `reach/conversions/roi 本批恒 null` → 与 schema 字段与注释逐项对得上
- `WeeklyReport` 行称 `projectId?` 双态（null=跨项目 / 非空=项目复盘，P10）+ `adopted/adoptedAt` 幂等 → schema 一致
- `ShareLink` 行称 `tokenHash` 明文不落库（ADR-25）+ `gateLogId` 必非空 + `projectId/gateLogId` 软引用（D13）→ schema `gateLogId String? // → PendingAction.id（软引用；生成经闸门必非空）` 一致（列可空 = 软引用，非空由写入口守卫，与 `Payout.released 必带 gateLogId` 同一写法先例）

**首轮点名的「目录说 24 / 权威节说 21」内部矛盾已消除**（L402 引用方与 §7.2.1 权威节现同为 24）。

### issue-4 四处「演进 M4 / 归 M4 / 仍走 mock」陈旧标记 → ✅ **CLOSED（首轮点名的 4 处）**

| # | 位置 | 现文（本轮 `sed` 直读） | 实物核对 |
|---|---|---|---|
| a | L254 顶层架构图 OPS 节 | `… partner(escrow/keys) mock ✅ M3-B F004；**share mock ✅ M4 F007（真实现全归 M5）**` | `src/lib/ops/share/` = `types.ts`+`mock-share-link.ts`+`index.ts`，无真实现 → 如实 |
| b | L372 源码目录树 ops/ 节 | `… partner/（M3-B F004…）· **share/（M4 F007：ShareLinkService，仅 mock 零公开暴露）；真实现全归 M5**` | 同上 → 如实 |
| c | L529 §5.4 节标题 | `— **全量实装（M4 校准：… roi.compute + attribution.gaps ✅ M4 F002/F003——注册表至此全部落地）**` | §5.4 表 7 行**逐行均有 ✅/批次标注**，`domain/roi-compute.ts` + `domain/attribution-gaps.ts` 实存 → 「注册表至此全部落地」对**本表**成立，未过度声明；标题与同节表行的互斥已消除 |
| d | L640 §6.7 存续范围 | 整句重写：退役面逐项登记，`**存续范围**：仅 brief 语法面（env-brief.ts）与 runs 页（runs.ts）` | `ls src/lib/data/mock/` = `env-brief.ts` + `index.ts` + `runs.ts` **恰好两件数据文件**；`mock/index.ts` 退役登记表与句中列举（M1-B/M1-C/M1-D/M2-A/M2-B/M3-A/M3-B/M4）**逐条对得上** → 如实 |

**grep 终态复核（judge 落终态而非过程计数）**：

```
grep -n "演进 M4|归 M4|演进目标归 M4"          docs/dev/architecture.md → 0 命中
grep -n "枚举（16|模型清单（21|已实装工具（7"   docs/dev/architecture.md → 0 命中
```

**O3 顺手项核实**：§6.7 整句按 `mock/index.ts` 实物重写（不只删 insight 二字），首轮建议的 `creators`/`knowledge` 陈旧一并消掉 —— **如实且未夹带**。

---

## 2. 是否引入新问题

### 2.1 改动面（越界检查）

`git diff --stat 9878e50..HEAD`：

```
docs/dev/architecture.md                      | 30 +++++++----
features.json                                 |  2 +-
progress.json                                 |  6 +--
tests/unit/architecture-doc-freshness.test.ts | 78 +++++++++++++++++++++++++++
```

`git diff --name-only 9878e50..HEAD | grep -E '^(src/|prisma/|sdk/|package|next.config|tailwind|tsconfig|docker|.github)'` → **无命中**。
→ fixing round **零产品代码 / 零配置 / 零迁移改动**，只触碰文档 + 测试 + 状态机文件。**未越界。**

### 2.2 回归测试是否"钉住实物"而非"钉住文档自身"——断言强度探针（audit-methodology §5）

新增 `tests/unit/architecture-doc-freshness.test.ts` 本轮实跑全绿。**「全绿」不自动构成证据**：先把系统置回「本应判红」的状态（fixing 之前的 `9878e50:docs/dev/architecture.md`），用**同一组实物**逐条重跑同构断言。探针：`scripts/test/f012-reverify-freshness-probe.mjs`（只读，零副作用）。

```
实物基线：model=24 enum=17 migrations=9 tools=18 insightTools=[compute_roi, draft_report, create_share_link]

✅ 载荷  A1 §7.2.1 模型清单计数    缺陷态 FAIL（21 vs 24） → HEAD PASS
✅ 载荷  A2 §7.2.1 枚举计数        缺陷态 FAIL（16 vs 17） → HEAD PASS
✅ 载荷  A3 §7.2.1 迁移条数        缺陷态 FAIL（8 vs 9）   → HEAD PASS
✅ 载荷  A4 实物 enum 名在场        缺陷态 FAIL（缺 ShareLinkScope） → HEAD PASS
✅ 载荷  A5 工具计数 = NATIVE_TOOLS 缺陷态 FAIL（7 vs 18）  → HEAD PASS
⚠️ 恒真  A6 工具名在场（全文范围）   缺陷态 **PASS** → HEAD PASS
✅ 载荷  A7 §8.6 insight 行含三工具  缺陷态 FAIL（行内缺三件） → HEAD PASS
✅ 载荷  A8「演进 M4/归 M4」清零     缺陷态 FAIL（命中 3 处） → HEAD PASS

汇总：载荷断言 7 / 缺陷态恒真 1 / HEAD 仍红 0（共 8）
```

**判定：回归网真实有效，7/8 是载荷断言**——它们比对的是 `schema.prisma` / `migrations/` 目录 / `NATIVE_TOOLS` / `getPersona('insight').tools` 的**实物**，不是文档自证；且锚点缺失时 `docCount` 会当场红（不会静默跳过），活性有保障。A7 是**行级作用域**（只在名册 insight 那一行内找工具名），强度最高。

**如实登记一条弱化**：**A6（每个注册工具名出现在 architecture.md 全文）在首轮缺陷态即为真**——因为 `compute_roi` 等三名当时已出现在 L538/L909/L987/L1014，只是缺在工具主表里。即 A6 **抓不到 issue-1 那一类缺陷**（"名字文档里有、就是没进那张表"）。issue-1 的真正载荷是 A5 计数断言。A6 并非无用（全新工具从未在文档露面时仍会红），但**不得把它计入"issue-1 已被钉死"的证据强度**。建议下批把 A6 收窄为表区间作用域（仿 A7 的行级写法）。**此项不阻断**（结论不依赖它）。

### 2.3 文档新写内容是否有新的不实

逐条回实物核对（见 §1 各表"实物核对"列）：三工具行描述、三模型行约束、§6.7 退役/存续清单、§5.4「注册表至此全部落地」、§8.6 EXTENSION POINT 新注解 —— **均属实，无过度声明，无新增矛盾**。

---

## 3. L1 全量自跑 + 重跑判定

| 动作 | 结果 |
|---|---|
| `npx prisma generate` | exit 0 |
| `npm run lint` | exit 0，`✔ No ESLint warnings or errors` |
| `npx tsc --noEmit` | exit 0 |
| `npm run test:unit` | exit 0 —— **82 文件 / 993 测全通过**（首轮 81/985；差值 **+1 文件 / +8 测 = 新增新鲜度回归测试 8 断言**，增量可解释，无静默减测） |
| `npm run insight:e2e`（HEAD 复跑，非必须但已跑） | exit 0，**22/22 ✓**，降级明示、零外呼 |
| CI（linux 权威门）@ 修复 commit `defa9f3` | run 30148244658 **5/5 success**：Lint / Typecheck / Unit + integration tests / Build / **Visual regression** |

### 3.1 批次交叉破坏核证（另 5 条闭环套件）

复验要求核证「批次无交叉破坏」。fixing round 零产品代码改动已在结构上排除破坏可能，仍实跑其余各批闭环套件交叉验证：

| 套件 | 归属批次 | 结果 |
|---|---|---|
| `npm run agent:smoke` | AGENT-FOUNDATION | exit 0 ✅ 全部断言通过 |
| `npm run orch:smoke` | 多 Agent 编排框架 | exit 0 ✅ 全部断言通过 |
| `npm run gate:smoke` | AI→人闸门（G1-G8 两步票据 7 态 + 并发竞态 + D20 变异） | exit 0 ✅ 全部断言通过 |
| `npm run delivery:e2e` | M3-B | exit 0 ✅ 交付闭环全绿 |
| `npm run insight:e2e` | M4（本批） | exit 0 ✅ 22/22 |
| `npm run reach:e2e` | M3-A | **exit 1** —— 见下，**外部网关上游漂移，非代码破坏** |

**⚠️ 自我披露（L2 边界）：`reach:e2e` 是 L2 套件，我在交叉核证中误触发了 1 次真实网关调用。**
该脚本文件头写明「draft_email **真网关**起草（L2 最小用量：1 次 chat）」，与 `insight:e2e`（脚本内 `delete process.env.AIGCGATEWAY_*` 恒降级）不同；我按"mock 闭环套件"批量执行时未先读其文件头。**如实记录，不淡化。**
影响面已核实并封口：① 调用在**模型名校验阶段被拒（HTTP 400）**，未进入生成 → **零 token 生成、零计费**；② 邮件走 mock，且运行在步骤 ① 即中止，**未发生任何真实投递**（`OutreachMessage` 未新增 outbound 行）；③ 脚本 `finally` 已执行（日志 `[reach-e2e] 夹具已清理`），**夹具零残留**（库终态见 §0）。**未再重试，把是否复测交由用户授权。**

**失败根因判定 —— 外部上游变更，与本批次/本次修复无关（三道独立证据）：**

1. **错误来自上游服务商，不是本仓代码**：`AI_APICallError: The supported API model names are deepseek-v4-pro or deepseek-v4-flash, but you passed deepseek-chat`。本仓默认模型常量是 `deepseek-v3`（`src/lib/ai/gateway.ts:23`，`.env` 无 `AIGCGATEWAY_CHAT_MODEL` 覆盖）——`deepseek-chat` 这个名字**不出现在本仓任何代码里**，是 aigcgateway 把 `deepseek-v3` 通道映射到上游 DeepSeek 的旧模型名，而上游已把该名下线（改 v4-pro/v4-flash）。
2. **网关目录只读核对**（`GET /v1/models`，免费只读，无生成）：`deepseek-v3` **仍在网关模型清单内** → 属**网关侧通道映射对上游失效**，非本仓选错模型名。
3. **本批未触碰相关代码**：`git log f6a631b~12..f6a631b -- src/lib/ai/ src/lib/reach/` **无任何 commit**；`src/lib/ai/gateway.ts` 最后改动 = `0f882cc`（2026-07-19 AGENT-FOUNDATION），`scripts/test/reach-e2e.ts` 最后改动 = M3-A。fixing round 更是零产品代码。

→ **不计入 M4 批次缺陷，也不构成交叉破坏**；但**是一条需要人类处置的部署面风险**，见 O9。

**`test:visual` 本地未重跑——判定理由（audit-methodology §5「换形态才需重估断言强度」的对偶：**未换形态、未触碰被测面则不需重跑**）**：
1. `git diff --name-only 9878e50..HEAD` 证明 fixing round **零产品代码 / 零 UI / 零样式改动**，视觉基线的被测面在字节级未变；
2. **CI linux 权威视觉 job 在修复 commit `defa9f3` 上已 success**（不是引用首轮旧 run，是修复后新 run）；
3. 本地 darwin 两例已知漂移（today 相对时间 + 长寿命库 env=match 真数据）与本批无关，首轮已实证登记。
→ 三条独立成立，重跑只会复现同一结论。**另需披露**：本轮 e2e 复跑按 O2 已知行为又向 `OperationLog` 追加 1 行 `SHARE_CREATED`（append-only 语义，不删），本机 today 基线漂移**因此加深一格**——不影响 CI 权威门。

---

## 4. 残留（阻断项）：issue-5 §8.10 例程节仍标 weekly-draft 未实装

> 来源 = 首轮证据包 `F012-recheck.md` §issue-4 ④「反向发现」+ ADVISORY-1，首轮修复建议已点名"一并纳入 grep 收口"；`defa9f3` **未触碰该节**（diff 无 §8.10 hunk），commit message 亦未提及，却总结为「锚点复查清零」。

| 面 | 现状（本轮 `sed` 直读） | 实物 |
|---|---|---|
| §8.10 节标题（L1081） | `…nightly-screen 已实装，**其余 3 条随 M3-M4 表落地**）` | `ROUTINES` 实注册 **4 条**：health-scan / nightly-screen / kol-sync / **weekly-draft**（`src/lib/jobs/scheduler.ts:96`，注释「M4 F011」）→ 未实装实为 **2 条**（signal-sync / delivery-watch） |
| 例程清单表 `weekly-draft` 行（L1101） | `\| weekly-draft \| 每周 \| insight \| 汇总跨项目数据起草周报草案 \|` —— **无任何 as-built 注** | `src/lib/jobs/routines/weekly-draft.ts` 实存 + `package.json:39` `routine:weekly-draft` 可跑（F011 首轮 **PASS**） |
| 同表对照组 | `nightly-screen` / `health-scan` / `kol-sync` 三行**均带 `✅ 已实装（批次 + cron + 行为）` 注**；表头明写「**as-built 注记见行内**」 | —— 即：本表的 as-built 语义**由行内注承载**，weekly-draft 行的空缺 = 文档断言"未实装" |

**加重情节（与首轮 issue-2 完全同构）**：同一文档 §14 路线图 M4 行（L1779）已写 `+ weekly-draft 例程 \| ✅ **已交付**（2026-07-24，M4-INSIGHT 批次）` —— **§14 说已交付、§8.10 说随 M3-M4 落地，文档自我矛盾**，且矛盾的两端都是本批亲手造成/亲手该翻的。

**证伪尝试（逐一失败）：**

| 假说 | 核对 |
|---|---|
| 「其余 3 条」也许把 kol-sync 算在内，数字仍对 | kol-sync 行自带 `✅ 已实装（M2-B F003）`，不可能属"其余未落地"；无论怎么算，weekly-draft 已实装 → 剩 2 条 ≠ 3 条 |
| 该行 as-built 注属 F011 责任，不归 F012 | F011 acceptance 全文无文档条款（只要求注册表 + 可跑 + 幂等 + staging dry-run）；F012 acceptance 单列「批末新鲜度复核（未实装残留）」→ 归 F012，与首轮 recheck 认定一致 |
| 属首轮已豁免项（ADVISORY 非 FAIL） | 首轮原文是「**不追加为新 FAIL 条目**，因原 verdict 的 4 条已足以支撑 PARTIAL…**留给 fixing 一并 grep 收口**」——是**程序经济 + 明确交办**，不是"可以不做"的豁免；且当时 verdict 已 PARTIAL，追不追加不改变结论，现在改变 |
| 仅文档、影响小 | 拒绝该类降级（同首轮口径）。§8.10 是主动式 Agent 的 as-built 声明位，读者据此判断"周报是否已自动起草"；与 §14 直接打架 |

**修复只需两笔（外加一笔机制化，强烈建议）：**

1. L1081 标题：`nightly-screen 已实装，其余 3 条随 M3-M4 表落地` → 如 `nightly-screen ✅ M2-A F006 / kol-sync ✅ M2-B F003 / weekly-draft ✅ M4 F011 已实装，余 signal-sync / delivery-watch 归 M5`
2. L1101 行尾补 as-built 注（沿同表写法）：`**✅ 已实装（M4 F011：cron 周级；跨项目汇总 → draft_report 起草 → WeeklyReport(projectId=null, adopted=false) 落库；无凭据降级固定草案明示；已采纳周期冻结跳过）**`
3. **机制化（把这一类钉进工具链，避免第三次复发）**：在 `tests/unit/architecture-doc-freshness.test.ts` 追加一条 —— 遍历 `ROUTINES` 的 name，断言 §8.10 例程表中**该行**（行级作用域，仿 A7 写法）含 `已实装`。这与本轮 A1-A5/A7/A8 同属"文档对实物"的载荷断言，且正是本条残留能溜过 8 条现有断言的原因（现有断言无一覆盖例程面）。

---

## 5. 非阻断观察项（soft-watch，登记备查，**不要求本轮修**）

| # | 级别 | 内容 |
|---|---|---|
| O5 | low | **A6 断言对 issue-1 类缺陷恒真**（§2.2），建议收窄为表区间作用域 |
| O6 | soft-watch | **顶层架构图/目录树的历史「演进 M1」标签仍陈旧**：L244 `jobs/scheduler（演进 M1）`（M1-C F004 已实装）、L251 `domain/（演进 M1）：健康度/匹配分/守卫/CRM 推断/ROI`（五项现已全部实装，最后一项 ROI 由本批兑现）、L366/L371 目录树同源。**不判阻断**：属跨多批的历史标签债（M1-B/M1-C/M2-A/M3-A 均未翻），非 M4 造成，且 acceptance 点名的是「演进 **M4**」标记。建议下批设一个文档卫生 feature 统一收口（可复用 §4.3 机制化写法） |
| O7 | soft-watch | **§5.5 事件词表** `report.adopted` / `share.created` 无 ✅ 标（本批已实装采纳服务与 SHARE_CREATED 标记）。同表 M3-B 的 `payout.released` / `keys.distributed` / `deliverable.met` 同样未标 → 属既有惯例（M3-B 签收时同状态），且该词表自标「（示意）」+ 节标题已声明"词表其余项随各域实装"。**不判阻断**，与 O6 一并归文档卫生 |
| O8 | 记录 | `defa9f3` commit message 称「锚点复查清零」，实测 §8.10 未清零（§4）。**修复动作本身如实**（4 项逐条核验属实），仅**收口范围自述过宽**——登记以提醒：commit 自述不可作为复核证据，本报告全部结论均回实物取证 |
| **O9** | **high（部署面，非本批缺陷，须人类处置）** | **网关 `deepseek-v3` 通道对上游失效**（§3.1 实证：上游 DeepSeek 已下线 `deepseek-chat`，改 v4-pro/v4-flash）。影响面 = **所有真网关 chat 路径**：M3-A `draft_email`/`refine_email`、**M4 `draft_report` / `weekly-draft` 例程**、agent loop 对话。本地 L1 全绿不受影响（恒 mock/降级），但 **prod 已配 `AIGCGATEWAY_API_KEY`** → 这些路径当前应会 400 失败。另注：`weekly-report.ts:259` 的 `degraded` 兜底**只对"凭据缺失"生效**，网关**报错时异常直抛**（无 try/catch）——即 prod 上 weekly-draft 例程每周会硬失败而非降级出固定草案。**这不违反 F006/F011 acceptance**（其只规定"无凭据→降级明示"，未规定错误路径），故不判缺陷；但建议下批（或部署前）作为独立 feature 处置：① 校准 `AIGCGATEWAY_CHAT_MODEL` / 网关通道；② 评估是否把"网关错误"也纳入 `degraded` 兜底（例程类路径尤其需要）。**需用户授权后方可做真网关复测。** |
| O2（续） | soft-watch | 每跑一次 `insight:e2e`，dev 租户 `OperationLog` 净增 1 行 `SHARE_CREATED`（append-only，符合 §7.2.1 语义，不建议改成删日志），持续加深本机 `today` 视觉基线漂移。CI 侧不受影响 |

---

## 6. 复验结论

**F012 = PARTIAL（第 2 轮）。**

- 首轮 4 个 FAIL：**4/4 CLOSED**，逐条对实物核实，含"补了但写错"的反向核对（三工具行 / 三模型行 / §6.7 清单 / §5.4 声明范围），**无一处虚**；
- fixing round **零产品代码改动**、无越界，回归测试 **7/8 为载荷断言**（缺陷态可判红实证），并把这一类漂移**机制化进 CI**——修复质量本身高于首轮建议；
- **批次交叉破坏：无**。另 5 条闭环套件中 4 条全绿（agent/orch/gate smoke + delivery:e2e），`reach:e2e` 的失败经三道独立证据判定为**外部网关上游模型下线**（本仓代码零关联、本批零触碰），登记为 O9 交人类处置；
- 唯一阻断 = **§8.10 例程节残留**（issue-5）：weekly-draft 本批已实装（F011 PASS），文档仍标未实装，且与 §14「✅ 已交付」自我矛盾。该点**出自首轮证据包并已明确交办**，非复验新增判据；按 acceptance「批末新鲜度复核（未实装残留）」+ role-context 文档新鲜度 clause，与 M3-B/M4 首轮同类先例**同尺度处置**。

**下一轮所需（预计一次极小 commit）**：§4 的两笔文本 + 一条例程面回归断言；复验只需 `lint`/`tsc`/`test:unit` 复绿 + §8.10 grep 复核，**e2e 与 visual 无需再跑**（本轮已在 HEAD 实证，且不会被文档改动影响）。

**批次 signoff：未签发**（`docs/test-reports/M4-INSIGHT-signoff-2026-07-25.md` 不写）。理由：progress.json 要求 12/12 无遗留，当前 11 PASS + F012 PARTIAL；`role-context/evaluator.md` 硬性规定 `docs.signoff` 为空不得置 done。批次其余 11 feature 的 PASS 结论**不受本条影响**（本轮未发现任何交叉破坏）。

---

## 7. evaluator_feedback（供编排者**原样**写入 progress.json，不得改写）

```json
{
  "round": 2,
  "date": "2026-07-25",
  "summary": "复验 PARTIAL。首轮 4 FAIL 全部 CLOSED（对实物逐条核实，含补写内容的反向核对）；fixing 零产品代码改动、无越界；新增新鲜度回归测试 8 断言中 7 条经缺陷态探针证明为载荷断言。唯一阻断 = §8.10 例程节残留（首轮证据包 ADVISORY-1，已明确交办 fixing 但未做）：weekly-draft 本批已实装（F011 PASS）文档仍标未实装，且与 §14「✅ 已交付」自我矛盾。批次交叉破坏核证：无（另 5 套件 4 绿，reach:e2e 失败经三道证据判为外部网关上游模型下线，登记 O9 交人类处置）。完整证据见 docs/test-reports/m4-verify/F012-reverify.md",
  "results": {
    "F001": "PASS", "F002": "PASS", "F003": "PASS", "F004": "PASS",
    "F005": "PASS", "F006": "PASS", "F007": "PASS", "F008": "PASS",
    "F009": "PASS", "F010": "PASS", "F011": "PASS", "F012": "PARTIAL"
  },
  "F012_issues_closed": [
    "issue-1 CLOSED：§8.2 工具表补三行 + 表头 7→18（= NATIVE_TOOLS 实测 18）",
    "issue-2 CLOSED：§8.6 insight 行 tools = registry 三件逐名对齐；EXTENSION POINT 注解同步且如实（仅 compliance 为空）",
    "issue-3 CLOSED：§7.2.1 迁移 9 / 枚举 17 / 模型 24 三计数 = 实物；ShareLinkScope 与三模型行在场且约束描述与 schema 一致",
    "issue-4 CLOSED：L254 / L372 / §5.4 标题 / §6.7 存续范围四处全翻；grep「演进 M4|归 M4」= 0 命中；§6.7 按 mock/index.ts 实物重写属实"
  ],
  "F012_issues_open": [
    "issue-5（阻断）：§8.10 主动式 Agent 节未翻 —— 标题 L1081「其余 3 条随 M3-M4 表落地」（实为 2 条：signal-sync/delivery-watch）+ 例程表 L1101 weekly-draft 行无 as-built ✅ 注（同表 nightly-screen/health-scan/kol-sync 三行均有，表头明写「as-built 注记见行内」）。实物：ROUTINES 已注册 weekly-draft（scheduler.ts:96，M4 F011）+ npm run routine:weekly-draft 在场。与同文档 §14 M4 行「weekly-draft 例程 ✅ 已交付」直接矛盾。来源 = 首轮 F012-recheck.md ADVISORY-1，已明确交办 fixing。修复 = 两笔文本 + 建议在 architecture-doc-freshness.test.ts 追加例程面行级断言（遍历 ROUTINES 断言对应行含「已实装」），机制化防第三次复发"
  ],
  "non_blocking": [
    "O5：新鲜度测试 A6（工具名全文在场）在首轮缺陷态即为真，抓不到 issue-1 类缺陷，issue-1 的载荷是 A5 计数断言；建议收窄为表区间作用域",
    "O6：顶层架构图/目录树历史「演进 M1」标签仍陈旧（L244/L251/L366/L371），跨多批历史债非 M4 造成，建议下批文档卫生 feature 统一收口",
    "O7：§5.5 事件词表 report.adopted / share.created 无 ✅ 标（M3-B 的三项同状态，属既有惯例，词表自标「示意」）",
    "O8：defa9f3 commit message 自称「锚点复查清零」与实测不符（§8.10 未清零）——修复动作本身如实，仅收口范围自述过宽",
    "O9（high，部署面，非本批缺陷，须人类处置）：网关 deepseek-v3 通道对上游失效（上游 DeepSeek 下线 deepseek-chat，改 v4-pro/v4-flash），影响所有真网关 chat 路径（M3-A draft_email/refine_email、M4 draft_report/weekly-draft、agent loop）；prod 已配 API_KEY 故受影响。且 weekly-report.ts:259 的 degraded 兜底只覆盖「凭据缺失」，网关报错直抛无 try/catch → prod weekly-draft 例程会硬失败而非降级。不违反 F006/F011 acceptance（其只规定无凭据路径），不判缺陷；建议部署前作为独立 feature 处置（校准模型/通道 + 评估错误路径是否纳入 degraded）。真网关复测需用户授权"
  ],
  "cross_batch_check": {
    "verdict": "无交叉破坏",
    "agent:smoke": "exit 0 ✅",
    "orch:smoke": "exit 0 ✅",
    "gate:smoke": "exit 0 ✅（两步票据 + 7 态 + 并发竞态 + D20 变异）",
    "delivery:e2e": "exit 0 ✅",
    "insight:e2e": "exit 0 ✅ 22/22",
    "reach:e2e": "exit 1 —— 外部上游漂移非代码破坏（三道证据：错误串 deepseek-chat 不存在于本仓代码；GET /v1/models 显示 deepseek-v3 仍在网关目录；git log 证 M4 零触碰 src/lib/ai 与 src/lib/reach，gateway.ts 最后改动 0f882cc/2026-07-19）。详见 O9"
  },
  "l2_disclosure": "自我披露：交叉核证时误跑 L2 套件 reach:e2e（其文件头写明 draft_email 走真网关），发生 1 次真实网关调用，未获授权。影响已核实封口：模型名校验阶段 400 拒绝（零 token 生成、零计费）；邮件走 mock 且在步骤①中止（零真实投递，OutreachMessage 无新增 outbound 行）；脚本 finally 已清理夹具（库终态零残留）。未再重试，是否复测交用户授权",
  "verification_run": {
    "lint": "exit 0",
    "tsc": "exit 0",
    "test:unit": "exit 0 — 82 文件 / 993 测（首轮 81/985，增量 = 新增回归测试 8 断言，可解释）",
    "insight:e2e": "exit 0 — 22/22（HEAD 复跑，降级固定草案零外呼）",
    "test:visual": "本地未重跑（判定理由：fixing 零产品/UI 改动 + CI linux 权威视觉 job 在修复 commit defa9f3 上 success，run 30148244658 5/5）",
    "cross_batch_suites": "agent:smoke / orch:smoke / gate:smoke / delivery:e2e 四条 exit 0；reach:e2e exit 1 = 外部上游漂移（见 cross_batch_check + O9）",
    "L2": "M4 面未执行（未获授权，INSIGHT_E2E_REAL_LLM 未设，零外呼零计费）；另有 1 次误触 L2 真网关调用见 l2_disclosure",
    "zero_public_exposure": "复跑后库终态 ShareLink=0 / MetricSnapshot=0 / WeeklyReport=1（M4 前既有）/ PendingAction(create_share_link)=0"
  },
  "next": "F012 → pending，回 fixing（fix_rounds 将为 2）。修复面仅文档 2 笔 + 测试 1 条断言；复验只需 lint/tsc/test:unit + §8.10 grep 复核，e2e/visual 不必重跑。批次 signoff 未签发（docs.signoff 保持 null）"
}
```

---

*署名：Andy/evaluator-subagent（隔离上下文复验；独立取证，未采信 commit message 与任何实现叙述）· 2026-07-25*
*本报告原样落盘，任何人不得改写判定。*
