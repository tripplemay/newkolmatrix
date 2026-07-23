# M2-B-CREATORS — 创作者库/抽屉接真 + Kol 深字段外采派生 + 裁定写入口（普通批次）

> **批次类型：** 普通批次（全部 `executor:generator`），`planning → building → verifying → done`。
> **车道：** 快车道（单会话，Evaluator 隔离 subagent）。无 `role_assignments`。
> **Spec lock：** 2026-07-23 用户裁决（§3 U1-U5）+ Planner 默认（§3 P1-P9）。
> **事实依据：** 双路勘查（apify-kol 服务实物 + creators/drawer UI 实物，2026-07-22/23，
> 全部结论核到 文件:行 / gh api / SSH 实测）+ apify-kol API 真样本 4 平台 9 行 pin
>（v0.9.19 铁律：YT Bobicraft id=282974 等，形状见 §2 F001）。
> **上游：** M2-A 已交付上线 @ 3d93f72（match 域动线全通）；Kol 2524 行 CSV seed + embedding。

---

## 1. 背景与目标

M2-A 完成 match 域纵切后，本批做 M2-B：创作者库/抽屉从 mock 接真，Kol 深字段按
**纯外部采集**裁决（U1）接入团队自有采集服务 apify-kol，三个深字段契约位的实物缺口
（该服务无受众分析/真实性/内容安全能力——勘查实证）按复裁以**规则派生填充**消解；
另交付 M2-A P8 遗留的 MatchCandidate 人工裁定写入口（U2/U3，布局变更）。

### 1.1 勘查核到的关键实物

**外采服务（apify-kol，`guang-tech/apify` monorepo）：**

1. **服务活着**：deploysvr 容器 `apify-kol-service-service-1`（Up 10 天），`127.0.0.1:3004→3003`，
   docker external 网络 `kol-shared` 别名 `apify-kol:3003`；`/health` 实测 `{"status":"ok"}`
   （2026-07-23T00:44Z SSH 实测）。**不暴露公网**；旧 kolmatrix 经 `kol-shared` 内网互访先例。
2. **接口**：Fastify + `x-api-key` 双 key（BUSINESS 只读 `/kol*` / ADMIN 全部）；
   `GET /kol`（分页 max 100，响应 `{data,page,pageSize,total}`）+ `GET /kol/:platform/:userId`。
   **异步两步模型**：seeds 投喂→队列抓取→读成品；无同步 on-demand 端点。
3. **存量**（真样本实测 2026-07-23）：YT 4064 + TikTok 4302 + IG 469 + X（枚举缺口不可按
   platform=x 过滤查询——`packages/service/src/routes/kol.ts:10,41` 已知遗留）≈ **8800+ 行**。
4. **字段面**：username/displayName/bio/avatar/profileUrl/followers/following/postsCount/
   totalLikes/totalViews/verified/matchedTags/matchedKeywords/businessCategory(IG)/
   location(YT ~83%)/joinedDate/联系方式族（emails/phones/…）/4 维评分（relevance/influence/
   quality/reachability，qualityScore **YT 恒 null**）/tier/raw。
   ⚠️ totalLikes 跨平台语义不一致（TT 真值/IG±25% 估算/YT=views 平替/X 曝光估算）。
5. **三契约位判定**：audienceDemo（受众分布）**产不出**（全仓 demograph/audience 零命中）；
   credibility **产不出**（无僵尸粉检测；verified/qualityScore/tier 仅弱信号）；
   brandSafety **完全没有**（无内容分类，帖子文本不入库）。
6. **成本面**：读存量 = 我方服务 DB 查询，**零上游花费**；seeds 投喂走 TikHub 按次计费
   （IG $0.002/其余 $0.001，paid balance，余额有两次断供史）——本批不投喂（P1）。

**KOLMatrix 侧（文件:行 详见勘查报告，要点）：**

7. **creators 页纯 mock**：`app/admin/creators/page.tsx:31-38` 消费 `mock/creators.ts`
   （423 行，9 行数据 + deep 分区 + 契约位）；8 列表 + KPI×4 + URL 化筛选 + 抽屉动线齐备。
8. **CreatorDrawer 七分区**（697 行，接 mock）：①受众画像（audienceDemo 消费点）
   ②内容表现 ③合作历史 ④商务档期 ⑤合规风险（brandSafety/credibility 消费点）
   ⑥内容样本 ⑦专家判断；ProvenanceTag badge ×5（V10 34 元素 🔒 逐处不得删）。
   原型：`docs/product/interaction-prototype-v2.html` L926-973。
9. **溯源 as-built bug**：Kol 全库 `dataSource='csv-seed:kol-seed-enriched-final.csv'`
   **不在六档枚举内** → `resolveProvenance` 第②级校验失败，**恒落第③级 ai_estimate**
   （seed `import-kol-csv.ts:23`；本批 P4 归一消解）。
10. **深字段全空**：2524 行 Kol 的 audienceDemo/credibility/brandSafety/fieldProvenance = 0
    填充（dev DB 实测）；架构契约位形状 = architecture §7.2.2 :826-838（zod 待建，
    「给分必给依据」refine 明记归 M2-B）。
11. **裁定写入口原型缺位**：原型无任何 kept/dropped affordance（grep 实证，待裁定表仅
    「审阅」toast L996）→ U3 裁决 = 行内双钮 + **布局变更标注** + 原型/清单同步。
    读侧已就绪：`surface-data.ts:87-95` 待裁定 = `verdict:'pending'`，写入 kept/dropped
    即自动离表；P4 保护已实装（upsert 不回退人工态）。
12. **评分自动升级零代码**：`match-score.ts:73-81` extractInterests 只认
    `{interests: string[]}` 非空 → 外采派生落库后下一轮生成（lazy/refresh/nightly 三入口）
    自动出组合分、scorePending=false、「受众数据待接入」doubt 消失。

---

## 2. 功能范围（8 条，全 generator）

### F001 apify-kol client + zod 契约（真样本 pin）+ env

- `src/lib/apify/client.ts`：fetch 封装（`x-api-key` header；`APIFY_KOL_BASE_URL` +
  `APIFY_KOL_API_KEY` env，`requireEnv` 先例）：`listKols({page,pageSize})`（分页，
  **不带 platform 过滤**——绕 X 枚举缺口 P2，响应行自带 platform）+ `health()`。
  超时 `AIGC_TIMEOUT_MS` 同款常量取向；错误分类（401/403 终态、429 尊重 Retry-After、
  5xx/超时可重试——旧 kolmatrix adapter 先例语义，独立实现不拷贝代码）。
- `src/lib/apify/schemas.ts`：zod **passthrough 宽容**（v0.9.19：union/nullable 按真样本
  9 行 pin——YT qualityScore null / IG businessCategory 可空串 / following 可 null /
  matchedTags 可空数组；响应信封 `{data,page,pageSize,total}`）；单测 pin 四平台真样本
  fixture（脱敏：去联系方式明细，保形状）。
- `.env.example` 补两条（值占位）；密钥不入 git。
- 【P7】client 注入可替换（单测不打真服务）；真服务连通属 L2 留验收授权（ssh 隧道
  `ssh -L 3004:localhost:3004 deploysvr` 或 prod 内网）。
- lint + tsc + test:unit 绿。

### F002 深字段派生纯函数 + kol-deep zod 契约（「给分必给依据」兑现）

- `src/lib/data/schemas/kol-deep.ts`（architecture §7.2.2 形状，**:838 refine 欠账兑现**）：
  - `audienceDemoSchema`：`{ageDist?, genderDist?, geoDist?, interests: string[]}`（interests
    写侧非空；分布三键本批无源可省——读侧宽松降级 D2）
  - `credibilitySchema`：`{score 0-100, method, signals: string[].min(1), assessedAt}` +
    **refine：signals 空 = 非法（给分必给依据 FR-11.4）**
  - `brandSafetySchema`：`{rating: safe|review|risk, flags: string[].min(1), assessedAt}` +
    同款 refine（本批无源不落库，契约先立——写入口在未来批次也必须过此门）
  - 读侧宽松 parse* + 写侧 assert*（match.ts/knowledge.ts 先例双形态）
- `src/lib/kol-sync/derive.ts` 纯函数（无 IO，P9 规则透明可复算、无 LLM）：
  - `deriveAudienceDemo(row)` → `{interests}`：matchedTags + matchedKeywords +
    businessCategory 归一（去重/去空/lowercase-trim；全空 → null 不编造）
  - `deriveCredibility(row)` → score 由 verified/qualityScore/tier/followers 规则合成
    （权重常量导出，示意值上线校准——HEALTH_WEIGHTS 先例）+ `signals[]` 逐条人话依据
    （如「平台认证 ✓」「互动质量分 0.8」）+ `method:'rule-derived-from-crawl'` + assessedAt
    由调用方注入（纯度约束，health.ts `now` 先例）；输入弱信号全缺 → null 不编造
  - `deriveFieldProvenance(...)` → `{audienceDemo:{source:'crawl',fetchedAt,detail:'由创作者
    标签规则派生'}, credibility:{...}}`（六档枚举内取值；detail 明示派生非实测）
- 单测：派生边界（tags 空/businessCategory 空串/YT qualityScore null/全缺 → null）+
  refine 拒空依据 + 权重和/分域钳制；不打库不打网关。
- lint + tsc + test:unit 绿。

### F003 kol-sync 同步服务 + 例程注册

- `src/lib/kol-sync/sync.ts` `syncKols(deps?)`【P7 client/embed 双注入】：
  discover 全量分页拉取（P2 不带 platform 过滤；pageSize 100 顺序翻页，上限常量导出）→
  字段映射（displayName/bio/avatarUrl/profileUrl/followers/categories←matchedTags 归一/
  country←location/engagementRate 派生 totalLikes/postsCount/followers——**YT/X 为
  view-based proxy，映射函数注释明记语义**）→ F002 三派生 → upsert Kol by
  `(tenantId, canonicalHandle)`（**P3 归一函数复用 seed 单点**——`import-kol-csv.ts` 的
  canonicalHandle 构造抽出共享模块，两处消费零漂移；已存在行 = 外采字段覆盖浅字段 +
  写契约位 + `dataSource='crawl'`；CSV 独有行不动）→ 新行 embedText 灌向量
  （seed 管道同源文本构造；【P7】注入可替换；**用量预估：新增 ~6000-8800 行 ×
  ~100 token ≈ <1M token bge-m3，一次性，月度增量 ~87 行/天忽略不计**）。
- `scripts/ops/normalize-datasource.ts`（P4 存量归一，幂等）：
  `dataSource='csv-seed:*'` → `'user_upload'`（六档内语义 = 你上传的种子数据）+
  dry-run 默认 + stats 输出（database-patterns §6/§7：显式计数，staging 端到端实跑）。
- 例程：scheduler `ROUTINES` 注册 `kol-sync`（cron `0 3 * * *` 错峰；网关/apify 不可达
  逐步消化不炸进程——**dev 环境不可达内网属预期，探活失败静默跳过 log warn**）+
  `scripts/jobs/run-kol-sync.ts` + package script（F006 注册表化先例，同执行体非旁路）。
- 【P1】**零投喂**：本批只读存量，不调 `/admin/seeds`、不充值——TikHub 花费永留人工。
- 集成测试（mock client + mock embed 打真库）：幂等二跑 / CSV 行覆盖合并 / 新行插入 +
  向量写入 / dataSource 归一 / 派生契约位落库合形（parse* 可读回）。
- lint + tsc + test:unit 绿。

### F004 creators 页接真 + mock 退役 + CI 视觉夹具

- `app/admin/creators/page.tsx` 转 RSC 组装（**force-dynamic 必声明**，v1.0.9 §6；
  现 'use client' 整页——拆 RSC 数据层 + client 交互层，布局零变更 V9 16 元素 🔒）：
  8 列真数据映射（粉丝/品类←categories/可信度←credibility.score 分级 A/B/C——分级
  阈值常量导出；**「受众匹配」列库级无项目上下文 → 恒「待核」P5**（不编造，项目内
  匹配% 归 match 环节）；#ad 合规 ← brandSafety null → 「待核」）；KPI 4 卡真计数；
  platform/category 筛选真值域。
- `mock/creators.ts` 退役：needle 全仓 grep 零代码残留 + mock/index.ts 翻牌。
- **CI 视觉夹具（P6）**：`scripts/seed/visual-kols.ts` 2 行确定性 Kol（固定 publicId/
  handle：一行深字段齐备（派生样例）+ 一行全 null（待接入面））；ci.yml visual job +
  本地重生流程接入（D-H 基线态扩展 = 2 夹具行在场）；重生序遵 **web-runtime-patterns
  §4.5（v1.0.11：先杀 :3000 残活）**。
- creators.png 基线逐处对账重生（列表 = 2 夹具行 + 空态文案硬断言 §4.3）；
  运行时改→验→复原实证（RSC 组装层）；两视口实测。
- lint + tsc + test:unit + test:visual 绿。

### F005 CreatorDrawer 七分区接真

- prop 换真 Kol 实体（RSC 组装可序列化视图，展示串格式化单点 `lib/display/creator-format.ts`
  ——match-format 先例）：①受众画像 = interests 真值渲染 + 分布三键无源子降级「待接入」
  ②内容表现 = 无平台 API 源「待接入」③合作历史 = 无 CRM 空态真话「与我方暂无合作记录」
  ④商务档期 = 「待补充」（M3）⑤合规风险 = credibility 分级真值 + brandSafety「待接入」
  ⑥内容样本 = 「待接入」⑦专家判断 = 匹配「待核」P5 + 布局零变更（V10 34 元素 🔒，
  分区结构/顺序/ProvenanceTag ×5 逐处保持）。
- ProvenanceTag ×5 接真：`resolveProvenance(kol, field)` 消费真 fieldProvenance
  （crawl 派生标注可见；ai_estimate 恒触发 bug 随 P4 归一消解——断言第③级 fallback
  不再是唯一路径）。
- creator-drawer.spec 锚点重设计：点固定 publicId 夹具行（P6，替代「首行 = mock 确定」
  假设）+ 深字段齐备行与待接入行**双状态断言**；基线对账重生。
- lint + tsc + test:unit + test:visual 绿。

### F006 MatchCandidate 裁定写入口（U3 布局变更）

- `POST /api/match/candidates/[id]/verdict` `{verdict:'kept'|'dropped'}`：internal 动作
  （**无确认框 D27/:1352 双边铁律，零 PendingAction**）；幂等（同值重放 200）；
  pending→kept/dropped 合法、kept↔dropped 允许改判（人工纠错）、非法值 zod 拒；
  candidate 不存在 404；【D20】verdict 人工流转变异测试（改判/幂等/P4 刷新不回退回归）。
- `match/index.tsx` 待裁定表行内「保留/剔除」双钮（「审阅」旁；轻量 ghost 按钮，
  裁定成功 toast + router.refresh 行自动离表——读侧 `verdict:'pending'` 已就绪）。
- **布局变更标注（Planner 明示）**：原型 `docs/product/interaction-prototype-v2.html`
  FUZZY 行同步加双钮 affordance + `ARCH-M05-ui-inventory.md` V5 元素清单登记（22→+2）；
  project-match.png 基线对账重生（CI 空态不变——待裁定表空态无按钮；本地对账）。
- K3 采纳率数据面注记：verdict 计数查询即 K3 分子分母（不建看板，数据面就位）。
- lint + tsc + test:unit + test:visual 绿。

### F007 评分升级端到端验证

- 集成测试（打真库 mock 向量）：外采派生 interests 入场 → `generateCandidates`
  scorePending=false 真路径 / doubts 「受众数据待接入」消失 / preJudge 分档变化 /
  matchScore = 加权组合分（0.7/0.3）断言；`evaluate_creator` 消费真 audienceDemo 同断言；
  interests 全空行仍降级待核（D2 回归）。
- 「待核」面收窄的显示层回归：match 面候选列 scorePending=false 行显真 %（真库集成断言，
  非视觉）；M2-A D20 全量回归无损（match-services / match-approve / nightly-screen 套件绿）。
- lint + tsc + test:unit 绿。

### F008 部署面 + 文档翻牌

- `docker-compose.prod.yml`：app 服务加 `kol-shared` external 网络 + env
  `APIFY_KOL_BASE_URL=http://apify-kol:3003` + `APIFY_KOL_API_KEY=${APIFY_KOL_API_KEY}`；
  **deploy 前置人工步 ×2 明记（deploy-patterns §8 / v1.0.10）：scp compose 同步 +
  VPS `.env` 追加 `APIFY_KOL_API_KEY`（BUSINESS key，从 /opt/apps/apify-kol-service/.env
  取值——人工操作不入 git）**；`docs/dev/deploy.md` 同步该前置。
- 文档翻牌：architecture.md §7.2.2 契约位 as-built（zod 已建 + 派生填充语义 + refine 兑现）
  + §7.5 dataSource 归一注记 + §10 集成架构（apify-kol 拉模型：内网 HTTP/异步两步/
  零投喂边界/X 枚举缺口注记）+ §14 M2-B 行 + §8.10 例程清单 kol-sync 行 + §5.3 ⑧
  verdict 写入口 as-built；`agent-architecture.md` 不涉（无新工具）。批末新鲜度复核 clause。
- lint + tsc + test:unit 绿。

---

## 3. 关键设计决策

### 用户裁决（2026-07-23 AskUserQuestion 实答）

- **U1 深字段数据源 = 纯外部采集**；复裁（实物缺口披露后）= **规则派生填充**：
  interests ← 创作者标签、credibility ← 弱信号规则合成（透明可复算、ProvenanceTag 如实
  标 crawl 派生）、brandSafety 无源保持待接入。
- **U2 范围 = 基线 + 裁定写入口**（评分升级验证以 F007 端到端测试承担，不扩独立 UI）。
- **U3 裁定 UI = 行内双钮**（保留/剔除；布局变更标注 + 原型/元素清单同批同步）。
- **U4 框架 v1.0.11 Accept**（已沉淀 §4.5，重生序本批即用）。
- **U5 BL-FE-16 继续搁置**（暴露面零）。

### Planner 默认（P1-P9）

- **P1 零投喂零充值**：只读 apify-kol 存量（我方服务，零上游花费）；`/admin/seeds` 投喂与
  TikHub 充值 = spend 动作永留人工（harness deny-list 取向）。
- **P2 discover 不带 platform 过滤**：绕 `GET /kol` X 枚举缺口（上游已知遗留），响应行
  自带 platform 字段无信息损失。
- **P3 canonicalHandle 归一单点**：seed 构造函数抽共享模块，sync/seed 两消费零漂移。
- **P4 dataSource 归一**：外采行 'crawl'；存量 CSV 行幂等脚本迁 'user_upload'——消解
  resolveProvenance 恒 ai_estimate 的 as-built bug。
- **P5 库级「受众匹配」列恒待核**：无项目上下文不编造匹配%（真匹配% 在项目 match 环节）。
- **P6 CI 视觉夹具 2 行**：固定 publicId 确定性 Kol（深字段齐备/全 null 各一）——列表与
  抽屉基线确定性 + 双状态防静默空白（§4.3）。
- **P7 测试边界**：client/embed 注入可替换；单测/集成测不打真服务不打网关；真拉取属 L2
  留验收授权（ssh 隧道或 prod 内网）。
- **P8 联系方式不落列**：emails/phones 等归 M3 reach（触达域）；本批仅作 credibility
  派生输入（hasBusinessEmail 信号），不建列不存明细。
- **P9 派生规则透明**：无 LLM、权重/阈值常量导出可测（成本 NFR-P8 + 可解释先例）。

### 编排确认（§6.5）

- 车道：快车道。building 主链串行 F001→F002→F003→F004/F005（F006 与 F004/F005 文件集
  不重叠可并行判定）；F007 依赖 F003；F008 收尾。verifying fan-out（8 features ≥4 →
  orchestration §4 Workflow + 对抗复核，沿 M2-A 模式）。

## 4. 数据准备步骤（Evaluator 验收前提）

- dev：2524 行 CSV Kol + embedding 已灌；sync 后行数 = 2524 + 外采净增（幂等二跑不变）；
  Match 三表/PendingAction/OperationLog 清态基线（D-H）；测毕清理 sync 产物可选
  （外采行属产品数据，非测试产物——**不清**，D-H 边界更新记录在案）。
- CI：无 Kol seed + 2 行视觉夹具（visual job）；unit job 集成测试用 mock client 夹具租户。
- L2 边界：apify-kol 真拉取（ssh 隧道 `ssh -L 3004:localhost:3004 deploysvr` +
  BUSINESS key）与 embedding 真灌 = 最小用量 + 报告注明；TikHub 零调用。
- 白名单样本（真存量 pin，2026-07-23 实测）：YT `Bobicraft`（id=282974，9.24M 粉，
  verified，location=Mexico）；IG/TT 样本各 2 行形状已 pin F001 fixture。

## 5. 验收口径（verifying）

- fan-out：8 features → Workflow fan-out + 对抗复核（orchestration §4）。
- F001 契约 pin 真样本 + client 注入；F002 派生边界 + refine 拒空依据；F003 幂等/归一/
  向量/例程注册；F004 页面真数据（改→验→复原）+ mock 零残留 + 夹具基线；F005 七分区
  双状态 + ProvenanceTag 真溯源；F006 verdict 流转 D20 + 原型/清单同步 + internal 零
  PendingAction；F007 评分升级端到端 + M2-A 回归无损；F008 compose 前置明记 + 翻牌。
- 就绪回归：lint + tsc + test:unit + test:visual 全绿；三条 p2 探针 + f008:browser +
  f010:e2e + m1c-readiness-f007-l1-substitute 无回归。

## 6. 不在本批次

- seeds 投喂 / TikHub 充值自动化（spend 人工闸门）· brandSafety 数据源（TikHub 评论
  端点/内容分类归 M5 数据管道）· 受众分布三键（ageDist/genderDist/geoDist）真源 ·
  审阅证据抽屉（原 M2-B 候选，让位裁定写入口，归后续）· 联系方式列 + 触达消费（M3）·
  价格数据（M3 CRM）· 洞察徽标恢复（M4）· apify-kol 上游修缮（X 枚举/README 滞后，
  另仓不越界）· BL-FE-16（U5 搁置）。
