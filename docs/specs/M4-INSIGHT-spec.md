# M4-INSIGHT 批次规格（洞察域：ROI 对账 + 证据缺口 + 周报 + 对外分享）

> 状态：draft → 用户 spec lock（2026-07-24 已确认 U1/U2/U3）后生效
> 上游：architecture.md §5.2 insight 行（`MetricSnapshot`/`WeeklyReport`/`ShareLink` 字段级）/ §5.4 `roi.compute`·`attribution.gaps` / §14 M4 行 / §9.3.1 对外分享 harm / §10.3 ops 适配器 · UI `ARCH-M05-ui-inventory.md` V8（项目级对照账本 19 元素）· V12（跨项目洞察 14 元素）· PRD FR-8.x 洞察 / 裁决 #3（分享 scope project/quarterly）
> 前置：M3-B-DELIVERY done ✅（→insight 守卫 F010 已真判；`Payout(released)` / `Quote(committed)` 已在库 = spend 真源）
> 下游：M5（真实平台/partner 回传 → reach/conversions 真值；真实公开分享页/CDN）

## 1. 背景与目标

M3-B 后，五环节前四域（brief/match/reach/delivery）已立真，`→insight` 守卫已真判（M3-B F010）。但**洞察域（Insight）仍是纯 mock**——V8 项目级对照账本（`mock/env-insight.ts` 169 行）与 V12 跨项目洞察页（`mock/insight.ts` 155 行）全走契约层 mock，`MetricSnapshot`/`WeeklyReport`/`ShareLink` 三表未建，`roi.compute`/`attribution.gaps` 两纯函数与 `compute_roi`/`draft_report`/`create_share_link` 三工具（insight 人格 tools 当前为空 `[]`）均未实装。

本批把洞察域立成真：**三表落库 + roi.compute/attribution.gaps 两纯函数（三处复用）+ compute_roi/draft_report/create_share_link 三工具 + V8/V12 两面接真（两 mock 退役）+ weekly-draft 例程**。

**诚实边界不变（architecture §1 / D2）**：真实 reach/conversions 回传源属平台/partner 入站，归 M5；本批 ROI 分子缺口由 `attribution.gaps` **如实标注、不强行归因**——这正是 insight 域「证据缺口诚实」的设计本意，而非缺陷。

## 2. 用户裁决记录（2026-07-24 实答）

| # | 裁决 | 内容 |
|---|---|---|
| U1 | ROI 数据源 | **spend 真源 + 缺口诚实标注**：spend 取库内真值（`Payout(released)` 优先，无则 `Quote(committed)` 承诺额），reach/conversions 无源 → `attribution.gaps` 如实列证据缺口、ROI 显「证据不足」，绝不填 0 或猜 ROI。真实曝光/转化回传留 M5 |
| U2 | 对外分享 | **接口先行 + mock**（沿 M3-B `ops/partner` 同款范式）：`ShareLink` 表 + `create_share_link` outbound 过闸门 + mock `ShareLinkService`（生成 payloadRef + token，零公开暴露）；真实公开分享页/CDN 留 M5 |
| U3 | 批次边界 | **全量一批**（12 features）：三表 + 两纯函数 + 三工具 + V8/V12 接真 + weekly-draft 例程 + 文档翻牌 |

## 3. Planner 决策（P 系）

| # | 决策 | 理由 |
|---|---|---|
| P1 | **ROI 诚实降级铁律**（U1）：spend 取真源（released payout 优先，无则 committed quote；仅 USD 计入，非 USD 不换汇→「待核」，沿 M3-A budgetUsd 口径）；reach/conversions 缺 → MetricSnapshot 该列 null、`roi.compute` 返 `roi=null` + `basis='insufficient_evidence'`；**绝不填 0 / 不猜 ROI** | architecture §5.4「不强行归因」+ D2 诚实降级；对照 M3-B P1（连测试目标都不设）——洞察侧同理：宁可显「证据不足」不造假 ROI |
| P2 | **三处复用铁律**：`roi.compute` / `attribution.gaps` 纯函数（domain 层，`ctx` 传入无 DB 读）被 ① V8/V12 页面 ② `compute_roi` 工具 ③ `weekly-draft` 例程复用——单一真相源 | 沿 deliveryCheck（M3-B F002）/ crmInfer（M3-A F005）先例 |
| P3 | **MetricSnapshot 装配口径**：装配服务按 projectId 聚合 spend（`Payout(released).amount` 之和；无 released 则回落 `Quote(committed).amount` 之和，`spendSource` 列标 `payout`/`quote`/`none`），reach/conversions 恒 null（M5），roi 恒 null（分子缺）。快照可经例程物化或 on-read 组装——本批 on-read 装配壳为主（沿 M3-B `lib/delivery/check.ts` 先例），MetricSnapshot 表为 M5 快照持久化预留（本批建表 + 装配壳写入口最小实装） | spend 是唯一真源；持久化快照的价值在 M5 有真分子后才显，本批建表不焊死取数方式 |
| P4 | **对外分享接口先行 + mock**（U2）：`ops/share/` = `ShareLinkService` 接口 + mock 实现（沿 `ops/partner` 范式：接口 + mock + env 选择器 + 可观测标记 `SHARE_CREATED_MARKER`）；`create_share_link` 是 outbound 白名单**第 6 个工具**；harm 三要素 = 可见范围（scope）/ 有效期（expiresAt）/「链接一经生成即暴露」红标（architecture §9.3.1）；token 明文仅生成响应出现一次、DB 只存 `tokenHash`（ADR-25 先例）；prod 无真实现**不 fail-fast**（同 partner，本批无真实现），配非 mock provider 明示拒绝 | U2 + ADR-17；对照 M3-B F004 差异理由写文件头 |
| P5 | **采纳 = internal / 分享 = outbound**：V8「采纳结论」、V12「采纳为周报」= internal（D16 选了即生效、无 PendingAction、无弹窗 → Toast）；「生成对外分享报告」= outbound 过闸门 | DP：internal/outbound 二分；采纳只改本系统内 WeeklyReport.adopted，分享是对外不可逆动作 |
| P6 | **draft_report = LLM 长文**：`draft_report` 工具经 aigcgateway chat 起草周报草案（NFR-P8 模型路由：长文用大模型），落 `WeeklyReport(draftContent, adopted=false)`；`weekly-draft` 例程每周调同一起草服务 | architecture §8「长文周报→大模型」+ §11 例程 `weekly-draft` |
| P7 | **V8/V12 UI 零结构变更**（ui-fidelity）：V8 19 元素 / V12 14 元素逐处保持 + 反向 guardrail（V8 三值三样式差异表不得压二态、证据缺口卡诚实边界、badge 文字型非数字；V12 ROI 绿/琥珀二色非红、花费 KPI 无 delta），只换数据源 mock→真值；空态诚实（无数据→占位文案，绝不填 0/编造） | ui-fidelity-guardrail §2；沿 M3-B F009 V7 接真口径 |
| P8 | **新 API rate-limit**：`/api/insight/*`（分享发起等）30 req/min/IP 进程内限流 fail-open（复用 `lib/http/rate-limit.ts` + escape hatch `DISABLE_GATE_RATELIMIT`） | 与 M3-A/M3-B mutation 端点同类，维度与兜底一致 |
| P9 | **→insight 守卫本批不碰**：M3-B F010 已真判（`allDealsSettled`/零 Deal 放行）。本批是 insight 域的**消费方**，不改守卫 | 避免重复实装；守卫真相已在 env-guards.ts |
| P10 | **WeeklyReport 双态承载**：`projectId` nullable——null = 跨项目周报（V12「采纳为周报」），非空 = 项目级复盘（V8「采纳结论」）；`period` 存周期串（如 `2026-W30`），`draftContent` 存 LLM 草案 | architecture WeeklyReport 定义 tenantId·period；V8/V12 两处采纳共用一表，projectId 区分 scope |

## 4. 数据模型（architecture §5.2 :475-477 字段级 + expand-contract 迁移）

新表三张（tenantId 全带，命名沿 M3-A/M3-B 先例）：

- **MetricSnapshot**（ROI 底表）：`id cuid` · `tenantId` · `projectId` · `date DateTime`（快照时刻/日）· `spend Decimal(14,2)?`（真源聚合，可空——无 payout/quote 时 null）· `currency String?` · `spendSource String?`（`payout`/`quote`/`none` 口径标注）· `reach Int?`（M5 回传，本批恒 null）· `conversions Int?`（M5，恒 null）· `roi Float?`（分子缺 → 恒 null，M5 有真分子后填）· `createdAt` · `@@index([tenantId])` · `@@index([projectId, date])`
- **WeeklyReport**：`id cuid` · `tenantId` · `projectId String?`（null=跨项目周报 V12 / 非空=项目复盘 V8，P10）· `period String`（如 `2026-W30`）· `draftContent String`（LLM 草案长文）· `adopted Boolean @default(false)` · `adoptedAt DateTime?` · `generatedBy String @default("insight")` · `createdAt` · `updatedAt` · `@@index([tenantId])` · `@@index([projectId])`
- **ShareLink**：`id cuid` · `tenantId` · `projectId String?`（scope=project 时非空；quarterly 跨项目可空）· `scope ShareLinkScope`（enum：`project` / `quarterly`）· `payloadRef String`（被分享内容引用，不存明文快照）· `tokenHash String?`（访问 token hash，明文不落库 ADR-25）· `expiresAt DateTime?` · `revokedAt DateTime?` · `gateLogId String?`（→ PendingAction.id 软引用；生成经闸门必非空）· `createdAt` · `@@index([tenantId])` · `@@index([projectId])`

枚举一枚：**ShareLinkScope**（`project` / `quarterly`，裁决 #3 两 scope）。

既有表变更：**无**（本批 expand-only：只加三表 + 一枚举，既有 21 表/16 枚举零改动）。

**RLS（database-patterns §8）**：单租户 dev 不建 RLS policy（AGENT-FOUNDATION D4 既定，全部既有 21 表同口径），M5 真实认证时统一补。本批三表沿同一口径，spec 此处显式记录该例外理由。

## 5. 功能列表（features.json 同步）

| id | 标题 | executor | 要点 |
|---|---|---|---|
| F001 | 迁移：MetricSnapshot/WeeklyReport/ShareLink 三表 + ShareLinkScope 枚举 | generator | §4 全量；expand-only；migration 含单向回滚说明；tsc + 既有测试不破 |
| F002 | `roi.compute` 纯函数（domain）+ D20 变异 | generator | P1/P2：输入 spend + 目标（targetExposure/actualExposure）→ ROI + 目标差异 + 达成方向（up/down/flat 三值，供 V8 三值三样式）；分子缺 → roi=null + `insufficient_evidence`，绝不填 0；纯函数无 DB；三处复用注释 |
| F003 | `attribution.gaps` 纯函数（domain）+ D20 变异 | generator | P1/P2：输入快照 + 回传完整性 → 证据缺口清单（reach 缺/conversions 缺/spend 仅承诺额等，逐条可分支）；不强行归因；D20 变异（缺口被吞 / 强行算 ROI → 翻红） |
| F004 | MetricSnapshot 装配服务（spend 真源聚合） | generator | P3：按 projectId 聚合 `Payout(released).amount`（无则 `Quote(committed).amount`）+ spendSource 标注；reach/conversions/roi 恒 null；on-read 装配壳（沿 delivery/check.ts）+ 表写入口最小实装 |
| F005 | `compute_roi` 内部工具（insight 人格） | generator | P2：class=internal 无 buildHarm；复用 roi.compute + attribution.gaps（不内联重算，grep 证）；输出可序列化供画布；输入契约单测；挂 insight 人格（registry tools 当前空数组，本条填充） |
| F006 | `draft_report` 内部工具 + WeeklyReport 落库 | generator | P6：class=internal；gateway chat 起草周报草案（长文大模型路由；无凭据降级固定草案明示）→ WeeklyReport(draftContent, adopted=false)；采纳 = 独立 internal 动作置 adopted=true + adoptedAt（P5） |
| F007 | ops/share 适配器（ShareLinkService 接口 + mock） | generator | P4：接口 + mock（SHARE_CREATED_MARKER 观测标记）；env 选择器沿 ops/partner（恒 mock，prod 不 fail-fast，配非 mock 明示拒）；单测覆盖契约 + 零外呼断言 |
| F008 | `create_share_link` outbound 工具 + 闸门 | generator | P4：class=outbound（白名单第 6）；async buildHarm 三要素（可见范围 scope / 有效期 / 「链接一经生成即暴露」红标）；执行 = 消费票 → mock ShareLinkService → ShareLink 落库（gateLogId 非空 + tokenHash，明文token仅响应现一次）+ irrev 留痕同事务；幂等键 = PendingAction.id；scope project/quarterly |
| F009 | V8 项目级对照账本接真（env-insight mock 退役）+ 分享闸门真链 | generator | P5/P7：数据源切真（RSC 装配，roi.compute/attribution.gaps 真值）；env-insight.ts 退役；V8 19 元素逐处保持（三值三样式差异表 / 证据缺口卡 / 渠道 BarChart / 受众 donut+中心叠加 / retro 卡 / 采纳 internal / 🚪 分享红 gate scope=project）；反向 guardrail；空态诚实；视觉基线重生（§4.5 序）+ 两视口 |
| F010 | V12 跨项目洞察页接真（insight mock 退役）+ 周报采纳 + 分享闸门真链 | generator | P5/P7：数据源切真（跨项目 ROI 聚合 + WeeklyReport）；insight.ts 退役；V12 14 元素逐处保持（KPI×4 花费无delta / ROI 走势 LineArea / 各项目 ROI badge 文字型 / 表 5 列 ROI 绿·琥珀二色 / retro 周报卡 / 采纳为周报 internal / 🚪 分享红 gate scope=quarterly）；反向 guardrail；视觉基线重生 |
| F011 | `weekly-draft` 例程（scheduler 注册表化） | generator | P6：每周汇总跨项目数据 → 调 draft_report 服务起草周报草案落库；沿 M2-A nightly-screen / M1-C health-scan 例程注册范式；`npm run routine:weekly-draft` |
| F012 | E2E 闭环 + 文档翻牌 + 批末新鲜度复核 | generator | `insight:e2e`（度量装配 → compute_roi → draft_report → 采纳 → create_share_link 无令牌 pending → confirm+execute → ShareLink 落库 + irrev；零真实公开暴露断言）；architecture 翻牌（§5.2 insight 行/§5.4 roi·attribution 行/§14 M4 行/工具表/insight 人格 tools/§7.2.1 三表+一枚举/§9.3.1/§10.3 ops/share）+ ui-inventory V8/V12 登记 + agent-architecture 同步 + 批末新鲜度复核（grep 陈旧计数/未实装残留/演进 M4 标记翻牌）；lint+tsc+test:unit+test:visual 绿 |

全部 `executor:generator` → 普通批次，status=building。

## 6. F009/F010 UI 自审四段（ui-fidelity-guardrail §2）

- **§2.1 原型**：`docs/product/interaction-prototype-v2.html` V8（L806-817）/ V12（L864-879）；现行实装 `src/components/envs/insight/index.tsx`（V8 19 元素已建）+ `src/app/admin/insight/page.tsx`（V12 14 元素已建）——本批只换数据源与分享闸门链，不重建结构
- **§2.2 必用件**：`DataTable`（V8 对照表 4 列 / V12 表 5 列）· `GateConfirm`（分享确认卡）· ApexCharts（V8 渠道 BarChart + 受众 donut / V12 ROI LineArea + 各项目 BarChart）· `useToast`（采纳 internal）
- **§2.3 不得简化**：V8 —— 差异列**三值三样式**（绿 up / 红 down / 中性）不得压二态 · 证据缺口卡 gaprow ×N（诚实归因边界，attribution.gaps 真值）· 受众 donut 中心叠加读数 · badge 文字型不得改数字 · 🔒 底部宣示。V12 —— 花费 KPI 无 delta 形态保留 · ROI **绿/琥珀二色非红** · 各项目 ROI badge 文字型「XX 领先」非 % · 采纳 internal 无弹窗。**反向 guardrail：不得新增 KPI/图表/推荐卡等原型外区块。** 分享入口走既有 🚪 gate（不新增按钮结构）
- **§2.4 视觉基线**：`?env=insight`（V8）+ `/admin/insight`（V12）相关基线对账重生（web-runtime-patterns §4.5 重生序：kill :3000 → build → 伪造网关 env → `--update-snapshots=all` → 三连稳）；接真后基线态 = 夹具项目空态/证据缺口态（沿 M3-B F009 口径，空态文案硬断言防静默空白）

## 7. 数据准备步骤（Evaluator 验收前提）

- spend 真源：验收需 ≥1 `Payout(released)` 或 `Quote(committed)`（可经 M3-B payout 闸门链造，或夹具直插；集成测夹具租户 `test-tenant-m4-*` 按 pid 隔离，沿先例）
- **reach/conversions 恒无源**（M5）：验收断言 ROI 显「证据不足」+ attribution.gaps 如实列缺口，**不得因此判 FAIL**（这是 P1 设计本意）
- **零真实公开暴露断言**：全批 mock ShareLinkService，验收报告须明示「本批未生成任何真实可公开访问的分享链接/未对外暴露」
- `insight:e2e` 默认 mock，无真实公开分享分支（P4）

## 8. 车道与编排（§6.5）

- **快车道**（单会话）；无 role_assignments
- **building**：F001→F002/F003/F004 强依赖串行起步；**F002/F003（纯函数，文件集不重叠）+ F007（ops/share 适配器）文件集互不重叠 → 可并行**；F005 依赖 F002+F003+F004；F006 依赖 F001；F008 依赖 F001+F007；F009 依赖 F002/3/4/5/8；F010 依赖 F004/6/8；F011 依赖 F006；F012 依赖全部
- **verifying**：12 features → fan-out（每 feature 隔离 evaluator + FAIL/PARTIAL 对抗复核，同 M3-B）
- **L2 授权**：`draft_report` / `weekly-draft` 走真网关 chat（周报长文，大模型路由）——building 期用固定草案降级（明示），verifying 期最小真用量（同 reach:e2e 口径，需用户授权）；**对外分享零真实暴露**（mock，P4）

## 9. M3-B 结转 soft-watch（本批顺手项）

| 来源 | 项 | 本批处置 |
|---|---|---|
| M3-A F003-low-1 | ResendEmailSender 超时非真 abort（SDK v6 不暴露 signal） | 仍无解（SDK 限制）；本批 ops/share 若走 fetch 则**必须** AbortController（partner 文件头规矩延续），不抄 resend race |
| M3-B（新增） | 视觉基线含相对时间标签在本地长寿命 DB 会自然翻红 | V12 洞察页若含相对时间/日期，基线夹具用固定时间或 mask（proposed-learnings 待确认项，本批 F009/F010 重生时留意） |

以上均为顺手项，**不构成 acceptance 阻断**；未改不判 FAIL（记入下批 soft-watch）。
