# M1-D-KNOWLEDGE F005 — prompt ⑤层知识注入（U4）· 首轮验收（round 1）

- **验收人：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-22
- **被验 commit：** `cdc08ac`（feat(M1-D-KNOWLEDGE-F005)），验收时 HEAD = `ecde6cd`
- **结论：PASS**（acceptance 6 子项全 PASS，含 L2 真网关对话实测）

---

## 1. 环境前置（testing-env-patterns 对照）

| 检查 | 结果 |
|---|---|
| Node 版本 | 本机 v25.7.0，项目无 `.nvmrc`，CI 锁 Node 20；vitest `environment: 'node'`（无 jsdom）→ Node 25 已知误报面不适用 |
| `prisma generate` 先于 tsc（§3） | 已执行 |
| DB 基线态 | Game=4（game-xg/lc/aw/mf）· Material=0 · GameKnowledge=0（测前实查） |
| 端口纪律 | 未触碰 :3000；L2 服务起在 127.0.0.1:3101（31xx 段） |

## 2. L1 静态与测试证据

### 2.1 registry.ts persona 扩 `knowledgeKinds?`（映射 grep + 实读）

`grep -rn "knowledgeKinds" src/` 命中且仅命中预期站点：

- `registry.ts:41` — `knowledgeKinds?: KnowledgeKindValue[]` 类型声明（可选字段）
- `registry.ts:86` — strategy = `['selling_point','audience','compliance_redline']`（三类全量）✅
- `registry.ts:96` — match = `['audience']` ✅
- `registry.ts:106` — reach = `['selling_point']` ✅
- `registry.ts:134` — compliance = `['compliance_redline']` ✅
- orchestrator / delivery / insight 未声明（本批不消费知识，单测断言 undefined）✅

### 2.2 `src/lib/agent/knowledge-context.ts` 实读

- `gameKnowledgeSection(projectId, kinds)`：Project 三口径 OR（id/publicId/slug）→ `project.gameId` → `getKnowledgeHeads(gameId, kinds)`（`query.ts:19` 链头恒定口径 `supersededById: null`）→ `renderKnowledgeSection` ✅
- 溯源计数：`new Set(heads.flatMap(h => h.sourceMaterialIds)).size` 去重并集，渲染为「基于 N 份素材解析」✅
- 不注水：`!kinds || kinds.length===0` → `''`；项目不存在 / 未关联游戏 / 无链头 → `''`；取数异常 catch → `''`（D2 不打死对话主链路）✅

### 2.3 route.ts 装配点（唯一调用点 grep 核销）

- `route.ts:97-99`：`copilot.projectId ? await gameKnowledgeSection(copilot.projectId, persona.knowledgeKinds) : ''` —— **projectId 空则跳过** ✅
- `route.ts:108-110`：`system = persona.systemPrompt + knowledgeSection + 工具指引` —— 拼接语义与单测口径一致 ✅
- 全仓 grep `gameKnowledgeSection`：src/ 内仅 route.ts 一个调用点，无旁路注入 ✅

### 2.4 单测（mock 数据不打网关）

`tests/unit/knowledge-context.test.ts` — **8/8 passed**（单跑复核 + 全量 224/224 内均绿）：

- 空 heads → 空串；知识段含游戏名 + 溯源计数（m1/m2 去重=2）+ 三类标签内容 + 「不编造」纪律行
- persona kinds 映射 4 人格断言 + 3 人格 undefined 断言
- 拼接产物同时含人格边界与知识段；无知识 → 拼接产物与原 systemPrompt **逐字一致**

配套集成测试 `tests/integration/knowledge-injection.test.ts`（打真库，不打网关，夹具自建自清）— 4/4 passed：三口径等价 · kinds 过滤（audience 段不含卖点）· 链头恒取（superseded 旧行「已取代」不进 prompt）· 缺失链路各环节空串（含无 game 孤儿项目）。测后自清已实证（见 §4）。

### 2.5 L1 回归三件套

```
npx prisma generate && npx tsc --noEmit   → exit 0（0 errors）
npm run lint                              → ✔ No ESLint warnings or errors
npm run test:unit                         → 20 files / 224 tests 全 passed（含 F005 单测 8 + 集成 4）
```

## 3. L2 真网关对话实测（已授权，最小用量）

**方法：** `next build`（exit 0）→ standalone 起 `127.0.0.1:3101`（testing-env-patterns §7，不走 next dev）→ psql 直插 3 条 GameKnowledge 链头（game-xg，内容为验收现场虚构的独有标记词，模型先验不可能命中）→ POST `/api/agent`。

```bash
curl -X POST http://127.0.0.1:3101/api/agent -H 'Content-Type: application/json' -d '{
  "prompt": "用三行分别概括本作核心卖点、核心受众画像、预热期合规红线。",
  "context": { "projectId": "xg", "agentId": "strategy", "route": "/admin" }
}'
# → HTTP 200 in 3.78s · x-agent-id: strategy · x-agent-tools: get_kol_detail,compute_health
```

**回复全文（text-delta 拼接）：**

> 以下是对《星轨协议》的概括：
> **核心卖点**：轨道跃迁沙盒建造玩法 + 跨星系拍卖行经济系统，S27 赛季新增「虹吸者」阵营。
> **核心受众画像**：25-34 岁硬核太空模拟玩家（占比 61%），Discord 二创社区月活 4.2 万，核心圈层明确且社区粘性高。
> **预热期合规红线**：严禁展示未公开的「第七星域」地图与内购定价页内容。

**标记词命中 8/8：** 轨道跃迁 ✓ 跨星系拍卖行 ✓ 虹吸者 ✓ 25-34 ✓ 61% ✓ 4.2 万 ✓ 第七星域 ✓ 内购定价 ✓ —— 这些内容为本轮验收现场虚构并直插 DB，回复只能来自 ⑤层注入链路（DB 链头 → gameKnowledgeSection → system prompt → 真模型），**strategy 人格对话可引用知识内容实证成立**。

**L2 用量记录：**

| 项 | 值 |
|---|---|
| 调用次数 | 1 次 chat（F005 仅需 chat；vision 属 F003 验收范围，本流未使用） |
| 模型 | `deepseek-v3`（DEFAULT_CHAT_MODEL，.env 无 AIGCGATEWAY_CHAT_MODEL 覆盖）经 aigc.guangai.ai 网关 |
| 输入估算 | system（人格 ~160 汉字 + 知识段 ~200 汉字 + 工具指引 ~80 汉字）+ user ~30 汉字 ≈ 400–600 tokens |
| 输出估算 | 116 个 text-delta ≈ 160 汉字 ≈ 150–250 tokens（流内无 usage 元数据，按字数估算） |
| 成本估算 | < $0.0003（$0.26/$0.38 per 1M） |

## 4. 决定论复原（D-H）

- 停 standalone 服务（PID 87631，复查端口无响应）✅
- `DELETE 3` 条测试知识行 → 实查 **Material=0 · GameKnowledge=0 · Game=4 · Project=4**（= 视觉基线态）✅
- 近 30min PendingAction=0 / OperationLog=0（对话未调工具，无副作用行）✅
- 无 `.materials/` 目录生成；临时产物（headers/stream/server.log）均在系统临时目录并已清理 ✅

## 5. acceptance 逐条判定

| # | 子项 | 判定 | 证据 |
|---|---|---|---|
| 1 | registry.ts 扩 knowledgeKinds?（strategy 三类全量 / match=audience / reach=selling_point / compliance=redline） | **PASS** | §2.1 grep + 实读 + 单测映射断言 |
| 2 | knowledge-context.ts gameKnowledgeSection：经 Project.gameId 查链头拼知识段（含溯源计数），无知识空串不注水 | **PASS** | §2.2 实读 + 集成测试 4/4（真库）+ 单测溯源计数去重断言 |
| 3 | route.ts 装配点拼接（ctx.projectId 空则跳过） | **PASS** | §2.3 route.ts:97-110 实读 + 唯一调用点 grep |
| 4 | 单测断言 prompt 拼接产物含知识段 + kinds 过滤正确（mock 不打网关） | **PASS** | §2.4 单测 8/8（纯函数，无网关调用） |
| 5 | 真对话实测（L2，本轮已授权） | **PASS** | §3 虚构标记词 8/8 命中 + x-agent-id: strategy |
| 6 | lint + tsc + test:unit 绿 | **PASS** | §2.5 三件套 exit 0 / 224 全绿 |

**结论：F005 = PASS（6/6 子项）。**
