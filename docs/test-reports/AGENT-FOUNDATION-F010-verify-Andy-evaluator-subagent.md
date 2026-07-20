# AGENT-FOUNDATION F010 首轮独立验收报告

> **验收人：** Andy/evaluator-subagent（隔离 fresh context，未参与实现）
> **日期：** 2026-07-20
> **阶段：** verifying（首轮）· fix_rounds=0
> **被验产品代码 SHA：** `12e304b`（F010 feat `26ee34b` + linux 基线 `12e304b`）；HEAD=`0884260`（比 12e304b 仅多一条 `progress.json` chore，paths-ignore，产品代码等价）
> **环境：** macOS darwin · node v25.7.0 · docker `newkolmatrix-dev-db` healthy(pg16+pgvector0.8.5) · aigcgateway 活网关 · `.env` 四键齐（DATABASE_URL/AIGCGATEWAY_BASE_URL/AIGCGATEWAY_API_KEY/NEXT_TELEMETRY_DISABLED）

## 总判定：**PASS**（4/4 条款 PASS；1 项非阻断文档缺陷已如实记录）

---

## 逐条 acceptance

### 条款 1 — e2e 闭环 + 多 Agent 编排最小闭环 → **PASS**

`npm run f010:e2e`（先幂等 `seed:demo-handoff`，再 Playwright chromium 接活网关浏览器实测，viewport 1600×1000）实测 **6/6 通过 / 0 失败**：

```
── Part A：hello-agent 单 agent 闭环 ──
  ✓ match 环节：常驻专家头显示「匹配 Agent」（route→人格）
  ✓ NL → 流式 loop → search_kols → KOL 卡片流在画布渲染（闭环）
  ✓ 画布渲染 ≥1 张 KOL 候选卡片（实得 15）
── Part B：≥2 人格按 route 切换 ──
  ✓ reach 环节：专家头切为「触达 Agent」（≠ 匹配 Agent，人格随 route 切换）
── Part C：一次可视化 handoff ──
  ✓ 协同交接可视化渲染一次 handoff（匹配 Agent → 触达 Agent，来自 F002 Handoff 表）
  ✓ 闭环无 console error（捕获 0 条）
```

- **单 agent 闭环成立：** 浏览器输入「帮我从创作者库找《坦克世界》题材的游戏解说 KOL 候选」→ `POST /api/agent` 流式 loop → 模型自主调 `search_kols` → 柱四 canvas `KolResultCards` 渲染 15 张真实 seed KOL 候选卡片。
- **多 Agent 编排最小闭环成立：** match→reach 两人格随 route 可见切换（专家头文案由「匹配 Agent」变「触达 Agent」）；一次 handoff（match→reach）自 F002 Handoff 表读出，`HandoffCollab` 可视化「A→B」。
- **闭环无 error：** 过滤 favicon/DevTools/hydration 噪声后 console error = 0。
- 证据独立性：卡片/handoff 均来自 DB 真实数据（seed 2524 KOL + demo-handoff seed），非编造。

### 条款 2 — `docs/dev/agent-architecture.md` 架构文档 → **PASS**

逐项核对（非看标题，读全文 203 行确认实覆盖）：

| 要求 | 覆盖情况 |
|---|---|
| 四柱架构 | §1：柱一工具层(注册表+executeTool唯一入口+internal/outbound二分)、柱二运行时(streamText loop)、柱三对话面(useChat/CopilotPanel)、柱四 canvas(canvas-registry) — 全含 |
| 多 Agent 编排框架 registry | §2.1：7 AgentId(orchestrator/strategy/match/reach/delivery/insight/compliance) + AgentPersona 字段形态 |
| persona router | §2.2：CopilotContext + buildContextKey + defaultAgentForRoute(末段关键词) + selectPersona/personaToolSubset |
| handoff | §2.3：HandoffEnvelope(§5.4 信封) + 接收方按 scope 重读不信任发送方结论 + GET /api/handoffs |
| orchestrator | §2.4：routeToStage 环节路由 + aggregatePending 原样不改写 |
| 焊死 vs 语义扩展点边界 | §3：明确二栏对照表(焊死列/扩展点列) + 代码注释标注约定，D-ORCH/ADR-001 |
| AI→人闸门模型 | §4：服务端强制 + harm 单一 zod + 令牌四安全属性 + 无阈值(D28) + internal 不加闸门(D27) + 变异测试(D20) |
| 数据流 | §5：hello-agent 完整 ASCII 流程图(浏览器→route→streamText→executeTool→canvas) + 持久层说明 |
| how-to 三件 | §6.1 加新专家人格 / §6.2 加新工具 / §6.3 加新 canvas 组件 — 各含步骤 |

四柱 + 编排框架四接口 + 焊死/扩展点边界 + 闸门 + 数据流 + how-to 三件 **全覆盖**。

### 条款 3 — visual baseline → **PASS**

- `tests/screenshots/baseline/agent-canvas-darwin.png`(115KB) + `agent-canvas-linux.png`(117KB) **均已入 git**（`git ls-files` 确认）。
- **浅色：** 亲自 Read 基线 PNG 确认 — 白底 + Horizon 紫强调色；内容含专家头(匹配 Agent + duty「创作者筛查·组合生成·受众匹配·可信度核验」+ 否定式护栏「只做发现与匹配，不发起触达、不谈价」) + 3 张 KOL 卡片(IronSight/PanzerLine/SteelCamp 带 % 匹配 badge) + 一次协同交接(匹配 Agent → 触达 Agent，match_plan 交接物)。忠实 Horizon 卡片视觉。
- **≥1440px：** `playwright.config.ts` viewport=1512×982（宽 1512 ≥ 1440）✓。
- **CI/linux 重生：** `agent-canvas-linux.png` 由 `12e304b`「update linux baselines」提交；CI(linux) Visual regression job 在 workflow_dispatch run `29749985679`(headSha=12e304b) **success**。
- 本机视觉门 `npm run test:visual` 对 darwin 基线实测 **2 passed**（agent-canvas + today）。

### 条款 4 — README/CLAUDE.md 技术栈更新 → **PASS**（附 1 项非阻断文档缺陷）

字面 acceptance「技术栈更新（DB/Prisma/pgvector/Vercel AI SDK/aigcgateway/单角色+多 Agent 编排+AI→人闸门）」**已满足**：

- **README.md** L12-14：Prisma 6 + Postgres 16 + pgvector `vector(1024)` · Vercel AI SDK v7 ⇄ aigcgateway(chat=deepseek-v3/embedding=bge-m3) · 四柱 + 多 Agent 编排框架(registry/router/handoff/orchestrator,7 人格) + AI→人闸门 — 全列。
- **CLAUDE.md** L37：同套技术栈全列，指向 agent-architecture.md。

**非阻断缺陷（如实记录，不软化）：** `README.md` 第 29 行 setup 说明写「需 `.env`（`DATABASE_URL` + aigcgateway 凭据 `OPENAI_API_KEY` / `OPENAI_BASE_URL`）」，但**实际环境变量名是 `AIGCGATEWAY_API_KEY` / `AIGCGATEWAY_BASE_URL`**（`src/lib/ai/gateway.ts:125-126,162-163` `requireEnv('AIGCGATEWAY_*')`；`.env` 实键；权威 setup 源 `.env.example:24-25` 均为 `AIGCGATEWAY_*`）。新克隆者若照 README 设 `OPENAI_*` → gateway `requireEnv` 抛「缺少必需环境变量 AIGCGATEWAY_BASE_URL」，dev 起不来。

**为何判非阻断（PASS 而非 PARTIAL）：**
1. 该错落在 README 的 setup 散文句，**非** acceptance 枚举的「技术栈列表」项 —— 字面 acceptance 已达成；
2. 权威 setup 源 `.env.example` + 代码 + CLAUDE.md 均正确，唯 README 一行散文漂移（命名漂移，参照 evaluator.md §13）；
3. 无功能/安全影响（无密钥泄漏，代码正确，实测全绿）；1 行散文可修。

**兜底（明文）：** 建议 Generator 后续 chore 单行修正 README:29 `OPENAI_API_KEY/OPENAI_BASE_URL` → `AIGCGATEWAY_API_KEY/AIGCGATEWAY_BASE_URL`（Evaluator 不改产品文档基线）。已入 signoff Soft-watch 记账。

---

## 结论

F010 四条 acceptance **全 PASS**；批次末全链路回归（§6 各门）见 signoff。首轮 fix_rounds=0。仅 1 项非阻断 README 散文命名漂移已记账，不阻断签收。
