# DS-FOUNDATION — 首轮验收报告（verifying）

> **批次：** DS-FOUNDATION（设计系统地基）
> **阶段：** verifying（首轮，fix_rounds=0）
> **Evaluator：** 隔离 evaluator-subagent（fresh context，自行取证）
> **日期：** 2026-07-14
> **验收层级：** 仅 L1 本地（无 staging；L2 未授权、无需执行）
> **总评级：** 🟡 PARTIAL — 5 PASS / 1 PARTIAL / 0 FAIL → status = `fixing`

---

## 0. 结论摘要

| Feature | 判定 | 一句话 |
|---|---|---|
| F001 scaffold | ✅ PASS | Next.js 结构齐全、demo 页已删、构建三门全绿、模板源目录未入库 |
| F002 浅色 theme + tokens | ✅ PASS | 浅色默认（body 无 dark）、深色 toggle 可用、品牌紫未改、tokens 文档齐 |
| F003 外壳 + 品牌 + 导航 | ✅ PASS | Sidebar=KOLMatrix、5 路由无幽灵项、navbar 全元素、无死链 |
| F004 组件集 + Button | ✅ PASS | 模板原语全保留、Button 5 variants + size/disabled/loading、被实际使用 |
| **F005 hooks/contexts/utils** | 🟡 **PARTIAL** | ConfiguratorContext + navigation + useColorMode 全 PASS；**SidebarContext 为孤儿死代码（未 provide 未 consume），不满足 acceptance「正常提供并被外壳消费」** |
| F006 占位 Dashboard + baseline | ✅ PASS | root→dashboard、4 KPI + LineChart、浅色 console 无 error、baseline PNG 入库 1512×982 |

**阻断项（须回 fixing）：** F005 SidebarContext 孤儿死代码。

---

## 1. 构建门（L1）—— ✅ 全绿

命令：`npm run typecheck && npm run lint && npm run build`（日志 `/tmp/ds_foundation_build.log`）

| 门 | 结果 | 证据 |
|---|---|---|
| `tsc --noEmit` | ✅ exit 0 | `TYPECHECK_EXIT=0` |
| `next lint` | ✅ exit 0 | `✔ No ESLint warnings or errors`（0 error / 0 warning；仅 Next16 弃用提示，非错误） |
| `next build` | ✅ exit 0 | `✓ Compiled successfully`；10/10 静态页生成 |

构建产物路由表（全部 prerendered static）：`/`、`/admin`、`/admin/dashboards/default`、`/admin/discovery`、`/admin/database`、`/admin/campaigns`、`/admin/outreach`、`/_not-found`。

> lint 0 warning → 不触发 evaluator.md §15 处理矩阵，无 soft-watch。

---

## 2. 运行门（L1）—— ✅ 通过

`npm run start` 起 :3000，Playwright 探针（`scripts/test/ds-foundation-verify.mjs`）遍历全部路由，记录 HTTP status + console error + pageerror：

| 路由 | HTTP | 落地 URL | console error | pageerror |
|---|---|---|---|---|
| `/` | 200 | → `/admin/dashboards/default` | 0 | 0 |
| `/admin/dashboards/default` | 200 | 同 | 0 | 0 |
| `/admin/discovery` | 200 | 同 | 0 | 0 |
| `/admin/database` | 200 | 同 | 0 | 0 |
| `/admin/campaigns` | 200 | 同 | 0 | 0 |
| `/admin/outreach` | 200 | 同 | 0 | 0 |

- 根路径 `redirect('/admin/dashboards/default')` ✅
- 4 个模块路由均导航到**真实 ComingSoon 占位页**（非死链、非幽灵项）✅
- **全部 6 路由 0 console error / 0 pageerror** ✅
- 浅色默认：`document.body.className` 为空（无 `dark`），app 底 `.bg-background-100` = `rgb(255,255,255)` ✅

---

## 3. 视觉门（§4.3 不得简化清单，对照 Horizon 模板浅色渲染）

截图产物：`tests/screenshots/verify/{dashboard,discovery,dashboard-dark}.png`（1512×982）。

| §4.3 要素 | 结果 | 证据 |
|---|---|---|
| 卡片阴影 `shadow-3xl` | ✅ | `card/index.tsx` + `MiniStatistics.tsx` 均含 `shadow-3xl`；tailwind `3xl:'14px 17px 40px 4px'`；截图柔和阴影可见 |
| 卡片圆角 `rounded-[20px]` / 控件 `rounded-xl` | ✅ | Card `rounded-[20px]`、Button `rounded-xl`、MiniStatistics `rounded-[20px]` |
| 字体 DM Sans（正文）+ Poppins（品牌/标题） | ✅ | `styles/index.css` L1-2 Google Fonts `@import` 加载 Poppins+DM Sans（**与模板同机制**）+ `Fonts.tsx` 自托管 DM Sans；正文 `font-dm`，品牌 `font-poppins`（sidebar KOLMATRIX）。非系统字体回退 |
| brand 紫色阶 `--color-50..900` | ✅ | `AppWrappers.tsx` 注入默认紫 preset；`--color-500 #422AFB` / `--color-400 #7551FF` 未改；截图导航高亮/图表线为品牌紫 |
| Sidebar mini/hover + 响应式 margin `xl:ml-[313px]⟷[142px]` | ✅ | `admin/layout.tsx` L47-54 三态 margin；Configurator setMini(true/false) 提供折叠；`useMediaQuery(1200px)` 桌面自动收抽屉 |
| Navbar 全元素 | ✅ | `navbar/index.tsx`：面包屑(Pages/{brandText}) + 搜索 pill(FiSearch+input) + 通知 Dropdown + 配置齿轮(Configurator/MdSettings) + 色彩 toggle(Configurator Light/Dark radio) + 头像 Dropdown。截图全部可见 |
| KPI 卡 `MiniStatistics` 结构（icon box + label + value） | ✅ | 组件与模板 `card/MiniStatistics.tsx` **字节一致**；4 卡渲染 icon box + label + value（见备注 A） |
| 深色 toggle 能力（浅色默认，深色不删） | ✅ | 见 §4 深色回归 |

**MiniStatistics 结构对照（备注 A）：** spec §4.3 括注「+ delta」。核对模板 source of truth：模板自身的 `card/MiniStatistics.tsx` 原语**本就无 delta 字段**（icon box + label + value），delta 出现在 dashboards/default 的另一 widget，非本原语。KOLMatrix 保留的 `MiniStatistics.tsx` 与模板字节一致 → **非 Generator 简化**。据 evaluator.md §13（checklist 文本对实际代码漂移），此处应修正 spec 括注文本，判 PASS 不判简化。

**总体视觉评级：🟢 忠实还原 Horizon 浅色视觉语言。** 卡片阴影/圆角、品牌紫、字体、外壳布局、KPI+图表结构均与 Horizon `dashboards/default` 一致。

---

## 4. 深色回归门 —— ✅ 通过

探针在 dashboard 注入 `document.body.classList.add('dark')`（等价 Configurator 深色 toggle，逻辑统一走 `hooks/useColorMode.ts`）：

- `hasDarkClass: true`、**0 console error / 0 pageerror**
- 截图 `dashboard-dark.png`：navy 深底、sidebar/navbar/卡片全部深色化、文字反白、图表品牌紫+青仍渲染，无布局崩溃
- tailwind `darkMode:'class'`；`<body id=root>` 承载 `dark` class，body 为全树祖先 → `dark:` variant 生效（与模板 `<body className=dark>` 同机制）

---

## 5. Baseline 门（§4.4）—— ✅ 通过

- `git ls-files tests/screenshots/baseline/en-dashboard.png` → **非空**（已入库）
- `file` → `PNG image data, 1512 x 982`（浅色、≥1440px 宽）✅

---

## 6. License 门 —— ✅ 通过

- `git ls-files | grep db4rDjuaSCqaEFW9XcFo` → **空**（exit 1）→ 付费模板源目录未入库 ✅
- 磁盘存在模板目录且在 `.gitignore` L9（本地读盘参照，符合预期）✅

---

## 7. Feature 逐条判定与证据

### F001 — scaffold ✅ PASS
- Next.js 结构：`src/app` `src/components`(92) `src/contexts` `src/hooks` `src/utils` `src/variables`(19) `src/styles`(12) `package.json` 齐全
- demo 页删除：`admin/nfts` `admin/main` `admin/dashboards/{car-interface,smart-home}` `rtl` `components/admin` **全部 removed**
- `npm install` 成功（node_modules 存在，build 通过）
- `npm run dev/start` :3000 不白屏（200，dashboard 渲染）
- build ✅ / typecheck ✅ / lint 0 error ✅
- 模板源目录 gitignore 未提交 ✅
- commit `a04699e feat(DS-FOUNDATION-F001)` ✅

### F002 — 浅色 theme + tokens ✅ PASS
- `layout.tsx` `<body id=root>` 无 `className="dark"` → 浅色默认（运行时 body class 空、app 底白）✅
- 深色 toggle 可用（Configurator + FixedPlugin，见 §4）✅
- 品牌紫 `--color-500 #422AFB` 未改（AppWrappers + Configurator resetTheme 一致）✅
- `design-draft/horizon-tokens.md`（84 行）：品牌色+hex、CSS 变量色阶、`--background-100/900`、`--shadow-100`、DM Sans/Poppins、`shadow-3xl=14px 17px 40px 4px`、`rounded-[20px]`/`rounded-xl` 全含 ✅
- commit `4469cfe` ✅

### F003 — 外壳 + 品牌 + 导航 ✅ PASS
- Sidebar 品牌 `KOLMatrix`（`sidebar/index.tsx` L113），无 "Horizon PRO" 残留（仅移除注释）✅
- `routes.tsx`：Dashboard(active) + Discovery/Database/Campaigns/Outreach，**均指向真实 ComingSoon 占位页（非幽灵项）**，NFT/Ecommerce/Users demo 组已删 ✅
- 外壳渲染正常：sidebar mini/hover、响应式 margin、navbar 全元素（§3）✅
- 无死链运行时报错（§2 全 200 / 0 error）✅
- commit `b1a8651` ✅

### F004 — 组件集 + Button ✅ PASS
- 模板原语保留：Card / MiniStatistics / InputField / TextField / SwitchField / checkbox / radio / switch / dropdown / badge(SessionBadge) / tooltip **全部存在**，浅色渲染正常
- `components/common/Button.tsx`：5 variants（primary `from-brand-400 to-brand-600` 渐变 / solid `bg-brand-500 hover:bg-brand-600` / secondary / ghost / danger）+ size(sm/md/lg) + disabled + loading(Spinner) ✅
- Button 被实际使用：dashboard「去发现 →」(ghost) + ComingSoon「返回 Dashboard」(ghost) ✅
- commit `b859f08` ✅

### F005 — hooks/contexts/utils 🟡 PARTIAL
| acceptance 子项 | 判定 | 证据 |
|---|---|---|
| ConfiguratorContext 正常提供并被外壳消费 | ✅ | Provider in `AppWrappers.tsx`；consume in `admin/layout.tsx` + `sidebar/index.tsx` |
| **SidebarContext 正常提供并被外壳消费** | ❌ | `src/contexts/SidebarContext.ts` 仅定义/导出，**全 src/ 无 `SidebarContext.Provider`、无 `useContext(SidebarContext)`** → 孤儿死代码。模板中它仅被已删除的 `auth/layout.tsx` 引用 |
| `utils/navigation.ts` getActiveRoute/getActiveNavbar 正常 | ✅ | 逐路由面包屑 + active nav 随 pathname 更新（截图佐证） |
| ≥1 有用公共 hook 并被引用 | ✅ | `hooks/useColorMode.ts` 被 `navbar/index.tsx` 引用；另有 `useMediaQuery`(admin/layout 消费) + `useDebounce` |

**PARTIAL 定性：** 侧栏折叠/宽度功能**实际可用**（经 ConfiguratorContext.mini + admin/layout 本地 open 状态实现，截图佐证），但 acceptance 明确点名的 `SidebarContext` 既未 provide 也未 consume，是死代码。地基批次遗留孤儿 context 会污染后续所有 grep context 用法的批次，须收敛。**非 FAIL**（功能不缺失），判 **PARTIAL**。
- commit `c77fc85` ✅（commit 存在，但 acceptance 未完全满足）

### F006 — 占位 Dashboard + baseline ✅ PASS
- root `/` → redirect `/admin/dashboards/default`，套外壳（Sidebar+Navbar）✅
- 4 KPI（MiniStatistics：已发现 KOL/活跃 Campaign/触达率/本月 ROI）+ 1 LineChart（`lineChartOptionsOverallRevenue` 取自 `variables/charts.ts`）✅
- 浅色、console 0 error ✅
- baseline `en-dashboard.png` 入库、1512×982 浅色 ✅
- commit `4869cb6` ✅

---

## 8. 修复指引（给 Generator，F005）

二选一（均 ≤1 轮）：
- **方案 A（推荐，满足原 acceptance）：** 在外壳接入 `SidebarContext.Provider`（承载移动端抽屉 `open/setOpen` 或 `sidebarWidth`），并在 `admin/layout.tsx` / `sidebar/index.tsx` 以 `useContext(SidebarContext)` 消费，替代当前散落的本地 `open` state。
- **方案 B（若确认沿用模板的 vestigial 定位）：** 删除 `src/contexts/SidebarContext.ts` 死代码，并请 **Planner** 修订 F005 acceptance 去除 SidebarContext 一项（Evaluator/Generator 不得单方面弱化 acceptance）。

---

## 9. 环境与边界说明

- 仅 L1 本地验收；无 staging，**[L2] 未执行，待授权**（本批不需要）。
- Node v25.7.0 / npm 10.8.2；无 `.nvmrc`（环境无版本约束，构建/运行全绿，非环境误报）。
- 未修改任何产品代码；新增测试产物：`scripts/test/ds-foundation-verify.mjs`、`tests/screenshots/verify/*.png`。

## 10. Stitch 还原度评估（本批对照 Horizon 模板，非 Stitch）
- 参照物：Horizon 模板本体 `dashboards/default` 浅色渲染（本地读盘）。
- 逐要素核对见 §3；缺失/简化清单：**无真实简化**（MiniStatistics「delta」为 spec 括注对模板原语的文本漂移，非删减）。
- 总体评级：🟢 忠实还原 Horizon 浅色视觉语言。
