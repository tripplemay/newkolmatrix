# M1-D-KNOWLEDGE F003 首轮验收证据（round 1）

- **Feature:** F003 解析管道（文本 chat + 图片 vision）+ 状态机变异测试
- **判定：PASS**
- **Evaluator:** Andy/evaluator-subagent（隔离 fresh context）
- **日期:** 2026-07-22 · **HEAD:** ecde6cd · **Feature commit:** 2c0abd0
- **L2 用量（真网关，已获授权，最小素材）：**
  - chat（文本路径）：`deepseek-v3` in=342 out=123 total=465 est≈**$0.000136**（406B md 素材，2.9s）
  - vision（图片路径）：`qwen3.5-flash` in=389 out=667 total=1056 est≈**$0.000199**（480×320 PNG 14.6KB，10.2s）
  - **合计 ≈ $0.000335**（2 次调用；pdf 分支用 mock LLM 注入验证，零网关成本）

## 1. 测了什么 / 怎么测

| # | 验证面 | 手段 |
|---|---|---|
| 1 | 管道代码审读 | 读 `src/lib/knowledge/parse.ts` / `query.ts` / `storage.ts` / `src/app/api/materials/[id]/parse/route.ts` / `src/lib/data/schemas/knowledge.ts` / `src/lib/ai/gateway.ts` 全文，对照 acceptance 逐项 |
| 2 | L1 门（前置：`npx prisma generate` 先行，testing-env-patterns §3；vitest env=node 无 jsdom，Node 25 无碍） | `npx tsc --noEmit` → exit 0 · `npm run lint` → 0 err 0 warn · `npm run test:unit` → **20 files / 224 tests 全绿** |
| 3 | D20 变异测试存在性 + 覆盖面 | `npx vitest run tests/integration/knowledge-parse.test.ts tests/unit/knowledge-parse-output.test.ts --reporter=verbose` → 15/15 绿（打真库 + mock 网关，P7） |
| 4 | **变异测试活性实证**（§5 口径，宁严勿宽） | 隔离 git worktree 副本（scratchpad，**项目工作树零改动**）注入 3 个状态机变异，逐个复跑集成测确认被杀（见 §3） |
| 5 | **L2 真网关实测**（授权动用，最小素材） | scratchpad 脚本 `f003-l2-run.ts`：夹具 Game 自建 → md 素材经 **route handler 直调**（404/409/200 三态）→ PNG 素材直调 `parseMaterial`（vision 默认模型）→ 链头/链身核验 → 全量复原 |
| 6 | pdf 文本抽取分支 | scratchpad 脚本 `f003-pdf-check.ts`：cupsfilter 生成真 PDF（`file` 验证 magic bytes）→ mock LLM 捕获 prompt，断言 unpdf 抽出文本确实入 prompt 且 mode=text |
| 7 | 「读取恒取链头」零绕过 | 全仓 grep：`gameKnowledge.findMany/findFirst/findUnique` 在 `query.ts` 之外零命中（消费方全部经 `getKnowledgeHeads`） |
| 8 | 上传后自动触发 + 重新分析复用 | `KnowledgeWorkbench.tsx:159`（上传后 `POST /api/materials/{id}/parse`）+ `:189`（重新分析逐个 POST 同端点，analyzing 中跳过）代码实证 |
| 9 | D-H 复原 | 测前/测后 psql 计数比对（见 §5） |

## 2. acceptance 逐条判定

| acceptance 子项 | 判定 | 证据 |
|---|---|---|
| `parse.ts parseMaterial`：pending→parsing→按 mimeType 分流 | ✅ | 代码 `parse.ts:146-168`（txt/md/csv 直读、pdf 走 unpdf、图片走 vision）；集成测「中途实测 parsing」断言；L2 实测 409 响应体内 `parseStatus:"parsing"` 中间态可见 |
| 文本直读 / pdf 文本抽取 | ✅ | 文本：L2 真网关 md → parsed；pdf：`f003-pdf-check.ts` → `[pdf-mode] text` + `[pdf-prompt-contains-extracted-text] true` + parsed |
| 图片 image part 走 `chatModel(AIGCGATEWAY_VISION_MODEL 默认 qwen3.5-flash)` | ✅ | `.env` 无覆盖项（grep 0 命中）→ 运行时打印 `[vision-model] qwen3.5-flash`；L2 真 vision 调用 480×320 海报 → parsed + 三类知识（内容与图内文字逐项对应，见 §4） |
| generateText → zod 校验 → 三类 kind 生成 | ✅ | `parse.ts:298-306` 严格校验（不合形 → failed，`hasAnyKnowledge` 全空 → failed）；L2 两路径均产 3 kind；集成测「LLM 输出垃圾 → failed + 零知识行」 |
| 【P3】supersede 同事务 + 读取恒取 `supersededById IS NULL` | ✅ | `parse.ts:310-338` 单一 `$transaction`（新链头 create + 旧链头 updateMany 回指 + material 置 parsed）；L2 实测二次解析后 6 行链：text 3 行全 superseded、image 3 行为 HEAD；`query.ts` 唯一读取口径 + 全仓零绕过 |
| 失败 → failed+parseError 状态机内消化不外抛 | ✅ | 集成测 4 案例（垃圾输出 / 三类全空 / LLM 抛错 / NOT_FOUND）+ `parse.ts:341-352` 兜底 catch 收敛 failed |
| `POST /api/materials/{id}/parse`（上传后自动触发+重新分析复用） | ✅ | route 存在且 L2 直调实测：404（假 id）/ 409（并发）/ 200（parsed + knowledgeCount=3）；自动触发 = `KnowledgeWorkbench.tsx:159`，重新分析复用 = `:189` |
| 【P2】同步+轮询不建队列+进程内防重入拒并发 | ✅ | route 同步 `await parseMaterial`（`maxDuration=60`），无任何队列依赖；in-flight Set 防重入；L2 真并发第二发 → **409**；集成测 ALREADY_PARSING 断言 |
| logUsage 照记 | ✅ | `parse.ts:106/:116` 两调用点；L2 stdout 捕获两行 `[ai/gateway] usage model=… est=…`（用量见头部） |
| 【D20】变异测试：四态流转+supersede 链+链头读取各配变异断言 | ✅ | `tests/integration/knowledge-parse.test.ts` 6 组变异断言（含防重入/failed 重试）；**活性实证 3/3 击杀**（§3） |
| 【P7】单测 mock 网关（解析调用可注入替换），真网关属 L2 | ✅ | `LlmCaller` 注入缝（`parse.ts:53-64`）；集成测全部 mock LLM 不打网关；真网关仅本 L2 动用 |
| lint + tsc + test:unit 绿 | ✅ | exit 0 / 0 warn 0 err / 224 passed（本机 Node 25，vitest env=node；CI Node 无关差异面） |

## 3. 变异测试活性实证（隔离 worktree，产品树零改动）

方法：`git worktree add --detach <scratchpad>/mutwt HEAD` + 软链 node_modules + 拷贝 .env；变异只落在副本，逐个复跑 `tests/integration/knowledge-parse.test.ts`；测毕 `git worktree remove --force`。

| 变异 | 注入内容 | 结果 |
|---|---|---|
| A：跳过 parsing 中间态 | 首个 update 去掉 `parseStatus:'parsing'` | ❌ 1 failed：`expected 'pending' to be 'parsing'`（变异断言 1 击杀） |
| B：链头读取去过滤 | `query.ts` 删 `supersededById: null` | ❌ 2 failed：`expected 6 to be 3` + `expected 2 to be 1`（变异断言 4 击杀） |
| C：supersede 不回写旧链头 | updateMany `data:{}` | ❌ 2 failed：`expected null to be 'cmrw…'`（方向断言，变异断言 3 击杀） |

基线（无变异）9/9 绿 → 3 个变异各自被对应断言精确杀死 = 检测器活着。

## 4. L2 真网关关键输出摘录

```
[route-404] status = 404 {"error":"素材不存在"}
[route-409-concurrent] status = 409 {"error":"该素材正在解析中，请勿重复触发","material":{…"parseStatus":"parsing"…}}
[ai/gateway] usage model=deepseek-v3 in=342 out=123 total=465 est=~$0.000136
[route-parse-text] status = 200 (2904ms) {…"parseStatus":"parsed","parsedAt":"2026-07-22T14:10:53.149Z"…,"knowledgeCount":3}
[vision-model] qwen3.5-flash
[ai/gateway] usage model=qwen3.5-flash in=389 out=667 total=1056 est=~$0.000199
[parse-image] (10196ms) ok = true {"knowledgeCount":3}
[head] kind=compliance_redline conf=0.95 content=所有赞助视频必须包含#ad披露；禁止使用未发布构建的游戏画面；禁止夸张胜率声明
[head] kind=audience conf=0.95 content=硬核FPS玩家(18-30岁) 60%；电竞赛事观众 30%
[head] kind=selling_point conf=0.95 content=双武器即时切换FPS；季节性排位PVP天梯；跨平台游玩
[chain] text×3 全 superseded=yes · image×3 全 HEAD（supersede 链真数据实证）
```

vision 输出与图内英文文字逐项语义对应（双武器切换/排位天梯/跨平台 · 18-30 硬核 60%+电竞观众 30% · #ad 披露/未发布画面/胜率夸大）——真实读图，非文件名泄露。

## 5. D-H 复原实证

```
测前 psql： Material=0 | GameKnowledge=0 | Game=4（game-aw/lc/mf/xg）
测后 psql： Material=0 | GameKnowledge=0 | Game=4
```

夹具 Game/Material/GameKnowledge 全删；scratchpad 内 `l2-materials*` 临时素材目录已 rm；变异 worktree 已 remove（`git worktree list` 仅余主树）；`git status` 项目树除本证据目录外零改动。L2 运行中曾观测到并行验收流（F005）的 3 行 GameKnowledge 中间态（挂在非本流 gameId 下），终检时已由该流自清——与本流无交叉污染。

## 6. 观察项（不阻断，供 signoff 汇总）

- **OBS-1（AI SDK 弃用告警）：** vision 调用触发 `DeprecationWarning: "image" content part type is deprecated. Use a "file" part with mediaType`（`parse.ts:94-97` 用 `type:'image'`）。当前 ai@7.0.31 运行正常、lint/tsc 绿，不违反 acceptance；建议后续批次顺手迁移 `type:'file'` 写法，防 SDK 升级破坏。

## 7. 复现步骤

1. 前置：`newkolmatrix-dev-db` 已起、`.env` 含 `DATABASE_URL`+`AIGCGATEWAY_*`、`npx prisma generate`
2. L1：`npx tsc --noEmit && npm run lint && npm run test:unit`
3. F003 专项：`npx vitest run tests/integration/knowledge-parse.test.ts tests/unit/knowledge-parse-output.test.ts --reporter=verbose`
4. 变异活性：worktree 副本注入 §3 三变异，逐个复跑步骤 3 集成测（预期各自失败）
5. L2（计费，需授权）：按 §1 表 #5/#6 脚本流程——最小 md+PNG 素材、route 直调 + parseMaterial 直调、测毕删夹具行核对 psql 计数回 `0|0|4`
