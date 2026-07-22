# M2-A-MATCH 首轮验收记录 — F008 侧栏徽标服务接真（U4，消解 D-B 两批悬置）

- **署名：** Andy/evaluator-subagent（隔离上下文，fan-out 单 feature）
- **日期：** 2026-07-22
- **结论：** **PASS**（9/9 acceptance 子项 PASS；1 条非阻断观察项 OBS-F008-1）
- **验收对象：** commit `46c0359`（F008 主体）+ `5ed8dfc`（linux 基线重生，github-actions bot）；验收基于 HEAD `3d93f72`
- **验收方式：** 代码/测试/DB 层实证（端口纪律：本 subagent 不起 :3000 server；页面运行时/视觉套件由 READINESS 验收覆盖，本报告引 CI 与 READINESS 实测为证）

## 0. L1 环境前置（testing-env-patterns 对照）

- Node v25.7.0，仓内无 `.nvmrc`；vitest 固定 node 环境（vitest.config 明文「不做 jsdom 组件单测」）→ Node 25 localStorage 坑不适用
- `npx prisma generate` 已先于 tsc 执行（§3 规约）
- DB：`newkolmatrix-dev-db`（localhost:5434/kolmatrix），验收起点即 D-H 基线态（见 §9）

## 1. 逐条 acceptance 判定

### 1.1 `GET /api/nav-badges`：{today: PendingAction(pending) 计数, projects: Project 计数}（tenantId 维度轻量查询）— PASS

- 实物：`src/app/api/nav-badges/route.ts`（21 行，runtime=nodejs，getDevTenantId → getNavBadgeCounts，失败 5xx）+ 计数单点 `src/lib/nav/badge-counts.ts:19-22`（`Promise.all` 两条 `count`，均带 `tenantId` where——轻量查询、租户维度成立）
- 行为实证（route handler 直调，不起 server）：
  - dev tenant 初态：`status: 200 body: {"today":0,"projects":4}`（4 = canonical 项目真值）
  - 临时 +1 条 pending PendingAction：`{"today":1,"projects":4}`（计数联动正确）
  - 清理后复原：`{"today":0,"projects":4}`（D-H 复原）

### 1.2 sidebar NAV_BADGE_MOCK 退役——client fetch on mount + 路由变化 revalidate，'use client' 不动布局 — PASS

- diff 核对（`git show 46c0359 -- src/components/sidebar/index.tsx`）：删除 `NAV_BADGE_MOCK` 常量（原 :18-24 假数 3/4/2），渲染处 :104 仅换数据源 `NAV_BADGE_MOCK[route.path]` → `badgeFor(badges, route.path)`；徽标渲染块 `{badge != null && <Badge …>}` 与全部布局结构（S1 ①-⑫ 12 元素）零变更；文件首行 `'use client'` 保持
- fetch 时机：`useEffect(…, [pathname])`（index.tsx:48-66）= mount 触发 + `usePathname()` 路由变化 revalidate；`cancelled` flag 防竞态
- 注：S1-12 宣示文案的 diff 为 prettier 换行（JSX 折叠为同一空格，渲染等价），非文案变更

### 1.3 计数 0 → 徽标隐藏 — PASS

- 代码：`badgeFor` 仅 `>0` 时返回数值，否则 null → 徽标不渲染（index.tsx:27-33 + :129）
- 集成测断言空租户全 0（nav-badges.test.ts:64-71）；重生后基线实拍确认「今天」入口无徽标（today=0）

### 1.4 洞察徽标退役（无真源不显假数 D2，恢复归 M4）— PASS

- `badgeFor` 只映射 `/today` 与 `/campaigns`，`/insight`（routes.tsx:42「洞察」）落到 `return null`——徽标退役
- 重生后基线实拍确认洞察入口无徽标（此前假数 2）

### 1.5 fetch 失败 → 徽标全隐藏不抛错 — PASS（附 OBS-F008-1）

- 代码：`r.ok` 为 false → data=null 早退；`.catch(() => {})` 吞错不抛；响应形状经 `typeof` 逐字段校验（非 number → 0 → 隐藏），坏 payload 不致渲染崩溃
- 首载失败：badges 保持 null → `badgeFor` 全返 null → 徽标全隐藏 ✅
- **OBS-F008-1（非阻断观察）：** 路由变化 revalidate 失败时保留上一次真值（「沿用旧值」，代码注释 :61 与 commit message 均明示此选择），与 acceptance 字面「全隐藏」有偏差。判定不阻断的理由：D2 实质（不显**假**数、不抛错）成立——旧值是真值非编造，且下次成功 fetch 自校正；首载失败路径（主风险面）严格符合字面。留 Planner 知悉，如按字面收紧仅需 catch 内 `setBadges(null)` 一行。

### 1.6 13 张 admin 页基线全量漂移逐处对账后重生（假数 3/4/2 → today 隐藏/projects=4/洞察隐藏；D-H 扩展）— PASS

- 基线清单 = 13 页（campaigns/creator-drawer/creators/en-today/insight/knowledge/project-brief/project-delivery/project-insight/project-match/project-reach/runs/agent-canvas）× darwin+linux，与 4 个 visual spec 的 13 个 `toHaveScreenshot` 一一对应
- 重生实物：`46c0359` 重生 **12 张 darwin**；`5ed8dfc`（update-visual-baselines workflow）重生 **12 张 linux**；`agent-canvas` 两平台字节不变——核实其页面 `/preview/agent-canvas` 在 `src/app/preview/` 下（`(console)` 布局组之外），全目录 grep 无 sidebar 引用 → 无侧栏无漂移，字节不变即正确对账结果（13 页全对账 = 12 重生 + 1 无漂移）
- 漂移方向逐像素对账（campaigns-darwin 前后版本实拍对比）：重生前 今天=3/项目=4/洞察=2（假数）→ 重生后 今天隐藏/项目=4（真值）/洞察隐藏；页面其余部分一致。D-B「today 徽标 3 vs 雷达 0」同页不一致就此消解
- 1500px 容忍带借绿：`46c0359` 自身 CI Visual regression 对旧 linux 基线 success（attempt 1，18:57Z）= 借绿实况，与 commit 自述一致；按 §4.2 意图变更仍强制重生（5ed8dfc，19:00Z）不借绿——处置正确
- D-H：重生环境为清态的间接证据 = 重生后基线 today 徽标隐藏（PendingAction=0 才成立）+ 现库清态（§9）

### 1.7 集成测计数正确性（打真库）— PASS

- `tests/integration/nav-badges.test.ts`（72 行，夹具租户 `test-tenant-m2a-badges-<pid>` 隔离）：3 pending 计入 / 1 executed 不计 / projects=2 / 空租户全 0（租户隔离）
- 单独 verbose 实跑：2/2 passed；afterAll 清理有效（跑后库中仅剩 dev tenant，见 §9）

### 1.8 needle grep NAV_BADGE_MOCK 零残留 — PASS

- 全仓 grep（ts/tsx/js/mjs/json）唯一命中 = `features.json`（acceptance 文本自身），代码零残留

### 1.9 lint + tsc + test:unit + test:visual 绿 — PASS

| 项 | 本机实测（2026-07-22） | CI @ HEAD 3d93f72（run 29951617484） |
|---|---|---|
| lint | `next lint` ✔ No warnings or errors | Lint success |
| tsc | `npx tsc --noEmit` exit 0（prisma generate 先行） | Typecheck success |
| test:unit | vitest 28 files / **307 passed** | Unit + integration tests success |
| test:visual | 端口纪律不由本 subagent 起 server；READINESS 实测 **13/13 passed**（darwin，23.9s） | Visual regression success（linux，对 5ed8dfc 重生基线） |

## 2. L2 边界

- F008 无外部服务依赖（两条本地 DB count），无 L2 项；未动用网关。

## 3. 临时数据处置（D-H）

- 本验收产生：route 直调探针 1 条 PendingAction（脚本内即建即删）+ 集成测夹具租户（afterAll 自清）
- 终态复查（psql @ newkolmatrix-dev-db）：`MatchPlan|0 · PlanKol|0 · MatchCandidate|0 · PendingAction|0 · OperationLog|0 · Tenant|1(dev) · Project|4` — 基线清态保持 ✅（见 §9）

## 9. 关键证据摘录

```
$ grep -rn NAV_BADGE_MOCK（全仓代码）→ 仅 features.json acceptance 文本命中
$ node --import tsx route-direct.ts
  status: 200 body: {"today":0,"projects":4}
  after +1 pending: {"today":1,"projects":4}
  after cleanup: {"today":0,"projects":4}
$ npx vitest run tests/integration/nav-badges.test.ts → 2 passed
$ npm run test:unit → Test Files 28 passed / Tests 307 passed
$ npx tsc --noEmit → exit 0；npm run lint → ✔ No ESLint warnings or errors
$ gh run view 29951617484（HEAD 3d93f72 CI）→ Lint/Typecheck/Unit+integration/Visual regression/Build 全 success
$ docker exec newkolmatrix-dev-db psql … → Match 三表 0 | PendingAction 0 | OperationLog 0 | Tenant 1 | Project 4
基线实拍对比：46c0359~1 campaigns-darwin（今天3/项目4/洞察2）→ 46c0359（今天隐藏/项目4/洞察隐藏），其余像素一致
```
