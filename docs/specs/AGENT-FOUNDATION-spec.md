# AGENT-FOUNDATION — Agent 驱动架构地基规格

> **批次 ID：** AGENT-FOUNDATION
> **类型：** 新功能批次（架构地基） — 硬性要求 spec
> **状态机流转：** planning → building → verifying → fixing ⟷ reverifying → done
> **Spec lock：** 2026-07-14，Planner Andy，用户 plan-mode 批准
> **参照物：** 旧系统 `kolmatrix`（本地克隆只读，功能/schema/集成参考）；Horizon UI Pro 模板（视觉基座，已 gitignore）

---

## 1. 背景与目标

本项目是旧系统 `kolmatrix` 的全面重构。旧系统是成熟 MVP：~22 张 Prisma 表、Postgres+pgvector+RLS、生产级 AI 网关（aigcgateway），且**早已重构成工作流 IA**（Brief→Campaigns→Match→Reach→Insight）。

**核心诊断（重构的真正动因）：** 旧系统 AI 基建已覆盖发现/匹配/解释/撰写/报告全链路，但每一处都被降格为传统 SaaS 界面旁的"副驾/逃生舱"按钮——**AI 无处不在，却从不是交互主轴**。687 行的 15 维手填筛选侧栏才是 Match 页的真正入口；自然语言 Brief 解析器的代码注释直接自称 "escape hatch"。

**AI-native 化的本质不是"补 AI 能力"，而是"把已有的 AI 从副驾提到主驾"。** 问题主要在 UX/IA 层，不在后端能力。

新系统 `newkolmatrix` 目前只有前端地基（Horizon 外壳 + 设计系统 + CI/CD），**无后端 / DB / 认证**，且当前 IA（Discovery/Database/Campaigns/Outreach）恰是旧系统**已退役的旧工具模块 IA**。

### 用户已拍板的重构方向（本批次据此设计）
- **后端全新重建**（以旧 schema/集成为参考，不移植旧 `src/lib`；复用外部基建服务）
- **AI-native 力度 = 更激进：对话/Agent 驱动一切**（产品中心 = 常驻 Agent 对话面；工作流页面 = Agent 工作的落地画布 / generative UI）
- **首个垂直切片 = Brief→Campaigns**（下一批次；本批次是它的地基）
- **Agent 运行时 = Vercel AI SDK → 指向 aigcgateway**
- **数据 = CSV/seed 先灌真实 KOL**（Apify 采集留后期）

### 本批次目标（一句话）
把新 app 从前端-only 升级为全栈，立起 **Agent 驱动架构的四根柱子**（工具层 / Agent 运行时 / 常驻对话面 / generative canvas 协议），并用一个真实的 **"hello-agent"**（自然语言 → Agent 调 `search_kols` → KOL 卡片流在画布渲染）端到端证明闭环——对标 DS-FOUNDATION 之于设计系统。**先证明 Agent 闭环，再往骨架上挂领域能力。**

---

## 2. 功能范围

**In scope：**
- 全栈化（Prisma + 本地 docker Postgres + pgvector）+ 核心 schema 初版（Tenant/User/Kol）
- aigcgateway ⇄ Vercel AI SDK provider 封装（chat tool-calling + embeddings 双链路）
- ~2500 条真实 KOL seed 灌库 + bge-m3 embedding 入 pgvector
- Agent 运行时（流式 loop）+ 工具注册表 + 首批工具（search_kols / get_kol_detail）
- 常驻 Agent 对话面 + generative canvas 协议（工具结果→React 组件）
- IA 重排为工作流 5 项（Brief/Campaigns/Match/Reach/Insight）+ 占位页
- 端到端 hello-agent + 架构文档 + visual baseline

**Out of scope（明确不做，留后续批次）：**
- 真实认证 / 多租户 RLS（本批单租户，硬编码 dev tenant）
- 全栈生产部署改造（当前 CICD-VPS 前端-only，本批不动部署）
- Apify 实时采集管道（Phase 5）
- Brief→Campaigns 及其它领域页面的真实实现（Phase 1+）
- 任何领域业务逻辑（campaign/email/roi/report 等工具，后续批次逐个挂上）

---

## 3. 关键设计决策

| # | 决策 | 依据 |
|---|---|---|
| D1 | 全栈化在**同一个 newkolmatrix Next.js app 内**（不拆独立后端服务）；后端 = Route Handlers + Server Actions + `src/lib` 领域层 | 单全栈 app 最简，符合"全新重建"且便于 Vercel AI SDK 流式 |
| D2 | Agent 运行时 = **Vercel AI SDK**；模型出口 = **aigcgateway**（OpenAI 兼容 `baseURL`）；chat(tool-calling) + embeddings 双链路 | 用户决定；Next.js generative UI 人体工学 + 复用成本治理网关 |
| D3 | KOL 数据 = 移植旧仓库 `docs/kol-seed-enriched-final.csv`（**~2524 条真实 KOL**：平台/昵称/频道链接/地区/粉丝数/是否游戏/类目/AI 理由）；embedding 用 **bge-m3** 经 aigcgateway 生成入 pgvector | 现成真实数据，无需 DB 访问权；embedding 早期就验证语义层 |
| D4 | Phase 0 **单租户**（硬编码 dev tenant，schema 保留 `tenantId` 占位）；真实认证 / RLS 留后期批次 | 地基聚焦 Agent 架构，不被认证/多租户拖累 |
| D5 | 交互范式 = **常驻 Agent 对话面 + generative canvas**（工具结果→React 组件映射协议）；传统表单/表格为兜底 | 用户选"激进 Agent 驱动" |
| D6 | dev 用**本地 docker Postgres + pgvector**；prod DB 接入 + 全栈部署改造留后期 | 控制批次范围；部署改造是独立关注点 |
| D7 | 车道 = 快车道；building **串行**；verifying **单隔离 evaluator subagent** | 地基是一个整体交付物 |
| D8 | 复用外部基建：aigcgateway / pgvector / Resend / Apify fork（infra 非 app）；旧 `src/lib` 仅作**参考**不移植 | "全新重建"= 重建 app 层，不重造 infra |

---

## 4. Feature 明细

> 全部 `executor: generator`。commit tag `feat(AGENT-FOUNDATION-F00N): ...`，须对应本文件 feature 号（铁律 10）。

### F001 — 全栈化 + DB/pgvector 地基 + Prisma schema 初版（priority: high）
把 app 升级为全栈：装 Prisma + 本地 docker Postgres + pgvector 扩展；schema 初版 `Tenant` / `User` / `Kol`（`Kol` 含 `embedding vector(1024)` + 核心字段：platform/handle/name/channelUrl/region/followerCount/isGaming/categories[]/aiReasoning/tenantId）；migration + 本地起库 + `docker-compose.dev.yml`（postgres+pgvector）。

**Acceptance：**
- [ ] `prisma migrate` 成功；`CREATE EXTENSION vector` 生效；`Kol.embedding` 为 `vector(1024)` 列
- [ ] `docker-compose.dev.yml` 起本地 postgres+pgvector；`.env.example` 加 `DATABASE_URL`（无明文密钥）
- [ ] `npm run build` + `tsc --noEmit` + `lint` 绿
- [ ] commit `feat(AGENT-FOUNDATION-F001): ...`

### F002 — aigcgateway ⇄ Vercel AI SDK provider 封装（priority: high）
装 Vercel AI SDK（`ai` + `@ai-sdk/openai`）；封装 `src/lib/ai/gateway.ts`：用自定义 `baseURL` 指向 aigcgateway OpenAI 兼容端点；导出 chat model（支持 tool-calling）+ embedding model（bge-m3）；成本/错误处理骨架（沿用旧系统 cost-cap 思路的最小版）。

**Acceptance：**
- [ ] `scripts/test/ai-gateway-smoke.ts`：经 aigcgateway 完成 1 次 chat（含 tool-call 触发）+ 1 次 embedding，打印结果
- [ ] 模型名/密钥走 env（`AIGCGATEWAY_BASE_URL` / `AIGCGATEWAY_API_KEY`），无硬编码密钥
- [ ] 失败有清晰错误（网关不可达/超时不静默吞）
- [ ] commit `feat(AGENT-FOUNDATION-F002): ...`

### F003 — CSV seed 灌 ~2500 真实 KOL + embedding 入库（priority: high）
把旧仓库 `docs/kol-seed-enriched-final.csv` 拷入新 repo（建议 `scripts/seed/data/`），commit 入库作可复现数据源；写 `scripts/seed/import-kol-csv.ts`：解析 CSV → 规范化 → 批量入 `Kol`；用 F002 的 embedding 链路对每条（name+region+category 文本）生成 bge-m3 向量入 pgvector（批量+去重+降级重试）。

> 源文件路径（本会话 scratchpad 克隆）：`kolmatrix-old/docs/kol-seed-enriched-final.csv`（字段：idx/平台/昵称/频道链接/地区/粉丝数/是否游戏/类目/置信度/AI 判断理由/阶段）。

**Acceptance：**
- [ ] seed CSV 已入 git（可复现）
- [ ] seed 后 DB 有 ≥2000 条真实 KOL，`embedding` 非空
- [ ] 一条 cosine 查询（`<=>`）能对自然语言 query 返回 top-K 相关 KOL
- [ ] seed 脚本幂等（重跑不重复灌）
- [ ] commit `feat(AGENT-FOUNDATION-F003): ...`

### F004 — Agent 运行时 + 工具注册表 + 首批工具（priority: high）
`src/app/api/agent/route.ts`：Vercel AI SDK 流式 agent loop（`streamText` + tools）；`src/lib/agent/tools/` 工具注册表模式；实装 2 个真工具：`search_kols`（自然语言→embedding→pgvector 语义搜索 top-K）、`get_kol_detail`（按 id 取详情）。

**Acceptance：**
- [ ] POST 一段 NL（如"找东南亚手游区 KOL"）到 `/api/agent` → agent 调 `search_kols` → 流式返回工具结果 + 文本
- [ ] 工具输入/输出用 zod schema 校验（系统边界）
- [ ] 工具注册表可扩展（加新工具无需改 route 核心）
- [ ] commit `feat(AGENT-FOUNDATION-F004): ...`

### F005 — 常驻对话面 + Generative Canvas 协议（priority: high）
Horizon 外壳里加**常驻 Agent 对话面板**（右侧抽屉或主区分栏，用 `useChat`）；定义 generative canvas 协议：工具结果 `type` → React 组件映射（`src/lib/agent/canvas-registry.tsx`）；`search_kols` 结果渲染成 **KOL 卡片流**（Horizon `Card` 风格）。

**Acceptance：**
- [ ] 浏览器：对话面打字"找 XX KOL" → 流式回复 + KOL 卡片流在画布渲染（真实 seed 数据）
- [ ] canvas 协议：新工具结果类型加一个组件即可渲染，无需改对话面核心
- [ ] 浅色模式；console 无 error；忠实 Horizon 视觉（Card 阴影 `shadow-3xl` / 圆角 `rounded-[20px]` / DM Sans+Poppins）
- [ ] commit `feat(AGENT-FOUNDATION-F005): ...`

### F006 — IA 重排工作流 5 项 + 占位页 + 对话面全局可达（priority: medium-high）
`src/routes.tsx` 从旧 IA → **Brief / Campaigns / Match / Reach / Insight**（沿用旧系统已验证的工作流心智）；各路由真实占位页（非幽灵，标 coming-soon）；常驻对话面在所有工作流页可用；删除旧 Discovery/Database/Outreach 桩。

**Acceptance：**
- [ ] 侧栏 = Dashboard + Brief/Campaigns/Match/Reach/Insight；旧桩删除
- [ ] 各路由有真实占位页，无死链运行时报错
- [ ] 对话面在每个工作流页全局可达
- [ ] commit `feat(AGENT-FOUNDATION-F006): ...`

### F007 — 端到端 hello-agent 打通 + 架构文档 + visual baseline（priority: medium）
串起 F001-F006 的 e2e demo；架构文档 `docs/dev/agent-architecture.md`（四柱：工具层 / Agent 运行时 / 对话面 / canvas 协议 + 数据流图 + 加新工具的 how-to）；visual baseline 截图入库。

**Acceptance：**
- [ ] `docs/dev/agent-architecture.md` 落盘，讲清架构 + 扩展方式
- [ ] visual baseline `tests/screenshots/baseline/agent-canvas-*.png` 入 git（浅色，≥1440px）
- [ ] README/CLAUDE.md 更新技术栈（加 DB/Prisma/pgvector/Vercel AI SDK/aigcgateway）
- [ ] commit `feat(AGENT-FOUNDATION-F007): ...`

---

## 5. 车道与编排
- **车道：** 快车道（单机 Andy 单会话）。不命中慢车道条件（无跨机器 role_assignments / 非跨多日 / 用户未要求独立实例验收）。
- **building：** **串行**（F001→F002→F003→F004→F005→F006→F007，严格依赖链 + 共享 scaffold，不满足并行三条件）。
- **verifying：** **单个隔离 evaluator subagent**（fresh context，基于实物：DB 实查 + 脚本输出 + 浏览器实截，不依赖实现叙述）。
- **fixing ⟷ reverifying：** 标准循环。

## 6. 验收总纲（Evaluator 参考）
- **构建门：** `npm install` → `build` → `tsc --noEmit` → `lint` 全过
- **数据门：** docker postgres+pgvector 起；`prisma migrate`；seed → DB ≥2000 KOL 含非空 embedding；cosine 查询返回相关结果
- **AI 门：** smoke 脚本经 aigcgateway 完成 chat(tool-call) + embedding
- **Agent 门：** POST NL → `/api/agent` 流式 → `search_kols` 触发返回
- **交互门：** 浏览器对话面打字 → KOL 卡片流在画布渲染，console 无 error
- **IA 门：** 侧栏 5 项工作流 IA；占位页可达；对话面全局
- **视觉门：** 忠实 Horizon；baseline 入库
- **密钥门：** 无硬编码密钥（`git grep` 网关 key/DB 密码为空）
- signoff 落 `docs/test-reports/AGENT-FOUNDATION-signoff-YYYY-MM-DD.md`

## 7. 已知下游（不在本批）
- 真实认证 / 多租户 RLS（后期批次）
- 全栈生产部署改造（当前 CICD-VPS 前端-only；加 Postgres 到 prod 是独立批次）
- Apify 实时采集管道（Phase 5）
- Brief→Campaigns 领域实现（Phase 1，下一批次）
