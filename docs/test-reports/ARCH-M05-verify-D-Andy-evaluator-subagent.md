# ARCH-M05 验收报告 · 分组 D（F008–F012 五环节语法面）

| 项 | 内容 |
|---|---|
| 批次 | ARCH-M05 |
| 分组 | **D — F008 Brief / F009 Match / F010 Reach / F011 Delivery / F012 Insight** |
| 阶段 | verifying（首轮） |
| Evaluator | Andy/evaluator-subagent（隔离上下文） |
| 转派说明 | 本 subagent 原承接分组 A（F001 文档验收）。因新 subagent 通路故障转派接手 D 组。**A 组工作与 F008–F012 的实现过程无任何上下文重叠**（A 组只读架构文档与 schema/gate 代码，未接触 `src/components/envs/`），独立性铁则成立，特此记录备查。 |
| 日期 | 2026-07-21 |
| 验收依据 | `features.json` F008–F012 acceptance（权威）· `ARCH-M05-spec.md` §3 / D2 / D6 / D8 / 裁决 #1#2#3#6 · `ARCH-M05-ui-inventory.md` §V4–V8（逐元素权威）· 原型 `interaction-prototype-v2.html` L757-817 · `architecture.md` §6.3 |
| 方法 | 静态实物 Read/grep + **headless 浏览器实测**（Playwright/chromium 1512×982，本地 production build，`/admin/campaigns/xg?env=<env>` 五面），含点击交互实测（批准 / 报价 / 发送 / 放款 / 采纳 / 分享）与闸门确认卡逐字取证 |

## 0. 总判定

> ## **PASS**（5/5 feature 全通过）

| Feature | 视图 | 清单元素 | Verdict |
|---|---|---|---|
| **F008** Brief 态势简报 glance | V4 | 19 | ✅ **PASS** |
| **F009** Match 对比矩阵 compare | V5 | 22 | ✅ **PASS** |
| **F010** Reach 对话收件箱 converse | V6 | 24 | ✅ **PASS** |
| **F011** Delivery 条件台账 verify | V7 | 11 | ✅ **PASS** |
| **F012** Insight 对照账本 reconcile | V8 | 19 | ✅ **PASS** |
| **D8** 五面结构互不相同 | — | — | ✅ **PASS**（5/5 结构签名互异） |
| **L1 门** | lint / tsc | — | ✅ **PASS**（tsc exit=0；ESLint「No warnings or errors」） |

**元素覆盖：95 元素**（19+22+24+11+19）——全部 🔒 硬性项、🚪 闸门触发点、条件渲染规则与四项 Planner 裁决（#1/#2/#3/#6）逐条实测取证，无简化、无退化。

> ⚠️ **重要环境发现（非产品缺陷，见 §7）**：本机 `next dev` 构建管线损坏，**全部路由（含 `/api/health`）返回 500**。经 `next build` 验证产品代码健康（21/21 静态页成功），改用 production server 后五面全 200。**此为环境误报，已排除，不计入任何 feature 判定。**

---

## 1 · F008 Brief 态势简报（V4 · 19 元素）—— ✅ PASS

语法 = **仪表 glance**（看方向对不对）。`.glance` 双栏 1.15fr/1fr。

| V4 # | 元素 | 实测证据 | 判定 |
|---|---|---|---|
| 1 | eyebrow「目标健康度 · 有效曝光达成」 | 在场（渲染逐字一致） | ✅ |
| 2/3 | HalfGauge 64% + 中央 32px 读数 | `64%` 渲染在场 | ✅ |
| 4 | 副读数「192万 / 300万 曝光」 | 逐字命中 | ✅ |
| 5–8 | mtile ×4 | 预算消耗 / 时间进度 / 在谈创作者 / 已发内容 **4/4** | ✅ |
| 5–8b | 各 tile **mt-s 副行** | `剩 $6.5k` / `剩 13 天` / `2 已确认` / `4 待审` **4/4** | ✅ |
| 9 | 🔒 blocker 阻塞卡（琥珀 + alert + 说明） | 「1 处阻塞 \| 硬核射击向创作者开播率低于预期，Agent 建议补充 2 位直播首曝位。」 | ✅ |
| 9b | 🔒 **裁决 #1：卡内不加处置按钮** | **实测卡内 `button` 数 = 0**（处置入口走 Copilot） | ✅ |
| 10 | chartcard 曝光趋势 LineAreaChart 12 点 | 「近 12 天曝光趋势（万）/ 192万 / +8%」+ apex canvas 渲染成功 | ✅ |
| 11 | timeline eyebrow「Agent 推进计划」 | DOM raw = `Agent 推进计划`（渲染态 `AGENT 推进计划` 系 `.uppercase` CSS，非文案差异） | ✅ |
| 12–14 | tstep **done ×2 / cur / 未开始 ×1** | 限定 timeline 容器实测 **恰好 4 步**：`目标与预算确认(已完成)` `创作者组合已批准(已完成)` `触达谈判中(需要你)` `交付与结算(未开始)` | ✅ |
| 15 | 🔒 cur「需要你 · 在「触达谈判」」brand 加粗 | 逐字命中，`text-brand-500 font-bold` | ✅ |
| 16–17 | 连接线 | 实测 3 条（4 步应 3 条，末步不画） | ✅ |
| 18–19 | 🔒 **三态圆点** | 实测 tone 序列 `green-500 / green-500 / brand-500 / gray-300` —— 绿实心 / 紫+光晕 / 灰空心 **三态齐全未压缩** | ✅ |
| D8 | 不得退化成表 | 页面 `table` 数 = **0** | ✅ |

---

## 2 · F009 Match 对比矩阵（V5 · 22 元素）—— ✅ PASS

语法 = **compare**（横向比组合）。

| V5 # | 元素 | 实测证据 | 判定 |
|---|---|---|---|
| 1 | `.cmatrix` 矩阵 130px+3 列 min-w 700 | grid 容器 `min-w-[700px] grid-cols-[130px_repeat(3,...)]` 在场 | ✅ |
| 1b | **D8：矩阵为独立组件非 DataTable** | 页面 `table` 仅 **1 个**（= FUZZY 候选表）；矩阵为 grid 结构 | ✅ |
| 2 | col-h ×3 | 3 组合列 | ✅ |
| 3 | 🔒「★ Agent 推荐」**仅 best** | 全页出现 **1 次** | ✅ |
| 3b | 🔒 其余列 **`&nbsp;` 占位保高** | DOM 实测非 best 列 `<small>` 内容 charCode **160**（U+00A0），高度 **16.5px** 与 best 列 **完全相同** → 保高成立 | ✅ |
| 4 | 🔒 best 渐变高亮 | `from-brandSoft-a to-brandSoft-c` | ✅ |
| 5 | 🔒 minibars 6 根 ×3 列 | 实测每列柱数 `[6,6,6]` | ✅ |
| 6–9 | 指标行 触达/预算/风险/规模 | 4/4 | ✅ |
| 10 | 🔒「依据」推荐理由行 | 在场 | ✅ |
| 11 | 🔒 pick 列淡紫底贯穿 | `bg-brand-50` 贯穿 best 列全行 | ✅ |
| 12 | foot「批准这组」×3（best 实心/其余 ghost） | 按钮数 **3** | ✅ |
| 13 | sec-head「Agent 拿不准 · 待你裁定」 | 逐字在场 | ✅ |
| 14 | meta「N 位候选」 | 「**4 位候选**」 | ✅ |
| 15 | FUZZY 表 5 列 | 列头 `["创作者","受众匹配","存疑原因","初判",""]` | ✅ |
| 16 | who avatar+名+平台 | 在场 | ✅ |
| 17 | 🔒 **受众匹配二形态（裁决 #2）** | 逐行实测：`미유→待核` / `Ch→68%` / `和风→待核` / `Yu→73%` ——**字段缺失→待核，有值即显，低置信度不显裸分** | ✅ |
| 18 | 存疑原因灰字 | 在场 | ✅ |
| 19 | 初判 pill **三态** | 实测 `? / 中 / 高` 三值三样式 | ✅ |
| 20 | 「审阅」ghost | 4 个（每行一个） | ✅ |
| 21 | 🔒 底部 shield（D27 解释义务） | 逐字：「批准组合只是让方案**生效并交给触达谈判**——内部动作，不发任何邮件，所以没有确认弹窗。」 | ✅ |
| 22 | 🔒 **批准 = internal 无弹窗** | **点击实测**：`[role=dialog]` 数 = **0**；Toast =「方案「A · 生活流精投组」已生效，交给触达谈判」 | ✅ |

> **口径差异（已声明，不判 FAIL）**：`match/index.tsx:10-12` 注明「mock 不真切环节（真 MatchPlan approve → `cur='reach'` 推进归 M2）」。原型交互为 `cur='reach'` 自动跳环节；实现以 Toast 反馈替代并显式注释归位 M2。核注释在场，符合任务书豁免条款。

---

## 3 · F010 Reach 对话收件箱（V6 · 24 元素）—— ✅ PASS

语法 = **converse**（聚焦一个人）。M0.5 内唯一接触闸门 UI 的环节面。

| V6 # | 元素 | 实测证据 | 判定 |
|---|---|---|---|
| 1 | 三栏 280/1fr/240 min-h 540 | `getComputedStyle.gridTemplateColumns = "280px 281px 240px"` | ✅ |
| 2 | 左栏搜索框 | input 1 个 | ✅ |
| 3 | ibrow **×7** | 实测 7 人：PixelHana / GG龙 / NovaMei / 유나Play / MeepleMax / KaiReviews / Lila Streams | ✅ |
| 4 | 🔒 阶段 pill **五态** | 实测 5 个不同值：`谈判中 / 已确认 / 已回复 / 已发送 / 待发送`（与 `ReachStage` 类型定义完全一致） | ✅ |
| 5–7 | avatar / 名 / last 预览 / on 淡紫 | 在场 | ✅ |
| 8 | th-head avatar+名+sub | 在场 | ✅ |
| 9 | 🔒🚪 **裁决 #6：「确认报价」仅 `stage==='谈判中'`** | **正反双向实测**：PixelHana（谈判中）→ 报价钮 = **1**；MeepleMax（待发送）→ **0**；KaiReviews（待发送）→ **0**。条件渲染成立，未实现成常显 | ✅ |
| 10–13 | th-msgs 对话区 / msg in 白左 · out 渐变紫右 / 时间戳 | 在场 | ✅ |
| 14 | 🔒 **空态句** | **两人实测**（mock `thread=[]` 的 MeepleMax + KaiReviews）均渲染：「**还没有往来 —— Agent 已为你起草首封邀约，见下方。**」 | ✅ |
| 15 | 🔒 draft dlbl「Agent 起草 · 可编辑后发送」+spark | 逐字在场 | ✅ |
| 16 | textarea 可编辑（**改草稿 = internal**） | textarea 1 个，可编辑无弹窗 | ✅ |
| 17 | 🔒 hint「发送是对外动作，会先让你确认」+shield | 逐字在场 | ✅ |
| 18 | 「重写」ghost | 在场 | ✅ |
| 19 | 🚪「发送」红 gate | 在场 | ✅ |
| 20 | 右栏受众匹配 **ring 84** | 实测 svg 尺寸 **84×84**；值 88% | ✅ |
| 21 | 档案 **4 行 kv** | 平台 YouTube / 粉丝量 61万 / 历史合作 2 次合作 / 当前阶段 谈判中 = **4 行** | ✅ |
| 22 | 「Agent 建议」段 | 「该创作者硬核向受众占比高，建议强调实机手感与独家档期。」 | ✅ |
| 23 | 🔒 底部语法差异宣示 | 逐字：「整个环节聚焦一个人：左列谈到哪一步、中间对话与草稿、右侧这个人的匹配与档案——**和「创作者匹配」的横向对比正好相反**。」 | ✅ |
| 24 | 双闸门接线 | 见下表 | ✅ |

### 🚪 双 GateConfirm harm 逐字取证（实测弹窗内容）

| 闸门 | 标题 | harm 行 | irrev 文案 | 判定 |
|---|---|---|---|---|
| `send_outreach` | 确认发送对外邮件 | **2 行**：`收件人 = PixelHana · YouTube`｜`动作 = 发送邀约邮件` | 「**对外 · 发出后不可撤销**」 | ✅ 与 V6「harm 2 行」一致 |
| `commit_quote` | 确认价格承诺 | **3 行**：`金额`｜`交付内容`｜`授权范围` | 「**对外 · 承诺后不可撤销**」 | ✅ 与 V6「harm 3 行」一致 |

**发送后 stage 联动实测**：点击「确认发送」→ Toast「邀约已发送（mock）」+ 该人 stage 由 `谈判中` 变为 `已发送`。**联动成立。**

> **D6 边界合规**：两处确认后走 mock 流（Toast + 本地 stage 变更），源码 `ConversationInbox.tsx:6-9` 显式标注「真 send_outreach / commit_quote 的 pending → `/api/gate/{confirm,reject}` 服务端链路与工具实装归 M3——接线时以 `confirmSend` / `confirmQuote` 两处 stub 为唯一替换点」。**符合 spec D6「明确 stub 标注」要求**，非缺陷。

---

## 4 · F011 Delivery 条件台账（V7 · 11 元素）—— ✅ PASS

语法 = **verify**（逐条核对条件）。

| V7 # | 元素 | 实测证据 | 判定 |
|---|---|---|---|
| 1 | 台账 **7 列** | 列头 `["创作者 / 交付","内容","KEY","合同","托管","#AD","放款"]` | ✅ |
| 2 | 行 who **纯色方块 av**（非色轮） | 5 个 `rounded-[10px]` 方块，inline `background: rgb(1,181,116)` 等——由 mock `r.av` 指定色值，非 avatar 色轮 | ✅ |
| 3 | sub 交付物 | 在场 | ✅ |
| 4 | 🔒 note 附注**条件渲染** | mock 实测 5 行中 **2 行 `note:null`（不渲染）/ 3 行有值**（`合同待补签` `终稿未交 · 缺 #ad` `托管未到账`）——条件渲染成立，未填 `''` 冒充 | ✅ |
| 5 | 🔒 条件单元 **三态不得压成二态** | 实测渲染值集合 = **`["齐","缺","—"]`**（ok 绿 / miss 琥珀 / **na 灰**）三态齐全 | ✅ |
| 6 | 放款金额右对齐 800 | `font-extrabold tabular-nums` + `align:right` | ✅ |
| 7 | 🚪「放款」红 gate **仅 ready** | **逐行实测**：`Me $1,600→放款钮` / `龙猫 $1,400→条件未齐` / `Ar $1,200→条件未齐` / `Su $900→放款钮` / `De $1,100→条件未齐` = **5 行中 2 个放款钮**，与 mock `ready: true×2 / false×3` 精确对应 | ✅ |
| 8 | 🔒「条件未齐」灰字**替代按钮位** | 3 处；**该 3 行 pay 单元内 `button` 元素为 `null`**（非 disabled 按钮，是灰字替代） | ✅ |
| 8b | 🔒 不得改成 disabled 按钮 | delivery 台账内 disabled 按钮 = **0** | ✅ |
| 9 | 🚪 payout 确认卡 | harm **3 行**：`收款方 / 金额 / 依据`；irrev =「**资金动作 · 放款后不可撤销**」 | ✅ |
| 10 | 🔒 底部 shield | 逐字：「这里**没有 AI 推荐卡**——只有条件是否满足。放款逐笔执行，必须消费合同、托管与披露证据；缺什么显什么，**不提供绕过入口**。」 | ✅ |
| 11 | 🔒 **反向 guardrail** | **实测：图表数 = 0 · KPI 行 = 无 · AI 推荐卡 = 无 · 「批量」字样 = 无**。刻意缺失项一个未补 | ✅ |

> **反向 guardrail 是本 feature 最易被"好心补全"破坏的约束，实测确认 Generator 严格克制。**

---

## 5 · F012 Insight 对照账本（V8 · 19 元素）—— ✅ PASS

语法 = **reconcile**（对账原目标）。

| V8 # | 元素 | 实测证据 | 判定 |
|---|---|---|---|
| 1–4 | 对照表 **4 列** | 列头 `["指标","原目标","实际","差异"]` | ✅ |
| 1b | 🔒 **三值三样式** | 首行 DOM class 实测：原目标 `text-gray-600`（灰）｜实际 `font-bold text-navy-700`（navy 700）｜差异 `font-extrabold text-horizonGreen-500`（绿 up）——`+8%` 绿、down 走 `text-horizonRed-500`。**三值三样式未统一** | ✅ |
| 5 | 证据缺口卡 eyebrow「证据缺口 3」 | 逐字命中 | ✅ |
| 6–8 | 🔒 gaprow ×3（诚实归因边界） | mock 实测 **3 条**：「北美安卓渠道缺归因回传，低留存暂不能直接归因于创作者」「自然安装与投流安装尚未拆分」「部分创作者未上报真实播放来源」 | ✅ |
| 9–11 | 渠道 chartcard BarChart **5 柱** | apex 柱数实测 = **5** | ✅ |
| 12 | 受众构成 donut 150 | apex donut 渲染成功（页面 apex canvas = 2） | ✅ |
| 13 | 🔒 **donut 中心叠加读数** | 实测中心叠加 DOM：`71%` + `休闲玩家`（父节点 `71%\|休闲玩家`），非图例误认 | ✅ |
| 14 | legend **4 行** | 实测 4 行：`休闲农场向 44%` / `生活方式 27%` / `亲子家庭 18%` / `其他 11%` | ✅ |
| 15–17 | retro 卡（渐变淡紫）dlbl + 正文 | 「Agent 复盘草案 · 采纳后可复用到下个项目」+ 渐变背景在场 | ✅ |
| 18 | 「采纳结论」**internal 无弹窗** | **点击实测**：`[role=dialog]` = **0** | ✅ |
| 19 | 🚪「生成对外分享报告」红 gate | 在场，点击弹出 GateConfirm | ✅ |
| 19b | 🔒 **裁决 #3：scope=project** | 确认卡 harm 实测：「**数据范围 = 本项目汇总指标 · 不含联系方式**｜有效期 = 14 天」；irrev =「对外 · 链接生成后数据可能被转发」。mock 源 `scope:'project'`——**与 V12 跨项目页 `scope=quarterly` 正确区分** | ✅ |

---

## 6 · 横切验收

### 6.1 D8 五面结构互不相同 —— ✅ PASS

实测 DOM 结构签名（5 项互异，`distinct = 5/5`）：

| 面 | table | 矩阵 grid | apex 图 | textarea | 三栏布局 | timeline 圆点 | tbody 行 | **主语法** |
|---|---|---|---|---|---|---|---|---|
| brief | 0 | 0 | **2** | 0 | 0 | **4** | 0 | 仪表 + 时间轴 |
| match | 1 | **1** | 0 | 0 | 0 | 0 | 4 | 矩阵 + 候选表 |
| reach | 0 | 0 | 0 | **1** | **1** | 0 | 0 | 三栏对话 |
| delivery | 1 | 0 | 0 | 0 | 0 | 0 | **5** | 纯台账 |
| insight | 1 | 0 | **2** | 0 | 0 | 0 | 4 | 对照表 + 双图 |

**五套语法确实互不相同，无一退化成同构表格**（FR-7.10/7.11 满足）。Delivery 与 Insight 虽同含 `table`，但 Delivery **零图表零 KPI**、Insight **含双图 + 缺口卡 + retro 卡**，语法本体不同。

### 6.2 mock 走契约层（D2）—— ✅ PASS

| 面 | 契约层入口 | 证据 |
|---|---|---|
| brief | `readContractSlot` ×5 段（gauge/metrics/blocker/trend/timeline） | 每段独立降级 → `PendingSlot` 占位 |
| match | `readContractSlot` ×2 + `isPendingVerification` | 「待核」二形态由契约层 null 机械驱动 |
| reach | `readContractSlot(reachThreadSchema)` → `?? []` | thread 脏/缺 → 空态句 |
| delivery | mock 类型化 + `note: string \| null` | null 不渲染，注释明示「绝不填 '' / 0 冒充实测」 |
| insight | `readContractSlot` ×6 段 | 每段独立降级 |

**D2「null → 待接入/待补充/待核，绝不抛错、绝不填 0」全面落实；浏览器实测 pageerror = 0、console error = 0。**

### 6.3 挂载契约 —— ✅ PASS

五面均 `export default function XxxEnv({ projectId }: { projectId: string })`，由 `ProjectDetail.tsx:38-43` `ENV_SURFACE` 静态映射消费（`brief/match/reach/delivery/insight` 五键齐全）。

### 6.4 L1 门 —— ✅ PASS

- `npx tsc --noEmit` → **exit 0**
- `npm run lint` → **✔ No ESLint warnings or errors**
- `npm run build` → **21/21 静态页生成成功**，`/admin/campaigns/[id]` 19.2 kB

---

## 7 · 环境发现（非产品缺陷，须记录）

**现象**：本机执行 `npm run dev` 后，`/admin/campaigns/xg?env=<env>` 五面中 3 面（reach/delivery/insight）返回 500；清理 `.next` 重启后**全部路由（含 `/admin/today`、`/admin/creators`、`/api/health`）一律 500**。

**根因（dev server 日志实证）**：
```
Error: Cannot find module './vendor-chunks/@vercel.js'
Error: ENOENT: no such file or directory, open '.../.next/routes-manifest.json'
```
`next dev` 构建管线自身损坏（vendor chunk 与 routes-manifest 缺失），**与产品代码无关**——判据：连仅返回 `{ok:true}` 的 `/api/health` 也 500。

**排除方式**：改走 `next build` + `next start`（任务书授权的 standalone 路径）→ 构建 **21/21 全绿**，五面 **全部 HTTP 200**，全部交互实测正常。

> **结论：环境误报，已排除，不计入任何 feature 判定。** 若其他分组 subagent 在本机遇到同类 500，应先跑 `next build` 交叉验证再判定，勿记为产品缺陷。
>
> **建议（proposed-learnings 候选，供 done 阶段裁决）**：将「`next dev` 全路由 500 + `routes-manifest.json` ENOENT → 先 `rm -rf .next && next build` 交叉验证，勿判产品缺陷」补入 `framework/patterns/testing-env-patterns.md`。本批 F017 已沉淀过同族的「CDN 字体每测试重拉致视觉套件抖动」根因，本条属同一类「环境伪装成产品缺陷」的坑。

---

## 8 · 未执行项与边界声明

| 项 | 状态 | 说明 |
|---|---|---|
| **[L2] 真实 `/api/gate` 闸门链路** | **未执行（不适用）** | M0.5 按 spec D6 只做「触发点 + 确认卡 UI」，三处闸门（send_outreach / commit_quote / payout）均为 mock 流并在源码显式 stub 标注，真实工具归 M3。**非欠账，是既定边界。** |
| **[L2] 真实计费 / 生产写入** | **未执行** | 本次仅本地 production server，不涉外部服务与生产数据。 |
| 视觉像素级基线比对 | 未执行（归 F017/E 组） | 本报告为元素级 + 交互级验收；`project-*-darwin.png` 基线回归归 F017 收口与 E 组。 |
| V1/V2/V3/V9–V13 | 不在本组范围 | 归 B/C 组。 |

---

## 9 · 验收执行命令（可复现）

```bash
# 环境（先排除 dev server 误报）
rm -rf .next && npm run build          # → 21/21 静态页
npx next start                          # → production server :3000
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/admin/campaigns/xg?env=brief"  # 200

# 五面元素级 + 交互级探针（Evaluator 私有，运行于 /tmp，不入仓库）
node /tmp/d-probe.mjs      # 主探针：95 元素 + 点击实测
node /tmp/d-probe2.mjs     # 复核：放款列 / legend / send 闸门 / D8 签名
node /tmp/d-probe3.mjs     # 复核：空态两人 / 裁决#6 正反双向 / ring 84
node /tmp/d-probe4.mjs     # 复核：uppercase eyebrow / timeline 4 步 / nbsp charCode 160

# L1 门
npx tsc --noEmit && npm run lint
```

**探针误报订正记录**（首轮 6 处「疑似 FAIL」经复核全为探针缺陷，非产品问题）：

| 首轮告警 | 复核结论 |
|---|---|
| V4-11 eyebrow 文案不匹配 | `.uppercase` CSS 致 `innerText` 返回 `AGENT`，DOM raw 正确 → PASS |
| V4-12 done 计数 = 4 | 环节导轨 rail 的「已完成」污染计数；限定 timeline 容器后恰为 done×2 → PASS |
| V6-4 五态 pill 仅 3 态 | 探针用了错误的态名（待触达/已婉拒）；实际五态为 待发送/已发送/已回复/谈判中/已确认 → PASS |
| V6-send harm 空 | 前一个报价弹窗未关闭致点击落空；直接点击后 harm 2 行齐全 → PASS |
| V7-7 放款钮 = 5 | Playwright `getByRole(name)` 默认子串匹配，命中 Copilot 面板「查看待放款」等；逐行 DOM 实测恰为 2 → PASS |
| V7-8b disabled 按钮 = 1 | 该按钮为 Copilot 输入框的 `aria-label="发送"`（空输入时禁用），非台账列 → PASS |
| V8-14 legend = 2 | 色块选择器过窄；实际 legend 4 行文本齐全 → PASS |

---

**Evaluator 声明**：本报告在隔离上下文中产出，全部结论基于仓库实物代码与 headless 浏览器实测证据，未采信编排者或实现者的任何质量描述。本次验收**未修改任何产品代码或文档**（`git status` 确认工作区仅新增本报告；探针脚本全部置于 `/tmp`，不入仓库）。分组 A/B/C/E 的 feature 不在本报告评分范围内。
