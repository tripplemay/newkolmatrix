# M4-INSIGHT F012 验收对抗复核（尝试证伪 4 个 FAIL 条目）

- **复核对象**：`docs/test-reports/m4-verify/F012-verdict.md`（结论 PARTIAL，4 FAIL：issue-1 工具表 / issue-2 insight 人格 `tools` / issue-3 §7.2.1 三表+一枚举+迁移计数 / issue-4 四处陈旧标记）
- **复核者**：Andy/evaluator-subagent（**对抗复核**；隔离上下文，独立从磁盘取证，未采信原 verdict 的任何叙述性结论，逐条回到实物核对）
- **复核任务定义**：**只许证伪**——只有「事实认定错误」（acceptance 无此项 / 文档实际已翻 / 行号章节号认错到实质改变结论 / 命中已知环境误报）才能推翻某条 FAIL。**不得以「影响小」「只是文档」为由降级**。
- **复核基线**：HEAD `98acd01`，工作树干净（`git status --short` 空）；`docs/dev/architecture.md` 最后一次改动 = 实现 commit `f6a631b`（M4-INSIGHT-F012），**验收后至今零改动** —— 故原 verdict 引用的行号与本次复核所见完全同版本，不存在行漂移干扰
- **环境误报排查**：4 条 FAIL 全部是**静态文本 vs 源码实物**的比对，不涉及运行时。逐条比对 `framework/patterns/testing-env-patterns.md` §1（字体子集）/§2（fire-and-forget race）/§3（prisma generate 未跑）/§4（Node 版本 jsdom）/§5（E2E suite 隔离）—— **无一形态可套用**，不存在环境误报可能。
- **结论：4/4 UPHELD（全部维持），无一条被证伪。F012 整体判定 PARTIAL 维持。**

---

## 复核方法（为什么这份复核本身可采信）

每条 FAIL 走同一四问：

1. **acceptance 里有没有这一项？** → 回 `features.json` F012 `acceptance` 原文逐字比对
2. **文档现在到底是什么样？** → `sed -n` 直读该行，不看 diff、不看 commit message
3. **实物到底是什么样？** → `grep -c` / `ls` 直数源码与迁移目录
4. **原验收者的行号/章节号有没有认错到改变结论？** → 逐个跑其"复现命令"

原 verdict 的实现侧证据（commit message 自称"§7.2.1 计数 21→24 表"等）一律不采信，改以 `git show f6a631b -- docs/dev/architecture.md` 全量 diff 反查该 commit **实际改了哪些行**。

---

## issue-1 — §「已实装工具」表未加 M4 三工具 → **UPHELD（维持 FAIL）**

**① acceptance 有没有这项？** 有，且是**显式命名项**。`features.json` F012 acceptance 原文：`…architecture.md 翻牌（§5.2 insight 行 ✅/§5.4 roi·attribution 行 ✅/§14 M4 行 ✅/`**`工具表 compute_roi·draft_report·create_share_link`**`/insight 人格 tools/…）`。三个工具名被并列点名。

**② 文档现状（`sed -n '890,908p'`）**：

```
890: **已实装工具（7 个，M2-C 校准）**：
892: | 工具 | class | 归属人格 | 说明 |
894-907: search_kols / get_kol_detail / send_outreach / draft_email·refine_email /
         commit_quote / compute_health / match_plan / evaluate_creator / create_project /
         confirm_brief_goal / track_delivery / check_deliverables / payout / distribute_keys
         —— 14 行 15 件，无 compute_roi / draft_report / create_share_link 任一行
```

**③ 实物**：`src/lib/agent/tools/index.ts` `NATIVE_TOOLS` 数组实数 **18 条**，末三条即 `draftReportTool`（M4 F006）/ `computeRoiTool`（M4 F005）/ `createShareLinkTool`（M4 F008）。表头"7 个"与表体 15 件、实物 18 件**三方互不相等**。

**④ 证伪尝试（逐一失败）：**

| 证伪假说 | 核对结果 |
|---|---|
| 「工具表」也许指 §8.5 画布路由表（L981-988） | 该表 L987 只加了 `compute_roi` 一行，**无 `draft_report` / `create_share_link`**；且它是"渲染器路由键"表不是工具表。acceptance 三名并列 → 不成立 |
| 「工具表」也许指 outbound 六工具白名单（L909） | 该句只涉 `create_share_link` 一件，且 acceptance 另有独立子句「含 outbound 白名单第 6 工具兑现」把它单列 → 一项不能顶两项，不成立 |
| 「工具表」也许指 `agent-architecture.md` 的 native 工具段（L34） | acceptance 的括号明确挂在 `architecture.md` 名下，`agent-architecture 同步` 是**并列的另一项**（原 verdict 已判其 PASS，实物核对属实）→ 不成立 |
| 三工具也许写在 architecture.md 别处，只是不在表里 | `grep -n "compute_roi\|draft_report\|create_share_link" docs/dev/architecture.md` 全部命中行 = L538 / L909 / L987 / L1014 / L1313 / L1771，**无一落在 L890-907 表区间** → 反而坐实"工具口径主表缺席、其余章节已翻"的自相矛盾 |
| `f6a631b` 也许改了该表只是行号变了 | `git show f6a631b -- docs/dev/architecture.md` 全量 diff：该表区间**唯一改动是 L909 白名单句**，14 行表体一行未动 → 不成立 |

**⑤ 认错的地方（不改变结论）：** 原 verdict 把该表标为「**§9.2**「已实装工具」表」。实际该表位于 **§8.2 柱一 · 工具层**（L862）；`§9.2` 是「拦截点：工具执行器统一入口」（L1120，内容为 `execute.ts` 代码块，无工具表）。**属章节号标注错误**。但：其引用的行号 L890 / L909 / L987 全部准确，指向对象唯一且无歧义，事实认定（该表无三工具行）**独立成立**。按"只有事实认定错误才能推翻"的口径，章节号笔误**不足以证伪**。→ 记为非实质引用瑕疵（见文末 §瑕疵登记）。

**判定：UPHELD。**

---

## issue-2 — §8.6 编队名册 as-built 表 insight 行 `tools` 仍为 `[]` → **UPHELD（维持 FAIL）**

**① acceptance**：显式命名 `insight 人格 tools`。

**② 文档现状（`sed -n '1002,1014p'`）**：

```
1002: | key | 中文名 | 归属 stage | **as-built `tools`** | 隔离… |   ← 列头自称 as-built
1009: | `insight` | 洞察 Agent | ⑤ Insight | `[]` | 只读结果数据… |
1012: （… 空 `tools` = EXTENSION POINT，各人格领域工具随 M1–M4 落地时补入。）
1014: …~~insight += `compute_roi`/`draft_report`/`create_share_link⛔`~~（✅ M4 F005/F006/F008 已兑现）…
```

**③ 实物**：`src/lib/agent/registry.ts` insight 人格 `tools: ['compute_roi', 'draft_report', 'create_share_link']`（含注释「M4-INSIGHT F005/F006/F008 起填充（原为空数组）」）。

**④ 证伪尝试（最强的一条，仍失败）：**

- **假说**：实现者已在 L1014 把 `insight += …` 划线并标 `✅ M4 F005/F006/F008 已兑现`（diff 可证 `f6a631b` 确实改了这一行），是否可认为 acceptance「insight 人格 tools」已满足？
- **核对**：不成立，三条理由：
  1. L1014 该句自带前缀「**目标态工具子集**（演进，随批次补入 `tools`）」—— 它记的是**演进清单的销项**，而 L1002 列头写死「**as-built `tools`**」，两者是文档自己划分的两种语义。销项 ≠ as-built 翻牌。
  2. 划线后**同节上表仍断言 `[]`**，且 L1012 注解仍说"空 `tools` = EXTENSION POINT…随 M1–M4 落地时补入"——**同一节内自我矛盾**（下句说已兑现，上表说没有、注解说还没到）。文档对 `AgentPersona.tools` 的 as-built 陈述现在是**假的**。
  3. 横向先例证明该行归各批自己翻：`git blame` 显示 delivery 行（L1008）/ reach 行（L1007）/ match 行（L1006）分别由 M3-B / M3-A / M2-A 各自批次翻过，且都是**上表翻 + 下句划线两处一起做**。M4 只做了一半。
- **另一假说**：`agent-architecture.md` L34 已写「insight 人格 tools 由空数组填为三件」→ 同 issue-1 ④，该文件属并列的独立 acceptance 项（已 PASS），不能顶 architecture.md 项。

**⑤ 行号章节号核对**：`§8.6 多 Agent 编队名册` @ L998，insight 行 @ L1009 —— 原 verdict 标注**完全准确**。

**判定：UPHELD。**

---

## issue-3 — §7.2.1 三表 + 一枚举 + 迁移计数整条未更新 → **UPHELD（维持 FAIL）**

**① acceptance**：显式命名 `§7.2.1 三表+一枚举计数`。

**② 文档 vs 实物（逐项实测，全部命令本次独立重跑）：**

| 项 | 文档（§7.2.1，L671-726） | 实测实物 | 差 |
|---|---|---|---|
| 迁移条数 | L678「迁移（`prisma/migrations/`，**8 条**）」，清单止于 `20260723235106_m3b_delivery_four_tables` | `ls -d prisma/migrations/*/ \| wc -l` = **9**（`20260724183013_m4_insight_three_tables` 在场） | 缺 1 |
| 枚举 | L684「**枚举（16 个，与实物逐字一致）**」，L686-703 代码块**无 `ShareLinkScope`** | `grep -c '^enum ' prisma/schema.prisma` = **17**；`ShareLinkScope` @ `schema.prisma:634` | 缺 1 |
| 模型 | L705「**模型清单（21 个）**」，L707-726 表内**无 MetricSnapshot / WeeklyReport / ShareLink** | `grep -c '^model ' prisma/schema.prisma` = **24**；三模型 @ L644 / L668 / L694 | 缺 3 |

**③ 证伪尝试（逐一失败）：**

| 证伪假说 | 核对结果 |
|---|---|
| commit message 自称"§7.2.1 计数 21→24 表"，也许确实改了 | `git show f6a631b -- docs/dev/architecture.md` 全量 diff 逐 hunk 核对：涉及 21→24 的改动只有 **@@ -399（§5 章首校准句）** 与 **@@ -664（§7.1 建表节奏句）** 两处，**§7.2.1 区间（L671-726）零 hunk**。commit message 的章节号自述与实际改动位置不符 → 假说被 diff 直接推翻 |
| 也许 §7.2.1 声明了"本节只记结构不记计数"，计数陈旧属可接受 | 相反：L673-676 自带纪律「schema 的唯一权威是实物…**任何其他章节的字段描述与实物冲突时，以实物为准并即刻修订本文（R13）**」，且 L674-675 明文记载本节历史上因"3 枚举 vs 实物 10、8 模型 vs 实物 17"漂移被返工。本节是**计数权威节** → 不成立 |
| 文档说「8 条」也许不含 `migration_lock.toml` 以外别的计法 | 迁移目录实为 9 个目录 + 1 个 lock 文件；无论怎么算都不等于 8 → 不成立 |
| 也许 M4 三表不该登记（on-read 装配、表为 M5 预留） | 三表已 `CREATE` 进 schema 与迁移（本批 F001），§7.2.1 是 **as-built schema 快照**，登记依据是"表存在"而非"表被用满" → 不成立。且 §5.2 已把三表标 `✅ M4 F001` |

**④ 加重事实（独立复核确认）**：`f6a631b` 把**引用方**改成 24（L402 / L667），却没改**被引用的权威节**（§7.2.1 仍写 21）——文档现在自述"§7.2.1 为实装权威"，而那个权威节说的是 21。这是**由本批改动亲手制造的**内部矛盾，非历史遗留。

**⑤ 行号核对**：原 verdict 写「§7.2.1（L677-706）」，实际权威节范围 L671-726（模型表延伸到 L726）。**范围写窄了约 20 行**，属描述不精确，三项事实（8/16/21 vs 9/17/24）**逐项复测全部属实**，不影响结论。

**判定：UPHELD。**

---

## issue-4 — 批末新鲜度复核漏 4 处陈旧标记 → **UPHELD（维持 FAIL）**

**① acceptance**：`批末新鲜度复核（grep 陈旧计数/未实装残留/`**`演进 M4 标记翻牌`**`，含 outbound 白名单第 6 工具兑现）` —— 「演进 M4 标记翻牌」是 acceptance 字面要求，a/b/c 三处文本里就写着「演进 M4」「归 M4」。

**② 四处逐条复测：**

| # | 位置 | 现文（本次 `sed` 直读） | 实物 | 判定 |
|---|---|---|---|---|
| a | L254 顶层架构图 OPS 节 | `ops/（部分实装）：… partner(escrow/keys) mock ✅ M3-B F004；**share 演进 M4**` | `src/lib/ops/share/` 实存 `index.ts` + `mock-share-link.ts` + `types.ts`（M4 F007 已 mock 实装），同文档 §9.8（L1307）已翻「share 接口 + mock ✅ M4 F007」 | 陈旧属实 |
| b | L372 源码目录树 ops/ 节 | `… partner/（M3-B F004…）；**share 归 M4**` | 同上 | 陈旧属实 |
| c | L529 §5.4 节标题 | `…**roi/attribution 仍为演进目标归 M4**）` | `src/lib/domain/roi-compute.ts`（7/24 11:49）+ `attribution-gaps.ts`（7/24 11:42）实存；**同节表格 L538/L539 已由本批翻成 `✅ M4 F002/F003`** | 陈旧属实，且标题与本节表格直接互斥 |
| d | L640 §6.7 mock 契约存续范围 | `**存续范围**：五环节语法面（env-\*）、creators/knowledge/**insight**/runs 页仍走 mock 契约层` | `ls src/lib/data/mock/` 实存仅 `env-brief.ts` + `runs.ts` + `index.ts`；`mock/index.ts` 已由本批把 `env-insight.ts`（M4 F009）与 `insight.ts`（M4 F010）双双标「已退役」 | 陈旧属实（insight 部分由**本批**造成） |

**③ 证伪尝试（逐一失败）：**

| 证伪假说 | 核对结果 |
|---|---|
| a/b 的「演进 M4 / 归 M4」也许是指"M4 之后"或本就等待 M5，标注仍属实 | `git show 011d963`（M3-B F012 fixing round1）逐字确认：上一批把 `escrow/keys/share 演进 M3-B+` 改为 `partner(…) mock ✅ M3-B F004；`**`share 演进 M4`**，commit message 明写「share 保持未来态（**改标 M4**）」。即**上一批已把这两行的下一次翻牌责任显式指派给 M4**，M4 已交付（§14 L1771 自标 `✅ 已交付`）→ 标注为假，不成立。且 M3-B 当时的同一处漏翻，其 PARTIAL 亦经"对抗复核 UPHELD"（同 commit message 记载）——本次是同一坑第二次复发 |
| c 也许只是节标题的历史措辞，不算陈旧标记 | 该标题自带批次校准语（"M3-B 校准：…已实装"），是**逐批维护的 as-built 声明位**；且它与本批刚翻的 L538/L539 在同一节内直接打架 → 不成立 |
| d 也许 `env-*` 语法面整体仍走 mock，insight 二字可算在内 | `mock/index.ts` 由**本批 F009/F010** 亲手把 `env-insight.ts` / `insight.ts` 标为已退役；目录里也确实没有这两个文件。句中 `insight` 二字在本批结束的一刻即成假 → 不成立 |
| 四处也许都不属"本批责任"，是历史欠账 | a/b 责任由上一批显式指派给 M4；c/d 的失效**由本批 F002/F003/F007/F009/F010 亲手造成**；且 acceptance 单列「批末新鲜度复核」为交付项——复核本身没做到位即未达标 → 不成立 |
| 也许原 verdict 数错了（虚报处数） | `grep -n "演进 M4\|归 M4"` 实测命中 L254 / L372 / L529 三行，L640 由 mock 目录实测独立确认。**四处一处不虚** |

**④ 反向发现（原 verdict **少报**，非多报）：** `§8.10 主动式 Agent` 标题（L1073）仍写「nightly-screen 已实装，**其余 3 条随 M3-M4 表落地**」，且例程清单 L1093 `weekly-draft` 行**无 ✅ as-built 注**（同表 nightly-screen / health-scan / kol-sync 三行均有）。实物 `src/lib/jobs/scheduler.ts` `ROUTINES` 已注册 4 条（health-scan / nightly-screen / kol-sync / **weekly-draft**，后者 `src/lib/jobs/routines/weekly-draft.ts` 注释「M4-INSIGHT F011」），未实装仅剩 signal-sync / delivery-watch 两条。F011 的 acceptance **不含**该文档行，故它落在 F012「批末新鲜度复核（未实装残留）」名下。→ 这是**第 5 处漏翻**，方向上加重而非减轻 issue-4，登记为 ADVISORY-1（不追加为新 FAIL 条目，因原 verdict 的 4 条已足以支撑 PARTIAL，且新增条目属扩大验收范围，留给 fixing 一并 grep 收口）。

**判定：UPHELD。**

---

## 对 F012 整体判定的复核意见

**PARTIAL 维持。改判无事实基础。**

理由（按"只有事实认定错误才能推翻"的口径逐层收敛）：

1. **4 条 FAIL 的事实基础 4/4 成立**，无一条被证伪。issue-1/2/3 三项在 `features.json` F012 acceptance 中**逐字显式命名**（"工具表 compute_roi·draft_report·create_share_link" / "insight 人格 tools" / "§7.2.1 三表+一枚举计数"），issue-4 命中 acceptance 字面子句"演进 M4 标记翻牌"。**不是评估者加码，是 acceptance 自己写的**。
2. **实现 commit 的自述与实际 diff 不符**：`f6a631b` commit message 称已做"§7.2.1 计数 21→24 表"，全量 diff 显示 §7.2.1 区间零改动（改的是 §5 章首与 §7.1 两处**引用方**）。原 verdict 未采信 commit message 而回到 diff 取证，**方法正确**。
3. **无环境误报可能**：4 条全为静态文本比对，`testing-env-patterns.md` 五类已知误报形态无一可套用；复核在干净工作树、与验收同版本文档上重跑，结果一致。
4. **不予降级**：本次复核明确**拒绝**"仅文档、影响小"式降级理由。文档现状已产生三组**可被下游读者读错的自我矛盾**——§5.4 标题 vs 同节表行、§8.6 上表 `[]` vs 下句"已兑现"、§7.1「as-built 已 24 表」vs §7.2.1「模型清单（21 个）」；其中 §8.6 与 §7.2.1 是**被其他章节指名的口径权威位**（"§7.2.1 为实装权威"、列头"as-built `tools`"），错误陈述会直接误导后续批次的实现与验收。判据 = `.auto-memory/role-context/evaluator.md`「文档新鲜度 clause：已实装却仍标未实装 = 批内反向漂移，判 PARTIAL」，与 M3-B F012 同类先例（同文档 L254/L372，首轮 PARTIAL → 对抗复核 UPHELD → fixing round1 `011d963` 修复）**处置一致，无双标**。
5. **产品侧结论同样维持**：本次复核未发现原 verdict 在 PASS 侧有放水（e2e 闭环、零真实公开暴露的结构性核证、四件套绿均有独立可复现证据），FAIL 全部落在文档层——即 PARTIAL 的性质是"**功能达标、文档交付未达标**"，与原 verdict 表述一致。

**建议**：进入 `fixing`，按原 verdict §6 修复清单一次文档 commit 收口，并把 ADVISORY-1（§8.10 标题 + weekly-draft 行）一并纳入 grep 复核；复验只需 lint/tsc/test:unit 复绿 + grep 零命中，**不需重跑 insight:e2e**（e2e 侧本次复核确认无争议）。

---

## 瑕疵登记（不影响任何判定，供文档质量存档）

| # | 内容 | 影响 |
|---|---|---|
| 瑕疵-1 | 原 verdict issue-1 把「已实装工具」表标为 **§9.2**，实为 **§8.2**（§9.2 = 拦截点/`execute.ts`） | 无。行号 L890/L909/L987 准确，指向唯一 |
| 瑕疵-2 | 原 verdict 第 14 项（PASS）把"分享 harm"标为 L1119，实际改动行在 §9.5 确认卡 harm 三要素表（`f6a631b` diff @@ -1270 一带） | 无。翻牌事实经 diff 独立确认成立，PASS 不变 |
| 瑕疵-3 | 原 verdict issue-3 把 §7.2.1 范围写作 L677-706，实为 L671-726 | 无。三项计数事实逐项复测属实 |
| ADVISORY-1 | 原 verdict **漏报**第 5 处陈旧标记（§8.10 L1073 标题「其余 3 条随 M3-M4 落地」+ L1093 `weekly-draft` 行无 ✅ 注，而 `ROUTINES` 已注册 weekly-draft/M4 F011） | 加重 issue-4，方向与 PARTIAL 一致；建议 fixing 顺手收口 |

**本次复核零文件改动**（除本报告）：未触碰产品代码、文档基线、状态机文件；`git status --short` 除本文件外为空。

---

*署名：Andy/evaluator-subagent（对抗复核，隔离上下文，独立取证）· 2026-07-24*
*复核结论：4 FAIL 全部 UPHELD，F012 = PARTIAL 维持。本报告原样落盘，任何人不得改写判定。*
