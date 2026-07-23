# M3-A-REACH-CRM 批次规格（触达域：CRM 事件推断 + 真实邮件信道 + 闸门 7 态）

> 状态：draft → 用户 spec lock 后生效
> 上游：architecture.md §5.2/§5.5/§9.3.2/§9.8/§10.4/§14 M3 行 · PRD FR-8.2.3 / FR-10.x / §15.3 M3 E2E
> 下游批次：M3-B-DELIVERY（Deal/Deliverable/GameKey/Payout + deliveryCheck + payout 闸门 + V7 台账接真 + env-guards →delivery/→insight）

## 1. 背景与目标

M2 完成后，触达环节（Reach）是纯 mock：V6 收件箱 UI 已建但数据 100% mock、三处 D6 stub（confirmSend/confirmQuote）本地假流转、`send_outreach` 副作用是 SENT_MARKER 日志行、Kol 表无联系方式列、全仓无发信信道。本批把触达域立成真：**四表落库 + CRM 五态事件推断 + Resend 真实投递（复用旧项目已验证配置）+ 闸门升级两步票据 7 态 + V6 接真**。

## 2. 用户裁决记录（2026-07-23 实答）

| # | 裁决 | 内容 |
|---|---|---|
| U1 | 批次切分 | M3 拆 M3-A（REACH-CRM，本批）+ M3-B（DELIVERY，下批）——与 PRD P3/P4 双 spec 口径一致 |
| U2 | 发信信道 | **本批接真实投递商**：复用旧项目（tripplemay/kolmatrix）已接好的 Resend 配置。铁律 8 已核证（2026-07-23）：`/opt/apps/kolmatrix/.env` 的 `RESEND_API_KEY`（`re_` 真格式）+ `RESEND_WEBHOOK_SECRET` 在场，API 活性实测通过，发信域 **kolquest.com = verified**（ap-northeast-1） |
| U3 | 闸门升级 | 本批全量升级两步票据 + 7 态（§9.3.2）：expand-contract 迁移 + 原子条件 UPDATE（消 R15）+ reject 写真实 rejected 态（清 expiresAt 债）+ 前端 D6 stub 接通 /api 真链路 |
| U4 | CRM 人工覆盖（Q4） | **有限覆盖**：已发送/已回复/谈判中三态可人工覆盖（覆盖 = `Signal(type=manual_override)` 走同一推断管道 + 留痕）；**已确认不可人工标**——必须经 commit_quote 闸门 |

## 3. Planner 决策（P 系）

| # | 决策 | 理由 |
|---|---|---|
| P1 | **真实发送目标限定**：E2E/验收真实发信只发**自有测试邮箱**（环境变量 `OUTREACH_TEST_RECIPIENT`），不向任何真实 KOL 地址发信 | 库内 KOL 为采集数据，未经同意的真实触达=滥发；demo 阶段无商务授权。violate = 直接 FAIL |
| P2 | **email_reply 真入站不入本批**：Resend webhook 覆盖投递状态事件（delivered/bounced/complained/opened，旧项目同款），「已回复/谈判中」由 U4 有限人工覆盖承载；MX/IMAP 真入站收信归 M3-B 或独立批 | 旧项目 webhook 只处理出站状态（实物核证）；入站收信需 MX 域名改造，超出本批体量。有限覆盖恰好补位 |
| P3 | **联系方式 = `Kol.contactEmail` 列 + 抽屉人工录入口**（M2-B 裁定入口同款交互），不做自动采集 | 上游 apify 契约只有 hasBusinessEmail 布尔无明文邮箱（schemas.ts:34 实物核证）；采集邮箱涉隐私合规，人工录入是最小可用面 |
| P4 | **旧项目复用范围**：port `src/lib/email/resend.ts` 模式（30s abort + 一次冷重试 + dev 无 key mock 回落 + **prod 无 key fail-fast 拒发**）+ webhook 验签处理模式；落库对象改为本项目 OutreachMessage/Signal（旧 EmailLog/withTenant 多租户 RLS 不 port） | Research & Reuse：已验证实现优于重写；fail-fast 语义（旧 BIx P1-9 沉淀）必须保留 |
| P5 | **SENT_MARKER 测试地面真值保留**：`MockEmailSender`（EmailSender 接口的 mock 实现）继续写 SENT_MARKER 日志行；gate-smoke/D20 变异测试观测点不变。CI 与本地默认 mock（无 RESEND_API_KEY 即回落），真发仅 E2E 显式 env | 架构 :1393 既定（mock 是刻意的测试地面真值）；测试不依赖外部服务 |
| P6 | **幂等键 = PendingAction.id**：ResendEmailSender 发送携带 idempotency 语义（headers/Idempotency-Key 或应用层 providerMessageId 查重），执行事务失败重入不双发 | 架构 §9.8 :1504 + §9.6 :1366 明文 |
| P7 | **send_bulk_outreach 不入本批**：V6 是单人聚焦语法（FR-8.2.3.1），批量发信单张确认卡（FR-8.2.3.5）随 M3-B 或按需批实装 | 原型 V6 无批量入口（ui-inventory 24 元素核证）；先立单人真链路 |
| P8 | **budgetUsd 回填口径**：Quote 达 committed 时把金额回填至对应 PlanKol/展示层（M2-A P6 欠账的消解起点）；只回填不重算评分 | M2-A spec :219 记账给 M3 CRM；评分重算超范围 |
| P9 | **新 API 路由 rate-limit（v0.9.11 硬要求）**：`/api/signals/inbound` = Svix 验签（Resend webhook 标准）为主闸 + 20 req/min/IP 进程内限流，超限 429 fail-closed；`/api/actions/*` 四端点 = 30 req/min/IP 进程内限流 fail-open。无 Redis（栈内无此依赖），进程内 Map 实现，escape hatch `DISABLE_GATE_RATELIMIT=true` | 单租户 dev 无 auth 用户维度；webhook 安全敏感 fail-closed |
| P10 | **Q3 组织级二次确认不引入**（单租户 dev 无组织概念，记 M5）；defaulted 违约规则、post_published 平台信号、真入站收信均归 M3-B+ | 范围纪律 |

## 4. 数据模型（PRD :600 授权本批定字段级；迁移 expand-contract）

新表四张（tenantId 全带，命名沿 MatchPlan 先例）：

- **OutreachThread**：`id cuid` · `tenantId` · `projectId` · `kolId` · `status`（enum `ReachStatus`: `pending_send / sent / replied / negotiating / confirmed`，即架构 :491 五态）· `owner`（默认 `'reach'`）· `lastSignalAt?` · timestamps · `@@unique([projectId, kolId])`（一个创作者=一段关系=一个 thread，:467）
- **OutreachMessage**：`id` · `tenantId` · `threadId` · `direction`（enum: `draft / sent / inbound`）· `subject?` · `body` · `language?` · `gateLogId?`（=PendingAction.id，**sent 必非空**，:468）· `providerMessageId?` · `sentAt?` · `createdAt`
- **Quote**：`id` · `tenantId` · `threadId` · `amount Decimal(14,2)` · `currency` · `deliverablesJson` · `scope?` · `status`（enum: `proposed / committed / rejected`）· `gateLogId?`（committed 必非空）· timestamps
- **Signal**：`id` · `tenantId` · `type` · `source` · `externalId @unique`（防重，:470）· `kolId?` · `projectId?` · `threadId?` · `payloadJson` · `detectedAt` · `createdAt`

既有表变更：
- **PendingAction**：`status` 枚举扩 7 态 `pending / confirmed / executing / executed / failed / rejected / expired`（expand：加值不删值）；新列 `ticketHash?` · `ticketExpiresAt?` · `ticketUsedAt?` · `decidedAt?`
- **Kol**：新列 `contactEmail String?`（人工录入，来源在 fieldProvenance 标 `user_input`）

领域事件不建 EventStore（ADR-21）：`Signal` + `OperationLog` + 状态列承载。

## 5. 功能列表（features.json 同步）

| id | 标题 | 要点 |
|---|---|---|
| F001 | 迁移：四表 + PendingAction 7 态 + Kol.contactEmail | §4 全量；migration 单向可回滚说明；`tsc` + 现有 372+ 测试不破 |
| F002 | 闸门两步票据升级（§9.3.2 全量） | confirm=签票（票仅响应出现一次，DB 只存 hash）/ execute=消费票 / reject 写 rejected；两处原子条件 UPDATE 败者 409（消 R15）；四端点 `GET /api/actions/[id]` + `POST confirm / execute / reject`；HTTP 分码 403/404/409/410；P9 rate-limit；gate-smoke 升级（G1-G5 + 7 态断言 + D20 变异 + 并发双确认竞态用例）；ADR-25 不变量（令牌/票不出服务端进程）保持 |
| F003 | ops/EmailSender 层 + send_outreach 接真 | `ops/email/` 接口 + `ResendEmailSender`（P4 port + P6 幂等）+ `MockEmailSender`（P5 SENT_MARKER 转正）；env 选择器（无 key→mock，prod 无 key fail-fast）；`send_outreach.execute` 改为：发送 → `OutreachMessage(direction=sent, gateLogId, providerMessageId)` 落库 + thread status 推进事件；无 contactEmail → 明示拒绝不猜（P3） |
| F004 | signals 接入层 + Resend webhook | `signals/` normalize 管道 + `POST /api/signals/inbound`（Svix 验签 + P9 限流 + zod 校验 + externalId 防重）；delivered/bounced/complained/opened → `Signal(email_delivery_status)` → 触发 crmInfer 重算 → `OperationLog(kind:auto)` 留痕 |
| F005 | `crmInfer.status` 纯函数（domain 层） | 输入 thread 的 messages+signals+quotes → 五态推断；U4 有限覆盖：`manual_override` Signal 仅可断言 sent/replied/negotiating，confirmed 仅由 `quote.committed` 推出；D20 变异测试 + 单测覆盖全转换 |
| F006 | reach 工具扩容 | `draft_email` / `refine_email`（internal，gateway chat 起草/改写，NFR-I2 按 KOL 语言）+ `commit_quote`（outbound，buildHarm 3 行：金额/交付物/对象）；挂 reach 人格 tools；Quote proposed→committed 经闸门 + P8 budgetUsd 回填 |
| F007 | Kol.contactEmail 录入口 | CreatorDrawer 加人工录入（M2-B 裁定入口同款行内交互）+ PATCH API + fieldProvenance=user_input + zod email 校验 |
| F008 | V6 ConversationInbox 接真（mock 退役） | 数据源切真 thread/message/quote；五态 pill = crmInfer 真值；confirmSend/confirmQuote 两处 D6 stub 替换为真 pending→GET 详情→confirm→execute 链路；「确认报价」仅 `negotiating` 条件渲染（裁决 #6）保持；空态语义保留；env-reach mock 退役登记 |
| F009 | 人工覆盖入口（U4） | V6 界面覆盖控件（仅三态）→ `Signal(manual_override)` → 推断管道 → 留痕；「已确认」无覆盖入口（验收断言其不存在） |
| F010 | E2E 闭环 + 部署面 + 文档翻牌 | PRD 15.3 M3 E2E：起草→审阅→点确认才发送（403/pending 中间态断言）；真实投递 E2E 仅发 `OUTREACH_TEST_RECIPIENT`（P1，L2 授权 + 用量申报）；部署面：RESEND_API_KEY/RESEND_WEBHOOK_SECRET/OUTREACH_TEST_RECIPIENT 迁入 newkolmatrix VPS .env（幂等 append，M2-B 同款）+ Resend webhook 指向 newkol.guangai.ai；architecture.md as-built 翻牌（§5.2 表 / §9.3.2 / §10.4 / 工具表 / §14 M3-A 行）+ agent-architecture 同步 + 批末新鲜度复核 |

全部 `executor:generator`；混合批次判定 → status=building。

## 6. F008 UI 自审四段（ui-fidelity-guardrail §2）

- §2.1 原型：`docs/product/interaction-prototype-v2.html` L784-796（reach 渲染函数）；浏览器级参照
- §2.2 必用件：沿 ARCH-M05 F010 已建 `ConversationInbox` 结构改造，不重建；SurfaceCard/DataTable 等公共件不越过
- §2.3 不得简化：ui-inventory V6 **24 元素**逐处保持（三栏 280/1fr/240、ibrow×N 五态 pill、draft textarea + hint shield、「重写」ghost internal、「发送」红 gate、ring 84、语法差异宣示）；不得新增 KPI/图表类元素；F009 覆盖控件为**本批新增例外**，须在 ui-inventory 登记（V6 24→25）
- §2.4 视觉基线：接真后 `?env=reach` 相关基线逐处对账重生（§4.5 重生序：kill :3000 → build → 伪造网关 env 基线态 → 三连稳）；F009 控件属意图性变更必须对账

## 7. 数据准备步骤（Evaluator 验收前提）

- 本地 D-H 清态基础上：`OUTREACH_TEST_RECIPIENT` 配自有测试邮箱；验收创建的 thread/message/quote/signal 与测试项目须在验收后清态复原
- 白名单：VK-FULL（`vk-visual-full-0001`）可作 contactEmail 录入与发送对象载体（录入 `OUTREACH_TEST_RECIPIENT` 的值）；真实 KOL 行一律不得写 contactEmail（P1）
- webhook 验收：本地用 Svix 签名工具或旧项目 handler 测试样例回放；prod webhook 指向配置属部署面（F010）

## 8. 车道与编排（§6.5）

- **快车道**（单会话）；无 role_assignments
- building：F001→F002→F003 强依赖串行；F005（domain 纯函数）/F007（creators 面）可与 F002-F004 并行（文件集不重叠时按 orchestration §3 subagent+worktree，Generator 自判）；F008/F009 依赖 F002-F006 收尾
- verifying：10 features → fan-out（orchestration §4，M2-B/M2-C 同款：逐 feature 隔离 evaluator + FAIL/PARTIAL 对抗复核）
- L2 授权：真网关（draft_email 起草）+ 真投递（仅 P1 测试邮箱）最小用量，报告注明次数
