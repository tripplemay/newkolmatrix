# KOLMatrix 综合架构设计

**版本**：1.0（架构审核合并稿）  
**日期**：2026-07-17  
**状态**：可作为实施基线，生产化前需完成文末 ADR 与安全前置条件

## 1. 文档定位

本设计将两份候选架构合并为一份“全站目标架构 + P0 可执行约束”。它保留 Kimi 方案的业务地图、五阶段领域模型、信号接入和主动式 Agent 能力，采用 F5 方案的目录、类型、API、数据迁移和测试细度，并裁决两份方案之间的冲突。

### 1.1 输入与权威顺序

审查输入如下：

1. `docs/product/KOLMatrix-PRD.md`
2. `docs/product/interaction-prototype-v2.html`
3. `docs/product/interaction-prototype-v2-落地规范.md`
4. `docs/dev/architecture_f5.md`
5. `docs/dev/architecture_kimi.md`
6. `docs/specs/AGENT-FOUNDATION-spec.md`
7. 当前仓库代码、`package.json`、Docker 与 CI 配置

遇到冲突时采用以下顺序：用户当前决策 > PRD 与验收标准 > 原型及落地规范 > Agent Foundation D26-D29 修正 > 本设计 > 原始候选架构。D26-D29 的“单角色、无审批、多租户后置”修正覆盖同一规范中较早的三角色旧段落。

### 1.2 目标与非目标

目标：

- 覆盖 Today、Campaigns、Creators、Knowledge、Insight、Runs 六个一级页面。
- 支持 Brief、Match、Reach、Delivery、Insight 五阶段及阶段内 Agent 协作。
- 将“模型建议”和“真人确认后的外部副作用”严格分离。
- 让数据库状态、来源字段、审计日志、主动式任务和前端显示可以互相追溯。
- 先在现有 Next.js 单应用中落地 P0，再平滑演进到真实供应商、多租户和生产调度。

非目标：

- P0 不实现银行卡、税务、真正付款或真实外部通知。
- P0 不建立复杂 RBAC、组织层级或审批流；当前产品是单角色工作台。
- P0 不把每个 Agent 拆成微服务或独立进程。
- P0 不让模型直接持有数据库写权限、供应商密钥或确认权限。

## 2. 架构结论

两份原案不能直接择一执行。Kimi 方案适合作为全站主架构，F5 方案适合作为 P0 实施附录。合并后的基线结论如下：

| 决策 | 结论 | 原因 |
| --- | --- | --- |
| D1 | Next.js 15 单体应用，按领域模块化 | 当前仓库已有 Next App Router；P0 拆服务会增加部署和数据一致性成本 |
| D2 | F002 前先完成 TypeScript 5 微批迁移 | 现仓库仍为 TypeScript 4.9，AI SDK v5 与新类型能力不应在旧编译器上长期并行 |
| D3 | PostgreSQL + pgvector；向量扩展用自定义 SQL migration | 避免依赖已弃用的 Prisma 扩展预览开关，迁移由仓库显式控制 |
| D4 | P0 单租户、开发身份；真实供应商前必须接入认证与租户隔离 | 仅在 StubDelivery 上允许无登录开发模式，不能把它带入生产副作用路径 |
| D5 | 四个产品支柱：Brief、Match、Reach、Delivery/Insight | 与 PRD 产品叙事和五阶段 UI grammar 一致 |
| D6 | Agent 是配置与运行时 registry，不是进程 | 便于共享工具、上下文和审计，后续可按负载拆 worker |
| D7 | 每个 Project 固定五阶段，ProjectKol 记录阶段参与状态 | 阶段是可审计业务状态，不仅是导航标签 |
| D8 | 内部工具与外部副作用工具分离 | 内部工具自动执行；外部工具永远先形成 PendingAction |
| D9 | PendingAction 是当前闸门状态；OperationLog 只做追加审计；OutboundAttempt/Outbox 负责幂等投递 | 不能从历史 pending 日志推导当前状态，也不能用数据库事务回滚已发出的外部请求 |
| D10 | Copilot 会话键包含 `route + projectId + env + agentId` | 路由、项目或环境变化必须 reset，防止上下文串味 |
| D11 | 领域规则使用纯函数，数据库和供应商调用放在 adapter | 可测试、可替换、可重放 |
| D12 | 主动式任务使用持久化 JobRun + lease/advisory lock + outbox | `node-cron` 只能作为开发触发器，不能作为唯一生产调度保证 |
| D13 | 每个重要字段都有 `dataSource`、`sourceRef`、`retrievedAt` 或 `confidence` | AI 估算、抓取、平台 API 和人工输入不可混淆 |
| D14 | 外部供应商通过 adapter 接入 AIGC Gateway、邮件、托管、密钥和分享服务 | 供应商错误不能渗透到领域状态机 |

## 3. 总体结构

### 3.1 运行时分层

```text
Browser
  ├─ AdminShell: 285px sidebar + minmax(0, 1fr) canvas + 360px Copilot
  ├─ Route pages: Today / Campaigns / Creators / Knowledge / Insight / Runs
  └─ useChat + typed UI events
        │
        ▼
Next.js App Router
  ├─ Server page loaders (read models)
  ├─ Route handlers (/api/agent, /api/projects, /api/gates, /api/runs)
  ├─ Agent runtime (context, registry, tool policy, stream)
  ├─ Domain services (state transitions, ranking, provenance, gate policy)
  ├─ Jobs and signal ingestion (lease, retry, outbox)
  └─ Adapters (Prisma, AIGC Gateway, StubDelivery, provider clients)
        │
        ▼
PostgreSQL + pgvector
  ├─ current business state
  ├─ append-only audit and outbox records
  └─ embeddings and normalized external signals
```

### 3.2 推荐目录

```text
src/
  app/
    admin/
      layout.tsx
      today/page.tsx
      campaigns/page.tsx
      campaigns/[id]/page.tsx
      creators/page.tsx
      knowledge/page.tsx
      insight/page.tsx
      runs/page.tsx
    api/
      agent/route.ts
      projects/route.ts
      projects/[id]/route.ts
      projects/[id]/advance/route.ts
      gates/[id]/route.ts
      gates/[id]/confirm/route.ts
      gates/[id]/reject/route.ts
      runs/[id]/route.ts
  components/
    admin-shell/
    copilot/
    brief/
    match/
    reach/
    delivery/
    insight/
    shared/
  lib/
    agent/
      runtime.ts
      registry.ts
      context.ts
      prompts.ts
      stream.ts
      tools/
    domain/
      project.ts
      project-kol.ts
      deal.ts
      gate.ts
      provenance.ts
      signals.ts
    data/
      prisma.ts
      repositories/
      read-models/
    jobs/
      runner.ts
      definitions.ts
      leases.ts
    integrations/
      aigc-gateway.ts
      stub-delivery.ts
      email.ts
      escrow.ts
      key-delivery.ts
      sharing.ts
    validation/
    observability/
prisma/
  schema.prisma
  migrations/
  seed.ts
```

模块依赖方向固定为 `app/components -> lib/domain -> lib/data/integrations`。领域模块不得反向 import React、Next request 或 Prisma client。

## 4. 产品信息架构与交互边界

### 4.1 路由和壳层

一级路由必须保持以下路径和语义：

| 路由 | 任务 | 主数据 |
| --- | --- | --- |
| `/admin/today` | 今日行动、主动式 Agent、风险雷达 | OperationLog、Signal、JobRun、PendingAction |
| `/admin/campaigns` | 项目列表与创建 | Project、ProjectKol |
| `/admin/campaigns/[id]?env=` | 项目五阶段工作台 | Project、ProjectKol、各阶段 read model |
| `/admin/creators` | KOL 发现、筛选、详情 | Kol、MatchCandidate、来源信息 |
| `/admin/knowledge` | 游戏知识和素材库 | Game、Material、GameKnowledge、Embedding |
| `/admin/insight` | 结果、归因、周报和分享 | MetricSnapshot、WeeklyReport、ShareLink |
| `/admin/runs` | 运行记录、失败、重试和审计 | JobRun、OperationLog、OutboundAttempt |

壳层使用 CSS grid：`grid-template-columns: 285px minmax(0, 1fr) 360px`。侧栏不得再使用历史的 `313px` 偏移。移动端保留画布，Copilot 变为 drawer；桌面端保持右侧 Copilot 常驻。

### 4.2 五种 UI grammar

| 阶段 | 交互语法 | 必须呈现 |
| --- | --- | --- |
| Brief | glance / fill | brief completeness、素材解析状态、缺口和 Agent 询问 |
| Match | compare / decide | 候选对比、匹配理由、风险、筛选条件、加入项目 |
| Reach | converse / approve | 联系线程、报价、沟通记录、外发前 gate |
| Delivery | verify / settle | 合同、素材、交付、密钥、付款状态与失败重试 |
| Insight | reconcile / share | 指标来源、归因、周报草稿、分享 gate |

所有页面的数据空态、加载态、错误态和来源标识必须由同一 `DataState` 组件渲染。金额、日期、成功率、品牌安全评级都不得只由模型文本生成。

### 4.3 Copilot 上下文

```ts
type CopilotContextKey =
  `${string}:${string}:${string}:${AgentId}` // route:projectId:env:agent

interface CopilotContext {
  route: string
  projectId: string | null
  env: 'default' | 'sandbox' | 'production'
  agentId: AgentId
}
```

React 层以完整 key 初始化 `useChat`。路由、项目、环境或 Agent 改变时销毁旧 chat 并创建新 chat；服务端仍必须校验 `projectId`、`tenantId` 和 `agentId`，不能信任客户端传来的范围。

## 5. Agent 运行时

### 5.1 Agent 列表与职责

```ts
type AgentId =
  | 'orchestrator'
  | 'brief'
  | 'match'
  | 'reach'
  | 'delivery'
  | 'insight'
  | 'compliance'
```

| Agent | 允许读取 | 允许写入 | 外部副作用 |
| --- | --- | --- | --- |
| orchestrator | 项目、阶段、Agent handoff | handoff、内部任务 | 无 |
| brief | 素材、知识、项目 brief | brief draft、缺口 | 无 |
| match | brief、Kol、候选 | MatchPlan、候选排序 | 无 |
| reach | 项目、候选、线程 | Outreach draft、Quote draft | 发信、报价需 gate |
| delivery | Deal、交付、素材 | Delivery 状态、检查项 | 密钥、托管、付款需 gate |
| insight | 指标、交付、信号 | 周报草稿、归因 | 分享需 gate |
| compliance | 全部只读证据 | 风险标记、阻断意见 | 无 |

角色是单一工作台角色，不建立“管理员/成员/审计员”三套产品权限。负责人仅表示 Project assignment，不增加审批角色。

### 5.2 唯一工具协议

整个仓库只允许一套工具定义和一个执行入口，禁止同时存在 `runTool`、`executeTool` 两套语义。

```ts
type ToolKind = 'internal' | 'outbound'

interface ToolContext {
  tenantId: string
  userId: string
  agentId: AgentId
  projectId: string | null
  env: 'default' | 'sandbox' | 'production'
  db: Db
  ai: AiGateway
}

interface ToolDefinition<I, O> {
  name: string
  kind: ToolKind
  agents: AgentId[]
  inputSchema: ZodSchema<I>
  outputSchema: ZodSchema<O>
  buildHarm?: (input: I, ctx: ToolContext) => HarmSummary
  execute: (input: I, ctx: ToolContext) => Promise<O>
}

export async function executeTool<I, O>(
  definition: ToolDefinition<I, O>,
  rawInput: unknown,
  ctx: ToolContext,
): Promise<O | PendingActionEnvelope> {
  const input = definition.inputSchema.parse(rawInput)
  assertAgentScope(definition, ctx.agentId)
  if (definition.kind === 'internal') return definition.execute(input, ctx)
  return createPendingAction(definition, input, ctx)
}
```

`createPendingAction` 是所有外部副作用的唯一入口；模型不能直接调用 provider adapter。工具 registry 只注册定义，不保存请求级状态。

### 5.3 提示词和流式协议

提示词按五层拼接：产品不变量、当前 Agent 角色、项目/阶段上下文、工具说明、用户消息。未可信的素材、邮件、网页和 KOL 文本放在明确的 untrusted 区块，禁止其修改系统规则。

运行时限制：单轮最多 8 个 tool steps；每个工具有独立超时；超时返回可重试错误而不是假成功；错误码必须写入 OperationLog。

流协议只有一种：模型收到经过脱敏的工具结果，浏览器收到结构化 UI message。外部工具返回：

```ts
type AgentUiEvent =
  | { type: 'data'; data: unknown }
  | { type: 'gate_confirm'; gateId: string; harm: HarmSummary; expiresAt: string }
  | { type: 'handoff'; handoffId: string }
  | { type: 'error'; code: string; message: string }
```

不得同时实现一个普通 `gate_confirm` tool result 和一个含义重复的 `data-gate` 私有协议。

### 5.4 Handoff

```ts
interface Handoff {
  id: string
  tenantId: string
  projectId: string
  fromAgent: AgentId
  toAgent: AgentId
  artifactType: 'brief' | 'match_plan' | 'outreach_thread' | 'deal' | 'report'
  artifactRef: string
  summary: string
  messages: Array<{ role: 'user' | 'agent' | 'system'; content: string }>
  createdAt: string
}
```

Handoff 只携带 artifact 引用和可审计摘要；接收方按自身 scope 重新读取数据，不信任发送方携带的金额、状态或权限结论。

## 6. 领域模型与状态机

### 6.1 核心实体

| 模块 | 实体 | 说明 |
| --- | --- | --- |
| Identity | Tenant、User、UserAssignment | P0 可为固定开发租户；User 由服务端上下文产生 |
| Brief | Game、Material、GameKnowledge | 素材、抽取知识、版本和向量 |
| Match | Kol、MatchPlan、PlanKol、MatchCandidate | KOL 档案、候选、筛选和匹配证据 |
| Reach | OutreachThread、OutreachMessage、Quote | 沟通、报价草稿、供应商消息引用 |
| Delivery | Deal、Deliverable、GameKey、Payout | 合作、交付、密钥和付款意图 |
| Insight | MetricSnapshot、Attribution、WeeklyReport、ShareLink | 指标快照、归因、周报和分享 |
| Signals | Signal、SignalCursor | 邮件、平台、合作伙伴和人工事件 |
| Runtime | OperationLog、PendingAction、OutboundAttempt、JobRun、OutboxEvent | 审计、闸门当前状态、外发尝试、任务和可靠投递 |

### 6.2 Project 状态

```text
BRIEF ── briefConfirmed ──> MATCH
MATCH ── matchPlanApproved ──> REACH
REACH ── dealAccepted ──> DELIVERY
DELIVERY ── allDeliverablesComplete ──> INSIGHT
INSIGHT ── projectClosed ──> CLOSED
```

状态转换由 `domain/project.ts` 纯函数校验前置条件，API 只能调用转换，不得直接写 `currentStage`。每次转换写 OperationLog，并为 Today 生成可读行动。

### 6.3 ProjectKol 状态

```text
DISCOVERED -> SHORTLISTED -> CONTACTED -> NEGOTIATING -> CONTRACTED
       ^             |             |             |             |
       +-------------+-------------+-------------+-------------+--> REJECTED
```

每个状态都保存 `changedAt`、`changedBy`、`reason`。批量 shortlist 可以自动执行；批量 contact、quote、contract 和任何外部提交都必须进入 gate。

### 6.4 Deal 状态

```text
DRAFT -> NEGOTIATING -> AGREED -> IN_DELIVERY -> DELIVERED -> SETTLED
  |          |             |          |             |
  +----------+-------------+----------+-------------+--> CANCELLED
```

金额以整数最小货币单位保存，货币代码单独保存。P0 只展示付款意图和 StubEscrow 结果，不执行真实支付。

### 6.5 Material 与 GameKnowledge

Material 有 `UPLOADED -> PARSING -> READY | FAILED`；解析产物必须可追溯到 `materialId` 和版本。GameKnowledge 使用版本号和 `supersedesId`，禁止原地覆盖已被 Agent 使用的事实。

## 7. 数据库设计

### 7.1 约束

- 所有业务表带 `tenantId`，即使 P0 只有一个开发租户。
- 外部 id 使用 `(tenantId, provider, externalId)` 唯一键。
- 软删除只用于用户可恢复数据；审计、闸门、外发尝试和供应商回执不可删除。
- 金额使用 `BigInt`/整数；时间使用 UTC `timestamptz`。
- 状态枚举由 Prisma 与领域 zod 双重校验。

### 7.2 闸门与投递表

`PendingAction` 是当前状态表：

```text
id, tenantId, projectId, kind, toolName, payloadJson, payloadHash,
harmJson, status, requestedBy, confirmedBy, expiresAt,
confirmationTokenHash, confirmedAt, executingAt, executedAt,
resultRef, errorCode, createdAt, updatedAt
```

状态为 `pending | confirmed | rejected | expired | executing | executed | failed | reconciling`。`reconciling` 用于供应商超时但结果未知的情况，禁止盲目再次发送。

`OutboundAttempt` 保存每次 provider 尝试：

```text
id, pendingActionId, tenantId, provider, idempotencyKey,
requestHash, responseRef, status, errorCode, attemptedAt, completedAt
```

唯一键为 `(tenantId, idempotencyKey)`。`OperationLog` 只追加事件，明确 `kind` 枚举：`auto | gate | block | irreversible | reconcile | error`，不能用于推导 PendingAction 当前状态。

### 7.3 来源与 nullable contract

所有面向用户的 KOL、游戏、报价、指标字段遵循：

```ts
type DataSource =
  | 'crawl'
  | 'platform_api'
  | 'user_upload'
  | 'partner_feed'
  | 'manual'
  | 'ai_estimate'
  | 'seed'

interface Provenance {
  dataSource: DataSource
  sourceRef: string | null
  retrievedAt: string | null
  confidence: number | null
  fieldProvenance?: Record<string, {
    dataSource: DataSource
    sourceRef: string | null
    retrievedAt: string | null
    confidence: number | null
  }>
}
```

`seed` 是为旧 CSV 引入的显式来源，需要同步修订 PRD 的六值枚举；在修订完成前，若旧 CSV 能证明来自爬取，则使用 `crawl` 并在 `sourceRef` 标记 `legacy-seed-csv`，绝不能把未知数据标成 `ai_estimate`。未知值显示“待接入”，不显示 `$0`、`0%` 或伪造评级。

品牌安全评级固定为 `safe | review | risk`，不得出现 `A-`、`B+` 等未定义等级。所有输入先经 zod 解析，再由 provenance resolver 决定显示值。

### 7.4 向量和迁移

向量维度由实际 embedding model 配置固定为 `vector(1024)`；迁移文件显式执行：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Prisma schema 不依赖 `postgresqlExtensions` 预览开关。embedding 写入采用批处理和内容 hash 幂等；HNSW/IVFFlat 索引在数据量达到阈值后以独立 migration 添加。Prisma、`@prisma/client`、Node 和 AI SDK 必须锁定版本并提交 lockfile。

### 7.5 Seed pipeline

`prisma/seed.ts` 只负责可重复的基础数据：读取 CSV 时处理 BOM、列名别名、空值和货币格式；校验失败返回非零退出码；以 `(tenantId, canonicalHandle)` 幂等 upsert；向量计算分批执行并记录失败行。seed 数据的来源字段按真实证据填写，不能为填满 KPI 而自动生成事实。

## 8. AI→Human Gate 与外部副作用

### 8.1 规则

必须 gate 的动作：发送消息、批量发送、提交报价、分发密钥、托管/付款、对外分享、任何不可逆供应商写操作。内部草稿、排序、解析、匹配、风险分析不需要 gate。

Gate 由服务端强制，模型不得自行声称“已发送”。harm 结构固定为：动作、对象、金额/数量、供应商、不可逆影响、证据、过期时间。所有确认和拒绝都追加 OperationLog。

### 8.2 可靠执行流程

```text
Agent outbound tool
  -> validate input + build harm
  -> transaction: PendingAction(pending) + gate OperationLog
  -> UI emits gate_confirm
  -> human opens gate
  -> server derives confirmedBy; validates origin/CSRF and token
  -> transaction: pending -> confirmed
  -> transaction: confirmed -> executing + OutboundAttempt(unique idempotencyKey)
  -> provider adapter with same idempotency key
       ├─ known success: executing -> executed + irreversible log
       ├─ known failure: executing -> failed + error log
       └─ timeout/unknown: executing -> reconciling; job queries provider
```

外部请求不与数据库事务假装组成原子操作。唯一幂等键和 OutboundAttempt 防止重复发送；未知结果进入 reconciliation，而不是直接重试。确认 token 只存 hash，短时 TTL，单次使用并绑定 tenant、project、payloadHash。

### 8.3 API 与错误码

```text
POST /api/agent                  -> UIMessage stream
GET  /api/gates/:id              -> gate detail + harm
POST /api/gates/:id/confirm      -> 202 accepted / 409 stale / 410 expired
POST /api/gates/:id/reject       -> 204
GET  /api/runs/:id               -> current status + attempts + logs
```

统一错误码包括 `INVALID_INPUT`、`SCOPE_DENIED`、`GATE_REQUIRED`、`GATE_EXPIRED`、`STALE_STATE`、`IDEMPOTENCY_CONFLICT`、`PROVIDER_UNKNOWN`、`RECONCILIATION_PENDING`。P0 `StubDelivery` 将请求和结果写入本地数据库，模拟超时、重复请求和失败，以验证上述状态机。

## 9. 主动式 Agent、信号与任务

### 9.1 Signal

Signal 统一为：

```text
tenantId, source, externalId, type, occurredAt, payloadJson,
entityType, entityRef, normalizedAt, processedAt, severity
```

`(tenantId, source, externalId)` 唯一；原始 payload 不改写，规范化结果可重放。来源包括 email、platform、partner、manual 和内部 job。信号只能创建建议、提醒或 draft，不得跳过 gate。

### 9.2 JobRun 与调度

Job 定义：`nightly-screening`、`signal-sync`、`health-scan`、`follow-up-due`、`delivery-watch`、`weekly-report-draft`。每次运行写 JobRun，带 `scheduledAt`、`leaseUntil`、`attempt`、`status`、`cursor` 和错误信息。

生产调度采用 DB advisory lock 或带租约的 JobRun claim；进程重启后可 catch-up，单个任务幂等，可配置指数退避和最大重试。`node-cron` 仅作为本地开发触发器或调用同一个 claim API，不能作为生产唯一保障。

Today 展示由当前状态和未消费 signal 生成：Agent 今天完成、待处理提醒、过期 gate、失败投递、健康扫描和风险雷达。旧 pending OperationLog 不得让 radar 永久保持 pending。

## 10. 外部集成

### 10.1 AIGC Gateway

模型调用统一经 `aigc-gateway.ts`，接口包含模型、温度、超时、重试、usage、requestId 和 provider error。运行时依赖锁定兼容的 `ai`、provider、`zod` 版本，并在 CI 的 mock gateway 中验证 stream、tool call、超时和错误映射。没有 AI 环境变量时，只有 F001 数据迁移和非 AI 页面可启动；生产模式不得静默降级为假 AI。

### 10.2 副作用 adapter

Email、Escrow、KeyDelivery、Sharing 各自实现：请求 schema、幂等 key、超时、错误分类、webhook 验签和 reconciliation 查询。领域服务只依赖接口，不依赖供应商 SDK。P0 使用 `StubDelivery`，真实 provider 开关由服务端环境和认证共同控制。

## 11. 安全、可观测性与非功能要求

### 11.1 安全前置条件

- 每个 API 从服务端 session 派生 `userId`、`tenantId` 和 scope，不接受客户端伪造身份。
- 真实 provider 前接入认证、CSRF/origin 校验、租户隔离和至少基础 RLS 策略。
- 所有表查询带 tenant filter；外部 URL、HTML、邮件和 KOL 内容按不可信输入处理，禁止无审计的 `dangerouslySetInnerHTML`。
- 上传限制大小、MIME、扩展名和内容扫描；解析在受限 worker 中进行。
- API key 只存在 secret manager/环境变量，日志脱敏；prompt 中的外部内容不能改变工具 policy。
- gate 确认、拒绝、过期、执行、重试和 reconciliation 都不可删除。

### 11.2 指标

至少记录：`agent_request_duration_ms`、`tool_latency_ms`、`tool_error_total`、`gate_pending_age_seconds`、`gate_confirm_total`、`outbound_duplicate_prevented_total`、`provider_unknown_total`、`job_lag_seconds`、`signal_ingest_total`、`embedding_failure_total`。日志带 `requestId`、`tenantId`、`projectId`、`agentId`、`gateId` 和 `jobRunId`。

### 11.3 质量目标

- 只读页面 P95 首屏数据响应 < 1.5s（本地目标，生产按容量重新基准）。
- Copilot 首 token P95 < 3s，流式中断可显示可重试状态。
- 任何外部副作用的重复率为 0；未知结果必须可观测且可人工处理。
- 错误、空态、键盘操作和窄屏布局覆盖核心路径；颜色不是唯一状态提示。
- 所有金额、时间、来源、置信度和评级在 UI 上有统一格式化组件。

## 12. 部署与配置

### 12.1 环境

开发环境：Node 20、Next dev、PostgreSQL + pgvector、StubDelivery。CI 为 build/test 数据库提供 `DATABASE_URL`，AI 使用 mock gateway；未配置真实 AI 时，CI 不应因 instrumentation 把非 AI 检查阻断。

生产环境：应用、数据库、迁移 runner、单活跃 scheduler worker、secret manager、日志/指标和备份恢复演练。迁移顺序为扩展和表结构、数据回填、应用发布、索引，再开启新功能开关。

### 12.2 Feature flags

`ENABLE_AGENT_CHAT`、`ENABLE_REAL_PROVIDERS`、`ENABLE_SCHEDULER`、`ENABLE_MULTI_TENANT`、`ENABLE_RLS` 默认关闭。`ENABLE_REAL_PROVIDERS` 必须同时满足认证、secret、webhook 验签和 reconciliation 检查。

### 12.3 健康检查

`/health/live` 只检查进程；`/health/ready` 检查数据库、迁移版本和必要 adapter。不能用需要登录的业务页面作为容器 healthcheck 唯一依据。

## 13. 测试策略与验收

### 13.1 单元测试

- zod schema、来源解析、品牌安全枚举、金额格式化。
- Project、ProjectKol、Deal、Gate 状态转换和不变量。
- 工具 registry scope、internal/outbound 分类和 prompt injection 边界。
- 排序、匹配证据、signal 去重、job retry/backoff。

### 13.2 集成测试

- Prisma migration、pgvector 扩展、seed 幂等和脏 CSV 非零失败。
- `PendingAction` 并发 confirm 只有一个成功；过期/拒绝不可执行。
- provider 成功、明确失败、超时未知、reconciliation 和重复 idempotency key。
- OperationLog append-only；当前 gate 状态不由历史日志聚合错误得出。
- tenant filter、服务端身份、CSRF/origin、webhook 验签。

### 13.3 端到端与视觉回归

覆盖从 Campaign 创建到 Brief、Match、Reach、Delivery、Insight 的主路径；覆盖 Today 主动提醒、Copilot reset、gate modal/drawer、错误和窄屏布局。UI 事件必须可被 Playwright 读取，不依赖截图文字猜测。

### 13.4 L1/L2 边界

L1 只使用本地 Stub 和 mock gateway，验证协议、认证、路由、错误和幂等；L2 需要明确授权并使用真实 API key，验证供应商、审计和计费一致性。L1 失败不能直接推断 L2 失败。

## 14. 实施路线图

### M0：地基与兼容性

1. TypeScript 5 微批迁移，保持每批可 build。
2. Prisma/AI SDK/Node 版本锁定，补 CI mock 环境。
3. 自定义 pgvector migration、基础 Db client、健康检查和日志上下文。

### M1：Brief + Knowledge + 基础 Agent

1. Game、Material、GameKnowledge、Project 基础表和 seed pipeline。
2. `/admin/knowledge`、`/admin/campaigns`、Brief grammar。
3. 单一 `executeTool`、Agent registry、stream 和 Copilot context reset。

### M2：Match

1. Kol、MatchPlan、PlanKol、候选排序和来源展示。
2. `/admin/creators` 与项目 Match 阶段。
3. 匹配证据、品牌安全和 shortlist 内部工具。

### M3：Reach + Delivery

1. OutreachThread、Quote、Deal、Deliverable。
2. PendingAction、OutboundAttempt、StubDelivery、gate UI/API。
3. 先完成并发、幂等和 reconciliation 测试，再接真实 provider。

### M4：Insight + 主动式任务

1. MetricSnapshot、WeeklyReport、ShareLink、Insight grammar。
2. Signal、JobRun、nightly screening、follow-up、health scan。
3. Today 完成行动卡、风险雷达和 Runs 诊断页。

### M5：生产化

1. 认证、租户隔离、RLS、secret manager、webhook 验签。
2. durable scheduler、备份恢复、容量压测和真实供应商灰度。
3. 可访问性、性能、i18n、审计保留策略和灾备演练。

## 15. ADR 与开放风险

### ADR-001：单体模块化优先

P0 保持单 Next 应用。只有当 AI stream、scheduler 或 provider adapter 出现独立扩缩容需求时才拆 worker/service，并以事件和幂等协议作为边界。

### ADR-002：闸门不是分布式事务

数据库状态和外部副作用通过 PendingAction、OutboundAttempt、idempotency key、webhook/reconciliation 协调；禁止声称“provider 调用与数据库更新同事务”。

### ADR-003：历史日志不代表当前状态

OperationLog 只用于审计和时间线。所有 Today radar、gate 列表和重试队列读取 PendingAction/JobRun 当前状态。

### ADR-004：真实 provider 之前必须有身份

开发 Stub 可以固定用户，但生产 confirm 必须由服务端 session 派生 confirmedBy，并启用 CSRF/origin、租户过滤和 webhook 验签。

### ADR-005：来源枚举扩展

旧 CSV 的真实来源仍需产品确认。若无法证明为 crawl，采用 `seed` 并同步修订 PRD 数据契约；在此决策完成前，UI 显示“待接入”而不是 AI 估算。

### 已知风险

- 现有仓库尚无数据库和 `src/lib`，M0 需要先建立基础设施；不能把 F002 的 AI 依赖直接混入现有旧编译器。
- 外部平台的 webhook 和幂等语义不同，adapter 必须逐供应商验收，不能靠通用 HTTP 重试解决。
- 主动式 Agent 的“夜间筛选”涉及成本和数据新鲜度，必须有租约、限额、暂停开关和运行记录。
- PRD 当前六值 `dataSource` 与旧 seed CSV 的真实来源可能不一致，需要产品/数据负责人在接入前签字。

## 16. 实施验收清单

- [ ] 六个一级路由和五种 UI grammar 与 PRD/原型一致。
- [ ] 壳层列宽为 `285 / minmax(0,1fr) / 360`，移动端 Copilot drawer 可用。
- [ ] 路由、项目、环境、Agent 任一改变都会 reset Copilot 会话。
- [ ] 只有一个 `ToolDefinition` 和 `executeTool`，模型无法直接调用 provider。
- [ ] PendingAction 是当前状态，OperationLog 为 append-only，OutboundAttempt 有唯一幂等键。
- [ ] confirm 并发、过期、拒绝、成功、明确失败、未知结果和 reconciliation 均有测试。
- [ ] Project、ProjectKol、Deal 状态转换由纯函数约束并写审计。
- [ ] Seed、embedding、来源字段和 nullable contract 不制造伪事实。
- [ ] pgvector 通过自定义 migration 创建，AI SDK 与 Zod 版本锁定。
- [ ] JobRun 有 lease、重试、catch-up 和单活跃 claim；Today 不从历史 pending 日志误判状态。
- [ ] 真实 provider 前完成认证、租户隔离、CSRF/origin、secret、webhook 验签和恢复演练。
- [ ] L1 本地测试全通过；L2 仅在显式授权后执行。

