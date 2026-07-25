# M4-INSIGHT F012 验收 verdict — insight:e2e 闭环 + 文档翻牌 + 批末新鲜度复核

- **feature**：F012 `insight:e2e` 全链 + `architecture.md` / `ARCH-M05-ui-inventory.md` / `agent-architecture.md` 翻牌 + 批末新鲜度复核 + 四件套绿
- **验收者**：Andy/evaluator-subagent（隔离上下文，fan-out 单 feature 验收；自行从磁盘取证，未采信任何实现叙述）
- **日期**：2026-07-24（本机时钟 2026-07-25 UTC）
- **被验对象**：`scripts/test/insight-e2e.ts` · `package.json`（`insight:e2e`）· `docs/dev/architecture.md` · `docs/dev/agent-architecture.md` · `docs/specs/ARCH-M05-ui-inventory.md` · `CLAUDE.md` · `src/components/sidebar/index.tsx` + `src/lib/nav/badge-counts.ts`（注释级标记翻牌）；实现 commit `f6a631b`，验收 HEAD `90bd8ac`
- **结论：PARTIAL**（acceptance 拆 13 项：**9 PASS / 4 FAIL**。e2e 闭环与四件套无缺陷、无产品 Bug；**阻断项全部在「文档翻牌 / 新鲜度复核」**——3 个 acceptance 显式命名的翻牌点整条未做（§9.2 工具表三工具行 / §8.6 insight 人格 `tools` / §7.2.1 三表+一枚举+迁移计数），另有 4 处「演进 M4 / 未实装」陈旧标记未翻，构成批内反向漂移与文档自我矛盾）

> 判定依据 `.auto-memory/role-context/evaluator.md`「文档新鲜度 clause」：**已实装却仍标未实装 = 批内反向漂移，判 PARTIAL**。同类先例 = M3-B F012（同一文档 L254/L372 漏翻 2 处 → 首轮 PARTIAL → fixing round1 `011d963` 修复）；本次漏面更大且含显式命名项。

---

## 0. 环境与 L1/L2 边界

| 项 | 值 |
|---|---|
| dev DB | `newkolmatrix-dev-db` Up 3 days (healthy)；`prisma/migrations/` 实测 **9 条**（含 `20260724183013_m4_insight_three_tables`） |
| prisma client | 验收前 `npx prisma generate` 重生（exit 0，`testing-env-patterns` §3 防误报） |
| Node | v25.7.0（仓内无 `.nvmrc`） |
| 运行时 | `test:visual` 前 `lsof -ti :3000 \| xargs kill` → `port-free` → `npm run build`（exit 0）→ playwright 自起 standalone；**伪造网关凭据** `AIGCGATEWAY_BASE_URL=http://127.0.0.1:9` / `AIGCGATEWAY_API_KEY=fake-evaluator-f012`（web-runtime-patterns §4.5 序）；跑完端口释放 |
| L2 | **未执行（未获授权）**：`INSIGHT_E2E_REAL_LLM` 全程未设；脚本默认分支 `delete process.env.AIGCGATEWAY_{BASE_URL,API_KEY}` → `draft_report` 走降级固定草案，日志明示 `[insight/weekly-report] AIGCGATEWAY_* 未配置——降级固定草案（明示，不静默）`，**零外呼** |
| 零真实公开暴露 | 结构性成立：`src/lib/ops/share/` 仅 `types.ts` + `mock-share-link.ts` + `index.ts`，**无真实现、无 fetch/网络调用**；选择器 `SHARE_LINK_PROVIDER` 非 `mock` 一律抛错（不静默回落）；两次 e2e 跑后 dev 库 `ShareLink` 行数 **= 0**；`publicUrl` 恒 `null`；`payloadRef` 为 `share-payload:` 内部引用非公网 URL |
| 产品代码/文档基线 | 本次验收**零改动**（终态 `git status --short` 干净；`test-results/` 已在 `.gitignore`）。唯一新增 = 本 verdict |

---

## 1. acceptance 逐条核对

acceptance 原文（features.json F012）拆 13 项：

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | e2e：**度量装配（spend 真源）** | ✅ PASS | `npm run insight:e2e` 实跑：`✓ ① 装配 spendSource=payout（真源）` / `✓ ① 装配 spend=900.5（分整数累加）` / `✓ ① reach/conversions/roi 恒 null（M5 前无分子，不填 0）`（脚本 L113-121，夹具自建 `Payout(released)` 900.5 USD） |
| 2 | e2e：**compute_roi 分子缺显证据不足 + gaps** | ✅ PASS | `✓ ② compute_roi：roi=null + insufficient_evidence（诚实透传）` / `✓ ② gaps 非空（缺什么显什么）` / `✓ ② 输出 JSON 往返无损（供画布）`（L124-139，经 `executeTool` 真调而非直调服务） |
| 3 | e2e：**draft_report 起草** | ✅ PASS | `✓ ③ draft_report：草案落库（draftContent 非空 / adopted=false）` + `✓ ③ 无凭据降级固定草案（首行明示，不静默）`（L142-157；降级路径断言 `draft.degraded && startsWith('【降级草案】')`，非静默） |
| 4 | e2e：**采纳 internal** | ✅ PASS | `✓ ④ 采纳生效（internal）` + `✓ ④ 采纳不产生 PendingAction（P5 无闸门）`（L160-171：PA 计数前后相等，是"无闸门"的**否定式**证据而非仅正向断言） |
| 5 | e2e：**create_share_link 无令牌 → pending（副作用零发生断言）** | ✅ PASS | `✓ ⑤ 无令牌 → pending 信封（服务端强制停在确认前）` / `✓ ⑤ harm 含「一经生成即暴露」红标` / `✓ ⑤ 副作用零发生（无 ShareLink 行、无 SHARE_CREATED 标记）`（L173-196：ShareLink 行数**与** marker 日志计数双观测，二者均未变） |
| 6 | e2e：**confirm+execute → ShareLink 落库 + gateLogId + irrev 留痕齐** | ✅ PASS | `✓ ⑥ 执行成功（首次，非重入）` / `✓ ⑥ token 明文仅响应现一次`（len=64） / `✓ ⑥ ShareLink.gateLogId 非空（经闸门）`（`row.gateLogId === paId` 强等） / `✓ ⑥ DB 只存 tokenHash（sha256，明文不落库）`（脚本独立重算 sha256 比对） / `✓ ⑥ irrev 留痕在场（与业务写入同事务）` / `✓ ⑥ mock 分享恰好发生一次`（+1 精确，非 ≥1） |
| 7 | e2e：**零真实公开暴露断言（mock 观测标记，无真实分享分支）** | ✅ PASS | `✓ ⑦ mocked=true` / `✓ ⑦ publicUrl=null` / `✓ ⑦ payloadRef 为内部引用非公网 URL`；结构性核证见 §0（`ops/share` 无真实现、无网络调用、非 mock provider 抛错）——"无真实分享分支"**不是靠开关关着，而是分支不存在** |
| 8 | 文档：**architecture §5.2 insight 行 ✅** | ✅ PASS | L413 `| insight | ... | ✅ M4 |`，且补齐"分子缺显证据不足绝不填 0 / mock 零公开暴露、真分享页归 M5" |
| 9 | 文档：**architecture §5.4 roi·attribution 行 ✅** | ✅ PASS（表行） | L538/L539 两行翻 `✅ M4 F002/F003` 并登记实装路径 `domain/roi-compute.ts` / `domain/attribution-gaps.ts`、三处复用消费方、口径单点。⚠️ 同节**标题**未翻 → 见 §2 issue-4 |
| 10 | 文档：**architecture §14 M4 行 ✅** | ✅ PASS | L1771 翻 `✅ **已交付**（2026-07-24，M4-INSIGHT 批次）`，并明示"真 reach/conversions 回传源与真实公开分享页归 M5" |
| 11 | 文档：**工具表 compute_roi·draft_report·create_share_link** | ❌ **FAIL** | 见 §2 issue-1 |
| 12 | 文档：**insight 人格 tools** | ❌ **FAIL** | 见 §2 issue-2 |
| 13 | 文档：**§7.2.1 三表 + 一枚举计数** | ❌ **FAIL** | 见 §2 issue-3 |
| 14 | 文档：**§9.3.1 分享 harm** | ✅ PASS | L1119 翻牌为 as-built：`（✅ M4 F008 as-built：scope 数据范围行与 V8/V12 卡同口径；evidence 含红标 + 有效期绝对时刻，与 execute 同一算法）` |
| 15 | 文档：**§10.3 ops/share**（现行编号 §9.8） | ✅ PASS | §9.8 标题翻 `share 接口 + mock ✅ M4 F007——真实现全部归 M5`，并新增 `**M4 F007 as-built**` 段（marker / token 只现一次 / publicUrl 恒 null / 恒 mock 不 fail-fast 的差异理由 / 非 mock provider 明示拒绝）——与 `src/lib/ops/share/index.ts` 文件头逐条对得上 |
| 16 | 文档：**ui-inventory V8/V12 登记** | ✅ PASS | V8 标题 `— 19 元素（M4 F009 接真）` + 逐元素真值来源标注 + `**M4 F009 例外登记（19→19，元素数不变）**`（图卡 M5 占位、对照表指标轴重立、空态硬断言）；V12 同构 `— 14 元素（M4 F010 接真）` + `**M4 F010 例外登记（14→14）**`。元素数未被压缩，反向 guardrail 语句（三值三样式 / 二色非红 / badge 文字型 / 花费无 delta）全部保留 |
| 17 | 文档：**agent-architecture 同步** | ✅ PASS | L34 追加 `**M4-INSIGHT F005/F006/F008 扩容**` 段，三工具 class/行为/幂等键/零暴露逐条写明，并收尾"insight 人格 tools 由空数组填为三件"——与 `registry.ts:171` 实物一致 |
| 18 | 文档：**批末新鲜度复核**（陈旧计数 / 未实装残留 / 演进 M4 标记翻牌，含 **outbound 白名单第 6 工具兑现**） | ❌ **FAIL** | 白名单项 ✅（L909 `6 中 5 已实装` + `create_share_link ✅ M4 F008`，与 `OUTBOUND_TOOL_NAMES` 实物一致）；但复核**漏 4 处陈旧标记**（issue-4）且未捕获 issue-1/2/3 —— 复核本身即 acceptance 项，未达标 |
| 19 | **lint + tsc + test:unit + test:visual 绿** | ✅ PASS | `npm run lint` → `✔ No ESLint warnings or errors`（exit 0）· `npx tsc --noEmit` exit 0 · `npm run test:unit` → **81 文件 / 985 测全通过**（exit 0）· `test:visual` 见 §3（CI linux 权威 5/5 job 全绿；本地 darwin 2 例已知漂移，非本批回归） |

**计**：19 个细项中 15 PASS / 4 FAIL（按 acceptance 六大句归并 = 13 项中 9 PASS / 4 FAIL）。

---

## 2. FAIL 明细（全部为文档层，零产品缺陷）

### issue-1 ❌ §9.2「已实装工具」表未加 M4 三工具行（acceptance 显式命名项）

- **实物**：`src/lib/agent/tools/index.ts` `NATIVE_TOOLS` = **18 件**（含 L41-43 `draftReportTool` / `computeRoiTool` / `createShareLinkTool`）
- **文档**：`docs/dev/architecture.md` L890 起「**已实装工具（7 个，M2-C 校准）**」表共 15 件工具（14 行），**无 `compute_roi` / `draft_report` / `create_share_link` 任一行**
- **反向漂移证据**：同文档 L909 已写「`create_share_link`（✅ M4 F008）」、L987 已写「`compute_roi` ✅ 工具已建（M4 F005）」、`agent-architecture.md` L34 已写三工具 as-built——**唯独本表（工具口径主表）缺席，文档自我矛盾**
- **先例定位（本表确由各批 F012 维护）**：`git blame` L903/L904 = `feat(M3-B-DELIVERY-F012)`（M3-B 四工具行由其 F012 补入）；L890/L900-902 = M2-C fixing
- **复现**：`grep -n "compute_roi\|draft_report\|create_share_link" docs/dev/architecture.md | sed -n '1,20p'` → 命中行中无一条属 L890-907 区间
- **附带**：表头计数「7 个」自 M3-A/M3-B 起即陈旧（实为 15），修复时应一并校准为 18

### issue-2 ❌ §8.6 编队名册 as-built 表 insight 行 `tools` 仍为 `[]`（acceptance 显式命名项）

- **实物**：`src/lib/agent/registry.ts` L161-172 `insight` 人格 `tools: ['compute_roi', 'draft_report', 'create_share_link']`
- **文档**：`architecture.md` L1009 `| insight | 洞察 Agent | ⑤ Insight | `[]` | ...`，列头即「**as-built `tools`**」；紧随 L1012 注「空 `tools` = EXTENSION POINT」——文档现在断言 insight 无工具
- **反向漂移证据**：同节 L1014「目标态工具子集」已划线 `~~insight += compute_roi/draft_report/create_share_link⛔~~（✅ M4 F005/F006/F008 已兑现）`——**同一节内自我矛盾**（上表说空、下句说已兑现）
- **先例定位**：`git blame` → L1006 = `M2-A F009`、L1007 = `M3-A F010`、L1004/L1005/L1008 = `M3-B F012`（各批均在自己 F012/收尾 feature 翻自己那行）；L1009 仍是 `ARCH-M05 F001` 原始行 = **M4 未翻**
- **复现**：`sed -n '1009p' docs/dev/architecture.md` 与 `grep -n "tools: \['compute_roi'" src/lib/agent/registry.ts` 并列比对

### issue-3 ❌ §7.2.1「Prisma schema 权威（as-built 快照）」三表 + 一枚举 + 迁移条数整条未更新（acceptance 显式命名项）

| 项 | 文档（§7.2.1，L677-706） | 实物 | 差 |
|---|---|---|---|
| 迁移条数 | 「迁移（`prisma/migrations/`，**8 条**）」且清单止于 `20260723235106_m3b_delivery_four_tables` | `ls prisma/migrations` = **9 条**（`20260724183013_m4_insight_three_tables` 在场） | 缺 1 |
| 枚举 | 「**枚举（16 个，与实物逐字一致）**」，代码块内**无 `ShareLinkScope`** | `grep -c '^enum ' prisma/schema.prisma` = **17**（`ShareLinkScope` @ L634） | 缺 1 |
| 模型 | 「**模型清单（21 个）**」，表内**无 MetricSnapshot / WeeklyReport / ShareLink 任一行** | `grep -c '^model ' prisma/schema.prisma` = **24** | 缺 3 |

- **加重情节**：本节自带纪律「schema 的唯一权威是实物……任何其他章节的字段描述与实物冲突时，以实物为准并**即刻修订本文（R13）**」，且其 fix_round1 备注专门记载了此处历史上「持续漂移」被返工的教训（3 枚举 vs 实物 10、8 模型 vs 实物 17）；M3-A fixing round2 亦曾专修「§7.2.1 枚举计数笔误」。同一坑第三次踩。
- **注**：F012 只改了**引用性计数**两处（L402「24 个模型」、L667「as-built 已 24 表」），而**被引用的权威节本身**（§7.2.1）未动 —— 形成"目录说 24、权威节说 21"的内部矛盾。
- **复现**：`sed -n '677,706p' docs/dev/architecture.md`；`ls prisma/migrations | grep -c .`；`grep -c '^enum \|^model ' prisma/schema.prisma`
- **非本批锅的部分**：`docs/specs/M4-INSIGHT-spec.md` L49/L51、migration 头、`schema.prisma` L630 中的「既有 21 表/16 枚举」是**批前基线陈述**，语义正确，不需改。

### issue-4 ❌ 批末新鲜度复核漏 4 处「演进 M4 / 归 M4 / 仍走 mock」陈旧标记

| # | 位置 | 现文 | 实物 |
|---|---|---|---|
| a | `architecture.md` **L254**（顶层架构图 OPS 节） | `ops/（部分实装）：email ✅ M3-A F003；partner(escrow/keys) mock ✅ M3-B F004；**share 演进 M4**` | `src/lib/ops/share/` 已 mock 实装（F007） |
| b | `architecture.md` **L372**（源码目录树 ops/ 节） | `… partner/（M3-B F004 …）；**share 归 M4**` | 同上 |
| c | `architecture.md` **L529**（§5.4 节标题） | `… deliveryCheck + dealAdvance 已实装；**roi/attribution 仍为演进目标归 M4**）` | `domain/roi-compute.ts` / `domain/attribution-gaps.ts` 已实装（F002/F003），**同节表格 L538/L539 已翻 ✅**——标题与表格互相打脸 |
| d | `architecture.md` **L640**（§6.7 mock 契约存续范围） | `**存续范围**：五环节语法面（env-\*）、creators/knowledge/**insight**/runs 页仍走 mock 契约层` | `src/lib/data/mock/` 实存仅 `env-brief.ts` + `runs.ts`；`index.ts` 已登记 `env-insight.ts`（M4 F009）与 `insight.ts`（M4 F010）退役 |

- **a/b 是同一坑的完整复发**：M3-B F012 首轮 PARTIAL 的**唯一阻断**就是这两行（escrow/keys 版），fixing round1 `011d963` 修复时把 share 顺手改标为「M4」——即**上一批已把这两行的下一次翻牌责任明确交给 M4**，本批仍漏。
- c/d 属"演进标记翻牌 / 未实装残留"，命中同一 acceptance 子句。
- **复现**：`grep -n "演进 M4\|归 M4\|演进目标归 M4\|insight/runs 页仍走 mock" docs/dev/architecture.md`
- **非阻断保留项（不判问题，仅提示）**：L1838 `Q7 对外分享闸门粒度（M4）… 部分定` —— `harm.scope` 已实装但"有效期/撤销扩展位"确未定，标"部分定"仍属实；`registry.ts:80`「随 M1-M4 落地」为通用扩展点注释，不构成陈旧。历史批次 spec（`M2-A-MATCH-spec.md` L177 / `M2-B-CREATORS-spec.md` L269 的「洞察徽标恢复归 M4」）属冻结批次文档，不要求回填。

---

## 3. test:visual 判定依据（本地 2 例失败 = 已知环境漂移，非本批回归）

- **CI（linux，权威）** @ HEAD `90bd8ac`：`Lint / Typecheck / Unit + integration tests / Build / **Visual regression**` **5/5 success**（run 30147315907）。CI 视觉 job 走 `prisma migrate deploy` + `canonical-projects` + `visual-kols` 夹具后 `npm run build` → `npm run test:visual`，即"新库夹具态"拍摄，与 `-linux` 基线匹配。
- **本地（darwin）**：13 用例 **11 passed / 2 failed**：
  1. `today dashboard visual baseline` — 7287 px（比例 0.01）差异。逐像素读 diff 图：差异集中在 ①「Agent 今日完成」KPI 数字 ②「待接入 / N 分钟前」相对时间标签 ③ **Agent 活动流新增两行 `create_share_link` 留痕**（`SHARE_CREATED 已生成 … （mock 未外呼、未产生任何真实可公开访问的暴露；token 明文不入日志）` + `已确认并执行不可逆 outbound「create_share_link」`）。三者皆为**本机长寿命 dev 库的累积数据**，`.auto-memory/project-status.md`「关键技术坑」已登记为预期。
  2. `project env=match visual baseline` — 等待空态文案 `组合方案尚未生成……` 超时。本机库有真组合数据 → 空态占位不出现，同为已登记漂移。
- **检测器活性证明**：同一次运行中 `project env=insight`（V8）与 `insight page`（V12）两条 M4 新基线**通过**，`creators / knowledge / runs / brief / reach / delivery / campaigns / agent-canvas / creator-drawer` 9 条通过 —— 失败是数据态差异而非套件失效。

---

## 4. 独立执行记录（evaluator 实跑，非采信叙述）

| 动作 | 结果 |
|---|---|
| `npx prisma generate` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0，`✔ No ESLint warnings or errors` |
| `npm run test:unit` | exit 0，**81 files / 985 tests passed**（实现期 commit message 记 915，其后新增的 evaluator 探针使其增长，非异常） |
| `npm run build` | exit 0 |
| `npm run insight:e2e`（第 1 次） | exit 0，**22/22 ✓**，LLM 行显示"降级固定草案（零外呼）" |
| `npm run insight:e2e`（第 2 次，可重入实证） | exit 0，**22/22 ✓** —— 脚本可重复跑、不因残留夹具翻红 |
| `AIGCGATEWAY_*=伪造 npm run test:visual` | 11 passed / 2 failed（见 §3） |
| 库终态核证（两次 e2e 后） | `ShareLink = 0` · `MetricSnapshot = 0` · `WeeklyReport = 1`（M4 前既有 `projectId=null` 那条，e2e 未新增残留） · `create_share_link` 相关 `PendingAction = 0` · 夹具 KOL/项目残留 = 0 |

---

## 5. 观察项（不阻断，登记备查）

| # | 级别 | 内容 |
|---|---|---|
| O1 | low | **e2e 断言数实测 22，非 commit message / `project-status.md` 所称 23**（默认降级模式；真 LLM 模式为 21，`③ 降级明示`那条被条件跳过）。acceptance 未规定条数，不判缺陷；建议下批把口播数字改成脚本自报或直接删数字。 |
| O2 | soft-watch | **每跑一次 `insight:e2e`，dev 租户 `OperationLog` 净增 1 行**（`kind=auto`、`ref=null` 的 `SHARE_CREATED` mock 观测标记；实测 28 → 29）。`finally` 清理按 `ref in createdPA` 精确删，覆盖不到 `ref=null` 的 marker 行。这与 `OperationLog` append-only 语义（§7.2.1「只 INSERT，永不 UPDATE/DELETE」）**是一致的、不建议改成删日志**；但需知晓其后果：该行会出现在「今天」页 Agent 活动流，从而持续污染本机 `en-today-darwin` 基线（§3 已实证）。session_notes 中"夹具自清理"对 `ShareLink` 成立、对 marker 留痕不成立，如实记此差别。 |
| O3 | low | `§9.2` 表头「已实装工具（7 个，M2-C 校准）」计数自 M3-A 起陈旧（实 15，修 issue-1 后应为 18）；`§6.7` L640 的存续范围除 insight 外对 `creators`/`knowledge` 亦已陈旧（M2-B / M1-D 起），建议 fixing 时整句按 `src/lib/data/mock/index.ts` 实物重写而非只删 insight 二字。 |
| O4 | 记录 | F012 commit 触碰了两处**产品代码**（`src/components/sidebar/index.tsx` / `src/lib/nav/badge-counts.ts`）——逐字核对为**纯注释改动**（把"恢复归 M4"标记翻为"留下批产品裁决"），零行为变更、零逻辑分支变化，属 acceptance「演进 M4 标记翻牌」的合理落点，不判越界。 |

---

## 6. 结论与修复建议（供 fixing round）

**F012 = PARTIAL（阻断签收）。** e2e 闭环七环节 22 断言两次实跑全绿、零真实公开暴露四道核证成立（含"分支不存在"的结构性证明）、四件套在 CI linux 权威门 5/5 全绿——**产品侧零缺陷**。阻断项集中在 acceptance 后半句：3 个显式命名的翻牌点整条未做（§9.2 工具表 / §8.6 insight `tools` / §7.2.1 三表+一枚举+迁移计数），4 处「演进 M4 / 归 M4 / 仍走 mock」陈旧标记未翻，其中 L254/L372 是 M3-B F012 首轮 PARTIAL 的同一处、且上批修复时已把翻牌责任显式指派给 M4。文档现状存在三组自我矛盾（§5.4 标题 vs 表行、§8.6 上表 vs 下句、目录计数 24 vs 权威节 21），符合 role-context「批内反向漂移 → PARTIAL」的判据。

修复清单（纯文档，建议一次 fixing commit 收口；不需重跑 e2e，仅需 lint/tsc/test:unit 复绿 + 一次 grep 复核）：

1. `architecture.md` §9.2 表补三行（`compute_roi` internal/insight · `draft_report` internal/insight · `create_share_link` **outbound**/insight），表头计数 7 → 18；
2. `architecture.md` L1009 insight 行 `tools` 由 `[]` 改为 `[compute_roi, draft_report, create_share_link⛔]`（沿 delivery 行写法标批次来源）；
3. `architecture.md` §7.2.1：迁移 8 → 9 条 + 追加 `20260724183013_m4_insight_three_tables`；枚举 16 → 17 + 代码块补 `enum ShareLinkScope { project quarterly }`；模型清单 21 → 24 + 补 `MetricSnapshot` / `WeeklyReport` / `ShareLink` 三行（关键约束与索引照实物）；
4. 翻牌 L254 / L372（share → `mock ✅ M4 F007；真实现归 M5`）、L529（§5.4 标题去掉"roi/attribution 仍为演进目标归 M4"，改标已实装）、L640（存续范围按 `mock/index.ts` 实物重写为 `env-brief` + `runs` 两件）；
5. 复核 grep 应达零命中：`grep -n "演进 M4\|归 M4\|演进目标归 M4" docs/dev/architecture.md`、`grep -n "枚举（16\|模型清单（21\|迁移（\`prisma/migrations/\`，8 条" docs/dev/architecture.md`、`sed -n '1009p'` 不含 `[]`。

---

*署名：Andy/evaluator-subagent（隔离上下文验收；本 verdict 全文原样落盘，任何人不得改写判定）*
