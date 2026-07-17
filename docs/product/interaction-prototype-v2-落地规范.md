# 原型 → Next.js 落地规范（手写件 → Horizon 真组件映射）

> **版本** v1.0 · 2026-07-17
> **源原型** `docs/product/interaction-prototype-v2.html`（自包含 HTML Artifact，交互/IA 已验证）
> **依据** Horizon 复用审计（2026-07-17，39 findings）+ 脚手架组件 API 侦察 + 项目地基侦察
> **状态** 草案 · 供未来 UI 落地批次（暂命名 WORKBENCH-UI）作实现规范；尚未挂 features.json
> **读者** Generator（把原型实现成真实 Next.js 页面的人）

---

## 0. 一句话

原型是**单文件 HTML**，无法 `import` React/Chakra/ApexCharts —— 所以里面**一切都是手写的**。本文把每个手写件映射到 Horizon 脚手架里的**真组件 / 真方法 / 真 token**，落地时**优先复用、避免重新手写**。原型的 token 已按审计对齐 Horizon 数值，落地时**用 Tailwind className 表达、不要照抄原型的自定义 CSS**。

---

## 1. 核心原则（落地时逐条守）

1. **复用优先级**：① 直接用 Horizon 现成组件 → ② 无组件但有 className/token 约定，照约定写 → ③ 两者都无，才新建组件（见 §6），且用 Horizon 原语拼。
2. **不搬原型 CSS**：原型的 `.card/.btn/...` 自定义 CSS 是 Artifact 的权宜。落地用 `<Card>`、`className="... rounded-xl bg-brand-500 ..."` 等，颜色走 `var(--color-*)`（由 `AppWrappers` 注入），**禁止再写一套 CSS 变量**。
3. **数据点必带溯源**：原型的「素材溯源」「Apify 采集 / 平台 API / 你上传 / AI 估算」标签，对应数据层 `Kol.fieldProvenance`（F001）。落地时每个展示字段都能回答"这数字哪来的"。
4. **单角色 + 多 Agent**：产品只有一个业务角色（营销操盘手），但有一队专家 Agent（每环节一位 + 合规）。无 role/scope/权限层/审批链（D26）。
5. **AI→人闸门是硬约束**：对外/花钱/不可逆动作**服务端强制**不可由 Agent 直接执行（F008：未经人确认返回 403/pending），内部可撤销动作**不加闸门**（D27/D28）。

---

## 2. 起点：项目已有地基（DS-FOUNDATION 已交付，直接站上去）

| 已有 | 位置 | 落地怎么用 |
|---|---|---|
| **admin 外壳** | `src/app/admin/layout.tsx` | 新页放 `src/app/admin/<path>/page.tsx` 即自动获得 Sidebar+Navbar+Footer |
| **色阶注入** | `src/app/AppWrappers.tsx` | `--color-50..900` 已注入 `:root`；`brand-*` = `var(--color-*)`。换主题改 `theme` 对象即可 |
| **深浅色** | `body.dark` class（`tailwind darkMode:'class'`）；toggle 在 `navbar/Configurator.tsx` / `fixedPlugin/FixedPlugin.tsx` | 用 `dark:` 变体，**不要**自建 `data-theme` |
| **路由表** | `src/routes.tsx`（`IRoute[]`，现 5 项） | 加导航 = import `react-icons/md` 图标 + 往数组 push `{name,layout:'/admin',path,icon}` |
| **现成占位页** | `discovery / database / campaigns / outreach` 均只渲染 `common/ComingSoon` | 原地替换成真实页 |
| **字体** | Google Fonts `@import`（`styles/index.css`）；`public/fonts/dm-sans/*.ttf` 本地存在但 `Fonts.tsx` 未接线 | 建议改 `next/font/local`（DM Sans 已有 ttf）；Poppins 需补 ttf 或保留 CDN |
| **构建门** | `package.json`：`dev/build/lint/typecheck(tsc --noEmit)/test:visual(playwright)` | 落地每页过 `build + tsc + lint` 全绿 + visual baseline |
| **技术栈** | Next 15 App Router · React 19 RC · TS 4.9 · Tailwind 3.3 · Chakra 拆包原语 · 裸 `src` 导入（无 `@/`） | 沿用 |

> ⚠️ **后端尚未落地**：AGENT-FOUNDATION 全 8 条 `pending`，`src/lib/ai`、`src/app/api/agent`、`prisma/` 均未建。本 UI 规范可**先用 mock 数据落地页面**（前端优先），再由 AGENT-FOUNDATION 接真数据/Agent 运行时。

---

## 3. 路由与页面落地（原型 6 页 + 项目详情 → src/app/admin）

原型 IA 已演进为 6 个侧栏入口 + 项目详情（五环节 tab）。与现有 5 路由的对应：

| 原型页 | 新路由 | 现有对应 | 页面文件 | 复用/新建 |
|---|---|---|---|---|
| 今天（雷达） | `/admin/today` | — | `admin/today/page.tsx` | 新建 |
| 项目（列表） | `/admin/campaigns` | Campaigns 占位 | `admin/campaigns/page.tsx` | 替换占位 |
| 项目详情 + 五环节 | `/admin/campaigns/[id]` | — | `admin/campaigns/[id]/page.tsx` | 新建（内含环节 tab 切换） |
| 创作者库 | `/admin/creators` | Discovery+Database 占位可合并 | `admin/creators/page.tsx` | 替换占位 |
| 游戏知识 | `/admin/knowledge` | — | `admin/knowledge/page.tsx` | 新建 |
| 洞察 | `/admin/insight` | — | `admin/insight/page.tsx` | 新建 |
| Agent 记录 | `/admin/runs` | Outreach 占位可复用槽位 | `admin/runs/page.tsx` | 替换占位 |

> `routes.tsx` 更新：把现 5 项换成上述 6 项（图标建议：today `MdOutlineToday` / campaigns `MdCampaign` / creators `MdPersonSearch` / knowledge `MdVideogameAsset` / insight `MdInsights` / runs `MdHistory`）。项目详情不进侧栏，由项目列表卡片 `router.push` 进入。五环节用页内 tab（非路由）或 `?env=` query。

---

## 4. 组件复用映射表（★核心 —— 手写件 → 真组件）

> Import 别名根 = `src`（`components/...` 即 `src/components/...`）。**无 barrel 的要按文件名精确 import**（`fields/*`、`charts/*`、`card/MiniStatistics|CardMenu`）。

### 4.1 布局外壳（原型手写 → 直接用外壳，几乎不用碰）

| 原型手写 | 落地 | 说明 |
|---|---|---|
| `.side` 浮起圆角侧栏 + `.nav` active 竖条 + `.side-cta` 渐变 | `components/sidebar` + `sidebar/components/Links` + `SidebarCard` | 建页即自动套用；导航来自 `routes.tsx`；active 逻辑 `pathname.includes(routeName)` 已内置；右侧指示条内置 |
| `.navbar` 悬浮玻璃 + `.nb-cmd` 指令栏 + `.nb-av` | `components/navbar`（`fixed right-3 top-3 rounded-xl bg-white/30 backdrop-blur-xl`）| 搜索胶囊 + Dropdown + Configurator 内置。**指令栏是产品新增** → 把 navbar 的搜索位替换/扩展为"问 Agent"输入（保留玻璃外壳） |
| 三栏 grid + `.copilot` 常驻列 | admin `<main>` + 独立 `fixed` 右栏（新建 CopilotPanel，§6） | copilot 是产品件，Horizon 无对应 |

### 4.2 卡片 / KPI / 按钮

| 原型手写 | 真组件 / 约定 | Import & 用法 |
|---|---|---|
| `.card`（rounded-20 + shadow） | **`Card`** | `import Card from 'components/card'` → `<Card extra="p-5 ...">…</Card>`（`extra` 追加 className） |
| `.kpi`（MiniStatistics） | **`MiniStatistics`** | `import MiniStatistics from 'components/card/MiniStatistics'` → `<MiniStatistics name="待你确认" value="3" icon={<MdBolt/>} iconBg="bg-lightPrimary"/>` |
| `.btn`（扁平紫） | **className 约定（无 Button 组件）** | `<button className="linear flex items-center justify-center rounded-xl bg-brand-500 py-[11px] px-5 font-bold text-white transition duration-200 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400">…</button>` |
| `.btn.gate`（闸门红） | className | 同上，`bg-red-500 hover:bg-red-600`（破坏性/对外） |
| `.btn.ghost` | className | `bg-lightPrimary text-gray-700 hover:text-brand-500`（或用 `ComingSoon` 里 ghost 写法参照） |
| 卡片 ⋯ 菜单（原型无，未来需要） | **`CardMenu`** | `import CardMenu from 'components/card/CardMenu'` → `<CardMenu vertical/>` |

### 4.3 图表（★原型手写 SVG 全部换 ApexCharts）

> 所有 chart 组件写死 `height="100%"` → **必须放在有明确高度的容器**（`Card` 里给 `h-[…]`）。`chartData` = ApexCharts series，`chartOptions` = options。`variables/charts.ts` 有大量现成预设可复用/微调。

| 原型手写 | 真组件 | Import | data/options 参照 |
|---|---|---|---|
| `areaChart()`（曝光/ROI/播放趋势，已改平滑贝塞尔） | **`LineAreaChart`**（`type="area"`） | `import LineAreaChart from 'components/charts/LineAreaChart'` | `lineChartOptionsTotalSpent` / `MiniArea1` 系；`stroke.curve:'smooth'` 内置 |
| `barChart()`（渠道/项目 ROI） | **`BarChart`**（内部 `ColumnChart`，`type="bar"`） | `import BarChart from 'components/charts/BarChart'` | `barChartOptionsDailyTraffic` / `WeeklyRevenue`；`borderRadius:10` 内置 |
| `donut()`（受众构成/地域） | **`PieChart`**（`type="pie"`；如要中心孔+读数，传 `donutChartOptions*`） | `import PieChart from 'components/charts/PieChart'` | `pieChartOptions`（`[63,25,12]`）/ `donutChartOptionsGeneral`。**注意**：原型是细环 donut，落地要用 donut options（非默认 pie）才还原 |
| `ring()`（受众匹配/真实性/活跃度环） | **`CircularProgress`** | `import CircularProgress from 'components/charts/CircularProgress'` | `<CircularProgress title="受众匹配" percentage={88}/>`（pathColor `var(--color-500)`） |
| `.track` / kb-bar（横向进度条） | **`Progress`** | `import Progress from 'components/progress'` | `<Progress value={71} color="brand" width="w-full"/>`（color 枚举 red/green/…/brand） |
| `gauge()`（半环健康度仪表） | **新建**（Horizon 无半环，§6） | — | 用 ApexCharts `radialBar` startAngle -90/endAngle 90 |

### 4.4 表格（★原型手写 `<table>` 全部换 @tanstack/react-table）

| 原型手写 | 真方案 | 参照文件 |
|---|---|---|
| `table.tbl`（创作者库/交付台账/记录/洞察，纯手写、无排序分页） | **`@tanstack/react-table`** + 新建通用 `DataTable`（§6） | 抄 `components/admin/main/applications/data-tables/ComplexTable.tsx` |
| 状态列（齐/缺/待核、自动/闸门/拦截/不可逆） | react-icons/md 状态图标 | ComplexTable 里 `MdCheckCircle`(绿)/`MdCancel`(红)/`MdOutlineError`(琥珀) |
| 交付台账"条件是否满足" | `<Progress>` 或状态图标列 | 同上 |
| 筛选 chips（记录页/创作者库） | `getFilteredRowModel` + 头部筛选 UI | 分页表 `SearchTableOrders.tsx` |

列定义模式（照抄）：
```tsx
const columnHelper = createColumnHelper<RowObj>();
const columns = [
  columnHelper.accessor('name', {
    id: 'name',
    header: () => <p className="text-sm font-bold text-gray-600 dark:text-white">创作者</p>,
    cell: (info) => <p className="text-sm font-bold text-navy-700 dark:text-white">{info.getValue()}</p>,
  }),
  // …受众匹配 → <Progress>；#ad → 状态图标
];
const table = useReactTable({ data, columns, state:{sorting}, onSortingChange:setSorting,
  getCoreRowModel:getCoreRowModel(), getSortedRowModel:getSortedRowModel() });
```
外层包 `<Card>` + `<CardMenu/>`，渲染用 `table.getHeaderGroups()` + `flexRender()`。

### 4.5 字段 / 输入

| 原型手写 | 真组件 | 说明 |
|---|---|---|
| `.nb-cmd input` / 搜索框 | **`InputField`** | `import InputField from 'components/fields/InputField'` → `<InputField id label placeholder state?/>`（`state:'error'|'success'` 三态，`disabled` 优先） |
| `.draft textarea`（邀约草稿） | **`TextField`** | `import TextField from 'components/fields/TextField'` → `<TextField id label placeholder cols rows state?/>` |
| 开关类设置（若加"金额二次确认"组织设置） | **`SwitchField`** | `<SwitchField id label desc mt mb/>`（无三态） |
| 标签输入（若加创作者打标/筛选标签） | **`TagsField`** | `<TagsField placeholderTags={[{name,id}]}/>` |

### 4.6 弹层（modal / drawer）→ Chakra + useDisclosure

> Horizon 用**拆包** `@chakra-ui/modal`、`@chakra-ui/hooks`、`@chakra-ui/popover`、`@chakra-ui/tooltip`、`@chakra-ui/accordion`（非整包）。

| 原型手写 | 真方案 | 现成用例参照 |
|---|---|---|
| gate 确认弹窗 `.modal/.scrim`（发送/报价/放款/分享） | **Chakra `Modal` + `useDisclosure`** | `components/actions/SeeStory.tsx`（`import { Modal, … } from '@chakra-ui/modal'` + `useDisclosure` from `@chakra-ui/hooks`） |
| 创作者详情 `.drawer`（右滑） | **Chakra `Drawer` + `useDisclosure`** | `components/navbar/Configurator.tsx`（`Drawer/DrawerContent/DrawerCloseButton`） |
| 悬浮提示 | `components/tooltip`（`TooltipHorizon`） | `<Tooltip placement content trigger/>` |
| 气泡浮层 | `components/popover`（`PopoverHorizon`） | — |

### 4.7 下拉 / 筛选 / 菜单

| 原型手写 | 真组件 | 说明 |
|---|---|---|
| copilot 动作卡浮层 / 卡片菜单 | **`components/dropdown`** | `<Dropdown button={…} classNames="top-11 right-0 w-max" animation="origin-top-right …">…</Dropdown>`（内置外部点击关闭 + scale 过渡） |
| 筛选 chips（记录/创作者库品类平台） | 保留 chip 交互（Horizon 无 chip 组件），或用 `Dropdown` 做多选浮层 | chip 是可接受的产品交互 |

### 4.8 其它交互 / 特效

| 原型手写 | 真方案 | 说明 |
|---|---|---|
| `toast()` 单例提示 | ⚠️ **模板无 `useToast`**（全仓 grep 空） | 需自引 `@chakra-ui/toast` 的 `useToast()`，或新建轻量 Toast（保留产品观感） |
| 主题切换（`data-theme` + matchMedia） | `document.body.classList.toggle('dark')` + `dark:` 变体 | 复用 `Configurator`/`FixedPlugin` 的切换；**删掉原型的 CSS 变量三套** |
| `::-webkit-scrollbar` 自定义滚动条 | **`react-custom-scrollbars-2`** | `<Scrollbars autoHide renderThumbVertical renderTrackVertical …>`，helper 见 `components/scrollbar/Scrollbar.tsx` |
| 内联 SVG 图标字典 `P` + `ic()` | **`react-icons`（主要 `react-icons/md`）** | 命名子集 import：`import { MdSend, MdCheckCircle } from 'react-icons/md'`。原型缺失的 `x` → `MdClose` |
| 内嵌 base64 DM Sans | **`next/font/local`** 指 `public/fonts/dm-sans/*.ttf`（接线 `Fonts.tsx` 或改 next/font） + 补 Poppins（标题/logo） | Poppins 本地无 ttf，需补或保留 Google CDN |
| Agent-live 脉冲 / minibars | 保留（纯 CSS，无对应组件） | 产品自创特效 |

---

## 5. Token / 设计系统对齐（原型已对齐 → 落地用 className）

原型已按审计把这些 token 对齐 Horizon（见 `interaction-prototype-v2.html` 头部 + smoke 回归断言）。落地时**换成 Tailwind class，不搬 CSS 变量**：

| 原型 token（已对齐） | Tailwind 表达 |
|---|---|
| `--card` 20px 圆角 + `--shadow` .08 | `rounded-[20px] shadow-3xl shadow-shadow-500 dark:shadow-none`（= `Card` 默认） |
| `--head #1B254B` | `text-navy-700 dark:text-white` |
| `--sub #707eae` / `--muted #a3aed0` | `text-gray-700` / `text-gray-600` |
| `--brand #422afb` | `bg-brand-500` / `text-brand-500`（= `var(--color-500)`） |
| `--lp #f4f7fe` | `bg-lightPrimary` |
| 按钮 `--rb 12px` 扁平 | `rounded-xl bg-brand-500 hover:bg-brand-600` |
| 进度条 rounded-full 纯色 | `<Progress>` |
| 侧栏浮卡 / 导航玻璃 | 外壳组件已内置 |

> **产品识别项（保留、不强对齐 Horizon 默认）**：渐变 CTA 卡（`bg-gradient-to-br from-brand-400 to-brand-600`，正好是 SidebarCard 写法）、指令栏、半环仪表、Copilot 列、Agent-live 脉冲。

---

## 6. 需要新建的组件（Horizon 无对应，用其原语拼）

| 新建组件 | 用途 | 用什么拼 |
|---|---|---|
| **`DataTable`** 通用封装 | 创作者库/台账/记录/洞察 共用 | `@tanstack/react-table`（抄 ComplexTable，抽出列配置 + 排序/筛选/分页 props） |
| **`CopilotPanel`** | 常驻多 Agent 对话面（右栏） | `Card` + `react-custom-scrollbars` + 消息气泡 + 动作卡（`Dropdown` 可选）+ 指令输入（`InputField`）。接 F005「常驻对话面」+ Vercel AI SDK `useChat` |
| **`ConversationInbox`** | 触达谈判环节（左选人 + 右对话 + AI 草稿 + 档案） | 三栏 flex + `TextField`（草稿）+ 闸门 `Modal` |
| **`AgentSquad` / `ExpertAgentHeader`** | 编队花名册 / 环节专家 Agent 头 + 职责隔离卡 + 协同交接 | `Card` + 状态点 + `Dropdown`（展开交接细节） |
| **`HalfGauge`** | 目标健康度半环仪表 | ApexCharts `radialBar`（startAngle -90 / endAngle 90，`var(--color-500)`） |
| **`GateConfirm`**（闸门确认卡） | 对外动作的"如实说明利害"确认 | Chakra `Modal` + 收件人/金额/「对外·不可撤销」利害清单 |
| **`ProvenanceTag`** | 数据来源徽标（Apify/平台/上传/估算） | 小 `span` + `Tooltip`（详情），字段来自 `Kol.fieldProvenance` |
| **`UploadZone`** | 游戏知识素材上传 + AI 解析状态 | `react-dropzone`（已装）+ 素材列表 + 解析状态；接策略 Agent 分析 |
| **`GenerativeCanvas` 协议** | Agent 工具结果 type → React 组件渲染（F005） | 注册表 `type → component`（KOL 卡/表/图）；对话里生成可操作卡 |

---

## 7. 多 Agent 架构落地（原型 `AGENTS` → 后端）

原型的多 Agent 编队（每环节一位专家 + 跨环节合规 + 编排 Agent）映射到 AGENT-FOUNDATION 的**四柱**（工具层 / Agent 运行时 / 常驻对话面 / generative canvas）：

| 原型件 | 落地 |
|---|---|
| `AGENTS`（strategy/match/reach/delivery/insight/compliance）+ 每环节专家 | 每个专家 Agent = 一套 **system prompt + 工具子集**（在 `src/lib/agent/` 注册表按环节 scope 工具）；进环节时 copilot 切到该 Agent |
| 「职责 / 隔离」卡 | Agent 的能力边界声明（否定式护栏 D13/F005：「我不会替你做什么」） |
| 「协同」可展开交接 | Agent 间 handoff：一个 Agent 调用另一个的输出（如触达 Agent 引用匹配 Agent 的受众数据）。落地用工具调用链 / 子 Agent |
| 编排 Agent（今天页/记录页） | 编排层：把待办跨环节汇总、调度专家 Agent |
| copilot 生成式动作卡 | **generative canvas**（F005）：工具结果渲染成可操作卡，点击驱动导航/动作 |
| 指令栏「问 Agent 或下达任务」 | 常驻对话面入口（`useChat` → `/api/agent` 流式 loop，F004） |

**工具二分（F004）**：`internal`（搜索/评估/匹配/起草 = Agent 可直接跑）vs `outbound`（发信/报价/放款/分发 key/对外分享 = **不得由 Agent 直接执行**，只产确认卡）。

---

## 8. 数据层契约（mock → Prisma + fieldProvenance）

原型 mock 数据（`LIBRARY/GAMEKB/CREATORS/PORTFOLIO/RUNLOG/COLLAB` 等）→ 真实数据模型：

| 原型 mock | 真实来源 | 字段契约 |
|---|---|---|
| 创作者详情抽屉（受众/表现/合作史/商务/合规/样本） | `Kol` 模型 + 采集 | **F001 预留位**：`audienceDemo`（受众画像）/`credibility`（可信度）/`brandSafety`（品牌安全）/`dataSource`+`fieldProvenance`（来源与溯源）/`embedding vector(1024)` |
| 创作者匹配% | `search_kols` cosine + 受众匹配 | `embedding` + `audienceDemo` |
| 游戏知识（素材→AI 解析→卖点/受众/合规） | 素材上传 → 策略 Agent 解析 | 新建 `Game`/`GameKnowledge`/`Material` 模型 + 解析产物带 provenance |
| 每个数据点的"来源"徽标 | `fieldProvenance`（该字段来自平台 API / Apify / 用户上传 / AI 估算） | 落地时 UI 的 `ProvenanceTag` 直读此字段 |
| Agent 记录（谁/何时/做了什么） | 操作日志表（F008 留痕） | 不可逆动作 append-only |

> 数据源接入（Apify 采集管道）是下游，本 UI 批可先 mock；字段契约位已 nullable 预留，UI 直接按契约渲染（缺值显"待接入"）。

---

## 9. AI→人闸门落地（D26-D29 / F008）

原型里每个"对外·不可撤销"确认，落地为**一个 outbound 工具 + 服务端拦截**：

| 原型闸门（弹确认卡） | outbound 工具 | 服务端强制 |
|---|---|---|
| 发送邀约 | `send_outreach` | 未经人确认调用 → **403 / pending**（F008 acceptance） |
| 确认报价 | `commit_quote` | 同上；卡列金额/交付/授权范围 |
| 放款 | `payout` | 同上；卡列收款方/金额/依据；消费交付+托管证据 |
| 分发 Key | `distribute_keys` | 同上 |
| 生成对外分享报告 | `create_share_link` | 同上；卡列数据范围/有效期 |

规则（务必守）：
- **每张确认卡如实列全部利害**（收件人全名单 / 金额 / 「对外·不可撤销」）—— 不是阈值分级，是不撒谎（D28）。
- **内部动作不弹框**（批准组合/采纳复盘/选组合）—— 假闸门稀释真闸门（D27）。
- 不可逆动作**操作日志留痕**（Agent 记录页读它）。

---

## 10. 验收标准（落地每页）

1. `next build` + `tsc --noEmit` + `next lint` 全绿。
2. **Playwright visual baseline**：每个页面截图入 `tests/screenshots/baseline/`（浅色 + 深色各一，≥1440px），对齐 DS-FOUNDATION 的 `test:visual` 流程。
3. **交互 E2E**：把原型 smoke 的意图转成 Playwright —— 今天雷达进项目、五环节切换、触达发送弹闸门、放款弹闸门、批准组合不弹、创作者详情抽屉、素材上传解析、记录筛选。
4. **闸门服务端测试**：outbound 工具直调 API 未确认 → 断言 403/pending（F008）。
5. **多 Agent**：进不同环节 copilot 切对应专家 Agent；协同可展开；编队花名册正确。
6. **保留审计对齐**：卡片阴影 .08、标题 navy-700、按钮扁平、进度条 rounded-full 等（用 Horizon 组件/class 自然满足）。

---

## 11. 落地顺序建议（分阶段，可挂 features.json）

| 阶段 | 内容 | 依赖 |
|---|---|---|
| **A. 外壳与路由** | 更新 `routes.tsx` 为 6 项；建 6 个 page.tsx（占位→真页骨架） | DS-FOUNDATION 已就位 |
| **B. 静态页（mock + 真组件）** | 今天/项目/项目详情五环节/创作者库/游戏知识/洞察/记录，全用 §4 真组件 + mock 数据；新建 §6 组件 | A |
| **C. 数据层** | Prisma + Kol 字段契约（F001）+ seed（F003）；页面从 mock 切真数据 | AGENT-FOUNDATION F001/F003 |
| **D. Agent 运行时 + 常驻对话面** | `/api/agent` 流式 loop（F004）+ 工具注册表 internal/outbound + CopilotPanel `useChat` + generative canvas（F005） | C |
| **E. 闸门** | outbound 工具服务端强制 + 确认卡 + 操作日志（F008） | D |

> 建议 B 阶段（真组件 + mock）作为**第一个 UI 落地批次**，最快让"真实 Horizon 应用"跑起来；C/D/E 复用 AGENT-FOUNDATION 已规划的 features。

---

## 附：快速对照速查（最常用 10 个）

```
.card              → <Card extra="…">                       components/card
.kpi               → <MiniStatistics name value icon iconBg> components/card/MiniStatistics
.btn               → className: rounded-xl bg-brand-500 …    （无组件，class 约定）
areaChart()        → <LineAreaChart chartData chartOptions>  components/charts/LineAreaChart
barChart()         → <BarChart chartData chartOptions>       components/charts/BarChart
donut()            → <PieChart>（donut options）             components/charts/PieChart
ring()             → <CircularProgress title percentage>     components/charts/CircularProgress
.track             → <Progress value color width>            components/progress
table.tbl          → @tanstack/react-table（抄 ComplexTable）
gate 弹窗/抽屉      → Chakra Modal/Drawer + useDisclosure     @chakra-ui/modal + @chakra-ui/hooks
```
