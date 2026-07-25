# M4-INSIGHT Signoff 2026-07-25

> 状态：**已验收签发**（可置 progress.json status=done）
> 触发：reverifying（fix_rounds=2）全 12 features PASS —— 洞察（insight）域立真批次闭环
> 签发者：Andy/evaluator-subagent（隔离上下文；独立取证，未采信任何实现叙述）

---

## 变更背景

M4-INSIGHT = 洞察（insight）域立真批次。目标：`MetricSnapshot` / `WeeklyReport` / `ShareLink` 三表 + `roi.compute` / `attribution.gaps` 两纯函数（三处复用）+ `compute_roi` / `draft_report` 两内部工具 + `create_share_link` outbound 闸门（白名单第 6，**mock 零真实公开暴露**）+ `ops/share` 接口先行 + V8 项目级对照账本 & V12 跨项目洞察接真（`env-insight` / `insight` 两 mock 退役）+ `weekly-draft` 例程。ROI 分子诚实降级（spend 真源装配 + reach/conversions 缺口如实标注，真值留 M5）。

验收采用快车道 fan-out：12 features 各一隔离 evaluator-subagent + 1 个对抗复核 subagent。首轮 **11 PASS + 1 PARTIAL**（F012 文档翻牌 / 新鲜度复核，对抗复核 4/4 UPHELD）→ fixing round1 → 一轮复验 **PARTIAL**（首轮 4 FAIL 全 CLOSED，残留 issue-5）→ fixing round2 → **二轮复验 PASS**。

---

## 逐 Feature 判定汇总

| Feature | 标题 | Executor | 首轮 | 复验 1 | 复验 2 | 报告 |
|---|---|---|---|---|---|---|
| F001 | 迁移：三表 + `ShareLinkScope` 枚举 | generator | PASS | — | — | `m4-verify/F001-verdict.md` |
| F002 | `roi.compute` 纯函数 + D20 变异测试 | generator | PASS | — | — | `m4-verify/F002-verdict.md` |
| F003 | `attribution.gaps` 纯函数 + D20 变异测试 | generator | PASS | — | — | `m4-verify/F003-verdict.md` |
| F004 | MetricSnapshot 装配服务（spend 真源聚合） | generator | PASS | — | — | `m4-verify/F004-verdict.md` |
| F005 | `compute_roi` 内部工具（insight 人格） | generator | PASS | — | — | `m4-verify/F005-verdict.md` |
| F006 | `draft_report` 内部工具 + WeeklyReport 落库/采纳 | generator | PASS | — | — | `m4-verify/F006-verdict.md` |
| F007 | `ops/share` 适配器（ShareLinkService 接口 + mock） | generator | PASS | — | — | `m4-verify/F007-verdict.md` |
| F008 | `create_share_link` outbound 工具 + 闸门 | generator | PASS | — | — | `m4-verify/F008-verdict.md` |
| F009 | V8 项目级对照账本接真 + 分享闸门真链 | generator | PASS | — | — | `m4-verify/F009-verdict.md` |
| F010 | V12 跨项目洞察页接真 + 周报采纳 + 分享闸门真链 | generator | PASS | — | — | `m4-verify/F010-verdict.md` |
| F011 | `weekly-draft` 例程（scheduler 注册表化） | generator | PASS | — | — | `m4-verify/F011-verdict.md` |
| F012 | `insight:e2e` 闭环 + 文档翻牌 + 批末新鲜度复核 | generator | **PARTIAL** | **PARTIAL** | **PASS** | `F012-verdict` + `F012-recheck` + `F012-reverify` + **`F012-reverify2`** |

**结果：12 PASS / 0 PARTIAL / 0 FAIL · fix_rounds = 2**

首轮汇总：`docs/test-reports/M4-INSIGHT-verify-round1-2026-07-25.md`（11 PASS / 1 PARTIAL，判定原样取自各 evaluator verdict）。

---

## fix_rounds = 2 记录（两轮修复内容与验收链）

### 验收链全貌

```
building 12/12 @ f6a631b（CI 绿）
  → 首轮验收（fan-out 12 subagent + 对抗复核）: 11 PASS / F012 PARTIAL（4 FAIL，UPHELD）@ 9878e50
  → fixing round1 @ defa9f3（文档翻牌 4 项 + 新鲜度回归测试机制化）
  → 复验 1: PARTIAL —— 4 FAIL 全 CLOSED，残留 issue-5（§8.10 例程节）@ cdfca59
  → fixing round2 @ 300b5c1（§8.10 翻牌 + 例程行级回归断言）
  → 复验 2: PASS @ 48e6fa6（HEAD）
```

### fixing round1（commit `defa9f3`）—— 首轮 4 个 FAIL

| issue | 内容 | 复验 1 判定（对实物核） |
|---|---|---|
| issue-1 | §9.2「已实装工具」表未加 M4 三工具行 + 表头计数陈旧 | ✅ CLOSED —— 三行在场；表头 7→**18** = `NATIVE_TOOLS` 实测 18；行内描述（roi 产物复用 / `AIGCGATEWAY_REPORT_MODEL` 路由插座 / 白名单第 6 + 幂等键 = PA.id）逐条回源码属实 |
| issue-2 | §8.6 编队名册 insight 行 `tools` 仍为 `[]` | ✅ CLOSED —— 三工具逐名对齐 `registry.ts:171`；EXTENSION POINT 注解同步且如实（名册内仅 `compliance` 仍空） |
| issue-3 | §7.2.1 权威节三表 + 一枚举 + 迁移计数整条未更新 | ✅ CLOSED —— 迁移 **9** / 枚举 **17** / 模型 **24** 三计数 = 实物；三模型行约束（`@@index([projectId,date])` / `projectId?` 双态 / `tokenHash` 明文不落库 / `gateLogId` 软引用）逐字回 schema 核对 |
| issue-4 | 批末新鲜度复核漏 4 处陈旧标记 | ✅ CLOSED —— L254 / L372 / §5.4 标题 / §6.7 存续范围四处全翻；`grep 演进 M4\|归 M4` = **0 命中**；§6.7 按 `mock/index.ts` 实物重写属实 |

**机制化沉淀**：新增 `tests/unit/architecture-doc-freshness.test.ts`（8 断言，文档计数/名册/陈旧标记对实物）。复验 1 以缺陷态探针实证 **7/8 为载荷断言**（A6 对本类缺陷恒真，已登记 O5）。

### fixing round2（commit `300b5c1`）—— 残留 issue-5

| issue | 内容 | 复验 2 判定（对实物核） |
|---|---|---|
| issue-5 | §8.10 主动式 Agent 节未翻：标题「其余 3 条随 M3-M4 表落地」（实为 2 条）+ 例程表 `weekly-draft` 行无 as-built 注，与 §14「✅ 已交付」自我矛盾 | ✅ **CLOSED** —— 标题改为「已实装 4 条 = health-scan / nightly-screen / kol-sync / weekly-draft（✅ M4 F011），其余 2 条（signal-sync / delivery-watch）」，与 `ROUTINES` 实物（恰 4 条，逐名一致）+ 例程表 6 行相符；`weekly-draft` 行 as-built 注 **7 个子句逐条回源码属实**（cron `0 4 * * 1` / 与 `draft_report` 同源非旁路 / `projectId=null,adopted=false` 落库 / 同周期覆盖 / 已采纳冻结跳过 / 降级明示 / `npm run routine:weekly-draft`）；§14 矛盾消除 |

**顺手项独立核实**：`health-scan` 行由「as-built 注」统一为「✅ 已实装（M1-C F004；S7 校准 …）」——commit 自述「被新断言当场抓出」经反向 worktree 实跑复现属实（原文无「已实装」三字），改后内容与 `HEALTH_SCAN_CRON = '0 2 * * *'` 一致，原 S7 校准语义未被删改。

**机制化沉淀（复验建议采纳）**：`architecture-doc-freshness.test.ts` 追加**例程行级断言**——遍历 `ROUTINES` 实物 name，断言 §8.10 该行存在且含「已实装」。三道反向探针证明其为载荷断言：

| 探针 | 置入的缺陷态 | 实测 |
|---|---|---|
| P1 | round2 前的原始文档 | FAIL（`health-scan` 行未标） |
| P2 | 同上但单独修好 health-scan（隔离 issue-5 本体） | FAIL（`weekly-draft` 行未标）→ **直接钉住 issue-5** |
| P3 | HEAD 文档 + 注入虚构例程 `probe-future-routine` | FAIL（表缺该行）→ 未来新例程不翻牌即 CI 红 |

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 产品代码（`src/` / `prisma/` / 配置 / 迁移） | **两轮 fixing 合计零改动**（`git diff --name-only 9878e50..HEAD` 过滤产品面 = 零命中）；产品树自 F012 原始实现 `f6a631b`（CI 绿）起未再改动 |
| 视觉基线 | 未重生；F009/F010 基线在 building 期经 `update-visual-baselines` workflow 重生，CI visual job 在修复 commit `300b5c1` 上 success |
| ROI 分子真值（reach / conversions） | 本批恒 `null` + 证据缺口如实标注（P1/P2 诚实降级），**真值回传源明文留 M5** |
| 真实公开分享页 / 真实 `ShareLinkService` | `ops/share` 恒 mock，**无 REAL 分支**（非 mock provider 明示拒绝，不静默回落）；真实现明文留 M5 |
| `signal-sync` / `delivery-watch` 两例程 | 未实装，文档已如实标注归后续批次 |

---

## 预期影响

| 项目 | 改动前 | 改动后 |
|---|---|---|
| DB 模型表 | 21 | **24**（+MetricSnapshot / WeeklyReport / ShareLink） |
| 枚举 | 16 | **17**（+`ShareLinkScope`） |
| 迁移条数 | 8 | **9**（`20260724183013_m4_insight_three_tables`，expand-only 纯 CREATE） |
| `NATIVE_TOOLS` 注册工具 | 15 | **18**（+compute_roi / draft_report / create_share_link） |
| outbound 白名单 | 6 中 4 已实装 | **6 中 5 已实装**（+create_share_link） |
| insight 人格 `tools` | 空数组 | **3 件**（compute_roi / draft_report / create_share_link） |
| 例程注册表 `ROUTINES` | 3 条 | **4 条**（+weekly-draft，周一 04:00 错峰） |
| 前端 mock | 含 `env-insight.ts` / `insight.ts` | 两者**退役**（`src/lib/data/mock/` 仅剩 `env-brief.ts` + `runs.ts` + `index.ts`） |
| **真实公开暴露 / 真实外呼** | — | **0 / 0**（P4 满足，mock 观测标记 + `publicUrl` 恒 null） |

---

## 类型检查 / CI

```
npx prisma generate     → EXIT=0（testing-env-patterns §3 防误报）
npx tsc --noEmit        → EXIT=0（0 error，工作树干净）
npm run lint            → ✔ No ESLint warnings or errors（EXIT=0）
npm run test:unit       → 82 files / 994 tests 全通过（EXIT=0）
                          （首轮 81/985 → round1 82/993 → round2 82/994；增量逐轮可解释 = 新鲜度回归断言）

gh run list（独立核验）：
  300b5c1（round2 修复，HEAD 最后含产品/测试码提交）
      CI = success（5/5：Lint · Typecheck · Unit+integration · Build · Visual regression）
      Build & Push image = success                                   ← 权威门
  defa9f3（round1 修复）  CI = success（5/5）
  48e6fa6（HEAD，state-only）未触发 CI（paths-ignore，符合预期）

git diff --name-only 300b5c1..HEAD = progress.json（+ 本轮 evaluator 报告）
  → 全 paths-ignore（状态机文件 / 测试报告），等价部署，不阻断签收
```

**`test:visual` 本地未重跑的判定理由**：两轮 fixing 零产品/UI/样式改动（视觉被测面字节级未变）+ CI linux 权威视觉 job 在 `300b5c1` 上 success（新 run）+ 本地 darwin 两例已知漂移与本批无关。三条独立成立。

---

## L2 实测记录（如实记录，含误跑披露转录）

> 本批 `create_share_link` / `ops/share` 恒 mock、无 REAL 分支（U2/P4）→ **分享面无 L2 项**。
> `draft_report` / `weekly-draft` 存在真网关分支（`INSIGHT_E2E_REAL_LLM=1`）→ **属 L2，全程未获授权、未执行**。

| 项 | 状态 / 证据 |
|---|---|
| M4 真网关最小用量（`INSIGHT_E2E_REAL_LLM=1 npm run insight:e2e`） | **[L2] 未执行，待授权** —— building / 首轮 / 复验 1 / 复验 2 全程该开关未设；`insight:e2e` 脚本默认分支 `delete process.env.AIGCGATEWAY_{BASE_URL,API_KEY}`，日志明示 `[insight/weekly-report] AIGCGATEWAY_* 未配置——降级固定草案（明示，不静默）` → **零外呼 / 零 token / 零计费** |
| `insight:e2e` 闭环（L1，降级路径） | 复验 2 复跑 **22/22 断言全绿**：装配 spend 真源 → `compute_roi` 分子缺显证据不足 + gaps → `draft_report` 起草落库（降级明示） → 采纳 internal（PA 计数前后相等） → `create_share_link` 无令牌 pending（**副作用零发生**：无 ShareLink 行、无 SHARE_CREATED 标记）→ confirm 签票 → execute 消费票 → ShareLink 落库（`gateLogId` 非空 + 明文 token 仅现一次 + DB 只存 sha256 hash）+ irrev 留痕同事务 |
| 其余闭环套件（L1，交叉批次核证） | `agent:smoke` / `orch:smoke` / `gate:smoke` / `delivery:e2e` 四条 exit 0 全绿 |
| **[L2] 上轮误跑披露（原样转录，不淡化）** | 复验 1 的 evaluator 自我披露：「交叉核证时误跑 L2 套件 `reach:e2e`（其文件头写明 `draft_email` 走**真网关**），发生 **1 次真实网关调用**，未获授权。影响已核实封口：① 调用在模型名校验阶段被拒（HTTP 400），未进入生成 → **零 token 生成、零计费**；② 邮件走 mock 且运行在步骤①即中止 → **零真实投递**（`OutreachMessage` 无新增 outbound 行）；③ 脚本 `finally` 已执行，**夹具零残留**。未再重试，是否复测交由用户授权。」详见 `m4-verify/F012-reverify.md` §3.1 / O9 |
| 本轮（复验 2）L2 纪律 | **零 L2 执行**：`reach:e2e` 明确不跑；执行任何套件前**先读脚本文件头 + grep 网关调用面**（`AIGCGATEWAY\|generateText\|streamText`）确认 L1 属性后才跑；`env \| grep` 实证 shell 内无 `AIGCGATEWAY_*` 与 `INSIGHT_E2E_REAL_LLM`。dev 库 `OutreachMessage(direction=sent) = 0` 反证零真实投递 |

---

## 零真实公开暴露核证（P4，四道独立证据）

| # | 证据 | 实测 |
|---|---|---|
| 1 | **结构性**：无真实分享分支可触发 | `src/lib/ops/share/` 仅 `types.ts` + `mock-share-link.ts` + `index.ts`，无真实现、无 fetch / 网络调用；选择器对非 `mock` provider **明示抛错**（不静默回落）——「不是靠开关关着，而是分支不存在」 |
| 2 | **返回值**：无可公开访问地址 | `mock-share-link.ts:75` `return { payloadRef, token, publicUrl: null, mocked: true }`（注释明示「没有真实可公开访问的地址就不编一个」）；e2e 断言 `⑦ publicUrl=null` + `⑦ mocked=true` + `payloadRef` 为 `share-payload:` 内部引用非公网 URL |
| 3 | **闸门**：未确认不可执行 | e2e `⑤ 副作用零发生（无 ShareLink 行、无 SHARE_CREATED 标记）`；`gate:smoke` G1-G8 全绿（两步票据 7 态 + 并发竞态 + D20 变异） |
| 4 | **库终态**：本机零残留 | 复验 2 跑完 `ShareLink = 0` / `PendingAction(create_share_link) = 0` / `MetricSnapshot = 0` / `WeeklyReport = 1`（M4 前既有）/ `WeeklyReport(adopted) = 0` —— 夹具自清理 |

首轮另经 F008 / F010 / F012 三个独立 evaluator 各自核证，本轮为第四次独立复核。

---

## Ops 副作用记录

本批次无 prod / staging 数据库 ops。所有测试在本地 dev tenant + fixture 租户执行；无用户授权的越界 SQL ops。唯一持续副作用 = `insight:e2e` 每跑一次 dev 租户 `OperationLog` 净增 1 行（append-only 语义，本轮终态 104 行，见 soft-watch S5）。

---

## Harness 说明

本批改动经 Harness 状态机完整流程（planning → building → verifying → fixing → reverifying → fixing → reverifying）交付，**fix_rounds = 2**。验收全程 evaluator 以隔离 subagent（fresh context）运行，每轮结论原样落盘、未经改写/筛选/软化（独立性铁则满足）：首轮 12 个 fan-out subagent + 1 个对抗复核 subagent，两轮复验各 1 个隔离 subagent。Evaluator 全程未修改产品代码、文档基线与状态机文件（`progress.json` / `features.json` 由编排者写入）。

签发后待编排者置 `progress.json` `status: "done"` 并把本文件路径填入 `docs.signoff`。

---

## Soft-watch（不阻塞 done，需后续跟进）

| ID | 描述 | 风险 | 建议处置 |
|---|---|---|---|
| **S1** | **网关 `deepseek-v3` 通道对上游失效**（复验 1 实证：上游 DeepSeek 已下线 `deepseek-chat`，改 `v4-pro` / `v4-flash`；网关目录中 `deepseek-v3` 仍在 = 通道映射失效，非本仓选错模型名）。影响**所有真网关 chat 路径**：M3-A `draft_email`/`refine_email`、M4 `draft_report`/`weekly-draft`、agent loop。**prod 已配 `AIGCGATEWAY_API_KEY`** → 这些路径当前应会 400 失败。另：`weekly-report.ts:259` 的 `degraded` 兜底**只覆盖「凭据缺失」**，网关报错**直抛无 try/catch** → prod 上 weekly-draft 例程会硬失败而非降级出固定草案 | **high（部署面）** | **非本批缺陷**（不违反 F006/F011 acceptance——其只规定「无凭据→降级明示」，未规定错误路径；本批零触碰 `src/lib/ai` 与 `src/lib/reach`）。**须人类处置**：① 部署前校准 `AIGCGATEWAY_CHAT_MODEL` / 网关通道；② 评估是否把「网关错误」也纳入 `degraded` 兜底（例程类路径尤其需要）。真网关复测需用户授权 |
| **S2** | 文档卫生跨批历史债：顶层架构图/目录树「演进 M1」标签仍陈旧（L244/L251/L366/L371）；§1 概览句 L36「其余例程随 M2-M4 表落地」在 M4 收口后措辞不精确；§5.5 事件词表 `report.adopted`/`share.created` 无 ✅ 标（M3-B 三项同状态） | low | 非 M4 造成、不构成「已实装却标未实装」的判据面命中。建议下批设一个**文档卫生 feature** 统一收口，并复用本批的 doc-freshness 机制化写法 |
| **S3** | §12.6 测试矩阵称 `tests/unit/` 断言「outbound 集合 = `OUTBOUND_TOOL_NAMES` 六工具名白名单恰好相等」——**该常量与该测试全仓零命中**（实物 outbound 判定靠各工具 `class: 'outbound'`，实测 5 件）。早于本批（`M2C-agent-honesty-signoff-2026-07-23.md` L86 已记录），§8.6.1 亦已把配套的承诺-兑现断言标为「演进目标（未实装）」 | low | 与 §8.6.1 一并处置：要么补实该常量 + 白名单相等断言（推荐，outbound「一个都不能漏」是安全面判据），要么把 §12.6 该句改为目标态措辞 |
| **S4** | 新鲜度回归网可增强两处：① A6（工具名全文在场）对「名字在文档里但没进主表」类缺陷恒真，建议收窄为表区间作用域（仿行级写法）；② §8.10 标题计数「已实装 4 条」无断言覆盖，将来注册第 5 条例程时会静默陈旧 | low | 下批把两条补进 `architecture-doc-freshness.test.ts`（成本各 1 断言） |
| **S5** | 本地 `test:visual` 已知漂移：`today` 基线（长寿命 dev DB 的 `OperationLog` 相对时间；每跑一次 `insight:e2e` 再 +1 行）+ `env=match` 基线（本地长寿命库有真组合数据 vs CI 夹具空态）。CI 为权威门且绿 | low | 建议 dashboard 断言 mask 相对时间；e2e 副作用不建议改成删日志（违 append-only 语义） |
| **S6** | 洞察侧栏徽标恢复（M4 接真后数据源已可用）；`F003-low-1`（resend SDK 不暴露 signal）未修 | low | 沿 project-status 既有登记，留下批裁决 |

---

## Framework Learnings

### 新规律

- **文档翻牌类 acceptance 的收口，必须以「实物注册表 → 文档行」的机械断言封边，而不是靠批末人工 grep。** 本批同一坑连踩两轮：round1 翻了 acceptance 点名的 4 处却漏掉首轮证据包已明确交办的 §8.10；直到 round2 把「遍历 `ROUTINES` 断言表行含『已实装』」写进 CI，才连带抓出连人工复核都没注意到的 `health-scan` 行措辞缺标。
  - 来源：F012 round1 → 复验 1 PARTIAL → round2 → 复验 2 PASS
  - 建议写入：`framework/patterns/audit-methodology.md` §4（审计转回归 harness）补一条「文档-实物一致性同样适用」

- **复验对「新增回归断言」不得以全绿采信，须做反向探针；且探针应尽量跑真实测试文件而非同构重写。** 本轮用临时 worktree（缺陷态代码 + HEAD 测试文件）实跑，比上轮的 mjs 同构探针保真度更高，并额外验证了「未来新例程无行 → 判红」的活性方向。
  - 来源：复验 2 §2.2 三道探针
  - 建议写入：`framework/patterns/audit-methodology.md` §5 补充「探针保真度优先级：真测试文件 + 缺陷态 worktree ＞ 同构重写」

### 新坑

- **批量执行「闭环套件」前必须逐个读脚本文件头判 L1/L2。** 同一目录下 `insight:e2e`（脚本内主动清网关 env，恒降级）与 `reach:e2e`（文件头写明真网关最小用量）外观同类、层级不同；按目录批量跑导致复验 1 发生 1 次未授权真网关调用。
  - 来源：复验 1 §3.1 自我披露 → 复验 2 已按纪律执行（先读头 + grep 网关调用面）
  - 建议写入：`.auto-memory/role-context/evaluator.md`「测试分层策略 L1/L2」补一句执行纪律

- **`commit message` 的收口范围自述不可作为复核证据。** round1 commit 自称「锚点复查清零」，实测 §8.10 未清零（登记为 O8）；round2 的三条自述则经独立复现全部属实。两轮都只能靠回实物取证来区分。
  - 来源：O8（round1）与其在 round2 的未复发
  - 建议写入：已被「评估基于实物」铁则覆盖，无需新增

### 模板修订

- 无。

---

*签发：Andy/evaluator-subagent · 2026-07-25 · 隔离上下文验收，结论原样落盘*
