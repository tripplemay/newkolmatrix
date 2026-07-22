# M2-A-MATCH — match 域纵切第一批（建表 → 评分 → 组合 → 页面接真 → 批准解锁 →reach → 例程）（普通批次）

> **批次类型：** 普通批次（全部 `executor:generator`），`planning → building → verifying → done`。
> **车道：** 快车道（单会话，Evaluator 隔离 subagent）。无 `role_assignments`。
> **Spec lock：** 2026-07-22 用户四裁决（§3 U1-U4，AskUserQuestion 实答）+ Planner 默认（§3 P1-P8）。
> **事实依据：** M2 planning 三路勘查（recon-match-ui / recon-creators-kol / recon-m2-target，
> 2026-07-22，全部结论核到 文件:行）。
> **上游：** M1 全域（A/B/C/D）已交付上线 @ ecde6cd；Kol 2525 行 + embedding 已灌（bge-m3
> 生产验证，铁律 8 无新外部模型依赖）；知识域链头读取 `getKnowledgeHeads` 可供受众画像。

---

## 1. 背景与目标

M1 完成 project/brief/knowledge 域后，演进路线进入 M2 MATCH（architecture §14 :1804）。
按 U2 裁决本批为 **M2-A 纵切**：match 核心动线「候选生成 → 可解释评分 → 三组方案 → 对比矩阵/
待裁定接真 → 批准（internal 落库）→ 解锁 →reach → 夜间筛查例程」，外加两项遗留消解
（SW-R1 探针退役 U3、侧栏徽标接真 U4）。**创作者库/抽屉七分区接真与 Kol 深字段数据源裁决留 M2-B**。

### 1.1 勘查核到的关键实物

1. **Match 面全建好只换供给侧**：`src/components/envs/match/index.tsx`（321 行 'use client'）——
   CompareMatrix 独立 grid（:80-175，D8 非 DataTable）+ 待裁定 DataTable 5 列（:197-269）+
   D27 shield（:312-318）。数据 = 模块顶层 `readContractSlot(matchPlanListSchema, mockMatchPlans)`
   （:42-52）；「批准这组」= 纯 toast（:280-281，注释明记「真 MatchPlan approve → cur='reach'
   推进归 M2」:11-12）；「审阅」= toast（:189）。mock 契约 `src/lib/data/mock/env-match.ts`
   （133 行；:41 schema 锁 3 组；:15 注释「真数据源归 M2」；消费方唯一 = match/index.tsx:36）。
2. **DB/domain/API 零 match 实物**：schema.prisma 无 MatchPlan/PlanKol/MatchCandidate（grep 唯一
   命中 = enum Stage :105）；`domain/` 仅 env-advance/env-guards/health；无 match route。
3. **→reach 守卫待解锁**：env-guards.ts:115-117 `deny('DEPENDENCY_NOT_IMPLEMENTED')`，注释
   「依赖 status=approved 的 MatchPlan —— M2 建表」；judge 依据 architecture :487。守卫纯函数
   不读 DB（:5, :46-53 `EnvGuardContext{cur,maxReached,goal}`）——需扩 context。
4. **S10**：`advanceStage`（env-advance.ts:49-137，事务 = Project.update + OperationLog.create）
   当前唯一消费者为集成测试——批准→推进链路是首个生产消费点（M1-B signoff :165）。
5. **检索/评分基础**：search_kols 的 pgvector cosine raw SQL 范式（search-kols.ts:54-81，
   `embedText` 直连防并发 400）；`matchScore.compute` 目标态 = embedding cosine + audienceDemo +
   知识受众画像（architecture :526；公式落点 `domain/match-score.ts` :841；audienceDemo 全 null
   现状 → FR-11.6 降级纯向量分标「受众数据待接入」）。
6. **例程基础**：scheduler.ts as-built 硬编码单例程注册（:55-67），与 §14 :1815「自动获得调度」
   口径差——本批注册表化消解；nightly-screen 目标态 :1173 + §11.6 :1562-1566（internal only，
   无 outbound 直通 :1182）。
7. **侧栏徽标**：`src/components/sidebar/index.tsx:18` `NAV_BADGE_MOCK`（今天 3/项目 4/洞察 2
   硬编码假数，:73 渲染）；双 'use client' 无 server 通道（M1-C spec :61,:104 登记）。
8. **canvas ADR-28**：路由键改 `type` + 受控 register API「引入第二个多结果形态工具时一并做
   （建议 M2）」（architecture :1074/:1850）；uiSyntax 已定义未注入 prompt（:1032；
   buildSystemPrompt 只拼三段 registry.ts:50-61）。

---

## 2. 功能范围（9 条，全 generator）

### F001 schema：MatchPlan + PlanKol + MatchCandidate 三表 + zod 契约

- expand 迁移新增三模型（字段按 architecture §5.2 :464-466，均带 tenantId + publicId；
  ER :438-440）：
  - `MatchPlan`：projectId（真 FK → Project，沿 Game 先例）· name · metrics Json
    （{reachTotal:number|null, budgetUsd:number|null, risk:'low'|'mid'|'high'|null, people:number}，
    P6：budgetUsd 无真源恒 null）· rationale String · recommended Boolean @default(false) ·
    status enum MatchPlanStatus（draft/approved/superseded，@default(draft)）· approvedBy String? ·
    approvedAt DateTime?
  - `PlanKol`：planId（真 FK → MatchPlan，Cascade）· kolId（真 FK → Kol）· matchScore Float ·
    reasons String[]（**可解释依据必带，空则非法——应用层 zod 校验，同 FR-11.9 先例**）
  - `MatchCandidate`：projectId（真 FK）· kolId（真 FK）· verdict enum CandidateVerdict
    （pending/kept/dropped，@default(pending)）· doubts String[] · preJudge String
    （'高'/'中'/'?' 三态展示位）· matchScore Float? （null = 受众数据缺失致分不可算？否——
    P2 定案：score 恒可算（纯向量分兜底），null 仅当 embedding 缺失；显示层「待核」判定
    经 pending 语义，见 F005）· scorePending Boolean @default(false)（true = 降级纯向量分，
    显示「待核」——FR-11.6/裁决 #2 的 DB 承载）
  - `@@unique([projectId, kolId])`（MatchCandidate 幂等刷新键）
- `src/lib/data/schemas/match.ts`：metrics/reasons/doubts zod（读侧宽松降级 D2 + PlanKol.reasons
  写侧非空校验）。
- 单测：脏 metrics → null 不抛错；reasons 空数组写侧拒。
- schema+migration+引用代码同 commit；单租户 dev 不建 RLS（D4 先例）；lint + tsc + test:unit 绿。
- **D20 标注**：MatchPlan.status / MatchCandidate.verdict 两个状态字段的流转逻辑（F003/F004）
  须配变异测试（architecture :480 节头义务）。

### F002 domain/match-score.ts：可解释评分纯函数

- `matchScore.compute(input)` 纯函数（无 IO，架构 :526/:841）：输入
  `{ similarity: number, audienceDemo: unknown|null, knowledgeAudience: AudienceSlice[]|null }` →
  输出 `{ score: number(0-1), reasons: string[], pending: boolean }`；
  audienceDemo null（当前全 null，recon-creators §3）→ 纯向量分 + pending=true +
  reason「受众数据待接入」（FR-11.6）；knowledgeAudience（游戏知识受众画像链头）参与加权时
  reason 注明来源。权重常量导出可测。
- 三处复用铁律（:533）：页面通道 / 工具层 / 例程共用此单一真相源，spec 后续 feature 不得内联重算。
- 单测：边界（similarity 0/1、null 降级、知识画像有无、权重和为 1）；不打库不打网关。

### F003 候选生成 + 组合生成服务（src/lib/match/）

- `generateCandidates(projectId)`：Project.gameId → `getKnowledgeHeads(gameId,['audience'])`
  受众画像 + Project name/goal 构造查询文本 → `embedText`（**注入可替换，P7：单测/集成测 mock
  向量，不打网关**）→ pgvector cosine 检索 topN（复用 search-kols.ts:54-81 SQL 范式，N=20）→
  逐候选 `matchScore.compute` → upsert `MatchCandidate`（@@unique 幂等；verdict 保留人工态：
  已 kept/dropped 的不回退 pending——P4）；doubts 生成规则化（scorePending → '受众数据待接入'；
  score < 阈值 → '相似度存疑'）；preJudge 三态由 score 分档。
- `buildMatchPlans(projectId)`：从候选（verdict != dropped）规则化生成 3 组（P1，无 LLM 打分）：
  A·生活流精投组（score 优先、粉丝量中小）/ B·均衡组（recommended=true，分层混合）/
  C·头部拉动组（followers 加权）——命名沿 mock 语义（env-match.ts:44-78）；每组 PlanKol
  ≤10 人 + reasons 可解释（含 score 与入选规则）；metrics：reachTotal=Σfollowers（真）·
  budgetUsd=null（P6 无价格数据，显示层「待核」）· risk 由 doubts 占比分档 · people=数量；
  **supersede 语义（P4）**：新 3 组落库 draft + 旧 draft 置 superseded 同事务；approved 永不动。
- 集成测试（打真库 mock 向量）：候选幂等刷新 / 人工 verdict 保留 / 组合 supersede /
  approved 不动 /【D20】status/verdict 流转变异断言。
- lint + tsc + test:unit 绿。

### F004 批准动线 + →reach 解锁（S10 消解）

- `POST /api/match/plans/{id}/approve`（route handler，P1 先例）：**internal 动作——不产生
  PendingAction、无确认弹窗**（FR-7.19/D27/D16「选了就生效」；:1352 双边铁律：internal 一个
  确认框都不加）；事务：目标 plan status=approved + approvedBy('operator')/At + 同项目其余
  draft → superseded；随后调 `advanceStage(projectId,'reach')`（S10 首个生产消费者；advance
  失败（如已在 reach）不回滚批准，响应注明）。
- →reach 守卫解锁：env-guards.ts:117 `DEPENDENCY_NOT_IMPLEMENTED` 分支替换为真判定；
  `EnvGuardContext` 扩 `hasApprovedMatchPlan: boolean`（纯函数边界保持，调用方组装——
  ProjectDetail RSC 与 advanceStage 两处调用点同步扩）；grep 字面量确认无残留分支漏改
  （env-guards.ts:27-33 检索法注释）。
- `POST /api/match/refresh?projectId=`：手动重跑 generateCandidates+buildMatchPlans
  （F005 首访 lazy 与 F006 例程之外的第三入口；本批无 UI 按钮（原型无），供验收与后续用）。
- 集成测试：批准事务原子性 / 单选语义（其余 draft→superseded）/ 批准後 canEnter('reach') 放行 /
  未批准拒 / 重复批准幂等或 409；【D20】approved 状态流转变异断言。
- lint + tsc + test:unit 绿。

### F005 match 语法面接真 + mock 退役

- campaigns/[id] RSC（page.tsx:21-75 范式）扩组装：`ProjectDetailData` 增 match 面数据
  （plans 3 组 + candidates 列表，可序列化；展示串格式化单点 `src/lib/display/match-format.ts`
  ——reachTotal→'240万' 风格 / budgetUsd null→「待核」/ risk→低中高 / bars 派生 = 组内
  PlanKol top6 matchScore 归一 0-9（P5，mock bars 展示位的真数据口径））；
  **首访 lazy 生成（P2）**：RSC 检测项目零 plans 且 cur∈{match 及以后} → 服务端同步
  generateCandidates+buildMatchPlans；生成失败（网关不可达，如 CI）→ **静默降级空态占位
  （log warn 不抛错，D2）**——CI 无凭据也必须构建/渲染安全。
- `match/index.tsx` 接新 prop：CompareMatrix/待裁定表消费真数据；候选「受众匹配」列
  scorePending → `待核`（裁决 #2 口径不变）；「批准这组」接 approve API → 成功 toast +
  router.refresh + 跳 `?env=reach`（原型 L995 语义）；「审阅」保持 toast（证据抽屉归 M2-B）；
  布局结构零变更（设计稿保护规则；ui-inventory V5 22 元素 🔒 清单 :68-69 逐项保持）。
- `mock/env-match.ts` 退役——按被删路径 needle 全仓 grep 零代码残留（v1.0.9 §2.1）+
  mock/index.ts 登记行翻牌。
- 视觉基线：project-match.png 漂移逐处对账后重生（CI DB 无 Kol seed → 空态占位 = 基线态；
  waitFor 锚点按新实况校准 + 空态可见文案硬断言 §4.3）；运行时改→验→复原实证（v1.0.9 §6；
  页面为 client 组件消费 RSC prop——实证对象 = RSC 组装层）；两视口实测。
- lint + tsc + test:unit + test:visual 绿。

### F006 nightly-screen 例程 + scheduler 注册表化

- scheduler.ts 注册表化（消解 :1815 口径差）：`ROUTINES: Array<{name, cron, run}>` 数组 +
  循环注册（runExclusive/ROUTINES_DISABLED/失败不炸进程语义逐条保持）；health-scan 迁入注册表
  （行为零变更——cron 常量与语义不动）。
- `src/lib/jobs/routines/nightly-screen.ts`：对 cur='match' 的在跑项目逐个
  generateCandidates+buildMatchPlans（approved 不动，P4）+ OperationLog(kind=auto,
  actor='match', payloadJson:{routine:'nightly-screen',…}) 照 health-scan 先例（:47-56）；
  **internal only 无 outbound**（:1182）；网关失败逐项目消化不中断整轮。
- `scripts/jobs/run-nightly-screen.ts` + package.json script；cron 默认 `30 2 * * *`
  （错峰 health-scan 02:00）。
- 集成测试：注册表含两例程 / nightly-screen 幂等 / approved 不动。
- lint + tsc + test:unit 绿。

### F007 match_plan / evaluate_creator 工具 + canvas ADR-28 + uiSyntax 注入

- 工具（class:'internal'，柱一注册表）：`match_plan`（输入 projectId → 现行 draft/approved
  组合 + PlanKol 摘要；canvas 出对比矩阵卡）；`evaluate_creator`（输入 projectId + kol
  idOrPublicId → matchScore.compute 单人评估 + reasons）。match persona tools 扩为
  `['search_kols','get_kol_detail','match_plan','evaluate_creator']`（registry.ts:95）。
- canvas ADR-28：canvas-registry 路由键改 `type` + 受控 register API（:1074/:1850——第二个
  多结果形态工具引入时机已到）；`MatchPlanCard` 新 canvas 组件（对比矩阵简版卡，沿
  KolResultCards 先例）；既有 search_kols 卡迁新 API 行为零变更。
- uiSyntax 注入 prompt（:1032 欠账）：buildSystemPrompt 增第四段「你的产出形态：{uiSyntax}」。
- 单测：工具 zod 契约 + mock 数据出参形状 + registry 映射；agent:smoke 扩段可选；
  真对话属 L2 留验收授权。
- lint + tsc + test:unit 绿。

### F008 侧栏徽标服务接真（U4，消解两批悬置 D-B）

- `GET /api/nav-badges`：{ today: PendingAction(status=pending) 计数, projects: Project 计数 }
  （tenantId 维度；轻量查询）。
- sidebar 接真：`NAV_BADGE_MOCK`（sidebar/index.tsx:18,:73）退役——client fetch on mount +
  路由变化时 revalidate（sidebar 保持 'use client'，不动布局）；计数 0 → 徽标隐藏（诚实降级）；
  **洞察徽标退役**（无真源不显假数，D2；恢复归 M4 洞察接真）。
- 视觉基线：**13 张 admin 页基线全量漂移对账**（假数 3/4/2 → CI 实况 today=0 隐藏/projects=4/
  洞察隐藏）——逐处对账后重生（§4.2 重生 =all + 断言紧阈值；D-H：重生前清
  PendingAction/OperationLog——本批扩展至 Match 三表同清）。
- 单测：API 计数正确性（集成测打真库）；fetch 失败 → 徽标全隐藏不抛错（D2）。
- lint + tsc + test:unit + test:visual 绿。

### F009 收尾：SW-R1 探针退役（U3）+ OBS-1 迁移 + 文档 as-built 翻牌

- SW-R1：删除 `scripts/test/f007-browser-check.mjs` + package.json `f007:browser` 入口；
  替代探针 `m1c-readiness-f007-l1-substitute.mjs` 与 f010 覆盖保持；被删路径 needle 全仓 grep
  （含 docs 内就绪回归清单引用处翻牌注记）。
- OBS-1：parse.ts image part `type:'image'` → `type:'file'` 迁移（AI SDK 弃用告警消除；
  mock 网关单测回归 + 断言不再触发弃用告警；真 vision 调用属 L2 留验收授权）。
- 文档翻牌：architecture.md §14 M2-A 行置✅ + §5.2/§5.3/§5.4（matchScore/三表/状态机）/
  §8（工具/canvas/uiSyntax）as-built 翻牌 + env-guards →reach 段校准 + M1-C S7 顺手校准
  （§8.10 health-scan 频率注记）；agent-architecture.md 工具/canvas 段同步。
- lint + tsc + test:unit 绿。

---

## 3. 关键设计决策

### 用户裁决（2026-07-22 AskUserQuestion 实答）

- **U1 compose 漂移 learning Accept** → 已沉淀 v1.0.10（deploy-patterns §8），本批无 compose 变更。
- **U2 M2-A 纵切先行**：match 核心动线本批；抽屉七分区/Kol 深字段数据源裁决/ProvenanceTag
  接 Kol 真数据留 M2-B。
- **U3 SW-R1 退役**：f007 原样探针删除（守护面由替代探针 + f010 双重覆盖）。
- **U4 徽标纳入**：侧栏徽标服务接真（今天/项目真计数，洞察退役假数）。

### Planner 默认（P1-P8）

- **P1 组合生成 = 规则化可解释**：无 LLM 打分（评分必须可复算可解释；成本 NFR-P8）；
  三组命名沿 mock 语义。
- **P2 首访 lazy 生成**：match 面零 plans → RSC 同步生成（原型无生成 CTA，不自创 UI 区块）；
  失败静默降级空态占位（CI 无凭据安全）。
- **P3 批准单选语义**：approve 一组 → 其余 draft→superseded + advanceStage('reach')；
  internal 不产生 PendingAction（假闸门 K10=0）。
- **P4 刷新保留人工态**：candidates upsert 不回退 kept/dropped；plans 重跑只 supersede draft，
  approved 永不动（审计链）。
- **P5 bars 派生口径**：组内 PlanKol top6 matchScore 归一 0-9（mock bars 展示位的真数据语义）。
- **P6 budgetUsd 恒 null**：无价格数据源（归 M2-B/M3 CRM），显示「待核」——不编造成本数。
- **P7 测试边界**：embedText 注入可替换；单测/集成测 mock 向量不打网关；真网关属 L2 留验收授权
  （铁律 8：bge-m3 已生产验证，无新外部模型）。
- **P8 verdict 写入口不建**：MatchCandidate.verdict 字段建好但人工裁定 UI 归后续（原型
  待裁定表仅「审阅」toast，无裁定按钮——不自创交互）；K3 采纳率数据面随字段就位。

### 编排确认（§6.5）

- 车道：快车道（单会话）。building 串行为主（F001→F005 强依赖链；F006-F009 在 F004 后
  可视文件集判定局部并行）。verifying fan-out（9 features ≥4 → orchestration §4 Workflow +
  对抗复核，沿 M1-D 模式）。

## 4. 数据准备步骤（Evaluator 验收前提）

- 本地：dev DB 4 canonical 项目 + 2525 Kol（embedding 已灌）——xg（goal 已设可进 match）为
  验收主样本；Match 三表验收产物测毕清零复原（D-H 扩展：视觉基线态 = Match 三表零行 +
  PendingAction/OperationLog 清态）。
- CI：无 Kol seed（visual job 不跑 seed:kol）→ match 面基线态 = 空态占位；lazy 生成在 CI
  必须静默降级（F005 acceptance 硬要求）。
- L2 边界：真网关调用仅 embedText（候选生成）与可选真对话（F007 工具）——最小用量 +
  报告注明（沿 M1-D 口径）。

## 5. 验收口径（verifying）

- **fan-out**：9 features → Workflow fan-out + 对抗复核（orchestration §4）。
- F001 三表在库 \d + zod 降级；F002 纯函数边界 + 降级 reason；F003 幂等/保留人工态/supersede +
  D20 变异；F004 批准事务/单选/守卫解锁 + D20；F005 页面真数据（改→验→复原）+ mock 零残留 +
  基线对账 + CI 降级安全；F006 注册表两例程 + approved 不动；F007 工具契约 + canvas 迁移零回归 +
  uiSyntax 注入；F008 计数正确 + 13 基线对账 + 失败隐藏；F009 探针零残留 + 弃用告警消除 + 翻牌。
- **就绪回归（本批口径）**：lint + tsc + test:unit + test:visual 全绿；三条 p2 探针 +
  f008:browser + f010:e2e + m1c-readiness-f007-l1-substitute 无回归（f007 原样探针已退役）。

## 6. 不在本批次

- Kol 深字段数据源裁决 + 创作者库/抽屉七分区接真 + ProvenanceTag 接 Kol 真数据（M2-B）·
  MatchCandidate 人工裁定写入口（P8）· 审阅证据抽屉（M2-B）· 价格/报价数据（M3 CRM）·
  J3 一句话跨环节（M2/M3 串联，:1541）· credibility/brandSafety zod refine（M2-B 随深字段）·
  flags.ts 命名空间（随深字段）· BL-FE-16（暴露面零，继续搁置）。
