# ARCH-M05 — 原型逐视图「不得简化清单」（spec 附件）

> **来源：** proto-inventory agent 对 `docs/product/interaction-prototype-v2.html` 的逐行提取（2026-07-21，planning 阶段），经 Planner 审定作为 spec 硬性附件。
> **用法：** 各 UI feature 的「不得简化清单」= 本文件对应视图的全部元素；🔒 标记项 Generator 认为应简化时必须走 pre-impl 审计，不得自行删。行号均指原型 HTML。
> **标记：** 🔒 = 看起来可删但不得删；🚪 = outbound 闸门触发点；🆕 = 需新建组件。

## 汇总表

| 视图 | 元素数 N | 闸门点 | 服务 feature |
|---|---|---|---|
| 常驻·侧栏 | 12 | — | F003 |
| 常驻·Navbar 指令栏 | 12 | — | F003 |
| 常驻·Copilot 面板 | 19 | — | F003（升级既有 CopilotPanel） |
| 全局·闸门弹窗 GateConfirm | 8 | 4 类共用 | F005/F010 |
| 全局·Toast | 1 | — | F005 |
| 今天 today | 37 | irrev 展示标 | F006 |
| 项目列表 | 10 | — | F007 |
| 项目详情外壳（导轨） | 14 | — | F007 |
| Brief · 态势简报 | 19 | 无 | F008 |
| Match · 对比矩阵 | 22 | 无（**刻意无**） | F009 |
| Reach · 对话收件箱 | 24 | send_outreach · commit_quote | F010 |
| Delivery · 条件台账 | 11 | payout | F011 |
| Insight · 对照账本 | 19 | create_share_link(项目级) | F012 |
| 创作者库 | 16 | 无 | F013 |
| 创作者详情抽屉 | 34 | 无 | F013 |
| 游戏知识 | 19 | 无 | F014 |
| 洞察（跨项目） | 14 | create_share_link(季度级) | F015 |
| Agent 记录 | 10 | 无（只读留痕） | F016 |
| **合计** | **301** | 5 类 outbound / 6 触发点 | |

## 一、常驻外壳

### S1. 侧栏（原型 L432-437 / CSS L46-66）— 12 元素
1. `KM` 渐变方块 mark（135deg）｜2. 品牌字「KOL」800+「Matrix」300 双字重（不得压成单一）｜3. 分隔线｜4. nav 组标签「工作台」｜5. 6 入口按钮（图标+标签，routes.tsx 驱动）｜6. 🔒 active 右侧 4×36 圆角竖条｜7. 🔒 待办数字徽标（today=3/项目=4/洞察=2——「今天雷达」入口信号非装饰）｜8. `.side-cta` 渐变卡（SidebarCard）｜9. 🔒 `.orb` 装饰半圆（产品识别项）｜10. shield 圆图标 44px｜11. 🔒 标题「Agent 自动边界」｜12. 🔒 说明「可检索·评估·匹配·起草。发送/报价/放款/分享一律停在你面前。」（D26/D27 常驻宣示）

### S2. Navbar 指令栏（L440-450）— 12 元素
1. mobile menu 钮｜2. 面包屑（工作台/项目/游戏名）｜3. 页标题 26px/800｜4. 🔒 `.nb-cmd` 指令栏胶囊（替换搜索位，min-w 280）｜5. spark 图标｜6. placeholder「问 Campaign Agent 或下达任务…」｜7. 「Agent 推进中」｜8. 🔒 `.pulse` 绿点脉冲（纯 CSS）｜9. 主题切换（改 `body.dark`，不用 data-theme）｜10. copilot toggle（mobile）｜11. 头像渐变圆 40px｜12. 🔒 玻璃外壳（sticky + backdrop-blur-xl + 30% 白）
交互：指令栏 Enter → 内容送 Copilot 并自动打开面板。

### S3. Copilot 面板（L454-460, L1105-1130）— 19 元素（升级既有 CopilotPanel）
1. cop-head 渐变条随专家色动态｜2. dm 图标块 42px｜3. 专家名动态｜4. 副标题｜5. 🔒 cop-auto 边界条「只做可撤销的事…」｜6. 🔒 职责/隔离卡（复用 ExpertScope，术语「职责/边界」）｜7. 🔒 编队紧凑名册（AgentSquad compact variant，仅编排上下文）｜8. 🔒 「{专家}刚刚完成」卡｜9. 🔒 协同卡虚线框（复用 HandoffCollab 升级）｜10. A↔B 双色 agent 名 + 可旋转 chev｜11. 🔒 展开逐轮台词（每组 3 轮）｜12. 🔒 「交接物：{payload}」chip｜13. 🔒 绿色结论行｜14. 助手气泡（ChatBubble）｜15. 用户气泡｜16. `.act` 生成式动作卡（canvas-registry 扩展，hover translateX）｜17. 建议 chips（每上下文 3 条）｜18. 输入框｜19. 渐变圆发送钮（Button iconOnly）
交互：route+env 变化重置线程+新开场白（既有）；动作卡三类跳转 enter:/pick:/env:；协同卡展开态 Set 记忆。

### S4. 闸门确认弹窗 GateConfirm（L463-467）— 8 元素 🚪🆕
1. scrim 遮罩+blur｜2. 红底 shield 图标块 46px｜3. 标题（发送/报价/放款/分享 4 类）｜4. 正文点名收件人/收款方｜5. 🔒 `.harm` 利害清单表（行数随动作：2/3/3/2）｜6. 🔒 `.irrev` 红标行（4 类文案不同）｜7. 取消 ghost｜8. 确认 **红色** gate 钮
组件：Chakra Modal + useDisclosure；Esc + 遮罩点击关闭。接既有闸门链路（pending→确认）。

### S5. Toast — 1 元素 🆕
底部居中 · 绿 check · navy 底 · 2.4s 自动收 · 单例。**自建轻量 common/Toast**（裁决 #9：不扩 Chakra 白名单）。

## 二、跨项目页

### V1. 今天 today（L714-735）— 37 元素
KPI ×4（MiniStatistics：待你确认 3(+1)/Agent 今日完成 24(+6)/进行中项目 4(无 delta)/本月有效触达 8.4M(+12%)，**delta 有无两态不得统一**）｜sec-head「需要你确认」+ 🔒 meta IA 契约句｜雷达卡：avatar 42(游戏名首二字+6 色轮)/项目全名/market pill/budget pill/health pill **三态**/环节 lbl/待办标题/amt 副文/🔒🚪 irrev「对外不可撤销」红标（**条件渲染** ask.outbound）/rc-foot clock/「进入项目」按钮携 data-goenv 直落｜sec-head「Agent 编队」+ 🔒 meta｜sqcard ×6（AgentSquad **grid variant**：sq-ic 主题色/名/duty/now）｜「Agent 活动」card-head + 🔒 sub「昨夜与今晨自动完成，无需你介入」｜feed ×6（图标块/主文/副文/time）｜chartcard（sub/big 312/绿 badge +18%/LineAreaChart 12 点末点圆标）｜🔒 loads eyebrow「团队负荷 · **单一角色，仅用于分工**」（免责句必须，裁决 #8 保留）｜load ×3（avatar/Progress track/右对齐 %）

### V2. 项目列表（L738-744）— 11 元素（M2-C F002 布局变更 +1）
标题｜🔒 lede「…这一层只做进入」（IA 契约句）｜**「新建项目」钮（M2-C F002，P4 布局变更：标题右侧 solid 钮 → 弹层表单（名称必填/游戏下拉可空/市场可空）→ POST /api/projects（与 create_project 工具同服务）→ 创建即入 brief 环节 + OperationLog 留痕雷达可见）**｜卡 ×N：avatar/全名/market pill/budget pill/health pill｜goal 句｜rc-foot「停在「{环节}」」｜「进入」钮

## 三、项目详情

### V3. 详情外壳（L747-753）— 14 元素
pback 返回卡｜项目名 23px/800｜goal（max-w 78ch）｜pmeta 预算/健康度三色 dot/负责人｜`.rail` 导轨 ×5（横滚 min-w 150）｜🔒 rn-step 序号 01-05｜rn-ico 三态（done 绿 check/on 白透明/未开始灰）｜rn-name｜rn-state 三文案｜🔒 on 态渐变紫底｜🔒 surf-label `.tag` 语法徽标（态势简报/对比矩阵/对话收件箱/条件台账/对照账本）｜🔒 desc「这一环节的界面与其它环节刻意不同」（FR-7.10/7.11 宣示）
交互：rnode 点击切 `?env=`；pback 回列表。

### V4. Brief 态势简报（L757-769）— 19 元素
eyebrow｜**HalfGauge 64%**（230×130 stroke18 圆头）+ 中央 32px 读数 + 副读数「192万/300万」｜mtile ×4（各含 mt-s 副行）｜🔒 blocker 阻塞卡（琥珀+alert+说明；**处置入口走 Copilot，卡内不加按钮**——裁决 #1）｜chartcard 曝光趋势（LineAreaChart 12 点）｜timeline eyebrow「Agent 推进计划」｜tstep done ×2 / 🔒 cur「需要你 · 在「触达谈判」」brand 加粗 / 未开始 ×1｜🔒 连接线+三态圆点（灰空心/绿实心/紫+光晕）

### V5. Match 对比矩阵（L771-782）— 24 元素（M2-B F006 布局变更 +2）
`.cmatrix` 矩阵（130px 行标+3 组合列，min-w 700 横滚，**独立组件非 DataTable**）｜col-h ×3｜🔒 「★ Agent 推荐」（仅 best，其余 &nbsp; 占位保高）｜🔒 best 渐变高亮｜🔒 minibars 6 根迷你柱（hi 满/其余 .35）｜行：触达/预算/风险/规模｜🔒 行「依据」推荐理由段｜🔒 pick 列淡紫底贯穿｜foot「批准这组」×3（best 实心/ghost；**internal 不弹框**）｜sec-head「Agent 拿不准 · 待你裁定」+ meta｜FUZZY 表 5 列（DataTable）｜行 who/受众匹配（**「待核」或裸分二形态**：字段缺失→待核——裁决 #2）/存疑原因/初判 pill 三态/「审阅」ghost｜**「保留」ghost（M2-B F006，U3 布局变更：人工裁定 verdict=kept，internal 无确认框）**｜**「剔除」ghost（同上，verdict=dropped；裁定后行离表——读侧 verdict:'pending'）**｜🔒 底部 shield「批准组合只是让方案生效…所以没有确认弹窗」（D27 解释必须）
交互：批准→toast+cur='reach'+自动跳环节；裁定→toast+refresh 行离表（P4 刷新不回退）；**无闸门（刻意）**。

### V6. Reach 对话收件箱（L784-796）— 24+2 元素 🆕ConversationInbox（M3-A F008 接真）
三栏 280/1fr/240 min-h 540｜左栏搜索框｜ibrow ×N（avatar/名/**阶段 pill 五态 = crmInfer 真值**/last 预览/on 淡紫；数据源 = 真 thread ∪ approved 组合成员——F008 裁决 #5）｜th-head avatar+名+sub｜🔒🚪 「确认报价」钮（**仅 stage==='谈判中' 条件渲染**——裁决 #6 写死）｜th-msgs 对话区｜msg in 白左/out 渐变紫右（尖角）｜时间戳｜🔒 空态「还没有往来——Agent 已为你起草首封邀约」（无草稿时变体「…在下方书写，或到 Copilot 让触达 Agent 起草」——D2 诚实，元素在场语义不变）｜draft dlbl「Agent 起草 · 可编辑后发送」+spark｜textarea 可编辑（focus brand 边框；初值 = 最新 OutreachMessage(direction=draft) 行——F008 裁决 #3）｜🔒 hint「发送是对外动作，会先让你确认」+shield｜「重写」ghost（M3-A F008 接真：refine_email 真链——裁决 #4）｜🚪 「发送」红 gate（真两步票据链：pending→GET 详情→confirm→execute）｜右栏受众匹配 ring 84（CircularProgress）｜档案 4 行 kv｜「Agent 建议」段｜🔒 底部语法差异宣示「整个环节聚焦一个人…正好相反」
**M3-A 新增例外登记（24→26）：** V6-25 报价条款表单 modal（F008 裁决 #1：闸门前置最小输入——金额/币种/交付物/授权范围；人是谈判条款唯一权威输入源，非画布区块）· V6-26 CRM 人工覆盖控件（F009，U4 有限覆盖仅三态，「已确认」不可达）。
闸门：send_outreach（harm 2 行，**渲染服务端真 harm 不改写**）· commit_quote（harm 3 行同上）。

### V7. Delivery 条件台账（L798-804）— 11 元素（M3-B F009 接真）
台账 7 列（DataTable）｜行 who（**纯色方块 av** 非色轮；接真后按 kolId 稳定散列取原型五色板，同一创作者恒定同色）+名｜sub 交付物（= Deal 条款快照 deliverables；缺 → 「—」）｜🔒 note 附注条件渲染（人工 note 优先，缺则由缺口清单合成「缺什么显什么」）｜条件单元 **ok 绿/miss 琥珀/🔒 na 灰三态**（不得压成二态；**值 = `deliveryCheck` 真值**，页面不另判）｜放款金额右对齐 800（缺金额 → 「—」，D2 不编）｜🚪 「放款」红 gate（**仅 ready**；真链路 POST /api/delivery/payout → GET 详情 → confirm → execute）｜🔒 「条件未齐」灰字（**替代按钮位，不得改 disabled 按钮**）｜🔒 底部 shield「没有 AI 推荐卡…不提供绕过入口」
**反向 guardrail：刻意没有 KPI/图表/推荐卡/批量放款——一律不得补。**闸门：payout（harm 3 行 + 资金 irrev，**渲染服务端真 harm 不改写**）。
**M3-B 新增例外登记（11→11，元素数不变）：** 空态文案走 `DataTable` 既有 `emptyText` 插槽（「还没有交易——报价经确认后自动生成交付条件台账」），**不新增区块**——与 V6 空态同款口径（元素在场语义不变，D2 诚实）。已放款态由 `Payout(released)` 真值驱动（原 mock 本地 paidIds 退役）。

### V8. Insight 对照账本（L806-817）— 19 元素
对照表 4 列（指标/原目标灰/实际 navy/差异绿 up 红 down **三值三样式**）｜证据缺口卡 eyebrow「证据缺口 3」+ 🔒 gaprow ×3（诚实归因边界）｜chartcard 渠道（BarChart 5 柱 hi 渐变/rx10/底标签）｜受众构成 donut 150（PieChart donut options，stroke18 圆角段头 −90°）+ 🔒 中心叠加读数「71%/休闲玩家」+ legend 4 行｜retro 卡（渐变淡紫）dlbl+正文｜「采纳结论」实心（internal 无弹窗）｜🚪 「生成对外分享报告」红 gate（**项目级数据范围**——裁决 #3 与 V12 区分 scope）

## 四、其余跨项目页

### V9. 创作者库（L821-836）— 17 元素（M2-B F004 布局变更小注 +1）
标题｜🔒 lede「只做发现和分流…」（IA 契约句）｜KPI ×4｜筛选「平台」chips + 「品类」chips（**两行不得合并**；**筛选态 URL 化**——裁决 #4；M2-B 接真后值域 = 库内实际平台 + top4 品类频次）｜表 8 列（DataTable）｜行：who/粉丝/品类 pill/受众匹配 %（字段缺失→待核，同裁决 #2 规则；**M2-B P5：库级无项目上下文恒待核**）/历史合作（**M2-B：无 CRM 源 null→—，FR-11.17**）/可信度 pill 三态（**M2-B：credibility.score 分级，null→待核**）/#ad 二态/「加入匹配」ghost（stopPropagation）｜**截断提示行（M2-B F004，spec §3 P10 布局变更小注：LIST_LIMIT=100 followers 降序，截断时表下一行次要文本「按粉丝量显示前 N 位（库内共 M 位）…」——不让前 100 冒充全量，D2 数据诚实；仅截断时条件渲染）**｜🔒 整行可点开抽屉｜🔒 底部 shield「不能直接发信或报价…触达 Agent 接手」（裁决 #5 补入）

### V10. 创作者详情抽屉（L926-973）— 34 元素
Chakra Drawer 右滑｜dw-head avatar 52+名+small+关闭钮｜dw-badges ×3｜🔒 dw-summary「匹配 Agent：{判断}」淡紫块｜§受众画像 + 🔒 **ProvenanceTag badge「Apify 采集 · 3 天前 · 可信度 高」**｜地域 donut 118+中心叠加+legend 3｜🔒 粉丝真实性 ring 64 + 🔒 活跃度 ring 64｜年龄段 Progress ×3｜品类偏好 ×3｜性别 kv｜§内容表现 + 🔒 ProvenanceTag「平台 API · 实测」｜dw-mini 3 格｜8 周趋势 LineAreaChart h88｜dw-deliver 3 格｜§合作历史 + 条目（绿标「准时·优/良」）+ 🔒 空态「与我方暂无合作记录。」｜竞品合作 tags｜响应/上次合作 kv｜§商务档期 + 🔒 ProvenanceTag「CRM · 历史成交」+ kv ×5｜§合规风险 + 🔒 ProvenanceTag「合规 Agent 核验」+ kv ×3（#ad 彩色值）｜§内容样本 + 🔒 ProvenanceTag「平台 · 近 30 天」+ 🔒 样本 ×3（渐变 thumb+play+2 行截断）｜§专家 Agent 判断 + 🔒 dw-jc ×3（**匹配/触达/合规三 Agent 各带主题色彩条，不得合并成一段**）｜dw-foot「标记关注」ghost+「加入某项目匹配」实心
**5 处 ProvenanceTag 是 D15 溯源差异化核心，逐处不得删。**

### V11. 游戏知识（L838-863）— 19 元素
标题｜🔒 lede（素材→解析→喂环节链路句）｜左栏「游戏」列表 ×4（主题彩点+名+N 份素材+on 淡紫；**kbGame URL 化**——裁决 #4）｜kb-dhead（游戏色图标 48+名+2 pill+「重新分析」ghost）｜「素材库 · N 份」｜**UploadZone**（虚线+upload+两行文案）｜mat 行（**按 type 分图标** doc/video/data/image + 名 + 来源日期 + 🔒 **状态二态** done 绿/analyzing 琥珀「解析中…」——异步中间态不得省）｜「策略 Agent 分析出的游戏特点」+spark｜🔒 **kb-prov 溯源行**（ProvenanceTag **inline variant**——裁决 #10）｜卖点 bul ×3｜目标受众 Progress ×3（**游戏主题色**）｜合规红线 ×3（红 shield）｜🔒 kb-use「匹配用受众·触达用卖点·合规用红线」跨 Agent 消费链宣示
交互：上传→插 analyzing 行+toast→1.1s 转 done+二次 toast（mock 契约层模拟）。

### V12. 洞察（跨项目，L864-879）— 14 元素
标题｜🔒 lede（对外分享需单独确认句）｜KPI ×4（花费无 delta）｜ROI 走势 chartcard（LineAreaChart 8 点）｜各项目 ROI chartcard（🔒 **badge 文字型「料理次元领先」**非 %，不得统一成数字；BarChart 4 柱）｜sec-head+meta｜表 5 列（DataTable）｜行 avatar+名/花费/触达/转化（右对齐 tabular-nums）/🔒 ROI 二色（绿/**琥珀**非红）｜retro 卡「洞察 Agent · 本周周报草案」+正文｜「采纳为周报」实心（internal）｜🚪 「生成对外分享报告」红 gate（**季度级数据范围**——裁决 #3）

### V13. Agent 记录（L880-892）— 10 元素
标题｜🔒 lede「谁、何时、做了什么…永久可查」｜KPI ×4（**全部无 delta**）｜🔒 筛选 chips ×5（on 实心紫；**runFilter URL 化**——裁决 #4）｜表 4 列（DataTable append-only 流）｜行 时间（nowrap tabular-nums）/Agent（主题色 dot+名）/动作/🔒 类型 pill **四态**（自动完成 gd/需你确认 ac/已拦截 wn/不可逆·已留痕 cr——不得合并）｜🔒 底部 shield「拦截项由对应 Agent 主动停下并说明原因」

## 五、Planner 裁决记录（10 处不一致，2026-07-21）

| # | 议题 | 裁决 | 理由 |
|---|---|---|---|
| 1 | Brief 阻塞处置入口 | 走 Copilot prompt 路径，blocker 卡保持展示态不加按钮 | 原型为交互 canonical；kimi「接受处置=internal」经 Copilot 动作卡满足 |
| 2 | 「待核」触发条件 | **字段缺失/契约层 null → 待核**；有值即显（含低 cred）；创作者库同规则 | 与 F004 渲染契约语义统一（null→待接入族），可机械判定 |
| 3 | 两个 create_share_link | UI 传不同 scope（project/quarterly），确认卡 harm 显各自数据范围行 | 闸门如实披露原则（ADR-08）；真工具实装留 M4 |
| 4 | URL 即状态 | 4 个状态位全 URL 化：?env=（F007）/creators 筛选（F013）/runs 筛选（F016）/kbGame（F014） | kimi §6.5 架构权威；原型内存态是原型工具局限非设计意图 |
| 5 | 创作者库 guardrail 元素 | 补入 V9 清单（#14/#16） | 原型实物存在；IA 契约句族 |
| 6 | Reach 报价按钮 | spec 写死：th-head 内、仅 stage==='谈判中' 条件渲染 | 原型实物规则；防实现成常显 |
| 7 | AgentSquad 形态 | 单组件 `variant: 'grid' \| 'compact'` | 同一数据源两种密度，variant 优于拆分 |
| 8 | today 团队负荷卡 | **保留**，免责 eyebrow「单一角色，仅用于分工」为必须元素；F001 定稿时 kimi §6.1 表补注 | 原型 UI canonical；D26 张力已由原型自身免责句解决 |
| 9 | Toast | 自建轻量 `common/Toast`（单例+2.4s+底部居中），不扩 Chakra 白名单 | 语义简单；Chakra 原语白名单是既定架构边界 |
| 10 | ProvenanceTag 形态 | `variant: 'badge' \| 'inline'` | 抽屉胶囊态 + 知识页内联态两处实物 |
