# M1-D-KNOWLEDGE — knowledge 域纵切（素材上传 → AI 解析 → 知识注入）（普通批次）

> **批次类型：** 普通批次（全部 `executor:generator`），`planning → building → verifying → done`。
> **车道：** 快车道（单会话，Evaluator 隔离 subagent）。无 `role_assignments`。
> **Spec lock：** 2026-07-22 用户四裁决（§3 U1-U4，AskUserQuestion 实答）+ Planner 默认（§3 P1-P8）。
> **事实依据：** M1-C planning 的 knowledge 域专项勘查（recon-knowledge 报告，结论核到 文件:行）+
> 本次立项补核（gateway.ts chatModel 签名 / compose 卷面 / route.ts:102 prompt 装配点）+
> **网关 vision 实测**（铁律 8：qwen3.5-flash 经 OpenAI 兼容 API 识别 32×32 纯红图 → 「红色」，
> 附约束：图片最短边须 >10px，上游报 InvalidParameter）。
> **上游：** M1 三批（A/B/C）已交付上线 @ 8438dab；Game 行已 seed（game-{xg,lc,aw,mf}，
> canonical-projects.ts:114-119），Project.gameId FK 已接。

---

## 1. 背景与目标

M1 官方清单（architecture.md:1798 原文）唯一剩余项 = **knowledge 域（知识解析管道）**，M1-C F007 已把它
拆为 M1-D 独立行。本批立起「素材上传 → Material 落库 → 策略 Agent 解析 → GameKnowledge 三类 kind →
特点卡刷新 → prompt ⑤层注入」的完整动线（architecture §11.3，ADR-19 同步解析 + 前端轮询，不建队列）。

### 1.1 勘查核到的关键实物（recon-knowledge + 立项补核）

1. **页面全建好只换供给侧**：`knowledge/page.tsx`（13 行 RSC 壳，?game= searchParams）→
   `KnowledgeWorkbench`（130 行 'use client'：GameRail 264px 游戏列表 + MaterialsCard（UploadZone +
   重新分析）+ AnalysisCard（卖点/受众/红线/kb-use））。上传现为纯 mock 时序（setTimeout 1100ms 转 done，
   文件内容被丢弃）；数据契约 = `mock/knowledge.ts` 的 `GameKnowledgeEntry`（:34-52）。
2. **schema 缺口**：Game 仅 7 列最小占位（schema.prisma:146-159，注记「素材上传/AI 解析抽取 → M1」）；
   无 Material / GameKnowledge 表。目标态字段定义在 architecture §7.6（:900-908）。
3. **网关调用范式缺口**：src/ 内唯一模型调用是 route.ts:109 streamText；解析管道需首个 server 侧一次性
   generateText 调用点。`chatModel(modelId)`（gateway.ts:140）可传模型名——vision 走它即可。
4. **⑤层注入缺口**：registry.ts 无 knowledgeKinds 字段；prompt 装配点 = route.ts:102
   `persona.systemPrompt + …` 拼接处。
5. **部署卷面**：docker-compose.prod.yml 现仅 pgdata 卷（:69-71）；app 容器无文件卷。
6. **状态机义务**：Material.parseStatus 四态（pending→parsing→parsed/failed，:517）+ GameKnowledge
   supersede 链（:519，重解析不物理删）——**D20 状态机类须配变异测试**（architecture :479）。

---

## 2. 功能范围（6 条，全 generator）

### F001 schema：Material + GameKnowledge 两表 + zod 契约

- expand 迁移新增两模型（字段按 architecture §7.6 :900-908，均带 tenantId + publicId，软引用不强 FK 处
  沿 D13 先例）：
  - `Material`：gameId · type（lore/art/gameplay_doc/review/data/video 枚举）· source · fileName ·
    storageRef · mimeType · sizeBytes · parseStatus（enum pending/parsing/parsed/failed，@default(pending)）·
    parseError String? · parsedAt DateTime?
  - `GameKnowledge`：gameId · kind（enum selling_point/audience/compliance_redline）· content ·
    structured Json? · sourceMaterialIds String[]（**非空即知识溯源，空则非法 FR-11.9——应用层校验**）·
    confidence Float? · generatedBy（默认 'strategy'）· supersededById String?
- `src/lib/data/schemas/knowledge.ts`：两表 jsonb/深字段 zod + 解析产物 schema（LLM 输出的三类 kind 结构）。
- 单测：schema 解析宽松降级（脏数据 → null 不抛错，D2 同向）。
- schema+migration+引用代码同 commit；lint + tsc + test:unit 绿。

### F002 存储通道 + 上传 API（U2：本地盘 docker 卷）

- `src/lib/knowledge/storage.ts`：storageRef 读写适配——根目录 env `MATERIALS_DIR`
  （dev 默认 `./.materials`（gitignore），prod 挂卷 `/app/materials`）；写入 = `{gameId}/{cuid}-{safeName}`，
  路径穿越防护（basename 白名单化）；读取回条流。
- `POST /api/materials`：formData 上传（file + gameId + type）→ 校验（类型白名单
  pdf/txt/md/csv/png/jpg/webp + 上限 20MB + **图片最短边 >10px**（vision 实测约束，不满足 →
  parseStatus 直接 failed + parseError 明示，D2 诚实降级不静默）→ 存盘 → Material 落库
  parseStatus=pending → 返回 Material。rate-limit：复用/建 `rateLimitUpload`（tenantId 维度
  10 req/min，fail-open，escape `DISABLE_UPLOAD_RATELIMIT`——v0.9.11 框架硬要求）。
- `GET /api/materials?gameId=` 列表（轮询用，含 parseStatus）。
- video 类型：仅存元数据不解析（parseStatus 直接 parsed? 否——**failed 语义错误**；置 parsed 且
  parseError null 但不产知识也错。P6 裁决：新增枚举值不引入——video 落库后 parseStatus 恒 pending +
  parseError='暂不支持视频解析（M2+）'？也不对，pending 会被轮询误判。**定案：video/不可解析类型
  parseStatus=failed + parseError 明示「类型暂不支持解析」**——failed 可重试语义兼容未来能力升级，
  页面按 D2 显示诚实状态）。
- 集成测试：上传落盘+落库、路径穿越拒绝、超限拒绝；lint + tsc 绿。

### F003 解析管道（文本 chat + 图片 vision，U3）+ 状态机

- `src/lib/knowledge/parse.ts`：`parseMaterial(materialId)` —— pending→parsing →
  按 mimeType 分流：文本类（txt/md/csv 直读；pdf 经 pdf 文本抽取，若引第三方库须先查
  registry 有无带类型的成熟包）→ `generateText(chatModel())`；图片类 → `generateText(chatModel(VISION_MODEL))`
  以 image part 传入（**实测范式已通**）→ zod 校验 LLM 输出（F001 schema）→ 生成 GameKnowledge 三类 kind
  （supersede 旧链头：新条目落库 + 旧条目 supersededById 指新，同事务）→ parsed；任何失败 → failed +
  parseError（**不抛错到调用方，状态机内消化**）。
- 模型路由（P4）：文本 = DEFAULT_CHAT_MODEL；图片 = env `AIGCGATEWAY_VISION_MODEL` 默认
  `qwen3.5-flash`（vision 实测可用 + 最低价 $0.065/1M）。`logUsage()` 照记。
- `POST /api/materials/{id}/parse`：触发解析（上传后自动触发一次 + 「重新分析」按钮复用；ADR-19
  同步执行 + 前端轮询，不建队列；进程内防重入——同 material 并发 parse 直接拒）。
- **D20 变异测试**（状态机义务）：四态流转 + supersede 链 + 「读取恒取链头」各配变异断言
  （tests/，mock 网关——解析调用注入可替换（P7 测试边界：单测不打真网关，L2 留验收授权））。
- lint + tsc + test:unit 绿。

### F004 knowledge 页面接真 + mock 退役

- `knowledge/page.tsx` RSC 直读（**force-dynamic，v1.0.9 §6 硬要求**）：Game 全列 + 各 Game 的
  Material 列表 + GameKnowledge 链头（selling_point/audience/compliance_redline）组装为页面契约 prop
  （可序列化，沿 ProjectDetailData 范式）。
- `KnowledgeWorkbench` 保 'use client'（上传/轮询/tab 交互）：UploadZone onFiles → POST /api/materials
  → 触发 parse → 轮询 GET 至 parsed/failed → `router.refresh()` 刷新 RSC 数据；「重新分析」接
  POST parse。**mock 时序（setTimeout 1100）与 `mock/knowledge.ts` 退役**——按被删路径 needle 全仓
  grep（v1.0.9 audit-methodology §2.1）。
- 空态/降级（D2）：无 Material →「上传素材开始分析」可见文案；parseStatus=failed → 红态 + parseError
  明示；GameKnowledge 空 → 特点卡「待解析」占位（保留区块结构）。
- 视觉基线：knowledge.png 漂移对账（mock 4 游戏数据 → CI DB 4 canonical Game 空态）——waitFor 锚点
  按新渲染实况校准 + 空态可见文案硬断言（§4.3）；**运行时改→验→复原实证**（v1.0.9 §6）。
- 两视口实测；lint + tsc + test:unit + test:visual 绿。

### F005 prompt ⑤层知识注入（U4）

- `registry.ts` persona 扩 `knowledgeKinds?: KnowledgeKind[]`：strategy = 三类全量；
  match = ['audience']；reach = ['selling_point']；compliance = ['compliance_redline']（architecture :907
  下游消费映射，本批仅注入 prompt，领域工具归 M2/M3）。
- `src/lib/agent/knowledge-context.ts`：`gameKnowledgeSection(projectId, kinds)` —— 经
  Project.gameId 查 GameKnowledge 链头 → 拼接知识段文本（含溯源计数）；无知识 → 返回空串（不注水）。
- route.ts:102 装配点拼接（persona.systemPrompt + 知识段；ctx.projectId 为空 → 跳过）。
- 实测：xg 关联 Game 灌入知识后，strategy 人格对话可引用知识内容（agent:smoke 扩段或独立探针，
  网关调用属 L2——设计为可 dry 验证：单测断言 prompt 拼接产物含知识段，真对话留验收授权）。
- lint + tsc + test:unit 绿。

### F006 部署面：materials 卷 + env + 文档

- docker-compose.prod.yml：新增 `newkolmatrix-materials` 卷挂 app `/app/materials`；app 服务加
  env `MATERIALS_DIR=/app/materials`、`AIGCGATEWAY_VISION_MODEL`（.env 注入可覆盖）。
- `.env.example` 补 MATERIALS_DIR / AIGCGATEWAY_VISION_MODEL 注释项；`.gitignore` 补 `.materials/`。
- `docs/dev/deploy.md` 更新（卷备份注记：materials 卷纳入 R7 备份演练范围——M5 记账）；
  `docs/dev/agent-architecture.md` / architecture.md 相应段落 as-built 标注（§7.6/§11.3 翻牌）。
- lint + tsc 绿；部署验证随批次上线时执行。

---

## 3. 关键设计决策

### 用户裁决（2026-07-22 AskUserQuestion 实答）

- **U1 四条 learnings 全 Accept** → 已沉淀 v1.0.9（commit 888bb60），本批 spec 已内嵌其硬要求
  （force-dynamic / 被删路径 grep / CI watch 过滤 / 收敛声明逐份 diff）。
- **U2 存储后端 = 本地盘 docker 卷**：零成本零新依赖，单 VPS 自足；跨机迁移搬卷，M5 再评估对象存储。
- **U3 解析范围 = 文本 + 图片 vision**：图片走网关 vision（**已实测可用**）；video 仅存元数据
  （failed + 明示文案，F002 定案）。
- **U4 含 ⑤层注入**：知识立即在 Agent 对话可感知，价值兑现闭环。

### Planner 默认（P1-P8）

- **P1 上传通道 = route handler（POST /api/materials）**非 server action：formData 大文件 + 无 1MB
  默认限制 + 与轮询 GET 同域对称。
- **P2 解析同步 + 前端轮询**（ADR-19 锁定，不建队列）；进程内防重入拒并发同 material 解析。
- **P3 supersede 同事务**：新链头 + 旧条目 supersededById 同一 transaction（读取恒取
  supersededById IS NULL）。
- **P4 模型路由**：文本 = DEFAULT_CHAT_MODEL（现 deepseek-v3，无 vision）；图片 = env
  AIGCGATEWAY_VISION_MODEL 默认 qwen3.5-flash（实测 + 最低价）。NFR-P8 同向。
- **P5 图片最短边 >10px 前置校验**（vision 实测发现的上游硬约束）——上传时校验优于解析时炸。
- **P6 不扩 parseStatus 枚举**：不可解析类型走 failed + parseError 明示（可重试语义兼容能力升级）。
- **P7 测试边界**：解析管道单测 mock 网关（注入可替换调用）；真网关调用属 L2 留验收授权；
  vision 可用性已由立项实测背书（本 spec 头部记录）。
- **P8 rate-limit**：上传 10 req/min/tenantId fail-open + escape env（v0.9.11 矩阵 AI 调用类比照）。

## 4. 数据准备步骤（Evaluator 验收前提）

- migrate deploy + seed:projects（4 Game 行就位）；MATERIALS_DIR 指向临时目录。
- 解析实测正样本：一份小 txt/md 素材（夹具自备）+ 一张 ≥32px 测试图；实测毕清 Material/GameKnowledge
  表复原（视觉基线态 = 零素材空态，沿 D-H 决定论纪律）。
- L2 边界：真网关解析调用（chat/vision）计费——验收时如需实测以最小素材执行并在报告注明用量。

## 5. 验收口径（verifying）

- **fan-out**：6 features ≥4 → fan-out + 对抗复核（orchestration §4，沿 M1-B/M1-C Workflow 模式）。
- **F001**：两表在库（\\d 实证）+ zod 宽松降级；**F002**：上传落盘落库 + 路径穿越/超限/小图拒绝 +
  rate-limit 三案例；**F003**：四态流转 + supersede 链 + 变异测试活性 + mock 网关边界；
  **F004**：页面真数据（改→验→复原）+ force-dynamic + prerender-manifest 不含该路由 + mock 零残留
  （被删路径 needle）+ 基线对账；**F005**：prompt 拼接产物含知识段（单测）+ persona kinds 映射 grep；
  **F006**：compose 卷/env/文档对位。
- **就绪回归**：lint + tsc + test:unit + test:visual 全绿；三条 p2 探针 + f007/f008/f010 无回归。

## 6. 不在本批次

- 对象存储迁移（M5 评估）· video/pdf-OCR 深解析（M2+）· 知识下游领域工具消费
  （match/reach 工具归 M2/M3）· 徽标服务/洞察页接真（既有登记）· `parse_material`/`draft_brief`
  工具化（architecture :1098 目标态，随 M2 补 tools）。
