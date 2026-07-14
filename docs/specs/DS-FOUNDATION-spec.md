# DS-FOUNDATION — 设计系统地基规格

> **批次 ID：** DS-FOUNDATION
> **类型：** 新功能批次（UI 地基） — 硬性要求 spec
> **状态机流转：** planning → building → verifying → fixing ⟷ reverifying → done
> **Spec lock：** 2026-07-13，Planner Andy，用户批准
> **参照物根目录：** `db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/horizon-tailwind-react-nextjs-pro-main/`（Horizon UI Pro 模板，已 gitignore，本地读盘）

---

## 1. 背景与目标

KOLMatrix 是旧项目 `kolmatrix`（已实现 MVP）的全面重构。重构动因：(1) 前端样式需替换为 Horizon UI Pro 付费模板风格，旧项目框架差异大无法原地替换；(2) 旧项目偏传统 SaaS 交互，与「AI 驱动的 KOL 营销平台」定位差异大，需重构 UX 与流程。

本项目**尚未 scaffold**（无 `src/` / `package.json`）。按经验教训铁律「新项目含 UI，第一个批次必须是设计系统」，本批次 = **scaffold 应用 + 建立设计系统地基**，为后续所有业务页面提供统一基座。

**本批次目标（一句话）：** 以 Horizon UI Pro 为基座 scaffold KOLMatrix 应用，建立浅色设计系统、布局外壳、基础组件集与公共 hook，产出一个可运行、风格忠实 Horizon 的地基。

---

## 2. 功能范围

**In scope：**
- 从 Horizon 模板 scaffold Next.js 应用（复制框架 + 删 demo 业务页）
- 浅色默认 theme + 设计 token 体系文档化（深色 toggle 保留）
- 布局外壳（Sidebar + Navbar + Footer）+ KOLMatrix 品牌与最小导航
- 基础组件集（保留模板原语 + 抽出可复用 Button）
- 公共 hooks / contexts / utils
- 一个占位 Dashboard 页（端到端验证整栈 + visual baseline）

**Out of scope（明确不做，留后续批次）：**
- 任何真实业务页面（Discovery / Database / Campaigns / Outreach 等）—— 本批仅占位导航
- 后端 / 数据库 / 认证真实逻辑（前端优先）
- 测试 runner 正式配置（vitest / Playwright 自动化）—— 本批 baseline 用手动截图入库即可
- 依赖精简（模板 deps 先全保留，pruning 入 backlog）
- 品牌色定制（先沿用 Horizon 紫）
- i18n / next-intl（后续批次）

---

## 3. 关键设计决策

| # | 决策 | 依据 |
|---|---|---|
| D1 | **设计系统 = Tailwind + CSS 变量，非 Chakra theme** | 模板无 `src/theme/` / `ChakraProvider` / `extendTheme`；Chakra 仅零散原语。token 工作落在 `tailwind.config.js` + `AppWrappers.tsx` CSS 变量 |
| D2 | **默认浅色** | 用户偏好（旧项目最终切浅色）。实装 = 去除 `src/app/layout.tsx` 的 `<body className="dark">`；深色 toggle 不删 |
| D3 | **品牌沿用 Horizon 紫** | 用户决定。主色 `--color-500 #422AFB`，400 步 `#7551FF`。不改色阶，定制留后续 |
| D4 | **以模板为基座（skeleton 模式）** | 用户决定。复制模板核心 → 删 demo → 迭代。最快、最忠实还原，非从零脚手架 |
| D5 | **沿用模板导入约定** `baseUrl: src` 裸导入（`components/...` / `routes`） | skeleton 模式最小化 churn；不引入 `@/` 别名以免与模板既有代码冲突 |
| D6 | **模板 deps 先全保留** | pruning（fullcalendar / mapbox / nft 相关）风险高、非地基必需，入 backlog |
| D7 | **React 19 RC + TS 4.9 先照模板** | 模板原生版本；升级留后续，避免地基批次引入不确定性 |
| D8 | **车道 = 快车道；building 串行；verifying 单 evaluator subagent** | 见 §6 |

---

## 4. UI Fidelity 硬要求（适配地基批次）

> `framework/patterns/ui-fidelity-guardrail.md` 原为「Stitch 原型页逐像素还原」而写。本批是**地基**批次、无业务页可还原，故 §2.3「不得简化」的语义调整为「不得丢失 Horizon 视觉语言要素」；参照物由 Stitch HTML 改为 **Horizon 模板本体**（真实 React 源码 + 浏览器渲染，比 Stitch 更高保真）。

### 4.1 参照物（§2.1）
- 主参照：Horizon 模板源码 `db4rDjuaSCqaEFW9XcFo_.../horizon-tailwind-react-nextjs-pro-main/`（VS Code 读源码 + `npm run dev` 浏览器渲染看视觉）
- 地基视觉基准页：模板 `src/app/admin/dashboards/default`（**浅色模式**渲染）—— F006 占位 dashboard 对齐此视觉语言

### 4.2 必用 / 建立的公共组件（§2.2）
- 保留模板原语：`Card`（`components/card/index.tsx`）、`MiniStatistics`、`InputField` / `TextField` / `SwitchField`、`checkbox` / `radio` / `switch`、badge（`dataDisplay/SessionBadge`）、`Dropdown`、`Tooltip`
- 本批**新建**：可复用 `Button` 组件（见 F004）
- 图表封装：`components/charts/*`（ApexCharts class 组件，options 形状取自 `variables/charts.ts`）

### 4.3 不得简化的要素（§2.3）—— 地基视觉语言（逐条核 Horizon 渲染）
Generator 若认为某项应简化，须发 pre-impl 审计请求，不得自行删：
- [ ] 卡片阴影 `shadow-3xl`（不得改为无阴影 / border-only）
- [ ] 卡片圆角 `rounded-[20px]` / 控件圆角 `rounded-xl`
- [ ] 字体：DM Sans（正文）+ Poppins（品牌 / 标题）—— 不得替换为系统字体
- [ ] brand 紫色 CSS 变量色阶（`--color-50..900`）—— 不得改色
- [ ] Sidebar mini / hover 折叠交互 + 响应式 margin 切换（`xl:ml-[313px]` ⟷ `xl:ml-[142px]`）
- [ ] Navbar 全部元素：面包屑 + 搜索 pill + 通知 Dropdown + 配置齿轮 + 色彩 toggle + 头像 Dropdown
- [ ] KPI 卡 `MiniStatistics` 结构（icon box + label + value + delta）
- [ ] 深色 toggle 能力（浅色默认，但深色不得删除）

### 4.4 Visual baseline（§2.4，硬要求）
- `tests/screenshots/baseline/en-dashboard.png` 必须入 git（F006 产出）
- `git ls-files tests/screenshots/baseline/en-dashboard.png` 返回非空才算 F006 完成
- 地基批次允许**手动截图**入库（Playwright 自动化留后续测试批次）；截图为浅色模式、桌面分辨率（≥1440px 宽）

---

## 5. Feature 明细

> 全部 `executor: generator`。commit tag 格式 `feat(DS-FOUNDATION-F00N): ...`，须对应本文件 feature 号（铁律 10）。

### F001 — 从 Horizon 模板 scaffold 应用（priority: high）

**实现：** 把模板 `horizon-tailwind-react-nextjs-pro-main/` 的框架文件复制到 repo 根，删除 demo 业务页，解决安装 / 构建冲突。

- 复制（保留框架）：`src/app/`（root `layout.tsx` / `AppWrappers.tsx` / `page.tsx` / `admin/layout.tsx` / `auth/layout.tsx`）、`src/components/`（**除** `components/admin/*` demo 组合件）、`src/contexts/` / `src/styles/` / `src/types/` / `src/utils/` / `src/variables/`（含 `charts.ts`）、`src/Fonts.tsx`、`src/routes.tsx`、`public/`（框架必需资产）；配置文件 `package.json` / `tsconfig.json` / `tailwind.config.js` / `next.config.js` / `postcss.config.js` / `prettier.config.js` / `.eslintrc.json` / `.npmrc`
- 删除 demo 业务页：`src/app/admin/dashboards/{car-interface,smart-home}`、`src/app/admin/nfts/`、`src/app/admin/main/`、`src/app/rtl/`、`src/app/auth/*` 的多余变体、`src/components/admin/*`（保留模板 `admin/dashboards/default` 作 F006 改编基）
- `package.json`：name 改 `kolmatrix`；scripts 至少含 `dev` / `build` / `start` / `lint` / `typecheck`(`tsc --noEmit`)；去除 gh-pages `deploy`/`predeploy`/`export`

**Acceptance：**
- [ ] repo 根出现 Next.js 应用结构（`src/app` / `src/components` / `package.json` 等）
- [ ] demo 业务页已删除（nfts / main/* / car-interface / smart-home / rtl / 多余 auth / components/admin）
- [ ] `npm install` 成功
- [ ] `npm run dev` 在 :3000 提供页面（不白屏、无致命运行时报错）
- [ ] `npm run build` 通过 且 `npm run typecheck`(`tsc --noEmit`) 通过 且 `npm run lint` 无 error（warning 可接受）
- [ ] Horizon 模板源目录 `db4rDjuaSCqaEFW9XcFo_.../` 仍在 `.gitignore`，未被本 feature 提交
- [ ] commit `feat(DS-FOUNDATION-F001): ...`

### F002 — 浅色默认 theme + token 体系文档化（priority: high）

**实现：** 去 dark 默认改浅色；沿用 Horizon 紫；把 token 体系落文档。

**Acceptance：**
- [ ] `src/app/layout.tsx` 去掉 `<body className="dark">` → 应用默认浅色（app bg = `lightPrimary #F4F7FE` / `#FFFFFF`）
- [ ] 深色 toggle（navbar Configurator / `FixedPlugin`）仍能切到深色且不报错
- [ ] 品牌主色沿用 Horizon 紫（`--color-500 #422AFB`），未改动 `--color-*` 色阶
- [ ] `design-draft/horizon-tokens.md` 落盘，记录：(a) `tailwind.config.js` 命名色（lightPrimary / navy / gray / brand / horizon* presets + 精确 hex）(b) CSS 变量色阶 `--color-50..900` + `--background-100/900` + `--shadow-100`（含默认紫 preset 值）(c) 字体 DM Sans / Poppins (d) 阴影 `shadow-3xl`/`inset` + 圆角 `rounded-[20px]`/`rounded-xl` 约定
- [ ] commit `feat(DS-FOUNDATION-F002): ...`

### F003 — 布局外壳 + KOLMatrix 品牌与导航（priority: high）

**实现：** 外壳复用模板 `admin/layout.tsx`；品牌与导航改 KOLMatrix。

**Acceptance：**
- [ ] Sidebar 品牌文本 "Horizon PRO" → "KOLMatrix"（logo / 品牌区）
- [ ] `src/routes.tsx` 改为 KOLMatrix 最小 IA：Dashboard 项指向占位 dashboard；KOLMatrix 模块（建议 Discovery / Database / Campaigns / Outreach）作占位导航项（coming-soon 或 disabled + tooltip，**不得留 active 但无反应的幽灵项**）；删除模板 NFT / Ecommerce / Users 等 demo 导航组
- [ ] 外壳渲染正常：Sidebar mini / hover 折叠、响应式 margin 切换、Navbar（面包屑 + 搜索 pill + 通知 + 配置 + 色彩 toggle + 头像）可见
- [ ] 无死链导致的运行时报错（浅色下）
- [ ] commit `feat(DS-FOUNDATION-F003): ...`

### F004 — 基础组件集 + 抽可复用 Button（priority: medium-high）

**实现：** 保留模板原语；从模板 button 目录（`app/admin/main/others/buttons` 的 class 串）抽出统一 Button 组件。

**Acceptance：**
- [ ] 保留可用的模板原语：`Card` / `MiniStatistics` / `InputField` / `TextField` / `SwitchField` / `checkbox` / `radio` / `switch` / badge / `Dropdown` / `Tooltip`（浅色下渲染正常）
- [ ] 新增 `src/components/common/Button.tsx`（或模板一致位置），≥5 variants：`primary`(gradient `from-brand-400 to-brand-600`) / `solid`(`bg-brand-500 hover:bg-brand-600`) / `ghost` / `secondary` / `danger`；支持 `size`(sm/md/lg) + `disabled` + `loading`
- [ ] Button 在占位 dashboard 或组件 showcase 中被**实际使用**（非幽灵）
- [ ] commit `feat(DS-FOUNDATION-F004): ...`

### F005 — 公共 hooks + contexts + utils（priority: medium）

**Acceptance：**
- [ ] `ConfiguratorContext`（mini/theme/hovered/contrast + setters）与 `SidebarContext`（toggleSidebar/width）正常提供并被外壳消费
- [ ] `utils/navigation.ts` 的 `getActiveRoute` / `getActiveNavbar` 正常工作
- [ ] 补充 ≥1 个有实际用途的公共 hook（如 `src/hooks/useColorMode.ts` 封装 dark class 切换、或 `useMediaQuery.ts`）并被引用
- [ ] commit `feat(DS-FOUNDATION-F005): ...`

### F006 — 占位 Dashboard 页（端到端验证 + visual baseline）（priority: high）

**实现：** 由模板 `admin/dashboards/default` 改编为 KOLMatrix 占位 dashboard，验证整栈打通。

**Acceptance：**
- [ ] root `/`（或经 redirect）渲染 KOLMatrix 占位 dashboard，套用外壳（Sidebar + Navbar）
- [ ] 页面含 3-4 个 KPI 卡（`MiniStatistics`，KOLMatrix 语义占位：如「已发现 KOL / 活跃 Campaign / 触达率 / 本月 ROI」）+ ≥1 个 ApexChart（`LineChart` 或 `BarChart`，options 取 `variables/charts.ts` 形状，占位数据）
- [ ] 浅色模式；浏览器 console 无 error
- [ ] visual baseline `tests/screenshots/baseline/en-dashboard.png` 入 git（`git ls-files` 返回非空）；浅色、≥1440px 宽
- [ ] commit `feat(DS-FOUNDATION-F006): ...`

---

## 6. 车道与编排

- **车道：** 快车道（单机 Andy 单会话）。不命中慢车道条件（无跨机器 role_assignments / 非跨多日 / 用户未要求独立实例验收）。
- **building：** **串行**（主上下文逐条）。各 feature 高度共享 scaffold —— F001 建立全部结构，F002-F006 依赖之且触碰文件集重叠，不满足并行三条件（orchestration §3），故不并行。
- **verifying：** **单个隔离 evaluator subagent**。地基是一个整体交付物（scaffold 能跑 + 浅色 + 忠实 Horizon 视觉），feature 虽 6 条但紧耦合，无需 fan-out。
- **fixing ⟷ reverifying：** 标准循环。

---

## 7. 验收总纲（Evaluator 参考）

- **构建门：** `npm install` → `npm run build` → `npm run typecheck` → `npm run lint` 全过
- **运行门：** `npm run dev` :3000 起，`/` 渲染占位 dashboard，浅色，console 无 error
- **视觉门：** 对照 §4.3「不得简化」逐条核（浏览器并排 Horizon 模板浅色渲染 vs KOLMatrix `/`）；baseline PNG 入库（§4.4）
- **深色回归：** toggle 切深色不崩
- **License 门：** `git ls-files | grep db4rDjuaSCqaEFW9XcFo` 为空（付费模板源目录未入库）
- signoff 报告落 `docs/test-reports/DS-FOUNDATION-signoff-YYYY-MM-DD.md`
