# P2-CLEANUP F002 验收报告 — 深色模式持久化（BL-FE-12）

| 项 | 值 |
|---|---|
| **批次 / Feature** | P2-CLEANUP / F002 |
| **标题** | 深色模式持久化（BL-FE-12）— localStorage + pre-paint 内联脚本 |
| **验收阶段** | verifying（首轮） |
| **Evaluator** | Andy/evaluator-subagent（隔离上下文，fresh context） |
| **验收日期** | 2026-07-21 |
| **被测 commit** | `3c98a7a`（F002 实装）；仓库 HEAD `e01424c`，working tree 除测试产物外干净 |
| **测试层级** | L1（本地 standalone 生产产物 + 真实 Chromium） |
| **结论** | **PASS**（7/7 acceptance 全部满足） |

---

## 1. 验收环境

遵循 `framework/patterns/testing-env-patterns.md` §7 —— UI 实测走 standalone 生产产物，不走 `next dev`。

```
产物：本机既有 .next/standalone（未重建，避免破坏并行验收共用产物）
服务：PORT=3102 node scripts/serve-standalone.mjs   → ✓ Ready in 142ms
基址：BASE=http://127.0.0.1:3102
路由：/admin/today（HTTP 200）
浏览器：Playwright Chromium headless，viewport 1440x900
```

**L1 环境前置排查（排除已知误报）：**

- pattern §3（prisma generate）：本 feature 不触 Prisma，`tsc` 无 PrismaClient 类误报，不适用。
- pattern §4（Node 版本 × jsdom localStorage）：本机 `node -v` = **v25.7.0**，仓库**无 `.nvmrc`**。该 pattern 的误报路径是 *jsdom shim × Node native localStorage 互斥*；**本次全部 localStorage 断言跑在真实 Chromium 页面上下文内（`page.evaluate`），不经 Node/jsdom**，故该坑不适用，不构成误报风险。
- pattern §7（dev vs standalone）：已按规避，走 standalone。

## 2. 逐条 acceptance 对照

| # | acceptance 原文 | 判定 | 实测依据 |
|---|---|---|---|
| 1 | `useColorMode` 增持久层（`setDark`/`toggle` 写入 localStorage，挂载读回） | **PASS** | 代码：`src/hooks/useColorMode.ts:31-37` `writeStoredMode` 在 `setDark:54-59` 内调用，`toggle:61-64` 委托 `setDark`；`:42-52` 挂载 effect 经 `readStoredMode` 读回并 `classList.toggle`。实测：T3/T4 切换后 `localStorage` 立刻为 `dark`/`light`；刷新后状态被读回还原 |
| 2 | `layout.tsx` 的 `<body>` 首子节点补 pre-paint 内联脚本，paint 前置 `body.dark` 消除闪烁 | **PASS** | 源码 `src/app/layout.tsx:28` `<script>` 确为 `<body>` 的**首个 JSX 子节点**。实测服务端 HTML 中其前仅有 Next 自注入的**空 `<div hidden="">`**（见 §4 注 A，无可见内容、无脚本，不影响执行时机）。时序硬证据：T7 `darkAt=8.6ms` / `readyState='loading'`，应用首次渲染 `<main>` 在 `appAt=369.9ms` —— 深色早于应用首帧 **43 倍量级**；且 `<main>` 一出现其计算背景即 `rgb(11, 20, 55)`（深色），从未出现浅色帧 |
| 3 | 键名与取值按 D1（`kolmatrix.colorMode` / `'light'\|'dark'`）并在 commit message 记录 | **PASS** | `useColorMode.ts:16` `COLOR_MODE_STORAGE_KEY = 'kolmatrix.colorMode'`；`:18` `type StoredMode = 'light' \| 'dark'`；`layout.tsx:19` 内联脚本用同一字面量键。commit `3c98a7a` 正文首段逐字记录：「存储契约（spec D1，此处记录）：键 `kolmatrix.colorMode`，取值 'light' \| 'dark'」 |
| 4 | 缺省 / 损坏值一律回落浅色（默认不变，不动现有浅色基线） | **PASS** | T2 全新 context 默认浅色且**未切换前不写 localStorage**（实得 `null`）；T5 清空后回落浅色；T6 **6 种损坏值矩阵**（`DARK`/`Dark`/空串/`true`/`{"mode":"dark"}`/`dark␠` 带尾空格）逐个刷新**全部**回落浅色 —— `:24` 严格全等只认两个字面量，无 `trim`/大小写宽松匹配。浅色基线未动：全批 4 张 PNG 变更均归 F004/F005（见 §4 注 B） |
| 5 | 死代码 Configurator / RTL / FixedPlugin 不碰（D6） | **PASS** | `git diff --name-only 8248ab6..HEAD` 对三文件均返回空；全批 `src/` 仅改 7 个文件，无一为死代码组件 |
| 6 | 实测：切深色→刷新仍深色 / 切浅色→刷新仍浅色 / 清 localStorage 或损坏值→回落浅色 / 刷新无浅色闪烁 | **PASS** | 四条全部浏览器实测通过（T3/T4/T5/T6/T7），详见 §3 输出。「无闪烁」另配 **T8 活性证明**：剔掉内联脚本重放后 `readyAtDark` 由 `'loading'` 变为 `'complete'`、深色不再早于应用首渲染 —— 证 T7 非恒真死断言 |
| 7 | lint + tsc 绿 | **PASS** | `npx tsc --noEmit` → 退出码 0，零输出；`npx next lint` → `✔ No ESLint warnings or errors`（仅有 Next 16 弃用提示，与本 feature 无关） |

**结论：7/7 满足 → PASS。**

## 3. 实测命令与输出

### 3.1 Evaluator 独立探针（本次新增，非复用 Generator 脚本）

`scripts/test/p2-cleanup-f002-eval-probe.mjs` —— 与 Generator 的
`p2-cleanup-f002-colormode-persist.mjs` **口径不同**：损坏值由 1 种扩到 6 种矩阵；「无闪烁」
从「延迟 chunk 看 hydrate 前状态」的间接推断改为 **`body.dark` 落地时刻 vs 应用首次渲染
`<main>` 时刻**的直接时序比较，并补 `<main>` 首屏计算背景色直证；另增 localStorage 抛异常的降级路径。

```
$ BASE=http://127.0.0.1:3102 node scripts/test/p2-cleanup-f002-eval-probe.mjs

  PASS  T1 pre-paint 内联脚本存在于服务端 HTML
  PASS  T1 内联脚本位于 <body> 内（非 <head>）
  PASS  T1 脚本之前无任何可见内容（仅 Next 注入的空 hidden div）
        — 实际前置内容="<div hidden=\"\"><!--$--><!--/$--></div>"
  PASS  T2 全新 context 默认浅色
  PASS  T2 未切换前不写 localStorage — 实得=null
  PASS  T3 点击后即时深色
  PASS  T3 localStorage 写入 dark — 实得=dark
  PASS  T3 刷新后仍深色
  PASS  T3 刷新后持久值未被覆写 — 实得=dark
  PASS  T4 切回即时浅色
  PASS  T4 localStorage 写入 light — 实得=light
  PASS  T4 刷新后仍浅色
  PASS  T5 清 localStorage 后刷新回落浅色
  PASS  T6 损坏值 "DARK" 回落浅色
  PASS  T6 损坏值 "Dark" 回落浅色
  PASS  T6 损坏值 "" 回落浅色
  PASS  T6 损坏值 "true" 回落浅色
  PASS  T6 损坏值 "{\"mode\":\"dark\"}" 回落浅色
  PASS  T6 损坏值 "dark " 回落浅色
  PASS  T7 时序观测器安装成功（否则本组结论无效）
  PASS  T7 观测到 body 取得 dark
  PASS  T7 观测到应用首次渲染出 <main>
  PASS  T7 深色早于应用首次渲染（应用从未出现浅色帧） — darkAt=8.6ms appAt=369.9ms
  PASS  T7 深色落地时文档仍在 loading（证明由解析期内联脚本置入，非 React 挂载后补）
        — readyState=loading
  PASS  T7 应用首屏 <main> 背景即深色 — 实得=rgb(11, 20, 55)
  PASS  T8 抽掉内联脚本后深色不再早于应用首渲染（T7 断言是活的，不是恒真）
        — darkAt=705.6ms appAt=705.6ms readyAtDark=complete
  PASS  T9 localStorage 抛异常时无未捕获页面错误
  PASS  T9 localStorage 不可用时回落浅色
  PASS  T9 存储不可用不阻断切换本身（降级为不持久）

=== F002 Evaluator 独立探针：29 passed, 0 failed ===
```

**连跑 2 次均 29/29 绿**（抗抖动）。

### 3.2 「无闪烁」判据的选型说明（负面结果如实记录）

首版 T7 曾用 `PerformancePaintTiming`（`performance.getEntriesByType('paint')`）作判据，
**实测在 headless Chromium 下基线组恒返回空数组**，导致断言假红。**这是探针工具问题，不是产品缺陷**——
已改判据并复测。改用的等价事实链在本应用成立且更强：

> 全站 `NoSSR (ssr:false)`，服务端 HTML 只含 `BAILOUT_TO_CLIENT_SIDE_RENDERING` 占位（已在 §4 注 A 的
> HTML 摘录中确证），应用的第一个像素只可能来自 React 客户端渲染出 `<main>` 之后。
> 故「`body.dark` 早于 `<main>` 出现」⇔「应用从未渲染过浅色帧」。

实测 `8.6ms`（`readyState='loading'`，HTML 仍在解析）vs `369.9ms`（`<main>` 出现），
两者差 361ms，且首个 `<main>` 的计算背景直读即为深色 `rgb(11, 20, 55)`。

### 3.3 活性证明（框架 v1.0.6 —— 防「假绿」）

T8 把内联脚本从响应 HTML 中正则剔除后同条件重放：

| 组别 | `darkAt` | `readyAtDark` | `appAt` | 含义 |
|---|---|---|---|---|
| 基线（有脚本） | 8.6ms | `loading` | 369.9ms | 解析期置入，早于应用首帧 |
| 变异（抽掉脚本） | 705.6ms | **`complete`** | 705.6ms | 退化为 React 挂载后才补，与首渲染同批次 |

变异后 T7 判据翻红 → **T7 测的确实是这段内联脚本**，非恒真断言。变异仅作用于网络响应，
未触碰任何磁盘文件（`git status` 对 `src/` 干净）。

### 3.4 交叉复核 Generator 探针

独立复跑 Generator 自带脚本（不作为主要依据，仅交叉印证其未失效）：

```
$ BASE=http://127.0.0.1:3102 node scripts/test/p2-cleanup-f002-colormode-persist.mjs
=== F002 深色持久化：13 passed, 0 failed ===
```

### 3.5 就绪回归

```
$ npx tsc --noEmit
（零输出，退出码 0）

$ npx next lint
✔ No ESLint warnings or errors

$ node .f002-console-tmp.mjs   # 深色态刷新的控制台观测（临时脚本，已删）
dark-reload console errors/warnings: 0
hydration-related: 0
```

内联脚本**未引入 hydration mismatch**（React 对 `dangerouslySetInnerHTML` 的 `<script>` 不重复执行，
且 `body` class 由脚本在 hydrate 前改动不触发告警）。

### 3.6 D6 与改动面

```
$ git diff --name-only 8248ab6..HEAD -- src/
src/app/layout.tsx                        ← F002
src/app/preview/agent-canvas/page.tsx     ← F004
src/components/common/HandoffPanel.tsx    ← F004
src/components/copilot/HandoffCollab.tsx  ← F004
src/components/creators/CreatorDrawer.tsx ← F001
src/components/image/Avatar.tsx           ← F003
src/hooks/useColorMode.ts                 ← F002

$ git diff --name-only 8248ab6..HEAD -- \
    src/components/navbar/Configurator.tsx \
    src/components/navbar/RTL.tsx \
    src/components/fixedPlugin/FixedPlugin.tsx
（空 —— D6 三处死代码全批零改动）

$ git show --stat 3c98a7a   # F002 commit 改动面
 scripts/test/p2-cleanup-f002-colormode-persist.mjs | 131 +++++++++
 src/app/layout.tsx                                 |  10 +-
 src/hooks/useColorMode.ts                          |  40 ++++-
```

F002 改动严格限于 2 个产品文件 + 1 个测试脚本，无越界。

## 4. 附注（非阻断，不影响 PASS 判定）

**注 A —— 「`<body>` 首子节点」的字面 vs 运行时口径。**
源码 `layout.tsx:28` 中 `<script>` 确为 `<body>` 首个子节点；但运行时服务端 HTML 为：

```html
<body id="root"><div hidden=""><!--$--><!--/$--></div><script>try{if(localStorage.getItem('kolmatrix.colorMode')==='dark'){document.body.classList.add('dark')}}catch(e){}</script><!--$!--><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>...
```

前置的 `<div hidden="">` 由 **Next 15 自行注入**（Suspense 边界标记），**内容为空、不可见、不含脚本**，
既不产生绘制也不延后内联脚本的执行时刻。判定为**框架产物而非实装偏离**，acceptance 第 2 条按其
功能意图（pre-paint）判 PASS —— 该意图已由 §3.1 T7 时序数据独立坐实，不依赖节点序位本身。

**注 B —— 浅色基线未受污染。** 全批仅 4 张 PNG 变更：
`agent-canvas-{darwin,linux}.png`（M，归 F004 夹具对齐）+ `creator-drawer-{darwin,linux}.png`（A，归 F005 新增）。
**无任何既有浅色基线因 F002 漂移**，符合「默认不变，不动现有浅色基线」。

**注 C —— 观察项（F002 范围外，建议入需求池，不构成本 feature 缺陷）。**
`useColorMode` 的 `isDark` 是**每个调用实例各自的 React state**，实例间无共享订阅：
若 navbar 与另一消费者（如 `Avatar`）同时挂载，navbar 切换深浅色时另一实例的 `isDark` 不会重渲染；
同理未监听 `storage` 事件，**多标签页之间不同步**。二者均为改造**前既有**的设计形态
（原 hook 的 state 本就是 `body.dark` 的单向镜像），F002 只加持久层未改变该形态，
故**不算 F002 引入的回归**。当前 `Avatar` 全仓零引用，实际无暴露面。
建议作为独立 backlog 条目（跨实例/跨标签同步）交 Planner 裁量。

**注 D —— 未重建构建产物。** 全程复用本机既有 `.next/standalone`，未执行 `next build`，
未影响并行验收的其它 Evaluator。

## 5. 测试产物清单

| 路径 | 说明 |
|---|---|
| `scripts/test/p2-cleanup-f002-eval-probe.mjs` | **本次新增** —— Evaluator 独立回归探针（29 断言，含时序硬证据 + 活性证明），脚本头已按 pattern §7 写明 standalone 前置 |
| `docs/test-reports/P2-CLEANUP-F002-verify.md` | 本报告 |

未修改任何产品代码（`src/` / 配置 / `package.json` 均未动，`git status` 可证）。

---

**最终判定：PASS** —— 7 条 acceptance 逐条满足，29 条独立断言全绿（连跑 2 次稳定），
「无闪烁」配活性证明排除假绿，lint + tsc 双绿，D6 边界与浅色基线均未越界。
