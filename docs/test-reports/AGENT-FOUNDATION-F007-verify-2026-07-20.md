# AGENT-FOUNDATION F007 验收报告（隔离 Evaluator）

- **Feature：** F007 — 常驻对话面（useChat）+ Generative Canvas 协议 + 多人格切换 + 协同交接可视化
- **被验提交：** 9f1c95d（`git merge-base --is-ancestor 9f1c95d HEAD` = YES，已在 HEAD 7d06c93 祖先链）
- **验收日期：** 2026-07-20
- **验收人：** Andy/evaluator-subagent（fresh context，独立上下文）
- **环境：** docker db healthy（2 天，2524 KOL 含 embedding + 1 条 demo handoff）；`next dev`（非 next start，standalone 限制）；Playwright chromium viewport 1600×1000；`/api/agent` warmup 后取样
- **总判定：** ✅ **PASS**（6/6 acceptance 子条 + 构建门全绿；1 项非阻断缺陷已记录，不影响字面 acceptance）

---

## 取证方式（不采信实现叙述）

- 亲自读被验代码全文（CopilotPanel/ExpertScope/HandoffCollab/canvas-registry/KolResultCards/api/handoffs/route.ts/admin/layout.tsx/persona-router/registry）
- 亲自写并跑独立 Playwright 脚本（`scripts/test/_indep-f007-tmp.mjs`，验后已删），**专家头 ExpertScope 用 `aside div.border-l-4` 独立选择器，与 HandoffCollab 文案隔离**，避免 Generator smoke 的假阳性
- 亲自 psql 直连 DB 交叉验证 canvas 展示的 KOL 名是真实 seed（非编造）
- 亲自跑构建门（删 tsbuildinfo + prisma generate 后 tsc/lint/build）
- Generator 的 `f007:browser`（10/10）仅作对照，非唯一依据

---

## 逐条 acceptance

### C1 浏览器：对话面打字「找 XX KOL」→ 流式回复 + KOL 卡片流渲染（真实 seed 数据） — ✅ PASS

- CopilotPanel 常驻渲染：`copilotPresent=true`、`asideVisible=true`（1600×1000，`hidden xl:flex` 满足）；useChat 接 `/api/agent`（CopilotPanel.tsx:104-109，`DefaultChatTransport{api:'/api/agent', body:{context}}`）
- 打字「帮我找几个坦克世界解说 YouTuber」→ 流式文本气泡「好的，我来搜索坦克世界解说相关的 YouTuber。」+ KOL 卡片流
- **真实 seed 交叉验证（psql 直连）：** canvas 展示 `SKIFler / The_Viper_UA / The Best Replays World of Tanks / PWN-G | WoT Replays`，DB 回查全部命中真实行：`@SKIFler_WOT / @TheViperUA / @TheBestReplaysWorldofTanks / @PWN-G`，platform=youtube，country=乌克兰（与 query「坦克世界」语义吻合，非编造）
- % 匹配徽标：65/59/59/59/58/56%（similarity×100，KolResultCards.tsx:36）；候选计数「10 位候选 · 「坦克世界解说 YOUTUBER」」（`kol_candidateCount=true`）
- 截图证据：`02-kolcards.png`（user 渐变气泡右 / agent 白气泡左 / KOL 卡含 verified 徽标+FPS/gaming 标签+频道链接）

### C2 canvas 协议：新结果类型加一个组件即可渲染 — ✅ PASS

- `canvas-registry.tsx`：`CANVAS_REGISTRY: Record<toolName, ComponentType>`（工具名→组件），`hasCanvasRenderer` + `renderToolResult`；当前一条 `search_kols→KolResultCards`
- 扩展铁律成立：新结果类型 = 往 `CANVAS_REGISTRY` 加一条，不改对话面核心；EXTENSION POINT 注释标注 get_kol_detail 详情卡/组合态卡等后续（canvas-registry.tsx:5）
- 对话面消费机制：`MessageParts` 检测 `part.type==='tool-<name>'`（静态工具）或 `dynamic-tool`，`output-available` 时委托 registry 渲染（CopilotPanel.tsx:72-85）；route 核心不感知具体工具

### C3 对话面顶部常驻显示当前专家 duty + 否定式护栏 — ✅ PASS

- ExpertScope 顶部常驻（CopilotPanel.tsx:125-127，`shrink-0` 头部）；消费 F006 `personaBoundary`（client-safe，无 prisma）
- 实测（discovery）专家头文本（独立选择器隔离）：`匹配 Agent | 对比矩阵(uiSyntax badge) | 职责 创作者筛查·组合生成·受众匹配·可信度核验 | 隔离 只做发现与匹配，不发起触达、不谈价`
- **否定式护栏原文**（isolation，D13 升级版「我不会做什么」）如实展示于「隔离」行
- 忠实还原原型 `.cop-scope`（border-left brand + 职责/隔离行），叠加 squad 头（状态点+名+uiSyntax）

### C4 多人格切换（≥2 可见）+ context key 变化→对话清空+新专家开场白 — ✅ PASS（附 1 项非阻断缺陷）

字面 acceptance 四要素全部实测通过：
- **≥2 人格可见切换：** discovery→专家头「匹配 Agent」(match)；outreach/dashboard→专家头「编排 Agent」(orchestrator)。2 个不同人格随 route 自动切换（`outreach_expertScope`/`dashboard_expertScope` 均为编排 Agent，`discovery_expertScope` 为匹配 Agent，独立选择器实测）
- **对话清空：** 切 outreach 后 `outreach_kolClearedFromCanvas=true`（上个环节 KOL 卡片消失）；机制 = `CopilotChat key={contextKey}` remount（CopilotPanel.tsx:184-197）
- **新专家开场白：** 每人格 remount 后空消息→开场白「我是{name}，负责{duty}。有什么可以帮你的？」实测：discovery「我是匹配 Agent…」/ outreach「我是编排 Agent…」（CopilotPanel.tsx:131-138）
- context key = `route:projectId:env:agentId`（persona-router.ts:24-26），变化即 remount，非「切角色清空」（FR-12.4）

**⚠️ 非阻断缺陷（记录，不打回，不失字面 acceptance）：** `/admin/outreach` 实际映射到 **orchestrator「编排 Agent」而非 reach「触达 Agent」**。根因：`defaultAgentForRoute` 用 `route.includes('/reach')`（persona-router.ts:53），而 `/admin/outreach` 不含子串 `/reach`（`reach` 前是 `t` 非 `/`）；且 admin 下现有 5 路由（discovery/outreach/database/campaigns/dashboards）无任一含 `/reach`，故 reach 人格当前**经路由不可达**。
- 后果一：Generator commit 声称「多人格切换 match↔reach」不准确——实为 match↔orchestrator。
- 后果二：Generator smoke（f007-browser-check.mjs:55）断言「切 /admin/outreach → 专家头变触达 Agent」是**假阳性**——`reachText.includes('触达 Agent')` 为真，仅因 HandoffCollab 渲染了「匹配 Agent → 触达 Agent」文案，**非**专家头切到 reach。我用 ExpertScope 独立选择器已证专家头实为「编排 Agent」。
- 判定依据：字面 acceptance 只要求「≥2 人格可见切换」（match↔orchestrator 已满足）+ 清空 + 开场白（均满足）；route→agent 映射精度是 §3.2 声明的 EXTENSION POINT（persona-router.ts:7，随 F008 真实 IA 路由充实）。故 C4 判 PASS。
- **建议（供 F008/后续）：** 修 `defaultAgentForRoute` 使 `/outreach` → reach（或改用精确 route→agent 表），并修正 smoke 断言把专家头文案与 handoff 文案分离取样，消除假阳性。

### C5 协同交接可视化：以「A→B」呈现 handoff，可展开看交接对/摘要/交接物 — ✅ PASS

- 数据源真实：HandoffCollab `fetch('/api/handoffs')` → GET 读 F002 Handoff 表（route.ts），DB 实测 1 行：`match → reach, artifactType=match_plan, artifactRef=match_plan:demo-starlight-protocol, summary=匹配 Agent 交接：为《星轨协议》筛出 3 位坦克世界解说候选…`
- 实测（`collab_present=true`）：区块头「协同交接 · 多 Agent 联动 · 点开看交接」（MdGroups 图标）
- **交接对 A→B：** `collab_pairText="匹配 Agent → 触达 Agent"`（agentName 经 personaBoundary 映射 fromAgent/toAgent）
- **可展开：** 点击后 `collab_hasArtifact=true`、`collab_hasSummary=true`
- **交接物：** `交接物：match_plan（match_plan:demo-starlight-protocol）`（MdBolt 图标）；**摘要：** 星轨协议交接文案
- 截图证据：`04-collab-expanded.png`（chevron 旋转 + A→B + 摘要 + 交接物 chip），忠实还原原型 `.collab`（cl-pair / cl-detail / ho-chip）
- 次要观察（非缺陷）：原型 `.cl-detail` 另含 `ho-turn`（交接对话轮，对应 Handoff.messagesJson）与 `ho-out`（outcome），实现未渲染 messagesJson（API 未 select）。acceptance 只要求「交接对/摘要/交接物」三项，均已呈现，故不扣分。

### C6 浅色 + console 无 error + 忠实 Horizon 视觉 — ✅ PASS

- **浅色：** 截图确认白/浅灰底（默认 light，模板 `<body className="dark">` 已去除）
- **console 无 error：** 独立测跨 discovery/发消息/outreach/dashboard/collab 展开全程 `consoleErrors_raw=[]`、`consoleErrors_real=[]`（0 条）；Generator smoke 亦 0 条
- **忠实 Horizon：** brand 紫 #422AFB（渐变气泡/徽标/border-l）、圆角卡（rounded-2xl）、DM Sans、侧栏图标、Horizon 卡片阴影/hover；ExpertScope/CopilotPanel/HandoffCollab 用 Tailwind + Horizon 原语拼（落地规范 §6 CopilotPanel/ExpertAgentHeader 新建件），忠实还原原型 .cop-scope/.cmsg/.collab
- 注：visual baseline PNG（tests/screenshots/baseline/agent-canvas-*.png）是 **F010** 的 acceptance，非 F007 判据，本轮不作要求。

---

## 构建门（spec §6）— ✅ PASS

删 `tsconfig.tsbuildinfo` + `prisma generate` 后：
- `npx tsc --noEmit` → **TSC_EXIT=0**
- `npx next lint` → **LINT_EXIT=0**（✔ No ESLint warnings or errors）
- `npx next build` → **BUILD_EXIT=0**（✓ Compiled successfully；Generating static pages 12/12；`/api/agent`、`/api/handoffs` = ƒ Dynamic；/admin/discovery /admin/outreach 等静态页正常）

---

## 独立性与边界

- 未修改任何产品代码（src/prisma/config 一律未动）；仅临时增删 `scripts/test/_indep-f007-tmp.mjs` 探针，验后已删（`git status scripts/` 干净）
- 真实 key 全程 mask（DATABASE_URL / AIGCGATEWAY_API_KEY 未落报告）
- 已 kill 起的 dev 服务释放 :3000，已关 Playwright
- 仅验 F007（F008-F010 未实现属正常）

## 总判定

**PASS** — F007 六条 acceptance + 构建门全部 PASS，首轮 fix_rounds=0。交互门（spec §6）成立：浏览器对话面打字→KOL 卡片流真实 seed 渲染 + ≥2 人格可见切换 + 协同交接区可展开，console 0 error，浅色，忠实 Horizon。1 项非阻断缺陷（outreach→reach 路由映射未生效 + Generator smoke 假阳性）已如实记录，不影响字面 acceptance，建议随 F008 真实 IA 修正。
