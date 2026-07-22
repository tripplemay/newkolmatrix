# KOLMatrix Agent 架构（AGENT-FOUNDATION 批次交付）

> 本文是 AGENT-FOUNDATION 批次（F001–F010）立起的 **Agent 驱动架构**权威说明：四根柱子 + 成品级多 Agent 编排框架 + AI→人闸门地基。
> 立意：**先把多 Agent 架构框架搭成品 + 用 hello-agent 证明闭环，再往骨架上按业务挂领域能力**（子 agent / 工具 / MCP 按需扩展）。
> 权威顺序（冲突时）：用户当前决策 > PRD > 交互原型 v2 及落地规范 > 综合架构合并稿 > 批次 spec。

## 0. 一句话与目录

自然语言 → Agent 运行时 streamText loop → 唯一执行入口 executeTool（zod 校验 + class 门控）→ 工具产出经 generative canvas 渲染；多个专家人格共享单一 `/api/agent`，按 route 切换 + 一次可视化 handoff；对外动作被服务端强制拦在「人确认」前。

- §1 四柱架构
- §2 多 Agent 编排框架（⑥ 编队运行时）
- §3 框架焊死 vs 语义扩展点（边界铁律）
- §4 AI→人闸门模型（F009）
- §5 端到端数据流（hello-agent）
- §6 how-to：加一个新专家人格 / 新工具 / 新 canvas 组件
- §7 已知下游（不在本批）

---

## 1. 四柱架构

Agent 驱动产品的四根柱子。每柱一个明确的唯一入口，禁止双语义并存。

### 柱一 · 工具层（tools + 唯一注册表 + 唯一执行入口 + 工具二分）

- **唯一注册表** `src/lib/agent/tools/registry.ts`：`registerTool` / `getTool`。native 工具在 `tools/index.ts` 的 `NATIVE_TOOLS` 幂等装配（防 Next dev HMR 重名）。
- **唯一执行入口** `src/lib/agent/execute.ts` 的 `executeTool(name, rawInput, ctx)`（架构稿 §5.2）：所有工具调用——HTTP route 的 streamText、未来 MCP server / agent API 适配层——**都必须经此**，统一保证 (1) zod 入参校验 (2) class 分流（outbound 门控挂载点）。模型不能绕过。
- **工具二分** `ToolDefinition.class`（`src/lib/agent/tools/types.ts`）：
  - `internal`：读/分析/起草类，直接执行（搜索、评估、匹配、起草、复核……）。
  - `outbound`：对外不可撤销类（发送、报价、放款……），**服务端强制门控**（§4）。
  - （取代了作废的 `allowedRoles` 概念——单角色下没有权限分级，护栏靠工具二分 + 闸门，不靠角色。）
- **ToolDefinition 形态**：`{ name, description, class, source: 'native'|'mcp', inputSchema (zod), execute(input, ctx), buildHarm?(input, ctx) }`。outbound 工具必须声明 `buildHarm`（否则闸门无法披露利害，executeTool 抛错）。
- **native 工具（as-built，M2-A 校准）**：`search_kols`（internal，向量检索 seed KOL）、`get_kol_detail`（internal）、`send_outreach`（outbound，F009 闸门样例）、`compute_health`（internal，M1-B）、`match_plan`（internal，M2-A：现行轮组合 + PlanKol 摘要，输出携带 `type:'match_plan'` 供 canvas type 路由）、`evaluate_creator`（internal，M2-A：`computeMatchScore` 单人可解释评估，画像口径与候选生成同源）。
- **AI SDK 桥接** `to-ai-sdk-tools.ts`：把注册表按人格收窄后的子集映射为 `streamText` 的 `ToolSet`，每个 AI SDK 工具的 `execute` 都委托 `executeTool` —— 模型自主发起的每次调用都统一过校验与门控。

### 柱二 · Agent 运行时（streamText 流式 loop）

- 入口 `src/app/api/agent/route.ts`（`runtime = 'nodejs'`，Prisma 不支持 edge）。
- 单一 `/api/agent` 承载**所有专家**，不起独立进程（PRD §12.6 / FR-12.1）：route 只换人格 system prompt + 工具子集，端点不变。
- 流程：解析 body → `resolveContext`（服务端校验，不信任客户端范围）→ `selectPersona` → `buildToolContext` → `personaToolSubset` 收窄 → `toAiSdkTools` → `streamText({ model: chatModel(), system, messages, tools, stopWhen: stepCountIs(5) })` → `toUIMessageStreamResponse`。
- **⑤层知识注入（M1-D F005 as-built）**：system = `persona.systemPrompt` + 知识段 + 工具指引。知识段由 `src/lib/agent/knowledge-context.ts` 的 `gameKnowledgeSection(projectId, persona.knowledgeKinds)` 组装——Project（id/publicId/slug 三口径）→ `Game.id` → `GameKnowledge` 链头（`supersededById IS NULL`）按 kind 过滤 → 含溯源计数的文本段；`ctx.projectId` 空 / 人格未声明 kinds / 无知识 → 空串跳过（不注水，取数失败也不打死对话主链路）。特点更新后下次调用即感知（FR-8.4.9 运行时注入，非硬编码）。
- 人格身份经响应头 `X-Agent-Id` / `X-Agent-Tools` 暴露（前端/验证消费）。
- 网关 `src/lib/ai/gateway.ts`：aigcgateway（OpenAI 兼容）⇄ Vercel AI SDK provider。默认 chat=deepseek-v3、embedding=bge-m3。含 `resilientFetch`（空内容 patch + `keepalive:false` + 空-400 重试，绕 SSE 流污染 undici 连接池的坑）。

### 柱三 · 常驻对话面（useChat）

- `src/components/copilot/CopilotPanel.tsx`：Horizon 外壳右栏常驻，`useChat` + `DefaultChatTransport({ api: '/api/agent', body: { context } })`。
- **多人格切换**：`deriveContext(pathname, ?stage)` 把 route 映射到人格；`contextKey = route:projectId:env:agentId` 作为 `<CopilotChat key>` → context 变化整个 chat remount（对话清空 + 新专家开场白，FR-12.4）。
- 顶部常驻 `ExpertScope`：当前专家 duty + 否定式护栏（`personaBoundary`，client-safe）。
- 协同交接可视化 `HandoffCollab`：拉 `GET /api/handoffs` 渲染真实交接（§2 handoff）。

### 柱四 · Generative Canvas（工具结果 → React 组件）

- `src/components/copilot/canvas/canvas-registry.tsx`（M2-A F007 兑现 ADR-28）：路由键 = **结果 `type` 优先（工具输出携带 `type` 字符串字段）、无 type 回退工具名**；`registerCanvasRenderer(type, component)` 受控 register API（重名抛错，测试可注入）。`renderToolResult(toolName, output)` / `hasCanvasRenderer(toolName, output?)`。已注册：`search_kols` → `KolResultCards`（回退键，零变更）· `match_plan` → `MatchPlanCard`（type 键，对比矩阵简版卡）。
- `MessageParts`（CopilotPanel 内）识别流式消息的工具 part：静态工具 part 的 `type` 是 `tool-<name>`（传给 streamText 的工具），动态工具是 `dynamic-tool`；`state==='output-available'` 且有注册器 → 渲染画布组件，否则回退文本占位。
- 本批：`search_kols` → `KolResultCards`（KOL 卡片流，忠实 Horizon 卡片视觉）。
- 视觉基线：`/preview/agent-canvas`（固定夹具确定性还原画布）→ `tests/visual/agent-canvas.spec.ts` 截 `agent-canvas-*.png`。

---

## 2. 多 Agent 编排框架（⑥ 编队运行时 = 柱二内的调度视图）

编队运行时**不是独立第五柱**，是四柱之上的调度视图：每个 Agent = 注入柱二 streamText runtime 的 system-prompt 人格 + 按环节收窄的工具子集 + 界面语法。四个接口：

### 2.1 registry（编队名册，权威）

- `src/lib/agent/registry.ts`：以 PRD §9.2 为权威声明 **7 个 AgentId**：`orchestrator / strategy / match / reach / delivery / insight / compliance`。
- `AgentPersona = { id, name, stage, duty, isolation, uiSyntax, tools[], knowledgeKinds?, systemPrompt }`。`systemPrompt` 由 `duty`（我做什么）+ `isolation`（否定式护栏，我不做什么）+ `uiSyntax`（我怎么呈现——M2-A F007 注入「你的产出形态：{uiSyntax}」段，:1032 欠账消解）组合——否定式比肯定式更难被模型伪造（D13 升级版）；三段与 `personaBoundary` UI 卡同源不漂移。`knowledgeKinds`（M1-D F005）= ⑤层知识注入的 kind 子集（FR-8.4.8 映射：strategy 三类全量 / match=受众 / reach=卖点 / compliance=红线；未声明不注入）。match 人格 tools 已扩四件（M2-A：+= `match_plan`/`evaluate_creator`）。
- `personaBoundary(id)` client-safe（无 prisma），供柱三 ExpertScope。`DEFAULT_AGENT_ID = 'orchestrator'`（工作区层入口）。

### 2.2 persona router（选人格 + 收窄工具子集）

- `src/lib/agent/persona-router.ts`：`CopilotContext = { route, projectId, env, agentId }`；`buildContextKey` = `route:projectId:env:agentId`（projectId 空用 `-`）。
- `defaultAgentForRoute(route)`：**末段关键词**匹配（避免子串坑——`'outreach'` 曾因 `/reach` 不是其子串误配 orchestrator，F007 修）。
- `selectPersona` / `personaToolSubset`：柱二消费，不同人格看到不同工具。

### 2.3 handoff（专家间交接，架构稿 §5.4）

- `src/lib/agent/handoff.ts`：`HandoffEnvelope = { projectId, fromAgent, toAgent, artifactType, artifactRef, summary, messages[] }`。落 F002 `Handoff` 表。
- **核心语义**：handoff 只携带 **artifact 引用 + 可审计摘要**；接收方**按自身 scope 重新读取**数据，**不信任**发送方携带的金额 / 状态 / 权限结论。`receiveHandoff` 返回重读指令 `mustRereadBy` / `rereadRef`（真实重读由接收方领域工具在 M1–M4 执行）。
- `GET /api/handoffs` → 柱三 HandoffCollab 可视化「A→B」。

### 2.4 orchestrator（调度骨架）

- `src/lib/agent/orchestrator.ts` + client-safe 的 `stage-routing.ts`：
  - **环节路由** `routeToStage(projectId, stage)`：把「进入某项目的某环节」表达为目标 CopilotContext（`/admin/campaigns/{id}?env=`，ARCH-M05 F007 起 canonical；旧 `?stage=` 深链读到即重写）。指令语法 `enter:/pick:/env:`（`parseOrchestratorDirective`）。五环节 `brief/match/reach/delivery/insight` ↔ `STAGE_AGENT`。
  - **pending 聚合** `aggregatePending`：汇总待拍板事项（F002 PendingAction），**原样返回、不改写 / 不软化**任何专家 / 闸门结论（独立性铁则的编排侧体现——编排只汇总，不篡改）。

### 最小跑通验证（框架验收证据，非填内容）

`npm run orch:smoke`：≥2 真实人格按 route 切换（工具子集不同）+ 一次 handoff（信封创建→落表→接收方按 id 重读）+ orchestrator 路由到某项目某环节 + 聚合原样不改写。等同 hello-agent 证明单 agent 闭环。

---

## 3. 框架焊死 vs 语义扩展点（边界铁律，D-ORCH / ADR-001）

本批立意：**框架搭成品，业务语义留扩展点**。写代码前先判断改的是哪一侧。

| 已焊死（结构稳定，改动须走 ADR） | 语义扩展点（随 M1–M4 业务真实形态充实） |
|---|---|
| `executeTool` 唯一执行入口 + zod 校验 + class 门控挂载点 | 各人格 `systemPrompt` 精度、`tools` 精确子集 |
| 工具二分 `internal / outbound` | `uiSyntax` → canvas 组件的精确映射 |
| registry `AgentPersona` 字段形态 | `defaultAgentForRoute` 的 route→agent 映射精度（随 IA 充实） |
| context key 格式 `route:projectId:env:agentId` | `pick:` / `env:` 指令完整语义、聚合排序规则 |
| `selectPersona` / 工具子集收窄机制 | `compliance` 跨环节调用点 |
| handoff 信封格式、`createHandoff/receiveHandoff` 机制 | `receiveHandoff` 里「按 scope 重读」的真实读取逻辑（需领域工具） |
| 环节路由指令格式、目标 context 结构、`aggregatePending` 签名 | `artifactType` 扩充、MCP 工具（`source:'mcp'`）实装 |
| AI→人闸门服务端强制 + harm zod schema + 留痕同事务 | 报价 / 放款等更多 outbound 工具、真实幂等投递 |

代码内以注释标注 `【框架焊死】` / `【EXTENSION POINT】`。

---

## 4. AI→人闸门模型（F009，PRD §10.4 / 架构稿 §8）

**核心不变量：outbound 动作，模型自主 loop 永远拿不到确认令牌 → 只能停在 pending，无法自我放行。**

- **服务端强制**（`execute.ts`）：`executeTool` 中 `if (tool.class === 'outbound' && !ctx.confirmationToken)` → `buildHarm` → `createPendingAction` → 返回 pending 信封（含 harm，**无令牌**），**副作用不执行**。模型路径的 `ctx` 由 `buildToolContext` 构造，**从不设** `confirmationToken`，故任何人格（含 F006 全部专家）都拿不到令牌。
- **harm 单一 zod schema**（`gate/harm.ts`）：`action / summary / targets[] / amount+currency? / quantity? / scope? / irreversible / evidence / expiresAt / label`。确认卡如实列**全部**利害：批量发列全部收件人**不折叠**、报价标金额与授权范围、放款标收款方，统一红标「**对外·不可撤销**」（`z.literal` 强制）。
- **人确认 → 执行 → 同事务留痕**（`gate/gate.ts` `confirmPendingAction`，仅经 `POST /api/gate/confirm`，即「人」触达）：校验 pending + 未过期(TTL) + 单次 → 签发令牌（`randomBytes(32)`，**只存 sha256 hash**）→ 带令牌 `ctx` 再入 `executeTool` 执行 → `prisma.$transaction([status=executed, OperationLog kind:irrev])` 同事务留痕。
- **令牌四安全属性**：只存 hash、短 TTL（15min）、单次（status pending→executed）、绑 `payloadHash`。`payloadHashOf = sha256(toolName + stableStringify(input) + tenantId)`；`stableStringify` 递归排序 key，**抗 JSONB 存储重排**（否则 confirm 时读回的 inputJson key 顺序变了会 hash 不匹配）。
- **无阈值分级（D28）**：$100 与 $10,000 走**完全相同**确认，门控分支不读金额。
- **internal 不加闸门（D27，反假闸门）**：搜索 / 评估 / 匹配 / 起草 / 复核 / 采纳……直接执行，不弹确认框。
- **拒绝**：`rejectPendingAction` → 失效 PA + `OperationLog kind:block`。
- **变异测试（D20 硬性，`scripts/test/gate-smoke.ts`）**：把服务端拦截退回原状（直调 `tool.execute` 绕过 `executeTool` 门控）→ 副作用发生 → G1「无副作用」断言必变红。证断言验**行为**、非验源码关键字。
- 验证：`npm run gate:smoke`（G1–G5 + 拒绝 + D20）。

---

## 5. 端到端数据流（hello-agent）

```
浏览器（柱三 CopilotPanel / useChat）
  │  自然语言 + CopilotContext{route,projectId,env,agentId}
  ▼
POST /api/agent（柱二 route.ts, runtime=nodejs）
  │  resolveContext（服务端校验，不信任客户端范围）
  │  selectPersona → system = 人格(duty+否定护栏) + 可用工具指引
  │  buildToolContext（单租户 dev tenant, D4）
  │  personaToolSubset → toAiSdkTools（收窄子集）
  ▼
streamText agent loop（stepCountIs 5, chatModel=deepseek-v3 via aigcgateway）
  │  模型自主决定调用工具
  ▼
executeTool（柱一唯一入口, execute.ts）
  │  (1) zod 入参校验
  │  (2) class 分流
  │      ├─ internal → tool.execute（如 search_kols → embedText(bge-m3) → pgvector 向量检索 seed KOL）
  │      └─ outbound 且无令牌 → createPendingAction → pending 信封 + harm（副作用不执行，§4）
  ▼
toUIMessageStreamResponse（流式 UIMessage：text part + tool-<name> part）
  │  X-Agent-Id / X-Agent-Tools 响应头
  ▼
柱三 MessageParts → 柱四 canvas-registry.renderToolResult
  └─ search_kols → KolResultCards（KOL 卡片流在画布渲染）
```

- **持久层**：Prisma 6 + Postgres 16 + pgvector（`vector(1024)`，D3 自定义 CREATE EXTENSION 迁移）。表：`Kol`（+ embedding）、`Handoff`（F002）、`PendingAction` / `OperationLog`（F002 + F009）、`Tenant`（单租户）。
- **多 Agent 编排闭环**：≥2 人格按 route 切换（match↔reach，工具子集不同）+ 一次可视化 handoff（match→reach，落 Handoff 表，HandoffCollab 渲染）+ orchestrator 待办直达某项目某环节。
- **验证**：
  - `npm run f010:e2e`（浏览器 NL → 卡片流渲染 + 人格切换 + handoff；接活网关，需 dev server + seed）。
  - `npm run agent:smoke`（柱一 executeTool 直调）、`orch:smoke`（编排框架）、`gate:smoke`（闸门）。
  - `tests/visual/agent-canvas.spec.ts`（画布视觉基线）。

---

## 6. how-to（往骨架上挂业务能力）

### 6.1 加一个新专家人格

1. `registry.ts`：`AgentId` 联合类型加新 id；`PERSONA_SEED` 加一条 `{ id, name, stage, duty, isolation, uiSyntax, tools: [...] }`（tools 填该人格可用的工具名子集）。
2. （可选，若该人格有专属 route）`persona-router.ts` `defaultAgentForRoute` 加 route 末段关键词映射。
3. （可选，若属项目内某环节）`stage-routing.ts` `STAGE_AGENT` 加 `stage → agentId`。
> `systemPrompt` 自动由 `duty + isolation` 组合，无需手写。这是**扩展点**，不动焊死结构。

### 6.2 加一个新工具

1. `src/lib/agent/tools/` 下建工具文件，导出 `ToolDefinition`：`{ name, description, class, source:'native', inputSchema: z.object({...}), execute }`。
   - `class: 'internal'` → 直接执行。
   - `class: 'outbound'` → **必须**再声明 `buildHarm(input, ctx): Harm`（如实列全部利害），否则 executeTool 抛错。
2. `tools/index.ts`：`NATIVE_TOOLS` 加一条。
3. 要让某人格能用 → 在 `registry.ts` 该人格的 `tools[]` 加工具名。
> 工具自动经 `executeTool` 的 zod 校验 + class 门控，无需在工具内重复校验或加闸门。

### 6.3 加一个新 canvas 组件（工具结果的画布渲染）

1. `src/components/copilot/canvas/` 下建组件，props 形如 `{ output: <该工具返回结构> }`。
2. `canvas-registry.tsx`：`CANVAS_REGISTRY` 加一条 `工具名: 组件`。
> `MessageParts` 会自动在工具 `output-available` 时调 `renderToolResult` 渲染；无注册器则回退文本占位。**不改对话面核心**。

---

## 7. 已知下游（不在本批）

- 各专家领域工具（M1–M4）：策略仪表、匹配组合态、触达谈判、交付台账、洞察归因……随业务真实形态往扩展点补。
- MCP 工具实装（`source:'mcp'`）、对外互操作适配层（D-INTEROP：executeTool 不假设调用方）。
- 真实认证 / 多租户 / RLS（M5，当前单租户 dev tenant，D4）。
- 真实幂等对外投递（当前 send_outreach 为 mock 副作用）、报价 / 放款等更多 outbound 工具。
- `compliance` 跨环节调用点、`receiveHandoff` 真实按 scope 重读逻辑。

---

_落盘：AGENT-FOUNDATION F010。四柱 + 多 Agent 编排框架 + AI→人闸门 + 数据流 + how-to。_
