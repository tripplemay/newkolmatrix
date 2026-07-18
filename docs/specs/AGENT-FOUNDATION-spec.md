# AGENT-FOUNDATION — Agent 驱动架构地基规格（单角色重拆版）

> **批次 ID：** AGENT-FOUNDATION
> **类型：** 新功能批次（架构地基） — 硬性要求 spec
> **状态机流转：** planning → building → verifying → fixing ⟷ reverifying → done
> **Spec 沿革：**
> - 2026-07-14 初版 spec-lock（用户 plan-mode 批准）
> - 2026-07-15 r2：三角色纳入 Phase 0（已作废）
> - 2026-07-16 三角色整体作废，单角色收敛（D26–D29）
> - **2026-07-17 r3 重拆：** 依据 KOLMatrix-PRD v1.0（单角色终稿）+ 综合架构设计合并稿，把批次从「三角色原文 + 作废批注」并存态**重拆为单一无歧义的单角色实现契约**。新增 TS5 前置（F001）、PendingAction/OperationLog 运行时表（F002）、harm 单一 zod + 变异测试；feature 由 8 条重编为 9 条。
> - **2026-07-17 r3.1 编排框架前置：** 用户立意「M0 搭成品级多 Agent 架构，子 agent/工具/MCP 后期按需扩展」。新增 F006 多 Agent 编排框架（registry+router+handoff+orchestrator）+ F002 加 Handoff 表 + F005 加工具来源抽象 + F007 对话面加多人格切换/协同交接可视化；确立 §3.2 D-ORCH「框架焊死 / 语义留扩展点」纪律；feature 9 → 10 条。
> - **2026-07-17 r3.2 对外互操作地基：** 用户提出地基层支持 GEO（生成式引擎优化 / AI 可见性）+ 对外部 agent 友好。确立 §3.3 D-INTEROP：M0 只留「对外机器友好契约」薄地基（核心实体稳定标识 + 领域/传输解耦 + provenance 作对外可信层），本体（MCP server 对外暴露 / GEO 内容优化）留 M4/M5。**不新增 feature**，加强 F002/F005 约束 + 新增互操作门；feature 仍 10 条。
>
> **权威顺序（冲突时）：** 用户当前决策 > PRD（`docs/product/KOLMatrix-PRD.md`）与其验收标准 > 交互原型 v2 及落地规范 > 综合架构合并稿（`docs/audits/KOLMatrix-integrated-architecture-design-2026-07-17.md`）> 本 spec。
> **参照物：**
> - **交互契约（权威）：** `docs/product/interaction-prototype-v2.html` + `docs/product/interaction-prototype-v2-落地规范.md`
> - **产品需求：** `docs/product/KOLMatrix-PRD.md`（§7 IA / §8 功能 / §9 编队 / §10 闸门 / §11 数据模型 / §12 技术架构）
> - **工程约束：** 综合架构合并稿（目录/类型/API/迁移/测试细度 + 14 条 D 裁决 + 5 条 ADR）
> - 回归 smoke：`scripts/test/v2-prototype-smoke.js`（57 断言）
> - 旧系统 `kolmatrix`（功能/schema/集成参考，不移植 `src/lib`）· Horizon UI Pro 模板（视觉基座）

---

## 1. 背景与目标

本项目是旧系统 `kolmatrix` 的全面重构。**核心诊断：** 旧系统 AI 基建已覆盖全链路，但每处都被降格为传统 SaaS 界面旁的「副驾/逃生舱」按钮——AI 无处不在，却从不是交互主轴。AI-native 化的本质 = 把已有 AI 从副驾提到主驾。

### 1.1 用户已拍板的重构方向
- **后端全新重建**（以旧 schema/集成为参考，不移植旧 `src/lib`；复用外部基建服务）
- **AI-native 力度 = 激进：对话/Agent 驱动一切**（产品中心 = 常驻 Agent 对话面；工作流页面 = Agent 产出的落地画布）
- **Agent 运行时 = Vercel AI SDK → 指向 aigcgateway**
- **数据 = CSV/seed 先灌真实 KOL**（Apify 采集留后期）
- **单角色**：无 role/scope/权限层/审批链/角色切换器（D26）；保留 `owner` 分工标记（D29）

### 1.2 本批次目标（一句话）
把新 app 从前端-only 升级为全栈，立起 **Agent 驱动架构的四根柱子**（① 工具层 ② Agent 运行时 streamText loop ③ 常驻对话面 useChat ④ generative canvas）+ **成品级多 Agent 编排框架**（registry + persona router + handoff + orchestrator，⑥ 编队运行时=柱二内的调度视图）+ **AI→人闸门地基**，并用一个真实的 **"hello-agent"**（自然语言 → Agent 调 `search_kols` → KOL 卡片流在画布渲染 + 多人格路由 + 一次 handoff）端到端证明闭环。**先把多 Agent 架构框架搭成品 + 证明闭环，再往骨架上按业务挂领域能力（子 agent/工具/MCP 按需扩展）。**

---

## 2. 功能范围

**In scope：**
- TS5 微批迁移 + 运行时版本锁定（AI SDK v5 前置，D2/ADR-008）
- 全栈化（Prisma + 本地 docker Postgres + pgvector）+ 核心 schema（Tenant/User 单 dev 用户/Kol + D15 字段契约位 nullable）
- 运行时表：PendingAction（闸门最小态）+ OperationLog（append-only 留痕）+ Handoff（编排交接落点）
- aigcgateway ⇄ Vercel AI SDK provider（chat tool-calling + bge-m3 embeddings）
- ~2500 条真实 KOL seed 灌库 + embedding 入 pgvector（幂等）
- Agent 运行时（流式 loop）+ 唯一工具注册表/执行入口 + 工具二分（internal/outbound）+ 工具来源抽象（native / MCP 扩展点）+ 首批工具（`search_kols`/`get_kol_detail`）
- **多 Agent 编排框架（成品级）：agent registry（7 人格）+ persona router + handoff 协议 + orchestrator 调度骨架 —— 接口/机制焊死、业务语义留扩展点**
- 常驻对话面 + generative canvas 协议 + 否定式护栏（AI 行为边界）+ 多人格切换 + 协同交接可视化
- IA = 驾驶舱 / 项目（五环节唯一容器）/ 游戏 / 洞察（侧栏 4 项）
- AI→人闸门：outbound 服务端强制 403/pending + harm 单一 zod + 留痕 + 变异测试
- **对外机器友好契约地基（D-INTEROP，薄预留）：核心实体稳定标识 + 领域/传输解耦 + provenance 作对外可信层 —— 为 GEO / 外部 agent 友好留插座，不实装对外暴露**
- 端到端 hello-agent + 架构文档 + visual baseline

**Out of scope（明确不做，留后续批次）：**
- 真实认证登录（本批单租户硬编码 dev tenant，无密码）· 多租户 RLS（→ M5）
- 领域页面的真实业务实现（Brief/Match/Reach/Delivery/Insight 环节能力 → M1–M4）
- 知识库解析与抽取（→ M1；本批仅预留 schema 位）
- 组合态方案构建算法（→ M2）· 第三方评估 API（数据层，→ M5；本批仅字段契约位 nullable）
- 闸门完整可靠投递（OutboundAttempt / reconciliation / PendingAction 完整 7 态 → M3）
- 主动式任务与 Signal（JobRun/lease/outbox → M4）
- 全栈生产部署改造 · Apify 实时采集 · 健康检查/RLS（→ M5）

---

## 3. 关键设计决策（单角色权威层）

> 三角色决策（D9–D14 的角色部分、D18、D23、D24）已随 D26–D29 作废，不在此列。凡带 `lead/bd/finance`/`scope`/`Approval`/`allowedRoles`/`copilotScope`/审批链/退回/阈值分级/角色切换器 字样均属作废层，本 spec 与实现不得引用。

| # | 决策 | 依据 |
|---|---|---|
| **D1** | 全栈化在**同一个 Next.js app 内**；后端 = Route Handlers + Server Actions + `src/lib` | 单全栈 app 最简 |
| **D2** | Agent 运行时 = Vercel AI SDK；模型出口 = aigcgateway（OpenAI 兼容 baseURL）。**AI SDK v5 前必须完成 TS5 迁移**（ADR-008） | 用户决定 + 现仓库仍 TS4.9 |
| **D3** | pgvector 用**自定义 SQL migration**（`CREATE EXTENSION IF NOT EXISTS vector`），不依赖 Prisma `postgresqlExtensions` 预览开关 | 迁移由仓库显式控制，避开弃用预览 |
| **D4** | **单租户**（硬编码 dev tenant，schema 保留 `tenantId` 占位）；真实认证/RLS 留 M5 | 地基聚焦 Agent + 闸门 |
| **D5** | 交互范式 = 常驻 Agent 对话面 + generative canvas；传统表单/表格为兜底 | 用户选「激进 Agent 驱动」 |
| **D6** | dev 用本地 docker Postgres + pgvector；prod 部署改造留后期 | 控制批次范围 |
| **D7** | 车道 = 快车道；building **串行**；verifying **单隔离 evaluator subagent** | 地基是整体交付物 |
| **D8** | 复用外部基建（aigcgateway / pgvector / Resend / Apify）；旧 `src/lib` 仅作参考 | 「全新重建」= 重建 app 层 |
| **D13**（升级版） | **否定式护栏 = AI 行为边界**：Agent 系统提示含「我不会做什么」；语义从「角色数据边界」升级为「AI 不越自己的行为边界」 | 信任靠声明「没做什么」建立，比肯定式更难伪造 |
| **D15** | **Kol schema 预留数据层字段契约位**（`audienceDemo`/`credibility`/`brandSafety`/`dataSource`/`fieldProvenance`），本批 **nullable 不填充** | 字段契约让数据层与应用层解耦 |
| **D20**（工程纪律） | **断言必须验行为，不得验源码关键字**；守卫/闸门/状态机类修复须配变异测试（退回原状则断言变红） | 「会撒谎的测试比没有测试更糟」 |
| **D21/D22** | **项目是空间、环节是时间**：侧栏 4 项，五环节只存在于项目空间内部，`stagePanel` 是环节唯一渲染入口 | 上手校准推翻跨项目环节页 |
| **D26** | **单角色推进全流程**：无 role/scope/权限四层/审批链/角色切换器 | 中小团队定位，无组织分工可分 |
| **D27** | **删【人→人】审批，留【AI→人】闸门**：对外/不可逆/花钱动作 AI 只能「备好等你按」；**internal 动作不设闸门**（反假闸门） | 拆掉角色后闸门反而更纯粹 |
| **D28** | **删阈值**（$8,000/$2,000/10 封）：所有 outbound 一律一次确认；但闸门必须**如实说明利害** | 没有上级可批，阈值失去语义；「那只是不撒谎」 |
| **D29** | 保留 `owner` 标记（`你/Sarah/Kenji`）——**是分工不是权限** | 中小团队要知道「这个谁在跟」，免得重复触达 |

### 3.1 工具二分（闸门的技术基础，取代作废的 allowedRoles）
工具注册表声明 `class` 字段。判定只问一个问题：执行后**能不能撤销、会不会对外、要不要花钱/承诺**——三者任一为「是」→ `outbound`，否则 `internal`。

- **internal**（AI 直接执行，无确认框）：`search_kols`/评估/匹配/起草/选组合/推翻规则/复核审核项/采纳复盘
- **outbound**（服务端强制停在确认前）：发信/批量发/报价/分发 key/放款/对外分享

权威模型见 PRD §10；六类 outbound 清单见 PRD §10.3。

### 3.2 多 Agent 编排框架的分寸（本批新增，用户立意 2026-07-17）

**决策 D-ORCH：M0 交付成品级多 Agent 编排框架，子 agent / 工具 / MCP 后期按业务扩展。**

编队运行时是**四柱之上的调度视图、非独立第五柱**，落点在柱二 Agent 运行时内以人格路由 + 工具子集实现（PRD §12.6 blockquote / 架构稿 D6：Agent 是配置与运行时 registry，不是进程）。M0 把这个框架的**接口 + 机制 + 扩展点**一次做扎实，用最小内容跑通验证。

**⚠️ 焊死 / 留扩展点边界（核心纪律）：**

| 维度 | M0 处理 |
|---|---|
| registry 结构 · persona router 机制 · handoff 信封格式 · orchestrator 环节路由与聚合接口 · executeTool 入口 · context key | **焊死且稳定**（不依赖业务形态） |
| handoff 具体载荷 · orchestrator 聚合排序规则 · 各人格职责精度 · compliance 调用点 | **最小实现 + 代码注释标 `EXTENSION POINT`**，随 M1–M4 业务真实形态充实，**本批不预测焊死** |
| MCP 接入 | 工具来源抽象预留 `source: native|mcp`，**本批不实装 MCP client**（无真实 MCP 需求，避免零业务设计） |

**为什么守这条边界：** 本项目已两次 IA 反转（D21–D24）+ 三角色体系作废（D26–D29），同根教训是「零验证时把抽象设计完美 → 大概率猜错 → 框架被依赖越深返工越贵」。架构稿 ADR-001 亦定「按真实需求演进，不预先过度架构」。「框架成品」= 稳定接口 + 跑通机制 + 充足扩展点，**不等于**预测所有未来业务的完整实现。

**最小跑通验证（框架的验收证据，非填内容）：** ≥2 真实人格按 route 切换（各自工具子集不同）+ 演示一次 handoff 机制 + orchestrator 路由到某项目某环节 —— 如同 hello-agent 证明单 agent 闭环。

### 3.3 对外互操作性地基（本批新增，用户立意 2026-07-17）

**决策 D-INTEROP：M0 为「对外机器友好」留一层薄地基（接口 + 抽象），不实装任何对外暴露。**

覆盖两个诉求 —— **GEO（生成式引擎优化 / AI 可见性）** + **对外部 agent 友好**。二者在地基层面收敛为同一层「machine-facing 契约」：核心实体与能力具备**稳定标识 + 结构化 schema + provenance**，且**领域逻辑与传输入口解耦**。做好这层，未来「包一层 MCP server 给外部 agent」或「生成 AI 引擎友好的对外内容」都只是加适配层、不动地基。

现成红利：GEO 时代 AI 引擎最看重「有出处、可信」的内容 —— 正是已有的 `dataSource`/`fieldProvenance`（D15），provenance 层不新建，只在设计对外契约时一并带出。

**⚠️ 焊死 / 留扩展点边界（同 §3.2 纪律）：**

| 维度 | M0 处理 |
|---|---|
| 核心实体稳定对外标识（public id / slug）· 领域能力与传输入口解耦（executeTool 不假设调用方是内部 useChat）· 对外内容契约一律带 provenance | **焊死且稳定** |
| agent-facing 出口适配层（MCP server / agent API）· GEO 对外内容具体字段（摘要/关键词/语义标签）· JSON-LD/语义结构实装 | **留 `EXTENSION POINT`，本批不实装、不猜字段** |

**为什么只做薄地基：** GEO 本体（内容优化 / AI 可见度监测 / 对外可发现表面）依赖真实对外内容产出 + 对外暴露；外部 agent 对外暴露依赖真实外部消费方 + 认证/多租户/rate-limit。M0 零内容零暴露时做本体 = 零业务过度设计（同两次 IA 反转 / 三角色作废教训，ADR-001）。**「插座」留在 M0，「电器」等有真实对象时才装。**

**后期落点：** 外部 agent 对外暴露（MCP server / agent API）→ M5 生产硬化；GEO 内容本体 → M4 Insight 对外分享 / M5 对外可发现表面。

---

## 4. Feature 明细

> 全部 `executor: generator`。commit tag `feat(AGENT-FOUNDATION-F00N): ...`（铁律 10）。**串行实现** F001→…→F009。以下为实现契约；acceptance 权威副本在 `features.json`（写入后以两者一致为准，冲突时以 features.json 为准并回填本文）。

### F001 — TypeScript 5 微批迁移 + 版本锁定（priority: high）
现仓库 TS 4.9.4 / target es2016 / strict:false。升 typescript 5.x + tsconfig 现代化（target ≥ES2020、strict 打开或列豁免清单）+ 修 Horizon scaffold 升级引发的类型错误 + 锁定 next/react/typescript 版本提交 lockfile。**必须先于 F003**（AI SDK v5 需 TS5，D2/ADR-008），不在旧编译器上并行新类型能力。

**Acceptance：** `tsc --noEmit` + `build` + `lint` 全绿；lockfile 提交；typescript 主版本为 5。

### F002 — 全栈化 + DB/pgvector + schema（单角色）+ 运行时表（闸门 + 交接）（priority: high）
Prisma + 本地 docker Postgres + pgvector；schema：
- `Tenant`（占位）/ `User`（单 dev 用户，**无 role/scope**）
- `Kol`（`embedding vector(1024)` + 核心字段 + **D15 字段契约位 nullable**）
- 业务实体带 **`owner` 标记（String? = Leo/Ada/Kai，D29，非权限非枚举）**
- **`PendingAction`**（最小态）：`id / tenantId / kind / toolName / payloadHash / harmJson / status(pending|confirmed|executed) / confirmationTokenHash / expiresAt / createdAt`
- **`OperationLog`**（append-only，只 INSERT）：`id / tenantId / kind(auto|gate|block|irrev) / actor / summary / ref / createdAt`
- **`Handoff`**（编排交接落点，架构稿 §5.4）：`id / tenantId / projectId / fromAgent / toAgent / artifactType / artifactRef / summary / messagesJson / createdAt`

**Acceptance：**
- [ ] `prisma migrate` 成功；pgvector 经**自定义 SQL migration** `CREATE EXTENSION IF NOT EXISTS vector`（不用预览开关，D3）；`Kol.embedding` 为 `vector(1024)`
- [ ] `Kol` D15 字段契约位存在且 nullable
- [ ] `PendingAction`（三态）+ `OperationLog`（append-only）+ `Handoff` 三张运行时表存在
- [ ] 无 `User.role`/`scope`、无 `Approval` 表
- [ ] **（D-INTEROP）核心实体（Kol/Game/Project/对外可分享产物）带稳定对外标识（public id / slug）**；schema 字段组织为可映射语义结构（留位，不实装 JSON-LD/不猜 GEO 字段）
- [ ] `docker-compose.dev.yml` 起本地 postgres+pgvector；`.env.example` 加 `DATABASE_URL`（无明文密钥）
- [ ] `build` + `tsc --noEmit` + `lint` 绿

### F003 — aigcgateway ⇄ Vercel AI SDK provider（priority: high）
`src/lib/ai/gateway.ts`：自定义 `baseURL` 指向 aigcgateway OpenAI 兼容端点；chat（tool-calling）+ embedding（bge-m3）双链路；成本/错误处理骨架。

**Acceptance：**
- [ ] `scripts/test/ai-gateway-smoke.ts`：经网关完成 1 次 chat（含 tool-call 触发）+ 1 次 bge-m3 embedding
- [ ] 密钥走 env（`AIGCGATEWAY_BASE_URL`/`AIGCGATEWAY_API_KEY`），无硬编码
- [ ] 失败有清晰错误（不静默吞）

### F004 — CSV seed 灌 ~2500 真实 KOL + embedding（单 dev 用户）（priority: high）
拷入 `kol-seed-enriched-final.csv` 并入 git；`scripts/seed/import-kol-csv.ts` 解析（BOM/列名别名/空值/货币格式）→ 规范化 → 批量入库；用 F003 链路生成 bge-m3 向量入 pgvector；seed 1 个 dev 用户。

**Acceptance：**
- [ ] seed CSV 入 git（可复现）
- [ ] DB ≥2000 条真实 KOL，`embedding` 非空
- [ ] cosine（`<=>`）查询对 NL query 返回相关 top-K
- [ ] seed 1 个 dev 用户
- [ ] 脚本幂等（`(tenantId, canonicalHandle)` upsert）；脏 CSV 校验失败返回非零退出码

### F005 — Agent 运行时 + 唯一工具注册表/执行入口 + 工具二分（priority: high）
柱一（工具层）+ 柱二（Agent 运行时）本体。`src/app/api/agent/route.ts`：Vercel AI SDK streamText 流式 loop（单轮 `maxSteps` 上限，超时/错误清晰不静默）；`src/lib/agent/tools/` **唯一注册表 + 唯一执行入口 `executeTool`**（禁止 `runTool`/`executeTool` 双语义并存）；每工具声明 `class: internal|outbound` + **`source: native|mcp`**（工具来源抽象，`native` 本批实装，`mcp` 为已规划扩展点：注册表结构支持 MCP 桥接但**本批不实装 MCP client**，无真实 MCP 需求）；实装 `search_kols`（NL→embedding→pgvector top-K）、`get_kol_detail`（均 internal）。**人格路由/编排在 F006 实现。**

**Acceptance：**
- [ ] POST NL 到 `/api/agent` → 调 `search_kols` → 流式返回工具结果 + 文本
- [ ] 工具 IO 用 zod 校验
- [ ] 工具注册表声明 `class` + `source`；执行入口按 `class` 分流（outbound 的服务端强制拦截由 F009 落地）
- [ ] 注册表可扩展（加工具不改 route 核心；MCP 桥接扩展点就位但不实装）
- [ ] **（D-INTEROP）`executeTool` 与传输入口解耦**：不假设调用方一定是内部 `useChat`/`/api/agent`，为未来 agent-facing 出口适配层（MCP server / agent API）留接口——**本批不实装对外暴露**

### F006 — 多 Agent 编排框架：registry + persona router + handoff + orchestrator 骨架（priority: high）⭐本批核心新增
把「多 Agent 编排」提前为成品级框架（用户立意，见 §3.2 D-ORCH）。编队运行时是四柱之上的调度视图、非独立第五柱，落点在柱二运行时内（PRD §12.6）。

- **Agent registry**（`src/lib/agent/registry.ts`）：以 PRD §9.2 编队名册为权威，声明 7 个 `AgentId`（orchestrator/strategy/match/reach/delivery/insight/compliance）的人格 = system prompt + duty + iso 护栏 + 工具子集 + 界面语法。加 agent = 加一条，不改 route 核心（FR-12.12）
- **Persona router**：按 copilot context（`route`+`env`+`agentId`）选人格并收窄工具子集，注入 F005 的 streamText runtime（单一 `/api/agent` 承载所有专家，不起独立进程，FR-12.1）
- **Handoff 协议**：以架构稿 §5.4 信封格式创建/传递/接收，接收方按自身 scope 重读、不信任发送方结论；落 F002 `Handoff` 表
- **Orchestrator 调度骨架**：环节路由（→「某项目某环节」`enter:`/`pick:`/`env:`）+ pending 聚合接口（不改写/软化专家结论，FR-9.6）

**Acceptance：**
- [ ] registry 声明 7 人格（人格 + 工具子集绑定 + 护栏）；persona router 按 context 选人格 + 收窄工具集
- [ ] **框架焊死 / 语义留扩展点（§3.2 边界）**：registry 结构 / router 机制 / handoff 信封 / orchestrator 接口焊死；handoff 载荷 / 聚合规则 / 人格职责精度 / compliance 调用点 = 最小实现 + 注释标 `EXTENSION POINT`，本批不焊死
- [ ] **最小跑通验证**：≥2 真实人格按 route 切换（各自工具子集不同）+ 演示一次 handoff 机制（信封创建→接收方重读，落 `Handoff` 表）+ orchestrator 路由到某项目某环节
- [ ] MCP：工具来源抽象已就位（F005 `source`），本批不实装 MCP client

### F007 — 常驻对话面 + Generative Canvas + 多人格切换 + 协同交接可视化（priority: high）
柱三（对话面）+ 柱四（canvas）。Horizon 外壳加常驻对话面板（`useChat` 接 `/api/agent`）；canvas 协议：工具结果 `type` → React 组件（`canvas-registry.tsx`）；`search_kols` → KOL 卡片流。消费 F006 编排框架。

**Acceptance：**
- [ ] 浏览器：对话面打字「找 XX KOL」→ 流式回复 + KOL 卡片流渲染（真实 seed 数据）
- [ ] canvas 协议：新结果类型加一个组件即可渲染
- [ ] 对话面顶部常驻显示当前专家 duty + 否定式护栏（AI 行为边界）
- [ ] **多人格切换**：进不同 route 自动切专家人格（≥2 人格可见切换）；`route`+`env`+`agentId` key 变化 → 对话清空 + 新专家开场白（FR-12.4，**非「切角色清空」**）
- [ ] **协同交接可视化**：能以「A→B」呈现 F006 演示的那次 handoff（可展开看交接对/摘要/交接物，FR-9.5）
- [ ] 浅色；console 无 error；忠实 Horizon 视觉

### F008 — IA：侧栏 4 项 + 项目空间是五环节唯一容器（priority: high）
路由 = 驾驶舱 / 项目 / 游戏 / 洞察（侧栏 4 项，D21）；五环节工作台（Brief·Match·Reach·Delivery·Insight）只在项目空间内部（D22）；`stagePanel` 是环节唯一渲染入口；驾驶舱待办直达「某项目的某环节」（复用 F006 orchestrator 环节路由）。**无角色切换器、无路由层权限守卫**（随三角色作废）。

**Acceptance：**
- [ ] 侧栏 4 项；五环节在项目空间内部，无跨项目环节顶级入口
- [ ] 驾驶舱待办可直达「某项目某环节」
- [ ] 各路由有真实占位页，无死链报错

### F009 — AI→人闸门：outbound 服务端强制 + harm + 留痕 + 变异测试（priority: high）
outbound 工具服务端门控（PRD §10.4）：运行时执行前检查 `class`；outbound 且无服务端签发确认令牌 → 不执行副作用、返回 403/pending + harm 结构体；渲染成待确认动作卡；真正执行只发生在操盘手显式确认后携令牌重发。**模型自主 loop（含 F006 任一专家人格）永远拿不到令牌，无法自我放行。**

**Acceptance：**
- [ ] **G1 服务端强制**：直调 API 触发 outbound（send/payout/报价/分发 key/对外分享），未经人确认返回 403 或 pending，不得由 Agent 直接执行
- [ ] **G2 harm 如实披露**：harm 单一 zod schema（动作/对象/金额或数量/不可逆/证据/过期）；确认卡列全部利害（批量列全名单不折叠、报价标金额、放款标收款方），统一带「对外·不可撤销」
- [ ] **G3 internal 不加闸门**：internal 动作（选组合/推翻规则/复核/采纳复盘/搜索/评估/匹配/起草）不弹确认框
- [ ] **G4 无阈值分级**：所有 outbound 一律一次确认，无 $8,000/$2,000/10 封（D28）
- [ ] **G5 留痕**：确认令牌只存 hash + 短 TTL + 单次 + 绑 payloadHash；确认/拒绝追加 OperationLog；outbound 执行后自动写 `kind:irrev`（同事务，可查可筛）
- [ ] **变异测试（D20 硬性）**：把拦截退回原状（允许直接执行 outbound），G1 断言必须变红；未变红视为无效断言

### F010 — 端到端 hello-agent（多 Agent 编排）+ 架构文档 + visual baseline（priority: medium）
串起 F001–F009 的 e2e demo；`docs/dev/agent-architecture.md`（四柱 + 多 Agent 编排框架 + AI→人闸门 + 数据流 + how-to）；visual baseline。

**Acceptance：**
- [ ] e2e：浏览器 NL →`/api/agent` 流式 → `search_kols` → KOL 卡片流渲染，闭环无 error；**并演示多 Agent 编排最小闭环（≥2 人格按 route 切换 + 一次可视化 handoff）**
- [ ] `docs/dev/agent-architecture.md` 落盘，含四柱 + **多 Agent 编排框架（registry/router/handoff/orchestrator + 焊死 vs 扩展点边界）** + AI→人闸门 + 数据流 + 「如何加一个新专家人格/新工具/新 canvas 组件」how-to
- [ ] visual baseline `tests/screenshots/baseline/agent-canvas-*.png` 入 git（浅色 ≥1440px，CI/linux 重生）
- [ ] README/CLAUDE.md 更新技术栈（DB/Prisma/pgvector/Vercel AI SDK/aigcgateway/单角色+多 Agent 编排+AI→人闸门）

---

## 5. 车道与编排（⭐ 逐 feature 验收，2026-07-17 用户定）

- **车道：** 快车道（单机 Andy）。
- **building：** **串行**（F001→…→F010；严格依赖链 + 共享 scaffold）。依赖：F001(TS5) → F002(schema+闸门/交接表) → F003(gateway) → F004(seed，需 F002+F003) → F005(runtime 本体，需 F002+F003) → F006(编排框架，需 F005+F002 Handoff 表) → F007(对话面，需 F006) → F008(IA 外壳) → F009(闸门，需 F002 表+F005 执行入口) → F010(整合)。

- **⭐ 逐 feature 验收闸门（本批核心编排，取代批次末一次性 verifying）：** 每完成一个 feature 就停下走一个小循环，**通过才开工下一个**：
  1. **Generator（主上下文）** 实现该 feature + 自测能跑 + `commit`（该条 `features.json.status` 置 building→（待验））
  2. **隔离 evaluator subagent** 按**该 feature 的 acceptance** 独立验收（fresh context，只看代码 + 运行输出 + 浏览器实测/脚本，不听实现叙述；无自评铁律），逐条评 PASS/FAIL + 出证据，**结论原样落盘**（编排者不得改写/软化）
  3. **编排者** 把 evaluator 结论 + 可见成果（命令行输出 / 截图 / 浏览器 demo）呈现给用户
  4. **用户拍板：** evaluator PASS 且用户确认 → 该条 `status: done`，开工下一 feature；evaluator FAIL 或用户打回 → 当前 feature `fixing` → 该 feature `reverifying`，通过才继续
  5. 循环至 F010

- **验收形态预期（用户已知悉）：** F001–F005 多为命令行/脚本证据（F001=`tsc/build/lint` 绿；F002=`migrate`+表结构；F003=网关 smoke；F004=数据+向量查询；F005=`curl` API）；**F006 起才有浏览器可交互成果**。

- **批次末整体回归：** F010 通过后，隔离 evaluator 再做一次全链路回归（e2e + §6 全部门），出批次 signoff 落 `docs/test-reports/`。

- **progress.json 状态：** 顶层 `status` 在 building（Generator 主导）与 verifying/fixing（当前 feature 隔离验收/修复）间按**当前 feature** 流转；`features.json` 逐条 `status` 追踪进度。**每个 feature 的实现与其隔离验收不得在同一上下文**（无自评铁律）。

## 6. 验收总纲（Evaluator 参考）

> **逐 feature 验收（§5）：** 以下各门**分散到相关 feature 的验收时按其 acceptance 检查**（如构建门每个 feature 都过；数据门在 F002/F004；AI 门在 F003；Agent/编排门在 F005/F006；交互门在 F007；闸门/互操作门在 F009/F002/F005）；F010 通过后做一次**整体回归**把全部门再过一遍，出 signoff。

- **构建门：** `npm install` → `build` → `tsc --noEmit` → `lint` 全过（TS5）
- **数据门：** docker postgres+pgvector 起；`prisma migrate` + 自定义 `CREATE EXTENSION vector`；seed → DB ≥2000 KOL 含非空 embedding + 1 dev 用户；cosine 查询返回相关结果；幂等
- **AI 门：** smoke 脚本经 aigcgateway 完成 chat(tool-call) + bge-m3 embedding
- **Agent 门：** POST NL → `/api/agent` 流式 → `search_kols` 触发返回；工具 class 二分生效
- ⭐ **编排门（本批新增，硬性）：** registry 声明 7 人格；persona router 按 route 切人格（≥2 可见）+ 收窄工具子集；一次 handoff 机制跑通并落 `Handoff` 表；orchestrator 路由到某项目某环节；**框架接口/机制焊死、业务语义留 `EXTENSION POINT`（抽查代码注释）**；MCP 抽象就位但未实装
- **交互门：** 浏览器对话面打字 → KOL 卡片流渲染 + 多人格切换可见 + 协同交接区可展开，console 无 error，浅色，忠实 Horizon
- **互操作门（D-INTEROP，本批新增）：** 核心实体有稳定对外标识；`executeTool` 与传输入口解耦（抽查：能设想被 MCP server 适配层复用而不改领域逻辑）；对外内容契约带 provenance；**抽查代码注释 `EXTENSION POINT`——本批未实装任何对外暴露 / GEO 内容本体**
- ⭐ **闸门门（硬性）：** G1 服务端强制 403/pending · G2 harm 如实披露 · G3 internal 不加闸门 · G4 无阈值 · G5 留痕；**变异测试有效（退回拦截 → G1 变红）**
- **IA 门：** 侧栏 4 项；五环节在项目空间内部；无角色切换器/权限守卫；无死链
- **视觉门：** 忠实 Horizon；baseline 入库
- **密钥门：** 无硬编码密钥；走 env；`.env.example` 无明文
- signoff 落 `docs/test-reports/AGENT-FOUNDATION-signoff-YYYY-MM-DD.md`

## 7. 已知下游（不在本批）
- **编排框架的内容层**（框架本身在 F006 已成品）：各专家人格职责实现 · 真实 handoff 链（匹配→触达→交付→洞察）· orchestrator 真实聚合排序规则 · compliance 跨环节调用点 · MCP client 实装 —— 随 M1–M4 业务真实形态按需充实（§3.2 EXTENSION POINT）
- **对外互操作性本体**（地基在 F002/F005 已留插座，§3.3 D-INTEROP）：外部 agent 对外暴露（MCP server / agent API + 认证/多租户/rate-limit）→ M5；GEO 内容本体（内容优化 / AI 可见度监测 / 对外可发现表面）→ M4 Insight 对外分享 / M5
- 真实认证登录 / 多租户 RLS / 健康检查（→ M5 PROD-HARDENING）
- 领域环节能力：Brief（→ M1）· Match/组合态/评估面板（→ M2）· Reach+CRM/Delivery（→ M3）· Insight+ROI（→ M4）
- 闸门完整可靠投递：OutboundAttempt / reconciliation / PendingAction 完整 7 态（→ M3）
- 主动式任务与 Signal：JobRun/lease/outbox（→ M4）
- 知识库真解析抽取（→ M1）· 第三方评估 API 数据层填真值（→ M5）· Apify 实时采集（→ M5）
- 六页真页面落地（真组件 + mock）（→ M0.5 WORKBENCH-UI）
