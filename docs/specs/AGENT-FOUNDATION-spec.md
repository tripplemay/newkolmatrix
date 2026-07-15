# AGENT-FOUNDATION — Agent 驱动架构地基规格

> **批次 ID：** AGENT-FOUNDATION
> **类型：** 新功能批次（架构地基） — 硬性要求 spec
> **状态机流转：** planning → building → verifying → fixing ⟷ reverifying → done
> **Spec lock：** 2026-07-14 初版，用户 plan-mode 批准
> **Spec 修订：** 2026-07-15 **r2 — 纳入角色体系**（用户决策：提前到 Phase 0 实现）。修订时批次未开工（0/7），已退回 planning 走正式修订。
> **参照物：**
> - **交互契约（权威）：** 原型 https://claude.ai/code/artifact/65690439-6541-46cb-afad-c315709b1528 —— 已含角色体系、组合态、知识库、评估面板、交接链。**实现以原型为准；有出入以本 spec 为准。**
> - 回归测试：`scripts/test/prototype-smoke.js`（105 项断言：权限守卫 / 跨项目串台 / 交接链闭环）
> - 旧系统 `kolmatrix`（功能/schema/集成参考）· Horizon UI Pro 模板（视觉基座，已 gitignore）

---

## 1. 背景与目标

本项目是旧系统 `kolmatrix` 的全面重构。**核心诊断：** 旧系统 AI 基建已覆盖全链路，但每一处都被降格为传统 SaaS 界面旁的「副驾/逃生舱」按钮——**AI 无处不在，却从不是交互主轴**。AI-native 化的本质不是「补 AI 能力」，而是「把已有的 AI 从副驾提到主驾」。

### 1.1 用户已拍板的重构方向
- **后端全新重建**（以旧 schema/集成为参考，不移植旧 `src/lib`；复用外部基建服务）
- **AI-native 力度 = 激进：对话/Agent 驱动一切**（产品中心 = 常驻 Agent 对话面；工作流页面 = Agent 产出的落地画布）
- **Agent 运行时 = Vercel AI SDK → 指向 aigcgateway**
- **数据 = CSV/seed 先灌真实 KOL**（Apify 采集留后期）
- **合同/支付走 partner**（电子签 + Stripe escrow；KOLMatrix 不碰资金与税务）
- ⭐ **角色体系提前到 Phase 0 实现**（本次修订的原因，见 §1.2）

### 1.2 为什么角色体系必须在地基里（r2 新增）

**三条独立证据指向同一结论：**

1. **旧系统本来就有角色**：`User.role` 默认 `marketer` + `admin`；`/admin/kol-csv-import`、`/admin/crawler-monitor` 明确「admin role only，不在 marketer 侧栏」。**是我们重构时把它丢了。**
2. **落地页 V7 已经承诺**：「每个节点都有**负责人**和下一动作」「项目成员可以看到每位创作者的当前状态与**负责人**」。
3. **闸门过载的真因是「全压在一个人身上」**：原型曾出现「营销经理自己点放款 $1,800」——现实里那是财务的活。**分角色后每人只剩 1-2 个闸门，且每个都真实。**

**关键洞察：六环节的 owner 交替（lead→bd→lead→bd→bd→lead）本身就是那条责任链 —— 「阶段门 = 交接点」不是修辞，是数据结构。** 这也是我们超过参考原型（有墨公考）的地方：它的缺陷是「交接没有 UI」。

### 1.3 本批次目标（一句话）
把新 app 从前端-only 升级为全栈，立起 **Agent 驱动架构的四根柱子**（工具层 / Agent 运行时 / 常驻对话面 / generative canvas）+ **角色与权限地基**，并用一个真实的 **"hello-agent"**（自然语言 → Agent 调 `search_kols` → KOL 卡片流在画布渲染）端到端证明闭环。**先证明 Agent 闭环 + 权限地基，再往骨架上挂领域能力。**

---

## 2. 功能范围

**In scope：**
- 全栈化（Prisma + 本地 docker Postgres + pgvector）+ 核心 schema（Tenant/User/Kol/**Approval**）
- **角色体系**：3 角色定义 · 导航按 access 过滤 · **权限守卫在路由层** · 闸门归属 · 环节 owner
- **交接链**：提交审批 → 待批 → 批准 / **退回并注明原因** → 修改后重提
- aigcgateway ⇄ Vercel AI SDK provider（chat tool-calling + embeddings）
- ~2500 条真实 KOL seed 灌库 + bge-m3 embedding 入 pgvector
- Agent 运行时（流式）+ 工具注册表（**按角色 gating**）+ 首批工具
- 常驻 Agent 对话面（**含 copilotScope 显示 + 越权拒答 + 否定式护栏**）+ generative canvas 协议
- IA = 驾驶舱 / 项目(六环节) / 环节工作台(Brief·Match·Reach·Delivery·Insight)
- 端到端 hello-agent + 架构文档 + visual baseline

**Out of scope（明确不做，留后续批次）：**
- 真实认证登录（本批：角色切换器直接切，无密码；单租户硬编码 dev tenant）
- 多租户 RLS
- 知识库的解析与抽取（Phase 1；本批仅预留 schema 位）
- 组合态的方案构建算法（Phase 2；本批 `search_kols` 返回候选即可）
- 第三方评估 API 接入（数据层，暂缓；本批仅预留字段契约位）
- 全栈生产部署改造 · Apify 实时采集 · 领域页面实现

---

## 3. 关键设计决策

| # | 决策 | 依据 |
|---|---|---|
| D1 | 全栈化在**同一个 Next.js app 内**；后端 = Route Handlers + Server Actions + `src/lib` | 单全栈 app 最简 |
| D2 | Agent 运行时 = **Vercel AI SDK**；模型出口 = **aigcgateway**（OpenAI 兼容 baseURL） | 用户决定 |
| D3 | KOL 数据 = 旧仓库 `docs/kol-seed-enriched-final.csv`（~2524 条真实 KOL）+ bge-m3 embedding | 现成真实数据 |
| D4 | **单租户**（硬编码 dev tenant，schema 保留 `tenantId` 占位）；真实认证/RLS 留后期 | 地基聚焦 Agent + 角色 |
| D5 | 交互范式 = 常驻 Agent 对话面 + generative canvas；传统表单/表格为兜底 | 用户选「激进 Agent 驱动」 |
| D6 | dev 用本地 docker Postgres + pgvector；prod 部署改造留后期 | 控制批次范围 |
| D7 | 车道 = 快车道；building **串行**；verifying **单隔离 evaluator subagent** | 地基是整体交付物 |
| D8 | 复用外部基建（aigcgateway / pgvector / Resend / Apify）；旧 `src/lib` 仅作参考 | 「全新重建」= 重建 app 层 |
| **D9** ⭐ | **3 角色**：`lead` 营销负责人 · `bd` KOL BD（主力，含内容审核）· `finance` 财务。**区域用 `scope` 字段表达，不开新角色**（避免角色爆炸） | 用户决策；出海游戏 KOL 团队通常 3-5 人 |
| **D10** ⭐ | **权限守卫装在路由层（`renderModule`/服务端 route），不是侧栏的一个 if** | **血的教训**：原型 v9 只在侧栏查权限，财务经画布 `data-goto` 溜进 Match。「写在文件里 vs 装进工具链」 |
| **D11** ⭐ | **六环节每步有 owner，推进权归 owner**：01 lead · 02 bd · 03 **lead**(批组合=花钱) · 04 bd · 05 bd · 06 lead | owner 交替即责任链 |
| **D12** ⭐ | **交接链含退回**：提交 → 待批 → 批准 / **退回并注明原因** → 修改后重提。退回不是拒绝，是把球打回去并说清为什么 | 用户决策；参考原型的缺陷正是「交接没有 UI」 |
| **D13** ⭐ | **否定式护栏 + copilotScope 真拒答**：Agent 系统提示含「我不会做什么」；越权查询必须拒答并给替代路径 | 信任靠声明「没做什么」建立，比肯定式更难伪造 |
| **D14** ⭐ | **闸门阈值量化**：组合预算 > `$8,000` · 报价 > `$2,000` · 批量发信 > `10 人` 需上级批。**闸门要有数字，不能是「高风险」这种形容词** | 参考原型的「退款超过 ¥1,000 需审批」 |
| **D15** | **Kol schema 预留数据层字段契约位**（`audienceDemo`/`credibility`/`brandSafety`/`dataSource`/`fieldProvenance`），本批 **nullable 不填充** | `gap-data-layer.md` §5：字段契约让两层解耦 |

### 3.1 角色定义（实现须与此一致）

| | `lead` 营销负责人 | `bd` KOL BD ⭐主力 | `finance` 财务 |
|---|---|---|---|
| scope | 出海发行 · 全局预算与决策 | 东南亚 · 创作者商务 | 出海发行 · 资金与合同 |
| access | 全 7 项 | 6 项（**无 insight**） | **3 项**（dashboard/campaigns/insight） |
| Agent | 经营决策 Agent | 创作者商务 Agent | 结算核对 Agent |
| copilotScope | 全部项目的预算、组合与 ROI | 你负责项目的创作者与沟通记录（**不含全局预算**） | 授权范围内的合同与交易（**不含创作者联系方式**） |
| 否定式护栏 | 只生成草案；**不替你批预算、不改合同条款、不对外发送** | **只读取你负责的项目**；报价需提交审批；**确认前不发信、不分发 key** | 金额操作全程留痕；**不会自动放款、不改合同、不联系创作者** |
| gates | plan · advance · approve-quote · approve-plan | send · keys · mark-pub · submit-quote · submit-plan | **payout** |
| 待办排序口径 | 按预算影响与阻塞时长 | 按回复时效与合作可能性 | 按资金风险与到期时间 |

---

## 4. Feature 明细

> 全部 `executor: generator`。commit tag `feat(AGENT-FOUNDATION-F00N): ...`（铁律 10）。**串行实现**。

### F001 — 全栈化 + DB/pgvector + schema（含角色与交接单）（priority: high）
装 Prisma + 本地 docker Postgres + pgvector；schema：
- `Tenant` / `User`（**+`role`: lead|bd|finance，+`scope`**）
- `Kol`（`embedding vector(1024)` + 核心字段 + **D15 字段契约位 nullable**）
- **`Approval`**（交接单）：`id / type / campaignId / title / detail / amount / fromRole / toRole / status(pending|approved|returned) / reason / decidedBy / createdAt`
- 业务实体带 `ownerRole`（环节 owner 见 D11，可 config 不入表）

**Acceptance：**
- [ ] `prisma migrate` 成功；`CREATE EXTENSION vector`；`Kol.embedding` 为 `vector(1024)`
- [ ] `User.role` 三值枚举；`Approval` 表含 `status` 三态与 `reason`
- [ ] **D15 字段契约位存在且 nullable**（`audienceDemo`/`credibility`/`brandSafety`/`dataSource`/`fieldProvenance`）
- [ ] `docker-compose.dev.yml` 起本地 postgres+pgvector；`.env.example` 加 `DATABASE_URL`（无明文密钥）
- [ ] `npm run build` + `tsc --noEmit` + `lint` 绿

### F002 — aigcgateway ⇄ Vercel AI SDK provider（priority: high）
`src/lib/ai/gateway.ts`：自定义 `baseURL` 指向 aigcgateway OpenAI 兼容端点；chat（tool-calling）+ embedding（bge-m3）双链路；成本/错误处理骨架。

**Acceptance：**
- [ ] `scripts/test/ai-gateway-smoke.ts`：经网关完成 1 次 chat（含 tool-call 触发）+ 1 次 embedding
- [ ] 密钥走 env（`AIGCGATEWAY_BASE_URL`/`_API_KEY`），无硬编码
- [ ] 失败有清晰错误（不静默吞）

### F003 — CSV seed 灌 ~2500 真实 KOL + embedding（priority: high）
拷入 `kol-seed-enriched-final.csv` 并入 git；`scripts/seed/import-kol-csv.ts` 解析→规范化→批量入库；用 F002 链路生成 bge-m3 向量入 pgvector。**另 seed 3 个 User（每角色 1 个）。**

**Acceptance：**
- [ ] seed CSV 入 git（可复现）
- [ ] DB ≥2000 条真实 KOL，`embedding` 非空
- [ ] cosine（`<=>`）查询对 NL query 返回相关 top-K
- [ ] **3 个角色用户已 seed**
- [ ] 脚本幂等

### F004 — Agent 运行时 + 工具注册表（**按角色 gating**）（priority: high）
`src/app/api/agent/route.ts`：Vercel AI SDK 流式 loop；`src/lib/agent/tools/` 注册表；实装 `search_kols`（NL→embedding→pgvector top-K）、`get_kol_detail`。
**角色化：** 每个工具声明 `allowedRoles`；运行时按当前用户 role 过滤可见工具集；**system prompt 注入该角色的 copilotScope + 否定式护栏（D13）**。

**Acceptance：**
- [ ] POST NL 到 `/api/agent` → 调 `search_kols` → 流式返回工具结果 + 文本
- [ ] 工具 IO 用 zod 校验
- [ ] **工具按 `allowedRoles` 过滤**：以 `finance` 身份请求时，`search_kols` 不在可用工具集内
- [ ] **system prompt 含该角色的否定式护栏原文**
- [ ] 注册表可扩展（加工具不改 route 核心）

### F005 — 常驻对话面 + Generative Canvas + copilotScope（priority: high）
Horizon 外壳加常驻对话面板（`useChat`）；canvas 协议：工具结果 `type` → React 组件（`canvas-registry.tsx`）；`search_kols` → KOL 卡片流。
**角色化：** 对话面常驻显示**当前角色的数据边界 + 否定式护栏**；**越权查询必须拒答并给替代路径**；**切角色时清空对话**（换岗位=换权限，旧对话可能越权）。

**Acceptance：**
- [ ] 浏览器：对话面打字「找 XX KOL」→ 流式回复 + KOL 卡片流渲染（真实 seed 数据）
- [ ] canvas 协议：新结果类型加一个组件即可渲染
- [ ] **对话面顶部常驻显示 copilotScope + 护栏**
- [ ] **越权拒答**：以 `finance` 问「KOL 联系方式」→ 拒答 + 说明边界 + 给替代查询建议
- [ ] **切角色 → 对话清空 + 新角色开场白**
- [ ] 浅色；console 无 error；忠实 Horizon 视觉

### F006 — IA + 角色切换器 + **路由层权限守卫**（priority: high）
`src/routes.tsx` = 驾驶舱 / 项目 / 环节工作台（Brief·Match·Reach·Delivery·Insight）；顶栏角色切换器；导航按 `role.access` 过滤。
**⚠️ D10 硬要求：权限守卫必须在路由层统一执行**，侧栏 / 画布内跳转 / Agent 跳转全走同一道守卫。

**Acceptance：**
- [ ] 侧栏按角色过滤（`finance` 只见 3 项）
- [ ] 角色切换器可切 3 角色，切换后导航/驾驶舱/对话面全变
- [ ] **越权访问被路由层拦截**：以 `finance` 身份从任意入口（含画布内跳转）访问 `match` → 被拦 + 提示，**不得渲染该页**
- [ ] 各路由有真实占位页，无死链报错

### F007 — 端到端 hello-agent + 架构文档 + visual baseline（priority: medium）
串起 F001-F006 的 e2e demo；`docs/dev/agent-architecture.md`（四柱 + **角色与权限模型** + 数据流 + 加新工具 how-to）；visual baseline。

**Acceptance：**
- [ ] `docs/dev/agent-architecture.md` 落盘，含角色/权限/交接链模型
- [ ] visual baseline `tests/screenshots/baseline/agent-canvas-*.png` 入 git（浅色 ≥1440px）
- [ ] README/CLAUDE.md 更新技术栈（DB/Prisma/pgvector/Vercel AI SDK/aigcgateway/角色体系）

### F008 — 闸门归属 + 环节 owner + 交接链（**r2 新增**）（priority: high）
- **闸门归属**：按 §3.1 gates 表。不是本角色的闸门 → 渲染「待 XXX 处理」而非按钮
- **环节 owner（D11）**：推进权归 owner；非 owner 显示「待 XXX 推进」；stepper 上显示每步 owner
- **阈值（D14）**：组合预算 > $8,000 / 报价 > $2,000 / 批量发信 > 10 人 → 自动转为提交审批
- **交接链（D12）**：`submitApproval` → 目标角色驾驶舱「需要你决策的交接」（含 `发起人 → 待办人` 责任链）→ `approve` / `return(reason)` → 退回单进发起人待办（含原因）→ `resubmit`
- 决策留痕：发起人 / 批准人 / 理由 / 时间

**Acceptance：**
- [ ] **闸门归属**：以 `bd` 看结算面板 → 显示「待财务放款」**且无放款按钮**；切 `finance` → 有按钮
- [ ] **环节 owner**：以 `finance` 看任意环节 → **无推进按钮**，显示「待 XXX 推进」；owner 角色看当前环节 → 有推进按钮
- [ ] **阈值**：以 `bd` 选 $9,800 组合方案 → 不直接生效，**自动提交审批**给 `lead`，Agent 明确说明「我没有替你批」
- [ ] **交接链闭环**：`lead` 驾驶舱见待批单（含责任链）→ 退回并注明原因 → `bd` 驾驶舱见退回单**及原因** → 重提 → `lead` 批准 → 该单从待办消失
- [ ] 每次批准/退回均留痕（发起人/决策人/理由）

---

## 5. 车道与编排
- **车道：** 快车道（单机 Andy 单会话）
- **building：** **串行**（F001→…→F008；严格依赖链 + 共享 scaffold）
- **verifying：** **单个隔离 evaluator subagent**（fresh context，基于实物：DB 实查 + 脚本输出 + 浏览器实截 + 跨角色越权实测）
- **fixing ⟷ reverifying：** 标准循环

## 6. 验收总纲（Evaluator 参考）
- **构建门：** `npm install` → `build` → `tsc --noEmit` → `lint` 全过
- **数据门：** docker postgres+pgvector 起；`prisma migrate`；seed → DB ≥2000 KOL 含非空 embedding + 3 角色用户；cosine 查询返回相关结果
- **AI 门：** smoke 脚本经 aigcgateway 完成 chat(tool-call) + embedding
- **Agent 门：** POST NL → `/api/agent` 流式 → `search_kols` 触发返回
- **交互门：** 浏览器对话面打字 → KOL 卡片流渲染，console 无 error
- ⭐ **权限门（r2 新增，硬性）：**
  - 以 `finance` 身份从**任意入口**（侧栏 / 画布内跳转 / Agent 跳转）访问 `match` → **必须被拦，不得渲染**
  - 以 `finance` 身份请求 `/api/agent` 问创作者信息 → **必须拒答**并给替代路径
  - 工具集按 role 过滤（`finance` 拿不到 `search_kols`）
  - 非 owner 角色在任意环节**均无推进按钮**
  - `bd` 无放款按钮；`finance` 有
- ⭐ **交接门（r2 新增，硬性）：** 提交 → 待批 → 退回(含原因) → 重提 → 批准 全链路可走通且留痕
- **视觉门：** 忠实 Horizon；baseline 入库
- **密钥门：** 无硬编码密钥
- signoff 落 `docs/test-reports/AGENT-FOUNDATION-signoff-YYYY-MM-DD.md`

## 7. 已知下游（不在本批）
- 真实认证登录 / 多租户 RLS
- 知识库解析与抽取（Phase 1）· 组合态方案构建（Phase 2）· 第三方评估 API（数据层，暂缓）
- 全栈生产部署改造 · Apify 实时采集
- `navLabels`（同一实体按角色改名）—— 经评估暂不抄（我们的 Match 对 BD 与 lead 是同一件事，改名为改而改）
