# ARCH-M05 验收报告 — B 组（F002 路由/探针 · F003 三区外壳 · F004 渲染契约层 · F005 共用产品件）

> **验收者：** Andy/evaluator-subagent（隔离上下文，fresh context）
> **日期：** 2026-07-21
> **被验 HEAD：** `f970124`
> **依据：** features.json（acceptance 权威）· `docs/specs/ARCH-M05-spec.md`（§3 通用 4 段 / D 决策 / 附录 A）· `docs/specs/ARCH-M05-ui-inventory.md` §S1-S5 · `docs/product/interaction-prototype-v2.html`（L432-467 外壳区，canonical）
> **边界：** 未修改任何产品代码。新增测试产物 1 个：`scripts/test/arch-m05-shell-probe.mjs`。

## 0. 结论速览

| Feature | Verdict | 关键理由 |
|---|---|---|
| F002 路由收敛 + 探针核销 | **PARTIAL** | 6 入口 / 7 redirect / 无死链全实测通过；**但 D4 探针 grep 存在第 9 类命中未入附录 A**——`src/app/page.tsx:3` 仍指 legacy 桩，根入口实测 3 跳绕行 |
| F003 三区外壳 | **PARTIAL** | S1 12/12 · S2 12/12 · S3 19/19 · 不重挂载 · 指令栏链路 · AgentSquad 双 variant 全通过；**移动端 Copilot 抽屉单向不可关**（无关闭钮 / 无 scrim / z 序与原型相反） |
| F004 渲染契约层 | **PASS** | 冒烟 19/19 复跑绿；双 variant 双处真实消费；「待核」判定与裁决 #2 机械对齐 |
| F005 共用产品件 | **PASS** | 五新件齐备且 props 对位 S4/S5；Toast 单例语义逐条符合；port 口径经矩阵实测在批末成立 |

**L1 门：** `npm run lint` ✔ 0 warnings/errors · `npm run typecheck` ✔ exit 0 · `npx next build` ✔ exit 0（21 路由全出）
**L2：** 未涉及（本组无真实外部服务 / 计费 / 生产写入）。

**执行环境：** `npx next build` → `node .next/standalone/server.js`（PORT=3000，standalone 产物 = 实际部署 artifact）。
**实测汇总：** `scripts/test/arch-m05-shell-probe.mjs` → **PASS 47 / FAIL 3**（3 项失败同源，见 §2 O-2）；运行期控制台/页面错误 **0 条**。

---

## 1. F002 — 路由收敛 + routes.tsx + v1.0.5 探针清单 → **PARTIAL**

### 1.1 clause：routes.tsx 6 入口 ↔ kimi §6.1 表 — **PASS**

`src/routes.tsx` 实物 6 条，与 §6.1 表逐项一致（名称 / 路径 / 顺序）：

| # | name | layout+path | 侧栏实测 |
|---|---|---|---|
| 1 | 今天 | `/admin/today` | ✓ |
| 2 | 项目 | `/admin/campaigns` | ✓ |
| 3 | 创作者库 | `/admin/creators` | ✓ |
| 4 | 游戏知识 | `/admin/knowledge` | ✓ |
| 5 | 洞察 | `/admin/insight` | ✓ |
| 6 | Agent 记录 | `/admin/runs` | ✓ |

侧栏区 `a[href^="/admin/"]` 全量枚举去重后**无多余 / 无旧路由链接**（strays = `[]`，探针 B 组）。

> 记录（非扣分项）：该文件由 AGENT-FOUNDATION F008 提前收敛，F002 commit `59ba786` 与 spec 附录 A 均如实披露"已提前就位，本 feature 核验并核销探针"。终态经实物核验一致，acceptance 的"重写"目标达成，不因实现时序判负。

### 1.2 clause：redirect 桩 destination 本批建成（wire-readiness）— **PASS**

Next 15 对静态预渲染的 `redirect()` 产出 200 + 客户端跳转，`curl -L` 看不到跳转（实测 `num_redirects=0`），故改用真实浏览器判定终点：

| 入口 | 实测落点 | 结果 |
|---|---|---|
| `/` | `/admin/today` | ✓ |
| `/admin` | `/admin/today` | ✓ |
| `/admin/dashboards` | `/admin/today` | ✓ |
| `/admin/dashboards/default` | `/admin/today` | ✓ |
| `/admin/database` | `/admin/creators` | ✓ |
| `/admin/discovery` | `/admin/creators` | ✓ |
| `/admin/outreach` | `/admin/campaigns` | ✓ |

7/7 落点与附录 A 声明一致，且全部 destination 均为本批建成的真页（非空壳）。

### 1.3 clause：无死链 — **PASS**

6 入口逐个直访：HTTP 200 且正文非空（今天 1713 字 / 项目 1109 / 创作者库 1308 / 游戏知识 1157 / 洞察 1052 / Agent 记录 1170）。既有 `scripts/test/f008-browser-check.mjs` 的前 5 条断言同样通过（侧栏 6 项齐全 · 6 路由无 404 · 3 条 redirect）。

> f008 脚本在第 6 条 `a[href^="/admin/campaigns/"]` 超时中断——该断言属 F007 项目列表卡（现为 router.push 非 anchor），**是 building 期已立项的历史断言漂移，归 F007/E 组，不计入 F002**。

### 1.4 clause：探针清单同批核销 + 入 spec 附录逐条打勾 — **PARTIAL** ⚠️

按 D4 原文 grep 全仓复现（`tests/ scripts/test/ .github/workflows/ docker-compose*.yml src/ deploy/`）。附录 A 8 行**逐条复核全部成立**：

| # | 附录 A 处置 | 复核结果 |
|---|---|---|
| 1 | ComingSoon 重指 `/admin/today` | ✓ 实物 `ComingSoon.tsx:36` `router.push('/admin/today')` |
| 2 | f010 `?stage=` 转 F007 | ✓ **已兑现**：`f010-e2e-check.mjs:38` 现为 `?env=${stage}` |
| 3 | ds-* 历史脚本不重指 | ✓ 成立：`.github/` 与 `package.json` 均无引用（非活跃链路） |
| 4 | f008 62-65 专测 redirect 本身 | ✓ 断言方向正确，实跑通过 |
| 5 | orchestration-smoke 容错回归 | ✓ 保留合理 |
| 6 | NavbarAuth dead-in-repo | ✓ **传递性验证**：仅被 auth/variants/{Centered,Pricing}AuthLayout 引用，二者本身在矩阵 unused 名单内 |
| 7 | compose/health 注释 + dashboards 桩本体 | ✓ 注释性，正确 |
| 8 | tests/visual 无旧路由 | ✓ 净（现 3 spec，F017 新增 workbench.spec.ts 亦全用新路由） |

**⚠️ O-1（缺陷）：D4 grep 存在第 9 类命中，未入附录 A、未处置。**

```
src/app/page.tsx:3:  redirect('/admin/dashboards/default');
```

- 命中 D4 声明的 grep 模式（`dashboards/default`），属**产品代码活跃路径**（应用根入口），非注释、非历史脚本、非 dead-in-repo，不落入附录 A 任何一类豁免。
- 实测导航链（浏览器 framenavigated 追踪）：

```
/  →  /  →  /admin/dashboards/default  →  /admin/today     跳数 3
```

- **影响：** 功能可用（终点正确），但应用主入口绕行一个为向后兼容而存在的 legacy 桩。该桩的设计意图是"旧链接兼容"，一旦按其寿命清理即导致根路径 404——正是 v1.0.5 探针纪律要防的悬挂指针。
- **性质：** F002 的核心交付物就是探针核销的完备性，故此漏项直接落在本 feature 的 acceptance 内，判 PARTIAL。
- **建议修复：** `src/app/page.tsx` 改 `redirect('/admin/today')`，并在附录 A 补第 9 行。

（另记：`src/lib/agent/persona-router.ts:61` 亦命中，但为注释文本，同附录 A #7 类，无需处置。）

### 1.5 clause：lint + tsc 绿 — **PASS**

---

## 2. F003 — 三区外壳改造 → **PARTIAL**

### 2.1 clause：固定三列（侧栏 285px · 主区弹性 · Copilot 360px 常驻）— **PASS**

- 侧栏 `getBoundingClientRect().width` 实测 **285**（精确）
- 主区 `xl:ml-[313px] xl:mr-[372px]` 弹性夹在两侧之间
- Copilot `aside` 实测 `w=360`，`xl:translate-x-0` 常驻

### 2.2 clause：S1 侧栏 12 元素 — **PASS 12/12**

对照 `ui-inventory` §S1 与原型 L432-437：

| # | 元素 | 判定 | 证据 |
|---|---|---|---|
| 1 | KM 渐变方块 mark | ✓ | `bg-gradient-to-br from-brandLinear to-brand-500` 34px |
| 2 | 品牌双字重 KOL 800 + Matrix 300 | ✓ | **运行期 computedStyle 实测 `["800","300"]`**，未压成单一 |
| 3 | 分隔线 | ✓ | `h-px bg-gray-200` |
| 4 | nav 组标签「工作台」 | ✓ | 实测在场 |
| 5 | 6 入口（routes.tsx 驱动） | ✓ | `routes.map`，见 §1.1 |
| 6 | 🔒 active 右侧 4×36 竖条 | ✓ | `h-9 w-1 rounded-lg bg-brand-500`，active 态实测在场 |
| 7 | 🔒 待办徽标 today=3/项目=4/洞察=2 | ✓ | **实测三处逐一命中**（「今天\|3」「项目\|4」「洞察\|2」） |
| 8 | .side-cta 渐变卡 | ✓ | 在场 |
| 9 | 🔒 orb 装饰半圆 | ✓ | `-top-14 h-[130px] w-[130px] rounded-full bg-white/[0.12]` |
| 10 | shield 圆图标 44px | ✓ | `h-11 w-11` + MdShield |
| 11 | 🔒 标题「Agent 自动边界」 | ✓ | 实测在场 |
| 12 | 🔒 D26/D27 宣示文案 | ✓ | **逐字比对原型 L436 通过**（正则双段匹配） |

### 2.3 clause：S2 Navbar 指令栏 12 元素 — **PASS 12/12**

| # | 元素 | 判定 | 证据 |
|---|---|---|---|
| 1 | mobile menu 钮 | ✓ | `aria-label="导航"` + `xl:hidden` |
| 2 | 面包屑 | ✓ | 「工作台」/ 详情「工作台 / 项目」 |
| 3 | 页标题 26px/800 | ✓ | `text-[26px] font-extrabold` |
| 4 | 🔒 nb-cmd 胶囊 min-w 280 | ✓ | `min-w-[280px] rounded-full` |
| 5 | spark 图标 | ✓ | MdAutoAwesome |
| 6 | placeholder 原文 | ✓ | 「问 Campaign Agent 或下达任务…」逐字同 L444 |
| 7 | 「Agent 推进中」 | ✓ | 实测在场 |
| 8 | 🔒 pulse 绿点纯 CSS | ✓ | `animate-ping` 实测在场 |
| 9 | 主题切换 body.dark | ✓ | `useColorMode`，非 data-theme |
| 10 | copilot toggle (mobile) | ✓ | `aria-label="打开 Agent"` |
| 11 | 头像渐变圆 40px | ✓ | `h-10 w-10` 渐变 + 「MC」 |
| 12 | 🔒 玻璃外壳 | ✓ | **实测 computedStyle `{pos:"sticky", filter:"blur(24px)", bg:"rgba(255,255,255,0.3)"}`** — 30% 白 + blur 与原型一致 |

> 观察（不扣分）：指令栏隐藏断点实现为 `md`(768px)，原型为 `max-width:680px`；抽屉断点实现 `xl`(1200px)，原型 `max-width:1280px`。均为断点粒度差异，非元素简化。

### 2.4 clause：S3 Copilot 19 元素 — **PASS 19/19**

代码逐条对位 + 运行期渲染确认。要点：①cop-head 渐变 `color-mix` 随 `theme.color` 动态 ②dm 块 42px ③④专家名/副标题动态 ⑤🔒 cop-auto 边界条（文案逐字同 L456）⑥🔒 ExpertScope / ⑦🔒 AgentSquad compact **二选一条件渲染**（`ui.squad` 仅编排上下文，符合 S3-7"仅编排上下文"）⑧RecentlyDone ⑨-⑬🔒 HandoffCollab（虚线框/双色 agent/逐轮台词/交接物 chip/绿结论）⑭⑮ ChatBubble 双角色 ⑯ ActionCard（canvas-registry）⑰ 建议 chips ⑱ 输入框 ⑲ Button iconOnly 渐变圆发送。
`key={contextKey}` remount 机制保留（route+env 变化重置线程 + 新开场白）。

### 2.5 clause：指令栏 Enter → 路由到 Copilot — **PASS**

实测：navbar 指令栏填入探针文本 → Enter → **该文本出现在 `aside` Copilot 面板内**；指令栏同步清空。桥接经 `CopilotUiContext`（轻量 context，未引全局 store，符合 ADR-18）。

### 2.6 clause：路由切换只重绘主区与 Copilot 上下文，侧栏/navbar 不重挂载 — **PASS**

DOM 身份标记法（在 today 页给侧栏/navbar 打 `data-evaluator-mark`，随后**客户端软导航**两次）：

| 步骤 | 侧栏 mark | navbar mark | 主区 |
|---|---|---|---|
| today（打标） | sidebar-1 | navbar-1 | — |
| → creators | **sidebar-1（存活）** | **navbar-1（存活）** | 已重绘 |
| → runs | **sidebar-1（存活）** | **navbar-1（存活）** | 已重绘（1170 字） |

标记跨两次路由切换存活 ⇒ 外壳 DOM 节点未被卸载重建，FR-7.1 达成。

### 2.7 clause：移动端 Copilot 退为 fixed 右滑抽屉 — **FAIL** ⚠️

**O-2（缺陷，本组唯一功能性缺陷）：移动端 Copilot 抽屉是单向的——打开后无法关闭。**

实测（390×844 视口）：

| 探针 | 结果 |
|---|---|
| 默认收起（`translate-x-[103%]`） | ✓ x=400.8，视口外 |
| cop-toggle 在场 | ✓ |
| 点 toggle → 抽屉滑入 | ✓ x=30, w=360 |
| 抽屉内有关闭钮 | ✗ **aside 内按钮全量枚举 = 8 个业务按钮（协同卡/动作卡/建议 chips/发送），无任何关闭语义控件** |
| 有 scrim 遮罩可点关 | ✗ **实测 0 个** |
| 抽屉开启态下 cop-toggle 仍可点 | ✗ **`elementFromPoint` 命中 aside 子树的 DIV，按钮被遮挡** |

**根因（代码级）：**

1. `CopilotUiContext` 定义了 `closeDrawer`，但**全仓无任何消费方**：
   ```
   $ grep -rn "closeDrawer" src/ | grep -v CopilotUiContext.tsx
   （空）
   ```
   → 关闭能力已建模但未接线，是死代码。
2. **层叠顺序与原型 canonical 相反：**

   | | navbar | copilot | 结果 |
   |---|---|---|---|
   | 原型（L70 / L263） | `z-index:25` | `z-index:20` | navbar 在上 → toggle 可点 → **双向 toggle** |
   | 实现 | `nav.sticky z-20` | `aside z-40` | copilot 在上 → toggle 被遮 → **单向** |

   原型 JS `#cop-toggle.onclick = () => $('#copilot').classList.toggle('open')` 依赖 navbar 高于 copilot 才成立；实现把 z 序倒置，toggle 语义随之失效。
3. **同外壳内的对照组证明这是遗漏而非设计：** 侧栏抽屉有 `HiX` 关闭钮（`sidebar/index.tsx:44-49`，实测在场）；Copilot 抽屉没有对应件。

**用户影响：** 移动端用户点开 Agent 面板后，360px 面板覆盖 390px 视口，仅剩 30px 无效边条，**只能刷新页面才能回到主区**。

**建议修复（三选一，改动均在 F003 文件集内）：** ①`aside` 降至 `z-10` 或 navbar 升至 `z-50`，恢复原型层叠 → toggle 自然双向；②抽屉内加关闭钮并接 `closeDrawer`（对齐侧栏做法）；③补 scrim 遮罩点击关闭。推荐 ① + ③。

### 2.8 clause：AgentSquad 双 variant 实装 — **PASS**

裁决 #7 落实为单组件 `variant: 'grid' | 'compact'`（`AgentSquadProps.variant`），且**两个 variant 均有真实消费点**（非声明未用）：

- `grid` → `src/app/admin/today/page.tsx:348` `<AgentSquad variant="grid" />`（V1 sqcard ×6）
- `compact` → `src/components/copilot/CopilotPanel.tsx:218` `<AgentSquad variant="compact" />`（S3-7，`ui.squad` 条件下）

### 2.9 clause：lint + tsc 绿 — **PASS**

---

## 3. F004 — mock 渲染契约层 → **PASS**

### 3.1 clause：provenance.ts 统一入口，null→占位、绝不抛错、绝不填 0 — **PASS**

复跑 `npx tsx scripts/test/provenance-smoke.ts`：**PASS 19 / FAIL 0，exit 0**。分组覆盖：

- **A. readContractSlot 三态**（5 例）：null / undefined / 有值 / **脏数据降级不抛错** / **数值槽缺失绝不合成 0**
- **B. isPendingVerification**（5 例）
- **C. resolveProvenance 三级回退**（5 例）：字段级 → 行级 → `ai_estimate` 保守下限；脏契约位逐级降级
- **D. 读写不对称**（2 例）：值 null → 占位无徽标；值在溯源空 → 数据点 + ai_estimate 徽标（永不裸展示）
- **E. ProvenanceTag 来源双通道**（2 例）：SOURCE_META 六档全覆盖，图标+文字齐备（色盲友好）

代码级复核：`readContractSlot` 对 `null/undefined` 直接返回 null；`safeParse` 失败仅在非 production 告警一次后返回 null——**无任何 throw 路径，无默认值合成**。

### 3.2 clause：ProvenanceTag 双 variant — **PASS**

裁决 #10 落实为 `variant?: 'badge' | 'inline'`，两态均有真实消费：

- `badge` → `CreatorDrawer.tsx:145`，经共享 `Section({prov})` 渲染，**5 个分区各传一次**（受众画像 / 内容表现 / 商务档期 / 合规风险 / 内容样本），对应 V10「5 处 ProvenanceTag 逐处不得删」，实物 5/5 在场
- `inline` → `knowledge/AnalysisCard.tsx:33`，V11 kb-prov 溯源行

来源双通道（图标 + 文字）由 `SOURCE_META` 保证，冒烟 E1 断言六档全覆盖。

### 3.3 clause：「待核」判定与裁决 #2 口径一致 — **PASS**

裁决 #2 原文：*「字段缺失/契约层 null → 待核；有值即显（含低 cred）；创作者库同规则」*。

`isPendingVerification(value, sourceChain?)` 实现：
- `value == null` → true（字段缺失 / 契约层降级后的 null）✓
- **有值即 false，含 `0` / `''` 等 falsy 实测值**（冒烟 B3 专门锁定）✓ —— 正确区分「缺失」与「值为 0」，未把低值误判为待核
- 低 confidence 不触发待核 ✓（判定只看值与显式 sourceChain）
- 可选 `sourceChain` 仅服务 FR-11.9「空依据非法」场景，代码注释显式划清与 §7.5.2 读写不对称的边界（"不要把 fieldProvenance 传进来"），避免把「值在但溯源空」误判为待核 ✓

判定为纯机械、无启发式，与裁决 #2「可机械判定」的立意一致。`PENDING_TEXT` 三态（待接入 / 待补充 / 待核）常量化，语义分离。

### 3.4 clause：F006-F016 全部经此层读 mock — **PASS（附观察）**

契约层 API 消费方覆盖 4 个页面 + 6 个组件 + 8 个 mock 文件（today / creators / knowledge / insight / runs / env-brief / env-match / env-reach / env-insight）。

观察 O-3（非缺陷）：`projects.ts` 与 `env-delivery.ts` 未 import 契约层。核查后确认其字段为枚举态（`health: gd/wn/cr`）与条件文案（`note: string|null`），**不含溯源型实测指标**，故无 `resolveProvenance` 适用面；二者文件头均显式声明并遵守 D2（"缺失字段一律 null…绝不填 0/'' 冒充实测"），实物 `note: null` 两处。属正当豁免，非绕过契约。

观察 O-4（文档级，极轻微）：`src/lib/data/mock/index.ts` 约定表将 projects.ts 服务页标为 `/admin/projects`，实际路由为 `/admin/campaigns`。F004 自带文件内的陈旧注释，无运行时影响。

### 3.5 clause：lint + tsc 绿 — **PASS**

---

## 4. F005 — 共用产品件第一波 → **PASS**

### 4.1 clause：新依赖 @tanstack/react-table + react-dropzone（D5）— **PASS**

`package.json` `dependencies` 实测：`@tanstack/react-table ^8.7.9`、`react-dropzone ^14.2.3`。

**「package.json 未改」的理由核实成立：** `git log -S` 追溯二者均自 `a04699e feat(DS-FOUNDATION-F001) 从 Horizon 模板 scaffold` 起就在 dependencies + lockfile 中（模板原生依赖）。D5 的要求是"声明这两个依赖"，终态满足且**被真实 import**（DataTable / UploadZone），零改动是正确处置而非遗漏。F005 commit message 已如实说明。

### 4.2 clause：DataTable / HalfGauge / UploadZone — **PASS**

| 组件 | props 对位 | 判定 |
|---|---|---|
| `DataTable<T>` | `data / columns / sortable / globalFilter+onGlobalFilterChange / pageSize / onRowClick / emptyText / className` + `DataTableColumnMeta.align` | ✓ 排序·筛选·分页三能力均为**可选开关**（符合"通用封装"）；`onRowClick` 服务 V9 整行开抽屉；`emptyText` 走 D2 占位。文件头正确声明"Match `.cmatrix` 是独立组件不经此表"（守 V5 规格） |
| `HalfGauge` | `percent / value / subValue / color / trackColor / width / className` | ✓ ApexCharts radialBar；`percent` 越界自动钳制；230:130 等比裁切复现原型形态；SSR 安全 `dynamic(ssr:false)`；环色运行时读 `--color-500` 跟随换肤 |
| `UploadZone` | `onFiles` + 文案插槽 | ✓ react-dropzone；职责边界正确——解析状态（analyzing/done）留给消费方渲染，与 V11「上传→插 analyzing 行→转 done」分工一致 |

### 4.3 clause：GateConfirm S4 8 元素 — **PASS 8/8**

| # | S4 元素 | 实现 | 判定 |
|---|---|---|---|
| 1 | scrim 遮罩 + blur | `ModalOverlay !bg-navy-900/50 backdrop-blur-sm` | ✓ 对位原型 `rgba(11,20,55,.5)+blur(4px)` |
| 2 | 红底 shield 46px | `h-[46px] w-[46px] bg-red-50 text-red-500` + MdOutlineShield | ✓ |
| 3 | 标题（4 类） | `title: ReactNode` | ✓ props 化，支撑发送/报价/放款/分享 |
| 4 | 正文点名收件人/收款方 | `children` 插槽 | ✓ |
| 5 | 🔒 harm 利害清单表 | `harmRows: GateHarmRow[]` map 渲染 | ✓ **行数由数据驱动**，天然支撑 2/3/3/2 与裁决 #3 的 scope 差异 |
| 6 | 🔒 irrev 红标行 | `irrevText: ReactNode` + MdErrorOutline 红色 | ✓ 4 类文案可各不同 |
| 7 | 取消 ghost | `Button variant="secondary"` | ✓ 对位原型 `.btn.ghost` |
| 8 | 确认红色 gate 钮 | `Button variant="danger"` + `confirmLoading` | ✓ |

Esc + 遮罩点击关闭 + 焦点陷阱：由 Chakra `Modal`（白名单原语）默认提供，`onClose` 统一收口。纯呈现件、闸门链路接线归消费 feature —— 与 spec D6「M0.5 只做触发与确认卡 UI」一致。

### 4.4 clause：Toast S5 单例语义 — **PASS**

裁决 #9「自建轻量，不扩 Chakra 白名单」落实。逐条比对 S5：

| S5 语义 | 实现 | 判定 |
|---|---|---|
| **单例** | ToastProvider 内**单个** DOM 节点，`message` 单值 state；连续调用 `clearTimeout(timerRef)` 后复用同一实例（对齐原型 `toastTimer`） | ✓ 无堆叠队列 |
| 底部居中 | `fixed bottom-[30px] left-1/2 -translate-x-1/2` | ✓ |
| 绿 check | `MdCheck text-horizonGreen-400` | ✓ |
| navy 底 | `bg-navy-700` | ✓ |
| 2.4s 自动收 | `TOAST_DURATION_MS = 2400` | ✓ 常量化，非魔数散落 |

挂载点 `src/app/AppWrappers.tsx:64` `<ToastProvider>{children}</ToastProvider>`（app 根，即时可达）。附带 `role="status" aria-live="polite"` 无障碍语义（超出规格要求）。卸载时 clearTimeout，无泄漏。

### 4.5 clause：port MiniStatistics / charts 系（登记表 C 组）+ 矩阵可达性符合预期 — **PASS**

F005 commit 采「随页面消费自然可达」口径（理由：port-guide 定义 *port 完成 = 被真实页面 import*，桶文件假接线违背该定义）。此口径需**在批末验证兑现**，实跑 `node scripts/test/fe-audit-component-matrix.mjs`：

```
模板组件 tsx：215 | 项目组件 tsx：128 | 可达文件总数：110

used-as-is (6):      card/index · charts/BarChart · charts/CircularProgress
                     charts/LineAreaChart · footer/Footer · link/NavLink
forked-modified (5): card/MiniStatistics · charts/PieChart · progress/index
                     navbar/index · sidebar/index
self-built (38)      unused/dead-in-repo (79)      removed(whitelist) (1)
```

**C 组登记表逐项兑现：** MiniStatistics ✓（forked-modified）· LineAreaChart ✓ · BarChart ✓ · PieChart ✓（forked-modified）· CircularProgress ✓ · Progress ✓（`progress/index` forked-modified）——**6/6 全部脱离 dead 状态、进入可达集**。

消费点交叉验证：MiniStatistics ← today/creators/insight/runs 四页；charts ← today/insight/CreatorDrawer/envs{brief,insight,reach}。口径成立，非空头承诺。

### 4.6 clause：lint + tsc 绿 — **PASS**

---

## 5. 缺陷汇总

| ID | Feature | 严重度 | 摘要 | 建议落点 |
|---|---|---|---|---|
| **O-1** | F002 | **Medium** | D4 探针 grep 第 9 类命中未入附录 A 未处置：`src/app/page.tsx:3` → `/admin/dashboards/default`，应用根入口实测 3 跳绕行 legacy 桩；桩按其兼容寿命清理后根路径将 404 | 改 `redirect('/admin/today')` + 附录 A 补第 9 行 |
| **O-2** | F003 | **Medium-High** | 移动端 Copilot 抽屉单向不可关：无关闭钮 + 无 scrim + `aside z-40` 遮住 `navbar z-20` 的 cop-toggle（原型为 navbar z-25 > copilot z-20，层叠倒置）；`closeDrawer` 已定义但全仓零消费。用户须刷新页面才能脱困 | 恢复原型层叠（aside 降 z / navbar 升 z）+ 补 scrim；或抽屉内加关闭钮接 `closeDrawer` |
| O-3 | F004 | Info | `projects.ts` / `env-delivery.ts` 未走契约层——核查为正当豁免（无溯源型字段，仍守 D2 null 语义），不需修 | — |
| O-4 | F004 | Info | `mock/index.ts` 注释写 `/admin/projects`，实际 `/admin/campaigns` | 顺手改注释 |

---

## 6. 测试产物

| 路径 | 说明 |
|---|---|
| `scripts/test/arch-m05-shell-probe.mjs` | **新增**（本次验收）。F002/F003 外壳与路由实测探针，6 组 50 项断言：A redirect 桩终点 · B 六入口无死链 + kimi §6.1 一致性 · C S1/S2 关键元素（含 computedStyle 字重/玻璃/宽度实测）· D 指令栏→Copilot 链路 · E 不重挂载（DOM 身份标记法）· F 移动端双抽屉 + 关闭可达性。只读断言，不改产品代码。 |
| `docs/test-reports/ARCH-M05-verify-B-Andy-evaluator-subagent.md` | 本报告 |

复现方式：

```bash
npx next build
node scripts/serve-standalone.mjs        # 或 PORT=3000 node .next/standalone/server.js
node scripts/test/arch-m05-shell-probe.mjs
npx tsx scripts/test/provenance-smoke.ts
node scripts/test/fe-audit-component-matrix.mjs
```

---

## 7. 结论

- **F004 / F005 → PASS**，可直接签收。
- **F002 / F003 → PARTIAL**，各含 1 项需修缺陷（O-1 / O-2），建议回 `fixing`。两项均为定点小改，不涉及结构返工。
- 本组未发现语义替换、区块删除或结构简化——S1 12 / S2 12 / S3 19 / S4 8 / S5 1 五张清单**元素级零缺失**，🔒 项全部在场。
- **本结论基于实物证据（代码 grep + standalone 产物浏览器实测 + 冒烟脚本复跑），未采信任何实现过程叙述。**
