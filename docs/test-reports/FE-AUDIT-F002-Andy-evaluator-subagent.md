# FE-AUDIT F002 — 公共组件抽取完备性审计

- **批次：** FE-AUDIT（Evaluator-only）
- **Feature：** F002 公共组件抽取完备性审计
- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **审计对象：** main HEAD `bab9c10`（`src/` 最后一次产品变更 `6ec384d`，与线上一致）
- **日期：** 2026-07-20
- **结论：** **PASS**（审计任务本身完成；审计**发现**的债务分级见 §5，由 F004 汇总、Planner 并入 backlog）
- **复跑脚本：** `scripts/test/fe-audit-dup-scan.sh`

> 本报告不修改任何产品代码。所有结论附 `文件:行` 级证据，可逐条复核。

---

## 1. 审计范围与口径

### 1.1 扫描范围（自建面）

F002 spec 界定为「15 个页面 + 自建组件（copilot / project / canvas 等）」。实际入扫 27 个 tsx：

| 分区 | 路径 | 文件数 |
|---|---|---|
| 页面 | `src/app/**/page.tsx` | 15 |
| 布局 | `src/app/layout.tsx` / `admin/layout.tsx` / `AppWrappers.tsx` | 3 |
| 自建组件 | `src/components/common/` `copilot/` `copilot/canvas/` `project/` | 9 |

**明确排除（归 F001 模板对照审计）：** `card/` `navbar/` `sidebar/` `rtl/` `fields/` `dataDisplay/` `icons/` 等模板继承目录。本报告不对模板组件的重复性下结论，避免与 F001 双重计数。

### 1.2 关键范围事实（影响结论解读，须先说明）

15 个页面中**只有 4 个含真实 UI**，其余 11 个是 redirect（6 个）或 `ComingSoon` 占位（5 个）：

| 类型 | 页面 | 证据 |
|---|---|---|
| 真实 UI | `today` / `campaigns` / `campaigns/[id]` / `preview/agent-canvas` | 58 / 35 / 14 / 81 行 |
| redirect | `admin/page.tsx` `dashboards` `dashboards/default` `database` `discovery` `outreach` | 各 2-3 行 |
| ComingSoon 占位 | `creators` `insight` `knowledge` `runs` | 各 5 行 |

**因此：** 自建 UI 面总量约 760 行，重复模式的**绝对数量必然偏小**。本报告的价值不在「找到多少存量债」，而在**为 M0.5 六页工作台开工前锁定复用地基**——现在抽取成本极低（4 个页面），M0.5 后成本将成倍上升。这一判断贯穿 §5 优先级。

### 1.3 阈值纪律

spec 要求「出现 **≥2 次**」的模式才计 finding。本报告严格执行：
- **≥2 次** → 计入 §3 findings（8 条）
- **=1 次** → **不计 finding**，仅在 §4 列为 M0.5 前瞻项（3 条）
- **=0 次** → 在 §4.2 说明「acceptance 点名但自建面内不存在」（表格 / 分页 / stat 卡）

不为凑数把单次出现的模式包装成重复。

---

## 2. 复跑方法

```bash
bash scripts/test/fe-audit-dup-scan.sh        # 全量 10 组指纹
bash scripts/test/fe-audit-dup-scan.sh P2     # 单组
```

指纹取**结构性 class 组合**而非全串精确匹配（允许 padding / 字号微调仍判为同一模式），输出为 `文件:行:内容`，可直接跳转复核。

---

## 3. Findings：出现 ≥2 次的重复 UI 模式（8 条 / 30 处）

### D1 — 交接卡整卡克隆（`HandoffCard`）｜2 处｜**最严重**

`/preview/agent-canvas` 页内 `StaticHandoffCard` 是 `HandoffCollab` 呈现层的**逐行手抄副本**。

| 副本 | 位置 |
|---|---|
| 生产组件 | `src/components/copilot/HandoffCollab.tsx:26-59`（`HandoffItem`）+ `:83-93`（外层容器） |
| 克隆体 | `src/app/preview/agent-canvas/page.tsx:16-43`（`StaticHandoffCard`） |

**同一性证据（字面量逐条重合）：**

```
协同交接 · 多 Agent 联动 · 点开看交接
  preview/agent-canvas/page.tsx:23   HandoffCollab.tsx:86
交接物：{...}（{...}）
  preview/agent-canvas/page.tsx:37   HandoffCollab.tsx:54
<span className="text-gray-400">→</span>
  preview/agent-canvas/page.tsx:29   HandoffCollab.tsx:37
<MdBolt size={13} className="text-brand-500" />
  preview/agent-canvas/page.tsx:36   HandoffCollab.tsx:53
```

**克隆体已发生漂移（`dark:` 变体全量丢失）：**

| 结构 | 生产组件 | 克隆体 |
|---|---|---|
| 外层卡 | `HandoffCollab:83` `...shadow-sm dark:bg-navy-700` | `page:20` `...shadow-sm`（无 dark） |
| 交接行框 | `HandoffCollab:29` `...bg-white dark:border-white/10 dark:bg-navy-700` | `page:25` `...bg-white`（无 dark） |
| 展开区分隔线 | `HandoffCollab:48` `...py-2 dark:border-white/5` | `page:33` `...py-2`（无 dark） |

全页 `dark:` 计数：`preview/agent-canvas/page.tsx` = **0**，`HandoffCollab.tsx` = **5**，`CopilotPanel.tsx` = **10**。

> **公允说明：** 丢失 `dark:` 对当前**浅色**基线截图无实际影响（dark 变体在浅色下本就不生效），不构成视觉缺陷。此处的意义是**证明两份副本已经开始各自演化**——而非指控其渲染错误。

**衍生影响（本条真正的严重性所在，超出 DRY 范畴）：**

视觉回归基线截的是**克隆体**，不是生产组件：

```
tests/visual/agent-canvas.spec.ts:7   await page.goto('/preview/agent-canvas', ...)
tests/visual/agent-canvas.spec.ts:11  await expect(page).toHaveScreenshot('agent-canvas.png', ...)
```

即：`HandoffCollab` 的视觉改动**不会**触发任何测试失败——视觉回归网在这块存在盲区。

**根因（值得单独记录）：** 该页对另两个组件是**直接 import 真实组件 + 夹具 props**，而非克隆：

```
preview/agent-canvas/page.tsx:11  import ExpertScope from 'components/copilot/ExpertScope';
preview/agent-canvas/page.tsx:12  import KolResultCards from 'components/copilot/canvas/KolResultCards';
```

`ExpertScope` / `KolResultCards` 是纯 props 组件，**可以**直接复用，因此被正确复用、且确实受视觉回归保护。`HandoffCollab` 之所以被迫克隆，是因为它把**取数与呈现耦合在同一组件内**：

```
HandoffCollab.tsx:66-78   useEffect(() => { fetch('/api/handoffs') ... })
```

自取数 → 不确定 → 无法用于确定性截图 → 只能手抄一份静态副本。**这是架构问题，不是笔误。** 修复方向必然是「容器/呈现分离」，见 §5 R1。

---

### D2 — 对话气泡（`ChatBubble`）｜6 处

| 位置 | 角色 |
|---|---|
| `src/components/copilot/CopilotPanel.tsx:77` | user 气泡（渐变右） |
| `src/components/copilot/CopilotPanel.tsx:78` | agent 气泡（浅色左） |
| `src/components/copilot/CopilotPanel.tsx:148` | 开场白气泡（复制 agent 变体） |
| `src/components/copilot/CopilotPanel.tsx:161` | 「正在思考…」气泡（复制 agent 变体） |
| `src/app/preview/agent-canvas/page.tsx:62` | user 气泡克隆 |
| `src/app/preview/agent-canvas/page.tsx:67` | agent 气泡克隆 |

class 串在同一文件内已重复三次（`:78` `:148` `:161` 共享 `max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-[13px] ... shadow-sm dark:bg-navy-700`），跨文件再复制两次。与 D1 同源：气泡逻辑内嵌在 `MessageParts` 中，无法被预览页复用，只能手抄。

---

### D3 — brand 药丸徽标（`Badge`）｜6 处

**soft 变体（4 处，前 3 处 class 串逐字节相同）：**

```
src/app/admin/today/page.tsx:29        rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-400/10
src/components/copilot/ExpertScope.tsx:18   （同上，逐字节相同）
src/components/project/StagePanel.tsx:24    （同上，逐字节相同）
src/app/admin/campaigns/page.tsx:21    rounded-md bg-brand-50 px-2   py-0.5 text-[11px] font-semibold text-brand-600 dark:bg-brand-400/10   ← 尺寸微漂移
```

**solid / pill 变体（2 处）：**

```
src/components/project/StagePanel.tsx:18            rounded-lg  bg-brand-500 px-2.5 py-1 text-xs font-bold text-white
src/components/copilot/canvas/KolResultCards.tsx:50 rounded-full bg-brand-50 px-2  py-1 text-xs font-bold text-brand-600 dark:bg-brand-400/10
```

`campaigns:21` 相对另外三处的 `px` / `text-[]` 偏移，是典型的「复制后就地微调」漂移起点。**这是全部 8 条中改造成本最低、复用面最广的一条。**

---

### D4 — 页面头（`PageHeader`）｜4 处

```
src/app/admin/today/page.tsx:44-45          <h1 mb-1 text-2xl font-bold text-navy-700 dark:text-white> + <p mb-4 text-sm text-gray-500>
src/app/admin/campaigns/page.tsx:12-15      同构（h1 + 副标题 p）
src/components/project/ProjectDetail.tsx:47-54  同构（h1 + 副标题 p，居于 Card 内）
src/components/common/ComingSoon.tsx:22-27  同构（h1 + 描述 p，居中变体）
```

四处均为「H1 标题 + 灰色副标题」组合，`text-2xl font-bold text-navy-700 dark:text-white` 完全一致，差异仅在外边距与对齐。M0.5 六页工作台每页都需要页面头 → 复用面将从 4 扩到 10+。

---

### D5 — 标签-值定义行（`DefinitionRow`）｜4 处

```
src/components/copilot/ExpertScope.tsx:22-25   「职责」      + p.duty
src/components/copilot/ExpertScope.tsx:26-29   「隔离」      + p.isolation
src/components/project/StagePanel.tsx:29-32    「本环节专家职责」+ persona.duty
src/components/project/StagePanel.tsx:33-36    「边界」      + persona.isolation
```

四处共享 `<span className="shrink-0 font-semibold text-gray-400">{label}</span>` + 值 span 的两列结构。

**注意这不止是视觉重复，是语义重复：** 两个组件渲染的是**同一份 persona 数据的同两个字段**（`duty` / `isolation`），只是标签文案不同（「职责」vs「本环节专家职责」、「隔离」vs「边界」）。同一概念在 UI 上有两套叫法，属于文案一致性隐患，建议抽取时一并统一术语。

---

### D6 — 卡片区块小标题（`SectionLabel`）｜3 处

```
src/app/admin/today/page.tsx:47              mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-500   + <MdBolt/>「需要你确认」
src/components/copilot/HandoffCollab.tsx:84  mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500  + <MdGroups/>「协同交接…」
src/app/preview/agent-canvas/page.tsx:21     mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500  + <MdGroups/>（D1 克隆带入）
```

「图标 + 小标题」的卡内区块头，差异仅 `text-xs` / `text-sm`。

---

### D7 — 可点卡片 hover 态（`ClickableCard`）｜3 处

```
src/app/admin/today/page.tsx:25                    transition hover:border-brand-200 hover:shadow-md
src/app/admin/campaigns/page.tsx:19                transition hover:shadow-xl        （经 Card extra 传入）
src/components/copilot/canvas/KolResultCards.tsx:38 transition hover:shadow-md
```

三处「可点击卡片」的悬停反馈各不相同（`shadow-md` / `shadow-xl` / `border+shadow-md`）——**已经是三套不一致的交互反馈**，而非单纯重复。建议抽取时统一为一种悬停语言。

---

### D8 — 面板头（`PanelHeader`）｜2 处

```
src/components/copilot/CopilotPanel.tsx:211-218   「Copilot · 多 Agent 编队」+「进不同环节自动切换对应专家」
src/app/preview/agent-canvas/page.tsx:49-54       「Copilot · 多 Agent 编队」+「hello-agent 端到端产物：…」
```

主标题字面量完全相同（`text-sm font-bold text-navy-700` + `text-[11px] text-gray-400` 副标题）。同为 D1 克隆行为的连带产物。

---

## 4. 未达 ≥2 阈值（**不计 finding**，仅列为 M0.5 前瞻）

### 4.1 出现 1 次的模式（3 条）

| 模式 | 唯一出现位置 | 前瞻判断 |
|---|---|---|
| 页内 Tab（`StageTabs`） | `src/components/project/ProjectDetail.tsx:71`（全仓唯一 `border-b-2`） | 模板 `src/components/` 内**无** Tabs 原语（`grep TabList\|<Tabs` 零命中），此为项目净新增。M0.5 六页工作台大概率复用 |
| 空态/占位（`EmptyState`） | `src/components/project/StagePanel.tsx:38`（全仓唯一 `border-dashed`） | M1-M4 各环节工作台均需空态 |
| 灰色小标签（`TagChip`） | `src/components/copilot/canvas/KolResultCards.tsx:59` | 创作者库落地后（M0.5/M2）品类标签将大量出现 |

三者当前均只出现一次，**按 spec 阈值不构成重复债**。列出仅为 M0.5 排期参考。

### 4.2 acceptance 点名但自建面内**零出现**（须如实说明）

acceptance 的模式清单点名了「表格」「分页」「stat 卡」。实测自建面内：

```
<table / thead                        → 0 命中
pagination / pageIndex / 分页          → 0 命中
MiniStatistics / Widget（自建面引用）   → 0 命中
```

**这三类模式在自建 UI 面中当前不存在**，故无重复可言，不计 finding。

**但有一条关联事实值得记入：** 模板自带的 stat 卡 `src/components/card/MiniStatistics.tsx` 在全仓**无任何引用**（`grep MiniStatistics src/` 除定义自身外零命中）。M0.5 需要 stat 卡时，应**优先复用该模板组件**，而不是新抽一个 `common/StatCard` —— 否则会制造 F001 意义上的「模板已提供却手写重复实现」新债。同理，表格应优先评估模板 `admin/main/applications/data-tables/` 系列。此项建议与 F001 结论存在交叉，请以 F004 汇总复核为准。

---

## 5. 建议抽取的公共组件清单（8 个）

统一落位 `src/components/common/`（现仅 `Button.tsx` + `ComingSoon.tsx`）。导入别名沿用现有约定 `components/common/X`。

### R1 — `HandoffCard` ＋ 容器/呈现拆分｜对应 D1

> **本条是全部建议中唯一涉及结构调整的，也是杠杆最高的一条。**

```
src/components/common/HandoffCard.tsx        （纯呈现，props-only）
src/components/copilot/HandoffCollab.tsx     （保留为容器：fetch → 传 props）
```

```ts
export interface HandoffCardProps {
  fromName: string;
  toName: string;
  summary: string | null;
  artifactType: string | null;
  artifactRef: string | null;
  defaultOpen?: boolean;      // 预览页固定展开 → 截图确定性
  collapsible?: boolean;      // true=生产可折叠 / false=预览静态
}
```

**收益（不止 DRY）：** 拆分后 `/preview/agent-canvas` 可像 `ExpertScope` / `KolResultCards` 那样 **import 真实呈现组件 + 夹具 props**，视觉回归基线随即从「截一份副本」变成「截真实生产组件」——D1 §衍生影响 中的测试盲区自动消失。这是**用重构换回一层已失效的测试保护**，而非单纯的代码整洁。

### R2 — `ChatBubble`｜对应 D2

```
src/components/common/ChatBubble.tsx
```

```ts
export interface ChatBubbleProps {
  role: 'user' | 'agent';
  children: React.ReactNode;
  muted?: boolean;            // 「正在思考…」态（text-gray-400）
}
```

覆盖 `CopilotPanel:77/78/148/161` 四处 + 预览页 2 处。同样使预览页得以复用真实气泡。

### R3 — `Badge`｜对应 D3

```
src/components/common/Badge.tsx
```

```ts
export interface BadgeProps {
  variant?: 'soft' | 'solid';        // soft=bg-brand-50/text-brand-600（4 处）; solid=bg-brand-500/text-white（1 处）
  size?: 'xs' | 'sm';                // xs=text-[10px] px-1.5（3 处）; sm=text-[11px]/text-xs px-2（2 处）
  shape?: 'rounded' | 'pill';        // pill=rounded-full（KolResultCards:50）
  children: React.ReactNode;
}
```

**最低成本 / 最高复用**：纯 class 收敛，零逻辑，零结构变动，6 处调用点全部是单行替换；同时消除 `campaigns:21` 的既有尺寸漂移。

### R4 — `PageHeader`｜对应 D4

```
src/components/common/PageHeader.tsx
```

```ts
export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;        // 右侧操作区（ProjectDetail:56 的「← 返回项目列表」）
  align?: 'left' | 'center';        // center 覆盖 ComingSoon:22 变体
}
```

### R5 — `DefinitionRow`｜对应 D5

```
src/components/common/DefinitionRow.tsx
```

```ts
export interface DefinitionRowProps {
  label: string;
  children: React.ReactNode;
  tone?: 'default' | 'muted';       // muted 对应 isolation 行的 text-gray-500
}
```

抽取时建议**一并统一术语**：`duty` 统称「职责」、`isolation` 统称「边界」（D5 已指出同字段两套叫法）。术语口径需 Planner 拍板，Evaluator 不代决。

### R6 — `SectionLabel`｜对应 D6

```
src/components/common/SectionLabel.tsx
```

```ts
export interface SectionLabelProps {
  icon?: React.ReactNode;
  size?: 'xs' | 'sm';
  children: React.ReactNode;
}
```

### R7 — `ClickableCard`｜对应 D7

```
src/components/common/ClickableCard.tsx
```

```ts
export interface ClickableCardProps {
  href?: string;                    // 有 href → 包 next/link
  children: React.ReactNode;
  className?: string;
}
```

抽取时需**先统一悬停语言**（当前三套：`hover:shadow-md` / `hover:shadow-xl` / `hover:border-brand-200 hover:shadow-md`）。收敛为哪一种属设计决策，建议 Planner 或设计确认后再落地——这是 R7 成本高于 R3-R6 的原因。

### R8 — `PanelHeader`｜对应 D8

```
src/components/common/PanelHeader.tsx
```

```ts
export interface PanelHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}
```

---

## 6. 优先级排序（复用次数 × 改造成本）

改造成本口径：**低** = 纯 class 收敛无结构变动；**中** = 需拆分组件或统一设计口径；**高** = 涉及数据流改动。

| 序 | 组件 | 复用处 | 改造成本 | 分级 | 依据 |
|---|---|---|---|---|---|
| **1** | **R3 `Badge`** | 6 | 低 | **P0** | 6 处调用点全为单行替换，零风险；已存在尺寸漂移（`campaigns:21`）；M0.5 每页都要用 |
| **2** | **R2 `ChatBubble`** | 6 | 低 | **P0** | 纯呈现无状态；同文件内已重复 3 次；是 R1 的前置拆分练习 |
| **3** | **R1 `HandoffCard` + 容器拆分** | 2 | 中 | **P0** | 复用次数虽仅 2，但**修复视觉回归盲区**（见 D1 衍生影响），价值不由复用次数衡量 |
| 4 | R4 `PageHeader` | 4 | 低 | P1 | M0.5 后复用面 4 → 10+，越早抽越省 |
| 5 | R5 `DefinitionRow` | 4 | 低 | P1 | 需附带术语统一决策 |
| 6 | R6 `SectionLabel` | 3 | 低 | P1 | 纯 class 收敛 |
| 7 | R7 `ClickableCard` | 3 | 中 | P2 | 阻塞于「统一悬停语言」的设计决策 |
| 8 | R8 `PanelHeader` | 2 | 低 | P2 | 复用面窄，随 R1 一并处理即可 |

**Top 3 点名：R3 `Badge` / R2 `ChatBubble` / R1 `HandoffCard`（含容器-呈现拆分）。**

前两条是「零风险、立刻可做」；第三条是「唯一带结构改动、但换回一层失效的测试保护」。

### 排期建议（供 Planner 参考，非 Evaluator 决策）

**建议在 M0.5 六页工作台开工之前完成 P0 三条。** 理由是成本曲线而非洁癖：当前自建 UI 面仅 4 页 / ~760 行，替换点 14 处；M0.5 落地六页工作台后，同样的抽取需覆盖 10+ 页，替换点将成倍增长，且届时新页会继续按现有 class 串复制扩散。P1/P2 可并入 M0.5 期间随手完成。

---

## 7. 做对的部分（避免报告只呈现负面）

审计需如实记录已达标项：

1. **`Card` 容器已正确共享** —— `components/card` 被 4 处自建面统一复用，未出现手写卡片外框：
   `today:7` / `campaigns:5` / `StagePanel:9` / `ProjectDetail:11`
2. **`Button` 已抽取且被消费** —— `common/Button.tsx` 提供 5 variant × 3 size，`ComingSoon:29` 正确调用，未见页面内手写按钮 class 串
3. **`ComingSoon` 占位已统一** —— 4 个占位页共享同一组件，未各写各的
4. **`ExpertScope` / `KolResultCards` 复用姿势正确** —— 预览页 `page:11-12` 直接 import 真实组件 + 夹具 props，是 R1/R2 应当效仿的正面样板

即：**容器层（Card）与交互原语层（Button）的复用是健康的；缺口集中在「展示型小组件」这一层。** 这也解释了债务形态——`common/` 只有 2 个组件不是因为疏于抽取，而是因为抽取停在了原语层，没有向上覆盖到展示层。

---

## 8. Acceptance 逐条自查

| # | Acceptance clause | 结论 | 证据 |
|---|---|---|---|
| 1 | 扫描 15 页面 + 自建组件中 ≥2 次的重复 UI 模式 | **达成** | 27 文件入扫（§1.1），10 组指纹，识别 8 条 ≥2 次模式 / 30 处（§3）；单次与零次模式按阈值纪律排除并说明（§4） |
| 2 | 逐条列出现位置 `文件:行` | **达成** | §3 每条 finding 均附 `文件:行`，D1/D3/D8 另附逐字节字面量比对；全部可经 `scripts/test/fe-audit-dup-scan.sh` 复跑复核 |
| 3 | 公共组件清单：命名 + 落位 `src/components/common/` + props 签名 | **达成** | §5 给出 8 个组件（R1-R8），均含 TS props interface 与落位路径 |
| 4 | 按 复用次数 × 改造成本 排优先级 | **达成** | §6 八条排序表，含成本口径定义与 P0/P1/P2 分级，Top 3 点名 |
| 5 | 报告落 `docs/test-reports/FE-AUDIT-F002-Andy-evaluator-subagent.md` | **达成** | 本文件 |

**边界合规：** 未修改任何产品代码；未写 `progress.json` / `features.json` / `backlog.json`；新增文件仅 `scripts/test/fe-audit-dup-scan.sh`（扫描脚本）与本报告。spec §4 D6 白名单四项均未计入 finding（本报告未涉及 `map/` / Chakra 原语 / 浅色默认 / RTL）。

---

## 9. 移交 F004 的复核要点

供汇总层对抗复核（防并行误报）：

1. **D1 的「视觉回归盲区」结论需交叉确认** —— 依据为 `tests/visual/agent-canvas.spec.ts:7,11` 截取 `/preview/agent-canvas`，而该路由的交接卡为克隆体。请复核该推论是否成立。
2. **§4.2 的 `MiniStatistics` 未被引用** 与 F001 的「模板组件使用状态矩阵」存在交叉，应以 F001 结论为准并统一口径（避免 F002 建议新抽 StatCard 而 F001 判定应复用模板件）。
3. **R5 术语统一 / R7 悬停语言统一** 含设计决策成分，Evaluator 不代决，需 Planner 或设计确认后方可落地。
4. **§6 排期建议属建议性质**，是否在 M0.5 前插 FE-REFACTOR 批次由 Planner 与用户裁定。

---

*报告完 — Andy/evaluator-subagent，隔离上下文验收，结论未经编排者改写。*
