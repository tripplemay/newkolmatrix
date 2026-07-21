# P2-CLEANUP F003 验收报告 — Avatar colorMode 脱节修复

> **Evaluator：** Andy/evaluator-subagent（隔离上下文，fresh context）
> **日期：** 2026-07-21
> **批次：** P2-CLEANUP · status=verifying（首轮）
> **被验 feature：** F003（仅此一条）
> **专属端口：** 3103
> **结论：** **PARTIAL** — 边框通道修复真实成立且经浏览器实证；但 acceptance「深色下 Avatar 边框跟随」只在**挂载即深色**路径成立，**活体切换（navbar 切深色）路径不跟随**，实测复现。

---

## 0. 输入与取证方式

自行从磁盘读取，未采信任何转述：

| 输入 | 路径 |
|---|---|
| 状态机 | `progress.json` / `features.json` |
| 批次规格 | `docs/specs/P2-CLEANUP-spec.md`（§2 F003 / §3 D2 D6 D8 / §4 验收口径） |
| 开工前审计与裁决 | `docs/specs/P2-CLEANUP-F003-avatar-deadcode-audit.md`（§4 裁决段为 acceptance 补充输入） |
| 角色边界 | `harness-rules.md` / `.auto-memory/role-context/evaluator.md` |
| 实装 | `src/components/image/Avatar.tsx`、`src/components/image/Image.tsx`、`src/hooks/useColorMode.ts` |
| Generator 回归探针 | `scripts/test/p2-cleanup-f003-avatar-colormode.mjs` |

**未修改任何产品代码。** 新增测试产物仅一处：`scripts/test/f003-harness/`（`entry.tsx` / `AvatarBefore.tsx` / `browser-check.mjs` / `.gitignore`）。
未重建 `.next` 产物（遵守并行验收约定，直接复用既有 standalone/CSS 产物）。

### 为何必须自建浏览器 harness

F003 的两条核心 acceptance（「深色下 Avatar 边框跟随」「浅色态与改造前像素一致」）是**渲染行为断言**，而
`image/Avatar.tsx` 全仓零引用（审计发现 1，本报告 §2.1 已独立复核）——产品里没有任何路由能渲染到它。
Generator 探针因此只做了「源码契约 + 构建产物 CSS 是否发出类名」的静态断言，**无法证明边框真的渲染、更无法证明它跟随**。

故本次自建挂载 harness，构成要点（保证保真度）：

- 直接 import **真实** `src/components/image/Avatar.tsx`（未复制、未改写）
- 用 **真实** `src/hooks/useColorMode` 的 `toggle` 切换 —— 与生产 navbar 同一路径
- 页面 link **真实** `.next/static/css` 构建产物 CSS（不是手写样式）
- 同页并排挂载 **pre-F003 版本**（`git show 8856924^`）做 A/B，用于独立核实审计 §4.2 / §4.3 的事实主张

---

## 1. acceptance 逐条对照

acceptance 原文（`features.json` F003）：
> `src/components/image/Avatar.tsx` 改读项目统一状态源 `hooks/useColorMode`（现 :2 引 `@chakra-ui/system` 自带 useColorMode，:19/29 决定 borderColor，无 ChakraProvider 故与 body.dark 互不相通）；不得引入 ChakraProvider，`chakra()` 包装保留；深色下 Avatar 边框跟随；浅色态与改造前像素一致；lint + tsc 绿

| # | acceptance 条目 | 判定 | 依据 |
|---|---|---|---|
| 1 | 改读统一状态源 `hooks/useColorMode` | **PASS** | `Avatar.tsx:4` `import useColorMode from 'hooks/useColorMode'`；`:23` `const { isDark } = useColorMode()`。旧 `@chakra-ui/system` 的 `useColorMode` 已从 import 中摘除（diff 8856924 实证） |
| 2 | 不得引入 ChakraProvider | **PASS** | 全 `src/` grep `ChakraProvider` 仅 3 处**注释文本**（Avatar:22、CreatorDrawer:6/312），无任何代码引入 |
| 3 | `chakra()` 包装保留 | **PASS** | `Avatar.tsx:46` `export const ChakraNextAvatar = chakra(NextAvatar, {...})` 原样保留，`shouldForwardProp` 白名单未变 |
| 4 | **深色下 Avatar 边框跟随** | **PARTIAL** | 挂载即深色 → 跟随（E1 ✓ `rgb(27,37,75)`）；**活体 toggle → 不跟随**（C2/C3 ✗，`body.dark=true` 而 Avatar 仍 `border-white`）。详见 §3 |
| 5 | 浅色态与改造前像素一致 | **PASS（按审计 §4.3 修正口径）** | 产品级渲染像素变更为 0（组件零引用 + `showBorder` opt-in 默认关闭 + 无视觉基线含它）。组件级确有变更（0px → 2px white），但那正是裁决 C 的目的。详见 §2.3 |
| 6 | lint + tsc 绿 | **PASS** | `npx next lint` → `✔ No ESLint warnings or errors`；`npx tsc --noEmit` → exit 0 |

**综合：6 条中 5 条 PASS，第 4 条 PARTIAL → feature 判定 PARTIAL。**

---

## 2. 审计文档 §4 的独立核实

编排者指定：审计 §4 为 acceptance 补充输入，其中 §4.2（实装与裁决措辞的偏离）与 §4.3（acceptance 措辞修正）须由 Evaluator 独立核实。以下为核实结论。

### 2.1 前置：审计发现 1「全仓零引用」— **独立复核成立**

```
$ grep -rn "NextAvatar|components/image|image/Avatar" \
    --exclude-dir={node_modules,.next,.git,docs} .
features.json:28:                                   ← acceptance 文本
scripts/test/p2-cleanup-f003-avatar-colormode.mjs:4,37,75  ← 探针自身
src/components/image/Avatar.tsx:13:export function NextAvatar({
src/components/image/Avatar.tsx:46:export const ChakraNextAvatar = chakra(NextAvatar, {
```

唯一命中即定义处自身，无任何消费点。零引用属实。

### 2.2 §4.2 偏离（实装未改 `Image.tsx`）— **核实为技术上正确，判定接受；但形式上仍待裁决者追认**

审计 §4.2 自陈：裁决 C 的措辞是「换状态源 **+ 改 Image border 通道**」，实装**未动 `Image.tsx`**，理由是缺陷在 Avatar 发错通道而非 Image 本身。三道独立核实：

1. **Image.tsx 确未被本批触碰**
   `git log --oneline -- src/components/image/Image.tsx` → 仅 `a04699e`（DS-FOUNDATION F001 模板 scaffold）一条；
   `git diff --stat 8248ab6..HEAD -- src/components/image/` → 仅 `Avatar.tsx | 22 +++---`。属实。
2. **Image 的 `className` 通道本就正常**
   `Image.tsx:26` `<div className={`relative overflow-hidden ${className}`} {...rest}>` —— `className` 已被解构出来并显式拼接，
   且 `{...rest}` 不含 `className`（已解构），不存在覆盖。浏览器实证 A3：类名确实落到了 div 上
   （`relative overflow-hidden border-2 border-white`）。
3. **缺陷确实在 Avatar 的通道选择**
   pre-F003 版本浏览器实测（B2）：`border` 落成 DOM 属性 `border="2px"`、`borderColor` 落成 `bordercolor="white"`，
   computed `border-top-width` = **0px**。即样式 props 被 spread 成无效属性、从不产出样式 —— 审计发现 2 属实。

**判定：** §4.2 的技术论证经实物核实全部成立。改 `Image.tsx` 并不能带来额外收益（其 className 通道本就工作），
且会扩大对模板共享件的改动面，与 D6 精神一致。**Evaluator 接受该偏离，不视为缺陷。**

⚠️ 但需明示：审计 §4.2 结尾写有「**若裁决者本意是要连 Image 一起改造，请驳回本段，Generator 按原措辞重做**」。
这是一项**尚未闭环的裁决者追认**，属用户决策而非 Evaluator 权限。本报告将其登记为**待追认事项**，不计入 PASS/FAIL 判据。

**关键补充：** §4.2 的偏离与本报告 §3 的缺陷**无因果关系**。§3 的不跟随根因在 `hooks/useColorMode` 的**每实例独立 state**，
即便当初连 `Image.tsx` 一并改造，活体切换同样不会跟随。故不应以 §3 缺陷为由驳回 §4.2。

### 2.3 §4.3 acceptance 措辞修正（「浅色态与改造前像素一致」）— **核实成立，判定接受**

§4.3 主张：改造前边框根本不渲染，故 C 方案必然改变 `showBorder` 时的渲染；但实际像素影响为零。逐条核实：

| §4.3 主张 | 核实方式 | 结果 |
|---|---|---|
| 「改造前边框根本不渲染」 | 浏览器 A/B（B1）：pre-F003 版本 computed `border-top-width` = **0px** | **成立** |
| 「该组件全仓零引用」 | §2.1 grep | **成立** |
| 「`showBorder` opt-in 默认关闭」 | `Avatar.tsx` 无默认值，`undefined` → falsy；浏览器 A4：不传 `showBorder` 时 border-width = **0px** | **成立** |
| 「任何现存视觉基线都不含它」 | 由零引用直接推出（无路由可渲染到它） | **成立** |

**判定：** 若机械套用 acceptance 字面「浅色态与改造前像素一致」，则改造后 `showBorder` 由 0px 变 2px white，字面不一致。
但该变化正是裁决 C 所要求的效果 —— 以「必须与改造前一致」否决「必须让边框真渲染」在逻辑上自相矛盾。
故 **Evaluator 采纳 §4.3 的修正口径**：判据落在**产品级像素影响 = 0**，该条判 PASS。

---

## 3. 缺陷：深色跟随只在挂载路径成立，活体切换路径失效

### 3.1 实测现象

```
[3] 活体切换：走真实 useColorMode.toggle（生产 navbar 同一路径）
    body.dark = true  after: {"cls":"relative overflow-hidden border-2 border-white",
                              "width":"2px","color":"rgb(255, 255, 255)", ...}
  ✓ C0 toggle 后 body.dark 已置位（状态源本身正确翻转）
  ✓ C1 深色态边框仍为 2px — 2px
  ✗ C2 深色态边框色跟随到 navy.700 rgb(27,37,75) — rgb(255, 255, 255)
  ✗ C3 className 切到 border-navy-700 — relative overflow-hidden border-2 border-white

[5] 挂载即深色（持久值已存在时的首次渲染路径）
  ✓ E1 持久深色刷新后 Avatar 边框仍跟随 navy.700 — rgb(27, 37, 75)
```

`body.dark` 已正确置位（C0 ✓），但 Avatar 的 className 仍停在 `border-white`。已加 500ms 重渲染窗口，排除竞态误报。
刷新后（持久值 = dark，组件挂载时即深色）则正确渲染 `rgb(27,37,75)`（E1 ✓）。

### 3.2 根因（读源码定位，非推测）

`src/hooks/useColorMode.ts` 的每个调用点各持有一份**独立的 React state**，且**无任何跨实例订阅机制**：

```
$ grep -nE "MutationObserver|addEventListener|createContext|useSyncExternalStore|subscribe" \
    src/hooks/useColorMode.ts
(none — 无订阅机制)
```

```ts
export function useColorMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => { /* 仅挂载时读一次 stored / body */ }, []);   // ← 依赖数组为空
  const setDark = useCallback((dark) => { ...; setIsDark(dark); }, []); // ← 只更新自己这份 state
  ...
}
```

因此 `isDark` 只在**两个时机**更新：(a) 该实例自己挂载时；(b) 该实例自己调用 `setDark`/`toggle` 时。
**纯读取方**（只解构 `isDark`、不持有 toggle）永远收不到别处翻转的通知。

调用点普查（全 `src/`，共 2 处）：

| 调用点 | 角色 | 活体切换下是否跟随 |
|---|---|---|
| `src/components/navbar/index.tsx:30` `const { isDark, toggle } = useColorMode()` | **持有 toggle**，自翻自更新 | ✓ 跟随 |
| `src/components/image/Avatar.tsx:23` `const { isDark } = useColorMode()` | **纯读取方（F003 引入的第一个）** | ✗ 不跟随 |

即：F003 是本项目**第一个只读 `isDark` 的消费者**，因而首次暴露了这个 hook 的潜在设计缺陷。
该缺陷本身是 DS-FOUNDATION F005 遗留（**非 F003 新引入**），但 F003 的 acceptance 恰好落在它上面。

### 3.3 为何仍判 PARTIAL 而非 PASS

- spec §1 对 F003 的立项定性是：「Avatar 的 Chakra `colorMode` 脱节 —— 与 `body.dark` 是**两套互不相通的状态**」。
  改造后 Avatar 与 `body.dark` 从「完全不通」变成「**只在挂载那一刻通一次**」—— 脱节被削弱但未消除。
- 用户明确否决了方案 A（归档不实现），选 C 就是为了让边框**真跟随**。交付物在活体切换路径上未达成该意图。
- acceptance「深色下 Avatar 边框跟随」是无条件表述，实测两条路径中一条不成立 → 依据「有一条不满足即不得判 PASS」，判 PARTIAL。

### 3.4 严重度与修复建议（供 Planner/Generator 参考，非 Evaluator 指令）

**用户可见影响 = 0**（组件零引用，当前不渲染）。故建议按低优先级处理，不必阻塞批次收官；
但由于这是 `useColorMode` 的**通用**缺陷，M1 若出现第二个只读消费者会立刻踩到同一坑，建议登记进需求池。

可选修法（任一即可，均需归属独立 feature 号，铁律 10）：
1. `useColorMode` 改为 `useSyncExternalStore` + 模块级订阅表（`setDark` 时广播）——最正统，一次性解决所有只读消费者；
2. 挂 `MutationObserver` 监听 `document.body` 的 `class` 变化；
3. 若判定不值得改，则应回头修正 F003 的 acceptance 措辞（限定为「挂载时跟随」），使验收口径与实物一致。

---

## 4. 就绪回归与 Generator 探针复核

### 4.1 命令与输出

| 命令 | 结果 |
|---|---|
| `npx next lint` | `✔ No ESLint warnings or errors` |
| `npx tsc --noEmit` | exit 0，无输出 |
| `npm run p2:f003` | **7 passed, 0 failed** |
| `node scripts/test/f003-harness/browser-check.mjs 3103` | **10 passed, 2 failed**（C2 / C3） |

### 4.2 Generator 探针（`p2-cleanup-f003-avatar-colormode.mjs`）健壮性复核

探针 7 断言全绿，我独立复跑确认（非采信叙述）。但它**结构性地无法发现 §3 缺陷**，另有两处强度不足，记录如下（均非缺陷，属探针改进建议）：

| 观察 | 说明 |
|---|---|
| 全为静态断言 | A/B/C 是源码正则、D 是产物 CSS 字符串查找 —— 无一条触及**渲染行为**，故「跟随」这一 acceptance 核心从未被真正测过 |
| D 的 `.border-white` 部分并非唯一由 Avatar 供能 | 独立 grep：`border-white` 在 `src/` 另有 **32** 个文件静态使用（HandoffCard / SurfaceCard / CreatorDrawer 等）。探针 E 的活性证明只覆盖了 `border-navy-700`（该类确实全仓仅 Avatar 一处，E 成立），`.border-white` 那条属**假绿风险**断言 |
| 未断言 `.border-2` | 只有 `border-navy-700`/`border-white` 会设 border-color；无 `border-2` 则 border-width = 0、边框不可见。我独立验证 `.border-2{border-width:2px}` 确在产物 CSS 中，事实无碍，但探针漏了这条关键链路 |

产物 CSS 实测（`.next/static/css/*.css`）：

```
.border-navy-700{--tw-border-opacity:1;border-color:rgb(27 37 75/var(--tw-border-opacity,1))}
.border-white{--tw-border-opacity:1;border-color:rgb(255 255 255/var(--tw-border-opacity,1))}
.border-2{border-width:2px}
```

（`rgb(27 37 75)` 与 `tailwind.config.js` 的 `navy.700` 一致，也与浏览器实测 E1 读数 `rgb(27, 37, 75)` 对上。）

---

## 5. 复现步骤

```bash
cd /Users/yixingzhou/project/newkolmatrix
# 前置：.next 产物已就绪（本次未重建，复用既有产物）
node scripts/test/f003-harness/browser-check.mjs 3103
```

预期：`10 passed, 2 failed`，失败项为
`C2 深色态边框色跟随到 navy.700` 与 `C3 className 切到 border-navy-700`。

手工复现路径（等价）：在任意挂载了 `NextAvatar showBorder` 的页面上，先保持浅色，
再经 navbar 主题钮切深色 → `document.body` 得到 `dark` class，而该 Avatar 的 className 仍为
`border-2 border-white`，边框颜色不变。刷新页面后（F002 持久值为 dark）才变为 `border-navy-700`。

---

## 6. 测试产物清单

| 路径 | 用途 |
|---|---|
| `scripts/test/f003-harness/browser-check.mjs` | F003 浏览器实测主脚本（自动 esbuild 打包 + 起静态服务 + Playwright 断言） |
| `scripts/test/f003-harness/entry.tsx` | 挂载 harness：真实 Avatar + 真实 useColorMode + pre-F003 版本并排 |
| `scripts/test/f003-harness/AvatarBefore.tsx` | A/B 基准 = `git show 8856924^:src/components/image/Avatar.tsx`（仅改 import 路径，逻辑逐字未动） |
| `scripts/test/f003-harness/.gitignore` | 忽略 `out/` 打包生成物 |
| `docs/test-reports/P2-CLEANUP-F003-verify.md` | 本报告 |

产品代码零改动，`git status` 可验。

---

## 7. 结论

**F003 = PARTIAL。**

- 状态源统一（acceptance 1/2/3）：**扎实完成**，实物可验。
- 边框通道改真：**真实成立** —— 这是本 feature 最有价值的部分，且经 A/B 实证「改造前 0px / 改造后 2px」，
  裁决 C 想要的「边框真渲染」已达成。
- 审计 §4.2 偏离：**技术论证经独立核实全部成立，Evaluator 接受**；形式上待裁决者追认（用户决策，已登记）。
- 审计 §4.3 措辞修正：**核实成立，Evaluator 采纳**。
- 唯一未达成项：acceptance「深色下 Avatar 边框跟随」在**活体切换路径失效**（C2/C3 实测复现），
  根因为 `useColorMode` 每实例独立 state、无订阅机制。用户可见影响为 0（组件零引用），但 acceptance 字面未满足。

> **交回编排者的动作项：** 依据 harness-rules，PARTIAL 的 feature 须在 `features.json` 中改回 `pending`。
> 本次有 5 路验收并行运行，为避免对 `features.json` 的并发写冲突，Evaluator **未直接改写状态机文件**，
> 由编排者统一落盘。本报告结论不得被改写、筛选或软化。
