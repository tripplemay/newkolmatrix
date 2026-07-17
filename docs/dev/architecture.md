# KOLMatrix 架构设计文档

| 项 | 内容 |
|---|---|
| 文档 | KOLMatrix 架构设计（Architecture Design） |
| 版本 | v1.0 |
| 日期 | 2026-07-17 |
| 状态 | 草案（Draft） |
| 需求源 | `docs/product/KOLMatrix-PRD.md`（v1.0） |
| 交互源 | 定稿原型 `docs/product/interaction-prototype-v2.html` · 落地规范 `docs/product/interaction-prototype-v2-落地规范.md` |
| 规格源 | `docs/specs/AGENT-FOUNDATION-spec.md`（四柱 / 闸门 D26-D29 / 字段契约 F001） |
| 读者 | 实现工程师（Generator）——可照此建目录、写代码 |

> 本文档经多 agent 起草 + 架构稽核（27 项跨章一致性裁决）+ 残留验证（20 项扫描 PASS）后合稿。跨章契约（闸门两步票据、PendingAction 7 态、harm zod、工具层类型、模块路径表）已全局统一，权威归属见各章标注。

## 目录

- **§1 架构总览**
- **§2 系统上下文与分层视图**
- **§3 技术选型总表**
- **4.1 App Router 目录结构**
- **4.2 页面组件树与复用组件架构**
- **4.3 状态管理策略**
- **4.4 设计系统与主题**
- **4.5 Generative canvas 前端协议（canvas-registry）**
- **5. Agent 运行时架构**
- **6.1 设计原则与系统不变量**
- **6.2 工具执行器中间件（outbound 强制层）**
- **6.3 确认流全链路**
- **6.4 PendingAction 与确认票：数据结构与防重放**
- **6.5 OperationLog：append-only 留痕**
- **6.6 认证与租户占位**
- **6.7 密钥管理与副作用 Provider**
- **6.8 审计与可查询**
- **6.9 闸门有效性验证（F008 验收 + 变异测试）**
- **6.10 P0 落地 vs 后期演进汇总**
- **7.1 落点总览**
- **7.2 ER 总览**
- **7.3 Prisma schema 设计**
- **7.4 pgvector 检索设计**
- **7.5 溯源实现（数据维）**
- **7.6 Seed 管道（F003）**
- **7.7 迁移与演进策略**
- **8.1 路由清单**
- **8.2 aigcgateway 集成（F002）**
- **8.3 外部集成边界**
- **8.4 环境变量清单与启动校验**
- **9.1 环境总览**
- **9.2 本地开发环境：docker compose dev（P0 · F001）**
- **9.3 生产全栈化改造：前端-only → 加 DB / 迁移 / env**
- **9.4 CI/CD 现状与演进**
- **9.5 deploy 人类闸门**
- **9.6 密钥与配置矩阵**
- **10.1 质量门总览**
- **10.2 构建门现状与注意项**
- **10.3 vitest 单元/集成层（P0 新增）**
- **10.4 Playwright：visual + E2E 双 testDir**
- **10.5 闸门测试与变异测试策略（F008 硬门，D20/FR-10.3/§15.4）**
- **10.6 canvas 协议可扩展性断言（§15.3）**
- **10.7 执行位置汇总**
- **P0 — AGENT-FOUNDATION（当前批次，F001 → TS5 升级微批次（ADR-008）→ F002–F008 严格串行）**
- **WORKBENCH-UI（M0.5）**
- **P1 — BRIEF-CAMPAIGNS（M1）**
- **P2 — MATCH（M2）**
- **P3 — REACH-CRM（M3，outbound 最密集）**
- **P4 — DELIVERY / INSIGHT-ROI（M4）**
- **P5 — PROD-HARDENING（M5）**
- **ADR-001 前后端同一 Next.js 应用（不拆独立后端）**
- **ADR-002 多 Agent = 单 loop + 按环节切换 system prompt / 工具子集（非多实例编排框架）**
- **ADR-003 闸门位置：工具执行层的两步票据门（不在 Next middleware、不在前端、不在 prompt）**
- **ADR-004 深字段用 jsonb 契约位（不上宽表/子表规范化）**
- **ADR-005 canvas 注册表：受控 register API（不用 switch、不做服务端驱动 UI）**
- **ADR-006 单租户硬编码 dev tenant，tenantId 只占位（不提前上 RLS/认证）**
- **ADR-007 AI 出口收口到 aigcgateway 单点（不直连模型商 SDK）**
- **ADR-008 TS 升级时机：F002 启动前以独立微批次升 TS 5.x（不与 F001–F008 混批）**
- **ADR-009 向量检索用 pgvector in-Postgres（不引独立向量库）**
- **ADR-010 OperationLog append-only：审计流水只追加，闸门状态机在 PendingAction（不 UPDATE 日志行）**
- **ADR-011 运行时无状态：对话上下文由前端 useChat 持有逐轮回传**
- **ADR-012 部署形态：GHCR 预构建镜像 + VPS compose pull + 手动 workflow_dispatch（不上 Vercel、不自动 CD）**

---

# KOLMatrix 架构设计文档 · §1–§3

## §1 架构总览

### 1.1 设计目标

本架构服务一个目标：把现有的**前端-only Horizon 模板工程**（DS-FOUNDATION 已 signoff）演进为 **AI-native 全栈单应用**，在不推翻已有地基（`src/app/admin/layout.tsx` 外壳、`src/routes.tsx` 路由表、Tailwind 设计系统、Playwright visual baseline）的前提下立起四根柱子：

1. **工具层**：`src/lib/agent/tools/` 注册表，工具二分 `internal` / `outbound`，全部 IO 经 zod 校验（F004）
2. **Agent 运行时**：`src/app/api/agent/route.ts`，Vercel AI SDK `streamText` 流式 tool-calling loop，经 aigcgateway 出口（F004 / F002）
3. **常驻对话面**：`useChat` + `CopilotPanel`，产品唯一 NL 入口（F005）
4. **Generative Canvas**：工具结果按 `type` 经 `canvas-registry.tsx` 映射 React 组件渲染（F005）

外加两块地基与一道闸门：

- **数据地基**（F001–F003）：Prisma + Postgres + pgvector，`Kol` 浅字段 + D15 五个 nullable jsonb 契约位 + `embedding vector(1024)`（bge-m3），seed ~2,524 条真实 KOL
- **AI→人闸门**（F008）：outbound 工具服务端强制拦截为 `PendingAction(pending)`，经 confirm→execute 两步票据放行（唯一契约见闸门章），`OperationLog` append-only 留痕。口径分辨（与 PRD 一致）：outbound **语义类别 5 类**（发信/报价/放款/分发 Key/对外分享，批量发=发信类的批量形态）；**工具白名单 6 个工具名**（send_outreach/send_bulk_outreach/commit_quote/payout/distribute_keys/create_share_link——批量独立成工具因其 harm 必须列全名单），`OUTBOUND_TOOL_NAMES`=6 名
- **P0 验收锚**：hello-agent 闭环——「找东南亚原神向 KOL」→ 运行时调 `search_kols`（NL→embedding→pgvector cosine top-K）→ `type=kol_cards` 流式回传 → canvas 渲染真实 seed 卡片流，全程无表单/翻页/手填（F007）

### 1.2 架构原则（从 PRD DP-1..DP-6 推导）

产品原则（PRD §6，L275–L282）逐条推导为架构级原则，每条给出机制落点。**原则优先序继承 PRD：AP-4/AP-6 为不可让渡安全底线，AP-5 为对外可信度底线。**

| 产品原则 | 架构级原则 | 机制落点 |
|---|---|---|
| **DP-1** 单角色，无角色分叉（D26） | **AP-1 零权限维度**：schema、路由、组件三层都不存在「角色」这个轴。权限分叉不是「先不做」，是**禁止回填** | Prisma schema 无 `role`/`scope`/`Approval` 表（FR-11.16）；无路由权限守卫（D10 作废）；`owner`（Leo/Ada/Kai）是纯展示字段，**任何代码不得从 owner 派生权限判定**（FR-11.15，D29） |
| **DP-2** AI 主驾非副驾（D5） | **AP-2 工具结果协议是一等公民**：交互主轴 = 对话面 + canvas，页面是 Agent 落地画布；表单/表格降级为精调兜底 | 所有工具结果带 `type` 字段（FR-12.5）；`useChat` → `/api/agent` 首 token 即出（FR-12.10）；对话式 Refine 替代重开表单（FR-12.11） |
| **DP-3** 多 Agent 编队，各有职责与隔离边界 | **AP-3 专家 = 配置，不 = 服务**：七个专家（strategy/match/reach/delivery/insight/compliance/orchestrator）是同一运行时上的 system prompt + 工具子集切换，不是七个进程；**canvas 注册表开闭原则**——新增能力 = 加一工具 + 一 canvas 组件，`route.ts` 核心零改动 | `copContext` 随 `route+env` 切换专家（FR-7.12/FR-12.17）；工具子集按环节收窄；扩展性是**验收断言**（§15.3：新结果类型只加组件不改 route 核心） |
| **DP-4** AI→人闸门（D27–D29） | **AP-4 闸门服务端强制优先于前端约束**：outbound 拦截是运行时硬约束（两步票据机制：PendingAction → confirm 签票 → execute 消费票），不是前端 if、不是 system prompt 建议；**模型 loop 永远拿不到票据，无法自我放行**（FR-10.1/10.2） | 6 个 outbound 工具（5 语义类）→ 拦截为 `PendingAction(pending)` + `harm` 结构体（唯一 zod 定义 `src/lib/agent/gate/harm.ts`），**拦截时不下发任何令牌**；人确认 `POST /api/actions/[id]/confirm` 签发一次性票据（票仅在 confirm 响应中出现一次），`POST /api/actions/[id]/execute {ticket}` 消费票执行；闸门状态机由 `PendingAction` 承载（Prisma 权威见 §7），`OperationLog` 留 gate 类日志且 DB 层触发器阻断 UPDATE/DELETE（FR-11.12）；internal 一律不弹框——假闸门稀释真闸门（FR-10.6） |
| **DP-5** 数据溯源：每个数字都知道从哪来 | **AP-5 字段契约解耦数据层与产品层**：产品层只依赖字段契约，不依赖数据来源；**缺值是显示态（「待接入」），不是错误态**；数据管道（seed/Apify/外购/一方 API）到位后填真值，UI 与逻辑零返工（D15，gap-data-layer §5） | 五契约位 nullable jsonb + zod schema 落 `src/lib/*/schemas.ts`（FR-11.20）；溯源回退链 `fieldProvenance[field]` → 行级 `dataSource` → 保守下限 `ai_estimate`（FR-11.7）；每个渲染数据点必带 `ProvenanceTag`（FR-12.14） |
| **DP-6** 流程是可计算实体，状态机有守卫 | **AP-6 机制化守门优先序：DB 约束 > 服务端 > 前端 > 文档**；守卫/闸门/状态机类必配**变异测试**（断言验行为不验源码关键字，把拦截退回原状断言必须变红，D20） | 健康度/匹配分/交付达标实时计算非硬编码（FR-8.2.1）；环节推进是责任链有 guard（FR-7.9）；闸门验收门 G1–G5（§15.4 硬性） |

### 1.3 硬约束（不可让渡）

1. **单一 Next.js 应用**：前后端同处一个 App Router 工程，后端 = Route Handlers + Server Actions + `src/lib`；旧仓库 `src/lib` 仅参考不移植（D1/D8，FR-12.2）
2. **运行时无状态**：对话状态由前端 `useChat` 持有、逐轮回传，服务端不跨请求缓存对话上下文——这是后期 RLS 不改上层的前提（FR-12.9，NFR-S9）
3. **`OperationLog` append-only**：应用层只追加；DB 层触发器/权限阻断 UPDATE/DELETE（NFR-S4）
4. **禁止回填作废层**：`role`/`scope`/`Approval`/`allowedRoles`/阈值分级（$8,000/$2,000/10 封）/`copilotScope` 一律不得出现（spec §3.1.5 裁决）
5. **密钥零硬编码**：`AIGCGATEWAY_BASE_URL`/`AIGCGATEWAY_API_KEY`/`DATABASE_URL` 走 env（唯一定义 `src/lib/env.ts`，导出惰性缓存函数 `serverEnv()`）+ 启动校验（入口 `src/instrumentation.ts`），`.env.example` 无明文（NFR-S5）
6. **所有系统边界不可信**：API 入参、模型输出、上传素材、外部采集帧，先过 zod 再进业务（NFR-S6）
7. **canvas 只走受控 React 组件树**：禁 `dangerouslySetInnerHTML` 承接模型文本（FR-12.16，NFR-S7）
8. **单租户占位**：硬编码 dev tenant，schema 保留 `tenantId`，RLS/真实认证留后期（D4）
9. **构建门**：`npm run build` + `tsc --noEmit` + `next lint` 全绿 + Playwright visual baseline（浅色 ≥1440px，CI/linux 重生）；不提交无法运行的代码（§15.1/15.2）
10. **设计系统唯一**：颜色统一 `var(--color-*)`（`AppWrappers.tsx` 注入 `--color-50..900`，品牌主色 `--color-500 #422AFB`），不搬原型自定义 CSS，不新写 CSS 变量体系或 `data-theme`；深浅走 `body.dark` + Tailwind `dark:`（FR-12.26）

### 1.4 P0 落地 vs 后期演进

| 维度 | P0（AGENT-FOUNDATION / WORKBENCH-UI） | 后期演进 |
|---|---|---|
| 租户/认证 | 硬编码 dev tenant，`tenantId` 占位，无登录 | M5：next-auth 真实认证 + Postgres RLS（依赖运行时无状态，上层零改） |
| 数据填充 | seed ~2,524 条浅字段 + embedding；五契约位建库即在但 **nullable 不填充**，UI 读 null 显「待接入」 | Apify 采集管道 / 外购 API / 平台一方数据，落同一契约位（NFR-D1，成本锚点 Modash $16,200/年） |
| 闸门执行 | 6 个 outbound 工具（5 语义类）服务端拦截 `PendingAction` + 确认卡 + confirm→execute 两步票据 + append-only 留痕（F008 全量落地，**不是演进项**） | 真实投递通道（Resend 发信、partner 电子签+Stripe escrow）接到 outbound 工具背后 |
| 部署 | 现状 Docker 镜像为前端-only（`docker-compose.prod.yml` 无 DB 服务） | 全栈化部署改造：VPS 加 Postgres 服务 / env 注入 / `prisma migrate` 入发布流程；deploy 永留人类闸门（workflow_dispatch） |
| TypeScript | **独立微批次在 F002 启动前升 TS 5.x**（升级+构建门全绿，不与 F001–F008 混批，ADR-008）；之后 zod/Prisma/AI SDK 均按 TS5 选版 | 渐进收紧 strict |
| 性能 | 成本/错误骨架 + 成本记账挂点（FR-12.31） | NFR-P7 embedding/检索缓存、NFR-P8 按任务复杂度模型路由 |
| 环节能力 | M0.5 六页外壳 + 五环节 mock | P1–P4 逐环节接真 Agent（Brief→Match→Reach→Delivery/Insight） |

---

## §2 系统上下文与分层视图

### 2.1 系统上下文图

用户只有一种：营销操盘手（单角色）。系统边界内是一个 Next.js 应用 + 一个 Postgres；边界外 P0 只有 aigcgateway 一个活跃依赖，其余（Apify/Resend/partner/平台）皆为后期虚线。

```mermaid
flowchart LR
  operator["营销操盘手<br/>(单角色, D26 · 无第二种用户)"]

  subgraph kolmatrix["KOLMatrix — 单一 Next.js 15 应用 (D1)"]
    fe["前端工作台<br/>三区外壳: 侧栏 300px (主区偏移 xl:ml-[313px]) + 主区画布 + Copilot 360px<br/>侧栏 6 页 + 项目详情五环节 tab"]
    rt["Agent 运行时 + 闸门<br/>src/app/api/agent/route.ts + /api/actions/[id]/(confirm|execute|reject)<br/>streamText loop · outbound→拦截 PendingAction(pending)"]
    db[("Postgres + pgvector<br/>dev: docker-compose.dev.yml<br/>Kol(契约位+embedding) · Game 三表 · PendingAction(闸门状态机) · OperationLog")]
  end

  gw["aigcgateway<br/>OpenAI 兼容 baseURL<br/>chat tool-calling + bge-m3 embedding"]
  apify["Apify 采集管道<br/>(后期, NFR-D1)"]
  resend["Resend 邮件投递<br/>(后期, D8)"]
  partner["partner 电子签 + Stripe escrow<br/>(后期, NFR-S8)"]
  platforms["YouTube / Twitch<br/>TikTok / Instagram"]

  operator -->|"NL 指令 · 闸门确认(confirm→execute 两步票据)"| fe
  fe -->|"useChat POST 流式"| rt
  rt -->|"chat + embedding 双链路<br/>env: AIGCGATEWAY_*"| gw
  rt -->|"Prisma / $queryRaw(vector)"| db
  apify -.->|"dataSource=crawl + fieldProvenance<br/>落同一字段契约"| db
  apify -.-> platforms
  rt -.->|"send_outreach 等 outbound<br/>(人确认后才产生副作用)"| resend
  rt -.-> partner
```

系统上下文要点：

- **对外承诺只有一条出边**：所有对外副作用（发信/报价/放款/分发 key/分享链接）都必须穿过运行时的闸门层——外部投递服务永远接在 outbound 工具背后，前端没有任何直连外部的通道
- **数据只有一种入口形状**：无论 seed CSV、Apify 爬取、外购还是一方 API，都落到 `Kol` 的同一组契约字段并携带 `dataSource` + `fieldProvenance`，产品层无感知（AP-5）
- **aigcgateway 是唯一模型出口**：chat（tool-calling）与 embedding（bge-m3）双链路都走它，为成本记账与模型路由（NFR-P8）预留单点

### 2.2 分层视图

```mermaid
flowchart TB
  subgraph L1["① 交互层（浏览器）"]
    cmd["navbar 指令栏 (FR-7.2)<br/>任意页 Enter → 送入 Copilot"]
    copilot["CopilotPanel (useChat)<br/>随 route+env 切专家 · 常驻否定式声明"]
    canvas["GenerativeCanvas + canvas-registry.tsx<br/>type → React 组件（开闭原则）"]
    gatecard["GateConfirm 确认卡<br/>如实列全部利害 · 「对外·不可撤销」"]
  end

  subgraph L2["② API / Agent 运行时层（同一 Next.js 应用）"]
    route["src/app/api/agent/route.ts<br/>streamText tool-calling loop · 无状态 (FR-12.9)<br/>system prompt = 当前专家人格 + 否定式护栏"]
    gatekeeper["闸门层 src/lib/agent/gate/ (ticket.ts·harm.ts·pending.ts)<br/>查工具 class: internal→放行执行<br/>outbound→创建 PendingAction(pending) + harm 结构体 · 不下发任何令牌"]
  end

  subgraph L3["③ 工具层"]
    tools["src/lib/agent/tools/ 注册表 (zod IO)<br/>internal: search_kols · get_kol_detail · evaluate_creator · match_plan · draft_email<br/>outbound: send_outreach · send_bulk_outreach · commit_quote · distribute_keys · payout · create_share_link"]
  end

  subgraph L4["④ 领域 / 数据访问层"]
    lib["src/lib/db/prisma.ts 单例 + db/tenant.ts (DEV_TENANT) · src/lib/*/schemas.ts (zod, jsonb 形状唯一权威)<br/>src/lib/oplog/ (append.ts·queries.ts·schemas.ts) append-only writer"]
  end

  subgraph L5["⑤ 数据层"]
    pg[("Postgres + pgvector<br/>Kol: 浅字段 + 5 契约位 jsonb(nullable) + embedding vector(1024)<br/>Game / Material / GameKnowledge (sourceMaterialIds 溯源)<br/>OperationLog (DB 触发器阻断 UPDATE/DELETE)")]
  end

  subgraph EXT["外部服务"]
    gw2["aigcgateway<br/>接入点: src/lib/ai/gateway.ts"]
    future["后期: Apify / Resend / partner"]
  end

  cmd --> copilot
  copilot -->|"POST /api/agent (逐轮回传对话)"| route
  route --> gatekeeper --> tools
  tools --> lib --> pg
  route -->|"chat / embedding"| gw2
  tools -.->|"outbound 副作用 (确认后)"| future
  route -->|"流式 type 化工具结果"| canvas
  gatekeeper -->|"pending + harm（不含任何令牌）"| gatecard
  gatecard -->|"确认: POST /api/actions/[id]/confirm 签一次性票<br/>→ POST /api/actions/[id]/execute {ticket} 消费票执行"| gatekeeper
```

两条关键流（实现工程师照此写调用链）：

**internal 流（无闸门，FR-10.6）**：指令栏/Copilot 输入 → `useChat` POST `/api/agent` → `streamText` loop 模型决定调 `search_kols` → 闸门查 `class=internal` 放行 → 工具执行（`src/lib/kol/search.ts`：NL→`gateway.ts` embedding→pgvector `<=>` cosine top-K）→ 执行管线组装前端信封 `ToolResultPart{type:'kol_cards', data, meta:{toolName,toolClass,agentId,createdAt}}` 流式回传（信封与 `ToolDefinition`/`ToolOutcome` 同定义于 `src/lib/agent/tools/types.ts`）→ `canvas-registry` 查 `type` 渲染 KOL 卡片流 → 同时追加 `OperationLog`（internal 类日志，UI 弱化展示，FR-11.14）。

**outbound 流（闸门，FR-10.1）**：模型调 `send_outreach` → 闸门查 `class=outbound` → **不执行副作用**，创建 `PendingAction(uuid, status=pending)` 并返回 pending + `harm` 结构体（唯一 zod 定义 `src/lib/agent/gate/harm.ts`：`title` / `irreversibleLabel:'对外·不可撤销'` / `facts[]` / `recipients[{displayName,platform,handle?}]` / `amount?` / `scope?` / `basis?`）——**拦截时不下发任何令牌**（禁止令牌随 SSE/data-gate 流下发）→ 前端渲染 `GateConfirm` → 操盘手确认 → `POST /api/actions/[id]/confirm` 服务端签发**一次性票据**（票仅在 confirm 响应中出现一次，不变量 I3）→ `POST /api/actions/[id]/execute {ticket}` 消费票执行副作用 → 成功则**同一事务** finalize(`executed`) + INSERT `irrev` 行（含确认人/确认时间/依据，FR-8.6.7）；副作用失败 → `failed`、无 irrev 行；拒绝走 `POST /api/actions/[id]/reject`。模型 loop 全程接触不到票据。

### 2.3 与现有代码库的衔接

现状（侦察确认）：**零后端**——无 `src/app/api/`、无 `src/lib/`、无 prisma、无 zod、无 AI SDK。已有资产 = 外壳 + 模板组件库存 + CI/CD 骨架。目录增量规划：

```
src/
├── app/
│   ├── api/agent/route.ts            # 新建 F004 — Agent 流式端点
│   ├── api/actions/[id]/             # 新建 F008 — 闸门契约端点
│   │   ├── confirm/ execute/ reject/ #   POST 确认(签一次性票)/执行(消费票)/拒绝
│   │   └── route.ts                  #   GET pending 详情（恢复确认卡）
│   ├── admin/
│   │   ├── layout.tsx                # 已有(81行) — 加 Copilot 第三区，侧栏/navbar 不重挂载(FR-7.1)
│   │   ├── today/ campaigns/ campaigns/[id]/ creators/
│   │   │   knowledge/ insight/ runs/ # F006 — 六页 IA 替换现 discovery/database/outreach 占位
│   │   └── dashboards/default/       # 已有实装页，IA 切换后由 today 承接
├── instrumentation.ts                # 启动 env 校验入口（本仓库有 src/，不在根）
├── lib/                              # 全部新建（现不存在）
│   ├── env.ts                        # serverEnv() 惰性缓存
│   ├── ai/gateway.ts                 # F002 — aigcgateway provider (baseURL + env 校验)
│   ├── db/prisma.ts · db/tenant.ts   # F001 — Prisma 单例 · DEV_TENANT
│   ├── agent/                        # runtime.ts + resolve.ts + prompt.ts
│   │   ├── tools/                    # F004 — registry.ts(注册表) + types.ts(ToolDefinition/ToolOutcome/OUTBOUND_TOOL_NAMES) + 每工具一文件
│   │   ├── experts/                  # 七专家定义
│   │   └── gate/                     # F008 — ticket.ts(签/验票) + harm.ts(harm zod 唯一定义) + pending.ts
│   ├── oplog/                        # F008 — append.ts + queries.ts + schemas.ts（append-only）
│   └── kol/search.ts · kol/schemas.ts # F004/FR-11.20 — 检索 + jsonb 契约位 zod（形状唯一权威）
├── components/
│   ├── copilot/CopilotPanel.tsx      # F005
│   ├── canvas/                       # F005 — 注册表（受控 register API）+ renderers
│   └── gate/GateConfirm.tsx          # F008
├── routes.tsx                        # 已有 IRoute[] — F006 改为 6 页
prisma/schema.prisma                  # F001
scripts/seed/import-kol-csv.ts        # F003（幂等）
scripts/test/ai-gateway-smoke.ts      # F002
docker-compose.dev.yml                # F001 — 本地 pg + pgvector
```

衔接约定：

| 约定 | 内容 |
|---|---|
| 导入路径 | 业务代码一律裸 src 导入（`tsconfig.baseUrl: "src"`）、**不新增 `@/` 别名**；保留既有 `@/public/*` 静态资源映射（tsconfig paths 已存在）——新代码写 `import { toolRegistry } from 'lib/agent/tools/registry'`、`import { gateway } from 'lib/ai/gateway'`，与现有 `import Card from 'components/card'` 一致 |
| 组件复用 | Horizon 现成 → className/token 约定 → 才新建（FR-12.25）；需新建产品件清单：`CopilotPanel` `GenerativeCanvas` `GateConfirm` `ProvenanceTag` `ConversationInbox` `AgentSquad` `ExpertAgentHeader` `HalfGauge`(ApexCharts radialBar −90/90) `DataTable`(抄模板 ComplexTable + @tanstack/react-table) `UploadZone`(react-dropzone) |
| 命名 | Prisma camelCase / DB snake_case(`@map`)；uuid `gen_random_uuid()`（`OperationLog` 例外 bigint autoincrement）；timestamptz + `@updatedAt`；长生命周期实体 `deletedAt` |
| pgvector | Prisma `Unsupported("vector(1024)")`，读写走 `$queryRaw`（cosine 用 `<=>`）；`embeddingTextHash` 做重嵌入守卫（FR-11.5） |
| 测试衔接 | Playwright 沿用现配置（`tests/visual/`，snapshot 双平台后缀）；新增页面必补 baseline（§15.2）；单元/变异测试新增 vitest（现有 @testing-library/react 已装但无 runner） |

---

## §3 技术选型总表

| 领域 | 选型（版本） | 状态 | 选型理由 | 替代方案（不选原因） |
|---|---|---|---|---|
| 应用框架 | Next.js ^15.1.5 App Router，前后端同一应用 | 已装 | D1 硬决策：Route Handlers + Server Actions 免去独立后端；`output:'standalone'` 已接 Docker CD；运行时无状态设计让同应用也能留 RLS 边界 | 独立后端（NestJS/Fastify + SPA）：多一套部署与鉴权面，P0 单人团队维护成本不划算；旧仓库后端：明确只参考不移植（D8） |
| UI 运行时 | React 19.0.0-rc.1 | 已装 | Horizon Pro 模板 pin；`.npmrc legacy-peer-deps=true` 已消化 RC peer 冲突 | 降级 React 18：与模板 scaffold 冲突，改造成本大于收益 |
| 语言 | TypeScript 5.x（现装 ^4.9.4 模板 pin；**独立微批次在 F002 启动前升级**） | **需升级** | 统一裁决（ADR-008）：TS5 升级 + 构建门全绿作为独立微批次完成，**不与 F001–F008 混批**；之后 zod/Prisma/AI SDK 均按 TS5 选版（AI SDK v5 要求 TS≥5）；新代码按 strict 风格写，为渐进收紧铺路 | 停留 4.9：AI SDK v5 要求 TS≥5，无法承载 Agent 运行时选型；「落地中再评估」：拖到 F002 之后会与 AI SDK/Prisma 版本连环冲突 |
| 设计系统 | Tailwind ^3.3.3 + `AppWrappers.tsx` 运行时 CSS 变量色阶（`--color-50..900`，主色 #422AFB） | 已装 | 模板主设计系统就是 Tailwind + CSS 变量，**不是** Chakra theme（无 ChakraProvider/extendTheme）；浅色默认 + `body.dark` | Chakra theme 全家桶：模板架构不支持；再写一套 CSS 变量/`data-theme`：FR-12.26 明令禁止 |
| 交互原语 | Chakra 拆包（仅 modal/hooks/popover/tooltip/accordion） | 已装 | GateConfirm 焦点陷阱 + Escape（NFR-A1）直接用 `@chakra-ui/modal` 现成可达性 | Radix/Headless UI：重复引入第三套原语体系 |
| Agent 运行时 SDK | Vercel AI SDK v5（`streamText` + `useChat`；v5 要求 TS≥5，依赖 F002 前完成的 TS5 微批次） | **需新增**（`ai` + provider 包） | spec D2 硬决策：流式 loop、tool-calling、React hook 一体；工具定义天然接 zod；`useChat` 逐轮回传对话正好满足运行时无状态（FR-12.9） | LangChain/LlamaIndex：抽象层过重，四柱只需 loop+注册表；手写 SSE loop：重造流式协议与 tool-call 解析；`@anthropic-ai/sdk` 直连：绑定单一供应商，且模型出口已定为网关 |
| 模型出口 | aigcgateway（OpenAI 兼容 baseURL），接入点 `src/lib/ai/gateway.ts`，自定义 provider（`@ai-sdk/openai-compatible` 或 `createOpenAI({baseURL})`，F002 定） | **需新增** | D2：chat（tool-calling）+ embedding 双链路单出口；统一计费与成本记账挂点，支撑后期模型路由（NFR-P8）；密钥 env + 启动校验 | 直连 OpenAI/Anthropic：多密钥多计费面，失去路由单点；smoke 脚本 `scripts/test/ai-gateway-smoke.ts` 是 F002 验收 |
| Embedding | bge-m3，1024 维，经网关 | **需新增**（网关侧，无本地依赖） | D3：多语种强（全球 KOL：东南亚/多地区 NL 检索）；维度与 `vector(1024)` 列一致 | OpenAI text-embedding-3：需另开出口；本地推理：dev 机不必要的重量 |
| ORM / DB | Prisma（按 TS5 选版）+ PostgreSQL + pgvector（dev: `docker-compose.dev.yml`） | **需新增** | PRD §11 栈约束；migration 工具链成熟；`Unsupported("vector")` + `$queryRaw` 覆盖向量读写；jsonb 契约位 + zod 双层校验 | Drizzle：pgvector 支持更原生，但 PRD 已锁 Prisma 且团队规约以 Prisma 计；裸 SQL：失去 migrate/类型生成 |
| 向量检索 | pgvector cosine（`<=>`）top-K，同库 | 随 DB | ~2,524 条规模 DB 侧 <200ms（NFR-P3）绰绰有余；与业务数据同库同事务，溯源/闸门留痕不跨系统 | 独立向量库（Pinecone/Qdrant）：此规模纯增运维面；后期数据量上来再评估，检索接口收敛在 `search_kols` 工具内、可换实现不改协议 |
| 校验 | zod | **需新增** | NFR-S6/FR-11.20 硬要求：工具 IO、jsonb 契约位、API 入参、模型输出统一一套 schema；AI SDK 工具定义原生吃 zod；「空依据的分数判非法」（FR-11.4）这类规则用 `refine` 表达 | yup/valibot：AI SDK 生态以 zod 为一等公民 |
| 图表 | ApexCharts 3.35.5 + react-apexcharts 1.4.0 | 已装 | 模板封装件现成（`components/charts/`）；`HalfGauge` = radialBar −90/90（FR-8.2.1.1） | ECharts/Recharts：重复引入，且需重做 Horizon 视觉适配 |
| 表格 | @tanstack/react-table ^8 | 已装 | `DataTable` 抄模板 ComplexTable 写法；headless 与 Tailwind 设计系统无冲突 | AG Grid：闭源重件，兜底表格用不到 |
| 上传 | react-dropzone | 已装 | `UploadZone`（FR-8.4.2）直接用 | 手写 drag events：已有依赖不重造 |
| 单元/变异测试 | vitest | **需新增** | CLAUDE.md 建议项；ESM/TS 原生快；闸门/守卫类必须配变异测试（D20/§15.4），vitest 起停快适合高频跑 | jest：模板只装了 @testing-library 没装 runner，jest 对 ESM/TS4.9 配置成本更高 |
| E2E / 视觉 | Playwright ^1.61.1 | 已装 | 视觉回归已跑通（chromium 1512×982，darwin/linux 双 baseline，CI/linux 重生）；M0–M4 交互门（§15.3）沿用 | Cypress：迁移无收益 |
| 客户端状态 | 不新增全局状态库：`useChat` 持对话、URL（`?env=` + `cur` 游标）持导航态、既有 `ConfiguratorContext` 持主题 | 已有 | FR-7.6/7.8 要求环节态可链接直达（雷达待办落 `ask.env`），URL 即状态天然满足；对话态归 useChat（AP-4 令牌也走请求体不走全局 store） | zustand/jotai：当前无跨树共享的可变状态诉求，引入即闲置 |
| 认证 | P0 无（硬编码 dev tenant） | — | D4：单租户占位，`tenantId` 进 schema 不进逻辑分支 | next-auth 现在就上：M5 再做，配合 RLS 一次到位，避免 P0 假多租户 |
| 部署 | Docker 三阶段（node 20-alpine, standalone）+ GH Actions：CI（push main → lint+tsc+build+visual）、CD 仅 `workflow_dispatch` 手动（VPS newkol.guangai.ai:3300） | 已装 | CICD-VPS 已 done；deploy/prod 永留人类闸门（与 AP-4 同构） | 自动部署 on push：违反人类闸门约束，禁止 |

**P0 需新增依赖清单**（在 TS5 升级微批次完成后安装——zod/Prisma/AI SDK 均按 TS5 选版；注意 `.npmrc legacy-peer-deps=true` 环境下安装，装后跑 `tsc --noEmit` 确认与 @types/react@18 pin 不冲突）：

```bash
# 运行时
npm i ai @ai-sdk/openai-compatible zod @prisma/client
# 开发
npm i -D prisma vitest tsx dotenv-cli csv-parse
```

**反选型清单**（明确不引入，防蔓延）：微服务/独立 Agent 服务（AP-3：专家是配置不是服务）；独立向量库；第二套 NL 入口（DP-3：全产品只保留一个）；全局状态库；任何含 `role`/`scope`/审批链语义的库或表（AP-1）；`dangerouslySetInnerHTML` 类 HTML 渲染方案（FR-12.16）。

---

# §4 前端架构

> 读者：Generator。本章给出 App Router 目标目录树（文件级）、页面组件树与复用组件架构、状态管理策略、设计系统约定、generative canvas 前端协议。业务代码一律裸 `src` 导入（`tsconfig baseUrl: "src"`），不新增 `@/` 别名；保留既有 `@/public/*` 静态资源映射（tsconfig paths 已存在）。`components/...` 即 `src/components/...`。

## 4.1 App Router 目录结构

### 4.1.1 目标目录树（文件级，含标注）

图例：`[保留]` 现状不动 · `[改]` 原地修改 · `[新建]` 新文件 · `[删]` 落地后删除 · `(P0)` AGENT-FOUNDATION / WORKBENCH-UI 必须 · `(演进)` 后期批次。

```
src/
├── routes.tsx                            [改](P0) 5 项 → 6 项侧栏 IA（见 4.1.2）
├── Fonts.tsx                             [保留] 模板字体定义（演进：接线 next/font/local）
├── app/
│   ├── layout.tsx                        [保留] 根布局，默认浅色（body 无 dark class）
│   ├── AppWrappers.tsx                   [改](P0) ConfiguratorContext 扩展 copilot 字段（见 4.3.3）
│   ├── page.tsx                          [改](P0) redirect('/admin/today')（现指 dashboards/default）
│   ├── api/
│   │   ├── agent/
│   │   │   └── route.ts                  [新建](P0/F004) 流式 loop（后端另章，此处仅作前端对接点）
│   │   └── actions/[id]/                 [新建](P0/F008) 闸门两步票据契约，权威定义见闸门章（A4）：
│   │       ├── route.ts                  #   GET pending 详情（today 雷达卡/项目页恢复确认卡）
│   │       ├── confirm/route.ts          #   POST 人确认→签发一次性票（票仅在此响应出现一次）
│   │       ├── execute/route.ts          #   POST 消费票执行
│   │       └── reject/route.ts           #   POST 驳回
│   └── admin/
│       ├── layout.tsx                    [改](P0) 三区外壳：现有 Sidebar+Navbar+Footer 之外挂 Copilot 右栏（见 4.2.1）
│       ├── page.tsx                      [改](P0) redirect('/admin/today')
│       ├── today/
│       │   └── page.tsx                  [新建](P0) 今天/雷达（编排 Agent）
│       ├── campaigns/
│       │   ├── page.tsx                  [改](P0) 项目列表（替换 ComingSoon 占位）
│       │   └── [id]/
│       │       ├── page.tsx              [新建](P0) 项目详情 RSC 壳：取项目数据 → <ProjectDetail/>
│       │       └── ProjectDetail.tsx     [新建](P0) client：项目头 + StageRail + stagePanel（?env= tab）
│       ├── creators/
│       │   └── page.tsx                  [新建](P0) 创作者库（吸收原 discovery+database 职责）
│       ├── knowledge/
│       │   └── page.tsx                  [新建](P0) 游戏知识（UI P0 可 mock，真解析属 P1）
│       ├── insight/
│       │   └── page.tsx                  [新建](P0) 洞察（跨项目）
│       ├── runs/
│       │   └── page.tsx                  [新建](P0) Agent 记录（append-only 日志读取面）
│       ├── dashboards/default/page.tsx   [删] today 落地后删除（F006）。⚠️ 同批改两处指向 /admin/today：
│       │                                     docker-compose.prod.yml healthcheck 与 playwright.config.ts
│       │                                     webServer.url，并重生受影响 visual baseline
│       ├── discovery/page.tsx            [删] 并入 creators
│       ├── database/page.tsx             [删] 并入 creators
│       └── outreach/page.tsx             [删] 槽位由 runs 接替（触达能力进项目详情 Reach 环节，FR-7.5）
├── components/
│   ├── （card/charts/sidebar/navbar/fields/progress/dropdown/tooltip/popover/...）[保留] Horizon 库存
│   ├── navbar/index.tsx                  [改](P0) 搜索胶囊 → CommandBar 指令栏 + Agent 推进中脉冲（FR-7.2）
│   ├── sidebar/components/SidebarCard.tsx[改](P0) 内容改「Agent 自动边界」CTA，不可关闭（FR-7.3）
│   ├── common/ComingSoon.tsx             [保留] 过渡期占位
│   ├── copilot/                          [新建](P0/F005)
│   │   ├── CopilotPanel.tsx              # 常驻右栏容器（useChat 宿主）
│   │   ├── ExpertAgentHeader.tsx         # 专家头 + duty/iso 职责隔离卡（FR-7.13）
│   │   ├── MessageList.tsx               # 流式消息列（aria-live="polite"，NFR-A2）
│   │   ├── MessageBubble.tsx             # 单条气泡（text part）
│   │   ├── CommandBar.tsx                # navbar 内嵌指令栏（Enter → 送入 Copilot 并展开）
│   │   ├── CopilotInput.tsx              # 面板底部输入（InputField 拼）
│   │   ├── agents.ts                     # 前端花名册元数据（7 Agent：id/name/duty/iso/开场白）
│   │   └── useCopilotContextKey.ts       # 包 lib/agent/resolve.ts 同构推导 → contextKey（见 4.3.2）
│   ├── canvas/                           [新建](P0/F005) generative canvas 协议（见 4.5）
│   │   ├── types.ts                      # CanvasComponentProps / CanvasGo（ToolResultPart 信封权威在 src/lib/agent/tools/types.ts）
│   │   ├── canvas-registry.tsx           # 受控 register API：registerCanvasRenderer(type,component)（唯一核心，加类型不改它）
│   │   ├── renderers/
│   │   │   ├── index.ts                  # 注册入口（★加新类型只在此加一行 registerCanvasRenderer）
│   │   │   ├── KolCardStream.tsx         # type='kol_cards'（P0，hello-agent）
│   │   │   ├── KolDetailCard.tsx         # type='kol_detail'（P0）
│   │   │   ├── ActionCards.tsx           # type='action_cards'（{icon,title,sub,go}，FR-7.14）
│   │   │   ├── GateConfirmCard.tsx       # type='gate_confirm'（P0/F008，包 GateConfirm）
│   │   │   ├── PlainResultCard.tsx       # 未注册 type 兜底（JSON 摘要 + toolName）
│   │   │   ├── MatchPlanMatrix.tsx       # type='match_plan'（演进 P2）
│   │   │   └── RoiReportCard.tsx         # type='roi_report'（演进 P4）
│   ├── stage/                            [新建](P0 WORKBENCH-UI) 五环节落地面（D22：stagePanel 唯一渲染入口）
│   │   ├── stage-registry.ts             # env → StageDef（grammar/verb/agentId/Panel）
│   │   ├── StageRail.tsx                 # 环节导轨（5 节点三态，读 cur 游标，FR-7.7/7.8）
│   │   ├── StageHeader.tsx               # 落地面顶部固定 grammar+verb 标签（FR-7.10）
│   │   ├── BriefPanel.tsx                # 仪表 glance：HalfGauge + 阻塞卡 + timeline
│   │   ├── MatchPanel.tsx                # 对比矩阵 compare：横向多方案 ≥5 行 + 推荐列 + 待你裁定区
│   │   ├── ReachPanel.tsx                # 对话收件箱 converse：包 ConversationInbox
│   │   ├── DeliveryPanel.tsx             # 条件台账 verify：DataTable 逐条件行，无推荐卡
│   │   └── InsightPanel.tsx              # 对照账本 reconcile：原目标 vs 实际 + 证据缺口
│   ├── table/DataTable.tsx               [新建](P0) @tanstack/react-table 通用封装（抄 ComplexTable 抽参）
│   ├── gate/GateConfirm.tsx              [新建](P0/F008) 闸门确认卡（Chakra Modal + 焦点陷阱，NFR-A1）
│   ├── provenance/ProvenanceTag.tsx      [新建](P0) 溯源徽标（读 fieldProvenance，四类非仅颜色区分）
│   ├── inbox/ConversationInbox.tsx       [新建](P0) 触达三栏（左选人/中对话/右档案，state.pick）
│   ├── squad/AgentSquad.tsx              [新建](P0) 编队花名册卡（今天页；6 元入卡=5 环节专家+合规，orchestrator 汇报者不入卡；协同交接默认折叠可展开）
│   ├── gauge/HalfGauge.tsx               [新建](P0) ApexCharts radialBar −90/90 半环
│   └── upload/UploadZone.tsx             [新建](P0 UI) react-dropzone（已装）+ 素材列表 + parseStatus
├── contexts/
│   └── ConfiguratorContext.ts            [改](P0) 扩展 copilot 外壳态（见 4.3.3）
├── hooks/
│   ├── useMediaQuery.ts 等               [保留]
│   └── useBadgeCounts.ts                 [新建](P0 可 mock) 今天/记录侧栏徽标计数（FR-7.4；asks 经 list_pending_asks 单一工具取数）
├── lib/
│   ├── mock/                             [新建](P0 WORKBENCH-UI 过渡，接真数据后删)
│   │   ├── kols.ts / projects.ts / knowledge.ts / runlog.ts / squad.ts
│   ├── agent/ · ai/ · db/                [新建] 后端另章（前端仅 import 其导出的 TS 类型）
├── types/
│   └── navigation.d.ts                   [改](P0) IRoute 增 badge 字段（见 4.1.2）
├── variables/charts.ts                   [保留] chartOptions 预设复用源
└── styles/                               [保留]
```

**测试配套**（详见验收章，此处只列文件位）：每个新页补 `tests/visual/<page>.spec.ts` + baseline 入 `tests/screenshots/baseline/`（15.2）。

### 4.1.2 routes.tsx 与 IRoute 扩展

```tsx
// src/routes.tsx —— 整体替换现有 5 项（P0）
import { MdOutlineToday, MdCampaign, MdPersonSearch,
         MdVideogameAsset, MdInsights, MdHistory } from 'react-icons/md';
import { IRoute } from 'types/navigation';

const routes: IRoute[] = [
  { name: '今天',     layout: '/admin', path: '/today',     icon: <MdOutlineToday className="text-inherit h-5 w-5" />, badge: 'asks' },
  { name: '项目',     layout: '/admin', path: '/campaigns', icon: <MdCampaign className="text-inherit h-5 w-5" /> },
  { name: '创作者库', layout: '/admin', path: '/creators',  icon: <MdPersonSearch className="text-inherit h-5 w-5" /> },
  { name: '游戏知识', layout: '/admin', path: '/knowledge', icon: <MdVideogameAsset className="text-inherit h-5 w-5" /> },
  { name: '洞察',     layout: '/admin', path: '/insight',   icon: <MdInsights className="text-inherit h-5 w-5" /> },
  { name: 'Agent记录', layout: '/admin', path: '/runs',     icon: <MdHistory className="text-inherit h-5 w-5" />, badge: 'runs' },
];
export default routes;
```

`types/navigation.d.ts` 的 `IRoute` 增一个可选字段：`badge?: 'asks' | 'runs'`；`sidebar/components/Links` 读到该字段时渲染计数徽标，计数来自 `hooks/useBadgeCounts.ts`（P0 mock 常量，演进接 API；`asks` 计数与今天页 KPI「待你确认」同源——`Project.ask` 为**展示聚合层**，其 outbound 条目由 `PendingAction(status=pending)` 派生，KPI 与徽标计数均经 `list_pending_asks` 单一工具取数，FR-8.1.3）。

**路由铁律**（FR-7.6/7.9）：项目详情 `/admin/campaigns/[id]` **不进侧栏**，由项目列表卡片 `router.push` 下钻；五环节是 `?env=` query tab **不是子路由**（`?env=brief|match|reach|delivery|insight`，缺省取项目 `cur` 游标）。active 高亮沿用 sidebar 内置 `pathname.includes(routeName)`，`/admin/campaigns/[id]` 自然命中「项目」。**无路由权限守卫**（D26 单角色，D10 已作废——不得引入任何 role 判断）。

## 4.2 页面组件树与复用组件架构

**复用优先级（FR-12.25，硬约定）**：① Horizon 现成组件 → ② className/token 约定（如 `.btn` 无组件，用 `rounded-xl bg-brand-500 hover:bg-brand-600 ...` class 约定）→ ③ 才新建，且用 Horizon 原语拼。完整手写件→真组件映射表见 `docs/product/interaction-prototype-v2-落地规范.md` §4（权威），本节只固化架构结构。

### 4.2.1 三区外壳改造（src/app/admin/layout.tsx）

现有外壳（Sidebar 313px 偏移 + Portal Navbar + `<main>`）保留，追加第三区：

- `CopilotPanel` 挂在 **admin layout 内**（不是各 page 内）——App Router 的 layout 跨路由持久，满足 FR-7.1「路由切换只重绘主区与 Copilot 上下文，侧栏/navbar 不重挂载」。对话线程重置由 copContext key 驱动（4.3.2），**不靠组件重挂载**。
- 桌面（`xl:`）：`CopilotPanel` 为 `fixed right-0 top-0 h-full w-[360px]`；主区 `<main>` 在现有 `xl:ml-[313px]` 基础上加 `copilotOpen ? 'xl:mr-[372px]' : 'xl:mr-0'`（360px + 12px gutter）。
- 移动（`<xl`）：Copilot 退为 Chakra `Drawer`（右滑，复用 `navbar/Configurator.tsx` 的 Drawer 写法），开关状态即 `copilotOpen`，断点判断复用 `hooks/useMediaQuery`。
- Navbar 改造：搜索胶囊位替换为 `components/copilot/CommandBar.tsx`（保留玻璃外壳 `bg-white/30 backdrop-blur-xl`）+ 常驻「Agent 推进中」脉冲点（纯 CSS，产品识别项）。

### 4.2.2 Copilot 面板与主区组件关系（mermaid）

```mermaid
flowchart LR
  subgraph shell["src/app/admin/layout.tsx（client，跨路由持久）"]
    SB["Sidebar<br/>routes.tsx 6 项 + badge"]
    NB["Navbar<br/>+ CommandBar 指令栏"]
    subgraph main["主区 children（随路由重绘）"]
      PG["page.tsx（RSC 取数）"]
      PD["ProjectDetail.tsx（client）"]
      RAIL["StageRail（?env= 三态导轨）"]
      SP["stagePanel<br/>stage-registry: env→Panel"]
    end
    CP["CopilotPanel（360px 常驻）<br/>useChat id=copContext key"]
  end
  NB -- "Enter: setCopilotBoot(text)<br/>+ setCopilotOpen(true)" --> CTX[("ConfiguratorContext<br/>copilot 扩展字段")]
  CTX --> CP
  PG --> PD --> RAIL --> SP
  ROUTE["usePathname + ?env="] -- "useCopilotContextKey<br/>（lib/agent/resolve 同构推导）<br/>key 变化→线程重置为专家开场白" --> CP
  CP -- "POST（messages 全量回传）" --> API["/api/agent/route.ts<br/>（无状态流式 loop）"]
  API -- "stream: text parts + ToolResultPart{type,data,meta}" --> CP
  CP -- "part.type" --> REG["canvas-registry"]
  REG --> KC["KolCardStream"]
  REG --> AC["ActionCards"]
  REG --> GC["GateConfirmCard"]
  REG --> PL["PlainResultCard（未知 type 兜底）"]
  AC -- "onGo('env:'/'pick:'/'enter:')<br/>router.push / setEnv / setPick" --> SP
  GC -- "① POST confirm（人确认→签票，<br/>票仅在此响应出现一次）" --> CONFIRM["/api/actions/[id]/confirm"]
  GC -- "② POST execute {ticket}<br/>（消费票执行）" --> EXEC["/api/actions/[id]/execute"]
```

### 4.2.3 各页组件树（P0 组装清单）

| 页面 | 组件树（缩进=嵌套；★=新建件） | 数据 |
|---|---|---|
| `/admin/today` | `MiniStatistics`×4（待你确认/进行中/本周发出/放款待办；「待你确认」经 `list_pending_asks` 取数，与侧栏徽标同源）→ 雷达区：`Card` 列表（仅 `ask≠null` 项目——`ask` 为展示聚合层，outbound 条目由 `PendingAction(status=pending)` 派生，红标「对外·不可撤销」；点击 `router.push('/admin/campaigns/'+id+'?env='+ask.env)`；outbound 待办卡另可经 `GET /api/actions/[id]` 拉 pending 详情**重新渲染 ★`GateConfirm` 确认卡**——pending 恢复入口，确认时才签票，支持刷新/跨会话恢复）→ ★`AgentSquad`（6 元入卡：5 环节专家+合规，orchestrator 为汇报者不入卡；数据经 `squad_status`（outputSchema 定 6 元）+ 团队负荷 `Progress`，负荷条固定注「单一角色，仅用于分工」） | `lib/mock/projects.ts` → RSC |
| `/admin/campaigns` | `Card` 项目卡网格（健康度 `CircularProgress` 缩略 + `cur` 环节徽标 + `owner` 标记）；卡片 `router.push` 下钻 | 同上 |
| `/admin/campaigns/[id]` | 项目头 `Card` → ★`StageRail` → ★`StageHeader`(grammar+verb) → ★五 Panel 之一（4.2.4） | RSC 取项目 → client 切 env |
| `/admin/creators` | 筛选 chips 行（Agent 重排候选，非纯前端过滤）→ ★`DataTable`（列含匹配% `Progress`、★`ProvenanceTag`）→ 详情 Chakra `Drawer`（七分区固定，每区 `ProvenanceTag`；第 7 分区三 Agent 判断卡；底栏**仅**「标记关注」「加入匹配」两 internal，禁 outbound 入口，FR-8.3.9） | mock → F003 seed |
| `/admin/knowledge` | 游戏 tab（多库隔离）→ ★`UploadZone` → 素材 `DataTable`（parseStatus 状态图标列）→ 三类特点卡（sell/aud/rules，每条带溯源「基于 N 份素材」可回溯） | `lib/mock/knowledge.ts` |
| `/admin/insight` | KPI `MiniStatistics` → `LineAreaChart`/`BarChart`/`PieChart`(donut options) 看板 → NL 追问入口（送 Copilot）→「对外分享」按钮（唯一闸门，弹 ★`GateConfirm`） | mock → P4 |
| `/admin/runs` | 类型筛选 chips（auto/gate/block/irrev 四类互斥）→ ★`DataTable`（`irrev` 行展开「（你已确认）」归属：发起 Agent/确认人/利害/时间/依据；`block` 行必带拦截原因） | mock → OperationLog |

### 4.2.4 五环节 Panel（D22/FR-7.10/7.11 硬约束）

`stagePanel` 是环节唯一渲染入口；五套语法**结构不同**，不得退化成同一张表换数据：

```ts
// src/components/stage/stage-registry.ts
import type { ComponentType } from 'react';

export type StageEnv = 'brief' | 'match' | 'reach' | 'delivery' | 'insight';
export type AgentId = 'strategy' | 'match' | 'reach' | 'delivery' | 'insight'
                    | 'compliance' | 'orchestrator';

export interface StagePanelProps { projectId: string; }

export interface StageDef {
  env: StageEnv;
  title: string;                    // 'Brief' …
  grammar: '仪表' | '对比矩阵' | '对话收件箱' | '条件台账' | '对照账本';
  verb: 'glance' | 'compare' | 'converse' | 'verify' | 'reconcile';
  agentId: AgentId;                 // 进环节 Copilot 切该专家（FR-9.1）
  Panel: ComponentType<StagePanelProps>;
}

export const STAGES: readonly StageDef[] = [ /* brief→match→reach→delivery→insight 顺序即导轨顺序 */ ];
```

| Panel | 结构性硬约束 | 关键拼装 |
|---|---|---|
| `BriefPanel` | 仪表 glance | ★`HalfGauge`（健康度 0–100，≥80 绿/55–79 橙/<55 红）+ 阻塞卡（附 internal 处置按钮直接执行，不弹框）+ timeline（与导轨共用同一 `cur`） |
| `MatchPanel` | **必横向多方案对比**（≥5 行候选 × 方案列 + Agent 推荐列） | 对比矩阵用 `DataTable` 变体 + 「待你裁定」区（低置信度列存疑原因，不显低分）；「批准这组」= internal **不弹框**（D27） |
| `ReachPanel` | **必单人纵向流**（三栏聚焦一人） | ★`ConversationInbox`（`pick` 切人）+ `TextField` 草稿 +「重写」internal 无限重生成 + 发送按钮 → ★`GateConfirm` |
| `DeliveryPanel` | **必无推荐卡条件台账** | `DataTable` 逐条件行（内容/Key/合同/托管/#ad = 齐`MdCheckCircle`绿/缺`MdCancel`红/不适用），放款按钮**仅在全部必需条件满足时渲染**，无绕过入口 |
| `InsightPanel` | 对照账本 | 原目标 vs 实际两列对账 + 证据缺口显式列（诚实标注不可归因）+「采纳结论」internal 回填下个 Brief |

## 4.3 状态管理策略

**总原则：不引状态库**（zustand/swr/react-query 均未装，P0 不装）。四层足够：URL（路由与 tab 态）+ RSC（首屏取数）+ `useChat`（对话与 canvas 数据流）+ ConfiguratorContext（外壳态）。演进期若出现跨页缓存需求再评估引入。

### 4.3.1 Server / Client 边界与数据获取

- `admin/layout.tsx` 是 `'use client'`，但 `children` 以 slot 传入，**页面仍可为 RSC**——所有 `page.tsx` 默认 Server Component，负责取数并把可序列化 props 传给 client 岛。
- P0（WORKBENCH-UI）：RSC 直接 `import` `lib/mock/*.ts`；数据层落地后同签名换成 `lib/db` 服务（Prisma 查询），页面组件不改（契约先行，D15 同构思路）。
- 图表（ApexCharts）与一切交互件是 client；`ProjectDetail.tsx`、五 Panel、`CopilotPanel` 均 client。
- `?env=` tab 切换在 client 内完成：`useSearchParams` 读 + `router.replace('?env=x', { scroll: false })` 写，Panel 数据 P0 随首屏一次下发（FR-7.7「点节点切落地面，不改路由页」）。
- 工具动作改变了页面数据（如「加入匹配」）→ client 调 `router.refresh()` 重新拉 RSC 数据；演进期按 NFR-P7 给 `get_kol_detail` 类加短 TTL 缓存。
- **对话状态全部在前端**：`useChat` 持有 messages 并逐轮全量回传 `/api/agent`（FR-12.9 运行时无状态，为 RLS 留边界）。服务端不缓存会话，前端也**不做**对话持久化（P0；演进期落 localStorage 需评估）。

### 4.3.2 Copilot 上下文键（copContext）

```ts
// src/components/copilot/useCopilotContextKey.ts
// agentId 推导的唯一权威是 src/lib/agent/resolve.ts 的同构纯函数（前端 import 同一函数；
// 服务端对 /api/agent 请求体 context 重解析、不信任客户端）。本章不自带推导表。
import { resolveAgent } from 'lib/agent/resolve';

export interface CopilotContextKey {
  route: string;              // pathname 第二段：'today' | 'campaigns' | ...
  projectId: string | null;   // /admin/campaigns/[id] 时有值
  env: StageEnv | null;       // 项目详情内的当前环节
  agentId: AgentId;           // = resolveAgent({ pathname, env, projectId })
  key: string;                // contextKey = agentId + ':' + (projectId ?? 'ws') —— 传给 useChat 的 id
}
export function useCopilotContextKey(): CopilotContextKey; // usePathname + useSearchParams + resolveAgent
```

`CopilotPanel` 把 `key` 作为 `useChat({ id: key })` 的会话 id：**key 变化 = 线程重置**为该专家开场白 + 主动汇报「刚刚完成」（FR-7.12 / FR-8.7.9 / FR-9.2）；key 不含 pathname/env，**同一专家在同一项目内跨页保持线程**（无项目上下文归 `'ws'` 工作区线程）。专家的 duty/iso 展示文案取自 `components/copilot/agents.ts`（前端只存展示元数据；system prompt 与工具作用域在服务端按 agentId 切，另章）。

### 4.3.3 ConfiguratorContext 扩展

现有字段全部保留（`mini/hovered/contrast/theme` 及 setter），追加 Copilot 外壳态——它与 `mini` 同属「三区外壳布局态」，放同一 context 合理；若演进期 theme 变更引发的重渲染成为问题，再拆独立 `CopilotShellContext`：

```ts
// src/contexts/ConfiguratorContext.ts（新增字段）
interface ConfiguratorContextType {
  /* —— 现有：mini/setMini/hovered/setHovered/contrast/setContrast/theme/setTheme/sidebarWidth —— */
  copilotOpen: boolean;                       // 桌面折叠 / 移动抽屉开关
  setCopilotOpen: Dispatch<SetStateAction<boolean>>;
  copilotBoot: string | null;                 // CommandBar Enter 注入的指令（FR-8.7.6）
  setCopilotBoot: Dispatch<SetStateAction<string | null>>;
}
```

流转：`CommandBar` Enter → `setCopilotBoot(text)` + `setCopilotOpen(true)`；`CopilotPanel` 消费 `copilotBoot`（`append` 进 `useChat` 后立即 `setCopilotBoot(null)`，遵守不可变更新——用新值替换，不改旧对象）。状态提供方仍是 `AppWrappers.tsx`（`useState` 初始 `copilotOpen: true` 桌面 / 移动由断点判断）。

## 4.4 设计系统与主题

- **单一来源**：Tailwind 3.3（`darkMode: 'class'`）+ `AppWrappers.tsx` 运行时注入 `--color-50..900` 到 `document.documentElement`；`tailwind.config.js` 的 `brand-*` 即 `var(--color-*)`，品牌主色 `--color-500 #422AFB`。
- **深浅色**：默认浅色（根 layout `<body id="root">` 无 dark class）；深色 = `Configurator`/`FixedPlugin` toggle 给 body 加 `dark` class，组件一律用 `dark:` 变体。**禁止**：自建 `data-theme`、第二套 CSS 变量、照搬原型自定义 CSS（FR-12.26）。
- **常用 token → class 对照**（完整表见落地规范 §5）：卡片 = `Card` 默认（`rounded-[20px] shadow-3xl shadow-shadow-500 dark:shadow-none`）；标题 `text-navy-700 dark:text-white`；次级 `text-gray-700`/`text-gray-600`；按钮 `rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400`；闸门红按钮同型 `bg-red-500 hover:bg-red-600`；浅底 `bg-lightPrimary`。
- **产品识别项**（保留、不强对齐 Horizon）：渐变 CTA 卡 `bg-gradient-to-br from-brand-400 to-brand-600`（= SidebarCard 写法）、指令栏、半环仪表、Copilot 列、Agent-live 脉冲。
- **可访问性硬门**：`GateConfirm` 焦点陷阱 + Escape + 语义按钮标签，不仅靠红色（NFR-A1）；`ProvenanceTag` 四类（platform_api/optin·purchased·crawl/user_upload·ai_estimate 分档）用图标+文字区分，不得仅颜色（NFR-A4）；对比度 ≥4.5:1。
- **字体**：P0 沿用现状（Google Fonts `@import`）；演进：`next/font/local` 接 `public/fonts/dm-sans/*.ttf`，Poppins 补 ttf 或保留 CDN（PRD Q2）。
- 每个新页过 `next build + tsc --noEmit + next lint` 全绿 + Playwright visual baseline（浅色 ≥1440px，CI/linux 重生，15.2）。

## 4.5 Generative canvas 前端协议（canvas-registry）

四柱第④柱。核心：工具结果带 `type` 字段，前端按注册表映射到 React 组件；**加新类型 = 加一个 renderer 文件 + 加一行 `registerCanvasRenderer` 注册，不改 CopilotPanel、不改 route.ts**（15.3 canvas 可扩展性断言）。

### 4.5.1 协议类型

```ts
// src/components/canvas/types.ts
import type { ComponentType } from 'react';
import type { StageEnv } from 'components/stage/stage-registry';

// ToolResultPart{type,data,meta:{toolName,toolClass,agentId,createdAt}} 前端信封的唯一权威在
// src/lib/agent/tools/types.ts（工具层章），由执行管线统一组装（data 已过服务端 zod 校验，
// 前端视为受信结构、不再执行 HTML）。本章不复制定义，仅 re-export：
export type { ToolResultPart } from 'lib/agent/tools/types';
import type { ToolResultPart } from 'lib/agent/tools/types';

/** 动作卡导航文法（FR-7.14）：env=切环节 · pick=选中对象 · enter=进项目 */
export type CanvasGo = `env:${StageEnv}` | `pick:${string}` | `enter:${string}`;

/** 与工具层信封一一对应：组件签名 {part,onGo,onFollowUp}，示例一律传 part */
export interface CanvasComponentProps<T = unknown> {
  part: ToolResultPart<T>;
  onGo: (go: CanvasGo) => void;          // CopilotPanel 注入：解析前缀→router.push / setEnv / setPick
  onFollowUp?: (text: string) => void;   // 对话式 Refine（internal，FR-12.11）
}

export type CanvasRenderer<T = unknown> = ComponentType<CanvasComponentProps<T>>;
```

### 4.5.2 注册表（受控 register API，加类型只改一个文件）

```tsx
// src/components/canvas/canvas-registry.tsx —— 受控 register API（唯一核心，此后不再改动）
import PlainResultCard from './renderers/PlainResultCard';
import type { ToolResultPart, CanvasGo, CanvasRenderer } from './types';

const registry = new Map<string, CanvasRenderer<any>>();

/** F005「可扩展不改核心」验收与 G 系 fixture 注入测试均依赖此 API（非 Object.freeze 静态映射） */
export function registerCanvasRenderer(type: string, component: CanvasRenderer<any>): void {
  registry.set(type, component);
}

export function CanvasPart(props: {
  part: ToolResultPart;
  onGo: (go: CanvasGo) => void;
  onFollowUp?: (text: string) => void;
}) {
  const Renderer = registry.get(props.part.type) ?? PlainResultCard; // 未知 type 兜底，不抛错
  return <Renderer part={props.part} onGo={props.onGo} onFollowUp={props.onFollowUp} />;
}
```

```ts
// src/components/canvas/renderers/index.ts —— ★新类型只在此文件加一行注册
import { registerCanvasRenderer } from 'components/canvas/canvas-registry';
import KolCardStream from './KolCardStream';
import KolDetailCard from './KolDetailCard';
import ActionCards from './ActionCards';
import GateConfirmCard from './GateConfirmCard';

registerCanvasRenderer('kol_cards', KolCardStream);      // P0 hello-agent：真实 seed KOL 卡片流
registerCanvasRenderer('kol_detail', KolDetailCard);     // P0
registerCanvasRenderer('action_cards', ActionCards);     // P0：{icon,title,sub,go}[]
registerCanvasRenderer('gate_confirm', GateConfirmCard); // P0/F008：outbound pending 确认卡
// registerCanvasRenderer('match_plan', MatchPlanMatrix); // 演进 P2 —— 加一行即渲染
// registerCanvasRenderer('roi_report', RoiReportCard);   // 演进 P4
```

### 4.5.3 安全与渲染纪律

- **受控组件树**：canvas 只渲染结构化 `data` 到受控 React 组件，**禁 `dangerouslySetInnerHTML`** 承接任何模型产文本（FR-12.16/NFR-S7）；模型文本一律作为 React text node 输出。lint 机制强制：`react/no-danger` 以 **error 级**覆盖 `src/components/canvas/**` 与 `src/components/copilot/**` 两目录。
- **溯源必带**：canvas 内每个展示数据点渲染 ★`ProvenanceTag`（`fieldProvenance[field]` → 回退行级 `dataSource` → 皆空视为 `ai_estimate` 保守下限；null 显「待接入」，FR-7.21/FR-12.14）。
- **internal/outbound 二分在 UI 的兑现**：internal 结果（KOL 卡、动作卡、Refine）点击即执行**不弹框**（FR-10.6）；`gate_confirm` 是 outbound 工具被服务端拦截后（创建 `PendingAction(status=pending)` + 流回 harm 结构体；**拦截时不下发任何令牌**）流回的**唯一**确认入口；刷新/跨会话经 `GET /api/actions/[id]` 恢复确认卡（4.5.4）。
- 流式消息容器 `aria-live="polite"`（NFR-A2）；30 张 KOL 卡渲染 <500ms、滚动 60fps（NFR-P6，P0 直接列表渲染，演进期需要时上虚拟滚动）。

### 4.5.4 GateConfirmCard 前端契约（F008 对接点）

```ts
// gate_confirm 的 data 形状：harm 披露结构体的唯一 zod 权威在 src/lib/agent/gate/harm.ts（闸门章）：
// { title:string, irreversibleLabel: z.literal('对外·不可撤销') /* 无空格，逐字符定死 */,
//   facts:string[], recipients:[{displayName,platform,handle?}], amount?, scope?, basis? }
// 本章不复制字段定义，一律 z.infer 引用：
import type { z } from 'zod';
import { harmSchema } from 'lib/agent/gate/harm';
export type GateConfirmData = z.infer<typeof harmSchema>;
// part 另携 pendingActionId（PendingAction uuid，仅为标识、非令牌——拦截时不下发任何令牌；
// 一次性票仅在 confirm 响应中出现一次，不变量 I3）。recipients 全名单逐一列出，不折叠（FR-10.5）；
// amount 带币种（NFR-I4）。
```

`GateConfirmCard` 内嵌 ★`GateConfirm`（Chakra Modal 版同一组件复用于页面内闸门按钮）。确认流走两步票据契约（权威定义见闸门章 A4）：「确认执行」→ ① `POST /api/actions/[id]/confirm`（人确认→响应签发一次性票，票仅在此响应出现一次）→ ② `POST /api/actions/[id]/execute` `{ticket}`（消费票执行）；「驳回」→ `POST /api/actions/[id]/reject`；刷新/跨会话经 `GET /api/actions/[id]` 拉 pending 详情重新渲染确认卡（确认时才签票）。execute 成功后向对话追加执行结果、`router.refresh()` 主区。**无阈值分级，一律一次确认**（D28）；`irrev` 留痕由服务端在副作用成功后与 finalize(executed) 同事务写入（闸门章语义，FR-8.6.7），前端不补写日志。

### 4.5.5 加新 canvas 类型 How-to（写进 docs/dev/agent-architecture.md 的操作序列）

1. 服务端：新工具在注册表声明输出 `type`（另章）。
2. 前端：`src/components/canvas/renderers/` 新建 `<TypeName>.tsx`，实现 `CanvasRenderer<TData>`。
3. 前端：`renderers/index.ts` 加一行 `registerCanvasRenderer('<type>', Component)` 注册。
4. 验证：`CopilotPanel.tsx`、`canvas-registry.tsx`、`/api/agent/route.ts` **零改动**——若 PR diff 触碰这三个文件，即违反 FR-12.3/15.3，Evaluator 拒收。

---

## 5. Agent 运行时架构

> 本章覆盖技术四柱中的 ①工具层 与 ②Agent 运行时，以及运行在其上的多 Agent 编队与协同交接。四柱解耦铁律（FR-12.3）：新增工具（①）或新增结果类型（④）都不改 `route.ts` 核心（②）与对话面外壳（③）。柱③④（useChat/CopilotPanel/canvas-registry 的组件实现）与闸门确认卡 UI 见对应章节，本章只写到协议边界。

### 5.0 目录落位与现状衔接

当前代码库**无 `src/app/api/`、无 `src/lib/`、无数据层**——本章全部为新建。遵循项目导入约定：业务代码一律裸 src 导入（`tsconfig.json` `baseUrl: "src"`，写 `import { registry } from 'lib/agent/tools/registry'`），不新增 `@/` 别名；保留既有 `@/public/*` 静态资源映射（tsconfig paths 已存在）。

```
src/
├── app/api/
│   ├── agent/route.ts              # ② 运行时入口：边界校验 + 委托 lib/agent/runtime.ts（F004）
│   └── actions/[id]/               # 闸门两步票据契约的唯一端点组（权威契约见闸门章）
│       ├── route.ts                # GET：pending 详情（今天雷达卡/项目页恢复确认卡的入口）
│       ├── confirm/route.ts        # POST：人确认 → 签发一次性票（票仅在此响应出现一次，I3；F008）
│       ├── execute/route.ts        # POST {ticket}：消费票 → 执行 outbound 副作用（F008，模型 loop 之外）
│       └── reject/route.ts        # POST：拒绝
└── lib/
    ├── ai/gateway.ts               # aigcgateway provider（F002，OpenAI 兼容 baseURL；env 经 src/lib/env.ts serverEnv()，启动校验入口 src/instrumentation.ts）
    └── agent/
        ├── runtime.ts              # ② streamText 流式 loop 核心（route.ts 薄壳调用）
        ├── resolve.ts              # route/env → AgentId（纯函数，前后端同构复用）
        ├── prompt.ts               # buildSystemPrompt 五层组装管线
        ├── context.ts              # 环节上下文快照 + 游戏知识注入取数
        ├── handoff.ts              # 交接记录读写
        ├── schemas.ts              # 本域 zod schema 汇集（FR-11.20：schema 是形状唯一权威）
        ├── gate/
        │   ├── ticket.ts           # 一次性票签发/校验/消费（票 TTL 常量唯一定义处，见闸门章）
        │   ├── harm.ts             # harm 结构体唯一 zod 定义（本章 5.1.1 仅 z.infer 引用）
        │   └── pending.ts          # PendingAction 落行与状态机操作
        ├── tools/
        │   ├── types.ts            # 工具层类型唯一权威：ToolDefinition / ToolContext / StageScope / ToolOutcome / ToolResultPart / OUTBOUND_TOOL_NAMES
        │   ├── registry.ts         # 注册表：register / getTool / listTools / getToolsForAgent / toAiSdkTools
        │   ├── index.ts            # 显式注册入口（import 全部工具文件并 register + OUTBOUND_TOOL_NAMES 装载断言）
        │   └── search-kols.ts · get-kol-detail.ts · send-outreach.ts · …   # 各工具一文件（文件名 kebab，工具名 snake_case）
        └── experts/
            ├── types.ts            # ExpertDefinition / AgentId
            ├── base-prompt.ts      # 基座层文本（常量）
            ├── strategy.ts · match.ts · reach.ts · delivery.ts · insight.ts · compliance.ts · orchestrator.ts
            └── index.ts            # EXPERTS 名册（Record<AgentId, ExpertDefinition>）
```

**依赖前置（F004 落地时安装，现均未装）：** `ai`（Vercel AI SDK）+ OpenAI 兼容 provider 包 + `zod` + `prisma`/`@prisma/client`。版本注记（ADR-008 统一口径）：**TS 5.x 升级走独立微批次，在 F002 启动前完成**（升级 + 构建门全绿，不与 F001–F008 混批）；此后 zod / Prisma / AI SDK 均按 TS5 选版（AI SDK v5 要求 TS ≥5）。

### 5.1 工具层：注册表（柱①，F004）

#### 5.1.1 ToolDefinition schema

```ts
// src/lib/agent/tools/types.ts —— 工具层类型唯一权威文件（其余各章不再自带私有工具类型定义）
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { HarmDisclosure } from 'lib/agent/gate/harm';
// ↑ harm 结构体的权威 zod 定义见闸门章 src/lib/agent/gate/harm.ts（本文件仅 z.infer 类型引用）。
//   要点：{ title: string, irreversibleLabel: z.literal('对外·不可撤销') /*无空格，逐字符定死*/,
//          facts: string[], recipients: [{ displayName, platform, handle? }], amount?, scope?, basis? }
//   G2 断言路径同步为 harm.irreversibleLabel === '对外·不可撤销'。

export type ToolKind = 'internal' | 'outbound';

/** 环节作用域：五环节 + 合规（跨环节被调用）+ 工作区层（今天/记录/库页/编排） */
export type StageScope =
  | 'brief' | 'match' | 'reach' | 'delivery' | 'insight'
  | 'compliance'
  | 'workspace';

export interface ToolContext {
  tenantId: string;        // P0 = 硬编码 dev tenant（D4）
  userId: string;          // P0 = 唯一 dev 用户
  agentId: AgentId;        // 当前专家 → OperationLog.actorId（actorType='agent'）
  projectId?: string;
  gameId?: string;
  env?: StageScope;
  db: PrismaClient;
  ai: GatewayProvider;     // src/lib/ai/gateway.ts 导出的 provider 句柄
}

/**
 * outbound 工具白名单（唯一常量定义处）。口径分辨（与 PRD 一致）：
 * 语义类别 5 类（发信/报价/放款/分发 Key/对外分享，批量发=发信类的批量形态）；
 * 工具名 6 个——批量发独立成工具，因其 harm 必须列全收件人名单。
 * 装载断言：tools/index.ts 注册完毕后校验注册表内 kind='outbound' 的名字集合
 * 与本常量完全相等（多一名、少一名都在启动时抛错）。
 */
export const OUTBOUND_TOOL_NAMES = [
  'send_outreach', 'send_bulk_outreach', 'commit_quote',
  'payout', 'distribute_keys', 'create_share_link',
] as const;
export type OutboundToolName = (typeof OUTBOUND_TOOL_NAMES)[number];

export interface ToolDefinition<
  In extends z.ZodTypeAny = z.ZodTypeAny,
  Out extends z.ZodTypeAny = z.ZodTypeAny,
> {
  name: string;            // 全局唯一；三重同名：AI SDK 工具名 = OperationLog.action = 本字段
  description: string;     // 面向模型：何时调用、参数含义、返回什么
  kind: ToolKind;          // internal | outbound —— 闸门分流与日志 toolClass 的唯一依据（取代已作废的 allowedRoles）
  scopes: StageScope[];    // 出现在哪些专家的候选工具集里（发现机制的过滤键）
  inputSchema: In;         // zod：既生成 AI SDK parameters，又做运行时入参校验（NFR-S6）
  outputSchema: Out;       // zod：execute 返回值出口校验（模型输出/DB 数据同样视为不可信边界）
  resultType: string;      // canvas-registry 的 type 路由键（'kol_cards' / 'match_plan' / 'gate_confirm' …）
  execute: (input: z.infer<In>, ctx: ToolContext) => Promise<z.infer<Out>>;
  disclose?: (input: z.infer<In>, ctx: ToolContext) => Promise<HarmDisclosure>;
  // 不变量：outbound 必须实现 disclose；internal 不得实现（register 时校验，见 5.1.2）
}

/** runTool 归一化出口的判别联合（执行管线内部形态，见 5.1.3） */
export type ToolOutcome =
  | { kind: 'result'; resultType: string; data: unknown }                       // internal 正常产物
  | { kind: 'gate_pending'; pendingActionId: string; harm: HarmDisclosure };    // outbound 拦截——不含任何令牌（I3）

/** 前端信封：执行管线统一组装；柱④ canvas 组件签名 { part, onGo, onFollowUp } 与其一一对应 */
export interface ToolResultPart {
  type: string;                       // canvas-registry 路由键（'kol_cards' / 'gate_confirm' …）
  data: unknown;                      // outputSchema 校验后的数据；gate_pending 时为 { pendingActionId, harm, status:'pending' }
  meta: { toolName: string; toolClass: ToolKind; agentId: AgentId; createdAt: string };
}
```

#### 5.1.2 注册与发现机制

**注册 = 显式 import**（Next.js 打包器不支持运行时目录扫描，不做 fs 魔法）：每个工具一个文件、default export 一个 `ToolDefinition`；`tools/index.ts` 逐行 import 并调用 `register()`。**加新工具 = 新建一个文件 + index.ts 加一行 + canvas-registry 加一个组件**，`route.ts` 零改动（FR-12.6 / FR-9.6 验收断言）。

```ts
// src/lib/agent/tools/registry.ts（要点伪码）
const tools = new Map<string, ToolDefinition>();

export function register(def: ToolDefinition): void {
  if (tools.has(def.name)) throw new Error(`duplicate tool: ${def.name}`);
  if (def.kind === 'outbound' && !def.disclose)
    throw new Error(`outbound tool ${def.name} must implement disclose()`);
  if (def.kind === 'internal' && def.disclose)
    throw new Error(`internal tool ${def.name} must not declare disclose()`);  // 假闸门防线（D27/FR-10.6）
  tools.set(def.name, def);
}

export function getTool(name: string): ToolDefinition | undefined;
export function listTools(scope?: StageScope): ToolDefinition[];          // 发现：按环节过滤
export function getToolsForAgent(agentId: AgentId): ToolDefinition[];     // 交叉校验：EXPERTS[agentId].toolNames
                                                                          // 白名单 ∩ 注册表；名单里有未注册名 → 启动即抛错
```

#### 5.1.3 执行包装管线（zod → 闸门 → 执行 → 留痕 → type 路由）

`toAiSdkTools()` 把注册表条目转成 AI SDK `tools` 对象，每个工具的 `execute` 统一包在 `runTool` 管线里——**这是闸门在 loop 内的唯一咬合点**：

```ts
// src/lib/agent/tools/registry.ts
export function toAiSdkTools(defs: ToolDefinition[], ctx: ToolContext) {
  return Object.fromEntries(defs.map((def) => [def.name, tool({
    description: def.description,
    parameters: def.inputSchema,
    execute: (raw) => runTool(def, raw, ctx),
  })]));
}

// 归一化出口为 ToolOutcome 判别联合，再统一组装前端信封 ToolResultPart（类型见 5.1.1）
async function runTool(def: ToolDefinition, raw: unknown, ctx: ToolContext): Promise<ToolResultPart> {
  const input = def.inputSchema.parse(raw);                       // ① 入参校验，失败即清晰报错不静默吞
  const meta = { toolName: def.name, toolClass: def.kind, agentId: ctx.agentId, createdAt: new Date().toISOString() };

  if (def.kind === 'outbound') {                                  // ② 闸门分流（FR-10.1/10.2 运行时硬约束）
    const harm = await def.disclose!(input, ctx);
    const pendingActionId = await createPendingAction(ctx, def.name, input, harm); // gate/pending.ts：PendingAction(status='pending') 落行 + gate 类留痕
    return { type: 'gate_confirm', data: { pendingActionId, harm, status: 'pending' as const }, meta };
    // 注意：此分支【不存在】调用 def.execute 的代码路径，且拦截时不下发任何令牌
    //（不变量 I3：票仅在 confirm 响应中出现一次，禁止令牌随 SSE/data-gate 流下发）。
    // 模型「决定」直调 outbound 也只能拿到 pending 结果 —— 无法自我放行。
  }

  const output = def.outputSchema.parse(await def.execute(input, ctx));  // ③ 执行 + 出参校验
  await appendAutoLog(ctx, def.name, input);                      // ④ internal 也留痕（gateStatus=null，FR-11.14）
  return { type: def.resultType, data: output, meta };            // ⑤ 统一信封 → canvas-registry 按 type 路由（柱④协议）
}
```

outbound 的真实执行发生在 **loop 之外**，走**两步票据契约**（唯一权威契约见闸门章，本章不再自带端点设计）：确认卡（`type:'gate_confirm'` 由 canvas 渲染为 `GateConfirm` 组件）点击确认 → `POST /api/actions/[id]/confirm`（人确认 → 签发一次性票；**票仅在 confirm 响应中出现一次**，不变量 I3——拦截时不下发任何令牌，禁止令牌随 SSE/data-gate 流下发）→ `POST /api/actions/[id]/execute { ticket }`（消费票 → 调用 `def.execute` 产生副作用 → 成功则**同事务** finalize(executed) + INSERT `irrev` 留痕；副作用失败 → `failed`、无 irrev 行）；拒绝走 `POST /api/actions/[id]/reject`；pending 恢复走 `GET /api/actions/[id]`（今天雷达卡/项目页重新渲染确认卡）。票的签发/校验/一次性消费在 `src/lib/agent/gate/ticket.ts`，PendingAction 状态机在 `gate/pending.ts`，细节归闸门章节；本章只保证不变量：**票通道与模型消息流零交集**。

#### 5.1.4 工具清单与落地节奏

| 工具名 | kind | scopes | resultType | 落地 |
|---|---|---|---|---|
| `search_kols`（NL→bge-m3→pgvector cosine top-K） | internal | match, workspace | `kol_cards` | **P0 F004 实装** |
| `get_kol_detail` | internal | match, reach, workspace | `kol_detail` | **P0 F004 实装** |
| `evaluate_creator` / `match_plan` | internal | match | `evaluation` / `match_plan` | P2 MATCH |
| `draft_email` / `refine_email` | internal | reach | `email_draft` | P3 REACH-CRM |
| `track_delivery` / `check_deliverables` | internal | delivery | `delivery_ledger` | P4 |
| `compute_roi` / `draft_report` | internal | insight | `roi_report` / `weekly_report` | P4 |
| `check_brand_safety` / `check_platform_compliance` | internal | compliance | `compliance_verdict` | P2 起（被调用形态见 5.4） |
| `list_pending_asks` / `summarize_squad` | internal | workspace | `ask_cards` / `squad_status` | WORKBENCH-UI 接真 |
| `send_outreach` / `send_bulk_outreach` / `commit_quote` | **outbound** | reach | `gate_confirm` | 门控管线 **P0 F008** 全量；工具体逐环节批次 |
| `distribute_keys` / `payout` | **outbound** | delivery | `gate_confirm` | 同上（P4 实装 execute） |
| `create_share_link` | **outbound** | insight | `gate_confirm` | 同上（P4 实装 execute） |

口径分辨（与 PRD 一致）：对外不可撤销是**语义类别 5 类**（发信 / 报价 / 放款 / 分发 Key / 对外分享，批量发=发信类的批量形态）；落到**工具白名单是 6 个工具名**（`OUTBOUND_TOOL_NAMES`，见 5.1.1——批量发独立成工具，因其 harm 必须列全收件人名单）。

P0（F004+F008）验收线：`search_kols`/`get_kol_detail` 真实走通 + 六个 outbound 在注册表**声明齐全**（装载断言对齐 `OUTBOUND_TOOL_NAMES`）、闸门管线（pending/403、harm、票据、留痕）端到端可测（G1–G5 + D20 变异测试），outbound 的 `execute` 体允许是骨架。

### 5.2 `/api/agent`：streamText 流式 loop（柱②，F004）

#### 5.2.1 请求契约与处理步骤

```ts
// POST /api/agent —— 请求体（zod 校验于入口，schemas.ts）
interface AgentRequestBody {
  messages: UIMessage[];        // useChat 逐轮全量回传（FR-12.9 运行时无状态，为 RLS 留边界）
  context: {
    pathname: string;           // 如 '/admin/campaigns/abc123'
    env?: StageScope;           // 项目详情内 ?env= 游标
    projectId?: string;
    gameId?: string;
  };
}
```

`route.ts` 五步，每步各归其位、核心不随工具增长而改动：

1. **边界校验**：`agentRequestSchema.parse(body)`（NFR-S6）。
2. **服务端解析专家**：`const agentId = resolveAgent(body.context)` ——**客户端只上报位置（route/env），永远不点名 agent、不点名工具**；工具作用域由服务端从 agentId 推导，杜绝伪造扩权。
3. **组装**：`expert = EXPERTS[agentId]`；`toolDefs = getToolsForAgent(agentId)`；`system = await buildSystemPrompt(expert, body.context)`（五层管线，见 5.3.3）。
4. **起流**：
   ```ts
   const result = streamText({
     model: gateway.chat(expert.model ?? DEFAULT_CHAT_MODEL),  // NFR-P8 按专家/任务路由模型，P0 单模型
     system,
     messages: convertToModelMessages(body.messages),
     tools: toAiSdkTools(toolDefs, ctx),
     maxSteps: 8,               // AI SDK v5 等价写法：stopWhen: stepCountIs(8)
     onStepFinish: recordUsage, // FR-12.29~31 成本记账挂点（P0 只落 log，后期喂模型路由）
     onError: toUserFacingError,// FR-12.7 失败清晰不静默吞：流内 error part + 服务端全量上下文日志
   });
   ```
5. **回流**：`return result.toUIMessageStreamResponse()`（SSE，UI Message Stream 协议）。

**maxSteps=8 的依据**：「一句话跨多环节办事」（FR-8.7.7）典型串联为 搜索→评估→组方案→起草 约 4–6 步，8 步留余量；同时是失控循环的硬顶。单工具场景（hello-agent「找东南亚原神向 KOL」）1 步收敛，不受影响。

#### 5.2.2 流式协议到 useChat（柱②→③④的边界）

服务端流出的 UI Message Stream 由 `useChat`（`CopilotPanel` 内，`api: '/api/agent'`，`body` 挂 context）消费为 `message.parts`：`text` part 增量渲染（首 token 即出，NFR-P1 TTFT<2s；`aria-live="polite"`，NFR-A2）；工具 part 经历 `input-streaming → input-available → output-available` 三态，`output-available` 时按 `output.type` 查 canvas-registry：

```tsx
// CopilotPanel 消费侧（柱③④细节见对应章节，此处仅示分发边界）
// part.output 即 5.1.1 的 ToolResultPart 信封；canvas 组件签名 { part, onGo, onFollowUp } 与该信封一一对应
if (part.type.startsWith('tool-') && part.state === 'output-available') {
  const C = canvasRegistry[part.output.type];          // ToolResultPart.type：'kol_cards' → KolCardStream；'gate_confirm' → GateConfirm
  return C ? <C part={part.output} /> : <UnknownResultFallback part={part.output} />;
}
```

`route.ts` 不含任何 `type→组件` 知识；canvas 只走受控 React 组件树、禁 `dangerouslySetInnerHTML` 承接任何模型文本（FR-12.16/NFR-S7）。

#### 5.2.3 Agent loop 时序图（含闸门分支）

```mermaid
sequenceDiagram
    autonumber
    actor U as 操盘手
    participant CP as CopilotPanel<br/>(useChat)
    participant RT as /api/agent<br/>(streamText loop)
    participant REG as tools/registry<br/>(runTool 管线)
    participant GW as aigcgateway<br/>(chat tool-calling)
    participant DB as Postgres<br/>(pgvector·PendingAction·OperationLog)
    participant GC as /api/actions/[id]<br/>(confirm·execute·reject)

    U->>CP: 「给这 3 位起草邮件并发出」
    CP->>RT: POST messages + context{pathname, env, projectId}
    RT->>RT: resolveAgent → reach<br/>buildSystemPrompt（基座+职责+iso+环节+游戏知识）
    RT->>GW: streamText(system, tools=reach 工具子集, maxSteps=8)
    GW-->>CP: text delta（首 token 即出）
    GW->>REG: tool call: draft_email(input)
    REG->>REG: inputSchema.parse ✓ · kind=internal
    REG->>DB: execute（读 Kol/知识）+ appendLog(internal, gateStatus=null)
    REG-->>GW: {type:'email_draft', …}（outputSchema.parse ✓）
    GW-->>CP: tool part → canvas 渲染草稿卡（internal 不弹确认框，D27）
    GW->>REG: tool call: send_outreach(input)
    REG->>REG: kind=outbound → 不进入 execute
    REG->>DB: PendingAction(status='pending') 落行 + gate 类留痕
    REG-->>GW: ToolResultPart{type:'gate_confirm', data:{pendingActionId, harm}, meta}
    GW-->>CP: tool part → GateConfirm 卡（「对外·不可撤销」+ 收件人全名单）
    Note over GW,REG: 模型只见 pending 结果——拦截时不下发任何令牌，loop 内无票通道，无法自我放行（FR-10.1/10.2，I3）
    U->>CP: 审阅利害，点「确认发送」
    CP->>GC: POST /api/actions/[id]/confirm（人确认）
    GC-->>CP: 一次性票（票仅在此响应出现一次，I3）
    CP->>GC: POST /api/actions/[id]/execute {ticket}
    GC->>DB: 消费票 → def.execute 真实发送<br/>副作用成功 → 同事务 finalize(executed) + INSERT irrev 行（失败 → failed、无 irrev 行）
    GC-->>CP: 执行结果 → 卡片翻转为「已发送（你已确认）」
```

### 5.3 多 Agent 编队实现

#### 5.3.1 专家定义：system prompt 模板 + 工具作用域子集

一个专家 = 人格化的四柱视图：`ExpertDefinition` 同时是 **prompt 数据源**和 **UI 职责/隔离卡数据源**（文案单源，FR-7.13/FR-9.1 的卡片由 `CopilotPanel` 直接 import 同一定义渲染，防 prompt 与 UI 漂移）。

```ts
// src/lib/agent/experts/types.ts
export type AgentId =
  | 'strategy' | 'match' | 'reach' | 'delivery' | 'insight'
  | 'compliance' | 'orchestrator';

export interface ExpertDefinition {
  id: AgentId;
  displayName: string;              // 「策略 Agent」…
  stage: StageScope;                // 主场；compliance='compliance'，orchestrator='workspace'
  grammar?: { name: string; verb: string };  // 环节界面语法标签（FR-7.10，如 {name:'compare', verb:'对比'}）
  duty: string;                     // 职责层文案（= UI 职责卡）
  iso: string[];                    // 否定式隔离条目（= UI 隔离卡 = prompt 隔离层，见 5.3.5）
  toolNames: string[];              // 工具作用域白名单（服务端唯一权能来源）
  openingLine: string;              // 上下文切换后的开场白（FR-7.12）
  knowledgeKinds: ('selling_point' | 'audience' | 'compliance_redline')[];  // 注入哪几类游戏知识
  model?: string;                   // 可选模型路由位（NFR-P8，P0 不填走默认）
}
```

**编队名册与工具作用域**（源自 FR-12.17 + §10 outbound 清单）：

| AgentId | 主场 | internal 子集 | outbound 子集 | 注入知识 kind |
|---|---|---|---|---|
| `strategy` | brief | 素材解析/知识抽取（P1）、draft_brief、健康度 | — | selling_point, audience |
| `match` | match | search_kols、get_kol_detail、evaluate_creator、match_plan | — | audience |
| `reach` | reach | draft_email、refine_email、get_active_plan、get_kol_detail | send_outreach、send_bulk_outreach、commit_quote | selling_point |
| `delivery` | delivery | track_delivery、check_deliverables | distribute_keys、payout | —（红线经合规被调用取得） |
| `insight` | insight | compute_roi、draft_report | create_share_link | — |
| `compliance` | 跨环节 | check_brand_safety、check_platform_compliance | — | compliance_redline |
| `orchestrator` | workspace | list_pending_asks、summarize_squad、search_kols、get_kol_detail | — | — |

#### 5.3.2 Copilot 上下文切换协议：route/env → agent 解析

```ts
// src/lib/agent/resolve.ts —— 纯函数、零 IO，前后端同构复用
const STAGE_AGENT: Record<string, AgentId> = {
  brief: 'strategy', match: 'match', reach: 'reach', delivery: 'delivery', insight: 'insight',
};

export function resolveAgent(ctx: { pathname: string; env?: string }): AgentId {
  if (ctx.pathname.startsWith('/admin/campaigns/') && ctx.env && STAGE_AGENT[ctx.env])
    return STAGE_AGENT[ctx.env];                      // 项目详情五环节 tab（?env=）
  if (ctx.pathname.startsWith('/admin/creators'))  return 'match';     // 创作者库=发现分流（FR-7.5）
  if (ctx.pathname.startsWith('/admin/knowledge')) return 'strategy';
  if (ctx.pathname.startsWith('/admin/insight'))   return 'insight';
  return 'orchestrator';   // /admin/today · /admin/runs · /admin/campaigns 列表 · 兜底
}
```

- **客户端**：`CopilotPanel` 监听 `usePathname()` + `useSearchParams().get('env')`，计算 `contextKey = agentId + ':' + (projectId ?? 'ws')`（`agentId = resolveAgent(ctx)`；无项目上下文取 `'ws'` 工作区哨兵值）；把 `contextKey` 作为 `useChat` 的会话 id——**key 变化 = 线程重置 + 插入该专家 `openingLine`**（FR-7.12 / FR-8.7.9），并主动汇报「刚刚完成」（FR-9.2，见 5.3.4 数据来源）。**同一专家在同一项目内跨页保持线程**（contextKey 不变则线程不重置）。
- **服务端**：`route.ts` 用同一个 `resolveAgent` 对请求体 context **重新解析**，绝不接受客户端指定的 agentId 或工具名单——resolver 是同构纯函数，但**权能裁决只发生在服务端**。

#### 5.3.3 System prompt 组装管线（五层）

```ts
// src/lib/agent/prompt.ts
export async function buildSystemPrompt(expert: ExpertDefinition, ctx: AgentRequestContext) {
  return [
    BASE_PROMPT,                                        // ① 基座层
    dutySection(expert),                                // ② 职责层
    isoSection(expert),                                 // ③ 隔离层（D13 否定式护栏）
    await stageContext(ctx),                            // ④ 环节上下文层（lib/agent/context.ts）
    await gameKnowledgeSection(ctx, expert.knowledgeKinds), // ⑤ 游戏知识注入层
  ].filter(Boolean).join('\n\n---\n\n');
}
```

| 层 | 内容 | 数据来源 |
|---|---|---|
| ① 基座 | 产品世界观（单角色操盘手、AI 主驾人拍板）；工具结果协议（一切结构化产出必经工具，不徒手编数据）；溯源诚实规则（缺值=「待接入」，绝不用 0 或编造冒充，FR-11.17/FR-8.2.2.4）；语言约定（UI 中文，触达邮件按 KOL 语言，NFR-I2） | `experts/base-prompt.ts` 常量 |
| ② 职责 | `expert.duty` + 环节界面语法（grammar/verb，约束产出形态：match 出对比矩阵、reach 出单人纵向流） | ExpertDefinition |
| ③ 隔离 | 否定式护栏，见 5.3.5 | ExpertDefinition.iso |
| ④ 环节上下文 | 项目快照：`cur` 游标、ProjectKol 5 态计数、阻塞项、**指向本专家的最近 Handoff 摘要**（5.4） | `context.ts` 现查 DB |
| ⑤ 游戏知识 | `gameId` → `GameKnowledge` where `kind in expert.knowledgeKinds` and `supersededById is null`，逐条附 `sourceMaterialIds` 溯源标注 | `context.ts` 现查 DB |

⑤ 每轮请求**现查现组**（无服务端缓存，FR-12.9）——这正是 FR-8.4.9「特点是工具调用输入非硬编码」的实现：知识更新后，下一轮对话自动用新值，无需任何失效逻辑。P0 知识条目量小直接全量注入；后期演进为按 token 预算裁剪 top-N + embedding 相关性排序。

#### 5.3.4 编排 Agent 的跨环节汇总

`orchestrator` 只做两件事（FR-9.6）：**待办汇总**与**环节调度**，不下场做环节工作。

- `list_pending_asks`：「待你确认」的**单一取数工具**——`Project.ask` 是展示聚合层，其 outbound 条目由 `PendingAction(status='pending')` 派生；按紧急度排序输出 `type:'ask_cards'`。「今天」页 KPI「待你确认」与雷达卡徽标计数均经**本工具**取数（server component 直调其 `execute`），保证同源（FR-8.1.3）。outbound 类待办标红「对外不可撤销」（FR-8.1.2）。
- `summarize_squad`：聚合各环节最近 OperationLog（auto/gate 条目）→ 输出 `type:'squad_status'`，squad 卡固定 **6 元入卡（5 环节专家 + 合规）**；orchestrator 是汇报者，不入卡；`outputSchema` 定死 6 元 + 各环节「刚刚完成」（FR-8.1.4；也是 5.3.2 专家切入时汇报的数据源）。
- **不改写/软化铁律**（FR-9.6 + FR-10.8）的机制化落法：这两个工具只做 SELECT 聚合，`outputSchema` 中 pending 结论字段定义为原样透传（无任何改写/过滤参数）；再在 orchestrator 的 iso 层声明「我不改写、不软化任何专家的 pending 结论」——数据层强制 + prompt 层承诺双保险。
- 跨环节跳转：产出 `type:'action_cards'`（`{icon,title,sub,go}`，`go` 前缀 `env:`/`pick:`/`enter:`），由 canvas 侧解释执行导航（FR-7.14/FR-8.1.6）。

#### 5.3.5 否定式护栏 D13 的注入方式

D13 升级版语义：**AI 的行为边界**（非已作废的角色数据边界）。`expert.iso` 是唯一文案源，同时注入三处：prompt 隔离层、Copilot 常驻隔离卡、Agent 编队页展示。

隔离条目固定否定句式，覆盖两个维度：

- **横向（Agent 间分工）**：如 match 的 `iso`——「我不会替你联系创作者、不谈价——入选组合我会交接给触达 Agent」；delivery——「我不选人、不谈判」。越界请求的回应模式写进基座层：**不是拒答，而是指路**（「这属于 X Agent 的职责，切到 Y 环节我把上下文带过去」）。
- **纵向（AI→人闸门）**：如 reach 的 `iso`——「发送邮件、确认报价是对外不可撤销动作，我只能起草并备好，由你确认后才会发出」。

**承诺与兑现一致性（FR-10.7）机制化**：单测断言每个专家 iso 中提及的 outbound 行为 ⊆ 该专家 `toolNames` 中 `kind='outbound'` 的工具集合，且注册表中该工具确实走 5.1.3 的 pending 分支——prompt 说「我不会直接发」与服务端 403/pending 必须指向同一批工具，任何一侧漂移测试即红（配合 D20 变异测试）。此外对话面顶部常驻「只做可撤销的事…」声明（FR-7.16）由柱③渲染，文案同样取自基座层常量，单源。

#### 5.3.6 多 Agent 切换时序图（含交接引用）

```mermaid
sequenceDiagram
    autonumber
    actor U as 操盘手
    participant PG as 项目详情页<br/>(?env= 环节导轨)
    participant CP as CopilotPanel
    participant RES as resolveAgent<br/>(同构纯函数)
    participant RT as /api/agent
    participant DB as Postgres<br/>(Handoff·GameKnowledge·ProjectKol)

    Note over PG,CP: env=match，匹配 Agent 在场
    U->>CP: 「批准这组」（internal，点了即办不弹框，D27）
    CP->>RT: match_plan 确认动作
    RT->>DB: ProjectKol 5 人置「已确认」+ 写 Handoff(match→reach, artifact=match_plan)
    U->>PG: 点导轨 Reach 节点（?env=reach，cur 前移）
    PG->>CP: route/env 变化（外壳不重挂载，FR-7.1）
    CP->>RES: resolveAgent({pathname, env:'reach'}) → 'reach'
    CP->>CP: contextKey 变化 → 线程重置 + reach openingLine（FR-7.12/8.7.9）<br/>职责/隔离卡切换为 reach.duty / reach.iso
    U->>CP: 首条消息「开始触达吧」
    CP->>RT: POST messages + context{pathname, env:'reach', projectId}
    RT->>RES: 服务端重解析 → 'reach'（不信任客户端点名）
    RT->>DB: stageContext：读 Handoff(toAgent='reach') 最近条 + selling_point 知识
    RT->>RT: buildSystemPrompt(reach 五层) + toAiSdkTools(reach 工具子集)
    RT-->>CP: 「匹配 Agent 刚交来 5 人组合（受众契合 82%…），我先为首位起草」（FR-9.2 主动汇报）
    Note over RT,DB: reach 经 get_active_plan 工具消费 match 的持久化产物 —— 工具级共享（5.4）
```

### 5.4 协同交接机制

#### 5.4.1 两种实现形态：工具级共享 vs 子 Agent 调用

| 维度 | 工具级共享（P0–P3 主用） | 子 Agent 调用（后期演进） |
|---|---|---|
| 形态 | 上游把产物**持久化到 DB**，下游经自己作用域内的读工具取用 | 某工具 `execute` 内部再起一次 `generateText`（子专家 prompt + 子工具集），同步拿结论 |
| 典型例 | `match_plan` 确认 → 写 ProjectKol + Handoff；reach 用 `get_active_plan` 读 | delivery 的 `check_deliverables` 内部子调用 compliance 专家审 #ad 披露 |
| 上下文成本 | 低：产物结构化、按需取，不膨胀主 loop | 高：独立子 loop 的延迟与 token 成本 |
| 可审计性 | Handoff 行 + OperationLog 天然留痕 | 需显式为子 Agent 动作写 OperationLog（actorId=子 agentId） |
| 无状态约束 | 天然满足（状态在 DB 行里，FR-12.9） | 满足（子调用在单请求生命周期内完成） |

**合规「被调用」形态的分期**：P0–P2 合规能力降级为 internal 工具（`check_brand_safety` 直接实现，reach/delivery 的工具子集里可见），结果带 `calledBy: AgentId` 字段，UI 据此渲染进调用方的 collab 区（FR-7.15）；P3+ 升级为真子调用（compliance 专家 prompt + 红线知识注入独立推理），工具签名不变、调用方零改动——这正是工具结果协议解耦的红利。

#### 5.4.2 交接记录结构

```prisma
// prisma/schema.prisma（伪码示意；Prisma 唯一权威定义见 §7 数据章——F001 建齐、P2 起写入。命名遵循 §数据章约定：camelCase + @map snake_case）
model Handoff {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  projectId    String   @map("project_id") @db.Uuid
  fromAgent    String   @map("from_agent")     // AgentId
  toAgent      String   @map("to_agent")       // AgentId
  artifactType String   @map("artifact_type")  // 'match_plan' | 'outreach_thread' | 'delivery_ledger' | 'roi_report'
  artifactRef  Json     @map("artifact_ref")   // { table: string, id: string } 指向持久化产物行
  summary      String                          // 折叠态一句话（FR-7.15 默认折叠）
  messages     Json?                           // [{ from: AgentId, text: string }] —— 展开态三要素之 messages
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@index([projectId, toAgent, createdAt])
  @@map("handoffs")
}
```

- **写入点**：上游工具 `execute` 尾部（如 `match_plan` 的「批准这组」internal 动作落 ProjectKol 的同事务内写 `match→reach` 行）。
- **读取点**：两处——④ 环节上下文层把 `toAgent=当前专家` 的最近 Handoff 摘要注入 prompt（下游专家"知道上游交了什么"）；UI collab 区展开三要素（pair=`fromAgent→toAgent`、`messages`、交接物=`artifactRef` 解引用+结果，FR-9.5）。
- **典型链**（FR-9.5）：匹配→触达（组合+受众依据）、触达→交付（谈定条款）、交付→合规（放款前审）、交付→洞察（交付数据）。
- Handoff 是**可读上下文**，不是权限凭证：下游工具读产物只依赖自身 scopes 白名单，Handoff 缺失时工具照常可用（降级为无上游摘要）。

### 5.5 P0 落地 vs 后期演进汇总

| 能力 | P0（AGENT-FOUNDATION F004/F005/F008） | 后期演进 |
|---|---|---|
| 工具注册表 | 全套 `ToolDefinition`/registry/runTool 管线；实装 `search_kols`+`get_kol_detail`；六 outbound 声明齐全+闸门管线可测 | 逐批次填工具体（P1–P4）；成本记账喂模型路由 |
| streamText loop | `/api/agent` 全量落地，maxSteps=8，hello-agent 闭环（F007 验收） | 流内缓存（NFR-P7 同 query 复用、detail 短 TTL）；多模型路由（`expert.model`） |
| 专家编队 | `experts/` 七定义 + resolveAgent + 五层 prompt 管线全量落地；P0 阶段仅 match/orchestrator 有真工具，其余专家可切换、能对话、工具子集为空或骨架 | 逐环节接真（M1–M4）；⑤ 层知识裁剪 top-N |
| 游戏知识注入 | 管线落地，F008 前用 seed/mock 知识条目（schema F001 建齐） | P1 真实素材解析产知识（FR-8.4.4） |
| 协同交接 | `Handoff` 表随 F001 建 schema；hello-agent 不写交接 | P2 MATCH 起真实写入；P3+ 合规升级子调用 |
| 闸门咬合 | runTool outbound 分支 + `/api/actions/[id]/{confirm,execute,reject}` 两步票据路由（唯一契约，权威见闸门章）+ 变异测试（G1–G5） | 无演进——这是硬约束，永不放宽 |

> 依赖与工期提示：本章全部代码依赖 `ai`/`zod`/`prisma` 安装；TS 5.x 已由 **F002 启动前的独立微批次**升级完成（ADR-008 统一口径，不与 F001–F008 混批）；`src/lib/ai/gateway.ts` 属 F002，本章按其已就绪引用。CopilotPanel 挂载进现有 `src/app/admin/layout.tsx` 三区外壳右栏属柱③/IA 章节，本章只依赖其调用 `/api/agent` 的请求契约（5.2.1）。

---

# §6 闸门与安全架构：outbound 强制层设计

> 本章落实 D26–D29 / FR-10.x / NFR-S1~S9 / F008。核心命题只有一句：**「对外 / 花钱 / 不可逆」的副作用代码，在整个代码库中只有一个执行入口，该入口在服务端检查确认票——模型 loop 与前端都拿不到票，因此谁都无法替人拍板。**

## 6.1 设计原则与系统不变量

| # | 不变量 | 兑现机制 | 对应条款 |
|---|---|---|---|
| I1 | 副作用单一咽喉点：任何 outbound 副作用只能经 `executeTool()` 触达 | `executeTool()` 唯一实现于 `src/lib/agent/runtime.ts`；ESLint `no-restricted-imports` 禁止 route/组件直接引各 outbound 工具模块与 `lib/agent/tools/effects` | FR-10.1 |
| I2 | 模型 loop 结构性无票：柱② 适配器的工具闭包**没有 ticket 形参** | `toModelToolSet()`（同在 `runtime.ts`）只暴露 `(input) => executeTool(name, input, ctx)`，票在类型签名上就传不进去 | FR-10.2 |
| I3 | 票只在「人确认」的响应中出现一次，单次使用、短 TTL、绑定 payload | `PendingAction.ticketHash` + 原子条件 UPDATE 消费 | §6.4 |
| I4 | internal 一律不设闸门（假闸门稀释真闸门） | executor 对 `kind==='internal'` 无任何 gate 分支 | FR-10.6 / D27 推论 |
| I5 | 留痕 append-only：pending / confirmed 双行追加，绝不 UPDATE | repo 只导出 `append*`；DB 触发器阻断 UPDATE/DELETE | FR-11.12 / NFR-S4 |
| I6 | 不依赖前端：`GateConfirm` 卡只是渲染层，绕开它直接 curl 也被拦 | 拦截逻辑全部在 Route Handler / lib 层，验收测试为纯 HTTP + 函数级 | F008 验收 1 |

与代码库现状的衔接：当前 repo **无 `src/lib`、无 `src/app/api`**（DS-FOUNDATION 只有外壳）。本章所有模块都是 F004/F008 新建件；依赖上需要新增 `zod` 与 `vitest`（devDep，F008 测试用），`@prisma/client`、`ai`/`@ai-sdk/*` 由 F001/F004 引入——TS 已按 ADR-008 在 **F002 启动前以独立微批次升至 5.x**（升级+构建门全绿，不与 F001-F008 混批），此后 zod / Prisma / AI SDK 一律按 TS5 选版（AI SDK v5 要求 TS≥5）。全部导入遵循项目裸 src 风格（`baseUrl: "src"`，如 `import { executeTool } from 'lib/agent/runtime'`）；业务代码一律裸 src 导入、不新增 `@/` 别名，保留既有 `@/public/*` 静态资源映射（tsconfig paths 已存在）。

## 6.2 工具执行器中间件（outbound 强制层）

### 6.2.1 文件布局

```
src/lib/agent/
├── runtime.ts                 # executeTool()：全系统唯一工具执行入口（本节主角）+ toModelToolSet() 柱② 门面 + ToolResultPart 信封组装
├── tools/
│   ├── types.ts               # 工具层唯一类型源：ToolDefinition / ToolContext / ToolOutcome / ToolResultPart / OUTBOUND_TOOL_NAMES
│   ├── registry.ts            # 注册表 + 装载期不变量校验（见 6.2.4）
│   ├── search-kols.ts / get-kol-detail.ts / evaluate-creator.ts / match-plan.ts / draft-email.ts ...  # internal 工具（平铺于 tools/，kind 由定义声明）
│   ├── send-outreach.ts / send-bulk-outreach.ts / commit-quote.ts / distribute-keys.ts / payout.ts / create-share-link.ts
│   │                          # outbound 白名单 6 个工具名；语义类别 5 类（发信/报价/放款/分发 Key/对外分享，
│   │                          # 批量发=发信类的批量形态，独立成工具因其 harm 必须列全名单）。P0 先落 payout + send_outreach 即可测门
│   └── effects.ts             # OutboundEffects 接口 + P0 devStubEffects（写 StubDelivery 行）
├── gate/
│   ├── ticket.ts              # issueTicket / consumeTicket / GATE_TICKET_TTL_MS + canonicalJson / sha256（payloadHash）
│   ├── harm.ts                # HarmDisclosure zod schema（全案唯一 harm 契约）+ buildHarm 约束
│   └── pending.ts             # PendingAction 落单 / 详情读取 / 条件 UPDATE（Prisma 模型权威见 §7）
src/lib/oplog/
│   ├── append.ts              # appendAuto / appendGatePending / appendGateRejected / appendBlock / appendIrrev（只 INSERT）
│   ├── schemas.ts             # 各 kind 行形状的 zod 校验（FR-11.20）
│   └── queries.ts             # listOperationLogs()（审计查询，§6.8）
src/app/api/
├── agent/route.ts             # 柱②（F004），工具调用一律经 toModelToolSet → executeTool
└── actions/[id]/
    ├── route.ts               # GET：pending 详情（恢复确认卡，见 6.3.3；不含票）
    ├── confirm/route.ts       # 人确认端点：签发一次性票
    ├── execute/route.ts       # 带票执行端点：失败按 §6.3.1 分码 403/409/410
    └── reject/route.ts        # 驳回：追加 gate/rejected 行
```

### 6.2.2 核心类型（`src/lib/agent/tools/types.ts`）

本文件是**工具层唯一类型源**（各章不得另设私有工具类型）：

```ts
import { z } from 'zod';
import type { HarmDisclosure } from 'lib/agent/gate/harm';

export type ToolKind = 'internal' | 'outbound';

/** 对外白名单：语义类别 5 类（发信/报价/放款/分发 Key/对外分享；批量发=发信类的批量形态），
 *  工具名 6 个——批量发信独立成工具，因其 harm 必须列全收件人名单。 */
export const OUTBOUND_TOOL_NAMES = [
  'send_outreach', 'send_bulk_outreach', 'commit_quote',
  'distribute_keys', 'payout', 'create_share_link',
] as const;

export interface ToolContext {
  tenantId: string;          // P0 = DEV_TENANT_ID（§6.6）
  userId: string;            // P0 = DEV_USER_ID
  agentId: string;           // 发起专家：'strategy'|'match'|'reach'|'delivery'|'insight'|'compliance'|'orchestrator'
  projectId?: string;
}

export type GateDenyReason =
  | 'unknown_tool' | 'no_ticket' | 'not_confirmed'
  | 'ticket_expired' | 'ticket_used' | 'payload_mismatch';

export type ToolOutcome<T = unknown> =
  | { status: 'executed'; type: string; data: T; logId: bigint }                       // type → canvas-registry
  | { status: 'pending'; type: 'gate_confirm'; pendingActionId: string; harm: HarmDisclosure }
  | { status: 'forbidden'; reason: GateDenyReason }                                     // HTTP 面按 §6.3.1 分码：403/409/410
  | { status: 'invalid_input'; issues: z.ZodIssue[] };

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string;
  kind: ToolKind;
  description: string;                 // 喂给模型的工具描述
  scopes: string[];                    // 专家可见性收窄（FR-12.17）：toModelToolSet 按 agentId 过滤
  inputSchema: z.ZodType<I>;           // NFR-S6：所有 IO 先过 zod
  outputSchema?: z.ZodType<O>;         // 成功结果形状（canvas 消费前校验）
  resultType: string;                  // 成功结果的 canvas type（如 'kol_cards'）
  disclose?: boolean;                  // 结果是否回注模型上下文摘要
  buildHarm?: (input: I, ctx: ToolContext) => Promise<HarmDisclosure>;  // outbound 必须实现（装载期校验）
  execute: (input: I, ctx: ToolContext) => Promise<O>;                  // 真副作用（P0 outbound = devStubEffects）
}

/** 执行管线统一组装的前端信封（柱④ canvas 消费；CanvasComponentProps 与之一一对应）。 */
export interface ToolResultPart {
  type: string;
  data: unknown;
  meta: { toolName: string; toolClass: ToolKind; agentId: string; createdAt: string };
}
```

### 6.2.3 执行器决策流（`executeTool()`，`src/lib/agent/runtime.ts`）

```ts
export async function executeTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
  ticket?: { pendingActionId: string; ticket: string },  // 仅 /api/actions/[id]/execute 会传
): Promise<ToolOutcome>;
```

```mermaid
flowchart TD
    A["executeTool(name, input, ctx, ticket?)"] --> B{"注册表命中?"}
    B -- 否 --> E1["forbidden: unknown_tool"]
    B -- 是 --> C["inputSchema.safeParse(input)"]
    C -- 失败 --> E2["invalid_input"]
    C -- 通过 --> D{"tool.kind"}
    D -- internal --> I1["tool.execute()"] --> I2["appendAuto(kind=auto, gateStatus=null)"] --> I3["executed → canvas"]
    D -- outbound --> G{"携票?"}
    G -- 无票 --> P1["buildHarm(input, ctx)"] --> P2["INSERT PendingAction(status=pending)"]
    P2 --> P3["appendGatePending(kind=gate, gateStatus=pending)"] --> P4["pending: gate_confirm（loop 内=pending 结果；直调 HTTP 面=403）"]
    G -- 有票 --> T1["consumeTicket: 原子条件 UPDATE 消费"]
    T1 -- 失败 --> E3["forbidden 分码: ticket_used→409 / ticket_expired→410 / payload_mismatch→403（§6.3.1）"]
    T1 -- 成功 --> X1["tool.execute() 真副作用"] --> X2["同一 DB 事务: status→executed + appendIrrev(kind=irrev, confirmedBy)"]
    X2 --> X3["executed + resultRef"]
```

要点：

- **internal 分支没有任何确认逻辑**——`search_kols` / `match_plan` / `draft_email` 点了即办，只追加 `kind=auto` 弱化日志（FR-11.14）。
- **outbound 无票分支不触碰 `tool.execute`**：先算利害、落 `PendingAction`、落 `gate/pending` 日志，返回 `gate_confirm`。副作用代码一行不跑。
- **有票分支先消费票再执行**（防重放优先于副作用），执行成功后在**同一 DB 事务**里把 `PendingAction` 置 `executed` 并追加 `irrev` 行（FR-8.6.7「确认与留痕同一事务」）。外部副作用无法进 DB 事务，因此顺序保证是：*irrev 行只在副作用成功返回后写*；而 gate 时刻的 pending 行已存在，任何时点都不存在「做了事但全无记录」的窗口。副作用成功与 finalize 之间崩溃 → 状态停在 `executing`，作为异常显式浮现在 `/admin/runs`（P0 人工对账；演进见 §6.9）。

### 6.2.4 注册表装载期不变量（`src/lib/agent/tools/registry.ts`）

```ts
import { OUTBOUND_TOOL_NAMES } from 'lib/agent/tools/types';   // 白名单常量与类型同源（§6.2.2）：5 类语义 · 6 个工具名

// register() 在模块装载时对每个工具断言，违反直接 throw（进程起不来，构建门就红）：
// 1. name ∈ OUTBOUND_TOOL_NAMES ⇒ kind 必须是 'outbound'   —— 「outbound 一个都不能漏」(FR-10.6)
// 2. kind === 'outbound' ⇒ buildHarm 必须定义                —— 没有利害清单的 outbound 不合法 (FR-10.5)
// 3. 装载完成后 Object.freeze(registry)                      —— 运行期禁止动态改类
```

这把 FR-10.6 的两半都机制化了：漏标 outbound 在启动时爆炸；internal 加确认框在 executor 里根本没有代码路径。

### 6.2.5 柱② 适配器：结构性无票（`toModelToolSet()`，`src/lib/agent/runtime.ts`）

```ts
import { tool as aiTool, type ToolSet } from 'ai';   // Vercel AI SDK v5（TS5 下选版）

/** /api/agent/route.ts 唯一允许的工具来源。按当前专家 scopes 收窄工具子集（FR-12.17）。 */
export function toModelToolSet(ctx: ToolContext, agentId: AgentId): ToolSet {
  // 对每个工具包一层：execute: (input) => executeTool(def.name, input, ctx)
  // 闭包签名里不存在 ticket —— 模型「决定」直调 payout 也只能收到 gate_confirm（FR-10.2）
}
```

`src/app/api/agent/route.ts`（F004 已立柱）只做四件事：读 `getRequestContext()`；由请求体 `context`（`{pathname, env?, projectId?, gameId?}`）经 `resolveAgent` 在**服务端重解析**当前专家（不信任客户端指定的 agentId）；`streamText({ tools: toModelToolSet(ctx, agentId) })`；把 `ToolOutcome` 组装为 `ToolResultPart` 信封按 `type` 流回柱④。加新工具 = 注册表加条目，route 核心零改动（FR-12.6）。

## 6.3 确认流全链路

### 6.3.1 端点契约

本表即**全案唯一的闸门确认契约**（两步票据：confirm 签票 → execute 消费票），各章一律引用本契约，不另设 `/api/agent/confirm`、`/api/gate/*`、单端点 `/api/actions/confirm` 等私有端点。票**仅在 confirm 响应中出现一次**（不变量 I3）；拦截时不下发任何令牌——禁止令牌随 SSE / data-gate 流下发。

| 端点 | 方法/入参 | 行为 | 未经确认时 |
|---|---|---|---|
| `/api/agent` | POST `{ messages, context:{pathname, env?, projectId?, gameId?} }` | 柱② 流式 loop | outbound 工具结果=`gate_confirm`（pending），副作用 0 |
| `/api/actions/[id]` | GET | 返回 pending 详情（status + harm + payload 摘要，**不含任何令牌**），供确认卡跨页/跨会话重渲染（§6.3.3） | — |
| `/api/actions/[id]/confirm` | POST（空 body） | 校验 `status='pending'` → 条件 UPDATE 置 `confirmed`、签发一次性票 → 返回 `{ ticket, expiresAt }` | 已决（并发败者/已驳回）→ **409 `GATE_ALREADY_DECIDED`** |
| `/api/actions/[id]/execute` | POST `{ ticket }` | **不接受任何工具入参**，服务端回放 `PendingAction.payload` 调 `executeTool(..., ticket)` | 无票/伪票/payload 不符/未确认 → **403 `GATE_TOKEN_INVALID`**；已决/票已用 → **409 `GATE_ALREADY_DECIDED`**；票过期 → **410 `GATE_EXPIRED`** |
| `/api/actions/[id]/reject` | POST `{ reason? }` | 条件 UPDATE 置 `rejected` + 追加 `gate/rejected` 行 | 已决 → **409 `GATE_ALREADY_DECIDED`** |

**HTTP 错误分码 envelope（定稿于本章，G 系测试断言引用此映射）**——响应体 `{ error: <code>, reason?: GateDenyReason }`：

| HTTP | code | 场景 |
|---|---|---|
| 403 | `GATE_TOKEN_INVALID` | 无票 / 伪造票 / payloadHash 不符 / 未确认先执行 |
| 409 | `GATE_ALREADY_DECIDED` | 已确认 / 已驳回 / 已执行 / 票已消费（重放）/ 并发败者 |
| 410 | `GATE_EXPIRED` | 票 TTL 过期（`GATE_TICKET_TTL_MS`=5min，唯一定义于 `gate/ticket.ts`） |

`execute` 端点不收工具入参是刻意设计：**执行的永远是确认卡上披露过的那份 payload**，「确认 A、执行 B」在接口形状上就不可能（§6.4 的 payloadHash 是纵深防御第二层）。

### 6.3.2 全链路序列图

```mermaid
sequenceDiagram
    autonumber
    actor U as 操盘手
    participant CP as CopilotPanel / canvas（柱③④）
    participant AG as /api/agent（柱② streamText loop）
    participant EX as executeTool()（gate 中间件）
    participant DB as Postgres（PendingAction + OperationLog）
    participant FX as 副作用 Provider（P0=StubDelivery）

    U->>CP: 「把这 3 封外联邮件发出去」
    CP->>AG: POST messages
    AG->>EX: send_bulk_outreach(input)（adapter 通道，无票）
    EX->>EX: kind=outbound 且无票 → buildHarm(input)
    EX->>DB: INSERT PendingAction(status=pending, payload, payloadHash, harm)
    EX->>DB: INSERT OperationLog(kind=gate, gateStatus=pending)
    EX-->>AG: { status:'pending', type:'gate_confirm', pendingActionId, harm }
    AG-->>CP: 流式回传 gate_confirm
    CP->>U: canvas-registry → GateConfirm 卡（收件人全名单 · 对外·不可撤销）
    U->>CP: 点击「确认发送」
    CP->>DB: POST /api/actions/{id}/confirm → 条件 UPDATE pending→confirmed
    DB-->>CP: { ticket（一次性明文，TTL 5min）, expiresAt }
    CP->>EX: POST /api/actions/{id}/execute { ticket }（服务端回放 payload）
    EX->>DB: consumeTicket：原子 UPDATE confirmed→executing（校验 ticketHash/TTL/未用/payloadHash）
    EX->>FX: tool.execute() —— 真副作用（仅此一处）
    FX-->>EX: 成功 + resultRef
    EX->>DB: 同一事务：status→executed + INSERT OperationLog(kind=irrev, gateStatus=confirmed, confirmedBy)
    EX-->>CP: { status:'executed', ... } → canvas 渲染结果
    Note over U,DB: /admin/runs 出现 irrev 条目：「发起=reach Agent · 确认人=你 · 利害快照 · 确认时间」
    opt 攻击面（F008 验收 1：不依赖前端）
        Note over EX,DB: curl execute 无票/伪造票 → 403 GATE_TOKEN_INVALID；重放旧票 → 409 GATE_ALREADY_DECIDED；FX 调用次数不变，无 irrev 行
    end
```

驳回分支：`reject` 后 `PendingAction` 终态 `rejected`，追加 `gate/rejected` 日志行；Agent 若要重试须产出**新的** `PendingAction`（新一轮披露、新的确认），不可逆动作严禁静默重试。

### 6.3.3 pending 恢复流（刷新 / 跨会话）

确认卡不是只活在一次 SSE 流里：`PendingAction` 落库即为持久事实，`GET /api/actions/[id]` 随时可取 pending 详情（status + harm，**不含任何令牌**）。「今天」页雷达卡与项目页从该端点重新渲染确认卡；用户点击确认时才走 `/confirm` 签票。两步设计因此天然支持页面刷新、跨会话恢复与多入口进入——恢复流不需要任何额外的状态同步机制。

## 6.4 PendingAction 与确认票：数据结构与防重放

### 6.4.1 PendingAction（Prisma 模型权威定义见 §7）

`PendingAction` 的 Prisma 模型**唯一权威定义在 §7（数据章）**，本章只保留语义要点：状态机 7 态 `pending / confirmed / rejected / expired / executing / executed / failed`；关键列含 `payload`（zod 校验后的完整工具入参，如实不折叠）、`payloadHash`（`sha256(canonicalJson(payload))`）、`harm`（`GateConfirm` 卡渲染的唯一数据源）、`ticketHash`（只存 sha256，明文票不落库）、`ticketExpiresAt` / `ticketUsedAt`、`requestedBy`（发起 Agent id）、`confirmedBy` / `confirmedAt`；并发防护 = PendingAction 上的**条件 UPDATE**（§6.4.3）。数据访问收敛在 `src/lib/agent/gate/pending.ts`（落单 / 详情读取 / 条件 UPDATE）。

### 6.4.2 HarmDisclosure（`src/lib/agent/gate/harm.ts`）

本文件是**全案唯一的 harm 契约 zod 定义**；A2 `GateConfirmData`、A3 `HarmDisclosure`、A5 `harmSchema` 等一律 `z.infer` 引用本 schema，不得另行定义。

```ts
export const HarmDisclosureSchema = z.object({
  title: z.string(),                                    // 「向 3 位创作者发送外联邮件」
  irreversibleLabel: z.literal('对外·不可撤销'),          // 逐字符定死（无空格）；F008 验收 2 的机器可断言锚点
  facts: z.array(z.string()),                           // 关键事实行（金额/授权范围/依据/有效期…）
  recipients: z.array(z.object({                        // 批量发信：全名单逐一列出，禁止折叠（FR-8.2.3.5）
    displayName: z.string(),
    platform: z.string(),
    handle: z.string().optional(),
  })),
  amount: z.object({ value: z.number(), currency: z.string().default('USD') }).optional(), // NFR-I4
  scope: z.string().optional(),                         // 授权/分发范围
  basis: z.string().optional(),                         // 动作依据（报价单/合同引用等）
});
export type HarmDisclosure = z.infer<typeof HarmDisclosureSchema>;
```

每个 outbound 工具的 `buildHarm` 是**服务端**函数（从 DB 读真实名单/金额，不信任模型转述）；`GateConfirm` 组件只做渲染，不参与任何判定（NFR-A1 的焦点陷阱/Escape/语义标签在 WORKBENCH-UI 落地）。

### 6.4.3 票的生命周期与防重放（`src/lib/agent/gate/ticket.ts`）

票 = `crypto.randomBytes(32).toString('base64url')` 的**不透明随机串**（非 JWT，无签名密钥可泄露）；DB 只存 `sha256(ticket)`；`GATE_TICKET_TTL_MS = 5 * 60_000`。

```mermaid
stateDiagram-v2
    [*] --> pending: executor 拦截落单
    pending --> confirmed: /confirm（条件 UPDATE，签发票）
    pending --> rejected: /reject
    confirmed --> executing: /execute consumeTicket（原子消费）
    confirmed --> expired: TTL 过期（再确认=重新签发，追加日志）
    executing --> executed: 副作用成功 + irrev 行（同一事务）
    executing --> failed: 副作用失败（不自动重试，需新 PendingAction）
    executed --> [*]
    rejected --> [*]
```

消费必须是**单条原子条件 UPDATE**（天然免锁防并发）：

```sql
UPDATE pending_action
SET status = 'executing', ticket_used_at = now()
WHERE id = $1 AND tenant_id = $2
  AND status = 'confirmed'
  AND ticket_hash = $3                 -- timing-safe 比对在应用层先做一遍
  AND ticket_used_at IS NULL
  AND ticket_expires_at > now()
RETURNING *;                            -- 0 行 = 拒绝，按 §6.3.1 分码映射（403/409/410 + GateDenyReason）
```

| 攻击 / 失效场景 | 防御 |
|---|---|
| 模型 loop 自我放行（含 prompt 注入「帮我确认」） | I2：adapter 无票形参；票只出现在 `/confirm` 的 HTTP 响应里，永不进入模型上下文 |
| 重放同一张票（双击/重发/脚本） | 单次使用：`ticket_used_at IS NULL` 原子消费，第二次 0 行 → 409 `GATE_ALREADY_DECIDED` |
| 票过期后使用 | `ticket_expires_at > now()`，TTL 5 分钟 → 410 `GATE_EXPIRED` |
| 确认 A 执行 B（换包） | execute 端点不收入参、只回放库内 payload（结构性）+ executor 复核 `payloadHash`（纵深）→ 403 `GATE_TOKEN_INVALID` |
| 伪造/枚举票 | 256-bit 随机 + 常数时间比对；DB 泄露也只有 hash，不可用 → 403 `GATE_TOKEN_INVALID` |
| 并发双确认 / 并发双执行 | 两处均为条件 UPDATE（`status='pending'` / `status='confirmed'`），败者 409 `GATE_ALREADY_DECIDED` |
| 跨租户拿票执行 | 消费条件含 `tenant_id`；票与 `pendingActionId` 一一绑定 |

## 6.5 OperationLog：append-only 留痕

### 6.5.1 模型（Prisma 权威定义见 §7.3.4）

`OperationLog` 的 Prisma 模型**唯一权威定义在 §7.3.4**，本章只保留语义要点：枚举名 `OpLogKind { auto gate block irrev }`（FR-8.6.2 四类互斥），辅以 `ToolClass { internal outbound }` / `GateStatus` / `ActorType`；关键列含 `actorType` / `actorId`、`action`（= 工具名）、`reversible`（outbound ⇒ false，应用层强制）、`gateStatus`（internal 恒 null）、`confirmedBy` / `confirmedAt`（kind=irrev 必填，zod 校验）、`pendingActionId`、`payload`（利害快照 / 拦截原因 / 入参摘要）；索引集合为 `[tenantId, kind]` / `[tenantId, toolClass]` / `[tenantId, projectId]` / `[kolId]` / `[createdAt]`；行上刻意**没有 `updatedAt` / `deletedAt`**——本表任何行永不变更。本章只约定事件→行映射（6.5.2）与 append-only 双层强制（6.5.3）。

### 6.5.2 事件 → 行的映射（谁在什么时机写哪种行）

| 事件 | kind | gateStatus | 写入点（`append.ts` 函数） | 必填约束（`src/lib/oplog/schemas.ts` zod） |
|---|---|---|---|---|
| internal 工具执行 | `auto` | null | executor internal 分支 → `appendAuto` | `toolClass='internal' ⇒ gateStatus=null` |
| outbound 被拦、产出确认卡 | `gate` | `pending` | executor 无票分支 → `appendGatePending` | `pendingActionId` 非空 |
| 人驳回 | `gate` | `rejected` | `/reject` route → `appendGateRejected` | `actorType='human'`，payload 含驳回原因 |
| 合规拦截（如放款前 `kind:block`） | `block` | null | 合规工具/交付流程 → `appendBlock` | `payload.reason` 非空（FR-8.6.5） |
| 确认后执行成功 | `irrev` | `confirmed` | executor finalize 事务 → `appendIrrev` | `confirmedBy`/`confirmedAt`/`reversible=false`/payload=利害快照（FR-8.6.3「（你已确认）」归属四要素齐备） |

**双行追加语义**（FR-11.12）：同一个 outbound 动作在日志里至少两行——gate/pending 行（拦下时）+ irrev/confirmed 行（执行后），中途驳回则是 gate/rejected 行。任何情况下不 UPDATE 既有行。

### 6.5.3 只 INSERT 的双层强制

**应用层**：`src/lib/oplog/append.ts` 只导出 `append*` 五个函数，不存在 update/delete 导出；写入前过对应 kind 的 zod schema（FR-11.20）。

**DB 层**（随 F008 的 prisma migration 落 raw SQL，FR-11 命名约定要求）：

```sql
-- prisma/migrations/<ts>_operation_log_append_only/migration.sql
CREATE OR REPLACE FUNCTION operation_log_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'operation_log is append-only: % blocked (id=%)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER operation_log_append_only
BEFORE UPDATE OR DELETE ON operation_log
FOR EACH ROW EXECUTE FUNCTION operation_log_block_mutation();
```

> P0 dev 容器用 postgres 超级用户，触发器即是有效防线；**演进（M5）**：建专用应用 DB 角色并 `REVOKE UPDATE, DELETE ON operation_log`，双保险。

## 6.6 认证与租户占位

P0 无真实认证（D4 / NFR-S9），但**留出唯一接缝**，后期换真认证不改上层：

```ts
// src/lib/auth/context.ts —— 全部 Route Handler 的身份来源，P0 硬编码
export const DEV_TENANT_ID = '00000000-0000-4000-8000-000000000001';  // 与 scripts/seed 建的 dev tenant 一致
export const DEV_USER_ID   = '00000000-0000-4000-8000-000000000002';  // 唯一 dev 用户（单角色，无 role/scope）

export interface RequestContext { tenantId: string; userId: string; }
export async function getRequestContext(_req?: Request): Promise<RequestContext> {
  return { tenantId: DEV_TENANT_ID, userId: DEV_USER_ID };            // M5：替换为 session 解析，签名不变
}
```

RLS 就绪性由三条既有约束共同保证：① 运行时无状态（FR-12.9，对话状态在前端 `useChat`，服务端不跨请求缓存）；② 所有 repo/executor 函数显式接 `ctx.tenantId`，无模块级全局租户；③ 每张表带 `tenantId` 列。M5 开 RLS 时只需在事务入口 `SET LOCAL app.tenant_id = $1`，上层零改动。

**P0 已知且接受的风险**（须写进 F008 验收报告）：`/api/actions/*` 在 dev 无会话鉴权，闸门证明的是「**AI 无法自我放行**」（票在 loop 内不可达），不是「网络上任何人都不能确认」——后者是 M5 真实认证的职责。P0 副作用全部是 stub（见 §6.7），实际 blast radius 为零；**真 provider 密钥（Resend/partner）接入前，`/api/actions/*` 必须先挂会话鉴权**，此为 P3 的硬前置。

## 6.7 密钥管理与副作用 Provider

env 唯一定义在 `src/lib/env.ts`（本章引用，不另行定义）：

- **变量集**：`DATABASE_URL` / `AIGCGATEWAY_BASE_URL` / `AIGCGATEWAY_API_KEY` / `AIGC_CHAT_MODEL`（有默认值）/ `AIGC_EMBEDDING_MODEL`（有默认值）；P3+ 真 provider 密钥（`RESEND_API_KEY` 等）在此追加。
- **导出形态**：惰性缓存函数 `serverEnv()`——首次调用做 zod 校验并缓存，缺失 fail fast、报错列出缺哪几个（NFR-S5）；不做模块装载期顶层 `parse` 副作用。
- **启动校验入口**：`src/instrumentation.ts`（Next 15 启动钩子；本仓库有 `src/`，该文件不在根）的 `register()` 调一次 `serverEnv()`，进程起来第一件事就是验 env。

- `.env.example` 只列变量名 + 说明，无明文值（§15.5 密钥门）；`.gitignore` 已有 `.env*` 排除。
- **闸门本身不需要签名密钥**：票是不透明随机串 + DB hash 存储，无 `GATE_SECRET` 可硬编码、可泄露。
- 副作用出口收敛在 `src/lib/agent/tools/effects.ts` 的 `OutboundEffects` 接口。**P0 实现 = `devStubEffects`**：把「已发生的副作用」写进 P0 专用表 `StubDelivery`（Prisma 模型权威定义见 §7；字段含 toolName / pendingActionId / payload）——这张表是测试的**地面真值**（§6.9 断言它的行数，而非 mock 内部计数）。**演进**：P3 Resend / P4 partner escrow 替换实现，且以 `pendingActionId` 作 provider 幂等键（Resend `Idempotency-Key` / Stripe idempotency key），把 §6.2.3 的 `executing` 悬置窗口收敛为可安全对账。

## 6.8 审计与可查询

- **查询面**：`src/lib/oplog/queries.ts` 的 `listOperationLogs({ tenantId, kind?, toolClass?, action?, projectId?, reversible?, cursor? })`，keyset 分页 on `(createdAt DESC, id DESC)`，筛选维度对应 §7.3.4 的索引集合（FR-11.13）。**P0 形态 = `/admin/runs` 以 RSC 直读 `oplog/queries.ts`**；HTTP `GET /api/operation-logs` **降为 P1+ 演进项**（路由清单已标注，P0 不建）。如 Copilot 需要，可加只读 internal 工具 `list_operation_log` 复用同一函数。
- **UI**：`/admin/runs`（F006 建占位路由，WORKBENCH-UI 接真组件）。`irrev` 条目单独标注、必渲染归属四要素（发起 Agent / 确认人 / 利害快照 / 确认时间，FR-8.6.3）；`auto` 行弱化展示（FR-11.14）;「今天」页 KPI「待你确认」与徽标计数均经 **`list_pending_asks` 单一工具取数**——`Project.ask` 只是展示聚合层，其 outbound 条目由 `PendingAction(status=pending)` 派生，与雷达卡同源（FR-8.1.3）。
- **完整证据链**：任一笔放款可从 `irrev` 行 → `pendingActionId` → `PendingAction.harm`（当时确认卡上写了什么）→ gate/pending 行（何时拦的、谁发起的）逐级回放——审计不依赖任何人的叙述，只依赖 append-only 行。

## 6.9 闸门有效性验证（F008 验收 + 变异测试）

### 6.9.1 F008 acceptance → 机制 → 测试映射

| F008 验收项（features.json 原文） | 兑现机制 | 测试（`tests/gate/`，vitest；纯 HTTP/函数级，零前端依赖） |
|---|---|---|
| 直接调 API 触发 send/payout 不经人确认必须 403 或 pending | §6.2 executeTool + §6.3 execute 端点 | G1a：`executeTool('payout', input, ctx)` 无票 → `status='pending'`，`StubDelivery` 行数 0（地面真值），存在 gate/pending 日志行；G1b：`POST /api/actions/{id}/execute` 无票/伪票 → HTTP 403 `GATE_TOKEN_INVALID`，`StubDelivery` 行数不变 |
| 确认卡含「对外·不可撤销」+ 具体利害 | `HarmDisclosureSchema.irreversibleLabel` 字面量 + `recipients` 全名单 | G2：对 `send_bulk_outreach(3 人)` 断言 `harm.irreversibleLabel==='对外·不可撤销'` 且 `harm.recipients.length===3`（断言数据结构，非 UI 截图） |
| internal 动作不弹确认框 | executor internal 分支无 gate 路径 | G3：`executeTool('search_kols',…)` → `status='executed'`，`PendingAction` 零新增，日志 `kind='auto', gateStatus=null` |
| 不可逆动作留痕可查 | §6.5 irrev 行 + §6.8 查询 | G5：完整确认流后断言 irrev 行存在、`confirmedBy` 非空、`listOperationLogs({kind:'irrev'})` 可筛出 |
| （防重放，G1 推论） | §6.4 票机制 | 同票执行两次 → 第二次 409 `GATE_ALREADY_DECIDED` 且 `StubDelivery` 恰 1 行；过期票 → 410 `GATE_EXPIRED` |

### 6.9.2 变异测试（D20 / FR-10.3 / §15.4 硬门）

原则：**断言验行为（HTTP 状态 + DB 行数 + StubDelivery 地面真值），不验源码关键字**。变异测试回答的问题是：*如果有人把闸门拆了，测试套件会不会变红？* 不会变红的断言 = 无效断言，F008 拒收。

落地为 patch 清单 + 机械 runner（Evaluator 在 verifying 阶段执行）：

```
scripts/test/gate-mutants/
├── m1-drop-gate.patch          # runtime.ts executeTool: `tool.kind === 'outbound'` → `false`（整个闸门旁路）
├── m2-drop-single-use.patch    # consumeTicket: 去掉 `ticket_used_at IS NULL` 条件（可重放）
├── m3-drop-ttl.patch           # consumeTicket: 去掉 `ticket_expires_at > now()`（票永不过期）
├── m4-drop-payload-bind.patch  # runtime.ts executeTool: 跳过 payloadHash 复核（换包）
├── m5-misregister.patch        # payout 注册为 kind:'internal'（漏标；应被 6.2.4 装载断言当场炸掉）
└── m6-drop-irrev-log.patch     # finalize: 不写 irrev 行（执行了但不留痕）
scripts/test/run-gate-mutations.mjs
```

runner 逻辑（每个 mutant 一轮）：`git apply <patch>` → `vitest run tests/gate` → **期望退出码非 0**（套件必须变红）→ `git apply -R <patch>` 还原。任一 mutant 下套件仍绿 → runner 以非零退出并点名幸存 mutant。m5 特殊：期望的红可以是测试红**或**进程装载即抛错（两者任一即证明防线有效）。

> **P0**：上述 6 个 mutant 手工 patch 清单 + runner 脚本，作为 F008 验收硬门由隔离 evaluator subagent 执行，结果写入 `docs/test-reports/`。**演进**：若闸门代码后续频繁变更，可评估 StrykerJS（支持 TS/vitest）把变异生成自动化；patch 清单仍保留为最小硬门。

## 6.10 P0 落地 vs 后期演进汇总

| 能力 | P0（F008 交付） | 后期演进 |
|---|---|---|
| executeTool 中间件（`runtime.ts`）+ 票 + 防重放 + 装载期不变量 | 全量落地（这是闸门本体，不存在简化版） | — |
| outbound 副作用 | `devStubEffects` → `StubDelivery` 表（六工具至少落 `payout`+`send_outreach` 供测门） | P3 Resend / P4 partner，`pendingActionId` 作幂等键；接真密钥前 `/api/actions/*` 先挂会话鉴权 |
| append-only | 应用层只 INSERT repo + DB 触发器 | M5 专用 DB 角色 REVOKE UPDATE/DELETE |
| 认证/租户 | `getRequestContext()` 硬编码 dev tenant/user | M5 真实认证 + RLS（`SET LOCAL app.tenant_id`），上层零改动 |
| 密钥 | `src/lib/env.ts` `serverEnv()` 惰性缓存 zod 校验 + `instrumentation.ts` 启动即验 | 密钥轮换、成本记账挂点（FR-12.31） |
| `executing` 悬置（副作用后崩溃） | `/admin/runs` 显式浮现异常，人工对账 | provider 幂等键 + 对账 job（outbox 模式） |
| 变异测试 | 6-mutant patch 清单 + runner，验收硬门 | StrykerJS 自动化（可选） |
| 审计 UI | `/admin/runs` RSC 直读 `oplog/queries.ts` + kind/toolClass/项目筛选 | HTTP `GET /api/operation-logs`（P1+）、导出、留存策略、按 KOL 维度证据链视图 |

---

# §7 数据架构

> 本章负责：Prisma schema 全量设计（含 PendingAction 闸门状态表）、pgvector 检索、三重溯源中「数据溯源」的读取合并规则、seed 管道、迁移与演进策略。闸门的运行时流程（两步票据 confirm 签票 / execute 消费票、错误码语义）与工具注册表属另章，本章只交付它们依赖的表结构与数据面不变量。

## 7.1 落点总览

代码库现状：**无 `prisma/`、无 `src/lib/`、无任何 DB 依赖**（侦察确认）。本章全部产物为新建，落点如下（业务代码一律裸 src 导入、**不新增 `@/` 别名**；保留既有 `@/public/*` 静态资源映射——tsconfig paths 已存在）：

| 落点 | 内容 | Feature |
|---|---|---|
| `prisma/schema.prisma` | 全部模型 + 枚举 | F001 |
| `prisma/migrations/` | init 迁移 + 手补 raw SQL（append-only 触发器等） | F001 |
| `docker-compose.dev.yml` | `pgvector/pgvector:pg16` 本地 DB（内容唯一权威见 A7 §9.2，含 healthcheck） | F001 |
| `.env.example` | `DATABASE_URL` localhost 占位（非生产凭据；示例统一以 A7 §9.2 为准） | F001 |
| `src/lib/db/prisma.ts` | PrismaClient 单例（dev 热重载缓存到 `globalThis`） | F001 |
| `src/lib/kol/schemas.ts` | 5 个契约位的 zod schema——**jsonb 形状的唯一权威**（FR-11.20） | F001 |
| `src/lib/kol/embedding.ts` | embedding 源文本构造 + sha256 hash | F003 |
| `src/lib/kol/search.ts` | pgvector 检索 raw SQL（`search_kols` 工具消费） | F003/F004 |
| `src/lib/provenance/resolve.ts` | dataSource/fieldProvenance 读取合并（`ProvenanceTag` 消费） | F001 |
| `src/lib/compliance/flags.ts` | 合规 flag 词表——`brandSafety.flags` 与 `compliance_redline` 共用命名空间（FR-11.10） | F001 骨架 |
| `src/lib/game/schemas.ts` | GameKnowledge `structured` 按 kind 的 zod | F001 |
| `src/lib/oplog/append.ts` | OperationLog 追加 helper + 行不变量校验 | F008 |
| `src/lib/agent/gate/pending.ts` | PendingAction 创建/签票/消费票的事务封装 | F008 |
| `src/lib/db/tenant.ts` | `DEV_TENANT_ID` 硬编码常量（D4） | F001 |
| `data/seed/kol-seed-enriched-final.csv` | seed 源（拷入 repo 入 git，可复现） | F003 |
| `scripts/seed/import-kol-csv.ts` / `embed-kols.ts` / `country-map.ts` / `bootstrap-dev.ts` | 导入 / 嵌入 / 中文国名映射 / dev 租户引导 | F003 |

**需新增依赖**（`.npmrc` 已有 `legacy-peer-deps=true`，React 19 RC 下安装无冲突）：

- `prisma` + `@prisma/client`——**按 TS5 选版**（Prisma 6 要求 TS ≥5.1，可直接选用）。统一口径（ADR-008）：**TS 5.x 以独立微批次在 F002 启动前完成升级**（升级+构建门全绿，不与 F001–F008 混批），此后 zod / Prisma / AI SDK 均按 TS5 选版。
- `zod`——同按 TS5 选版；jsonb 契约位形状仍由 zod 唯一定义（FR-11.20）。
- `csv-parse`（seed 解析，理由见 §7.6）、`tsx`（devDep，脚本 runner，repo 现无 ts 执行器）。

**设计总原则**（与 PRD §11 两统领对应）：

1. **契约先行**：5 个深字段契约位建库即存在、全 nullable、seed 不填充；缺值是「显示态」不是错误态（FR-11.3/11.17）。
2. **三重溯源**：数据（`dataSource`+`fieldProvenance`）/ 知识（`sourceMaterialIds`+`confidence`+`supersededById`）/ 动作（`OperationLog` append-only）。
3. **单租户占位**：所有表带 `tenantId`，查询一律显式过滤；无 role/scope/Approval 列，**禁止回填**（D26/FR-11.16）。RLS 留 M5，上层不改（NFR-S9）。
4. **命名约定**：Prisma camelCase / DB snake_case（`@map`）；uuid `gen_random_uuid()`（PG16 内建，OperationLog 例外用 bigint 自增）；`timestamptz` + `@updatedAt`；长生命周期实体带 `deletedAt` 软删。

## 7.2 ER 总览

```mermaid
erDiagram
    Tenant ||--o{ User : ""
    Tenant ||--o{ Kol : ""
    Tenant ||--o{ Game : ""
    Tenant ||--o{ Project : ""
    Tenant ||--o{ OperationLog : ""
    Tenant ||--o{ PendingAction : ""
    Tenant ||--o{ Handoff : ""
    Tenant ||--o{ StubDelivery : ""
    Game ||--o{ Material : ""
    Game ||--o{ GameKnowledge : ""
    GameKnowledge }o--o{ Material : "sourceMaterialIds 数组引用_应用层"
    GameKnowledge |o--o| GameKnowledge : "supersededById 历史链"
    Project }o--o| Game : "可选关联"
    User |o--o{ Project : "owner 分工标记_非权限"
    Project ||--o{ ProjectKol : ""
    Kol ||--o{ ProjectKol : ""
    Project |o--o{ OperationLog : "nullable"
    Kol |o--o{ OperationLog : "nullable"
    User |o--o{ OperationLog : "confirmedBy nullable"
    PendingAction |o--o{ OperationLog : "闸门事件证据链_逐行追加"
    PendingAction ||--o{ StubDelivery : "stub外呼落地_地面真值"
    Project ||--o{ Handoff : "专家间交接"

    Kol {
        uuid id PK
        enum platform "youtube|twitch|tiktok|instagram"
        text handle "tenant+platform 内唯一"
        text platformUserId "采集 upsert 稳定键_nullable"
        int followerCount
        jsonb audienceDemo "契约位_nullable"
        jsonb credibility "契约位_nullable"
        jsonb brandSafety "契约位_nullable"
        jsonb dataSource "契约位_行级来源_nullable"
        jsonb fieldProvenance "契约位_字段级覆盖_nullable"
        vector embedding "vector(1024)_bge-m3_nullable"
        text embeddingTextHash "重嵌入守卫"
    }
    GameKnowledge {
        uuid id PK
        enum kind "selling_point|audience|compliance_redline"
        text content
        jsonb structured
        uuid_array sourceMaterialIds "非空=溯源_zod强制"
        text confidence
        uuid supersededById "旧条目指向替代者"
    }
    Material {
        uuid id PK
        enum type "lore|art|gameplay_doc|review|data|video"
        enum parseStatus "pending|parsing|parsed|failed"
        text storageRef
    }
    OperationLog {
        bigint id PK "autoincrement_append-only"
        enum actorType "agent|human"
        enum toolClass "internal|outbound"
        enum kind "auto|gate|block|irrev"
        enum gateStatus "pending|confirmed|rejected_internal恒null"
        bool reversible "outbound 恒 false"
        uuid confirmedBy "irrev 必填"
        jsonb payload "如实利害"
    }
    PendingAction {
        uuid id PK
        text toolName
        jsonb payload "入参快照_payloadHash防偷换"
        jsonb harm "确认卡披露结构_权威见闸门章harmSchema"
        enum status "pending|confirmed|rejected|expired|executing|executed|failed"
        text ticketHash "一次性票散列_票仅confirm响应出现一次"
    }
    Handoff {
        uuid id PK
        uuid projectId
        text fromAgent
        text toAgent
        jsonb payload "交接上下文快照_P2起写入"
    }
    StubDelivery {
        uuid id PK
        uuid pendingActionId
        text toolName
        jsonb payload "P0stub外呼送达内容_测试地面真值"
    }
    Project {
        uuid id PK
        uuid ownerId "D29 分工非权限"
        text cur "环节游标_骨架"
        jsonb ask "雷达待办_骨架"
    }
    ProjectKol {
        uuid id PK
        enum status "to_send|sent|replied|negotiating|confirmed"
    }
```

## 7.3 Prisma schema 设计

### 7.3.1 datasource / generator / 枚举

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]        // migrate 自动生成 CREATE EXTENSION "vector"
}

enum Platform      { youtube  twitch  tiktok  instagram }
enum MaterialType  { lore  art  gameplay_doc  review  data  video }
enum ParseStatus   { pending  parsing  parsed  failed }
enum KnowledgeKind { selling_point  audience  compliance_redline }
enum ActorType     { agent  human }
enum ToolClass     { internal  outbound }
enum OpLogKind     { auto  gate  block  irrev }              // FR-8.6.2 四类互斥；枚举名跨章统一 OpLogKind
enum GateStatus    { pending  confirmed  rejected }
enum PendingStatus { pending  confirmed  rejected  expired  executing  executed  failed }  // 7 态闸门状态机（闸门章两步票据契约）
enum ProjectKolStatus { to_send  sent  replied  negotiating  confirmed }  // 待发送/已发送/已回复/谈判中/已确认
```

> **`DataSource` 6 值刻意不建 PG enum**：契约位统一落 jsonb，取值由 zod `z.enum` 定义（`src/lib/kol/schemas.ts`）。FR-11.20 明确「schema 是形状唯一权威」——将来新增来源值只改 zod，零 DB 迁移（PG enum 的 `ALTER TYPE ADD VALUE` 在事务内受限，是已知迁移坑）。

### 7.3.2 Kol（完整字段）

```prisma
model Kol {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  platform        Platform
  handle          String                                    // 小写规范化存储
  displayName     String   @map("display_name")
  profileUrl      String   @map("profile_url")
  platformUserId  String?  @map("platform_user_id")         // 采集 upsert 稳定键（FR-11.2）
  countryCode     String?  @map("country_code")             // ISO-3166-1 alpha-2
  language        String?
  followerCount   Int      @default(0) @map("follower_count")
  avgViews        Int?     @map("avg_views")
  engagementRate  Float?   @map("engagement_rate")
  uploadsPerMonth Float?   @map("uploads_per_month")
  lastUploadAt    DateTime? @map("last_upload_at") @db.Timestamptz(6)
  isGaming        Boolean  @default(true) @map("is_gaming")
  categories      String[] @default([])
  email           String?
  emails          String[] @default([])
  relationshipStatus String? @map("relationship_status")    // 库层粗语义；取值 P3 REACH-CRM spec 定；
                                                            // FR-11.1：与 ProjectKol.status 两列不同语义，禁止合并
  tags            String[] @default([])
  status          String?
  metadata        Json?                                     // bio、seed 原始列（aiReasoning 等）暂存于此

  // ── D15 契约位 ×5：建库即存在、全 nullable、seed 不填充（FR-11.3）；形状权威在 zod ──
  audienceDemo    Json?    @map("audience_demo")            // audienceDemoSchema
  credibility     Json?                                     // credibilitySchema {score,method,signals[],assessedAt}
  brandSafety     Json?    @map("brand_safety")             // brandSafetySchema {rating,flags[],assessedAt}
  dataSource      Json?    @map("data_source")              // jsonb 字符串字面量，如 "crawl"（行级来源）
  fieldProvenance Json?    @map("field_provenance")         // { [field]: {source,confidence,fetchedAt,detail} }

  // ── 向量检索（FR-11.5）──
  embedding         Unsupported("vector(1024)")?            // bge-m3；Prisma client 不生成此字段类型，读写走 raw SQL
  embeddingTextHash String? @map("embedding_text_hash")     // sha256(源文本)，重嵌入守卫

  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  tenant        Tenant         @relation(fields: [tenantId], references: [id])
  projectKols   ProjectKol[]
  operationLogs OperationLog[]

  @@unique([tenantId, platform, handle], name: "kol_identity")        // FR-11.2 租户内唯一；seed upsert 键
  @@unique([tenantId, platform, platformUserId], name: "kol_platform_uid") // 采集 upsert 稳定键（PG 多 NULL 不冲突）
  @@index([tenantId, isGaming, followerCount])
  @@map("kol")
}
```

要点：

- `Unsupported("vector(1024)")` 会在迁移里生成正确的 `embedding vector(1024)` DDL，但 Prisma Client **类型层不暴露该字段**——所有 embedding 读写强制走 `$queryRaw`/`$executeRaw`（§7.4），普通 `findMany` 不会误拖 4KB 向量，附带省流量。
- 两个 unique 键分工：seed（CSV 无平台 UID）走 `kol_identity`；后期 Apify 采集走 `kol_platform_uid`（handle 可改名，platformUserId 稳定）。

### 7.3.3 Game / Material / GameKnowledge

```prisma
model Game {
  id          String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String  @map("tenant_id") @db.Uuid
  name        String
  description String?
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz(6)

  tenant    Tenant          @relation(fields: [tenantId], references: [id])
  materials Material[]
  knowledge GameKnowledge[]
  projects  Project[]

  @@unique([tenantId, name])
  @@map("game")
}

model Material {
  id          String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String       @map("tenant_id") @db.Uuid
  gameId      String       @map("game_id") @db.Uuid
  type        MaterialType
  source      String?                              // 来源说明（URL / "upload" / "paste"）
  fileName    String?      @map("file_name")
  storageRef  String?      @map("storage_ref")     // 【P0】本地路径占位；【演进】对象存储 key
  uploadedBy  String?      @map("uploaded_by") @db.Uuid
  parseStatus ParseStatus  @default(pending) @map("parse_status")  // FR-8.4.4 analyzing→done 的持久化载体
  parsedAt    DateTime?    @map("parsed_at") @db.Timestamptz(6)
  createdAt   DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)

  game Game @relation(fields: [gameId], references: [id])

  @@index([gameId, type])
  @@map("material")
}

model GameKnowledge {
  id                String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String        @map("tenant_id") @db.Uuid
  gameId            String        @map("game_id") @db.Uuid
  kind              KnowledgeKind                     // selling_point→喂触达 / audience→喂匹配 / compliance_redline→喂合规
  content           String                            // 面向人的文本表述
  structured        Json?                             // 面向工具调用的结构化 payload（src/lib/game/schemas.ts 按 kind 校验）
  sourceMaterialIds String[]      @map("source_material_ids") @db.Uuid  // FR-11.9：空数组 = 应用层非法（zod min(1)）
  confidence        String?                           // 'high'|'medium'|'low'（zod enum）
  generatedBy       String?       @map("generated_by")                  // 模型/agent 标识
  supersededById    String?       @map("superseded_by_id") @db.Uuid
  createdAt         DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)

  game         Game            @relation(fields: [gameId], references: [id])
  supersededBy GameKnowledge?  @relation("KnowledgeHistory", fields: [supersededById], references: [id])
  predecessors GameKnowledge[] @relation("KnowledgeHistory")

  @@index([gameId, kind, supersededById])
  @@map("game_knowledge")
}
```

要点：

- **N—N 溯源刻意不建 join 表**：`sourceMaterialIds uuid[]` 是「生成那一刻用了哪些素材」的**快照语义**，不需要级联维护；反查「哪些知识引用素材 X」用 GIN（见 §7.7 手补 SQL）。完整性由 zod `min(1)` 在写入口强制。
- **FR-11.11 历史链**：素材更新触发重新分析 → **插入新条目**，把旧条目 `supersededById` 指向新条目，永不物理删除。「现行知识」查询恒定为 `WHERE superseded_by_id IS NULL`——这是所有下游工具（FR-8.4.9：特点是工具调用输入）取知识的唯一入口条件。
- 真实解析属 P1（F  R-8.4 本批预留 schema、UI 可 mock）——**表和 zod 本批建齐，`parseStatus` 流转本批可 mock**。

### 7.3.4 OperationLog（append-only 动作溯源）

本节为 OperationLog 的**唯一 Prisma 权威**（闸门章 A4 §6.5.1 改为引用本节）；索引集为跨章合并后的定稿。

```prisma
model OperationLog {
  id              BigInt      @id @default(autoincrement())
  tenantId        String      @map("tenant_id") @db.Uuid
  actorType       ActorType   @map("actor_type")
  actorId         String      @map("actor_id")        // agent 名（strategy/match/…）或 User.id
  action          String                              // = 工具名（search_kols / send_outreach / …）
  toolClass       ToolClass   @map("tool_class")
  kind            OpLogKind                           // 派生规则见下表
  reversible      Boolean                             // outbound ⇒ false（应用层不变量）
  gateStatus      GateStatus? @map("gate_status")     // internal 恒 null（FR-11.12）
  confirmedBy     String?     @map("confirmed_by") @db.Uuid   // kind=irrev 必填（应用层不变量）
  confirmedAt     DateTime?   @map("confirmed_at") @db.Timestamptz(6)
  projectId       String?     @map("project_id") @db.Uuid
  kolId           String?     @map("kol_id") @db.Uuid
  pendingActionId String?     @map("pending_action_id") @db.Uuid  // 串联同一闸门事件的全部日志行（gate pending/rejected/confirmed 与 irrev）
  payload         Json                                // 如实利害快照（harm 结构，FR-10.5）
  resultRef       String?     @map("result_ref")
  createdAt       DateTime    @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant        Tenant         @relation(fields: [tenantId], references: [id])
  project       Project?       @relation(fields: [projectId], references: [id])
  kol           Kol?           @relation(fields: [kolId], references: [id])
  confirmedUser User?          @relation(fields: [confirmedBy], references: [id])
  pendingAction PendingAction? @relation(fields: [pendingActionId], references: [id])

  @@index([tenantId, kind])                // FR-11.13 按类型筛（合并后定稿索引集）
  @@index([tenantId, toolClass])
  @@index([tenantId, projectId])
  @@index([kolId])
  @@index([createdAt])
  @@map("operation_log")
}
```

**`kind` 派生规则**（`src/lib/oplog/append.ts` 里以 zod `superRefine` 强制，写歪当场抛错）：

| 场景 | toolClass | kind | gateStatus | 备注 |
|---|---|---|---|---|
| internal 工具执行 | internal | `auto` | null | FR-11.14：也写日志，UI 弱化展示 |
| outbound 拦截（创建 PendingAction） | outbound | `gate` | `pending` | 与 PendingAction 创建同事务；拦截时不下发任何令牌 |
| outbound 被人拒绝 | outbound | `gate` | `rejected` | 追加新行，不改 pending 行 |
| outbound 人确认（**确认=签票**） | outbound | `gate` | `confirmed` | 追加 gate 类日志行；票仅在 confirm 响应中出现一次（闸门章） |
| 合规拦截 | internal/outbound | `block` | — | payload 必含拦截原因（FR-8.6.5） |
| outbound **执行=消费票**、副作用成功 | outbound | `irrev` | `confirmed` | 与 PendingAction finalize(`executed`) **同一事务**插入；confirmedBy/confirmedAt 必填（FR-8.6.3）；副作用失败 → PendingAction=`failed`，**无 irrev 行** |

**Append-only 是 DB 层强制，不是应用层自觉**（跨章铁律②）：迁移手补触发器阻断 UPDATE/DELETE（SQL 见 §7.7）。闸门事件的每次状态变化都**追加新行**（拦截 / 拒绝 / 签票 / irrev 各自成行，FR-11.12），以 `pendingActionId` 串联；可翻转的状态机在 PendingAction（条件 UPDATE，§7.3.5），不在本表。

### 7.3.5 PendingAction（闸门状态表，唯一可变的闸门状态机）

OperationLog 是不可变审计流水；但闸门需要一个**可查询、可翻转的当前状态**（「这张确认卡还有效吗」）。两者分工：PendingAction 存状态机，OperationLog 存证据链。本节为 PendingAction 的**唯一 Prisma 权威**（闸门章引用本节）；状态机 **7 态**，运行时流转按闸门章两步票据契约（confirm 签票 → execute 消费票）。

> outbound 口径分辨（与 PRD 一致）：**语义类别 5 类**（发信/报价/放款/分发 Key/对外分享，批量发=发信类的批量形态）；**工具白名单 6 个工具名**（批量发因 harm 必须列全名单而独立成工具），`OUTBOUND_TOOL_NAMES` 共 6 名。

```prisma
model PendingAction {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String        @map("tenant_id") @db.Uuid
  toolName        String        @map("tool_name")       // send_outreach / send_bulk_outreach / commit_quote / payout / distribute_keys / create_share_link
  payload         Json                                  // 工具入参完整快照——确认后按此执行
  payloadHash     String        @map("payload_hash")    // sha256(规范化 payload)——杜绝「确认的与执行的不是同一件事」
  harm            Json                                  // 确认卡披露结构；形状唯一权威见闸门章 harmSchema（见下）
  status          PendingStatus @default(pending)       // 7 态：pending|confirmed|rejected|expired|executing|executed|failed
  sourceAgent     String?       @map("source_agent")    // 发起专家（FR-8.6.3 irrev 归属）
  requestedBy     String?       @map("requested_by")    // 发起方运行标识（agent 运行/会话归属）
  projectId       String?       @map("project_id") @db.Uuid
  kolId           String?       @map("kol_id") @db.Uuid
  ticketHash      String?       @map("ticket_hash")     // 一次性票 sha256；票本体仅在 confirm 响应中出现一次（不变量 I3），
                                                        // 绝不进入工具结果/模型上下文；拦截时不下发任何令牌（FR-10.1）
  ticketExpiresAt DateTime?     @map("ticket_expires_at") @db.Timestamptz(6)  // TTL 常量 GATE_TICKET_TTL_MS（5min）唯一定义于 src/lib/agent/gate/ticket.ts
  ticketUsedAt    DateTime?     @map("ticket_used_at") @db.Timestamptz(6)
  confirmedBy     String?       @map("confirmed_by") @db.Uuid
  confirmedAt     DateTime?     @map("confirmed_at") @db.Timestamptz(6)
  createdAt       DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant         Tenant         @relation(fields: [tenantId], references: [id])
  operationLogs  OperationLog[]
  stubDeliveries StubDelivery[]

  @@index([tenantId, status, createdAt])
  @@map("pending_action")
}
```

`harm` 列的形状**权威定义见闸门章 `src/lib/agent/gate/harm.ts` 的 `harmSchema`**（要点：`title: string` + `irreversibleLabel: z.literal('对外·不可撤销')` + `facts: string[]` + `recipients: [{displayName, platform, handle?}]` + 可选 `amount`/`scope`/`basis`；验收 G2 断言 `harm.irreversibleLabel === '对外·不可撤销'`）。本章及一切消费方一律以 `z.infer<typeof harmSchema>` 引用，不得另定义私有形状。

**事务不变量（语义权威见闸门章，本章只陈述数据面结果；`src/lib/agent/gate/pending.ts` 封装，任何调用方不得绕过）：**

1. **创建（拦截）**：`INSERT PendingAction(pending)` + `INSERT OperationLog(kind=gate, gateStatus=pending)` 同一 `prisma.$transaction`；拦截时不下发任何令牌。
2. **确认=签票**：条件 `UPDATE`（`status: pending → confirmed`，写 `ticketHash`/`ticketExpiresAt`）+ 追加 gate 类日志行；票仅在 confirm 响应中出现一次（不变量 I3）。
3. **执行=消费票**：条件 `UPDATE`（`confirmed → executing`，校验票散列匹配、未用、未过期）→ 执行副作用（P0 为 stub，落 StubDelivery 行）→ 成功则**同一事务** finalize（`executing → executed`、写 `ticketUsedAt`）+ `INSERT OperationLog(kind=irrev, gateStatus=confirmed, confirmedBy, payload=harm 快照)`；副作用失败 → `failed`，**不产生 irrev 行**。
4. **并发防护 = PendingAction 条件 UPDATE**：状态翻转一律 `UPDATE … WHERE status = <期望前态>`，affected rows = 0 即判定竞争失败，按闸门章错误码映射返回。

【演进】真实外呼（P3 起接 Resend 等）的一致性升级为 outbox 模式、回写 `resultRef`；P0 的 outbound 副作用均为 stub（写 StubDelivery 地面真值，§7.3.8），此简化无风险。

### 7.3.6 Tenant / User

```prisma
model Tenant {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  users User[]  kols Kol[]  games Game[]  projects Project[]
  operationLogs OperationLog[]  pendingActions PendingAction[]
  handoffs Handoff[]  stubDeliveries StubDelivery[]
  @@map("tenant")
}

model User {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  email       String
  displayName String    @map("display_name")
  avatarUrl   String?   @map("avatar_url")
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz(6)

  tenant        Tenant         @relation(fields: [tenantId], references: [id])
  ownedProjects Project[]
  confirmedLogs OperationLog[]

  // D26/FR-11.16 硬约束：无 role、无 scope、无审批链列。任何迁移引入
  // role/scope/Approval/allowedRoles 均属回填作废层，Evaluator 按此拒收。
  @@unique([tenantId, email])
  @@map("user")
}
```

单租户引导：`src/lib/db/tenant.ts` 导出固定常量 `DEV_TENANT_ID`（写死 uuid 字面量，D4），所有服务端查询显式带 `tenantId: DEV_TENANT_ID`；`scripts/seed/bootstrap-dev.ts` 幂等 upsert 该 Tenant + **一个** dev User（F003 已作废三角色用户）。

### 7.3.7 Project / ProjectKol（骨架，字段级留 P1/P3/P4）

```prisma
model Project {
  id        String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String  @map("tenant_id") @db.Uuid
  gameId    String? @map("game_id") @db.Uuid
  name      String
  ownerId   String? @map("owner_id") @db.Uuid   // D29/FR-11.15：分工标记（防撞车），禁止参与任何权限判定
  cur       String? // 环节游标 'brief'|'match'|'reach'|'delivery'|'insight'（zod 校验；FR-7.8 导轨/timeline 同源）
  ask       Json?   // 驾驶舱「需要你确认」展示聚合层 {env,summary,urgency,…}；FR-8.1.1 ask≠null 才上雷达；形状 P1 spec 定；
                    // 其 outbound 条目由 PendingAction(status=pending) 派生，KPI 与徽标计数均经 list_pending_asks 单一工具取数（跨章唯一口径）
  status    String?
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id])
  game   Game?  @relation(fields: [gameId], references: [id])
  owner  User?  @relation(fields: [ownerId], references: [id])
  kols   ProjectKol[]
  operationLogs OperationLog[]
  handoffs Handoff[]

  // 【留 P1/P3/P4】预算/时间线/KPI/健康度输入项——字段级 schema 由对应批次 spec 裁决后 additive migration 补列
  @@map("project")
}

model ProjectKol {
  id        String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String           @map("tenant_id") @db.Uuid
  projectId String           @map("project_id") @db.Uuid
  kolId     String           @map("kol_id") @db.Uuid
  status    ProjectKolStatus @default(to_send)   // 项目层细语义 5 态；与 Kol.relationshipStatus 禁止合并（FR-11.1）
  owner     String?                              // D29 分工标记（防两人同发一位创作者）
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  project Project @relation(fields: [projectId], references: [id])
  kol     Kol     @relation(fields: [kolId], references: [id])

  // 【留 P3/P4】报价/条款/交付条件/放款关联（Deal/Payout/Outreach 引用级实体届时新表，不改本表既有列）
  @@unique([projectId, kolId])
  @@index([projectId, status])
  @@map("project_kol")
}
```

FR-8.2.3.4（CRM 阶段从真实事件自动推断）的实现含义：`ProjectKol.status` 的写入口在 P3 收敛为「事件驱动的状态推导」，本批只建列与枚举，不建手动切换 UI。

### 7.3.8 Handoff / StubDelivery（交接记录与 P0 地面真值）

```prisma
model Handoff {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  projectId String   @map("project_id") @db.Uuid
  fromAgent String   @map("from_agent")
  toAgent   String   @map("to_agent")
  payload   Json?                                  // 交接上下文快照（结论/待办/引用）
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant  Tenant  @relation(fields: [tenantId], references: [id])
  project Project @relation(fields: [projectId], references: [id])

  @@index([projectId, toAgent, createdAt])
  @@map("handoff")
}

model StubDelivery {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  pendingActionId String   @map("pending_action_id") @db.Uuid
  toolName        String   @map("tool_name")
  payload         Json                              // stub 外呼「已送达」内容快照
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant        Tenant        @relation(fields: [tenantId], references: [id])
  pendingAction PendingAction @relation(fields: [pendingActionId], references: [id])

  @@index([pendingActionId])
  @@map("stub_delivery")
}
```

- **Handoff**：专家间交接记录。**F001 建齐表结构，P2（多专家编排）起才有写入路径**；本批零写入不影响迁移完整性。
- **StubDelivery**：P0 outbound stub 副作用的**测试地面真值**——execute 消费票、副作用成功即插一行。G1 验收依赖它：无票/伪票 → 403 `GATE_TOKEN_INVALID`；pending 未确认 → StubDelivery 行数不变。

## 7.4 pgvector 检索设计

### 7.4.1 vector 列在 Prisma 的落法

- schema：`embedding Unsupported("vector(1024)")?`（§7.3.2）+ `extensions = [vector]`。`prisma migrate dev` 生成的 SQL 自带 `CREATE EXTENSION IF NOT EXISTS "vector"` 与 `embedding vector(1024)` 列。
- Prisma Client 对 `Unsupported` 字段**不生成读写 API**——这是刻意的强约束面：embedding 只能经 `src/lib/kol/search.ts` 的两个函数触达，raw SQL 全部走 **参数化** `$queryRaw`/`$executeRaw` 标签模板（无 SQL 拼接注入面，NFR-S6）。

```ts
// src/lib/kol/search.ts —— 裸 src 导入：import { prisma } from 'lib/db/prisma'
const EMBEDDING_DIM = 1024;                       // bge-m3

const toVectorLiteral = (v: number[]): string => {
  if (v.length !== EMBEDDING_DIM) throw new Error(`embedding dim ${v.length} !== ${EMBEDDING_DIM}`);
  return `[${v.join(',')}]`;                      // pgvector 文本字面量，经 ::vector 参数化传入
};

export type KolSearchHit = {
  id: string; platform: string; handle: string; displayName: string;
  followerCount: number; countryCode: string | null; categories: string[];
  score: number;                                  // = 1 − cosine 距离 ∈ [0,1]，越大越相关
};

export async function searchKolsByVector(
  tenantId: string, queryEmbedding: number[], topK = 20,
): Promise<KolSearchHit[]> {
  const vec = toVectorLiteral(queryEmbedding);
  return prisma.$queryRaw<KolSearchHit[]>`
    SELECT id, platform, handle,
           display_name   AS "displayName",
           follower_count AS "followerCount",
           country_code   AS "countryCode",
           categories,
           1 - (embedding <=> ${vec}::vector) AS score
    FROM kol
    WHERE tenant_id = ${tenantId}::uuid
      AND deleted_at IS NULL
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}::vector
    LIMIT ${topK}`;
}

export async function writeKolEmbedding(kolId: string, embedding: number[], textHash: string) {
  await prisma.$executeRaw`
    UPDATE kol SET embedding = ${toVectorLiteral(embedding)}::vector,
                   embedding_text_hash = ${textHash}
    WHERE id = ${kolId}::uuid`;
}
```

`<=>` 是 pgvector 的 **cosine 距离**算子（升序 = 最相关在前）；cosine 对未归一化向量数学上自带归一，bge-m3 输出无需预归一化（若未来改用内积 `<#>` 才需要）。

### 7.4.2 索引策略：P0 不建向量索引

| 阶段 | 数据量 | 策略 | 理由 |
|---|---|---|---|
| 【P0】 | ~2,524 行 | **顺序扫描，不建向量索引** | 2.5k×1024 float 暴力扫为毫秒级，NFR-P3（DB 侧 <200ms）余量一个数量级以上；且精确排序零召回损失，hello-agent 验收（cosine top-K 相关）不受近似索引噪声干扰 |
| 【演进】≥5 万行（Apify 采集接入后） | — | HNSW：`CREATE INDEX kol_embedding_hnsw ON kol USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64) WHERE deleted_at IS NULL AND embedding IS NOT NULL;` | raw SQL 落独立迁移；partial index 缩体积。**不选 IVFFlat**：需数据先行训练 lists、增量插入后召回退化，与持续采集的写入模式相性差 |

注意算子类必须与查询算子匹配：`<=>` ⇔ `vector_cosine_ops`，配错索引不生效（EXPLAIN 验证写进 F003 冒烟脚本）。

### 7.4.3 embedding 源文本与重嵌入守卫（FR-11.5）

```ts
// src/lib/kol/embedding.ts
export function buildEmbeddingText(kol: {
  displayName: string; categories: string[]; countryCode: string | null; metadata: unknown;
}): string {
  return [
    kol.displayName,
    kol.categories.join(' '),
    kol.countryCode ?? '',
    summarizeMetadata(kol.metadata),   // bio / seed 的 aiReasoning 摘要，截断 512 字符
  ].filter(Boolean).join('\n');
}

export const hashEmbeddingText = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');
```

守卫规则：任何写 embedding 的路径必须先算 `hashEmbeddingText(buildEmbeddingText(kol))`，与 `embeddingTextHash` 相同则**跳过**（幂等 + 省 embedding 成本）。源文本构成变更（如未来把 `audienceDemo` 摘要纳入）＝改 `buildEmbeddingText` ＝ 全量 hash 失配 ＝ 自然触发全量重嵌入，无需额外迁移开关。

### 7.4.4 查询链路与缓存挂点

`search_kols` 工具（F004）：NL query → `src/lib/ai/gateway.ts` bge-m3 embed（1024 维）→ `searchKolsByVector` → 结果带 `type:'kol_cards'` 回流 canvas。匹配%组合分（向量 cosine + `audienceDemo`，FR-11.6）属 P2 MATCH；P0 hello-agent 用纯向量 `score`，`audienceDemo` 为 null 时 UI 标「受众数据待接入」。【演进】NFR-P7：同 query embedding 进程内 LRU 复用、`get_kol_detail` 短 TTL——挂点预留在 gateway 封装层，P0 不实现。

## 7.5 溯源实现（数据维）

### 7.5.1 六值 DataSource 与展示档位

```ts
// src/lib/kol/schemas.ts —— jsonb 形状唯一权威（FR-11.20）
export const dataSourceSchema = z.enum([
  'platform_api',   // 平台一方 API
  'optin',          // KOL 授权直连
  'purchased',      // 外购数据（第三方评估）
  'crawl',          // 自建采集
  'user_upload',    // 用户上传
  'ai_estimate',    // AI 推断 —— 保守下限（FR-11.7 兜底值）
]);
export type DataSource = z.infer<typeof dataSourceSchema>;

// ProvenanceTag 的四档可视区分（FR-12.14 / NFR-A4：不得仅靠颜色，档位配图标+文案）
export const provenanceTier = (s: DataSource) =>
  s === 'platform_api' || s === 'optin' ? 'first_party'   // 「平台一方数据 ✓」
  : s === 'purchased'                   ? 'third_party'   // 「第三方评估」
  : s === 'crawl' || s === 'user_upload'? 'collected'     // 「采集/自报」
  :                                       'estimate';     // 「推断值，未验证」
```

### 7.5.2 契约位 zod（读时校验、降级不抛错）

```ts
export const fieldProvenanceEntrySchema = z.object({
  source: dataSourceSchema,
  confidence: z.enum(['high', 'medium', 'low']).nullable(),
  fetchedAt: z.string().datetime(),          // FR-11.8 新鲜度，逐字段可查
  detail: z.string().optional(),
});
export const fieldProvenanceSchema = z.record(z.string(), fieldProvenanceEntrySchema);

export const audienceDemoSchema = z.object({  // gap §5.1 形状
  ageDist: z.record(z.string(), z.number().min(0).max(1)),
  genderDist: z.record(z.string(), z.number().min(0).max(1)),
  geoDist: z.record(z.string(), z.number().min(0).max(1)),   // countryCode → 占比（NFR-I5 多区域）
  interests: z.array(z.string()),
});

export const credibilitySchema = z.object({
  score: z.number().min(0).max(100),
  method: z.string(),
  signals: z.array(z.string()).min(1),       // FR-11.4：空依据的分数非法
  assessedAt: z.string().datetime(),
});

export const brandSafetySchema = z.object({
  rating: z.string(),                        // 'A' | 'A-' | 'B+' …
  flags: z.array(z.object({
    code: complianceFlagSchema,              // ← src/lib/compliance/flags.ts，见 7.5.4
    evidence: z.string().min(1),             // FR-11.4：flag 必带依据；「无风险」以明示 'clear' 条目表达，不用空数组
    detail: z.string().optional(),
  })).min(1),
  assessedAt: z.string().datetime(),
});
```

**读写不对称策略**（FR-11.17 缺值=显示态非错误态 vs NFR-S6 边界先校验）：

- **写入口**：`schema.parse()` 严格失败抛错——坏形状不入库。
- **读出口**：统一经 helper，坏形状**降级为 null**（等同「待接入」）并 server log，绝不把渲染层炸掉：

```ts
export function readContractSlot<T>(schema: z.ZodType<T>, raw: unknown, ctx: string): T | null {
  if (raw == null) return null;
  const r = schema.safeParse(raw);
  if (!r.success) { console.warn(`[contract-slot] invalid ${ctx}`, r.error.flatten()); return null; }
  return r.data;
}
```

zod 默认 strip 未知 key——契约位内部**加字段**属向后兼容演进，旧数据读取不受影响（见 §7.7）。

### 7.5.3 读取合并规则：resolveProvenance（FR-11.7 三级回退）

`ProvenanceTag`（WORKBENCH-UI 新建件）的唯一数据源。规则：**字段级覆盖 → 行级 dataSource → 皆空视为 ai_estimate（保守下限）**。

```ts
// src/lib/provenance/resolve.ts
export type ResolvedProvenance = {
  source: DataSource;
  confidence: 'high' | 'medium' | 'low' | null;
  fetchedAt: string | null;                  // null = 新鲜度未知
  detail?: string;
  resolvedFrom: 'field' | 'row' | 'fallback'; // 展开明细（FR-8.3.11）时说明溯源层级
};

export function resolveProvenance(
  kol: { dataSource: unknown; fieldProvenance: unknown },
  field: string,                             // 如 'followerCount' | 'audienceDemo.geoDist'
): ResolvedProvenance {
  const fp = readContractSlot(fieldProvenanceSchema, kol.fieldProvenance, 'kol.fieldProvenance');
  const entry = fp?.[field];
  if (entry) return { ...entry, resolvedFrom: 'field' };

  const row = readContractSlot(dataSourceSchema, kol.dataSource, 'kol.dataSource');
  if (row) return { source: row, confidence: null, fetchedAt: null, resolvedFrom: 'row' };

  return { source: 'ai_estimate', confidence: null, fetchedAt: null, resolvedFrom: 'fallback' };
}
```

两个务必分清的语义（FR-7.21/11.17/11.19 的组合）：

| 情形 | 渲染 |
|---|---|
| 字段**值**为 null（如 `audienceDemo` 未填充） | 「待接入」占位，不渲染数据点，也就无溯源徽标 |
| 字段值存在、溯源链空 | 正常渲染数据点 + `ai_estimate` 徽标（「推断值，未验证」）——**永不出现裸数据点** |

### 7.5.4 flags 命名空间对齐（FR-11.10）

`Kol.brandSafety.flags[].code` 与 `GameKnowledge(kind=compliance_redline).structured` 的 flag 码共用**同一常量出处**：

```ts
// src/lib/compliance/flags.ts —— 唯一出处；P1 合规环节按真实规则扩充，两侧自动同步
export const COMPLIANCE_FLAGS = [
  'gambling', 'alcohol', 'adult_content', 'political', 'profanity',
  'competitor_collab', 'undisclosed_sponsorship', 'clear',
] as const;
export const complianceFlagSchema = z.enum(COMPLIANCE_FLAGS);
```

`src/lib/game/schemas.ts` 中 `compliance_redline` 的 `structured` 按 kind 走 discriminated union，其 `flag` 字段同样引 `complianceFlagSchema`——「游戏红线」与「KOL 安全标记」在 P2 匹配/合规判定时可直接做集合运算，无需字符串映射层。

## 7.6 Seed 管道（F003）

### 7.6.1 源文件实测

源：`/Users/yixingzhou/project/joyce/docs/kol-seed-enriched-final.csv`（旧仓库产物，**拷入本 repo `data/seed/` 并入 git**——F003 可复现性验收）。实测：**2,525 行含表头 = 2,524 条**；**UTF-8 带 BOM**；中文表头 `idx,平台,昵称,频道链接,地区,粉丝数,是否游戏,类目,置信度,AI 判断理由,阶段`；「AI 判断理由」含逗号引号包裹字段——**必须用 `csv-parse`（`bom: true`）解析，naive split 会错列**（实测验证过错位）。平台全部为 `Youtube`；地区为中文国名（美国 1,585 / 英国 320 / 巴基斯坦 284 / …）；类目以 `Other`(2,097)/`Casual`/`FPS` 等为主；置信度 高/中/低。

### 7.6.2 规范化规则（`scripts/seed/import-kol-csv.ts`）

| CSV 列（实测） | 目标字段 | 规则 |
|---|---|---|
| `平台` | `platform` | 白名单映射 `{Youtube→youtube, Twitch→twitch, …}`；未知值 **fail fast** 整行报错（NFR-S6 外部数据不可信） |
| `频道链接` | `profileUrl` + `handle` 主提取源 | `youtube.com/@SKIFler_WOT` → handle `skifler_wot`（**小写规范化**，稳定 unique 键）；提取失败回退昵称 slug |
| `昵称` | `displayName` | 原样保留大小写 |
| `地区`（中文） | `countryCode` | `scripts/seed/country-map.ts` 中文国名→ISO alpha-2（美国→US、英国→GB、巴基斯坦→PK、台湾→TW…）；未命中 → **null + 计数入尾部报告，不编造**（FR-11.18 精神） |
| `粉丝数` | `followerCount` | parseInt；非法 → 0 + 警告计数 |
| `是否游戏` | `isGaming` | 是→true / 否→false（保留非游戏行，不过滤） |
| `类目` | `categories` | `[值]` 单元素数组，`Other` 原样保留 |
| `idx`/`置信度`/`AI 判断理由`/`阶段` | `metadata.{seedIdx, seedConfidence, aiReasoning, stage}` | 原样留档（`aiReasoning` 同时进 embedding 源文本摘要） |
| — | 5 个契约位 | **一律不填**（FR-11.3）；读取合并规则自然兜底为 `ai_estimate` 保守下限 |

### 7.6.3 幂等设计（两阶段）

```
scripts/seed/bootstrap-dev.ts   # 阶段0：upsert DEV_TENANT + 单个 dev User（固定 uuid，重跑无副作用）
scripts/seed/import-kol-csv.ts  # 阶段1：CSV → 规范化 → prisma.kol.upsert(where: kol_identity)
scripts/seed/embed-kols.ts      # 阶段2：增量 embedding
```

- **阶段1 幂等键** = `@@unique([tenantId, platform, handle], name: "kol_identity")`——CSV 无 platformUserId，走 handle 键；重跑 = 更新非重复插入。~2.5k 条用逐条 upsert + 并发上限（p-limit 10）即可，无需 COPY 优化。
- **阶段2 幂等键** = `embeddingTextHash`：只处理 `embedding IS NULL OR embedding_text_hash <> 当前源文本 hash` 的行；批量调 gateway bge-m3（batch 32–64，指数退避重试，成本记账挂点走 FR-12.31 的 gateway 封装）。
- **失败清晰不静默吞**（F002 同款纪律）：逐批 try/catch 收集失败行，尾部输出摘要（导入 n / 更新 m / 国家未映射 k / embed 失败 j）；任何失败 → 非零 exit code。
- **收尾断言**（对齐 15.5 数据门）：`COUNT(embedding IS NOT NULL) >= 2000` 不满足即失败；再跑一条固定 NL query 的 `<=>` top-5 抽查输出，供人工核对相关性。

npm scripts（`package.json` 新增）：

```json
"db:up":      "docker compose -f docker-compose.dev.yml up -d",
"db:migrate": "prisma migrate dev",
"seed:dev":   "tsx scripts/seed/bootstrap-dev.ts",
"seed:kols":  "tsx scripts/seed/import-kol-csv.ts",
"seed:embed": "tsx scripts/seed/embed-kols.ts"
```

`docker-compose.dev.yml`（`pgvector/pgvector:pg16`；现仓库只有 prod compose 且无 DB 服务——此文件为新建）与 `.env.example` 的内容**唯一权威定义见 A7 §9.2（含 healthcheck）**，本章不重复定义；`DATABASE_URL` 示例统一以该节为准（凭据仅本机 dev 抛弃值，生产凭据不入 git——15.5 密钥门）。

## 7.7 迁移与演进策略

### 7.7.1 迁移工作流

1. 改 `prisma/schema.prisma` → `npx prisma migrate dev --create-only --name <name>`。
2. **手补 raw SQL** 追加到生成的 `migration.sql` 尾部（Prisma 表达不了的三类）：

```sql
-- (a) OperationLog append-only：DB 层阻断，不靠应用层自觉（跨章铁律②）
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'operation_log is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER operation_log_append_only
  BEFORE UPDATE OR DELETE ON operation_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- (b) GameKnowledge 反查「哪些知识引用素材 X」
CREATE INDEX game_knowledge_source_materials_gin
  ON game_knowledge USING gin (source_material_ids);

-- (c)【演进，本批不建】HNSW 向量索引 —— 见 §7.4.2，届时独立迁移
```

3. `prisma migrate dev` 应用；`CREATE EXTENSION "vector"` 由 `postgresqlExtensions` 的 `extensions = [vector]` 自动生成（previewFeatures），无需手写。**F001 验收项：检查生成的 `migration.sql` 含 `CREATE EXTENSION vector`**（此为跨章定稿口径，A7 改为引用本节）。
4. 触发器行为写进变异测试（D20/15.4 精神）：测试尝试 `UPDATE operation_log` 断言必然抛错——把触发器删掉这条断言必须变红。
5. 【演进】生产 `prisma migrate deploy` 接入 CD 属 CICD 全栈化改造批次；schema 侧无阻塞项。

### 7.7.2 nullable 契约位的零返工填充路径（gap §5.3 的落地）

功能层只依赖**字段契约**不依赖数据来源，因此数据到位的动作全部是 `UPDATE`，不是迁移：

| 演进事件 | 需要的操作 | schema/UI/工具改动 |
|---|---|---|
| Apify 采集接入 | 采集帧 zod 校验 → `UPDATE kol SET audience_demo=…, field_provenance = field_provenance ∥ {…source:'crawl'…}`，upsert 走 `kol_platform_uid` 稳定键 | **零**——UI 从「待接入」自动变实值+徽标 |
| 外购数据（Modash 类） | 同上，source=`purchased` | 零 |
| KOL 授权直连 | 同上，source=`optin`/`platform_api`，`fieldProvenance` 字段级覆盖行级来源 | 零（合并规则 §7.5.3 天然支持混源共存，NFR-D1） |
| 契约位内部加 key | 改 zod schema（宽松读旧数据，strip 未知 key 向后兼容） | 零迁移 |
| 新增契约位 / P1~P4 补列（Project 预算、ProjectKol 报价等） | additive migration 加 **nullable** 列——PG11+ 加空列是 metadata-only，无重写无锁表 | 旧行自动为「待接入」显示态 |
| 新增 DataSource 取值 | 只改 `dataSourceSchema`（jsonb 无 DB enum，§7.3.1 决策的兑现） | 零迁移 |

### 7.7.3 P0 落地 vs 后期演进总表

| 事项 | 【P0 落地】（F001–F008） | 【演进】 |
|---|---|---|
| 表 | 全部 12 表建齐（含 PendingAction 7 态闸门表、Handoff——F001 建齐 P2 起写入、StubDelivery——P0 地面真值；Project/ProjectKol 为骨架列） | Deal/Payout/Outreach 引用级实体 P3/P4 spec 后新表 |
| 契约位 | 5×jsonb nullable + zod，seed 不填充 | 采集/外购/授权管道回填 + fieldProvenance |
| 向量 | vector(1024) 列 + 顺序扫描 top-K | ≥5 万行建 HNSW（partial index） |
| 租户 | `DEV_TENANT_ID` 硬编码 + 显式过滤 | M5 RLS（`app.tenant_id` GUC）；依赖运行时无状态（FR-12.9），上层不改 |
| 认证 | 单 dev User，无登录 | M5 真实认证 |
| OperationLog | 触发器阻断 UPDATE/DELETE + 闸门事件逐行追加（以 pendingActionId 串联） | 外呼一致性升级 outbox；日志表分区（量大后） |
| Material 存储 | `storageRef` 本地占位 | 对象存储 + 解析管道（P1 真解析） |
| 部署 | dev docker compose；prod compose 仍前端-only | CICD 批次补 prod DB 服务 + migrate deploy + env 注入 |

**红线复述**（Evaluator 将按此拒收）：任何迁移不得引入 `role`/`scope`/`Approval`/`allowedRoles`/阈值分级列（FR-11.16，作废层禁止回填）；`operation_log` 不得出现 UPDATE 路径；`Kol.relationshipStatus` 与 `ProjectKol.status` 不得合并。

---

# 8. API 设计与集成

> 本章约定全部后端 HTTP 面。现状：仓库**零后端路由**（无 `src/app/api/`、无 `src/lib/`），本章所有路径均为新建；导入一律走裸 src 导入（`tsconfig baseUrl: "src"`，如 `import { serverEnv } from 'lib/env'`）；**不新增 `@/` 别名**，保留既有 `@/public/*` 静态资源映射（tsconfig paths 已存在）。所有 route handler 跑 Node.js runtime（Prisma + pgvector 依赖），且**运行时无状态**（FR-12.9）：对话状态由前端 `useChat` 逐轮回传，服务端不做任何跨请求会话缓存——这是后期 RLS 的边界前提（NFR-S9）。

## 8.1 路由清单

| 路由 | 方法 | 职责 | 归属 | 阶段 |
|---|---|---|---|---|
| `/api/agent` | POST | Agent 运行时流式 loop（四柱②）：NL → 工具调用 → 流式产出 | F004 | **P0** |
| `/api/actions/[id]` | GET | pending 详情：today 雷达卡/项目页据此重新渲染确认卡（刷新/跨会话恢复，见 §8.1.2） | F008 | **P0** |
| `/api/actions/[id]/confirm` | POST | AI→人闸门第一步：人拍板 → 签发一次性票据（票**仅在本响应出现一次**，不变量 I3） | F008 | **P0** |
| `/api/actions/[id]/execute` | POST | AI→人闸门第二步：消费票据 → 执行副作用 → 同事务留痕 | F008 | **P0** |
| `/api/actions/[id]/reject` | POST | 拒绝 pending 动作，零副作用 | F008 | **P0** |
| `/api/operation-logs` | GET | append-only 操作日志查询（按 toolClass/action/projectId/reversible 筛，FR-11.13）；**P0 形态 = `/admin/runs` 以 RSC 直读 `lib/oplog/queries.ts`，不经 HTTP** | — | 演进（P1+） |
| `/api/health` | GET | 健康检查（DB 连通 + env 校验状态）；替换现 compose healthcheck 打页面路由（F006 起改指 `/admin/today`）的做法 | — | 演进（M5 生产硬化，需同步改 `docker-compose.prod.yml`） |
| `/api/kols`、`/api/kols/[id]` | GET | 创作者库兜底 REST（D5：对话面为主轴，表格/筛选为兜底） | — | 演进（WORKBENCH-UI/P2） |
| `/api/projects`、`/api/projects/[id]`、`/api/projects/[id]/kols` | GET/POST/PATCH | 项目与 ProjectKol（5 态）资源 | — | 演进（P1–P3） |
| `/api/games`、`/api/games/[id]/materials` | GET/POST | 游戏知识库素材上传（`UploadZone` 后端） | — | 演进（P1，schema P0 预留） |
| `/api/ingest/apify` | POST | Apify 采集回调 webhook（见 §8.3.1） | — | 演进（M5） |
| `/api/webhooks/partner` | POST | partner 电子签/托管状态回写（见 §8.3.2） | — | 演进（P4） |

目录落位：

```
src/
├── instrumentation.ts               # §8.4 启动校验入口（register() 调一次 serverEnv()）
├── app/
│   ├── admin/runs/                  # F008：留痕可查 P0 形态——RSC 直读 lib/oplog/queries.ts（不经 HTTP）
│   └── api/
│       ├── agent/route.ts           # F004：streamText 流式 loop
│       └── actions/[id]/            # F008：闸门两步契约（权威定义见闸门章 A4）
│           ├── route.ts             # GET pending 详情（恢复渲染确认卡）
│           ├── confirm/route.ts     # 人确认 → 签发一次性票据
│           ├── execute/route.ts     # 消费票据 → 执行副作用 + 同事务留痕
│           └── reject/route.ts      # 拒绝，零副作用
└── lib/
    ├── env.ts                       # §8.4 环境变量唯一权威（serverEnv() 惰性缓存）
    ├── api/
    │   ├── envelope.ts              # ok()/err() 响应构造器
    │   └── errors.ts                # ApiErrorCode 枚举 + HTTP 映射
    ├── ai/
    │   ├── gateway.ts               # F002：aigcgateway provider（§8.2）
    │   ├── embed.ts                 # embedding 封装（重试/超时/维度断言）
    │   ├── errors.ts                # GatewayError 分类
    │   └── cost.ts                  # 成本记账挂点（FR-12.31）
    ├── agent/
    │   ├── runtime.ts / resolve.ts / prompt.ts   # 运行时组装 · context→专家重解析（同构纯函数）· 五层 prompt 管线
    │   ├── experts/                 # 七个专家定义（P0 全量落地，见 §8.1.1）
    │   ├── gate/                    # 闸门模块：ticket.ts（GATE_TICKET_TTL_MS、票据签发/校验）· harm.ts（利害 zod 唯一权威）· pending.ts（PendingAction 读写/条件 UPDATE）
    │   └── tools/                   # 工具注册表（types.ts / registry.ts / 各工具.ts；四柱①，internal/outbound 二分）
    ├── oplog/                       # append.ts / queries.ts / schemas.ts（append-only 留痕读写）
    ├── actions/outbound/            # 副作用实现（send-outreach.ts / payout.ts …）
    │   │                            # 只允许被 gate 执行管线（execute 路由）导入（建议配 eslint no-restricted-imports 强制）
    ├── ingest/types.ts              # §8.3.1：Apify 契约预留（P0 只有类型+zod）
    └── partner/escrow.ts            # §8.3.2：支付边界接口（P0 Mock 实现）
```

### 8.1.1 POST /api/agent（Agent 运行时）

**请求**（zod 校验，NFR-S6：API 入参一律不可信）：

```json
{
  "messages": [
    { "role": "user", "parts": [{ "type": "text", "text": "找 5 个东南亚原神向的 YouTube KOL" }] }
  ],
  "context": {
    "pathname": "/admin/campaigns/prj_01",
    "env": "match",
    "projectId": "prj_01",
    "gameId": "game_01"
  }
}
```

- `messages`：`useChat` 的完整对话历史（无状态，逐轮回传）。
- `context`：统一 `{ pathname, env?, projectId?, gameId? }`；服务端 `resolveAgent`（`src/lib/agent/resolve.ts`，同构纯函数）按 `pathname` **重解析**当前专家（system prompt + 工具子集，FR-8.7.8/FR-12.17），**不信任客户端声明**。**P0 全量落地五层 prompt 管线 + `experts/` 七个专家定义；P0 仅 match/orchestrator 挂真工具**，其余专家的工具随后续批次挂载，`context` 契约从 P0 起不变。

**响应**：Vercel AI SDK UI Message Stream（SSE）。首 token 即出（FR-12.10，NFR-P1 TTFT < 2s）。三类流内容：

1. 文本增量（模型回复）；
2. 工具结果 part —— 带 `type` 字段的结构化产物（`kol_cards` / `match_plan` / …），前端经 `canvas-registry.tsx` 路由到组件（四柱④）；
3. **闸门数据 part**（`data-gate`）——outbound 被拦截时，携确认卡 payload（`actionId` + `harm`）**直达 UI**，绕过模型上下文；**不含任何令牌**——票据仅在 `POST /api/actions/[id]/confirm` 响应中出现一次（不变量 I3，见 8.1.2）。

**错误面**：流开始前失败（zod 400、gateway 不可达 502）→ 标准 JSON envelope（§8.1.4）；流中途失败 → SSE error part，前端展示用户可读错误，服务端记完整上下文（requestId + 原始 cause），**绝不静默断流**。

Route 骨架（扩展性硬约束 FR-12.6：加工具只动注册表，不动此文件）：

```ts
// src/app/api/agent/route.ts
import { streamText, convertToModelMessages } from 'ai';
import { chatModel } from 'lib/ai/gateway';
import { resolveAgent } from 'lib/agent/resolve';   // 服务端重解析 context，不信任客户端声明
import { getToolsFor } from 'lib/agent/tools';      // 注册表：按专家给出工具子集，outbound 已被 gate/ 包裹
import { agentRequestSchema } from 'lib/agent/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const parsed = agentRequestSchema.safeParse(await req.json());
  if (!parsed.success) return err('VALIDATION_FAILED', 400, parsed.error.flatten());

  const { messages, context } = parsed.data;
  const agent = resolveAgent(context);               // pathname → 专家（src/lib/agent/resolve.ts 同构纯函数）
  const result = streamText({
    model: chatModel(),
    system: buildSystemPrompt(agent),                // 五层 prompt 管线 + 否定式护栏注入（FR-10.7/FR-12.8）
    messages: convertToModelMessages(messages),
    tools: getToolsFor(agent),
    stopWhen: stepCountIs(8),
    onFinish: ({ usage }) => recordCost({ usage, route: 'agent' }),  // §8.2.5 成本挂点
  });
  return result.toUIMessageStreamResponse({ onError: toUserFacingError });
}
```

### 8.1.2 闸门端点 /api/actions/[id]/{confirm,execute,reject}（AI→人闸门，架构级铁律①）

闸门不是前端 if，是**服务端运行时硬约束**（FR-10.1/10.2、NFR-S1）。**契约权威定义见闸门章（A4）的两步票据设计**：`PendingAction(uuid)` → `POST /api/actions/[id]/confirm`（人确认→签发一次性票）→ `POST /api/actions/[id]/execute {ticket}`（消费票执行）→ `POST /api/actions/[id]/reject`；本节只落 HTTP 面与验收对齐，不另立私有端点设计。完整链路：

```mermaid
sequenceDiagram
    participant M as 模型 loop（/api/agent 内）
    participant G as gate/（服务端拦截层）
    participant PA as PendingAction（Prisma 权威见 §7）
    participant UI as 前端（GateConfirm 卡）
    participant C as POST /api/actions/[id]/confirm
    participant E as POST /api/actions/[id]/execute
    participant X as 副作用实现（lib/actions/outbound/*）

    M->>G: 调用 outbound 工具（如 send_outreach）
    G->>PA: INSERT PendingAction(uuid, status=pending, payload/payloadHash/requestedBy)
    G-->>UI: stream data-gate part：{actionId, harm}（确认卡 payload，不含任何令牌）
    G-->>M: 工具结果 {status:'pending', actionId}（模型永远拿不到票）
    UI->>UI: 渲染确认卡：「对外·不可撤销」+ 收件人全名单/金额
    UI->>C: 人拍板确认
    C->>PA: 条件 UPDATE pending→confirmed + 签票（存 ticketHash/ticketExpiresAt）+ gate 类日志
    C-->>UI: 200 {ticket}（票仅在此响应出现一次，不变量 I3）
    UI->>E: POST {ticket}
    E->>PA: 校验票 hash/TTL/未用 → 条件 UPDATE confirmed→executing
    E->>X: 执行副作用（idempotencyKey = actionId）
    E->>PA: 成功：同一事务 finalize(executed)+INSERT irrev 留痕行；失败：failed、无 irrev 行
    E-->>UI: 200 envelope（执行结果）
```

**票据机制（关键设计）：**

- **拦截时不下发任何令牌**（禁止令牌随 SSE/`data-gate` 流下发）：`data-gate` part 只携确认卡 payload（`actionId` + `harm`）。一次性票据（256-bit 随机）在 `confirm` 时才签发，且**仅在 confirm 响应中出现一次**（不变量 I3），DB 只存 sha256（`PendingAction.ticketHash`）与 `ticketExpiresAt`/`ticketUsedAt`。回灌进模型上下文的工具结果只有 `{status:'pending', actionId}`——模型 loop 无法自我放行；伪造 `/api/agent` 请求体夹带工具调用同样过不了 gate（拦截点在工具执行层，不在 prompt 层）。
- TTL：常量 `GATE_TICKET_TTL_MS = 5 * 60_000`，唯一定义于 `src/lib/agent/gate/ticket.ts`（不做 env 开关）。票据过期执行 → `410 GATE_EXPIRED`，需回对话面重新起草。
- 状态机与并发防护：`PendingAction` 七态 `pending/confirmed/rejected/expired/executing/executed/failed`，表结构 **Prisma 唯一权威见 §7（数据章）**（列含 `payload/payloadHash/ticketHash/ticketExpiresAt/ticketUsedAt/requestedBy`）；并发双击/重放由 **PendingAction 条件 UPDATE**（`WHERE status = 期望态`）兜底。
- **执行与留痕的事务语义**（FR-8.6.7）：确认=签票（留 gate 类日志）；执行=消费票→副作用成功→**同一事务** `finalize(executed)` + INSERT irrev 留痕行 + 业务状态变更（如 `ProjectKol.status → 已发送`）；副作用失败→`failed`、**无 irrev 行**。外部副作用（真实发信/放款）无法进 DB 事务，用 `actionId` 作幂等键传给适配器——crash 后重放不会重复发信，日志至少一次、副作用恰好一次。
- **pending 恢复**：`GET /api/actions/[id]` 返回 pending 详情，today 雷达卡/项目页据此**重新渲染确认卡**（刷新/跨会话均可恢复）；确认时才签票，两步设计天然支持恢复流。
- P0 单租户无认证（D4）：`requestedBy`/确认主体 = 硬编码 dev 用户 id；M5 真实认证后自然获得可追责主体，契约不变。

**请求/响应示例：**

```json
POST /api/actions/0b8e42d1-….-uuid/confirm
→ 200
{ "success": true, "error": null,
  "data": { "actionId": "0b8e42d1-….-uuid", "status": "confirmed",
            "ticket": "gtk_f3a9…", "ticketExpiresAt": "2026-07-17T09:35:00Z" } }
// 票仅在本响应出现这一次（不变量 I3）

POST /api/actions/0b8e42d1-….-uuid/execute
{ "ticket": "gtk_f3a9…" }
→ 200
{ "success": true, "error": null,
  "data": { "actionId": "0b8e42d1-….-uuid", "status": "executed",
            "result": { "provider": "resend", "messageId": "msg_…" } } }
```

`POST /api/actions/[id]/reject` → 200，`status = rejected`，零副作用。失败面（全部走 §8.1.4 envelope）：

| 场景 | 状态码 | code |
|---|---|---|
| actionId 不存在 | 404 | `GATE_NOT_FOUND` |
| execute 无票/伪票（hash 不匹配/缺失/已用） | 403 | `GATE_TOKEN_INVALID` |
| 票据超过 TTL / pending 过期 | 410 | `GATE_EXPIRED` |
| 已确认/已拒绝/已执行后重放 | 409 | `GATE_ALREADY_DECIDED`（data 引用既有决断） |

**验收对齐（15.4 G1，D20 变异测试）**：`POST /api/actions/[id]/execute` 无票/伪票 → 断言 `403 GATE_TOKEN_INVALID`；pending 未确认 → 断言 `StubDelivery` 行数不变（地面真值，无副作用）；把 gate 拦截逻辑退回原状，断言必须变红。副作用函数（`lib/actions/outbound/*`）**只允许被 gate 执行管线（execute 路由）导入**，用 eslint `no-restricted-imports` 机制化，不靠自觉。

### 8.1.3 REST 资源约定

REST 是兜底面（D5），不是主轴——大部分读写走 Agent 工具。约定（对齐后期演进路由）：

- **命名**：复数名词、kebab-case 路径段（`/api/operation-logs`）；JSON 字段 camelCase（与 Prisma 模型一致，DB 层 `@map` snake_case）。
- **分页**：`?page=1&limit=20`（limit 上限 100），响应 `meta: { total, page, limit }`。
- **筛选**：白名单 query 参数，zod 校验后转 Prisma where；如演进期（P1+）的 `GET /api/operation-logs?toolClass=outbound&reversible=false&projectId=prj_01`（FR-11.13；P0 同筛选逻辑由 `/admin/runs` RSC 直调 `lib/oplog/queries.ts`，不经 HTTP）。
- **写操作**：POST 建、PATCH 部分更新（**OperationLog 例外：只 GET，写入只经 gate/工具层，HTTP 面不暴露写端点**）。
- **深字段**：`Kol` 五契约位 null 原样返回 null——「待接入」是**显示态**，由前端 `ProvenanceTag` 兜底，API 不编造默认值（FR-11.17，绝不用 0 冒充实测）。
- **所有入参先 zod 再落库**（NFR-S6）；jsonb 契约字段的 zod schema 落 `src/lib/*/schemas.ts`，是形状唯一权威（FR-11.20）。

### 8.1.4 错误响应统一格式

Envelope（`src/lib/api/envelope.ts`，全部非流式端点强制）：

```ts
// src/lib/api/errors.ts
export type ApiErrorCode =
  | 'VALIDATION_FAILED'      // 400 — zod 边界校验失败，details 带 flatten 后的字段错误
  | 'NOT_FOUND'              // 404
  | 'GATE_PENDING'           // 403 — outbound 未经人确认（闸门语义，见下）
  | 'GATE_TOKEN_INVALID'     // 403
  | 'GATE_ALREADY_DECIDED'   // 409
  | 'GATE_EXPIRED'           // 410
  | 'UPSTREAM_AI_ERROR'      // 502 — aigcgateway 4xx/5xx/坏响应（§8.2.4）
  | 'UPSTREAM_AI_TIMEOUT'    // 504 — aigcgateway 超时熔断
  | 'INTERNAL';              // 500 — message 用户友好，完整 cause 只进服务端日志

export interface ApiOk<T>  { success: true;  data: T;    error: null; meta?: { total: number; page: number; limit: number } }
export interface ApiErr    { success: false; data: null;
                             error: { code: ApiErrorCode; message: string; details?: unknown };
                             gate?: GatePendingInfo }   // 仅 GATE_PENDING 携带
```

**闸门 403/pending 响应体**（`GATE_PENDING` 专属 `gate` 块——任何绕过 UI 的直调都会拿到它，且**不含票据**——票仅在 `confirm` 响应出现一次，不变量 I3）：

```json
{
  "success": false, "data": null,
  "error": { "code": "GATE_PENDING", "message": "该动作对外且不可撤销，须由操盘手在确认卡上拍板后才会执行" },
  "gate": {
    "actionId": "0b8e42d1-….-uuid",
    "tool": "send_outreach",
    "toolClass": "outbound",
    "harm": {
      "title": "向 3 位创作者发送触达邮件",
      "irreversibleLabel": "对外·不可撤销",
      "facts": ["邮件发出后不可撤回", "3 位收件人均为首次触达"],
      "recipients": [
        { "displayName": "PixelNoob", "platform": "youtube", "handle": "…" },
        { "displayName": "…", "platform": "twitch", "handle": "…" },
        { "displayName": "…", "platform": "tiktok", "handle": "…" }
      ]
    },
    "expiresAt": "2026-07-17T09:30:00Z"
  }
}
```

`harm` 的唯一 zod 权威在 `src/lib/agent/gate/harm.ts`（`{ title: string, irreversibleLabel: z.literal('对外·不可撤销'), facts: string[], recipients: [{ displayName, platform, handle? }], amount?, scope?, basis? }`，本例即其 `z.infer` 序列化），内容**如实列全**（FR-10.5/D28：批量发信收件人逐一不折叠；`commit_quote` 带金额/交付内容/授权范围；`payout` 带收款方/金额/依据；`create_share_link` 带内容/可见范围/有效期）。口径分辨：outbound **语义类别 5 类**（发信/报价/放款/分发 Key/对外分享，批量发=发信类的批量形态），**工具白名单 6 个工具名**（`OUTBOUND_TOOL_NAMES`：`send_outreach`/`send_bulk_outreach`/`commit_quote`/`payout`/`distribute_keys`/`create_share_link`）。无阈值分级——所有 outbound 一律一次确认。internal 工具**永远不产生** `GATE_PENDING`（FR-10.6，假闸门稀释真闸门）。

状态码语义补充：P0 无认证故无 401；403 在本系统**专属闸门语义**；500 遵守 NFR「error messages 不泄漏敏感数据」——`details` 只在 4xx 校验错误时回传。

## 8.2 aigcgateway 集成（F002）

### 8.2.1 Provider 封装

aigcgateway 是唯一 AI 出口（D2），OpenAI 兼容 baseURL。用官方 `@ai-sdk/openai-compatible` 包装成 Vercel AI SDK provider，全项目**只从 `src/lib/ai/gateway.ts` 拿模型实例**，任何文件不得自行 `fetch` 网关或硬编码 URL/key：

```ts
// src/lib/ai/gateway.ts
import 'server-only';                                  // 防 key 进客户端 bundle
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { serverEnv } from 'lib/env';

const env = serverEnv();
const aigc = createOpenAICompatible({
  name: 'aigcgateway',
  baseURL: env.AIGCGATEWAY_BASE_URL,                   // 如 https://gateway.example.com/v1
  apiKey: env.AIGCGATEWAY_API_KEY,
});

/** 链路一：chat（tool-calling），/api/agent 用 */
export const chatModel = (id: string = env.AIGC_CHAT_MODEL) => aigc.chatModel(id);

/** 链路二：embedding（bge-m3），维度与 Kol.embedding vector(1024) 锁死 */
export const EMBEDDING_DIMENSIONS = 1024;
export const embeddingModel = () => aigc.textEmbeddingModel(env.AIGC_EMBEDDING_MODEL);
```

新增依赖：`ai` + `@ai-sdk/openai-compatible` + `zod`（均未装）。**落地注意**：AI SDK v5 的类型要求 TS ≥ 5。TS 升级走**独立微批次，在 F002 启动前完成**（升级 + `npm run build + tsc --noEmit + next lint` 构建门全绿，不与 F001–F008 混批，ADR-008）；之后 zod/Prisma/AI SDK 均按 TS5 选版。`.npmrc legacy-peer-deps=true` 已就位，React 19 RC peer 冲突可控。

### 8.2.2 双链路消费面

| 链路 | 消费方 | 入口 |
|---|---|---|
| chat（tool-calling） | `/api/agent` streamText loop | `chatModel()` |
| embedding（bge-m3, 1024 维） | `search_kols` 工具（NL→向量→pgvector `<=>` top-K）；`scripts/seed/import-kol-csv.ts`（~2,524 条批量嵌入）；重嵌入守卫（`embeddingTextHash` 变更时） | `lib/ai/embed.ts` |

```ts
// src/lib/ai/embed.ts
import { embed, embedMany } from 'ai';
import { embeddingModel, EMBEDDING_DIMENSIONS } from 'lib/ai/gateway';
import { GatewayError } from 'lib/ai/errors';

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: embeddingModel(),
    value: text,
    maxRetries: 3,                                     // 指数退避，仅 429/5xx/网络错误
    abortSignal: AbortSignal.timeout(10_000),
  });
  if (embedding.length !== EMBEDDING_DIMENSIONS)       // 失败不静默的典型点：
    throw new GatewayError('EMBEDDING_DIM_MISMATCH',   // 网关换模型/配错时立刻炸，
      `expected 1024, got ${embedding.length}`);       // 绝不让错维向量污染 pgvector
  return embedding;
}
// seed 批量：embedMany 每批 ≤64 条；失败条目记录 kolId+原因，脚本以非零退出码结束（幂等可重跑）
```

### 8.2.3 重试与超时策略

| 链路 | 超时（硬熔断） | 重试 | 备注 |
|---|---|---|---|
| chat 流式 | 首 token 30s（`abortSignal`）；`maxDuration = 60` 兜底整请求 | SDK `maxRetries: 2` | 目标 TTFT < 2s（NFR-P1），30s 是故障熔断不是目标 |
| embedding 单条 | 10s | 3 次指数退避（1s/2s/4s + jitter） | 仅可重试错误（429/5xx/网络）；401/403 鉴权错**立刻失败**不重试 |
| seed 批量 | 每批 30s | 批级重试 3 次，条目级记录失败清单 | 幂等（F003 验收），重跑只补失败条目 |
| smoke 脚本 | 20s | 0 次 | 就是要暴露问题，不重试 |

### 8.2.4 失败不静默（F002 验收 + NFR）

错误分类落 `src/lib/ai/errors.ts`：

```ts
export type GatewayErrorCode = 'AUTH' | 'RATE_LIMIT' | 'TIMEOUT' | 'UPSTREAM_5XX' | 'BAD_RESPONSE' | 'EMBEDDING_DIM_MISMATCH';
export class GatewayError extends Error {
  constructor(readonly code: GatewayErrorCode, message: string, options?: { cause?: unknown }) { … }
}
```

- AI SDK 的 `APICallError` 等在 `gateway.ts`/`embed.ts` 边界统一映射成 `GatewayError`（保留 `cause` 链），route 层再映射 envelope：`TIMEOUT → 504 UPSTREAM_AI_TIMEOUT`，其余 → `502 UPSTREAM_AI_ERROR`。
- 禁令清单：不吞异常返回空结果当成功；不把 embedding 失败降级成零向量入库；流中断必发 error part；服务端日志必含 requestId + 模型名 + 原始响应片段（脱敏 key）。
- smoke：`scripts/test/ai-gateway-smoke.ts`（`npx tsx` 运行，tsx 进 devDeps；现有 `scripts/test/` 为 .mjs/.js，TS 脚本从此开始）——经网关跑 1 次 chat（prompt 设计成必触发 tool-call）+ 1 次 bge-m3 embedding，打印 TTFT/维度/usage，任一失败非零退出（F002/15.5 AI 门）。

### 8.2.5 成本记账挂点（FR-12.29~12.31 / NFR-P8）

`src/lib/ai/cost.ts` 暴露 `recordCost({ model, usage, route, toolName? })`，P0 实现 = 结构化日志行；挂点已埋在 `streamText.onFinish` 与 embed 封装内。演进：落库成本表 + 按任务复杂度路由模型（env 预留 `AIGC_CHAT_MODEL_FAST`，如摘要/改写类走轻模型，不得全打最大模型）。

## 8.3 外部集成边界

### 8.3.1 Apify 采集管道（后期，接口预留）

Apify 是后期数据管道（NFR-D1，暂缓），P0 **不装 `apify-client`、不建 webhook 路由**，只落契约，保证到位不返工（D15/NFR-D2）：

- `src/lib/ingest/types.ts`：`IngestFrame` zod schema —— 一帧采集数据 = 浅字段增量 + `dataSource: 'crawl'` + 逐字段 `fieldProvenance`（`{source:'crawl', confidence, fetchedAt, detail}`）。**seed 脚本（F003）就是第一个 ingest 客户端**：CSV 规范化走同一 `normalizeToIngestFrame()`，未来 Apify/外购/一方 API 帧共用同一契约入同一 `Kol` 表。
- Upsert 稳定键 = `platform + platformUserId`（FR-11.2）；缺 `platformUserId` 的帧回退 `platform + handle` 并标低置信。
- 演进路由 `POST /api/ingest/apify`：Apify webhook 回调，`x-webhook-secret` 头对 `APIFY_WEBHOOK_SECRET` 定值比较；payload 视为不可信输入先 zod 再落库（NFR-S6），文本字段净化（NFR-S7）。
- 合规红线（NFR-S10/S11）：采集遵守平台条款（TikTok 2026-02-17 起禁第三方关键词追踪；YouTube 一方 API 无自助通道）；KOL 联系方式存储可删除（`deletedAt` 软删）、可溯源、最小化。

### 8.3.2 partner 支付边界（产品不碰资金，NFR-S8）

合同电子签 + Stripe escrow 全部在 partner 侧。本产品职责**只有三件**：触发条件（Delivery 条件台账全绿才渲染放款按钮，FR-8.2.4.2）、AI→人闸门（`payout` 是 outbound，403/pending + 逐笔确认）、状态追溯（OperationLog irrev 留痕）。

```ts
// src/lib/partner/escrow.ts — 边界接口，P0 唯一实现是 Mock
export interface EscrowProvider {
  createEscrow(input: { dealRef: string; amount: number; currency: string }): Promise<{ partnerRef: string }>;
  releasePayout(input: { partnerRef: string; idempotencyKey: string }): Promise<{ status: 'released'; receiptRef: string }>;
  getStatus(partnerRef: string): Promise<'pending' | 'funded' | 'released' | 'failed'>;
}
export const escrow: EscrowProvider = new MockEscrowProvider();  // P4 换真实现，调用方零改动
```

硬边界：我方 DB **不存**卡号/银行账户/税务信息，`Deal`/`Payout`（字段级 schema 留 P3/P4 spec）只存 `partnerRef` + 状态 + 展示用金额币种（默认 USD 显式标注，NFR-I4）；`payout` 副作用 = `escrow.releasePayout(idempotencyKey = actionId)`，且只能经 gate 两步契约（confirm 签票 → execute 消费票）到达。演进 `POST /api/webhooks/partner` 做状态回写（签名校验，同 8.3.1 的不可信输入原则）。

## 8.4 环境变量清单与启动校验

现 `.env.example` 是前端-only（仅 `NEXT_PUBLIC_BASE_PATH` / `NEXT_TELEMETRY_DISABLED`），F001/F002 起按下表扩充。**`.env.example` 只放占位符不放明文真值**（15.5 密钥门），`.env` 已 gitignore。

| 变量 | 引入 | 必填 | 校验规则 | 说明 |
|---|---|---|---|---|
| `DATABASE_URL` | F001 | **P0 必填** | `z.string().url()`，scheme 必须 `postgresql://` | dev 指 `docker-compose.dev.yml` 的 pg+pgvector |
| `AIGCGATEWAY_BASE_URL` | F002 | **P0 必填** | `z.string().url()` | OpenAI 兼容端点 |
| `AIGCGATEWAY_API_KEY` | F002 | **P0 必填** | `z.string().min(16)` | 无硬编码（NFR-S5） |
| `AIGC_CHAT_MODEL` | F002 | 可选 | 有默认值（网关 canonical 名） | 主 chat 模型 |
| `AIGC_EMBEDDING_MODEL` | F002 | 可选 | 默认 `'bge-m3'` | 换模型必配合 `EMBEDDING_DIMENSIONS` 断言与全量重嵌入 |
| `AIGC_CHAT_MODEL_FAST` | 演进 | 可选 | — | NFR-P8 模型路由预留 |
| `NEXT_PUBLIC_BASE_PATH` | 已有 | 可选 | — | next.config.js basePath/assetPrefix |
| `APIFY_TOKEN` / `APIFY_WEBHOOK_SECRET` | 演进 M5 | — | 建路由时转必填 | §8.3.1 |
| `PARTNER_ESCROW_API_KEY` 等 | 演进 P4 | — | 真实现时定义 | §8.3.2 |

**启动校验**（NFR-S5「env + 启动校验」的机制化落点）：

```ts
// src/lib/env.ts — 全项目读 env 的唯一入口，禁止散落 process.env.X
import { z } from 'zod';

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  AIGCGATEWAY_BASE_URL: z.string().url(),
  AIGCGATEWAY_API_KEY: z.string().min(16),
  AIGC_CHAT_MODEL: z.string().default('claude-sonnet-4'),
  AIGC_EMBEDDING_MODEL: z.string().default('bge-m3'),
});
let cached: z.infer<typeof serverEnvSchema> | null = null;
export function serverEnv() {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(`环境变量缺失/非法：${Object.keys(parsed.error.flatten().fieldErrors).join(', ')}（对照 .env.example）`);
  return (cached = parsed.data);
}
```

- **fail-fast 时机**：`src/instrumentation.ts`（本仓库有 `src/`，故不在仓库根；Next 15 stable）的 `register()` 调一次 `serverEnv()`——standalone `node server.js` 启动即校验，配错秒退并列出缺失变量名（不打印值）；seed/smoke 脚本 import 同一模块，脚本与服务共享同一权威。
- **部署衔接**：`docker-compose.prod.yml` 现无 env 注入也无 DB 服务（前端-only 部署）；全栈化改造（M5）时给 `app` 服务加 `env_file` 并接 VPS Postgres——属生产硬化批次，P0 不动 CD 链路。deploy/prod 永留人类闸门（workflow_dispatch）不变。

---

**P0 落地 vs 后期演进小结**：P0 交付 = `/api/agent` + 闸门四端点（GET `/api/actions/[id]` 详情 + `confirm`/`execute`/`reject`）、`/admin/runs` RSC 直读 `lib/oplog/queries.ts` 的留痕可查面、`gateway.ts` 双链路封装 + smoke、envelope/错误码体系、`env.ts` 启动校验（`src/instrumentation.ts` fail-fast）、Apify/partner 两个纯接口预留（types + Mock）。演进 = REST 资源面（随 WORKBENCH-UI/P1–P4 逐批开）、`GET /api/operation-logs`（P1+）、`/api/health` + compose 健康检查切换、两个 webhook 路由、成本落库与模型路由、真实 EscrowProvider（M5/P4）。

---

# §9 部署与运维架构

## 9.1 环境总览

三套环境，一条镜像流。生产链路（CICD-VPS 批次）已建成且验收通过，当前为**前端-only 形态**；P0（AGENT-FOUNDATION F001）先改造 dev 环境，生产全栈化是后期改造项。

```mermaid
flowchart LR
  subgraph DEV["本地 dev（P0 落地）"]
    NEXT["next dev :3000"] --> PGD[("docker-compose.dev.yml<br/>postgres + pgvector :5432")]
    NEXT --> GW1["aigcgateway<br/>（远端，OpenAI 兼容）"]
  end
  subgraph CI["GitHub Actions"]
    CIJOBS["ci.yml<br/>lint / typecheck / build / visual"]
    BP["build-push.yml<br/>Docker 镜像 → GHCR<br/>tag = git SHA + latest"]
  end
  subgraph PROD["deploysvr 194.238.26.173"]
    NGINX["nginx<br/>newkol.guangai.ai 443"] --> APP["newkolmatrix-app<br/>127.0.0.1:3300 → :3000"]
    APP -.->|"后期全栈化"| PGP[("db 服务<br/>pgvector/pgvector:pg16")]
    APP -.-> GW2["aigcgateway"]
  end
  DEV -->|"git push main"| CI
  BP -->|"手动 workflow_dispatch<br/>（deploy 人类闸门）"| PROD
```

## 9.2 本地开发环境：docker compose dev（P0 · F001）

现状：仓库**没有** `docker-compose.dev.yml`、没有 Prisma、没有 `src/lib/`。F001 建立以下三件套：

**（1）`docker-compose.dev.yml`（新建，repo 根）：**

```yaml
# AGENT-FOUNDATION F001 — 本地开发 DB（仅 dev；prod 全栈化另行改造）
services:
  db:
    image: pgvector/pgvector:pg16       # 自带 vector 扩展的官方镜像
    container_name: newkolmatrix-dev-db
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      POSTGRES_USER: kolmatrix
      POSTGRES_PASSWORD: kolmatrix       # 仅本地 dev，非密钥
      POSTGRES_DB: kolmatrix
    volumes:
      - newkolmatrix_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kolmatrix -d kolmatrix"]
      interval: 5s
      timeout: 3s
      retries: 10
volumes:
  newkolmatrix_pgdata:
```

> 本节的 `docker-compose.dev.yml`（含 healthcheck）与 `.env.example` 为全文档**唯一权威定义**——数据章（§7.6.3）改为引用此处，`DATABASE_URL` 示例以本节为准。

vector 扩展的建立**不手写 SQL、不放 init 脚本**：权威定义见 §7（数据章）——Prisma `previewFeatures` 开启 `postgresqlExtensions = [vector]`，由 `prisma migrate` 自动生成进 migration；F001 验收项 = 检查生成的 `migration.sql` 含 `CREATE EXTENSION vector`，保证「migrate 即建扩展」在 dev / CI / prod 三处行为一致。

**（2）`.env.example`（新建，无明文密钥）：**

```bash
# DB（dev 指向 docker-compose.dev.yml）
DATABASE_URL="postgresql://kolmatrix:kolmatrix@127.0.0.1:5432/kolmatrix"
# AI 出口（aigcgateway，OpenAI 兼容）——密钥留空，本地填 .env（gitignore）
AIGCGATEWAY_BASE_URL=""
AIGCGATEWAY_API_KEY=""
# 模型名（可选，有默认值——见 src/lib/env.ts serverEnv()）
# AIGC_CHAT_MODEL=""
# AIGC_EMBEDDING_MODEL=""
# 既有：子路径部署用（保持不动）
# NEXT_PUBLIC_BASE_PATH=""
```

**（3）`src/lib/env.ts` + `src/instrumentation.ts`（新建，启动校验，NFR-S5）：**

权威定义为唯一的 `src/lib/env.ts`（本节不重复其 zod schema，改为引用）。要点：变量集 `DATABASE_URL` / `AIGCGATEWAY_BASE_URL` / `AIGCGATEWAY_API_KEY` / `AIGC_CHAT_MODEL`（有默认值） / `AIGC_EMBEDDING_MODEL`（有默认值）；导出形态为**惰性缓存函数 `serverEnv()`**（非模块顶层 parse）；启动校验入口为 `src/instrumentation.ts`（本仓库有 `src/`，instrumentation 不在根）——缺失 → 启动即抛清晰错误，不静默降级。

`src/lib/db/prisma.ts`、`src/lib/ai/gateway.ts` 一律 `import { serverEnv } from 'lib/env'`（业务代码一律**裸 src 导入**（`baseUrl: "src"`）、**不新增 `@/` 别名**；保留既有 `@/public/*` 静态资源映射——tsconfig paths 已存在），全库禁止直接读 `process.env.AIGCGATEWAY_*`。

**dev 日常命令（写入 README）：**

```bash
docker compose -f docker-compose.dev.yml up -d   # 起 DB
npx prisma migrate dev                            # 迁移（含 CREATE EXTENSION vector）
npx tsx scripts/seed/import-kol-csv.ts            # F003 幂等 seed（~2,524 条 + embedding）
npm run dev
```

## 9.3 生产全栈化改造：前端-only → 加 DB / 迁移 / env

**现状（CICD-VPS done，作为改造基线）：**

| 件 | 现状 |
|---|---|
| `Dockerfile` | node 20-alpine 三阶段（deps→build→runner），standalone 输出，非 root（nextjs:1001），`node server.js` |
| `docker-compose.prod.yml` | 单 `app` 服务，GHCR 只 pull 不 build，`127.0.0.1:3300→3000`，healthcheck 打 `/admin/dashboards/default`，**无 DB** |
| `deploy/nginx/newkol.guangai.ai.conf` | 443 反代 3300，与旧 kolmatrix（:3001）完全隔离 |
| 部署目录 | deploysvr `/opt/apps/newkolmatrix` |

**改造清单（标注时机；全部落地前，生产保持前端-only 可部署——Agent 功能只在 dev 演示，D6）：**

| # | 改造项 | 内容 | 时机 |
|---|---|---|---|
| R1 | compose 加 `db` 服务 | `pgvector/pgvector:pg16` + named volume `pgdata` + 内部网络；**不暴露宿主端口**（或仅 `127.0.0.1`）；app `depends_on: db: condition: service_healthy` | 后期（首次需线上真 Agent 时，最迟 P5） |
| R2 | env 注入 | `docker-compose.prod.yml` 的 app 服务加 `env_file: .env`；`/opt/apps/newkolmatrix/.env` 手工放置（`DATABASE_URL=postgresql://…@db:5432/kolmatrix`、`AIGCGATEWAY_*`），不入 git、不进镜像 | 随 R1 |
| R3 | Dockerfile 加 Prisma | build 阶段 `npx prisma generate`；runner 阶段确认 standalone 产物含 `.prisma` 引擎（不含则补 `COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma`，或 next.config.js 配 `outputFileTracingIncludes`）；新增 **`migrate` stage**（仅 `prisma/` + prisma CLI），供 R4 使用 | 随 R1 |
| R4 | 迁移步骤进 deploy workflow | `deploy-prod.yml` 在 `up -d` 之前插入：`$COMPOSE run --rm migrate npx prisma migrate deploy`（幂等；失败即中止部署，不 up 新版本）。迁移遵循 expand-contract：先加列/表（兼容旧镜像）再收缩，保证回滚旧 image_tag 时 schema 仍兼容 | 随 R1 |
| R5 | healthcheck 升级 | 新建 `src/app/api/health/route.ts`：`SELECT 1` 验 DB 连通，返回 `{ok, db}`；compose healthcheck 与 deploy-prod.yml 的 curl 从 `/admin/today`（F006 起已随 IA 改指，见 §11 F006）改打 `/api/health`（**不**在 health 里探 aigcgateway——外部依赖抖动不应打死容器） | 随 R1 |
| R6 | 生产 seed | 手动一次性 `$COMPOSE run --rm migrate npx tsx scripts/seed/import-kol-csv.ts`（脚本幂等，F003 已保证；embedding 生成走 gateway，属花钱操作 → 人工触发） | 随 R1 |
| R7 | 备份 | VPS cron `pg_dump` 到 `/opt/apps/newkolmatrix/backups/` + 滚动保留；恢复演练一次 | P5（PROD-HARDENING） |

## 9.4 CI/CD 现状与演进

**现状（4 个 workflow，全部 CICD-VPS 已验收）：**

| workflow | 触发 | 内容 |
|---|---|---|
| `ci.yml` | push/PR main（paths-ignore：`.auto-memory/**`、progress/features/backlog.json、`docs/**`、`**/*.md` 等） | 4 job：lint / typecheck（`tsc --noEmit`）/ build / visual（Playwright chromium，起 standalone 产物，linux baseline） |
| `build-push.yml` | push main（同 paths-ignore） | Docker 镜像 → GHCR，tag = `github.sha` + `latest`，gha 层缓存 |
| `deploy-prod.yml` | **仅 workflow_dispatch** | SSH deploysvr → compose pull → up -d → 3300 健康检查 10×3s；入参 `image_tag` 支持回滚 |
| `update-visual-baselines.yml` | 手动 | 在 CI（linux）重生视觉 baseline 并 commit（mac/linux 字体不 pixel-match） |

**演进（随批次逐步加 job，不推翻现有结构）：**

| 增量 | 内容 | 时机 |
|---|---|---|
| `unit` job | `npm run test:unit`（vitest，见 §10.3），纯 node，无 DB | P0（F004 引入 vitest 后） |
| `gate` job | GitHub Actions `services: postgres`（image `pgvector/pgvector:pg16`）→ `prisma migrate deploy` → `vitest run tests/integration`（含 §10.5 闸门 G1–G5）。**闸门测试进 CI 是硬门**：F008 之后每次 push 都必须证明 outbound 拦截仍在 | P0（F008） |
| AI smoke **不进 CI** | `scripts/test/ai-gateway-smoke.ts` 需要真密钥且花钱 → 留在本地/evaluator 验收手跑（F002 验收项） | — |
| paths-ignore 校准 | `prisma/**`、`scripts/seed/**` 必须触发 CI（当前 ignore 列表不含它们，无需改；注意**不要**把新增目录误加进 ignore） | P0 |
| 变异测试 nightly（可选） | `gate-mutation` 以 `schedule` 低频跑（见 §10.5），不阻塞每次 push | P1+ |

## 9.5 deploy 人类闸门

`deploy-prod.yml` 仅 `workflow_dispatch`，无任何自动部署路径——这是 harness 铁律（deploy/prod/spend 永留人类闸门），**与产品内 AI→人闸门（F008）同构**：CI 可以把一切「备好」（镜像已推 GHCR、健康检查脚本就绪），「按下去」永远是人。

- **发布**：用户在 GitHub Actions 手动填 `image_tag`（git SHA）触发；`latest` 仅兜底，正式发布用不可变 SHA
- **回滚**：同一入口填上一个 good SHA；R4 落地后因迁移走 expand-contract，旧镜像对新 schema 向后兼容，回滚不需要逆向迁移
- **迁移含破坏性变更时**：deploy 说明（`docs/dev/deploy.md`）中标注「本次不可直接回滚」，由触发部署的人确认——不引入自动判断

## 9.6 密钥与配置矩阵

| 变量 | dev | CI | prod | 备注 |
|---|---|---|---|---|
| `DATABASE_URL` | `.env`（指向本地 docker） | job `services` 注入 | `/opt/apps/newkolmatrix/.env` | `serverEnv()` 惰性缓存校验；启动入口 `src/instrumentation.ts` |
| `AIGCGATEWAY_BASE_URL` / `_API_KEY` | `.env` | 不提供（AI smoke 不进 CI） | `.env`（R2） | 无硬编码；`.env.example` 无明文（§15.5 密钥门） |
| `AIGC_CHAT_MODEL` / `AIGC_EMBEDDING_MODEL` | 可选（`.env`） | 不提供 | 可选（`.env`） | 有默认值，`serverEnv()` 兜底 |
| `PROD_HOST` / `PROD_USER` / `PROD_SSH_KEY` | — | GitHub repo secrets | — | 仅 deploy-prod.yml 使用 |
| `NEXT_PUBLIC_BASE_PATH` | 空 | 空 | 空（根路径部署） | 既有，保持 |

# §10 测试与质量架构

## 10.1 质量门总览

对齐 PRD §15。原则：**每道门验行为不验源码关键字（D20）**；evaluator 在隔离上下文执行验收，结论原样落盘。

| 门 | 载体 | 执行位置 | 硬性起点 |
|---|---|---|---|
| 构建门 | `npm run build` + `typecheck` + `lint` 全绿 0 error | 本地 + `ci.yml` | 已生效 |
| Visual baseline 门 | Playwright 截图对比（linux baseline，浅色 ≥1440px） | `ci.yml` visual job | 已生效；新增页面必补 baseline |
| 单元/集成门 | vitest（新增），覆盖率 ≥80% | 本地 + CI `unit`/`gate` job | P0（F004 起） |
| E2E/交互门 | Playwright `tests/e2e/`，逐里程碑黄金路径 | 本地 + evaluator 验收 | M0（hello-agent） |
| 闸门服务端测试门 | G1–G5 + 变异测试（§10.5） | CI `gate` job + evaluator | **F008 起硬性** |
| 数据门 | migrate 成功、seed ≥2,000 条非空 embedding、cosine top-K 相关、幂等 | `scripts/test/` 冒烟 + evaluator | F001/F003 |
| AI 门 | `scripts/test/ai-gateway-smoke.ts`：1 chat（含 tool-call）+ 1 embedding，失败清晰 | 本地/evaluator（不进 CI） | F002 |
| 密钥门 | 无硬编码、走 env、`.env.example` 无明文 | evaluator + `security-review` | F001 |

## 10.2 构建门现状与注意项

- 命令即 package.json 现有 scripts：`build` / `typecheck`（`tsc --noEmit`）/ `lint`——不新造命令
- TS 版本：F001 仍在模板 pin 的 4.9 下交付；**F002 启动前以独立微批次升 TS 5.x**（升级 + 构建门全绿，不与 F001–F008 混批，ADR-008），此后 zod / Prisma / AI SDK 均按 TS5 选版（AI SDK v5 要求 TS≥5）。宽松模式（`strict: false`、`strictNullChecks: false`）升级后暂不变：**新增 `src/lib/` 代码不得依赖 strict 才暴露的错误**；契约位 nullable 的空值安全由 zod schema 承担而非编译器
- 模板副本目录 `db4rDjuaSCqaEFW9XcFo_horizon-*` 已在 tsconfig exclude，新代码勿从该目录 import

## 10.3 vitest 单元/集成层（P0 新增）

**安装与配置**（新增 devDeps：`vitest` + `@vitest/coverage-v8` + `vite-tsconfig-paths`；`vitest.config.ts` 新建）：

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],               // 直接吃 tsconfig 的 baseUrl:src——覆盖全部 src 顶级裸导入前缀，不手写 alias
  test: {
    environment: 'node',                    // P0 只测服务端/lib 层
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/lib/**'], thresholds: { lines: 80 } },
  },
});
```

**目录与分层：**

| 目录 | 环境 | 测什么 |
|---|---|---|
| `tests/unit/` | node，无 DB/网络 | `src/lib/*/schemas.ts` 全部 zod 契约（含 FR-11.4「空依据分数非法」）；工具注册表完整性（每工具有 `class: internal\|outbound`、zod IO、outbound 集合 = `OUTBOUND_TOOL_NAMES` 六工具名白名单——send_outreach / send_bulk_outreach / commit_quote / payout / distribute_keys / create_share_link——**恰好相等**，多一少一都红。口径分辨：outbound **语义类别 5 类**：发信/报价/放款/分发 Key/对外分享，批量发＝发信类的批量形态；**工具白名单 6 个工具名**，批量独立成工具因其 harm 必须列全收件人名单）；闸门判定纯函数；健康度加权算法（DP-6）；provenance 回退链（`fieldProvenance[field]` → `dataSource` → `ai_estimate`，FR-11.7） |
| `tests/integration/` | node + 真 docker pg（dev compose / CI services） | `prisma migrate` 后 schema 断言；seed 幂等（跑两遍行数不变）；pgvector `<=>` top-K；OperationLog append-only（对既有行发 UPDATE/DELETE，**断言被 DB 触发器拒绝**）；PendingAction 状态机条件 UPDATE 并发防护（同一动作只成功执行一次）；闸门 G1–G5（§10.5） |
| `scripts/test/` | node 直跑冒烟 | 既有 ds-foundation 冒烟 + `ai-gateway-smoke.ts`（花钱类，人工触发） |

**组件级单测的取舍（务实约束）**：已装 `@testing-library/react ^13` 与 React 19 RC **不兼容**（需 ^16）。P0 不做 jsdom 组件单测，组件正确性由 Playwright（visual + E2E）兜底；WORKBENCH-UI 批次若需要组件单测，先升 `@testing-library/react` 再开 jsdom 环境——不在 P0 引入这条依赖变更。

## 10.4 Playwright：visual + E2E 双 testDir

现状 `playwright.config.ts` 只有 `tests/visual/`（1 条 dashboard 截图对比）。演进为双 project：

```ts
projects: [
  { name: 'visual', testDir: './tests/visual', use: { ...devices['Desktop Chrome'], viewport: { width: 1512, height: 982 } } },
  { name: 'e2e',    testDir: './tests/e2e',    use: { ...devices['Desktop Chrome'] } },
],
```

- **visual**：沿用 snapshot 路径 `tests/screenshots/baseline/{arg}-{platform}{ext}` 与双平台 baseline 机制；F006 四页 IA + F007 `agent-canvas-*.png` 逐页补 baseline，CI linux 重生走既有 `update-visual-baselines.yml`
- **E2E 里程碑门**（每条 = 该里程碑退出条件，evaluator 执行）：

| 里程碑 | E2E 黄金路径（`tests/e2e/`） | 闸门断言 |
|---|---|---|
| M0 | `hello-agent.spec.ts`：对话面输入「找东南亚原神向 KOL」→ 流式回复 + KOL 卡片流（真实 seed），console 0 error | 无闸门出现（G3） |
| M1 | 一句话 → Brief 草案 → 确认 | 全程无确认框（internal） |
| M2 | NL → Top-N 对比矩阵 → Accept/Skip | 「批准这组」不弹框（D27） |
| M3 | 起草 → 审阅 → **点确认才发送** | 未确认时 UI 停在待确认卡；无票直调 execute → 403 `GATE_TOKEN_INVALID`（G1） |
| M4 | 追问 ROI + 周报 → 分享单独确认 | `create_share_link` 独立闸门 |

- E2E 需要 DB + gateway → 本地对 dev compose 跑；模型调用在 E2E 中**可用录制回放/固定 fixture 响应**（`/api/agent` 支持注入 mock transport 仅限 test 构建），避免 E2E 花钱且不稳定——但 M 门验收时 evaluator 至少各跑一次真链路

## 10.5 闸门测试与变异测试策略（F008 硬门，D20/FR-10.3/§15.4）

**G1–G5 全部走真实 HTTP + 真实 DB，断言行为与副作用，绝不 grep 源码：**

```ts
// tests/integration/gate.g1.test.ts（示意）
test('G1: 无票/伪票的 execute 必 403 GATE_TOKEN_INVALID，且零投递', async () => {
  const pending = await triggerOutboundViaAgent();    // 模型 loop 触发拦截 → PendingAction(pending)，拦截时不下发任何令牌
  const before = await countStubDeliveries();         // StubDelivery = P0 测试地面真值
  const res = await POST(`/api/actions/${pending.id}/execute`, {  // 绕过确认直调真实面（NFR-S1）
    ticket: 'forged-ticket',                          // 伪票；缺票同断言
  });
  expect(res.status).toBe(403);
  expect(res.body.error).toBe('GATE_TOKEN_INVALID');
  expect(await countStubDeliveries()).toBe(before);   // pending 未确认 → StubDelivery 行数不变
});
// G2: 确认卡 harm 经 zod 契约（z.infer）断言：harm.irreversibleLabel === '对外·不可撤销'（逐字符）
//     且 harm.recipients 含全部收件人名单
// G3: internal（search_kols）响应不含 harm/确认卡结构，且不产生 PendingAction
// G4: 1 封与 100 封收件人 → 同样单次确认，响应无任何 threshold/tier 字段
// G5: OperationLog 按 toolClass/action/projectId/reversible 可筛；
//     全表 append-only——对既有行 UPDATE/DELETE → 断言被 DB 触发器拒绝；
//     闸门状态流转（pending→confirmed→executed/failed）在 PendingAction 条件 UPDATE，不改写日志行
```

G 系错误断言统一引用 `src/lib/agent/gate/ticket.ts` 的唯一定义：`GATE_TICKET_TTL_MS = 5min`；错误分码 envelope 403 `GATE_TOKEN_INVALID` / 409 `GATE_ALREADY_DECIDED` / 410 `GATE_EXPIRED`。

**变异测试（验证「断言真的在守门」）**——机制：把拦截逻辑打回原状，G 套件必须变红；不红 = 断言无效，验收不通过。

- 载体：`scripts/test/gate-mutation.mjs`。做法：对 `src/lib/agent/gate/`（`ticket.ts` / `harm.ts` / `pending.ts`）应用**预定义 mutant 补丁集**（git apply 到临时 worktree，不污染工作区），逐个 mutant 重跑 `vitest run tests/integration/gate.*`，期望非零退出；全部 mutant 被杀 → 输出 `mutation-report`（evaluator 落盘 `docs/test-reports/`）
- 首批 mutant（至少）：① `gate/ticket.ts` 的消费票校验恒返回通过；② 工具注册表把 `send_outreach` 的 `class` 改成 `internal`；③ 拦截时创建 `PendingAction(pending)` 的语句删除；④ 票据校验改为只验存在、不验签发与 TTL（`GATE_TICKET_TTL_MS`）
- **红线**：绝不在产品代码里留 `GATE_BYPASS` 之类的 env 开关来「方便测试」——那本身就是闸门泄漏。变异永远发生在测试脚本对源码副本的补丁上
- 执行位置：evaluator 验收（F008 及此后每个触碰闸门的批次）必跑；CI 可选 nightly（§9.4）

## 10.6 canvas 协议可扩展性断言（§15.3）

两层验证「新结果类型 = 只加组件，不改 route 核心」：

1. **单测（机械）**：`tests/unit/canvas-registry.test.ts` —— 注册表为**受控 register API**（`registerCanvasRenderer(type, component)`，非 `Object.freeze` 静态映射）：测试注入 `registerCanvasRenderer('x_test_type', Fixture)` 后 `resolve('x_test_type')` 返回该组件——F005「可扩展不改核心」验收与 G 系 fixture 注入测试都依赖这一注入能力；`resolve('unknown_type')` 返回兜底文本组件而**不抛错**（模型输出是不可信输入，NFR-S6）；禁 `dangerouslySetInnerHTML` 由 lint 规则 `react/no-danger` **error 级**覆盖 `src/components/canvas/**` 与 `src/components/copilot/**` 两目录兜住，而非测试
2. **验收（流程）**：evaluator 对「新增一个结果类型」的交付 commit 做 diff 范围断言——改动集合 ⊆ {`src/components/canvas/` 注册行, 新组件文件, 工具注册表新条目}，`src/app/api/agent/route.ts` 核心零改动；违反即 FAIL（这是行为门的流程化形态，写入 evaluator 验收清单）

## 10.7 执行位置汇总

```mermaid
flowchart LR
  A["本地：build+typecheck+lint<br/>vitest unit（秒级）"] --> B["CI push main：<br/>lint/typecheck/build/visual<br/>+ unit + gate（F008 起）"]
  B --> C["evaluator 隔离验收：<br/>E2E 黄金路径 + G1–G5<br/>+ 变异测试 + 数据/AI/密钥门"]
  C --> D["人类闸门：<br/>workflow_dispatch 部署"]
```

# §11 架构演进路线（P0→P5）

批次依赖链（对齐 §14 与 features.json，当前批次 = AGENT-FOUNDATION，status: planning）：

```mermaid
flowchart LR
  DS["DS-FOUNDATION<br/>（已 signoff）"] --> CV["CICD-VPS<br/>（已 done）"] --> P0["P0 AGENT-FOUNDATION<br/>F001 → TS5 升级微批次 → F002–F008 串行"] --> WB["WORKBENCH-UI<br/>M0.5"] --> P1["P1 BRIEF"] --> P2["P2 MATCH"] --> P3["P3 REACH-CRM<br/>M3（Delivery outbound 并入）"] --> P4["P4 DELIVERY / INSIGHT-ROI"] --> P5["P5 PROD-HARDENING<br/>M5"]
```

每阶段只写**架构上新增什么**（复用/页面填充不列）：

## P0 — AGENT-FOUNDATION（当前批次，F001 → TS5 升级微批次（ADR-008）→ F002–F008 严格串行）

| Feature | 架构增量（首次出现的东西） |
|---|---|
| F001 | **数据层从无到有**：`docker-compose.dev.yml`、`prisma/schema.prisma`（Tenant/User 单角色/Kol + 五 jsonb 契约位 nullable + `embedding vector(1024)` Unsupported 列 + `Handoff`（F001 建齐，P2 起写入）+ `StubDelivery`（P0 测试地面真值），§7 权威）、`src/lib/db/prisma.ts`、`src/lib/env.ts` + `src/instrumentation.ts`、`.env.example`。**禁止项即架构**：无 role/scope/Approval 表 |
| F002 | **AI 出口收口点**（前置：ADR-008 的 TS5 升级微批次已完成）：`src/lib/ai/gateway.ts`（自定义 AI SDK provider → aigcgateway baseURL，AI SDK 按 v5 选版），chat + embedding 双链路 + 成本/错误骨架；`scripts/test/ai-gateway-smoke.ts` |
| F003 | **可复现数据资产**：CSV 入 git、`scripts/seed/import-kol-csv.ts`（规范化 + 批量 embedding + `embeddingTextHash` 幂等守卫） |
| F004 | **四柱之①②**：`src/app/api/agent/route.ts`（streamText 流式 loop，运行时无状态）+ `src/lib/agent/tools/` 注册表（zod IO、`class: internal\|outbound` 二分、首批 `search_kols`/`get_kol_detail`）+ 五层 prompt 管线（`src/lib/agent/prompt.ts`）与 `src/lib/agent/experts/` 七专家定义 **P0 全量落地**（P0 仅 match/orchestrator 挂真工具）。vitest 引入 |
| F005 | **四柱之③④**：`CopilotPanel`（useChat）+ `src/components/canvas/`（注册表 + renderers，受控 register API `registerCanvasRenderer(type, component)`，type→组件协议）+ 否定式护栏常驻声明 |
| F006 | **IA 定型**：`src/routes.tsx` 从 5 项模板导航改为 6 页正式 IA（today/campaigns/creators/knowledge/insight/runs），项目详情 `?env=` 五环节 tab 骨架；现有 discovery/database/outreach 占位路由退役；**同批**：`playwright.config.ts` `webServer.url` 与 `docker-compose.prod.yml` healthcheck 改指 `/admin/today`，并重生受影响 visual baseline；runs 页 P0 以 RSC 直读 `src/lib/oplog/queries.ts`（HTTP `GET /api/operation-logs` 降为 P1+ 演进项，路由清单已标注） |
| F007 | **端到端闭环证明** + `docs/dev/agent-architecture.md` + `agent-canvas-*` visual baseline（M0 门） |
| F008 | **第五要素：服务端闸门（两步票据）**：`src/lib/agent/gate/{ticket.ts,harm.ts,pending.ts}` + `PendingAction` 表（7 态状态机，§7 权威）+ `/api/actions/[id]/{confirm,execute,reject}` 与 `GET /api/actions/[id]`（pending 恢复）——confirm 签发一次性票（票仅在 confirm 响应中出现一次），execute 消费票执行，模型 loop 结构上拿不到票；OperationLog append-only（DB 触发器阻断 UPDATE/DELETE）+ `GateConfirm` 卡；CI 加 `gate` job + 变异测试脚本 |

## WORKBENCH-UI（M0.5）

- 架构增量：**canvas 组件层扩容**——`DataTable`/`ConversationInbox`/`AgentSquad`/`HalfGauge`/`ProvenanceTag`/`UploadZone` 等产品件按五环节界面语法（glance/compare/converse/verify/reconcile）落地，全部消费 mock + 溯源标注（D15：数据未到位先建 UI 不返工）；**无新后端能力**，专家定义（`src/lib/agent/experts/` 七定义，P0 已全量落地）随环节切换接线——本批次只接 UI 切换，不新建专家
- 退出：六页 + 五环节 tab 真组件全绿 visual baseline

## P1 — BRIEF-CAMPAIGNS（M1）

- 架构增量：**游戏知识管道**——Game/Material/GameKnowledge 三表启用真实解析（parseStatus 状态机、`sourceMaterialIds` 溯源、`supersededById` 版本链）；素材上传存储（storageRef 落本地卷，对象存储留 P5）；strategy Agent 工具子集（解析素材/拟目标/健康度计算 DP-6 加权算法入 `src/lib/campaigns/health.ts`）
- 退出：一句话 → Brief 草案 → 确认（无闸门）E2E

## P2 — MATCH（M2）

- 架构增量：**组合分算法层**——`match_plan` 工具（embedding cosine × `audienceDemo` 组合分，null 降级纯向量并标「受众数据待接入」，FR-11.6）；对比矩阵 canvas type；`ACTIVE_PLAN` 项目业务态（D16：选了就生效，无审批）
- 退出：NL → Top-N → Accept/Skip E2E（无闸门）

## P3 — REACH-CRM（M3，outbound 最密集）

- 架构增量：**首批真 outbound 兑现**——`send_outreach`/`send_bulk_outreach`/`commit_quote` 接真实投递（Resend，D8）；ProjectKol 5 态 CRM 由真实事件自动推断（回信 webhook → 状态机）；Deal/Outreach schema 落地（P3 spec 定字段）；闸门从「拦截可测」升级为「拦截 + 真投递」双态
- 退出：起草 → 审阅 → 点确认才发送 E2E + G 套件全绿

## P4 — DELIVERY / INSIGHT-ROI（M4）

- 架构增量：**资金与对外分享闸门**——`distribute_keys`/`payout` 工具 + partner 集成（电子签 + Stripe escrow，NFR-S8：不碰资金流，只做触发条件+闸门+状态追溯）；Payout schema（P4 spec 定字段）；条件台账 verify 语法（放款按钮条件渲染，无绕过入口）；compliance Agent 拦截链（`kind:block` 留痕）；`compute_roi`/`create_share_link` + 对照账本
- 退出：追问 ROI + 周报 → 分享单独确认 E2E

## P5 — PROD-HARDENING（M5）

- 架构增量：**生产全栈化落地**（§9.3 R1–R7 全清）；真实认证 + RLS（依赖 P0 起坚持的运行时无状态与 tenantId 占位，上层零改动，NFR-S9）；Apify 采集管道（`dataSource: crawl` + fieldProvenance，与 seed 同契约，NFR-D1）；模型成本路由（gateway 记账挂点 → 按任务复杂度路由，NFR-P8）；pg_dump 备份 + 恢复演练
- 退出：硬门通过率 100%、闸门泄漏 = 0、溯源覆盖率 100%（§15.6）

# §12 架构决策记录（ADR）

## ADR-001 前后端同一 Next.js 应用（不拆独立后端）

- **背景**：全栈化从零起步（现状零 API 路由、零 `src/lib/`）；团队为单人+harness 多角色，旧仓库后端偏传统 SaaS 不可复用（D8：仅参考）。
- **决策**：后端 = 同一 Next.js 15 App 内的 Route Handlers + Server Actions + `src/lib`（D1）；不建独立 API 服务。
- **理由**：streamText 流式 loop 与 useChat 在同应用内是 Vercel AI SDK 的一等路径；单镜像单 compose 服务与既有 CICD-VPS 链路零改动衔接；类型跨前后端直接共享（工具结果协议的 `type` 联合类型一处定义）。
- **后果**：＋部署/CI 复杂度最低，P0 速度最快。－长任务（素材解析、批量 embedding）受 serverless/单进程约束，P1 起需在进程内做队列化或引入后台 worker——届时以「同镜像多进程」优先于拆服务；－DB 连接池与 Next 热重载需 `src/lib/db/prisma.ts` 单例守卫。

## ADR-002 多 Agent = 单 loop + 按环节切换 system prompt / 工具子集（非多实例编排框架）

- **背景**：七 Agent 名册（strategy/match/reach/delivery/insight/compliance/orchestrator），但产品语义是「进环节时 Copilot 切该环节专家」（FR-7.12/FR-12.17）。可选：LangGraph 类多节点图、多进程 Agent 实例、或单 loop 换人格。
- **决策**：单一 `/api/agent` streamText loop；「专家」= 请求级注入的 system prompt + 收窄的工具子集（注册表按环节过滤）+ canvas 动作卡人格化视图；Agent 协同 = 工具调用链/子 Agent 交接（FR-12.18），不引入编排框架。
- **理由**：专家隔离的**硬约束在工具作用域**（reach 拿不到 `payout` 工具即不可能放款），prompt 只承担语气与职责叙述——这个安全模型不需要多实例；运行时无状态原则（FR-12.9）下多实例只会引入会话亲和性问题；少一个框架依赖 = 少一层与 AI SDK 版本的耦合。
- **后果**：＋加专家 = 注册表加一条作用域配置，route 核心不动；＋G3/G1 测试面收敛在一个入口。－真正并行的多 Agent 协作（两专家同时工作）不支持，P4 若需要以「串行工具链 + 交接物落库」模拟；－orchestrator「只分派汇总」的纪律靠工具集为只读来强制。

## ADR-003 闸门位置：工具执行层的两步票据门（不在 Next middleware、不在前端、不在 prompt）

- **背景**：outbound 必须服务端强拦（FR-10.1/10.2，NFR-S1：直调 API 也拦）。候选位置：Edge middleware（按路径拦）、route 入口、工具 dispatch 点、前端按钮态。
- **决策**：闸门实现为 `src/lib/agent/gate/`（`ticket.ts` / `harm.ts` / `pending.ts`），钩在**工具注册表的统一执行函数**里：执行任何工具前查 `class`；`outbound` 且无有效票 → 不执行副作用，创建 `PendingAction(pending)`（§7 权威）并返回 `harm` 结构体——**拦截时不下发任何令牌**。两步票据（闸门章唯一契约）：人点击后 `POST /api/actions/[id]/confirm` 签发一次性票（票仅在 confirm 响应中出现一次），`POST /api/actions/[id]/execute` 消费票执行副作用（另有 reject 与 `GET /api/actions/[id]` pending 恢复）；模型 loop 的工具调用路径**结构上拿不到**票。
- **理由**：Next middleware 只见 URL 不见工具语义（同一 `/api/agent` 内一次对话可串多工具，internal/outbound 混流）；前端 if 可被直调 API 绕过；prompt 是建议不是约束（FR-10.2）。工具 dispatch 是唯一「每次副作用必经、且知道 `class` 与入参利害」的收口点。
- **后果**：＋「outbound 一个都不能漏」退化为注册表声明的正确性，可用单测穷举（§10.3）；＋变异测试有单一靶点。－所有副作用必须走注册表执行函数，禁止任何工具函数被业务代码直接 import 调用——lint/review 需要盯这条纪律。

## ADR-004 深字段用 jsonb 契约位（不上宽表/子表规范化）

- **背景**：audienceDemo/credibility/brandSafety 等深字段数据源未定（爬取/外购/opt-in/平台 API 混合，NFR-D4），P0 不填充，但 UI 与匹配算法现在就要建（D15）。
- **决策**：`Kol` 上 5 个 nullable jsonb 契约位，形状由 `src/lib/*/schemas.ts` 的 zod schema 唯一权威（FR-11.20），写入前校验；不建 `KolAudienceDemo` 等子表，不拍平成宽列。
- **理由**：形状仍在演化（gap 文档 §5.1 比 D15 多 engagement/dataFreshness 两项），jsonb+zod 允许 schema 演进不出 migration；「缺值 = 显示态非错误态」天然由 nullable 单列表达；查询侧 P0–P2 只按浅字段与向量过滤，jsonb 无索引压力。
- **后果**：＋数据到位填真值零返工（§5.3 解耦论证）。－失去 DB 级形状约束（TS 4.9 宽松模式下 zod 是唯一防线，schema 测试必须 100% 覆盖）；－未来若按 `audienceDemo.geoDist` 做 SQL 级过滤需补 GIN 表达式索引或届时抽列——记为已知债务。

## ADR-005 canvas 注册表：受控 register API（不用 switch、不做服务端驱动 UI）

- **背景**：工具结果要渲染成组件（四柱之④），验收有「新结果类型只加组件不改 route 核心」硬断言（§15.3）；F005 验收与 G 系 fixture 注入测试需要运行时注入点。
- **决策**：`src/components/canvas/`（注册表 + renderers）维护 `type → React 组件`映射，暴露**受控 register API** `registerCanvasRenderer(type, component)`（非 `Object.freeze` 静态映射）；工具结果协议携带 `type` 字段；未知 type 渲染兜底文本组件；全部为受控 React 组件树，禁 `dangerouslySetInnerHTML`（FR-12.16，lint `react/no-danger` error 级覆盖 `src/components/canvas/**` 与 `src/components/copilot/**` 两目录）。
- **理由**：switch/if 链会把每个新 type 的 diff 引向对话面核心文件，直接违反扩展性验收；服务端下发布局（server-driven UI）把模型输出变成布局指令，是 XSS/注入面且不可 lint。
- **后果**：＋扩展性可被 §10.6 的两层断言机械验证。－注册表是全局单例，WORKBENCH-UI 组件扩容后需按环节做代码分割（`next/dynamic`）防 Copilot 首屏包膨胀（NFR-P5/P6）。

## ADR-006 单租户硬编码 dev tenant，tenantId 只占位（不提前上 RLS/认证）

- **背景**：中小团队单角色产品（D26），P0 无真实用户体系；但多租户是商业化必然。
- **决策**：schema 全实体带 `tenantId`，运行时硬编码 dev tenant（D4）；无认证、无 RLS、无 role/scope/Approval（且**禁止回填**——作废层）；RLS + 真实认证整体留 P5。
- **理由**：现在上 RLS = 为不存在的第二租户付一路测试成本；而「留列 + 运行时无状态（FR-12.9，会话状态前端持有）」两条纪律使 P5 加 RLS 时上层零改动（NFR-S9）——这是用两条便宜的约束换掉一整层昂贵的基建。
- **后果**：＋P0–P4 所有查询免 tenant 过滤心智。－`tenantId` 在此期间是「死列」，seed 与所有写路径必须一致填 dev tenant 常量（`src/lib/db/tenant.ts` 单点导出）；－P5 前该系统**不可对外多客户部署**，这是有意的产品约束而非疏漏。

## ADR-007 AI 出口收口到 aigcgateway 单点（不直连模型商 SDK）

- **背景**：chat（tool-calling）与 embedding（bge-m3）两条链路；成本记账与模型路由是明确的后期需求（NFR-P8、FR-12.31）。
- **决策**：唯一出口 `src/lib/ai/gateway.ts`——以 aigcgateway 的 OpenAI 兼容 baseURL 构造自定义 AI SDK provider；全库禁止 import 任何模型商 SDK 或第二个 provider 实例；密钥仅 `AIGCGATEWAY_*` 两个 env。
- **理由**：换模型/多模型路由/成本核算都变成 gateway 侧配置或 `gateway.ts` 内单点逻辑，不扩散进业务代码；密钥门（§15.5）审计面 = 一个文件 + 一个 env schema；smoke 测试（F002）即可覆盖全部 AI 依赖面。
- **后果**：＋模型可替换性与记账挂点免费获得。－gateway 成为单点依赖：其不可用 = 全部 AI 功能降级，故 §9.3 R5 明确 health 端点**不**级联探测 gateway，错误在调用处清晰上抛（FR-12.7）而非打死容器；－OpenAI 兼容层未覆盖的厂商特性（如某些原生工具格式）不可用，接受。

## ADR-008 TS 升级时机：F002 启动前以独立微批次升 TS 5.x（不与 F001–F008 混批）

- **背景**：Horizon 模板 pin TS ^4.9.4 + resolutions 钉 @types/react 18、`.npmrc` legacy-peer-deps（React 19 RC 冲突）；zod、Prisma、AI SDK 新版对 TS 5 有硬性或事实期望——**AI SDK v5 要求 TS≥5**，而 F002 的 AI 出口正建在 AI SDK 上。
- **决策**：在 **F002 启动前**以**独立微批次**完成 TS 5.x 升级——批次内容仅为升级本身 + 构建门全绿（`build` / `typecheck` / `lint` 0 error），不与 F001–F008 任何功能混批；F001 仍在 4.9 下交付。升级完成后，zod / Prisma / AI SDK 一律按 TS5 选版。
- **理由**：F002 起的依赖选版（尤其 AI SDK v5）以 TS≥5 为前提，拖到 WORKBENCH-UI 前后会迫使 F002 先锁旧版依赖再二次升级；独立微批次把编译器变量与功能交付隔离——模板全量类型噪音在无功能 diff 的批次里最容易审查与回滚。
- **后果**：＋F002 起安装依赖不再逐个确认 d.ts 是否要求 TS≥5，AI SDK 直接用 v5。－升级微批次需消化模板存量类型噪音（构建门全绿是硬验收）；－`strict: false` 宽松模式升级后暂不变，契约位空值安全仍由 zod 边界校验承担（§10.2），开 `strictNullChecks` 的成本另行评估。

## ADR-009 向量检索用 pgvector in-Postgres（不引独立向量库）

- **背景**：匹配主链路 = `Kol.embedding vector(1024)` cosine top-K；规模 ~2,500 seed，P5 采集后预期数万级。
- **决策**：pgvector 扩展内嵌于业务库（`postgresqlExtensions = [vector]` previewFeatures 自动生成 `CREATE EXTENSION`，见 §7 / §9.2）；Prisma 以 `Unsupported("vector(1024)")` 建列，读写走 `$queryRaw`（`<=>` 算子）；`embeddingTextHash` 列守卫幂等重嵌入。
- **理由**：该规模下顺扫都 <200ms（NFR-P3 达标无需索引，数万级再加 HNSW）；向量与浅字段过滤（platform/countryCode/isGaming）在**同一条 SQL** 里完成，独立向量库则要跨库 join 或双写一致性——为 2,500 行引入第二个有状态服务是负资产；dev/prod 拓扑各少一个服务。
- **后果**：＋compose 单 db 服务，备份一份 pg_dump 全覆盖。－`$queryRaw` 绕过 Prisma 类型层，向量查询集中封装在 `src/lib/kol/search.ts` 单文件并配集成测试；－未来若上重排/混合检索，扩展点仍在该文件内。

## ADR-010 OperationLog append-only：审计流水只追加，闸门状态机在 PendingAction（不 UPDATE 日志行）

- **背景**：不可逆动作留痕是审计证据（FR-8.6.6/8.6.7）；「执行与留痕同一事务，不得漏记」；同时闸门需要并发防护（同一动作只执行一次）。
- **决策**：OperationLog 永远只追加，DB 层触发器阻断该表 UPDATE/DELETE，id 用 bigint autoincrement（全表唯一例外，保序）。闸门语义按闸门章唯一契约：确认（签票）追加 gate 类日志行；execute 消费票 → 副作用成功 → **同一事务**内 finalize(`executed`) + **INSERT irrev 行**；副作用失败 → `failed`、无 irrev 行。闸门状态机（pending/confirmed/rejected/expired/executing/executed/failed 7 态）由 **PendingAction** 表承载（§7 权威），并发防护 = PendingAction **条件 UPDATE**——绝不以 UPDATE 日志行表达状态。
- **理由**：审计流水与状态机分离：流水表触发器阻断使「篡改历史」在 DB 层不可表达——编排层/主上下文「不得改写既有条目」（FR-10.8/10.9）从纪律变成机制；状态流转放 PendingAction，使条件 UPDATE 的并发语义（同一票只消费一次）不与 append-only 冲突；「备好时刻」「确认时刻」「执行时刻」各有留痕与 payload 快照。
- **后果**：＋G5 测试可直接对日志行发 UPDATE 断言报错（§10.5）。－查询「当前状态」走 PendingAction（`gate/pending.ts`）而非日志重放，日志查询封装在 `src/lib/oplog/queries.ts`；－触发器 SQL 写在 Prisma migration 里（Prisma 本身不建触发器），migration review 需人工盯这段裸 SQL。

## ADR-011 运行时无状态：对话上下文由前端 useChat 持有逐轮回传

- **背景**：流式 loop 需要多轮上下文；服务端 session 存储（redis/DB 会话表）是常见默认。
- **决策**：`/api/agent` 每请求自足——完整消息历史由 `useChat` 在请求体回传，服务端不跨请求缓存任何对话状态（FR-12.9）；持久化的只有**业务事实**（OperationLog、ProjectKol 状态、GameKnowledge），不是对话。
- **理由**：为 P5 的 RLS 留边界——无服务端会话意味着没有「绕开行级安全的缓存态」；专家切换（route+env 变 → 对话线程重置，FR-7.12/8.7.9）在无状态模型下就是前端换 context key，零服务端逻辑；水平扩展无会话亲和。
- **后果**：＋部署形态自由（多副本无 sticky session）。－长对话请求体线性膨胀，P1 起在前端做窗口截断 + 服务端 token 上限保护；－「Agent 记录」页展示的不是对话回放而是 OperationLog 事实流，产品语义恰好一致（FR-8.6.1）。

## ADR-012 部署形态：GHCR 预构建镜像 + VPS compose pull + 手动 workflow_dispatch（不上 Vercel、不自动 CD）

- **背景**：目标 newkol.guangai.ai:3300（自有 VPS，与旧 kolmatrix :3001 同机隔离）；harness 铁律 deploy/prod 永留人类闸门。
- **决策**：CI 构建镜像推 GHCR（SHA 不可变 tag + latest）；deploysvr 只 `compose pull`（共享机上不 build）；部署仅 `workflow_dispatch` 手动触发，`image_tag` 入参同时是发布与回滚入口；nginx/certbot 在宿主机管 TLS。
- **理由**：Vercel 与 pgvector 常驻 DB、未来后台 worker（ADR-001 后果）、以及自有 gateway 的网络位置都不匹配，且把「部署闸门」交给了第三方平台的自动化；SHA tag 使回滚 = 重放旧镜像，无需回滚构建；共享 VPS 上不 build 避免抢占旧 kolmatrix 资源。
- **后果**：＋回滚路径与发布路径同构，演练成本低；＋人类闸门与产品的 AI→人闸门形成同一条设计哲学（§9.5）。－无金丝雀/蓝绿，`up -d` 有秒级中断窗口——当前用户规模下接受，P5 若需要零停机再引入双容器切换；－全栈化后回滚受 schema 兼容约束，由 expand-contract 迁移纪律（§9.3 R4）承担。
