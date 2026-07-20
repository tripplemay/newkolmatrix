# AGENT-FOUNDATION Signoff 2026-07-20

> 状态：**Evaluator 首轮验收完成，批次末全链路回归全绿**（F010 待用户拍板后置 done）
> 触发：F010（本批最后一个 feature）首轮独立验收 PASS + spec §5 批次末全链路回归。
> 验收人：**Andy/evaluator-subagent**（隔离 fresh context，未参与任一 feature 实现）
> 被验产品代码 SHA：`12e304b`（CI 四 job 全 green）；HEAD=`0884260`（较 12e304b 仅多一条 `progress.json` chore，paths-ignore，产品代码等价）
> 环境：macOS darwin · node v25.7.0 · docker pg16+pgvector0.8.5 healthy · aigcgateway 活网关

---

## 整体批次结论：**PASS（无阻断）**

F001–F010 十个 feature 全部 PASS；§6 验收总纲各门批次末回归**全绿**；仅 1 项非阻断 README 散文命名漂移已记账（Soft-watch，有明文兜底）。

---

## F001–F010 最终状态

| Feature | 标题（摘） | 验收轮次 | 最终 verdict |
|---|---|---|---|
| F001 | TS5 迁移 + 版本锁定 | 首轮 | PASS |
| F002 | 全栈化 + DB/pgvector + schema + 运行时表(PendingAction/OperationLog/Handoff) | 首轮 | PASS |
| F003 | aigcgateway ⇄ Vercel AI SDK(chat tool-call + bge-m3) | 首轮 | PASS |
| F004 | CSV seed ~2500 KOL + bge-m3 入 pgvector | 首轮 | PASS |
| F005 | Agent 运行时 streamText loop + 唯一工具注册表/executeTool + 工具二分 | 首轮 | PASS |
| F006 | 多 Agent 编排框架(registry+router+handoff+orchestrator) | 首轮 | PASS |
| F007 | 常驻对话面 useChat + Generative Canvas + 多人格切换 + 协同交接可视化 | 复验(fix_rounds=1) | PASS |
| F008 | IA 侧栏 6 项 + 项目空间是五环节唯一容器 | 首轮 | PASS |
| F009 | AI→人闸门 outbound 服务端强制 + harm zod + 留痕 + 变异测试 | 首轮 | PASS |
| F010 | e2e hello-agent(多 Agent 编排) + 架构文档 + visual baseline | 首轮 | PASS |

> F007 经一轮 fixing/reverifying（fix_rounds=1，`route`/`outreach` 子串误配修复）；其余首轮 PASS。逐 feature 报告见 `docs/test-reports/AGENT-FOUNDATION-F00N-verify-*.md`。

---

## §6 验收总纲各门 — 批次末全链路回归（Evaluator 亲跑，真实输出）

| 门 | 命令 / 依据 | 结果 | 关键证据 |
|---|---|---|---|
| **构建门** | `tsc --noEmit` / `next lint` / `next build` | **GREEN** | tsc exit 0；lint「✔ No ESLint warnings or errors」exit 0；build exit 0，Generating static pages 21/21，全路由就位(/api/agent · /api/gate/confirm · /api/gate/reject · /api/handoffs · /preview/agent-canvas)，standalone 产物 OK |
| **数据门** | `npm run db:smoke` + DB 实测 | **GREEN** | db:smoke 全断言过；counts kol=2524(≥2000)含非空 embedding、user=1 dev、tenant=1；pgvector 0.8.5；Kol.embedding=vector(1024)；cosine top-1=自身、排序生效 |
| **AI 门** | `npm run ai:smoke` | **GREEN** | 双链路过：chat finishReason=tool-calls + 命中 get_kol_count(platform=youtube)；bge-m3 维度=1024 全有限值；usage 真实计量(in=368/out=46) |
| **Agent 门** | `npm run agent:smoke` | **GREEN** | 10 断言全过：search_kols class=internal/source=native/返回 5 条按 similarity 降序、get_kol_detail 命中、空 query zod 抛错、未知工具抛错、outbound 无令牌返 pending 信封(含 harm)+副作用未执行 |
| **编排门** | `npm run orch:smoke` | **GREEN** | registry 7 人格；route→人格(creators→match/knowledge→strategy/outreach→reach)；match 工具子集[search_kols,get_kol_detail]≠strategy[get_kol_detail]；handoff 落 F002 Handoff 表(fromAgent=match/toAgent=reach §5.4)、接收方获重读指令、错误接收者被拒；orchestrator 路由到某项目某环节；aggregatePending 原值原样返回(编排不改写/软化) |
| **交互门 / e2e** | `npm run f010:e2e`(next dev :3000 + seed) | **GREEN** | 6/6：NL→search_kols→15 张 KOL 卡片画布渲染、match→reach 人格可见切换、协同交接可视化一次 handoff、console error=0 |
| **视觉门** | `npm run test:visual`(standalone :3000) | **GREEN** | 2 passed(agent-canvas + today)；darwin+linux 基线均入 git；浅色(Read PNG 确认)；viewport 1512≥1440；linux 基线 CI 重生 |
| **闸门门** | `npm run gate:smoke` | **GREEN** | G1 服务端强制 pending 无令牌·G2 harm 列全 3 收件人不折叠+红标「对外·不可撤销」·G3 internal 不弹框·G4 无阈值(50 位与 3 位同流程)·G5 令牌 sha256 hash+单次+同事务写 OperationLog kind:irrev；拒绝写 kind:block；**D20 变异测试：退回拦截→副作用发生→G1 断言必变红**(证验行为非验关键字) |
| **互操作门** | F002/F005 已验 + 代码未变 | **GREEN(承继)** | 核心实体 publicId/slug 稳定对外标识；executeTool 传输无关签名解耦；对外内容带 provenance(dataSource/fieldProvenance)；EXTENSION POINT 注释就位，本批未实装任何对外暴露/GEO 本体 |
| **IA 门** | F008 已验 + build 全路由 | **GREEN(承继)** | 侧栏 6 项(用户 2026-07-20 裁决按 PRD)、五环节在项目空间内部、无角色切换器/权限守卫；build 21/21 无死链 |
| **密钥门** | 全仓扫描 + env 走查 | **GREEN** | `.env` gitignored 未 track；gateway 全程 requireEnv 从 process.env 读，无硬编码端点/密钥；`.env.example` 仅 placeholder(pk_your_key_here) |
| **CI** | `gh run list --workflow=ci.yml` | **GREEN** | workflow_dispatch run 29749985679 (headSha=12e304b) **四 job 全 success**：Typecheck/Lint/Build/Visual regression。见下 §CI 说明 |

---

## CI 说明（SHA 对齐，evaluator.md §12）

- F010 feat 提交 `26ee34b` push 触发的 CI run(29749777138)**失败**，唯一失败 job = **Visual regression**（其余 Typecheck/Build/Lint 全 success）—— 原因为该提交仅带 mac(darwin)基线、linux 基线未随提交生成的经典跨平台像素差，**非产品缺陷**。
- 随后 `12e304b`「update linux baselines [skip ci]」补入 linux 基线；manual workflow_dispatch run(29749985679, headSha=`12e304b`)**四 job 全 success**。
- `git diff --name-only 12e304b..HEAD` = 仅 `progress.json`（paths-ignore 状态机文件）。**HEAD 产品代码 ≡ 12e304b**，等价四 job 全绿，SHA mismatch 不阻断签收（§12 chore-only 容许）。

---

## Soft-watch（明文兜底，evaluator.md §14(c)）

| # | 项 | 兜底 | 阻断? |
|---|---|---|---|
| S1 | `README.md:29` setup 散文写 `.env` 需 `OPENAI_API_KEY/OPENAI_BASE_URL`，实际为 `AIGCGATEWAY_API_KEY/AIGCGATEWAY_BASE_URL`（gateway.ts + .env + .env.example + CLAUDE.md 均正确，唯 README 一行散文漂移） | 建议 Generator 后续 chore 单行修正 README:29；Evaluator 不改产品文档基线。字面 acceptance 已达成 + 权威 setup 源(.env.example)正确 → 非阻断 | 否 |
| S2 | bge-m3 embedding usage total=0（网关未回传 embedding token / 未登记单价，成本骨架无 usage 时正确跳过） | F003 已记账；不影响维度/链路；成本真实持久化标 EXTENSION POINT 分期 | 否 |
| S3 | `send_outreach` 为 mock 副作用；真实幂等对外投递(OutboundAttempt/reconciliation/PA 7 态) | spec §7 明确分期 M3；架构文档 §7 已声明 | 否 |

---

## 未变更范围（本批 out-of-scope，spec §2/§7）

| 事项 | 说明 |
|---|---|
| 真实认证登录 / 多租户 RLS | 单租户 dev tenant(D4)，→ M5 |
| 领域环节真实业务能力(Brief/Match/Reach/Delivery/Insight) | 编排框架已成品，业务能力挂扩展点 → M1–M4 |
| MCP client 实装 | source:'native\|mcp' 抽象就位，本批不实装(无真实 MCP 需求) |
| 对外暴露(MCP server/agent API) / GEO 内容本体 | D-INTEROP 只留薄地基插座 → M4/M5 |

---

## 结论

**AGENT-FOUNDATION 批次 F001–F010 全 PASS，§6 各门批次末回归全绿，整体 PASS（无阻断）。** 唯一 README 散文命名漂移(S1)为非阻断、有明文兜底。

> 注：本批采用 spec §5 逐 feature 验收编排 —— F010 首轮 PASS 后由编排者呈现给用户拍板，用户确认后编排者置 `status=done` / `completed_features=10` / F010 `status=done`。Evaluator 不在本报告中翻转 status（结论原样落盘，状态流转归编排者+用户拍板闸门）。

_签收人：Andy/evaluator-subagent · 2026-07-20_
