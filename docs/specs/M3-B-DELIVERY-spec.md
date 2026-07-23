# M3-B-DELIVERY 批次规格（交付域：条件台账 + 资金状态机 + payout/key 闸门）

> 状态：draft → 用户 spec lock 后生效
> 上游：architecture.md §5.2 :471-474（字段级）/ §5.3③ 资金生命周期 / §5.3① →delivery·→insight 守卫 / §5.4 deliveryCheck / §9.8 ops 适配器 / §14 M3-B 行 · PRD FR-8.2.4.1-4 / §15.3 M3 E2E（放款·分发 key 未确认前不可执行）
> 前置：M3-A-REACH-CRM done ✅（闸门两步票据 7 态 + commit_quote 已落 Quote committed——本批的 Deal 生成源）
> 下游：M4-INSIGHT（ROI/周报/对外分享 + →insight 消费）

## 1. 背景与目标

M3-A 后，触达域（Reach）已立真：报价经 `commit_quote` 闸门落 `Quote(status=committed)`。但**交付域（Delivery）仍是纯 mock**——V7 条件台账 5 行数据来自 `mock/env-delivery.ts`，放款是 D6 stub（`envs/delivery/index.tsx:76-78` 确认即 Toast + 本地态），`Deal/Deliverable/GameKey/Payout` 四表未建，`→delivery` / `→insight` 两条环节守卫按 D9 保守拒 `DEPENDENCY_NOT_IMPLEMENTED`（`env-guards.ts:128-133` 实物核证）。

本批把交付域立成真：**四表落库 + Deal 资金状态机 + deliveryCheck 纯函数 + payout/distribute_keys 两个 outbound 工具过闸门 + V7 台账接真 + 两条守卫真判**，并顺带消解 backlog 两条（U1）。

**资金边界不变（architecture §1）**：合同/支付走 partner，本系统只做**触发条件 + 闸门 + 状态追溯**，不碰资金与税务。

## 2. 用户裁决记录（2026-07-23 实答）

| # | 裁决 | 内容 |
|---|---|---|
| U1 | backlog 纳入 | **两条全纳入**：BL-BRIEF-GOAL（P1，goal 写入口缺失致新建项目卡在 brief→match）+ BL-FE-16（P2，useColorMode 跨实例不同步） |
| U2 | partner 集成策略 | **接口先行 + mock 适配器**（沿 ADR-17 / M3-A `ops/email` 同款范式）：定义 `EscrowPartner` / `KeyDistributor` 接口 + mock 实现；`contractRef`/`escrowRef` 支持人工登记（合同托管在外部真实完成，系统登记引用）；payout 执行 = 状态机流转 + 闸门留痕，**不碰真钱**。真 Stripe/电子签留 M5 或按需批 |
| U3 | 批次边界 | **全量一批**（12 features）：四表 + 状态机 + deliveryCheck + 两 outbound 工具 + 两 internal 工具 + V7 接真 + 两条守卫 + backlog 两条 |

## 3. Planner 决策（P 系）

| # | 决策 | 理由 |
|---|---|---|
| P1 | **零真实资金动作**：payout 的「执行」= `Payout.status prepared→released` + `Deal` 状态推进 + irrev 留痕 + mock `EscrowPartner.release()`（写日志标记，不外呼）。**任何真实付款接口本批不接、不留可误触的开关** | U2 + 架构 §1 资金边界；对照 M3-A P1（真发信仅测试邮箱）——资金侧更保守：连"测试目标"都不设 |
| P2 | **Deal 由 committed Quote 生成**（架构 :488 判据的实现）：`commit_quote` 执行事务内 upsert `Deal`（projectId+kolId 唯一），terms 取 Quote 的 amount/currency/deliverables/scope 快照；Deal 初态 `negotiating`。这是 M3-A commit-quote.ts 的**唯一新增接线点** | 架构 §5.3① →delivery 判据 = 「≥1 Deal（由 committed quote 生成）」；同事务保证「有 committed quote 必有 Deal」 |
| P3 | **Deliverable 五条件 = 台账五列**（`content/key/contract/escrow/ad_disclosure`），Deal 创建时按 Quote.deliverables 与合作形态**生成条件行**：content 恒必需；key 视是否含 key 交付；contract/escrow 恒必需（P4 人工登记满足）；ad_disclosure 恒必需。三态 `pending/met/missing/na` + `na` **不得压成二态**（V7 §2.3 硬要求） | 台账五列与 Deliverable.kind 五值一一对应（architecture :472 明文）；`na` 是诚实语义（如无 key 交付的合作） |
| P4 | **contract/escrow 走人工登记**（U2 的落地形态）：`POST /api/delivery/deals/[id]/refs` 登记 `contractRef`/`escrowRef`（外部电子签/托管的单号），登记即把对应 Deliverable 置 `met` + 推进 Deal 状态（signed/escrowed）。**登记是 internal**（可撤销、不对外、不花钱，D27） | 无 partner webhook 时（U2 mock），人工登记是唯一诚实的状态来源；比"假装自动回调"更符合 D2 诚实降级 |
| P5 | **deliveryCheck.row 纯函数**（domain 层，三处复用铁律）：输入 Deal + Deliverables（+ 相关 Signal），输出每条件齐/缺/不适用 + `ready`（全部**必需**条件 met）+ 缺口清单。V7 台账 / `check_deliverables` 工具 / payout 工具前置校验三处复用同一函数 | 沿 crmInfer（M3-A F005）范式；`ready` 是放款按钮渲染与 payout 服务端校验的**同一真相**——UI 与服务端不得各判一次 |
| P6 | **放款服务端二次校验（防绕过铁律）**：`payout.buildHarm` 与 `execute` 均**重新跑 deliveryCheck**——即使前端渲染了按钮，服务端 `ready=false` 一律拒绝（FR-8.2.4.2「无绕过入口」的服务端实现）。这是 M3-A F003「披露一致性复核」的同构强化 | PRD FR-8.2.4.2/4.3；前端条件渲染只是 UX，服务端才是硬闸 |
| P7 | **单角色不引入角色分叉**：PRD `ai-native-usage.md` 的 `lead/bd/finance` 三角色属**已作废层**（D26-D29，architecture :13 明示）。放款闸门归同一营销操盘手；`Payout.payee` 是收款方（创作者）不是角色 | DP-1 单角色铁律；避免复活作废层 |
| P8 | **GameKey 最小实装**：`GameKey` 表 + `distribute_keys`（outbound，harm 列领取方/key 数量/「一经发放不可回收」）；key 来源 = 人工登记的 key 池（`keyRef` 存引用不存明文 key 值）。**不做 key 生成/采购/平台对接** | 架构 :473 字段级；PRD §15.3 M3 门要求「分发 key 未确认前不可执行」——闸门是重点，key 供应链不是 |
| P9 | **新 API 路由 rate-limit（v0.9.11 硬要求）**：`/api/delivery/*` 三端点 = 30 req/min/IP 进程内限流 **fail-open**（复用 M3-A `lib/http/rate-limit.ts` + `actionsRateLimitGuard` 同款）；escape hatch 沿用 `DISABLE_GATE_RATELIMIT` | 与 M3-A `/api/actions/*` 同类（mutation，人操作），维度与兜底一致 |
| P10 | **BL-BRIEF-GOAL 落法**：goal 确认走 **Copilot 工具 + API 双路径**（`confirm_brief_goal` internal 工具 + `PATCH /api/projects/[id]/goal`，共用 `lib/projects/set-goal.ts` 单一服务——create_project 同款三件套）；**V4 brief 面零结构变更**（裁决 #1：处置入口走 Copilot，卡内不加按钮），仅把已有 mtile/HalfGauge 的数据源指向真 goal | ui-fidelity：V4 19 元素不得简化亦不得新增；M2-C F001/F002 已验证「工具+API+服务」三件套模式 |
| P11 | **BL-FE-16 落法**：`useColorMode` 改 `useSyncExternalStore` + 模块级 store（订阅 body.classList MutationObserver + storage 事件），修跨实例与多标签页两处；**不改任何消费方**（现有 2 调用点行为不变） | backlog decisions 已列候选；本项目主导范式是 Tailwind `dark:`（84 文件），修 hook 只服务真需读 isDark 做分支的场景——所以只修不推广 |
| P12 | **→insight 守卫判据**：`全部 Deal 到 completed 或显式收尾`（架构 :489）。「显式收尾」本批实装为 `Deal.status='defaulted'` 或项目无 Deal（零 Deal 项目不阻断——避免空项目永远进不了 insight） | 架构原文 + 空态诚实：没开始交付的项目不该被交付条件卡住 |

## 4. 数据模型（architecture :471-474 字段级 + expand-contract 迁移）

新表四张（tenantId 全带，命名沿 M3-A 先例）：

- **Deal**：`id cuid` · `tenantId` · `projectId` · `kolId` · `quoteId?`（来源报价软引用）· `termsJson`（金额/币种/交付物/范围快照）· `contractRef?` · `escrowRef?` · `status`（enum `DealStatus`：`negotiating / signed / escrowed / delivering / completed / blocked / defaulted`——架构 :507 六态 + blocked/defaulted 分支）· timestamps · `@@unique([projectId, kolId])`（一人一 Deal，沿 OutreachThread 先例）
- **Deliverable**：`id` · `tenantId` · `dealId` · `kind`（enum：`content / key / contract / escrow / ad_disclosure`）· `status`（enum：`pending / met / missing / na`）· `required Boolean @default(true)` · `evidenceRef?` · `verifiedBy?` · `note?` · timestamps · `@@unique([dealId, kind])`
- **GameKey**：`id` · `tenantId` · `dealId` · `keyRef`（引用不存明文）· `status`（enum：`reserved / distributed`）· `distributedAt?` · `gateLogId?`（distributed 必非空）· `createdAt`
- **Payout**：`id` · `tenantId` · `dealId` · `payee` · `amount Decimal(14,2)` · `currency` · `basis`（依据摘要：合同+托管+披露证据引用）· `status`（enum：`prepared / released / blocked`）· `gateLogId?`（released 必非空）· `releasedAt?` · timestamps

既有表变更：**无**（M3-A 的 PendingAction 7 态与两步票据直接复用，零 schema 改动）。

**RLS（database-patterns §8）**：本项目单租户 dev **不建 RLS policy**（AGENT-FOUNDATION D4 既定，schema.prisma 文件头明示；全部既有 17 表同口径），M5 真实认证时统一补。本批四表沿同一口径，spec 此处显式记录该例外理由。

## 5. 功能列表（features.json 同步）

| id | 标题 | executor | 要点 |
|---|---|---|---|
| F001 | 迁移：Deal/Deliverable/GameKey/Payout 四表 + 五枚举 | generator | §4 全量；expand-only；migration 含单向回滚说明；tsc + 既有 522 测试不破 |
| F002 | `deliveryCheck.row` 纯函数（domain）+ D20 变异测试 | generator | P5：条件三态 + `ready` + 缺口清单；纯函数无 DB；全矩阵单测（五条件 × 四态 + required/na 组合）；三处复用铁律注释 |
| F003 | Deal 生成接线（commit_quote → Deal）+ Deal 状态机 | generator | P2 同事务 upsert Deal + 按 P3 生成五条 Deliverable；状态机 `dealAdvance` 纯函数 + D20 变异；negotiating→signed→escrowed→delivering→completed + blocked/defaulted |
| F004 | ops/partner 适配器层（EscrowPartner + KeyDistributor，mock 实现） | generator | U2/P1：接口 + mock（写日志标记，零外呼）；env 选择器沿 `ops/email` 三分支范式（无真实 partner key → mock；prod 无 key **不** fail-fast——因本批无真实现，注释明示 M5 接真时才启 fail-fast） |
| F005 | `payout` 工具（outbound）+ 服务端二次校验 | generator | P6：async buildHarm 三行（收款方/金额/依据）+ **执行前重跑 deliveryCheck，ready=false 拒绝**；执行 = 消费票 → mock escrow release → `Payout prepared→released` + gateLogId + Deal 推进，同一事务（ctx.db）；幂等键 = PendingAction.id |
| F006 | `distribute_keys` 工具（outbound）+ GameKey 分发 | generator | P8：harm 列领取方/key 数量/「一经发放不可回收」；执行 = mock KeyDistributor → `GameKey reserved→distributed` + gateLogId；key 池人工登记（`POST /api/delivery/deals/[id]/keys`） |
| F007 | delivery 内部工具：`track_delivery` / `check_deliverables`（internal） | generator | 挂 delivery 人格（registry tools 当前为空 `[]`）；`check_deliverables` 复用 deliveryCheck（铁律 ②）；`track_delivery` 返回 Deal + 条件快照供画布渲染 |
| F008 | 交付登记 API：contract/escrow refs + Deliverable 人工核验 + key 池 | generator | P4/P9：`POST /api/delivery/deals/[id]/refs`（登记即置 met + 推进状态）· `PATCH /api/delivery/deliverables/[id]`（人工核验 met/missing/na + evidenceRef）· `POST /api/delivery/deals/[id]/keys`（key 池登记）；三端点 internal + zod + 30/min/IP fail-open |
| F009 | V7 台账接真（mock 退役）+ payout 闸门真链 | generator | 数据源切真（`loadDeliverySurfaceData` RSC 组装，沿 M3-A F008 范式）；`envs/delivery/index.tsx:76-78` D6 stub 替换为真链（POST 发起 → GET 详情 → confirm → execute）；V7 **11 元素逐处保持** + 反向 guardrail（无 KPI/图表/推荐卡/批量放款）；三态条件单元不得压二态；「条件未齐」灰字替代按钮位不得改 disabled 按钮 |
| F010 | env-guards →delivery / →insight 真判 | generator | P12：→delivery 判据 `≥1 Deal`；→insight 判据「全部 Deal completed/defaulted 或零 Deal」；替换 `env-guards.ts:128-133` 两处 `DEPENDENCY_NOT_IMPLEMENTED`；新 reason 码 + 文案（`env-guard-messages.ts`）；EnvGuardContext 扩字段 + 两调用点组装；D20 变异（守卫恒放行 → 测试翻红） |
| F011 | BL-BRIEF-GOAL：goal 确认写入口（工具 + API + 服务三件套） | generator | P10：`lib/projects/set-goal.ts` 单一服务 + `confirm_brief_goal` internal 工具（挂 strategy/orchestrator）+ `PATCH /api/projects/[id]/goal`（zod 校验 targetExposure/periodStart/periodEnd）；**V4 brief 面零结构变更**；端到端断言：新建项目 → 确认 goal → →match 守卫放行 |
| F012 | BL-FE-16：useColorMode 跨实例同步 + E2E 闭环 + 文档翻牌 + 批末新鲜度复核 | generator | P11 hook 修复（useSyncExternalStore + MutationObserver + storage 事件）+ 既有 2 调用点行为不变断言；`delivery:e2e`（committed quote → Deal → 登记 refs → 条件齐 → payout pending → confirm → execute → released + irrev；**零真实资金动作断言**）；architecture 翻牌（§5.2/§5.3①③/§5.4/§9.8/§10.3/§14 M3-B 行/工具表/delivery 人格）+ ui-inventory V7 登记 + 批末新鲜度复核；lint+tsc+test:unit+test:visual 绿 |

全部 `executor:generator` → 普通批次，status=building。

## 6. F009 UI 自审四段（ui-fidelity-guardrail §2）

- **§2.1 原型**：`docs/product/interaction-prototype-v2.html` LEDGER L588-594（浏览器级参照）；现行实装 `src/components/envs/delivery/index.tsx`（V7 11 元素已建，本批只换数据源与闸门链，不重建结构）
- **§2.2 必用件**：`DataTable`（台账 7 列）· `GateConfirm`（payout 确认卡）· `SurfaceCard` · `useToast` · 沿用现有纯色方块 av（**非** ProjectAvatar 色轮——V7 明文区别于 V6）
- **§2.3 不得简化（11 元素逐处保持）**：台账 7 列 · 行 who 纯色方块 av + 名 · sub 交付物 · 🔒 note 附注条件渲染 · 条件单元 **ok 绿/miss 琥珀/🔒 na 灰三态（不得压二态）** · 放款金额右对齐 800 · 🚪「放款」红 gate（仅 ready 行）· 🔒「条件未齐」灰字（**替代按钮位，不得改 disabled 按钮**）· 🔒 底部 shield「没有 AI 推荐卡…不提供绕过入口」。**反向 guardrail：刻意没有 KPI/图表/推荐卡/批量放款——一律不得补。** 本批新增例外：**无**（登记入口走 §5 F008 的 API，UI 入口如需新增须走 pre-impl 审计 + ui-inventory 登记）
- **§2.4 视觉基线**：`?env=delivery` 相关基线对账重生（web-runtime-patterns §4.5 重生序：kill :3000 → build → 伪造网关 env → `--update-snapshots=all` → 三连稳）；接真后基线态 = 夹具项目空态（沿 M3-A F008 口径，空态文案硬断言防静默空白）

## 7. 数据准备步骤（Evaluator 验收前提）

- 本地 D-H 清态基础上：验收需一条 `Quote(status=committed)` 以生成 Deal——可经 M3-A `commit_quote` 闸门链造，或用夹具直插（集成测夹具租户 `test-tenant-m3b-*` 按 pid 隔离，沿 M3-A 先例）
- **白名单**：合成夹具 KOL/项目（`m3b-*` 前缀）作为 Deal 载体；**真实 KOL 行不得写入任何交付/放款数据**（P1 同源纪律）
- **零真实资金动作断言**：全批次 mock 适配器，验收报告须明示「本批未发生任何真实付款/key 发放外呼」
- `delivery:e2e` 脚本默认 mock，无 REAL 分支（P1：不设可误触的真实资金开关）

## 8. 车道与编排（§6.5）

- **快车道**（单会话）；无 role_assignments
- **building**：F001→F002→F003 强依赖串行；**F011（brief goal）/ F012 前半（useColorMode hook）与交付主线文件集不重叠 → 可并行 subagent + worktree**（orchestration §3）；F004-F008 依赖 F001-F003；F009 依赖 F002+F005+F008；F010 依赖 F003
- **verifying**：12 features → fan-out（orchestration §4，M3-A 同款：逐 feature 隔离 evaluator + FAIL/PARTIAL 对抗复核）
- **L2 授权**：真网关 chat（`track_delivery` 若走 LLM 摘要则最小用量）；**无真实资金/key 外呼**（P1）

## 9. M3-A 结转 soft-watch（本批顺手项）

| 来源 | 项 | 本批处置 |
|---|---|---|
| F002-low | XFF 首段可伪造（限流辅助防线） | F008 新增端点时一并改可信段取法（右起首个非代理段），rate-limit.ts 注释兜底转正 |
| F003-low-1 | ResendEmailSender 超时非真 abort | 顺手改 AbortController（F004 建 ops 适配器时同批规范化超时范式） |
| F003-low-2 | 幂等重入 `mocked:false` 硬编码 | 顺手修正返回语义 |
| F004-low-1 | ingest 四步非同一事务 | 顺手 `$transaction` 包裹（F008 建交付登记 API 时同款事务范式） |

以上均为 low，**不构成 acceptance 阻断项**；Generator 顺手改则在 F012 commit 说明，未改不判 FAIL（记入下批 soft-watch）。
