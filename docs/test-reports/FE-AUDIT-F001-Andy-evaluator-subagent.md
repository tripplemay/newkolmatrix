# FE-AUDIT F001 — 模板组件对照审计（手写重复实现清单）

| 项 | 值 |
|---|---|
| Feature | F001（`executor: evaluator`） |
| 批次 / 阶段 | FE-AUDIT / verifying（首轮） |
| 署名 | Andy/evaluator-subagent（隔离上下文） |
| 日期 | 2026-07-20 |
| 审计对象 | main HEAD `bab9c10` |
| 对照基线 | Horizon UI Pro 3.0.0 原件（只读） |
| 结论 | **PASS**（审计执行完成，acceptance 六条全达成） |
| 产出 finding | **5 条**（P0×1 / P1×3 / P2×1）；白名单项已剔除 |

> 本报告只做审计，未修改任何产品代码。新增产物仅 `scripts/test/fe-audit-component-matrix.mjs` + 本报告。

---

## 0. 审计对象前提的独立复核

spec §2 / D3 声称「`src/` 自 `6ec384d` 后无产品变更，HEAD 前端代码与线上一致」。**未采信转述，实测复核：**

```bash
$ git log --oneline 6ec384d..HEAD -- src/ | wc -l
0
$ git status --short src/
（空）
$ git rev-parse --short HEAD
bab9c10
```

→ 前提成立，审计对象 = 线上版本。✅

---

## 1. 方法与可复核性

判定口径三层，全部机械化（避免"看起来像"的主观判断）：

1. **路径存在性** — 模板 `src/components/<p>` vs 项目 `src/components/<p>` 同路径比对
2. **内容同一性** — 逐字节 diff（相同 → used-as-is 候选；不同 → forked-modified）
3. **活性（关键）** — 从 `src/app/**` 出发做 **import 图传递可达性分析**

第 3 层是本次审计最重要的方法学选择。**只统计"有没有被 import"会系统性误判**——被死组件 import 的组件仍然是死的。实测差异显著：

| 判定方式 | "在用"组件数 |
|---|---|
| 朴素 grep（有人 import 即算在用） | 19 |
| 传递可达性（从 `src/app/**` 出发） | **12** |

差值 7 个是被死代码引用的"伪存活"。举证 —— `charts/LineChart.tsx` 的全部 3 个引用方本身都不可达：

```bash
$ grep -rn "charts/LineChart" src/ --include='*.tsx'
src/components/sidebar/componentsrtl/SidebarCard.tsx:1   ← 本身 dead
src/components/sidebar/components/SidebarCard.tsx:1       ← 本身 dead（见 §3 佐证）
src/components/rtl/dashboard/TotalSpent.tsx:11            ← 本身 dead
```

**复跑方式：**

```bash
node scripts/test/fe-audit-component-matrix.mjs [模板根路径]
# 默认模板根 = ~/project/db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/horizon-tailwind-react-nextjs-pro-main
# 退出码恒 0（审计工具，非门禁）
```

脚本已入库 `scripts/test/fe-audit-component-matrix.mjs`，本报告全部矩阵数字由它产出，可独立重跑核对。

---

## 2. 模板组件 × 项目使用状态矩阵（acceptance 第 1 条）

覆盖模板 `src/components/` **全目录 215 个 tsx**（含 `admin/` 124 个）。

| 分类 | 数量 | 占模板 | 说明 |
|---|---:|---:|---|
| **used-as-is**（可达 + 逐字节相同） | **10** | 4.7% | 真正在跑且零改动 |
| **forked-modified**（可达 + 有改动） | **2** | 0.9% | navbar/index、sidebar/index |
| **re-implemented**（模板已提供却手写重复） | **1 个组件 / 7 处** | — | `card/index` — 见 §4，需人工判定故不计入路径分类 |
| **unused — dead-in-repo**（已入库但不可达） | **78** | 36.3% | 其中 13 为 D6.4 白名单 RTL → **实际 65** |
| **unused — never-ported**（模板有、项目从未引入） | **124** | 57.7% | 全部为 `admin/`，见 §5 |
| **removed**（白名单 D6.1） | **1** | 0.5% | `map/MapComponent.tsx` |

**对账：** 10 + 2 + 78 + 124 + 1 = **215** ✅（模板侧闭合）
项目侧：10 + 2 + 78 + 9（自建）= **99** ✅（与 `find src/components -name '*.tsx'` 一致）

### used-as-is（10）

`card/index.tsx`、`dropdown/index.tsx`、`footer/Footer.tsx`、`icons/DashIcon.tsx`、`link/NavLink.tsx`、`navbar/Configurator.tsx`、`navbar/ConfiguratorRadio.tsx`、`radio/index.tsx`、`scrollbar/Scrollbar.tsx`、`sidebar/components/Links.tsx`

### self-built（9，不在模板中）

`common/Button.tsx`、`common/ComingSoon.tsx`、`copilot/CopilotPanel.tsx`、`copilot/ExpertScope.tsx`、`copilot/HandoffCollab.tsx`、`copilot/canvas/KolResultCards.tsx`、`copilot/canvas/canvas-registry.tsx`、`project/ProjectDetail.tsx`、`project/StagePanel.tsx`

> 已核实模板**不存在**通用 Button 组件（`find -iname '*button*'` 仅命中 demo 用 `actions/ActionButtons.tsx`）。故 `common/Button.tsx` 是**新增抽象而非重复实现**，不计 finding。

---

## 3. forked-modified 偏离说明（acceptance 第 3 条）

两个 fork 的 diff 全文已逐行核对，**全部为品牌替换 + 已记录的 DS-FOUNDATION 决策，无一处未说明的偏离**。

### 3.1 `navbar/index.tsx`（84 行 diff）

| 偏离 | 行 | 性质 | 判定 |
|---|---|---|---|
| 移除 Horizon PRO 推广 Dropdown（含 `horizon-ui.com` 外链 / "Buy Horizon UI PRO"） | 133-174（模板侧） | 去品牌化，代码注明 `DS-FOUNDATION F003` | 合理 ✅ |
| 深色切换由内联 `document.body.classList` → `useColorMode` hook | 25-27 → 20-22 | 逻辑收敛，注明 `DS-FOUNDATION F005` | **改善** ✅ |
| 移除模板遗留的**空 toggle div**（无内容幽灵控件） | 183-194（模板侧） | 注明 F005 | **改善**（修模板缺陷） ✅ |
| 文案：`New Update: Horizon UI Dashboard PRO` → `Welcome to KOLMatrix` | 110/124 | 品牌替换 | 合理 ✅ |
| `alt="Elon Musk"` → `alt="User avatar"`；`👋 Hey, Adela` → `👋 Hey there` | 203/212 | 去 demo 数据 | 合理 ✅ |

### 3.2 `sidebar/index.tsx`（16 行 diff）

| 偏离 | 行 | 性质 | 判定 |
|---|---|---|---|
| 移除 `SidebarCard` 升级推广卡 import 与渲染 | 6 / 92-97 | 去品牌化，注明 `DS-FOUNDATION F003` | 合理 ✅ |
| `Horizon PRO` → `KOLMatrix`；徽标 `H` → `K` | 72 / 83 | 品牌替换 | 合理 ✅ |
| `Adela Parkson / Product Designer` → `KOLMatrix / Marketing workspace` | 117/120 | 去 demo 数据，注明"接入认证批次后动态化" | 合理 ✅ |

**内部一致性交叉验证：** §2 矩阵中 `sidebar/components/SidebarCard.tsx` 被判 dead —— 恰好是 3.2 移除 import 的下游后果。两条独立证据链自洽，反证可达性分析未误报。✅

**附带正面发现：** `tailwind.config.js` 与模板**逐字节相同**（`diff` 退出码 0）。设计系统底座未被私自改动。（token 层详查归 F003）

---

## 4. 「模板已提供但手写重复实现」清单（acceptance 第 2 条）

### F001-03 · `Card` 组件存在却在 7 处手写卡片表面 【P1】

模板 `card/index.tsx` 提供统一卡片容器，项目**已在 5 处正确使用**：

```bash
$ grep -rn "from 'components/card'" src/app src/components/{copilot,project,common} --include='*.tsx'
src/app/admin/today/page.tsx:7        src/app/admin/campaigns/page.tsx:5
src/components/project/ProjectDetail.tsx:11   src/components/project/StagePanel.tsx:9
src/components/common/ComingSoon.tsx:3
```

但另有 7 处手写等价表面。模板 Card 基线：`rounded-[20px] bg-white shadow-3xl shadow-shadow-100 dark:!bg-navy-800`。

| # | 位置 文件:行 | 手写 class 摘要 | 与 Card 的偏离 | 置信度 |
|---|---|---|---|---|
| 1 | `src/app/admin/today/page.tsx:25` | `rounded-2xl border border-gray-100 bg-white px-4 py-3 … dark:bg-navy-700` | 圆角 16px≠20px；border 替代 shadow；dark 底 navy-700≠navy-800 | **高** |
| 2 | `src/components/copilot/canvas/KolResultCards.tsx:38` | `rounded-2xl border border-gray-200 bg-white p-3 shadow-sm … dark:bg-navy-700` | 同上 + shadow-sm≠shadow-3xl | **高** |
| 3 | `src/app/preview/agent-canvas/page.tsx:20` | `rounded-2xl bg-white p-3 shadow-sm` | 同上，且**完全无 `dark:`** | **高** |
| 4 | `src/components/copilot/HandoffCollab.tsx:83` | `rounded-2xl bg-white p-3 shadow-sm dark:bg-navy-700` | 同上 | 中 |
| 5 | `src/components/copilot/ExpertScope.tsx:14` | `rounded-2xl border-l-4 border-brand-500 bg-white px-3 py-2.5 shadow-sm dark:bg-navy-700` | 同上（左侧强调边为有意设计） | 中 |
| 6 | `src/components/copilot/HandoffCollab.tsx:29` | `rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700` | 手风琴内层行 | 低 |
| 7 | `src/app/preview/agent-canvas/page.tsx:25` | `rounded-xl border border-gray-200 bg-white` | 同 6，且无 `dark:` | 低 |

**替换建议：** #1-#3 直接换 `<Card extra="...">`（收益最高、风险最低）。#4-#5 属面板内嵌套轻表面，套 Card 会带来 20px 圆角 + 重阴影，建议改为 F002 抽取的轻量 `Surface`/`Panel` 而非硬套 Card。#6-#7 是手风琴内层结构，**不建议**改造。

**风险：** #1-#3 替换会改变圆角（16→20px）与阴影观感，`tests/visual/` 的 dashboard/today + agent-canvas 基线截图会失效，需同批更新基线。#3、#7 位于视觉回归基线页，改动务必与 F003 的 `dark:` 补全**合并为一次改动**，避免基线连续失效两轮。

> **置信度说明：** 低置信度项已如实标注而非充数。Card 的语义是"页面级卡片容器"，把嵌套小表面一律判为违规会制造伪债——此处不做该扩大解释（遵 D7）。

### F001-04 · 项目自有 `Button` 组件被 3 处活代码绕过 【P1】

`common/Button.tsx`（106 行，5 variant × 3 size + loading + 图标位 + `focus-visible` 无障碍环）只有 **1 个引用方**：

```bash
$ grep -rn "common/Button" src/ --include='*.tsx'
src/components/common/ComingSoon.tsx:4      ← 唯一引用
```

而 3 处**活代码**手写原生 `<button>`：

| 位置 | 用途 | 手写 class |
|---|---|---|
| `src/components/copilot/CopilotPanel.tsx:181` | 发送按钮 | `grid h-8 w-8 … rounded-full bg-brand-500 text-white transition disabled:opacity-40` |
| `src/components/copilot/HandoffCollab.tsx:30` | 手风琴展开触发 | `flex w-full items-center justify-between gap-2 px-3 py-2 text-left` |
| `src/components/project/ProjectDetail.tsx:67` | 五环节 tab | `-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition …` |

**判定：** 这不是"模板重复实现"（模板本无 Button），而是**项目自建抽象的采纳率失败** —— 投入 106 行建的组件，覆盖率 1/4。三处中 CopilotPanel:181 是真正应当收敛的（图标按钮 + disabled 态，Button 已支持）；HandoffCollab:30 与 ProjectDetail:67 是**语义不同的控件**（手风琴触发器 / tab），不应硬塞进 Button，正确解法是 F002 抽取 `Tabs` 与 `Accordion`。

**风险：** 低。CopilotPanel:181 换用 `Button` 需补 `variant` 支持纯图标圆形按钮（当前 5 个 variant 均为方角 `rounded-xl`），属小幅扩展而非重写。

### F001-05 · 预览页手工复刻 `HandoffCollab` 与消息气泡标记 【P2】

`src/app/preview/agent-canvas/page.tsx:16-43` 的 `StaticHandoffCard` 是 `HandoffCollab.tsx:26-95` 的手工复刻；`page.tsx:62,67` 的气泡复刻 `CopilotPanel.tsx:77,78`。

**对照证据（气泡 class 串逐字符相同）：**
```
CopilotPanel.tsx:148   max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-navy-700 shadow-sm dark:bg-navy-700 dark:text-white
agent-canvas:67        max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-navy-700 shadow-sm
                                                                                                                            ^^^ 无 dark:
```

**定性从轻的理由（不夸大）：** 该文件 1-6 行明确写了设计意图——"确定性视觉基线，不接活 LLM/DB，独立路由保证像素确定"。用活组件会引入 `fetch('/api/handoffs')` 与 `useChat`，破坏截图确定性。**复刻是有正当理由的工程取舍，不是疏忽。**

**但真实风险仍存在：** 活组件改版时预览页不会同步，视觉回归基线会**保护一个已经不存在的形态**，属于静默失效。建议 F002 把气泡与交接卡抽成**纯展示组件**（props in / 无副作用），活组件与预览页共用同一展示层，副作用留在容器层 —— 一次抽取同时消灭复刻与 `dark:` 缺失。

---

## 5. `admin/` 重点区结论：**风险未兑现，但决策窗口正在关闭**

feature description 将模板 `admin/`（页面级组件主仓）列为对照重点。实测结论与预期相反：

```bash
$ ls src/components/admin      # 不存在
$ find TPL/src/components/admin -name '*.tsx' | wc -l
124
```

**项目未 port 任何一个，也未 re-implement 任何一个。** 根因是当前 15 个页面几乎都还是壳：

| 页面形态 | 数量 | 例 |
|---|---:|---|
| `redirect()` 重定向 | 7 | `admin/page.tsx`、`dashboards/default`、`discovery`、`database`、`outreach`… |
| `<ComingSoon />` 占位 | 4 | `creators`、`insight`、`knowledge`、`runs` |
| 真实内容 | 4 | `today`(58行)、`campaigns`(35行)、`campaigns/[id]`(14行)、`preview/agent-canvas`(81行) |

全部 app 代码合计 **1159 行**。**尚未开始画真页面，所以还没有机会产生重复实现。**

**这正是 F001 最关键的结论：当前不存在 `admin/` 重复实现债，但 M0.5 六页工作台要造的东西（数据表格、stat 卡、步骤器、分页表）模板 `admin/` 已经提供了现成实现** ——

| M0.5 预期需要 | 模板现成件 |
|---|---|
| 数据表格（排序/勾选/分页） | `main/applications/data-tables/{CheckTable,ColumnsTable,ComplexTable,DevelopmentTable}.tsx` |
| 统计卡 | `card/MiniStatistics.tsx`、`main/account/application/MiniStatistics.tsx` |
| 多步流程 | `main/users/new-user/{Stepper,StepperControl}.tsx` + `contexts/StepperContext.tsx` |
| 搜索型表格 | `main/ecommerce/order-list/SearchTableOrders.tsx`、`main/users/users-overview/SearchTableUsersOverivew.tsx` |
| 图表 | `charts/{BarChart,LineChart,PieChart,LineAreaChart}.tsx`（已在库，dead） |

若 M0.5 开工前不决策"port 还是自写"，六个页面会各自手写一遍表格与统计卡 —— **届时的整改成本是现在的数倍**。故列 P0（决策门槛，非既有缺陷）。

---

## 6. 78 个 dead-in-repo 组件的处置建议（**不建议直接删**）

| 子类 | 数量 | 建议 |
|---|---:|---|
| D6.4 白名单 RTL 相关 | 13 | 标 `unused` 即可，**不计债**（spec D6.4）。清单：`navbar/RTL`、`sidebar/RTL`、`sidebar/componentsrtl/*2`、`rtl/dashboard/*8`、`rtlProvider/RtlProvider` |
| 认证批次储备 | 6 | **保留**。`auth/variants/*3`、`footer/FooterAuth*2`、`navbar/NavbarAuth` —— 认证批次直接可用 |
| M0.5 采纳候选 | ~25 | **保留并登记**。`charts/*6`、`fields/*4`、`card/{MiniStatistics,CardMenu}`、`checkbox`、`switch`、`progress`、`tooltip`、`popover`、`dataDisplay/*` 等 |
| demo 专用（NFT/课程/信用卡等） | ~34 | 与业务无关，可在 FE-REFACTOR 批次评估删除：`card/{NftCard,Course,Mastercard}`、`icons/{EtherLogoOutline,MasterCardIcon,visaIcon}`、`actions/*4`、`dataDisplay/{Transaction,Transfer}` 等 |

> **反对"清理死代码"的直觉式建议：** 这 78 个不是历史遗留垃圾，而是**付费模板的库存**。M0.5 恰恰要消费其中一部分。此刻删除等于把已付费资产扔掉，然后手写一遍 —— 那才是真的债。正确动作是**分类登记**，不是清理。

---

## 7. Finding 汇总（供 F004 汇总与分级）

| ID | 标题 | 建议级别 | 证据锚点 |
|---|---|---|---|
| **F001-01** | M0.5 开工前须决策模板 `admin/` 124 组件的 port/自写策略，否则六页各自手写表格与 stat 卡 | **P0**（决策门槛，非既有缺陷） | §5 |
| **F001-02** | 78 个 dead-in-repo 组件未分类登记（扣除 13 个白名单 RTL → 65），复用决策无依据 | **P1** | §6，脚本可复跑 |
| **F001-03** | `Card` 已提供却在 7 处手写卡片表面（3 处高置信） | **P1** | §4 表格，逐条 文件:行 |
| **F001-04** | 自有 `Button` 采纳率 1/4，3 处活代码绕过（其中仅 1 处应收敛，2 处应另抽 Tabs/Accordion） | **P1** | §4，grep 输出 |
| **F001-05** | 预览页手工复刻 `HandoffCollab` + 气泡标记，视觉基线有静默失效风险（有正当理由，从轻） | **P2** | §4，class 串比对 |

**明确不计 finding 的项（避免 F004 重复计债）：**
- `map/MapComponent.tsx` 已删 —— D6.1 白名单
- 13 个 RTL 相关 dead —— D6.4 白名单
- 默认浅色 / Chakra 零散原语 —— D6.3 / D6.2 白名单
- `common/Button.tsx` 本身 —— 模板无对应物，属新增抽象非重复实现
- navbar/sidebar 两处 fork —— 偏离全部有记录且合理，其中 2 处实为对模板缺陷的修正
- `tailwind.config.js` —— 与模板逐字节相同，**正面项**

---

## 8. Acceptance 逐条自查

| # | Acceptance 条款 | 结论 | 证据 |
|---|---|---|---|
| 1 | 产出模板组件×项目使用状态矩阵（四类，覆盖模板 `src/components/` 全目录） | ✅ 达成 | §2，215 个 tsx 全覆盖，四类 + removed/self-built 共 6 桶，双向对账闭合（215 / 99） |
| 2 | 每个「模板已提供但手写重复实现」项给出 文件:行 + 模板对应组件路径 + 替换建议与风险 | ✅ 达成 | §4，7 处逐条 文件:行 + 对应 `card/index.tsx` + 替换建议 + 视觉基线失效风险 |
| 3 | forked 组件附相对模板原件的偏离说明（diff 摘要） | ✅ 达成 | §3，2 个 fork 全部 diff 逐行归因，无未说明偏离 |
| 4 | 所有结论附可复核证据（diff/grep） | ✅ 达成 | 全文附命令与输出摘录；矩阵由入库脚本产出可重跑 |
| 5 | 白名单（spec §4 D6）项不计 finding | ✅ 达成 | §7 明列 4 类白名单剔除项及理由 |
| 6 | 报告落 `docs/test-reports/FE-AUDIT-F001-Andy-evaluator-subagent.md` | ✅ 达成 | 本文件 |

**F001 判定：PASS**

---

## 9. 给 F004 汇总层的交叉核对提示

以下三点存在跨 feature 重叠，请 F004 去重，勿重复计债：

1. **F001-03 / F001-04 与 F002（抽取完备性）重叠** —— 手写卡片表面与绕过 Button，既是"重复实现"也是"该抽未抽"。建议以 F002 的抽取清单为准，F001 侧只保留"模板已有 Card"这一事实依据。
2. **`dark:` 缺失** —— §4 表格中 #3、#7 及气泡复刻处均无 `dark:` 变体（`preview/agent-canvas/page.tsx:20,25,62,67`）。这是 F003 的扫描域，此处仅作为重复实现的**副证**，计债请归 F003。
3. **视觉回归基线联动** —— F001-03 的替换与 F003 的 `dark:` 补全都会使 `tests/visual/` 基线失效，整改批次应合并为一次改动，避免基线连续两轮失效。

---

*本报告由隔离上下文 Evaluator subagent 独立产出，未参考实现过程叙述，全部结论基于 main HEAD `bab9c10` 实测与模板原件比对。*
