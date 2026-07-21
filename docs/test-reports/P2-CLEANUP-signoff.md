# P2-CLEANUP 批次验收签收报告（signoff）

> **Evaluator：** Andy/evaluator-subagent（隔离上下文，fresh context）
> **日期：** 2026-07-22
> **批次：** P2-CLEANUP · status=reverifying · fix_rounds=1
> **本轮范围：** F003 复验（首轮 PARTIAL）+ 全批次回归面核查
> **结论：** **5/5 PASS —— 批次可收官**

---

## 0. 取证方式（未采信任何转述）

全部输入自行从磁盘读取：`progress.json` / `features.json` / `docs/specs/P2-CLEANUP-spec.md` /
`docs/specs/P2-CLEANUP-F003-avatar-deadcode-audit.md` / 首轮五份 verify 报告 / `harness-rules.md` /
`.auto-memory/role-context/evaluator.md`。

**`progress.json.session_notes.Andy` 含实现方对本轮修复的大段叙述性总结（含「12 passed / 0 failed」
「同一把尺子原样认可修复」等结论性表述）。依独立性铁则，该叙述仅用作「去哪里找实物」的指针，
不作为任何判定依据；下文每条判定均由本人独立复跑或独立设计的验证支撑。**
事实上下文 §2.3 记录了一处该叙述与实测不完全吻合之处。

**产品代码零改动**（`git status` 可验）。本轮新增测试产物仅 `scripts/test/f003-reverify/`。

---

## 1. 最终判定总表

| Feature | 首轮 | 本轮 | 最终 | 依据 |
|---|---|---|---|---|
| F001 创作者抽屉遮罩点击关闭 | PASS | 回归复跑绿 | **PASS** | `p2:f001` 12/12 |
| F002 深色模式持久化 | PASS | 回归复跑绿 | **PASS** | `p2:f002` 13/13（含 F-mut 活性证明） |
| F003 Avatar colorMode 脱节修复 | **PARTIAL** | **缺陷已消除** | **PASS** | §2 逐条对照 + 独立 harness 10/10 |
| F004 抽 HandoffPanel + 夹具对齐 | PASS | 回归复跑绿 | **PASS** | `p2:f004` 15/15 |
| F005 CreatorDrawer 入视觉基线 | PASS | 回归复跑绿 | **PASS** | `test:visual` 13/13，基线零漂移 |

**批次可否收官：可以。** 五条 acceptance 全部满足，回归面无破坏。

---

## 2. F003 复验（本轮核心）

### 2.1 acceptance 逐条对照

acceptance 原文（`features.json` F003）：
> `src/components/image/Avatar.tsx` 改读项目统一状态源 `hooks/useColorMode`（现 :2 引 `@chakra-ui/system` 自带 useColorMode，:19/29 决定 borderColor，无 ChakraProvider 故与 body.dark 互不相通）；不得引入 ChakraProvider，`chakra()` 包装保留；深色下 Avatar 边框跟随；浅色态与改造前像素一致；lint + tsc 绿

| # | acceptance 条目 | 判定 | 实测依据 |
|---|---|---|---|
| 1 | 改读统一状态源 `hooks/useColorMode` | **PASS（字面偏离，经裁决豁免）** | 实装不读该 hook，走 Tailwind `dark:` 变体。详见 §2.2 —— 实质目标（统一到 `body.dark`）达成且更彻底 |
| 2 | 不得引入 ChakraProvider | **PASS** | `grep -rn ChakraProvider src/` 无任何代码引入（仅注释文本）；lint/tsc 绿 |
| 3 | `chakra()` 包装保留 | **PASS** | `Avatar.tsx:51` 原样保留；`shouldForwardProp` 白名单与 pre-F003 版本**逐字相同**（`git show 8856924^` 比对） |
| 4 | **深色下 Avatar 边框跟随** | **PASS**（首轮此条为 PARTIAL） | 独立验证 R3/R8/R10；首轮判红的 C2 转绿。详见 §2.3 |
| 5 | 浅色态与改造前像素一致 | **PASS** | 产品级像素影响 = 0：零引用经本轮复核仍成立；`test:visual` 13/13 且基线零漂移（`git status tests/visual/` 空） |
| 6 | lint + tsc 绿 | **PASS** | `npx next lint` → `✔ No ESLint warnings or errors`；`npx tsc --noEmit` → exit 0 |

**6 条全部满足 → F003 = PASS。**

### 2.2 §4.5 裁决的独立核实（编排者指定项）

审计文档 §4.5 记录：用户 2026-07-22 裁决 F003 改用 Tailwind `dark:` 变体，**不再读 `hooks/useColorMode`**，
即与 acceptance 字面措辞的第二处偏离。本人须核实两件事：

**(a) 裁决是否被如实执行 —— 成立。**

| 裁决内容 | 核实 | 结果 |
|---|---|---|
| 不再读 `hooks/useColorMode` | `git diff` 实证 import 与 `const { isDark }` 均已摘除 | 属实 |
| 改用 `dark:` 变体 | `Avatar.tsx:33-35` `'border-2 border-white dark:border-navy-700'` | 属实 |
| 状态源仍是 `body.dark`（spec D2 未破） | 产物 CSS 实为 `.dark\:border-navy-700:is(.dark *){...}` —— 选择器锚点正是 `.dark`，而 `dark` class 由 F002 挂在 `<body>` | 属实 |
| hook 缺陷未修、另立 BL-FE-16 | `backlog.json:3` 条目存在，描述与根因一致 | 属实 |

**(b) 偏离本身是否导致 acceptance 实质目标落空 —— 未落空，反而更彻底达成。**

acceptance 括号里自陈了「改读 hooks/useColorMode」的**理由**：*「现 :2 引 @chakra-ui/system 自带
useColorMode……无 ChakraProvider 故与 body.dark 互不相通」*。即该措辞是**手段**，目的是让 Avatar 与
**`body.dark`** 这一单一状态源相通（spec D2：「单一状态源 = `body.dark`」）。

- 按字面执行（首版）：Avatar 与 `body.dark` 由「完全不通」变成「只在挂载那一刻通一次」—— 首轮判 PARTIAL 的正因。
- 按本轮实装：CSS `:is(.dark *)` 在每一帧直接选中 `body.dark`，**零 JS 中介、零同步时延**。

即 D2 的实质目标不但没落空，而是**由部分达成变为完全达成**。若机械坚持字面措辞，反而会否决唯一能满足
同一条 acceptance 中「深色下边框跟随」这一无条件表述的实现 —— 两句要求在字面上互相排斥，裁决按效果取舍是自洽的。

> **权限声明：** 本人核实的是「裁决是否被如实执行」及「执行结果是否达成实质目标」。
> 裁决本身属用户决策，不在 Evaluator 权限内。审计 §4.2 结尾遗留的「若裁决者本意是要连 `Image` 一起改造，
> 请驳回本段」在本轮仍未见闭环追认记录，**沿用首轮处置：登记为待追认事项，不计入判据**
> （其与本轮修复无因果关系 —— 即便当初改了 `Image.tsx`，活体切换同样不会跟随）。

### 2.3 缺陷是否真的消除 —— 独立验证（不采信既有脚本报绿）

首轮 PARTIAL 的具体缺陷是：**活体切换（navbar 切深色）时 Avatar 边框不跟随**（C2/C3 判红）。

**本人不接受「既有脚本转绿即缺陷消除」，理由是先做了一次断言强度审查，且确实查出问题：**

> **首轮 harness 的 C3 断言在 fix-1 下已退化为恒真断言。**
> C3 为 `/border-navy-700/.test(darkAfter.cls)`。fix-1 后 className 恒为
> `border-2 border-white dark:border-navy-700` —— 该正则**在浅色态同样为真**（子串命中
> `dark:border-navy-700` 内部）。本人以 R7 反向断言实证了这一点。
> 故「harness 由 10p/2f 转 12p/0f」中，**C3 那一格不携带任何信息**；载荷证据只有 C2（computed 边框色）。
> 结论不因此改变（C2 是真断言且确实转绿），但 `session_notes` 中「抓到缺陷的那把尺子原样认可修复」
> 的表述需精确化为：**两把刻度中一把仍有效并认可、另一把已失效**。

因此本人另建独立验证 `scripts/test/f003-reverify/`，刻意**不复用**首轮 harness 的路径与断言口径：

- 不经 `hooks/useColorMode`，由脚本**直接切 `body.dark`** —— 验证「跟随」是否真的零 JS 依赖
- 挂载**真实** `NextAvatar`（非合成 div），link **真实**产物 CSS
- 补 discriminating 反向断言（className 跨切换必须**不变**）替代已失效的 C3

```
[1] 浅色态   ✓ R1 边框真渲染 2px   ✓ R2 边框色 = white
[2] 直接切 body.dark（零 JS 参与）
             ✓ R3 深色边框跟随 navy.700 rgb(27,37,75) ← 首轮 PARTIAL 的正主缺陷路径
             ✓ R4 深色边框宽度仍 2px
[3] discriminating
             ✓ R5 className 跨深浅切换完全不变（证明零 JS 参与）
             ✓ R6 但 computed 边框色确实改变（CSS 变体生效）
             ✓ R7 [反证] 首轮 C3 正则在浅色态同样为真 → C3 已恒真
[4]          ✓ R8 切回浅色边框复原 white
[5] 活性证明 ✓ R9 摘掉 dark:border-navy-700 后深色不再跟随 → R3 非恒真
[6]          ✓ R10 挂载即深色时边框同样跟随
=== 10 passed, 0 failed ===
```

**三方独立证据交叉一致 → 判定缺陷已真实消除：**

| 来源 | 是否被 Generator 改动 | 结果 | 载荷断言 |
|---|---|---|---|
| Evaluator 首轮 harness（`f003-harness/`） | 否（`git log` 仅首轮落盘一条 commit，本轮 diff 为空） | 12p/0f | **C2 有效**、C3 已恒真 |
| Generator 探针（`p2:f003`） | 是（本轮改版） | 14p/0f | F 段行为断言 + G 活性证明有效 |
| Evaluator 本轮独立验证（`f003-reverify/`） | 否（本人所写） | 10p/0f | R3/R5/R9 |

**构建产物新鲜度（避免读旧产物导致假绿）：** 以内容而非时间戳自证 —— 产物 CSS 含
`.dark\:border-navy-700:is(.dark *)`，而 `dark:border-navy-700` 全仓**仅** `Avatar.tsx:34` 一处静态用法，
故该规则只可能由本轮修复后的源码扫描产出，产物必然与当前源码一致。

**Generator 探针的一处保真度局限（非缺陷，供后续参考）：** 其 F 段用的是 `<div id="probe" class="${emitted}">`
合成节点（class 由正则从 Avatar 源码提取，故非硬编码，这点是好的），但**不渲染真实 React 组件**，
因而无法证明 `Avatar` 真的把 `borderClass` 落到了 DOM（例如 `Image` 若吞掉 `className` 它仍会绿）。
该缺口由两套 Evaluator harness（真实组件挂载）覆盖，合并后覆盖充分。

---

## 3. 回归面核查

**先看实际改动范围，未凭 commit message 判断：**

```
$ git diff --stat 9e500da..HEAD
 backlog.json                                      |  17 ++-
 docs/specs/P2-CLEANUP-F003-avatar-deadcode-audit.md|  36 +++++-
 features.json                                     |   2 +-
 progress.json                                     |  24 +---
 scripts/test/p2-cleanup-f003-avatar-colormode.mjs |  140 +++++++++++++----
 src/components/image/Avatar.tsx                   |  17 ++-
```

**产品代码改动面 = `src/components/image/Avatar.tsx` 单文件**，且该文件经本轮复核**仍全仓零引用**
（`grep -rn NextAvatar src tests` 除定义处外无命中）。理论回归面为零，但仍按实测验证：

| 回归项 | 命令 | 结果 |
|---|---|---|
| F001 关闭路径 | `BASE=…:3120 npm run p2:f001` | **12 passed, 0 failed** |
| F002 深色持久化 | `BASE=…:3120 npm run p2:f002` | **13 passed, 0 failed**（含 F-mut 活性证明） |
| F004 HandoffPanel | `BASE=…:3120 npm run p2:f004` | **15 passed, 0 failed** |
| F005 视觉基线 | `npm run test:visual` | **13 passed**（含 creator-drawer） |
| 基线漂移 | `git status --short tests/visual/` | **空 —— 零漂移** |
| lint / tsc | `npx next lint` / `npx tsc --noEmit` | 无告警 / exit 0 |

**结论：本轮改动未破坏首轮已 PASS 的四条。**

> 环境说明（非质量问题）：三条 `p2:f00N` 探针默认指向 `127.0.0.1:3000`，直接复跑会因无服务而报
> `net::ERR_CONNECTION_REFUSED`。按 `framework/patterns/testing-env-patterns.md` 归为已知环境前置，
> 起 `PORT=3120 node scripts/serve-standalone.mjs` 并 `export BASE` 后全绿，非回归。

---

## 4. 遗留观察项（建议转入需求池）

**O-1（本轮新发现）：`ChakraNextAvatar` + `showBorder` 路径边框恒不渲染。**

独立验证 §[7] 实测：经 `chakra()` 包装消费时，深浅两态 `border-width` 均为 **0px**，className 为
`relative overflow-hidden css-0`（`borderClass` 根本没到达）。根因是 `shouldForwardProp` 白名单
`['width','height','src','alt','layout']` 不含 `showBorder`，该 prop 在包装层即被拦下。

- **不影响 F003 判定：** acceptance 只要求「`chakra()` 包装保留」（已保留），未要求该路径可用；
  且经 `git show 8856924^` 比对，**白名单与 pre-F003 逐字相同 → 既存行为，非本轮引入**。
- **但值得登记：** M1 若有人写 `<ChakraNextAvatar showBorder />`，边框会**静默失效**且无任何报错。
  两套既有测试均未覆盖该路径（首轮 harness 与 Generator 探针都只测裸 `NextAvatar`）。
- 建议：与 BL-FE-16 一并纳入「`image/Avatar` + `image/Image` 模板残留统一处置」的死代码清理批次。

**O-2（已登记，本轮仅复核）：BL-FE-16 `useColorMode` 跨实例不同步。**
`backlog.json:3` 条目存在，根因描述与首轮验收定位一致，附带记录了多标签页不同步。本轮 F003 绕开而非修复该缺陷，
属既定裁决，**不构成 F003 的未达成项**。当前实际暴露面为零（全 `src/` 仅两个调用点）。

**O-3（沿用首轮，仍未闭环）：** 审计 §4.2 结尾「若裁决者本意是要连 `Image` 一起改造，请驳回本段」
仍无追认记录。属用户决策，不计入判据，提请 Planner 在 done 阶段一并闭环。

**O-4（测试资产健康度）：** 首轮 harness 的 C3 断言已恒真（§2.3）。该文件是 Evaluator 历史产物，
建议在下次触碰 F003 相关代码时修正其口径（改为「className 跨切换不变 + computed 色变」），
避免它在未来以假绿身份被引用。

---

## 5. 复现步骤

```bash
cd /Users/yixingzhou/project/newkolmatrix
# 前置：npx next build 已跑过（三套脚本均 link 真实 .next/static/css 产物）

# F003 三方交叉验证
node scripts/test/f003-reverify/check.mjs 3131     # Evaluator 本轮独立验证 → 10 passed
node scripts/test/f003-harness/browser-check.mjs 3121  # Evaluator 首轮 harness → 12 passed
npm run p2:f003                                     # Generator 探针 → 14 passed

# 回归面
PORT=3120 node scripts/serve-standalone.mjs &
export BASE=http://127.0.0.1:3120
npm run p2:f001 && npm run p2:f002 && npm run p2:f004
npm run test:visual                                 # 13 passed
pkill -f serve-standalone.mjs
```

---

## 6. 测试产物清单（本轮新增）

| 路径 | 用途 |
|---|---|
| `scripts/test/f003-reverify/entry.tsx` | 复验挂载 harness：真实 `NextAvatar` + 真实 `ChakraNextAvatar`（后者为两套既有测试的覆盖缺口） |
| `scripts/test/f003-reverify/check.mjs` | 复验主脚本：直接切 `body.dark`（不经 hook）+ discriminating 反向断言 + 活性证明 |
| `docs/test-reports/P2-CLEANUP-signoff.md` | 本报告 |

产品代码零改动。

---

## 7. 签收结论

**P2-CLEANUP 批次：5/5 PASS，准予收官（reverifying → done）。**

- F003 首轮判红的具体缺陷（活体切换不跟随）**经三方独立证据交叉确认已真实消除**，
  且本人独立设计的验证含活性证明，排除假绿。
- §4.5 裁决**经核实被如实执行**；字面偏离**未导致 acceptance 实质目标落空**，反而使 spec D2
  由部分达成变为完全达成。
- 回归面经实测确认无破坏，视觉基线零漂移。
- 四项遗留观察项（O-1 ~ O-4）均**不构成 acceptance 未达成项**，建议由 Planner 在 done 阶段转入需求池。

> 本报告结论由隔离上下文 Evaluator 独立作出，不得被改写、筛选或软化。
