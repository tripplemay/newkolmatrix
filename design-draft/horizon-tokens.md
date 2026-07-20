# KOLMatrix 设计 Token 参考（Horizon UI Pro 基座）

> **来源：** DS-FOUNDATION F002。KOLMatrix 基于 Horizon UI Pro 模板重构。
> **设计系统驱动方式：** **Tailwind 配置（静态色板）+ 运行时 CSS 变量色阶**（`src/app/AppWrappers.tsx` 注入）。**不是 Chakra theme**（模板无 `src/theme/` / `ChakraProvider` / `extendTheme`）。
> **默认色彩：** 浅色（F002 已去除 `src/app/layout.tsx` 的 `<body className="dark">`）；深色仍可用，由 navbar Configurator / FixedPlugin 的 toggle 向 `body` 追加 `dark` class（Tailwind `darkMode: 'class'`）。
> **改 token 去哪：** 静态命名色 → `tailwind.config.js`；品牌色阶（运行时可换）→ `AppWrappers.tsx` 的 `theme` state（+ `navbar/Configurator.tsx` 的 6 套预设）。

---

## 1. 品牌主色（brand，运行时 CSS 变量驱动）

Tailwind `brand.*` 映射到 CSS 变量 `--color-*`，默认值在 `AppWrappers.tsx` 注入（Horizon 紫）。**主色 = `brand-500 #422AFB`**。

| Tailwind | CSS 变量 | 默认值(紫) | 用途 |
|---|---|---|---|
| `brand-50` | `--color-50` | `#E9E3FF` | 极浅底 / hover 底 |
| `brand-100` | `--color-100` | `#C0B8FE` | |
| `brand-200` | `--color-200` | `#A195FD` | |
| `brand-300` | `--color-300` | `#8171FC` | |
| `brand-400` | `--color-400` | `#7551FF` | gradient 起点 / 浅主色 |
| **`brand-500`** | `--color-500` | **`#422AFB`** | **主品牌色**（按钮/链接/高亮） |
| `brand-600` | `--color-600` | `#3311DB` | hover / gradient 终点 |
| `brand-700` | `--color-700` | `#2111A5` | |
| `brand-800` | `--color-800` | `#190793` | |
| `brand-900` | `--color-900` | `#11047A` | 深强调 |

主 CTA 渐变约定：`bg-gradient-to-br from-brand-400 to-brand-600`。
换品牌色：改 `AppWrappers.tsx` 的 `theme` state 十个 `--color-*`（Configurator 另存 Purple/Green/Orange/Red/Blue/Teal 六套预设可切换）。

## 2. 背景与阴影变量（运行时）

| Tailwind | CSS 变量 | 默认值 | 用途 |
|---|---|---|---|
| `bg-background-100` | `--background-100` | `#FFFFFF` | **浅色 app 底** |
| `bg-background-900` | `--background-900` | `#070f2e` | 深色 app 底 |
| `shadow-shadow-100` | `--shadow-100` | `rgba(112,144,176,0.08)` | 卡片柔和阴影 |

另有静态 `lightPrimary #F4F7FE`（浅色页面次级底）。

## 3. 中性色板（静态，`tailwind.config.js`）

- **gray**（文本/边框）：`gray-700 #707eae`（次要文本）· `gray-900 #1B2559`（深文本）· `gray-200 #DADEEC`（边框）· `gray-600 #A3AED0`
- **navy**（深色模式表面）：`navy-900 #0b1437`（app 底）· `navy-800 #111c44`（卡片）· `navy-700 #1B254B`(输入框) · `navy-50 #d0dcfb`
- 语义强调（Horizon 版）：`horizonGreen-500 #01B574`（成功）· `horizonOrange-500 #FFB547`（警告）· `horizonRed-500 #E31A1A`（危险）· `horizonBlue-500 #3965FF` · `horizonTeal-500 #33C3B7`
- 标准 Tailwind 色（red/orange/amber/green/teal/blue/indigo/purple/pink 等 50-900）均可用。

## 4. 字体（typography）

| Tailwind | 字族 | 用途 | 加载 |
|---|---|---|---|
| `font-dm` | **DM Sans** | **正文默认**（`body` 全局 `!important`，`index.css`） | Google Fonts `@import` + 本地 `@font-face`（`public/fonts/dm-sans/*.ttf`，`src/Fonts.tsx`） |
| `font-poppins` | **Poppins** | 品牌 logo / 大标题 | Google Fonts `@import`（`index.css`） |

字重：DM Sans 400/500/700；Poppins 100–800。全局 `letter-spacing: -0.2px`（`index.css`）。

## 5. 阴影 / 圆角 / 断点

**boxShadow（`tailwind.config.js`）：**
- `shadow-3xl` = `14px 17px 40px 4px`（卡片主阴影，配 `shadow-shadow-100`/`shadow-shadow-500` 上色）
- `shadow-inset` = `inset 0px 18px 22px` · `shadow-darkinset` = `0px 4px 4px inset`

**圆角约定（Tailwind 内置刻度）：**
- 卡片 / 大容器：`rounded-[20px]`（见 `components/card/index.tsx`）
- 控件（按钮 / 输入 / chip）：`rounded-xl`（12px）/ `rounded-full`（药丸）

**断点（自定义 `screens`，每个另有 `-max` 变体）：**
`sm 576 · md 768 · lg 992 · xl 1200 · 2xl 1320 · 3xl 1600 · 4xl 1850`（px）。
布局外壳响应式主断点 `xl`（sidebar 折叠 margin：`xl:ml-[313px]` ⟷ `xl:ml-[142px]`）。
另有 `w-1p..w-99p` 百分比宽度工具类。

## 6. 浅色 vs 深色 表面速查

| 元素 | 浅色 | 深色（`.dark`） |
|---|---|---|
| app 底 | `bg-background-100`(#FFFFFF) / `lightPrimary`(#F4F7FE) | `bg-background-900`(#070f2e) / `navy-900` |
| 卡片 | `bg-white` + `shadow-3xl` | `dark:bg-navy-800` |
| 主文本 | `text-navy-700` | `dark:text-white` |
| 次要文本 | `text-gray-600` / `text-gray-700` | `dark:text-gray-400` |

写组件时用 `X dark:Y` 双写保证深色回归（如 `bg-white dark:bg-navy-800`）。

## 7. 微排版命名刻度（FE-REFACTOR F005 新增，项目扩展）

模板全域最小 arbitrary 字号为 `text-[15px]`（<15px 出现 0 次）；项目自建 UI 需要更小的微字号，统一经 `tailwind.config.js` 的 `fontSize` 命名刻度，**禁止散落 `text-[10px]` 等 arbitrary 值**：

| Token | 值 | 用途 |
|---|---|---|
| `text-mini` | 10px | 徽标 xs（`common/Badge`）/ 分类 chip |
| `text-micro` | 11px | 面板副标题（`common/PanelHeader`）/ 工具行 / 交接物行 |
| `text-compact` | 13px | 对话气泡正文（`common/ChatBubble`） |

仅设 font-size（不绑 line-height），与被替换的 arbitrary 值像素等价。这是 `tailwind.config.js` 首次有意偏离「与模板逐字节相同」（FE-AUDIT F001 正面项 → 有意扩展，理由记录于 FE-REFACTOR spec §2 F005）。

---

_修订：改静态色/断点/阴影 → `tailwind.config.js`；改品牌运行时色阶 → `AppWrappers.tsx` + `Configurator.tsx`；改字体 → `index.css` + `Fonts.tsx`。_
