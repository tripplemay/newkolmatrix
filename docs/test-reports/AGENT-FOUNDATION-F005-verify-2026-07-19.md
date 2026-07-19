# AGENT-FOUNDATION F005 验收报告 — Agent 运行时 + 唯一工具注册表/执行入口 + 工具二分

- **批次 / Feature：** AGENT-FOUNDATION / F005（且仅 F005；F006-F010 未实现属正常）
- **验收人：** Andy/evaluator-subagent（隔离 fresh context，无自评铁律）
- **验收日期：** 2026-07-19
- **被验提交：** `0f882cc`（feat: Agent 运行时 streamText loop + 唯一工具注册表/executeTool + 工具二分 + search_kols/get_kol_detail）
- **总判定：** **PASS**（8/8 acceptance 子条 + 构建门/Agent门/密钥门全绿；4 项非阻断观察，记录不打回）
- **环境：** docker `newkolmatrix-dev-db`（healthy，2524 KOL seed，slug=dev）；`.env` 有 DATABASE_URL + AIGCGATEWAY_*（真实网关，key 已 mask）；prod 模式 `next start` 实测

---

## 一、被验对象（亲自读全文）

| 文件 | 职责 |
|---|---|
| `src/app/api/agent/route.ts` | 柱二：streamText 流式 agent loop（POST NL / messages）|
| `src/lib/agent/execute.ts` | 唯一执行入口 executeTool（zod 校验 + class 分流 + OutboundGateError）|
| `src/lib/agent/tools/registry.ts` | 唯一工具注册表（register/get/list，重名抛错）|
| `src/lib/agent/tools/types.ts` | ToolClass/ToolSource/ToolDefinition/ToolContext 契约 |
| `src/lib/agent/to-ai-sdk-tools.ts` | 注册表→AI SDK ToolSet 桥接（每 execute 委托 executeTool）|
| `src/lib/agent/context.ts` | buildToolContext（单 dev tenant，传输无关适配点）|
| `src/lib/agent/tools/search-kols.ts` | search_kols（NL→bge-m3→pgvector cosine top-K，internal/native）|
| `src/lib/agent/tools/get-kol-detail.ts` | get_kol_detail（internal/native）|
| `src/lib/agent/tools/index.ts` | native 工具幂等装配 + getNativeToolNames |
| `scripts/test/agent-tools-smoke.ts` | 工具层 smoke（直调 executeTool）|
| `src/lib/ai/gateway.ts` | F003 网关 + F005 兼容加固（resilientFetch / embedText 直连）|

---

## 二、逐条 acceptance 结论（亲自运行/亲自读码）

### C1 — POST NL → /api/agent → 调 search_kols → 流式返回工具结果 + 文本  → **PASS**

prod 模式 `next start`，3 条不同 NL query 均产出完整 2 步流式 loop（首请求即成功，符合 prod 路由预编译）：

- **Q1 「帮我找几个坦克世界解说 YouTuber」**：事件序列 start → start-step → text-delta(415) → tool-input-start(search_kols) → tool-input-delta(30, 流式拼 `{"query":"坦克世界解说 YouTuber","platform":"youtube"}`) → tool-output-available → finish-step → start-step → text → finish。tool-output 返回 **10 条真实 seed KOL**，按 similarity 降序：
  - `SKIFler` @SKIFler_WOT youtube 乌克兰 followers=4270 **sim=0.6456**
  - `The_Viper_UA` @TheViperUA 乌克兰 5130 sim=0.5947
  - `The Best Replays World of Tanks` @TheBestReplaysWorldofTanks 733 sim=0.5927
  - `PWN-G | WoT Replays` @PWN-G 1190 sim=0.5897
  - `__X__` @XWorldofTanksBestbatles 3710 sim=0.5802 …（降至 0.5488）
  - 第二步文本答复**忠实复述真实工具结果**（SKIFler 4.2K / The_Viper_UA 5.1K），无编造 KOL。
- **Q2 「我想找做 Minecraft 建筑和生存的主播」**：2 步；tool query「Minecraft 建筑和生存 主播」count=10；命中 `JDP Build's`(cats=沙盒,gaming)、`MineMigg`(沙盒,gaming)、`Kodek`(Casual,gaming)——语义相关。
- **Q3 「find me some english tech gadget review youtubers」**：2 步；tool query「English tech gadget review YouTuber」；命中 `Tools and Gadgets` sim=0.6733、`Cool Products` 0.6561、`Coolest Gadgets` 0.6397——语义相关。
- **Q4（多工具链）「找一个 Minecraft 主播，然后告诉我排第一那个的详细资料」**：3 步；先 search_kols(`{"query":"Minecraft 主播","topK":10}`)，再 get_kol_detail(`{"idOrPublicId":"cmrrlq78l009a9y7jtc59p4db"}`，id 取自 search 结果)，无 error——证明**两个 internal 工具经 HTTP agent loop 均可达且能链式调用**。

**真实性判定：** tool-output 里的 displayName/handle（@SKIFler_WOT、@TheViperUA、@PWN-G 等具体频道句柄）+ similarity 分值均来自 F004 seed（2524 KOL），非编造；`__X__` 是 seed 中真实频道名（handle @XWorldofTanksBestbatles），非脱敏占位。

### C2 — 工具 IO 用 zod 校验  → **PASS**（附非阻断观察 O1）

- 入参 zod 在**两道边界**均生效：`executeTool` 内 `tool.inputSchema.safeParse`（execute.ts:33），AI SDK 桥接层 `inputSchema: def.inputSchema`（to-ai-sdk-tools.ts:23）。两工具各自 `z.object({...})`（search-kols.ts:11 / get-kol-detail.ts:9）。
- agent:smoke 实测：空 query 被 zod 拦截抛错（`executeTool 对非法入参（空 query）抛错`）。
- **观察 O1（非阻断）：** 工具**输出**仅 TypeScript 类型约束，**无 zod outputSchema**；架构稿 §5.2 参照 ToolDefinition 含 `outputSchema: ZodSchema<O>`。判 PASS 理由：面向不可信模型的入参边界已被 zod 全覆盖（载荷性验证），输出源自内部 DB 查询且当前无下游消费方；建议 F009 引入 harm schema 时补 outputSchema。

### C3 — 注册表声明 class + source；执行入口按 class 分流（outbound 拦截 F009 落地）  → **PASS**

- 契约：`ToolClass = internal|outbound`、`ToolSource = native|mcp`（types.ts:10-11）。两工具均 `class:'internal'` + `source:'native'`。
- 分流：`executeTool` 在 zod 校验后按 class 分流，`class==='outbound'` → 执行副作用**前**抛 `OutboundGateError`（execute.ts:42-45，标注 EXTENSION POINT F009）。
- **唯一执行入口铁律**：全仓 `grep runTool` 仅命中注释；仅一处 `export async function executeTool`（execute.ts:22）；无双语义并存（架构稿 §5.2）。
- agent:smoke 实测：临时注册 outbound 工具，`executeTool` 抛 `OutboundGateError` **且副作用未执行**（`sideEffect===false`，门控在 execute 之前）——outbound 门控挂载点就位。

### C4 — 注册表可扩展（加工具不改 route 核心；MCP 桥接扩展点就位但不实装）  → **PASS**

- registry.ts：`registerTool`（重名抛错，禁双语义）/`getTool`/`listTools`/`getToolNames`。装配集中在 tools/index.ts 的 `NATIVE_TOOLS` 数组 + `getNativeToolNames()`。
- route.ts **不硬编码工具接线**：`toAiSdkTools(getNativeToolNames(), ctx)`（route.ts:60）；工具名仅出现在 SYSTEM_PROMPT 引导文本，非结构耦合。**加工具 = 往 NATIVE_TOOLS 加一条**，route 核心不动。
- MCP 扩展点：`source:'mcp'` 类型就位；tools/index.ts 注释「未来在此按需从 MCP client 拉取并 register，本批不实装」——结构支持、client 未实装（符合 §3.2「不实装 MCP client，避免零业务设计」）。

### C5 — (D-INTEROP) executeTool 与传输入口解耦  → **PASS**

- `executeTool(name, rawInput, ctx)` 签名传输无关（execute.ts:22）；`ToolContext = { tenantId }`（types.ts:19），由 `buildToolContext()`（context.ts:28）构造，HTTP route 调它取 ctx。
- 注释明示未来 MCP server / agent API 适配层**调同一个 buildToolContext / executeTool**（context.ts:5、types.ts:15-17）；工具 `execute(input, ctx)` 不假设调用方是 useChat//api/agent。
- **本批不实装任何对外暴露**（符合 D-INTEROP「只留插座」）；EXTENSION POINT 注释见 types.ts:17、context.ts:27。

### C6 — 构建门（spec §6）：tsc --noEmit + lint + build 全绿  → **PASS**

删 `tsconfig.tsbuildinfo` + `.next/cache` 后：
- `npx tsc --noEmit` → **TSC_EXIT=0**
- `npx next lint` → **LINT_EXIT=0**（✔ No ESLint warnings or errors）
- `npx next build` → **成功**（✓ Compiled successfully in 5.3s；✓ Generating static pages 11/11；`/api/agent` 注册为 ƒ Dynamic server-rendered on demand）

### C7 — Agent门（spec §6）：POST NL → 流式 → search_kols 触发返回；工具 class 二分生效  → **PASS**（由 C1 + C3 覆盖）

### C8 — 密钥门（顺带核对）：无硬编码密钥；走 env  → **PASS**

gateway.ts 全程 `requireEnv('AIGCGATEWAY_BASE_URL'/'AIGCGATEWAY_API_KEY')` 从 `process.env` 读；`embedText` 用 env baseURL+apiKey 直连 `/embeddings`。代码内无字面量端点/密钥。（F003 已详验密钥门，此处顺带确认 F005 新增代码未引入硬编码。）

### 工具层 smoke（agent:smoke）总览  → **PASS**

`npm run agent:smoke` **exit 0**，11 条断言全绿：native 工具已注册 / search_kols class=internal / source=native / 返回 5 条 / 按 similarity 降序 / get_kol_detail 命中 / 空 query zod 抛错 / 未知工具抛错 / outbound 门控 OutboundGateError / 副作用未执行。

---

## 三、非阻断观察（记录，不打回）

- **O1（IO zod）：** 工具输出无 zod outputSchema（仅类型约束）；架构稿 §5.2 参照含 outputSchema。入参边界已 zod 全覆盖；建议 F009 harm schema 落地时一并补输出校验。
- **O2（流式可靠性）：** ~9 次请求中出现 1 次瞬时网关连接错误 `TypeError: terminated cause=SocketError: other side closed`；该错误**经流式 error part 清晰抵达前端且服务端 console.error 记录，非静默吞**（满足「错误清晰不静默」）。随后 7/7 连续成功。属网关/网络侧瞬时抖动，非 F005 代码缺陷；acceptance 不要求零抖动。
- **O3（next start 警告）：** `next.config.js` 的 `output:'standalone'` 来自**其他批次（CICD-VPS，非 F005）**，导致 `next start` 打印「does not work with output: standalone」告警；但路由在 `next start` 下**实测正常服务**（所有 HTTP 测试通过）。生产部署应改用 `node .next/standalone/server.js`。超出 F005 scope，不影响本 feature 判定。
- **O4（ToolContext 最小态）：** ctx 当前仅 `{ tenantId }`（D4 单租户）；actor/agentId/persona scope/确认令牌按 EXTENSION POINT 明确分期到 F006/F009。符合本批预期。

---

## 四、独立性与边界声明

- 本报告结论均基于验收人**亲自运行的命令输出**（agent:smoke / tsc / lint / build / 4 组真实 curl 流式响应）与**亲自读到的代码**，未采信任何实现叙述、commit message 或 session_notes 的质量断言。
- 验收过程**未修改任何产品代码**（src/** / route / gateway / next.config / package.json 均未改）；`git status` 仅有本会话前已存在的 docs/ 变更。
- 结束前已 kill prod server（pid 37650），端口 3000 已释放。
- 报告中未出现任何真实密钥明文。

**最终判定：F005 = PASS。** 呈编排者原样转达用户，待用户拍板后开工 F006。
