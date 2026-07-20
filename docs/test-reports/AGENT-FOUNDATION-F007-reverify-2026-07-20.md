# AGENT-FOUNDATION F007 复验报告（隔离 Evaluator · fix_rounds=1）

- **Feature：** F007 — 常驻对话面（useChat）+ Generative Canvas 协议 + 多人格切换 + 协同交接可视化
- **复验对象：** 首轮验收（PASS）记录的 1 项非阻断缺陷之修复
- **修复提交：** `946496e`（`fix(AGENT-FOUNDATION-F007): defaultAgentForRoute /outreach→reach 映射修复 + smoke 假阳性修正`），随后 `26c5fc9` 置 status=reverifying / fix_rounds=1
- **复验日期：** 2026-07-20
- **复验人：** Andy/evaluator-subagent（fresh context，独立上下文，不采信实现叙述）
- **环境：** docker db healthy（`newkolmatrix-dev-db` Up 2 days）；`.env` 有 key；`next dev`（非 next start）+ `/api/agent` warmup（2 次 200）；Playwright chromium viewport 1600×1000
- **总判定：** ✅ **PASS** — 缺陷**已修复**，F007 整体复验 PASS，无回归

---

## 首轮缺陷回顾

首轮报告（`AGENT-FOUNDATION-F007-verify-2026-07-20.md`）判 F007 PASS，但记录 1 项非阻断缺陷：

1. `/admin/outreach` 误映射到 **orchestrator（编排 Agent）** 而非 **reach（触达 Agent）**。根因：`defaultAgentForRoute` 用 `route.includes('/reach')`，而 `'/admin/outreach'` 不含子串 `'/reach'`（`reach` 前是 `t` 非 `/`）；admin 下现有路由无一含 `/reach`，reach 人格经路由不可达。
2. Generator smoke（f007-browser-check.mjs:55）断言 `reachText.includes('触达 Agent')` 为**假阳性**——真值来自 HandoffCollab 渲染的「匹配 Agent → 触达 Agent」文案，非专家头切到 reach。

用户要求先修此缺陷再开 F008。以下逐项独立复验。

---

## 复验证据（亲自取证）

### 1. 映射修复 — ✅ 已修

**代码逻辑（persona-router.ts:60-71，修复后）：** 改用**末段关键词匹配**取代子串匹配：
```
const seg = route.split('?')[0].split('/').filter(Boolean).pop() ?? '';
const has = (...keys) => keys.some((k) => seg === k || seg.includes(k));
...
if (has('reach', 'outreach')) return 'reach';
```
`'/admin/outreach'` 末段 `seg='outreach'`，`has('reach','outreach')` 命中 → `reach`，子串坑消除。

**Evaluator 独立映射探针（自出题 14 条路由，非采信 generator 的 2 条断言）：** 全部 OK，无回归：

| route | → agent | name | 期望 |
|---|---|---|---|
| `/admin/outreach` | reach | 触达 Agent | reach ✅ |
| `/admin/outreach?tab=x` | reach | 触达 Agent | reach ✅ |
| `/admin/discovery` | match | 匹配 Agent | match ✅ |
| `/admin/creators` | match | 匹配 Agent | match ✅ |
| `/admin/knowledge` | strategy | 策略 Agent | strategy ✅ |
| `/admin/project/p1/reach` | reach | 触达 Agent | reach ✅ |
| `/admin/project/p1/match` | match | 匹配 Agent | match ✅ |
| `/admin/project/p1/brief` | strategy | 策略 Agent | strategy ✅ |
| `/admin/project/p1/delivery` | delivery | 交付 Agent | delivery ✅ |
| `/admin/project/p1/insight` | insight | 洞察 Agent | insight ✅ |
| `/admin` `/admin/database` `/admin/campaigns` `/admin/dashboards` | orchestrator | 编排 Agent | orchestrator ✅ |

### 2. 浏览器实测（核心：独立选择器证专家头真变 reach）— ✅ 已修

起 `next dev` + `/api/agent` warmup（两次 200）后，Playwright 打开真实路由，**用独立选择器 `aside div.border-l-4`（ExpertScope 专家头卡）取样**，与 HandoffCollab 文案隔离：

- **discovery 专家头：** `匹配 Agent 对比矩阵 职责 创作者筛查·组合生成·受众匹配·可信度核验 隔离 只做发现与匹配，不发起触达、不谈价` → **match** ✅
- **outreach 专家头（缺陷核心）：** `触达 Agent 对话收件箱 职责 邀约起草·逐人谈判·回复跟进·报价建议 隔离 不批预算、不放款；报价与发送需你确认` → **reach** ✅
  - `outreach_scopeIsReach = true`，`outreach_scopeIsOrchestrator = false` —— 专家头**真的**变成「触达 Agent」而非首轮的「编排 Agent」，首轮假阳性核心缺陷**独立证实已修复**。
- **隔离性交叉证明：** `outreach_bodyHasReachText = true`（body 里 HandoffCollab 也含「触达 Agent」文案），而专家头独立选择器仍精确取到 reach —— 证明选择器是**真隔离**（专家头 ≠ handoff 文案），不是靠 body 全文匹配蒙对。

### 3. smoke 假阳性已消 — ✅ 已修

- **f007-browser-check.mjs:54-56（修复后）：** 人格切换断言改用 `const scopeText = await page.locator('aside div.border-l-4').first().innerText()`，注释明示「与 HandoffCollab 的『触达 Agent』文案隔离，避免假阳性」。运行 `npm run f007:browser` = **10/10**，且此 10/10 是**真通过**（我的独立探针已证专家头真是 reach），非假阳性。
- **回归断言（同 commit，generator 铁律满足）：** `orchestration-smoke.ts:73-81` 新增
  ```
  assert(defaultAgentForRoute('/admin/outreach') === 'reach', '...回归：修子串误配');
  assert(defaultAgentForRoute('/admin/project/x/reach') === 'reach', '.../reach 环节');
  ```
  `npm run orch:smoke` = 全 20 断言 ✅ 通过（18 原 + 2 回归），退出 0。

### 4. 回归（F007 其余 acceptance 快速复测）— ✅ 全部保持 PASS

| 项 | 复验结果 |
|---|---|
| C1 KOL 卡片流真实 seed | discovery 打字「找坦克世界解说 YouTuber」→ 卡片流命中真实 seed 名 **SKIFler / Viper / Best Replays / PWN-G / WoT** + `% 匹配` 徽标 + 候选计数 ✅ |
| C2 canvas 协议 | 未改动，仍 PASS（canvas-registry 工具名→组件） ✅ |
| C3 专家头 duty + 否定式护栏 | discovery/outreach ExpertScope 均含「职责」+「隔离」原文（见上文取样文本） ✅ |
| C4 对话清空 + ≥2 人格可见切换 | 切 outreach 后 `outreach_kolCleared=true`（KOL 卡片消失）；≥2 人格可见切换现为 **match ↔ reach**（比首轮 match↔orchestrator 更贴合原始意图） ✅ |
| C5 协同交接可展开 | `outreach_collabExpandedArtifact=true`（A→B「匹配 Agent → 触达 Agent」+ 交接物 match_plan 可展开） ✅ |
| C6 console 无 error | 全程 `consoleErrors_real=[]`（0 条） ✅ |

### 5. 构建门（spec §6）— ✅ PASS

删 `tsconfig.tsbuildinfo` + `prisma generate` 后：
- `npx tsc --noEmit` → **TSC_EXIT=0**
- `npx next lint` → **LINT_EXIT=0**（✔ No ESLint warnings or errors）
- `npx next build` → **BUILD_EXIT=0**（✓ Generating static pages 12/12；`/api/agent`、`/api/handoffs` = ƒ Dynamic）

---

## 非阻断观察（非 F007 缺陷，非本次修复引入，属 F008 范畴）

- **`/admin/dashboards` 返回 404：** 该目录仅有 `dashboards/default/page.tsx`（Horizon 模板 scaffold 残留），无直接 `page.tsx`，故 `/admin/dashboards` 为死链；404 页不套 admin layout，因而无 CopilotPanel（复验探针首次取到空专家头即此因）。
  - 非本次修复引入（`946496e` 仅改 `persona-router.ts` + 2 个测试脚本，未动路由结构/layout/dashboards 页）。
  - 非 F007 acceptance 项（对话面 + 人格切换在真实路由 discovery/outreach/admin/campaigns/database 均正常）。
  - 属 **F008**「各路由有真实占位页无死链报错」的整改范畴，记录留待 F008。

---

## 独立性与边界

- 未修改任何产品代码（`src/` / `prisma/` / 配置一律未动）；仅临时增删 `scripts/test/_indep-f007-reverify-tmp.mjs` 独立探针，验后已删（`git status scripts/` 干净）。
- 真实 key 全程 mask（`DATABASE_URL` / `AIGCGATEWAY_API_KEY` 未落报告）。
- 已 kill `next dev` 释放 :3000，已关 Playwright。
- 仅复验 F007 修复（F008-F010 未实现属正常）。

## 总判定

**PASS —— 缺陷已修复。** `/admin/outreach` 现正确映射到 reach（触达 Agent），浏览器专家头独立选择器实测 `scopeIsReach=true / scopeIsOrchestrator=false`，首轮假阳性根因（子串匹配 + smoke 断言未隔离）双双消除，回归断言随同 commit 落地。F007 其余 acceptance 无回归，构建门全绿。F007 整体复验 PASS，fix_rounds=1。
