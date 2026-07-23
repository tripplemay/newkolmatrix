# M2-C-AGENT-HONESTY — 项目创建动线 + Agent 诚实护栏 + 编队名册注入（普通批次）

> **批次类型：** 普通批次（全部 `executor:generator`），`planning → building → verifying → done`。
> **车道：** 快车道（单会话，Evaluator 隔离 subagent）。无 `role_assignments`。
> **Spec lock：** 2026-07-23 用户裁决「立即小批次修」（修复面三件套 + 项目创建动线端到端，
> AskUserQuestion 实答）；触发源 = 用户反馈落档
> `docs/test-reports/user_report/M2C-agent-honesty-2026-07-23.md`。
> **事实依据：** 实物核证四点（create_project 全仓零命中 / V2 原型无创建 affordance /
> orchestrator tools:[] registry.ts:78 / route.ts:100-115 装配结构与无工具提示语）。

---

## 1. 背景与目标

用户在 Copilot 对编排 Agent 说「创建一个王者荣耀东南亚推广的项目」，得到幻觉编排长文
（杜撰 5 个名册外专家 + 声称已编排任务），零落库、项目页无物。三层根因（见 user_report）：
写路径不存在、诚实护栏缺失、名册未注入。本批补齐「创建项目」端到端动线并硬化 prompt
防线——**AI 说到必须做到，做不到必须明说**。

### 1.1 关键实物锚点

1. 工具注册表 6 工具无创建类；`ensureNativeToolsRegistered`（tools/index.ts）为注册点。
2. `registry.ts`：BASE_SYSTEM :47（「基于工具返回的真实数据作答，不编造」——只约束数据）；
   buildSystemPrompt 五段（身份/职责/边界/uiSyntax）；orchestrator/delivery `tools: []`。
3. `route.ts:100-115`：system = persona.systemPrompt + knowledgeSection + 工具清单段
   （无工具 → 「（你当前没有可调用的工具，只做本职分析与建议。）」）。
4. 项目详情路由已支持 id/publicId/slug 三口径（campaigns/[id]/page.tsx:33）；
   Project 模型：name 必填，gameId/goal/market/budgetTotal/currency/slug 可选，
   cur/maxReached @default(brief)。
5. V2 项目列表原型（ui-inventory 10 元素）**无创建 affordance** → UI 入口 = 布局变更，
   须原型 + 清单同批同步（M2-B F006 先例流程）。
6. OperationLog 留痕先例：advanceStage（kind=auto + summary 人话 + payloadJson 结构化）。

---

## 2. 功能范围（5 条，全 generator）

### F001 createProject 服务 + create_project 工具（internal）

- `src/lib/projects/create.ts` `createProject(tenantId, input, opts)`：zod 入参
  `{name 必填 min(1), gameIdOrSlug?, market?}`（【P3】goal 不在创建时填——goal 确认是
  brief 环节动线；创建即入 cur=brief）；game 解析（id/slug/publicId 三口径，未命中 →
  `GAME_NOT_FOUND` 明示不静默）；同名不去重（多项目同游戏合法）；事务 = Project.create +
  OperationLog（kind=auto, actor=调用人格, summary「创建项目《name》」, payloadJson
  {action:'project.created', projectId, market}——雷达/记录页可见的真痕迹）。
- `src/lib/agent/tools/create-project.ts`：class:'internal'（可逆内部动作，D27 无确认框）；
  输入 zod 同服务；输出 `{created: true, project: {id, publicId, name, cur}, next:
  '项目已创建并进入目标 Brief 环节…'}`（指路语义）；【P2】挂载 orchestrator + strategy
  两人格（编排入口 + brief 域；其余人格不挂——越界请求走指路）。
- 单测（contract-surface 先例）：class/注册/人格挂载/zod 拒空名；集成测（夹具租户）：
  创建落库 + cur=brief + OperationLog 留痕原子 + GAME_NOT_FOUND + 人格挂载路由。
- lint + tsc + test:unit 绿。

### F002 POST /api/projects + 列表页创建入口（布局变更）

- `POST /api/projects`：薄封装 createProject（getDevTenantId；400 zod 明示 / 404 game /
  500 兜底）——UI 与工具共用同一服务（单一真相源）。
- campaigns 列表页「新建项目」入口：页头右侧 solid 按钮 + 轻量弹层表单（名称必填 +
  游戏下拉（现有 Game 列表，可空）+ 市场文本可空）→ 提交成功 toast + 跳
  `/admin/campaigns/{id}`（brief 环节起点）；失败 toast 服务端信息。
- **布局变更（Planner 标注）**：原型 interaction-prototype-v2.html 项目列表段同步加
  「新建项目」affordance + ui-inventory V2 登记（10→+1/+2 元素）；campaigns.png 基线
  逐处对账重生（重生序遵 §4.5）；两视口实测；运行时改→验→复原实证。
- lint + tsc + test:unit + test:visual 绿。

### F003 诚实护栏（行动承诺条款 + 无工具分支强化）

- BASE_SYSTEM 扩「**行动承诺诚实条款**」：(a) 只有工具真实返回成功才可声称「已创建/
  已编排/已执行」；(b) 请求超出当前工具能力 → 明说「当前版本不支持 X」+ 说明能做什么 +
  指路（UI 入口或对应队友）；(c) 建议就是建议，禁止包装成已执行的任务/编排/计划落地。
- route.ts 无工具分支提示语强化：「（你当前没有可调用的工具——你只能给分析与建议，
  且必须明确告知用户你**没有执行任何动作**；需要执行时指引用户找对应专家或页面入口。）」
- 单测：prompt 拼接断言（诚实条款三要素在每人格 systemPrompt；无工具分支文案）——
  uiSyntax 注入断言先例；真对话行为属 L2 留验收授权。
- lint + tsc + test:unit 绿。

### F004 编队名册注入（同源防杜撰）

- buildSystemPrompt 增「你的队友（唯一合法名册）」段：由 `listPersonas()` 同源生成
  （id/名称/职责一行一条——与 personaBoundary UI 卡同一数据源，防漂移）+
  「协作或指路只能提及名册内专家，**不得杜撰任何名册外角色**」。
- 单测：全人格 systemPrompt 含 7 人格全名册断言 + 禁杜撰条款在场 + 名册与
  listPersonas() 同源（改名册单测自动跟随——不 pin 硬编码名单）。
- lint + tsc + test:unit 绿。

### F005 端到端闭环 + 文档翻牌

- 集成闭环测：executeTool('create_project') 直调（orchestrator ctx）→ 项目落库 +
  OperationLog 留痕 → campaigns 列表数据层可见 → 详情页三口径可达（打真库夹具租户）；
  agent:smoke 扩段可选；真对话「创建项目」属 L2 留验收授权。
- user_report 归档注记（处置状态翻牌）；architecture.md 翻牌：§8 装配层（诚实条款 +
  名册段 as-built）+ 工具表 +create_project + §10.1.1 路由 +/api/projects + §14 M2-C 行；
  agent-architecture.md 工具/prompt 段同步。批末新鲜度复核。
- lint + tsc + test:unit 绿。

---

## 3. 关键设计决策

- **U1（2026-07-23 实答）**：立即小批次修（三件套 + 创建动线端到端）。
- **P1 create_project = internal**：创建项目可逆、不对外、不花钱——D27 无确认框；
  留痕走 OperationLog（雷达「Agent 今日完成」真痕迹，正面消解「做了但看不见」）。
- **P2 挂载面收窄**：仅 orchestrator + strategy；其余人格收到创建请求 → 诚实护栏指路。
- **P3 创建最小集**：name 必填 + game/market 可选；goal 归 brief 环节动线（不越环节）；
  slug 不自动生成（路由 id/publicId 已可达）。
- **P4 UI 入口 = 布局变更**：V2 原型无 affordance（实证）——原型 + 清单 + 基线全同步
  （M2-B F006 先例流程）。
- **P5 护栏是产品级而非人格级**：诚实条款进 BASE_SYSTEM（全人格生效）——幻觉执行不是
  编排 Agent 特有风险。
- **P6 名册同源**：注入段由 listPersonas() 生成，与 UI 卡同数据源；单测不 pin 硬名单。
- **P7 测试边界**：prompt 断言 + contract-surface + 打库集成测；真对话 L2 留验收授权
  （网关最小用量口径沿批）。

### 编排确认（§6.5）

快车道；building 串行（F001→F002 依赖服务；F003/F004 独立小件可穿插）；
verifying fan-out（5 features ≥4，orchestration §4 沿 M2-B 模式）。

## 4. 数据准备步骤（Evaluator 验收前提）

- dev：4 canonical 项目 + 2524+2 Kol；集成测夹具租户自建自清（D-H）；
  验收产生的测试项目测毕删除（Project Cascade 清 OperationLog 需显式——留痕行同清）。
- CI：visual job 现有 seed 即可（创建弹层不依赖 Kol）；campaigns.png 基线态 = 4 卡 +
  新建按钮。
- L2：真对话验证（「创建一个 XX 项目」→ 工具真执行 + 诚实指路行为）最小用量 + 报告注明。

## 5. 验收口径（verifying）

- fan-out：5 features → Workflow fan-out + 对抗复核。
- F001 服务/工具/留痕原子/挂载面；F002 API+UI 动线 + 布局变更三同步 + 基线对账；
  F003 三要素条款全人格 + 无工具分支；F004 名册同源 + 禁杜撰；F005 端到端闭环 +
  翻牌 + user_report 处置注记。
- 就绪回归：lint + tsc + test:unit + test:visual + 探针族无回归（沿 M2-B 口径）。

## 6. 不在本批次

- goal 设定/确认动线（brief 环节既有归属）· 项目编辑/删除/归档（后续按需）·
  orchestrator 目标态工具 list_pending_asks/summarize_squad（M3+）· 多语言 KV/
  甘特图类编排产物（幻觉里的功能不是需求）· soft-watch ×2 注释清理（顺手可捎，
  不作为 acceptance）。
