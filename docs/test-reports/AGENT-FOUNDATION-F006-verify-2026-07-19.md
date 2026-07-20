# AGENT-FOUNDATION F006 验收报告

- **Feature：** F006 — 多 Agent 编排框架：registry + persona router + handoff 协议 + orchestrator 调度骨架
- **被验提交：** `191eeec`（feat(AGENT-FOUNDATION-F006)）
- **验收人：** Andy/evaluator-subagent（隔离上下文，fresh context，无自评）
- **验收日期：** 2026-07-19
- **环境：** docker `newkolmatrix-dev-db` healthy（F002 Handoff/PendingAction 表 + F004 seed 2524 KOL）；`.env` 双 key 就位；node v25.7.0
- **总判定：PASS**（6/6 acceptance 子条 + 编排门 + 构建门全绿，首轮 fix_rounds=0）

> 独立性说明：本报告结论全部基于 Evaluator 亲自运行的命令输出与亲自读到的源码，未采信任何实现叙述。真实 key 一律 mask。验收未修改任何产品代码（仅临时增删 scripts/test 探针，已清理）。

---

## 一、逐条 acceptance（features.json F006，权威副本）

### A1 — Agent registry：7 AgentId 权威=PRD §9.2，每人格 system prompt+duty+否定式护栏+工具子集+界面语法；加 agent=加一条不改 route 核心 → **PASS**

- **7 人格权威性（逐项对齐 PRD §9.2）：** `registry.ts` `AgentId` 联合类型声明恰好 7 个：`orchestrator/strategy/match/reach/delivery/insight/compliance`，与 features.json + PRD §9.2 权威名册**完全一致**。逐人格核对 name/stage/duty/isolation/uiSyntax 与 PRD §9.2 表逐格吻合：
  - `strategy` 策略/①Brief/目标拆解·预算配比·健康度监测·复盘框架/不联系创作者、不放款——交给触达交付/仪表 ✓
  - `match` 匹配/②Match/创作者筛查·组合生成·受众匹配·可信度核验/只做发现与匹配，不发起触达、不谈价/对比矩阵 ✓
  - `reach` 触达/③Reach/邀约起草·逐人谈判·回复跟进·报价建议/不批预算、不放款；报价与发送需你确认/对话收件箱 ✓
  - `delivery`/`insight`/`compliance`/`orchestrator` 同样逐格吻合（PRD §9.2 line 491-497）
- **每人格五要素齐备：** `AgentPersona` 含 `systemPrompt`（`buildSystemPrompt` 由 duty+iso 组合注入 runtime）+ `duty` + `isolation`（否定式护栏，D13）+ `tools`（工具子集）+ `uiSyntax`（界面语法）。`orch:smoke` 断言「每人格含 system prompt + duty + 否定式护栏」通过。
- **加 agent=加一条不改 route 核心：** 人格集中在 `PERSONA_SEED` 数组；`route.ts` 不硬编码任何人格，经 `selectPersona`/`personaToolSubset` 消费 registry。加人格=往 `PERSONA_SEED` 加一条。
- **证据：** `orch:smoke` ✓「registry 声明 7 人格（orchestrator/strategy/match/reach/delivery/insight/compliance）」；`registry.ts:11-18,58-122`。

### A2 — Persona router：按 context(route+env+agentId) 选人格+收窄工具子集，注入 F005 streamText，单一 /api/agent 承载所有专家不起独立进程 → **PASS**

- **context 机制（架构稿 §4.3）：** `persona-router.ts` `CopilotContext{route,projectId,env,agentId}` + `buildContextKey`/`parseContextKey`（key=`route:projectId:env:agentId`）。`orch:smoke` ✓「context key 往返一致（/admin/creators:-:default:match）」。
- **选人格+收窄工具子集真注入 streamText（实测，非仅数据结构）：** `route.ts` `resolveContext→selectPersona→personaToolSubset→toAiSdkTools(toolNames,ctx)→streamText`。**live curl 实测**：
  - `match@/admin/creators`：响应头 `X-Agent-Id: match` / `X-Agent-Tools: search_kols,get_kol_detail`；stream 实际调用 `search_kols` 返回真实 seed KOL（`@TheBestReplaysWorldofTanks` sim 0.6837 / `@SKIFler_WOT` 0.6793 / `@PWN-G` 0.6714 / `@TheViperUA` 0.6594）
  - `strategy@/admin/knowledge`（同 prompt）：`X-Agent-Id: strategy` / `X-Agent-Tools: get_kol_detail`；stream 中 **0 次 search_kols 调用**——证明工具子集在 streamText 层真收窄（不只响应头）
- **单一端点承载所有专家：** 全部人格经同一 `/api/agent`（`route.ts` 单文件），换人格=换 system prompt+工具子集，端点不变，不起独立进程。
- **route→agent 派生端到端（route.ts 接线）：** 不显式给 agentId 时经 `defaultAgentForRoute`——实测 `/admin/creators`→match、`/admin/project/p1/reach`→reach、`/admin`→orchestrator(空工具)。共实测 4 个不同人格经 live API 切换。

### A3 — Handoff 协议：§5.4 信封 create/传递/receive；接收方按自身 scope 重读不信任发送方结论；落 F002 Handoff 表 → **PASS**

- **§5.4 信封格式：** `handoff.ts` `HandoffEnvelope{projectId,fromAgent,toAgent,artifactType,artifactRef,summary,messages}` 与架构稿 §5.4 逐字段吻合。`Handoff` 表结构 psql 实测 = id/tenantId/projectId/fromAgent/toAgent/artifactType/artifactRef/summary/messagesJson/createdAt。
- **真落 F002 Handoff 表（Evaluator 独立探针，非仅实现脚本自证）：** 我另写独立探针跑真实 `createHandoff`，**清理前用 psql 直连确认该行真在表中**：`id=cmrsuy4s7... fromAgent=match toAgent=reach artifactType=match_plan artifactRef=match_plan:...`（1 row），验后清理归 0。
- **接收方按 scope 重读、不信任发送方 summary 结论（§5.4 核心语义，硬验）：** 探针中我**故意植入 FAKE 权威式 summary**「金额 $99999、状态=已批准」，`receiveHandoff` 返回 `mustRereadBy=reach` + `rereadRef` 指向 **artifactRef 而非 summary**（`REREAD_POINTS_TO_ARTIFACT=true`、`REREAD_NOT_SUMMARY=true`）；summary 仅作非权威审计文本携带。语义成立。
- **接收者防串扰：** `receiveHandoff` 校验 `toAgent`≠receivingAgent 抛错。`orch:smoke` ✓「错误接收者（delivery 接收 reach 的 handoff）被拒」。

### A4 — Orchestrator 调度骨架：环节路由(enter:/pick:/env:)→某项目某环节 + pending 聚合接口(不改写/软化专家结论) → **PASS**

- **环节路由：** `orchestrator.ts` `routeToStage(projectId,stage)→StageTarget`（目标 copilot context，agentId 按 STAGE_AGENT 映射）+ `parseOrchestratorDirective`（`enter:<proj>:<stage>` 完整实装；`pick:/env:` 识别但最小处理，标 EXTENSION POINT）。`orch:smoke` ✓「路由到某项目某环节（match）」+「enter:<proj>:reach → reach 环节」。
- **pending 聚合原样不改写（独立性铁则编排侧）：** `aggregatePending` 读 F002 PendingAction(status=pending)，`harm: r.harmJson` **原样透传**（`orchestrator.ts:96` 注释「原样透传，不改写」），无排序软化/结论改写。`orch:smoke` 插一条 harm=`{action:send_outreach,irreversible:true,count:12}`，断言聚合后 harm 三字段值**逐一原样**返回 ✓。

### A5 — 框架焊死/语义留扩展点边界（§3.2 核心纪律） → **PASS**

- **焊死项（§3.2 应焊死）全部标注【框架焊死】：** registry 结构（`registry.ts:7`）/ router 机制+context key+工具子集收窄（`persona-router.ts:6`）/ handoff 信封格式+create/receive 机制（`handoff.ts:7`）/ orchestrator 环节路由+聚合接口签名（`orchestrator.ts:9`）——接口稳定，均不依赖业务形态。
- **EXTENSION POINT 项（§3.2 应留扩展点）逐项标注：** handoff 具体载荷+artifactType+按 scope 重读实读逻辑（`handoff.ts:8,16,63`）/ 聚合排序规则（`orchestrator.ts:83`）/ 各人格职责精度+tools+uiSyntax→canvas（`registry.ts:8,34,57`）/ compliance 跨环节调用点（`orchestrator.ts:10`）/ route→agent 映射（`persona-router.ts:7,48`）/ F009 闸门令牌（`execute.ts:43`,`types.ts:18`）——全部最小实现 + 注释标注。
- **防过度设计（ADR-001，两向都守住）：**
  - 不该焊死的**没**焊死：MCP 仅 `ToolSource='native'|'mcp'` 类型 + `tools/index.ts` 注释，**无 MCP client 实装**；compliance 仅 registry 一条声明，**无跨环节调用逻辑**；各人格 tools 仅最小分配（未预测全部未来工具）；`defaultAgentForRoute` 最小字符串匹配。
  - 该焊死的**已**焊死：4 个稳定接口（AgentPersona 字段形态 / CopilotContext+key / HandoffEnvelope / StageTarget+聚合签名）定死。

### A6 — MCP：工具来源抽象已就位(F005 source)，本批不实装 MCP client → **PASS**

- `types.ts:12` `ToolSource='native'|'mcp'` 抽象就位；`tools/index.ts:4` 注释「MCP 工具（source:'mcp'）为扩展点：未来在此按需从 MCP client 拉取并 register，本批不实装」。全仓 F006 无 MCP client 调用。

---

## 二、门禁（spec §6）

| 门 | 结果 | 证据 |
|---|---|---|
| ⭐ **编排门（硬性）** | **PASS** | registry 7 人格 ✓；router 按 route 切人格（实测 4 可见）+ 收窄工具子集（match[search_kols,get_kol_detail] vs strategy[get_kol_detail]，stream 层实收窄）✓；一次 handoff 落 Handoff 表（psql 独立确认）✓；orchestrator 路由某项目某环节 ✓；焊死/EXTENSION POINT 注释抽查 ✓；MCP 抽象就位未实装 ✓ |
| **构建门** | **PASS** | 删 tsbuildinfo+.next/cache 后：`tsc --noEmit` exit 0；`next lint` exit 0（No ESLint warnings or errors）；`next build` exit 0（Compiled successfully 5.7s + 11/11 static pages，/api/agent = ƒ Dynamic） |
| **密钥门（顺带）** | **PASS** | F006 新增代码（registry/router/handoff/orchestrator）无硬编码密钥；gateway 走 env 懒校验（F003 已详验） |
| Agent 门 | 复用 PASS | POST NL→/api/agent 流式 loop→search_kols 触发返回真实 seed KOL（match 人格实测） |

---

## 三、非阻断观察（记录不打回，不影响 PASS）

- **O1（工作树卫生，非 F006 缺陷、非 Evaluator 引入）：** 工作树有未提交 dep `@ai-sdk/react@4.0.34`+lock（+90 行）。核实：F006 提交 `191eeec` **未含**此改动、无任何源码引用，属 F007（useChat）预备残留。构建门在**含此 dep 的树上**仍全绿。建议 Generator 在 F007 提交时纳入或先 revert，保持工作树干净。我（Evaluator）未触碰。
- **O2（人格工具精度，EXTENSION POINT 允许）：** `strategy` 人格被授予 `get_kol_detail`，与其 duty（策略/预算/复盘）语义关联偏弱。但这是 §3.2「各人格领域工具随 M1-M4 落地」的最小实现，且不破坏「工具子集不同」验收（match 有 search_kols，strategy 无）。非缺陷，待 M1 各人格领域工具落地时校准。
- **O3（标签差异，非缺陷）：** 架构稿 §5.1 用 AgentId `brief`，而 features.json/PRD §9.2 权威用 `strategy`（归属①Brief）。registry 正确采用 acceptance 权威值 `strategy`。§5.1 的 `brief` 是旧标签。
- **O4（部署形态，超 F006 scope）：** `next.config` output:standalone 致 `next start` 告警（来自 CICD 批次非 F006），但路由实测正常服务（4 人格 curl 全 200）。生产应用 `node .next/standalone/server.js`。

---

## 四、结论

**F006 总判定：PASS。** 6/6 acceptance 子条全 PASS，编排门 + 构建门（spec §6）全绿，§3.2「框架焊死 / 语义留扩展点」纪律两向守住（该焊死的焊死、不该焊死的留扩展点），首轮 fix_rounds=0。仅验 F006（F007-F010 未实现属正常）。被验提交 191eeec，改动全在 F006 scope（registry/persona-router/handoff/orchestrator/route.ts/context.ts/types.ts/orch:smoke）。

验收人：Andy/evaluator-subagent
