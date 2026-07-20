# FE-AUDIT F003 — 设计系统一致性审计（tokens / 样式偏离）

| | |
|---|---|
| **批次 / Feature** | FE-AUDIT / F003（`executor: evaluator`） |
| **审计人** | Andy/evaluator-subagent（隔离上下文，fresh context） |
| **日期** | 2026-07-20 |
| **审计对象** | main HEAD `bab9c10`（`src/` 最后产品变更 `6ec384d`，与线上一致） |
| **判定** | **PASS** |
| **findings** | 34 处（P0 **0** · P1 23 · P2 11），影响 9 个文件 |
| **扫描脚本** | `scripts/test/fe-audit-token-scan.mjs`（可复跑，见 §6） |

---

## 1. 结论摘要

设计系统地基**健康**，未发现阻塞 M0.5 六页工作台开发的问题（**P0 = 0**）。

acceptance 四条硬扫描项中：

- **hardcoded hex / 非 token 色 = 0 处**（项目引入）
- **字体偏离 = 0 处**（仅 DM Sans / Poppins）
- **`dark:` 完整性 = 无缺口**（两种独立方法交叉验证，见 §4.3）
- **shadow / radius 偏离 = 10 处**（radius 本身合规，偏离集中在 shadow）

发现的 34 处 findings 全部为**一致性漂移**（同一视觉意图存在两种写法），而非 token 体系破损。核心问题是**卡片视觉语言分叉**（§4.4）——它不阻塞开发，但 M0.5 会大量堆卡片，现在不收敛则债按页数线性放大。这是本项 F003 的**首要整改建议**。

> **反直觉但重要的结论：** 我一度准备报出「rounded-2xl 偏离 Horizon 卡片 rounded-[20px]」「text-gray-* 缺 dark: 配对」两类大规模 finding，经模板实测词表校准后**证伪并撤回**（§3）。若不做这步校准，本报告会虚报约 60+ 处不存在的债。

---

## 2. 审计方法：为什么不是「全仓 grep hex」

项目 `src/` 共 **174** 个 ts/tsx。直接全仓扫描会把**模板自己的写法**当成项目的债。故先按模板原件做**逐字节分类**：

| 分类 | 数量 | 审计口径 |
|---|---:|---|
| `identical`（与 Horizon UI Pro 3.0.0 原件逐字节相同） | **115** | **不计 finding**——这是模板的写法，不是项目的债 |
| `forked`（改过的模板文件） | **9** | **仅审计项目引入的新增行**，模板原有行不计 |
| `new`（项目自写） | **50** | 全量审计 |

复核命令：

```bash
# 分类依据（逐字节 diff）
diff -q src/<path> "$TEMPLATE_ROOT/src/<path>"
```

实际进入样式扫描的是 **34 个文件**（扣除 `identical`、`src/app/api/**`、`src/lib/**` 等非 UI 层、以及 §2.1 的 2 个豁免文件）。项目自写 UI 面约 **1,000 行 tsx**——盘子小，因此本次除脚本外**逐文件人读复核**，不单纯依赖 grep。

### 2.1 豁免（每条附依据，可审计）

| 文件 | 豁免理由 |
|---|---|
| `src/app/AppWrappers.tsx` | **token 定义源本身**。其 13 处 hex（`#422AFB` 等）就是 `horizon-tokens.md` §1/§2 指定的品牌色阶注入点。在此报「硬编码色」= 把 token 定义当违规 |
| `src/app/preview/agent-canvas/page.tsx` | **确定性视觉基线夹具页**。文件头第 5-6 行自述「供 `tests/visual/agent-canvas.spec.ts` 截确定性基线（**浅色**，viewport ≥1440px）」「独立路由，不套 admin 外壳……保证像素确定」。**刻意不写 `dark:`**，dark 完整性判据不适用 |

> 该页若强行补 `dark:`，会破坏其存在目的（像素确定性）。这是设计意图，不是遗漏——判为 finding 属误报。

spec §4 **D6 白名单**（`map/` 删除 / Chakra 零散原语 / 默认浅色 / `rtl/` unused）**均未计入 finding**。

---

## 3. 校准：被证伪并撤回的两类候选 finding

审计口径必须来自**基线实测**，不是审计人审美（spec §4 D7：不引入 spec 之外的隐式门槛）。以下两类在校准后撤回：

### 3.1 撤回：`rounded-2xl` 属于「圆角偏离」— **证伪**

`horizon-tokens.md` §5 写「卡片/大容器 `rounded-[20px]`」，项目自写卡片用 `rounded-2xl`(16px)，看似偏离。实测模板词表：

```bash
grep -rhoE 'rounded-\[?[0-9a-z]+\]?' "$TEMPLATE_ROOT/src/components" | sort | uniq -c | sort -rn
#  166 rounded-full   108 rounded-xl   74 rounded-[20px]   44 rounded-2xl   42 rounded-lg ...
```

模板自身用 `rounded-2xl` **44 次**——属模板既有词表，**不是偏离**。撤回全部 12 处。
（仅在 §4.4 作为「卡片语言分叉」的组成部分提及，不单独计 finding。）

### 3.2 撤回：`text-gray-*` 缺 `dark:` 配对 — **证伪**

`horizon-tokens.md` §6 列「次要文本 `text-gray-600` → `dark:text-gray-400`」，项目大量 `text-gray-*` 无 `dark:` 配对，看似批量缺口。实测模板：

```bash
grep -rn 'text-gray-600' "$TEMPLATE_ROOT/src/components" | head
# sidebar/index.tsx:119: <p className="text-sm font-medium text-gray-600">   ← 无 dark: 配对
# navbar/NavbarAuth.tsx:60: <p className="text-sm font-medium text-gray-600">  ← 无 dark: 配对
grep -rhoE 'dark:text-gray-[0-9]+' "$TEMPLATE_ROOT/src" | wc -l   # → 仅 7 次（全域）
```

模板 `text-gray-600` 用了 **408 次**，几乎从不配 `dark:`——因为 `gray-600 #A3AED0` 是**双模态可读**的中性色，本就无需配对。§6 表格是理想化表述，非强制。**撤回约 50 处**，`dark:` 配对判据因此**只作用于表面色**（`bg-white` / `bg-gray-*` / `border-gray-*`），不作用于灰阶文本。

---

## 4. Findings（逐项含 文件:行 + 应使用 token）

### 4.1 hardcoded hex / 非 token 色 — **0 处（PASS）**

项目自写 + forked 新增行中，**零**项目引入的硬编码颜色。

唯一命中的 `src/components/navbar/index.tsx:31` `dark:bg-[#0b14374d]` 经溯源为**模板逐字继承**：

```bash
grep -n '0b14374d' "$TEMPLATE_ROOT/src/components/navbar/index.tsx"
# 36:  }  p-2 backdrop-blur-xl dark:bg-[#0b14374d] md:right-[30px] md:top-4 xl:top-[20px]`}
```

模板第 36 行 ≡ 项目第 31 行（前面删了 5 行导致行号偏移），**不计 finding**。
`rgb()/rgba()/hsl()` 字面量：仅 `AppWrappers.tsx:29` 的 `--shadow-100` token 定义（豁免）。

### 4.2 字体偏离 — **0 处（PASS）**

```
font-dm × 1 · font-poppins × 2 ·（无第三字族，无 font-[...] 任意值）
src/Fonts.tsx: font-family: 'DM Sans' × 5（本地 @font-face 声明）
```

无 DM Sans / Poppins 之外的字族。`src/styles/index.css` 全局 `html { font-family: 'DM Sans' !important }` 与 `horizon-tokens.md` §4 一致。

### 4.3 `dark:` 类完整性 — **无缺口（PASS）**

**两种独立方法交叉验证：**

| 方法 | 结果 |
|---|---|
| 方法 A：脚本行级扫描（`checkDarkPairing`） | 项目自写域 **0 缺口** |
| 方法 B：元素感知复核（把多行 `className={...}` 折成单串再判） | 项目自写域 **0 缺口** |

**负控验证（证明检查器没有静默失效）：** 以 `--all` 运行，检查器在刻意浅色的 preview 页 + 模板文件上正确报出 **16 处**——说明「0」是真实结果而非检查器失灵。

```bash
node scripts/test/fe-audit-token-scan.mjs --all --json | ...   # dark-pairing: 16（含 preview 页 6 处）
```

> **已知局限（只会虚报、不会漏报）：** 方法 A 行级判定对多行 `className` 会误报（如模板 `card/index.tsx:10` 的 `bg-white` 与其 `dark:!bg-navy-800` 分处第 10/15 行）。方法 B 消除了该噪音，两法在项目域同为 0，结论稳固。

**深色模式功能可达性**（clause「浅色默认下深色仍可用」）实测通过：

- `src/app/layout.tsx:20` `<body id={'root'}>` — 已无硬编码 `dark`（DS-FOUNDATION F002 决策落实）
- `tailwind.config.js:3` `darkMode: 'class'`
- `src/hooks/useColorMode.ts` — 统一 toggle（`document.body.classList.toggle('dark', dark)`）
- `src/app/admin/layout.tsx:35` `bg-background-100 dark:bg-background-900` — 外壳双写
- 项目自写域 `dark:` 出现 **106 次 / 14 个文件**（`dark:text-white` 41 · `dark:bg-navy-700` 10 · `dark:border-white/10` 8 …）→ 深色是被**主动维护**的，非残留

> **超出本 clause 的观察（不计 finding）：** 深色选择**未持久化**（无 localStorage / cookie），刷新即回浅色。属行为/UX 范畴，非 tokens 一致性；按 D7 不并入本项评分，建议由 Planner 自行决定是否入 backlog。

### 4.4 shadow 偏离 — **10 处（P1）** ← 首要整改项

**判据**（模板实测生产词表）：

```bash
grep -rhoE 'shadow-(3xl|shadow-[0-9]+|sm|md|lg|xl|2xl|none|inset|darkinset)' "$TEMPLATE_ROOT/src/components" | sort | uniq -c | sort -rn
#  75 shadow-none  38 shadow-shadow-500  24 shadow-xl  17 shadow-3xl  16 shadow-2xl  5 shadow-darkinset  4 shadow-shadow-100  2 shadow-inset
grep -rnoE 'shadow-(sm|md|lg)\b' "$TEMPLATE_ROOT/src"   # → 21 处，全部在 app/admin/main/others/buttons/page.tsx（demo 展示页），且全是 shadow-lg
```

→ 模板生产代码中 **`shadow-sm` / `shadow-md` 出现 0 次**。项目引入 10 处：

| # | 文件:行 | 现状 | 应使用 token |
|---|---|---|---|
| 1 | `src/components/copilot/canvas/KolResultCards.tsx:38` | `shadow-sm` + `hover:shadow-md` | `shadow-3xl shadow-shadow-100`（卡片主阴影，`horizon-tokens.md` §5） |
| 2 | `src/components/copilot/ExpertScope.tsx:14` | `shadow-sm` | 同上 |
| 3 | `src/components/copilot/HandoffCollab.tsx:83` | `shadow-sm` | 同上 |
| 4 | `src/components/copilot/CopilotPanel.tsx:78` | `shadow-sm`（气泡） | 气泡可保留轻阴影，但应收敛为统一常量（见下方建议） |
| 5 | `src/components/copilot/CopilotPanel.tsx:148` | `shadow-sm`（气泡） | 同上 |
| 6 | `src/components/copilot/CopilotPanel.tsx:161` | `shadow-sm`（气泡） | 同上 |
| 7 | `src/app/admin/today/page.tsx:25` | `hover:shadow-md` | `hover:shadow-xl shadow-shadow-500`（模板 hover 抬升用 `shadow-xl`） |
| 8 | `src/components/common/Button.tsx:27` | `shadow-md shadow-brand-500/20` | `shadow-xl shadow-brand-500/20`（`shadow-brand-500` 上色本身合规） |
| 9 | `src/components/common/Button.tsx:27` | `hover:shadow-lg` | `hover:shadow-2xl` |
| 10 | `src/components/copilot/canvas/KolResultCards.tsx:38` | `hover:shadow-md` | `hover:shadow-xl` |

**为什么这是首要项 —— 卡片视觉语言分叉：**

项目现在**并存两套卡片写法**：

| | 圆角 | 阴影 | 深色 |
|---|---|---|---|
| `components/card/index.tsx`（模板组件，逐字节未改） | `rounded-[20px]` | `shadow-3xl` + `shadow-shadow-100/500` | `dark:!bg-navy-800 dark:shadow-none` |
| 项目自写卡片（copilot/canvas/today，7 处） | `rounded-2xl` | `shadow-sm` | `dark:bg-navy-700` |

两者单看都在模板词表内（§3.1 已证 `rounded-2xl` 合规），但**同屏并置会出现可见的阴影/圆角/深色底不一致**。M0.5 六页工作台将大量堆叠卡片，若不先收敛，每新增一页复制一次分叉。

**建议（不在本批执行，供 FE-REFACTOR 批次）：** 与 F002「公共组件抽取」合并处理——抽 `src/components/common/SurfaceCard.tsx` 统一卡片语言，或让自写卡片直接复用 `components/card`。工时估算约 0.5–1 人日。

### 4.5 微排版刻度 `text-[<12px]` — **13 处（P1，clause 邻接项）**

> **口径声明：** acceptance 的「字体偏离」字面指**字族**（DM Sans/Poppins 之外），该项已 §4.2 判 PASS。本节是**邻接发现**，按 D7 明确标注其超出字面 clause，供 Planner 分级参考，**不影响 F003 的 PASS 判定**。

**判据：** 模板全域 `text-[Npx]` 用了 76 次，但**最小值为 `text-[15px]`，低于 15px 的出现 0 次**：

```bash
grep -rhoE 'text-\[([0-9]|1[0-4])px\]' "$TEMPLATE_ROOT/src" | wc -l    # → 0
```

项目新造了一套 <12px 微排版刻度（`text-[10px]` ×4 · `text-[11px]` ×5 · `text-[13px]` ×4）：

| 文件:行 | 现状 |
|---|---|
| `src/components/copilot/CopilotPanel.tsx:77, 78, 148, 161` | `text-[13px]`（消息气泡正文） |
| `src/components/copilot/CopilotPanel.tsx:105, 215` | `text-[11px]` |
| `src/components/copilot/canvas/KolResultCards.tsx:59` | `text-[10px]` |
| `src/components/copilot/canvas/KolResultCards.tsx:86` | `text-[11px]` |
| `src/components/copilot/ExpertScope.tsx:18` | `text-[10px]` |
| `src/components/copilot/HandoffCollab.tsx:52` | `text-[11px]` |
| `src/components/project/StagePanel.tsx:24` | `text-[10px]` |
| `src/app/admin/today/page.tsx:29` | `text-[10px]` |
| `src/app/admin/campaigns/page.tsx:21` | `text-[11px]` |

**应使用：** Tailwind 刻度 `text-xs`(12px) / `text-sm`(14px)；若产品确需更密的信息层级，建议**在 `tailwind.config.js` 显式定义命名刻度**（如 `fontSize: { micro: '11px' }`）而非散落 arbitrary 值——否则 M0.5 每页各写各的，刻度无法统一调整。10px 正文另有可读性/可访问性风险。

### 4.6 次要文本 token 漂移 `gray-500` vs `gray-600` — **11 处（P2）**

`horizon-tokens.md` §6 定次要文本 = `gray-600`/`gray-700`；模板实测 `text-gray-600` **408 次** vs `text-gray-500` 仅 7 次。项目自写域反向：`text-gray-500` **13 次**（其中 11 处在非豁免文件）vs `text-gray-600` 8 次。

| 文件:行 | 应使用 token |
|---|---|
| `src/app/admin/campaigns/page.tsx:13` | `text-gray-600` |
| `src/app/admin/today/page.tsx:33, 45, 47` | `text-gray-600` |
| `src/components/copilot/ExpertScope.tsx:28` | `text-gray-600` |
| `src/components/copilot/HandoffCollab.tsx:52, 84` | `text-gray-600` |
| `src/components/copilot/canvas/KolResultCards.tsx:45, 82` | `text-gray-600` |
| `src/components/project/ProjectDetail.tsx:50` | `text-gray-600` |
| `src/components/project/StagePanel.tsx:35` | `text-gray-600` |

注：`gray-500 #B5BED9` 比 `gray-600 #A3AED0` **更浅**，在白底上对比度更低——除一致性外亦轻微影响可读性。纯 token 选择问题，改动零风险。

---

## 5. acceptance 逐条自查

| # | acceptance clause | 判定 | 证据 |
|---|---|---|---|
| 1 | 对照 `horizon-tokens.md` + `tailwind.config.js` + `AppWrappers.tsx` | **达成** | 三源均已读取并作为判据；§4 每项 finding 均回指具体 token 条款（§1/§4/§5/§6） |
| 2 | 扫 hardcoded hex / 非 token 色 | **达成** | §4.1，**0 处**；唯一命中经 diff 溯源为模板逐字继承 |
| 3 | 扫字体偏离（DM Sans/Poppins 之外） | **达成** | §4.2，**0 处**；仅 font-dm/font-poppins，无第三字族 |
| 4 | 扫 shadow / radius 偏离 | **达成** | §4.4，shadow **10 处**；radius 经模板词表校准判定**合规**（§3.1 撤回） |
| 5 | 扫 `dark:` 类完整性 | **达成** | §4.3，**无缺口**；两法交叉验证 + 16 处负控证明检查器有效 + 深色可达性实测 |
| 6 | 逐项偏离给 文件:行 + 应使用的 token | **达成** | §4.4/§4.5/§4.6 全部 34 处均含 `文件:行` + 应使用 token，可逐条复核 |
| 7 | 扫描方法可复跑，脚本落 `scripts/test/` | **达成** | `scripts/test/fe-audit-token-scan.mjs`，使用说明见 §6，含 `--json` / `--all` / `TEMPLATE_ROOT` |
| 8 | 报告落 `docs/test-reports/FE-AUDIT-F003-Andy-evaluator-subagent.md` | **达成** | 本文件 |
| 9 | D6 白名单项不计 finding | **达成** | §2.1，四条白名单均未计入；另附 2 条带依据的额外豁免 |
| 10 | 不修改产品代码 | **达成** | 仅新增 `scripts/test/fe-audit-token-scan.mjs` + 本报告；`git status` 中 `src/` 无改动 |

**综合判定：PASS**（10/10 clause 达成）

---

## 6. 扫描脚本使用说明

**位置：** `scripts/test/fe-audit-token-scan.mjs`（Node ≥18，零依赖）

```bash
# 人读报告（默认：跳过 115 个模板原件文件）
node scripts/test/fe-audit-token-scan.mjs

# 机读 JSON（供 F004 汇总 / 后续 CI 消费）
node scripts/test/fe-audit-token-scan.mjs --json

# 全量模式：含模板原件 + 豁免文件（用于负控验证 / 排查检查器是否失效）
node scripts/test/fe-audit-token-scan.mjs --all

# 模板基线不在默认路径时
TEMPLATE_ROOT=/path/to/horizon-tailwind-react-nextjs-pro-main \
  node scripts/test/fe-audit-token-scan.mjs
```

**退出码恒为 0** —— 这是审计工具，不是 CI 门禁（FE-AUDIT 不修改产品代码、不引入新门禁）。若 FE-REFACTOR 后想转为门禁，可改为「findings > 阈值则非零退出」。

**脚本内建的可审计性：** `TEMPLATE_VOCAB`（模板实测词表）、`EXEMPT_FILES`（豁免 + 逐条理由）、`D6_WHITELIST` 均为脚本内显式常量，输出末尾会打印，口径变化一目了然。

**⚠ 脚本 severity ≠ 报告 severity（避免 F004 误判为矛盾）：** 脚本对 `shadow` / `type-scale` / `muted-text-token` 一律输出保守默认值 `P2`（静态标签，不含上下文判断）。本报告的分级是**审计人结合 M0.5 放大效应后的裁定**：`shadow`(10) + `type-scale`(13) 上调为 **P1**（理由见 §4.4「卡片语言分叉」与 §4.5「每页复制」），`muted-text-token`(11) 维持 **P2**。故 34 = P1 23 + P2 11。以**报告分级为准**。

**已知局限（诚实声明）：**

1. `checkDarkPairing` 为**行级**判定，多行 `className` 会虚报（只虚报、不漏报；§4.3 已用元素感知方法 B 交叉验证）
2. `projectIntroducedLines` 用「整行 trim 后不在模板行集合中」判定新增行 —— 对纯移动/缩进变更的行会略过（保守，倾向少报）
3. 不做 CSS-in-JS / 内联 `style={{}}` 的颜色扫描（项目自写域实测无此用法，人读复核已确认）

---

## 7. 复核入口（供 F004 抽查）

```bash
cd /Users/yixingzhou/project/newkolmatrix
export TEMPLATE_ROOT=~/project/db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/horizon-tailwind-react-nextjs-pro-main

# 1) 复现全部 34 findings
node scripts/test/fe-audit-token-scan.mjs

# 2) 复核「hardcoded hex = 0」：唯一命中确为模板继承
grep -n '0b14374d' "$TEMPLATE_ROOT/src/components/navbar/index.tsx"

# 3) 复核 §3.1 撤回（rounded-2xl 是模板词表）
grep -rhoE 'rounded-2xl' "$TEMPLATE_ROOT/src/components" | wc -l      # → 44

# 4) 复核 §3.2 撤回（模板 text-gray-600 不配 dark:）
grep -rhoE 'text-gray-600' "$TEMPLATE_ROOT/src" | wc -l               # → 408
grep -rhoE 'dark:text-gray-[0-9]+' "$TEMPLATE_ROOT/src" | wc -l       # → 7

# 5) 复核 §4.4 判据（模板生产代码无 shadow-sm/md）
grep -rnoE 'shadow-(sm|md)\b' "$TEMPLATE_ROOT/src" | wc -l            # → 0

# 6) 复核 §4.5 判据（模板无 <15px arbitrary 字号）
grep -rhoE 'text-\[([0-9]|1[0-4])px\]' "$TEMPLATE_ROOT/src" | wc -l   # → 0

# 7) 负控（证明 dark-pairing 检查器有效）→ 应输出 16
node scripts/test/fe-audit-token-scan.mjs --all --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log((JSON.parse(s).byCheck["dark-pairing"]||[]).length))'
# 注：勿用 `grep -c '"check": "dark-pairing"'` —— JSON 中 findings 同时出现在 byCheck 与 findings 两处，
#     该写法会得到 32（= 16×2）。此坑已实测确认。
```

---

## 8. 整改建议汇总（供 F004 分级 / Planner 并入 backlog）

> Evaluator 不写 `backlog.json`；以下仅为建议输入。

| 建议 | 关联 finding | 影响面 | 估算 | 建议时机 |
|---|---|---|---:|---|
| **统一卡片视觉语言**（抽 `common/SurfaceCard` 或复用 `components/card`），消除 shadow/radius/深色底分叉 | §4.4（10 处） | 7 个自写卡片 | 0.5–1 人日 | **M0.5 之前**（与 F002 合并执行性价比最高） |
| **微排版刻度命名化**：`tailwind.config.js` 定义 `fontSize.micro` 等，替换散落 `text-[10/11/13px]` | §4.5（13 处） | 9 个文件 | 0.5 人日 | M0.5 之前（否则每页复制） |
| **次要文本统一 `gray-600`** | §4.6（11 处） | 7 个文件 | 0.25 人日 | 可随手做，零风险 |
| （可选，超出 F003 clause）深色模式持久化 localStorage | §4.3 观察 | 1 个 hook | 0.25 人日 | 由 Planner 判断是否入池 |

**合计约 1.5–2 人日**，且三项均可与 F002 公共组件抽取合并施工。

---

_署名：Andy/evaluator-subagent · FE-AUDIT F003 · 隔离验收，结论未经编排者改写_
