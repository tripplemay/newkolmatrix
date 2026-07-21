# M1-A-BRIEF F002 验收报告 — 拆 NoSSR → 恢复 SSR

- **批次 / feature：** M1-A-BRIEF / F002（`executor: generator`）
- **阶段：** verifying（首轮，fix_rounds=0）
- **验收人：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-22
- **被测 HEAD：** `168dba876b0ce496aa2dc03b319aed27a1959424`
- **被测实例：** standalone 生产产物 @ `http://127.0.0.1:3300`（遵 `framework/patterns/testing-env-patterns.md` §7，不走 `next dev`）
- **对照实例：** 生产 `https://newkol.guangai.ai` @ `0c36fc2f`（P2-CLEANUP 版 = 拆 NoSSR 之前），只读 GET 作 before 基线

## 结论：**PARTIAL**

F002 的实质交付（全站恢复 SSR、零 hydration 失配、零视觉漂移、无深色 FOUC）证据充分、逐条成立。
唯一未达标项是 acceptance 明文列出的回归红线之一：**`npm run p2:f004` 非稳定绿**，
critical 断言在 10 次实测中失败 2 次（20%）。该抖动经实测归因于 F002 本身（详见 §3）。
产品行为无缺陷，缺陷在交付的探针资产。

---

## 1. 被测产物身份确认

服务在 3300 的构建确含 F002 改动（三处独立标记）：

| 标记 | 实测 |
|---|---|
| `styles/index.css` 的 `:root` 兜底色阶 | 服务的 `/_next/static/css/50da8cfe89c21b68.css` 含 `:root{--background-100:#ffffff;...--color-900:#11047a}` |
| navbar 双图标 CSS 择一 | SSR HTML 同时含 `class="block h-5 w-5 dark:hidden"` 与 `class="hidden h-5 w-5 dark:block"` |
| `findCurrentRoute` 守卫删除 | 六页 SSR HTML 的 brandText 均为真实路由名，无 `Main Dashboard` 回落 |

`:root` 与 `AppWrappers` theme state 的取值**逐项一致**（13/13 变量、值全等，脚本比对 PARITY OK）。
> acceptance 文字写「12 个运行时色阶变量」，实物两侧均为 13 个（`--background-100/900`、`--shadow-100` + `--color-50…900` 十档）。
> 依 `role-context/evaluator.md`「计数不符先逐站点追溯，判据落终态」：终态判据是两处取值一致，成立；acceptance 的 12 属笔误，不构成缺陷。

## 2. 逐条实测

### 2.1 SSR 真的恢复了（before/after 对照，非「代码里删了那行」）

`AppWrappers.tsx` 的 `dynamic(ssr:false)` 已移除（现文件 20-65 行为直接导出的 `'use client'` 组件）。

首屏 HTML 可见文本字符数（剥离 `<script>/<style>/注释/标签`后）：

| 页面 | 线上 `0c36fc2f`（before） | 本地 HEAD（after） |
|---|---|---|
| `/admin/today` | **0** | 1173 |
| `/admin/campaigns` | **0** | 564 |
| `/admin/insight` | **0** | 653 |
| `/admin/knowledge` | **0** | 1059 |
| `/admin/creators` | **0** | 222 |
| `/admin/runs` | **0** | 231 |

before 六页全 0 字符 = 真空壳，after 全部有实内容。**creators / runs 的 222/231 已复核为非缺陷**：
两页自身 `useSearchParams` + `Suspense`（`creators/page.tsx:9,106,334`、`runs/page.tsx:13,166,244`），
服务端渲染的是 fallback（SSR HTML 中实见「加载创作者库…」「加载 Agent 记录…」），外壳确已 SSR，且相对 before 的 0 字符仍是净增。

全路由扫（15 条）无 500：渲染页 200 且均有 SSR 文本，其余为 307 跳转（`/`、`/admin`、`/admin/dashboards*`、`/admin/database`、`/admin/discovery`、`/admin/outreach`）。

### 2.2 审查面

- **spec §1.2 六个活文件**逐个复核为 SSR-safe：`dropdown/index.tsx`（`document` 仅在 `useEffect` 内）、`common/HalfGauge.tsx`（`getComputedStyle` 在 `useEffect`，Chart 走 `dynamic ssr:false`）、`AppWrappers.tsx`、`layout.tsx`（pre-paint 脚本为 `<body>` 首子节点）、`useColorMode.ts`（`typeof document` 守卫 + effect）、`useMediaQuery.ts`（`typeof window` 守卫 + effect）。
- **全 src 重扫** `typeof window|document` 仅剩 4 处，全部合法：`useColorMode:55,62`、`useMediaQuery:12`、`navigation.ts:5`（`isWindowAvailable` 导出体，唯一消费方为 `rtlProvider/RtlProvider.tsx:14`，属 D6 死代码，spec 明令不碰）。**无漏网。**
- **D6 四个死代码文件未被碰**：`navbar/RTL.tsx`、`navbar/Configurator.tsx`、`fixedPlugin/FixedPlugin.tsx`、`rtlProvider/RtlProvider.tsx` 最后修改均为 `a04699e`（DS-FOUNDATION scaffold），F002 commit `416c23c` 改动文件清单中不含它们。
- **四个 ApexCharts 组件未改**：`{LineArea,Line,Pie,Bar}Chart.tsx:4` 各自仍为 `dynamic(() => import('react-apexcharts'), { ssr: false })`，最后修改为 `a899d2f`（ARCH-M05）。

### 2.3 hydration mismatch — 24 次加载零告警，且**检测器经活性证明**

探针 `scripts/test/m1a-f002-hydration.mjs`：6 页 × {桌面 1440×900、移动 390×844} × {浅色、深色} = 24 次加载。

```
hydration mismatch warnings: 0
other console errors/warnings: 0
live-check: dark-mode loads with body.dark applied = 12/12
RESULT: PASS
```

> acceptance 只要求「桌面+移动 × 六页」12 次。本次**加测深色态 12 次**：F002 修的两处（navbar `isDark` 三元、`findCurrentRoute` 服务端分支）失配只在「服务端值 ≠ 客户端首帧值」时暴露，浅色恰是服务端默认值，只测浅色会漏掉整类回归。深色 12 次全部实测 `body.dark=true`（否则「深色零失配」等于没测到深色）。

**活性证明**（`scripts/test/m1a-f002-hydration-livecheck.mjs`）：不改产品代码、不重新构建，用 route 拦截只篡改服务端 HTML 的可见文本节点（保留 RSC flight 载荷）→

```
A. 未篡改（对照）      : hydration warnings = 0
B. 注入文本失配（活性）: hydration warnings = 1
     > [pageerror] Minified React error #418; ...
```

抓到的正是 #418 —— 与 Generator 声称修掉的错误同型。**故「0 失配」可采信，不是探针死了。**

`findCurrentRoute` 修复的运行时实证（六页 SSR brandText 均为真实路由名，正是原 #418 的源头）：

```
/admin/today -> 今天        /admin/campaigns -> 项目      /admin/creators -> 创作者库
/admin/knowledge -> 游戏知识  /admin/insight -> 洞察       /admin/runs -> Agent 记录
```

### 2.4 深色刷新无浅色闪烁 —— 客观取证替代「肉眼确认」

acceptance 原文写「肉眼确认」。隔离 evaluator 无法肉眼看，且肉眼分辨不出一两帧闪白，故改为高频采样 + 截图亮度（`scripts/test/m1a-f002-dark-flash-frames.mjs`），比肉眼严格。
基线实测：本页深色截图亮度 45 / 浅色 237，阈值取 110。

```
A. 原样刷新（被测场景）  首个可采样点 = 54ms dark=true   浅色采样点 = 0   稳定后亮度 = 45
B. 剔除 pre-paint 内联脚本（活性）首个可采样点 = 48ms dark=false  浅色采样点 = 10 → 48ms ~ 292ms
判定：探针活着（剔除脚本后确实抓到浅色窗口） · 被测场景全程深色，无浅色闪烁
```

剔除 `layout.tsx` 的 pre-paint 脚本后出现 ~250ms 浅色窗口并被抓到 → 探针确实看得见浅色态；
脚本在场时从首个可采样点起即深色，零浅色窗口。**SSR 下 pre-paint 前置 `body.dark` 仍然成立。**

> 实现备注：初版用 CDP `Page.startScreencast` 抓合成帧，实测导航期间不发帧（110 帧全落在 hydration 之后），
> 剔除脚本后仍抓不到浅色 —— 该实现**自证不可用**，已弃用改为现方案。此处记录以免后续 evaluator 重踩。

### 2.5 视觉基线 13/13 零漂移

```
Running 13 tests using 1 worker
  ✓ agent-canvas / creator-drawer / today / campaigns / project env=brief|match|reach|delivery|insight
  ✓ creators / knowledge / insight / runs
  13 passed (23.2s)
```

比对的是既有 `tests/screenshots/baseline/*-darwin.png` 全 13 张，**未重生任何基线**（`git status` 中 baseline 目录无改动）。
为不干扰并发 evaluator，未用根 `playwright.config.ts` 的 webServer（其 `serve-standalone.mjs` 会 `cpSync` 写共享 `.next` 并占 3000 端口），
改用 `tests/visual/playwright.evaluator.config.ts` 直打 3300，其余项（testDir / snapshotPathTemplate / viewport / workers:1 / retries:0）逐字沿用。

### 2.6 lint + tsc

```
npx tsc --noEmit  → exit 0，零输出
npm run lint      → ✔ No ESLint warnings or errors
```
（`npx prisma generate` 已前置，遵 testing-env-patterns §3。项目无 `.nvmrc`，§4 的版本一致性检查不适用；本机 Node v25.7.0。）

---

## 3. 未达标项：`p2:f004` 非稳定绿（PARTIAL 的唯一成因）

acceptance 原文：「P2-CLEANUP 回归红线不得破——`npm run p2:f001` / `p2:f002` / `p2:f004` 三条探针全绿」。

| 探针 | 实测 |
|---|---|
| `p2:f001` | **12 passed, 0 failed** ✅ |
| `p2:f002` | **14 passed, 0 failed** ✅（含 F-live / F-mut 两条活性证明） |
| `p2:f004` | 首跑 **14 passed, 1 failed** ❌，重跑 3 次 15/15 → **抖动** |

失败断言：`p2-cleanup-f004-handoff-panel.mjs:76`
`ok((prod?.cardCount ?? 0) >= 2, 'A 生产侧多卡路径仍在', '卡数=1')`

### 3.1 根因（实测，非推断）

`HandoffPanel` 的卡 = `COLLAB_MOCK[stage]`（同步渲染）+ `GET /api/handoffs`（`HandoffCollab.tsx:57` 客户端 `useEffect` 异步取数）。
探针以 `getByText('多 Agent 联动 · 点开看交接').waitFor()` 作「面板就绪」信号，随后**立即**读 `children.length`。

`scripts/test/m1a-f002-p2f004-race-diag.mjs`（N=10）：

```
断言 cardCount>=2 通过率：
  探针现判据（waitFor 后即刻读）: 8/10
  等 /api/handoffs 落地后读     : 10/10
结论：断言结果取决于客户端取数是否已落地 —— 属时序竞态，非产品行为差异。
```

失败的两次中，run 10 明确记录 `此刻 /api/handoffs 已返回=false`。

### 3.2 归因于 F002（决定性证据）

探针的就绪锚点文本在 SSR HTML 中的出现次数：

```
prod  /admin/campaigns/lc?env=brief（0c36fc2f，拆 NoSSR 前）: 0
local /admin/campaigns/lc?env=brief（HEAD，拆 NoSSR 后）    : 1
```

- **拆 NoSSR 前：** 锚点只可能在客户端挂载后出现 → `waitFor` 必然落在 hydration 之后，此时 fetch 早已发出，本地环回通常已返回，断言碰巧稳定。
- **拆 NoSSR 后：** 锚点已在服务端 HTML 中，`waitFor` 在 `domcontentloaded` 即满足，**早于 hydration、更早于 fetch 发出** —— 断言与取数之间不再有任何同步点。

即：F002 恢复 SSR 系统性地抹掉了该断言隐含的同步点。**产品行为正确**（等取数落地后 10/10 得 2 张卡），失效的是探针。

### 3.3 为什么判 PARTIAL 而非 PASS

这与 `role-context/evaluator.md` §13「checklist 文本陈旧 → 直接 update 标 PASS」**不同类**：那条覆盖的是描述性文字漂移且代码功能等价；此处是**交付的回归探测器变成了非确定性**。
回归红线一旦 20% 概率误报，下一批次的 evaluator 会照着它烧掉一轮 fixing。

同时这是**同一失效模式的第二个实例**：Generator 已在本批识别并修复了 `p2:f002` 的同类问题（「探针代理前提随架构变更失效」，已入 `proposed-learnings`），但未把该结论横扫到姊妹探针 `p2:f004`。
Generator 记录的「p2 四条探针 55 断言全绿」为单次运行结果，不具复现性。

### 3.4 建议修法（Generator 执行；本 Evaluator 未代改，以免自评自修）

在 `p2-cleanup-f004-handoff-panel.mjs` 的 `readPanel()` 中，于 `waitFor` 锚点之后、`evaluate` 读数之前，补一个对取数的同步点，例如：

```js
await page.waitForResponse((r) => r.url().includes('/api/handoffs'), { timeout: 15_000 });
```

或改为对 `cardCount` 本身轮询等待（`expect.poll` 语义）。诊断脚本 `scripts/test/m1a-f002-p2f004-race-diag.mjs` 可直接用作修复后的复验工具（修好应为 10/10）。

---

## 4. 本次新增的测试产物（均为 Evaluator 资产，未动产品代码）

| 文件 | 用途 |
|---|---|
| `scripts/test/m1a-f002-hydration.mjs` | 6 页 × 2 视口 × 2 色彩模式 = 24 次加载的 hydration 失配探针 |
| `scripts/test/m1a-f002-hydration-livecheck.mjs` | 上者的检测器活性证明（注入文本失配须翻 #418） |
| `scripts/test/m1a-f002-dark-flash-frames.mjs` | 深色刷新无浅色闪烁的客观取证 + 剔脚本活性证明 |
| `scripts/test/m1a-f002-p2f004-race-diag.mjs` | `p2:f004` 多卡断言的时序竞态诊断 / 修复后复验工具 |
| `tests/visual/playwright.evaluator.config.ts` | 视觉回归打既有 standalone 实例（不占 3000、不写共享 `.next`） |

`git status` 确认：`src/` / `prisma/` / `package.json` / 根 `playwright.config.ts` / 视觉基线 png **零改动**。

## 5. [L2] 未执行，待授权

- 生产环境部署后走查（本批产物尚未部署；`https://newkol.guangai.ai` 当前仍是 `0c36fc2f`，本次仅作只读 before 对照）
