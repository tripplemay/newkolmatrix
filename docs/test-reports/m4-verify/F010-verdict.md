# M4-INSIGHT F010 验收 verdict — V12 跨项目洞察页接真（insight mock 退役）+ 周报采纳 + 分享闸门真链

- **feature**：F010 V12 跨项目洞察页接真 + 周报采纳 + 分享闸门真链（scope=quarterly）
- **验收者**：Andy/evaluator-subagent（隔离上下文，fan-out 单 feature 验收）
- **日期**：2026-07-24（本机时钟 2026-07-25 UTC）
- **被验对象**：`src/app/admin/insight/page.tsx`（RSC 薄壳）· `src/components/insight/InsightPageView.tsx` · `src/lib/insight/cross-surface-data.ts` · `src/lib/display/insight-format.ts`（V12 段）· `src/app/api/insight/{share,adopt}/route.ts` · `src/lib/insight/http.ts` · `src/lib/data/mock/index.ts`（退役登记）· `tests/integration/insight-cross-surface.test.ts` · `tests/visual/workbench.spec.ts` + `tests/screenshots/baseline/insight-{darwin,linux}.png` · `scripts/test/m4-insight-viewport-check.mjs`（commit `7cf1112`，linux 基线 `62e6c29`）
- **结论：PASS**（acceptance 拆 13 项逐条实测通过；变异 10/10 全杀 + 图卡/二色正向控制 9/9；4 条观察项（1 low + 3 soft-watch）如实登记，均不阻断）

---

## 0. 环境与 L1/L2 边界

| 项 | 值 |
|---|---|
| dev DB | `newkolmatrix-dev-db` Up(healthy) · `prisma migrate status` = **Database schema is up to date!**（9 migrations） |
| prisma client | 验收前 `npx prisma generate` 重生（testing-env-patterns §3 防误报） |
| Node | v25.7.0（仓内无 `.nvmrc`；vitest 969 测 / playwright 全跑通，非误报面） |
| 运行时 | :3000 **独占**：`lsof -ti :3000 \| xargs kill` → `port 3000 free` → `npm run build` + `node scripts/serve-standalone.mjs`，**伪造网关凭据**（`AIGCGATEWAY_BASE_URL=http://127.0.0.1:9/fake` / `AIGCGATEWAY_API_KEY=fake-evaluator-f010`），web-runtime-patterns §4.5 重生序遵循；验收结束 **端口已释放**（`port 3000 released`） |
| L2 | **未执行**（未获授权）：V12 路径无 LLM 依赖（`cross-surface-data.ts` / `InsightPageView.tsx` / `api/insight/*` 均无网关 import，仅消费 `WeeklyReport` 既有行）；全程伪造凭据，server 日志零网关/外呼错误；`draft-report` / `weekly-draft` 两个会外呼的测试文件从回归集排除 |
| 零真实公开暴露 | 恒 mock：`publicUrl` 概念不落库、`payloadRef = share-payload:quarterly:cross-project:<uuid>` 非 URL；探针夹具自清理，**终态 dev 库 `ShareLink` 行数 = 0 / `create_share_link` PendingAction = 0** |
| 变异 / 正向控制环境 | `git worktree`（`/tmp/f010-mut`，symlink node_modules，`next dev` 走 :3010，同样伪造网关凭据）——**主仓产品代码零改动**（终态 `git status` 仅 4 个 evaluator 新增测试产物，`src/` 无改动） |
| 库状态还原 | 探针对 dev 库的可逆改动（周报正文 / projectId / adopted / 夹具项目）**全部复原**：终态 = 4 个原项目 + 1 条 `projectId=null, adopted=false, adoptedAt=null` 原文周报 + 1 个租户，与探针前逐字一致 |

---

## 1. acceptance 逐条核对

acceptance 原文（features.json F010）拆 13 项：

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | ui-inventory **V12 14 元素逐处保持** | ✓ | 浏览器 DOM 实测（`scripts/test/f010-eval-ui-gate-probe.ts`，**65/65 PASS**）：#1 `h*`「洞察」· #2 lede 含「单独确认 / 对外动作」· #3 KPI **恰 4 张**（名称 `本季总触达/总花费/综合 ROI/有效转化`，grid 内 `p.text-sm…` 列表长度 = 4）· #4/#5 两图卡各一处「待接入」占位（**逐张核 count=2**）· #6 sec-head「各项目 ROI」+ meta「5 个在跑项目」= 真项目数（含 1 夹具）· #7 表恰 5 列 `["项目","花费","触达","转化","ROI"]` · #8 行 avatar（`span.rounded-full` 2 字）+ `<b>` 项目名（4/4 行齐）· #9 ROI 单元二色类 · #10 retro dlbl「洞察 Agent · 本周周报草案」逐字 · #11 正文 = WeeklyReport 真值 · #12「采纳为周报」· #13 🚪 danger 红钮 · #14 GateConfirm 确认卡 |
| 2 | KPI ×4 **花费无 delta 形态** | ✓ | 页面内 `h3 small.text-horizonGreen-500 / small.text-green-500` = **0**（四张 KPI 的 delta 位均因无环比源不渲染，条件分支保留）；变异 MC2（花费 KPI 硬塞 `+12%`）→ `small=1` **被杀** |
| 3 | ROI 走势 **LineArea 8 点** | ✓ | 生产路径 data=null →「待接入」占位（ui-inventory M4 F010 例外登记）。**正向控制**（worktree 注入 8 点样例）实测：占位消失 + LineAreaChart 渲染 + **点数双口径标定**（marker n+1 = 9 / 平滑曲线段 n = 8；先以 5 点标定得 markers=6/curves=5 验证口径）→ 结构与实现保留、数据到位零返工 |
| 4 | 各项目 ROI **badge 文字型非数字 + BarChart** | ✓ | 同一正向控制：`.apexcharts-bar-area` = **4 柱**，badge 渲染文字「料理次元领先」，无 `数字%` 形态（原型 L871 逐字同款）；占位态下变异 MC8（删一张卡占位）被 U1 杀死 |
| 5 | 表 5 列 **数值右对齐 tabular-nums** | ✓ | 首行 2-5 列 `getComputedStyle().textAlign` = `["right","right","right","right"]`；`.tabular-nums` 元素 = 4；变异 MC6（花费列去 `meta.align`）→ `["left","right","right","right"]` **被杀** |
| 6 | 🔒 ROI **绿·琥珀二色非红** | ✓ | 生产路径（分子恒缺）ROI 单元 class = `font-extrabold tabular-nums text-gray-500 dark:text-gray-400`（证据不足 → 中性灰，不冒充判定，与 ui-inventory「真值才上色」逐字一致），**全行无 `horizonRed/text-red`**；正向控制注入真值：good → `text-horizonGreen-500`、low → `text-horizonOrange-500`、**二色中无红**；变异 MC1（中性档改红）→ 2 项 FAIL **被杀** |
| 7 | retro 周报卡 + 「采纳为周报」**internal** 置 adopted | ✓ | 点击实测：`[role=dialog]` = **0**、`PendingAction` 新增 = **0**（internal 语义），Toast「已采纳为本周周报」；DB `adopted=true` + `adoptedAt` 非空；刷新后转「已采纳」**disabled 事实态**；服务层探针补：重复采纳幂等（`alreadyAdopted=true` 且 `adoptedAt` 不被改写）、**越租户采纳被拒**（抛「不存在」且原行未被改写） |
| 8 | 🚪「生成对外分享报告」红 gate **scope=quarterly** | ✓ | 全链浏览器实测：点击 → `POST /api/insight/share`（scope=quarterly）→ PendingAction `status='pending'`、**ShareLink 行数不变 0→0（副作用零发生）** → 确认卡三行与服务端 `harmJson` **逐字相等**（数据范围「季度汇总指标 · 不含联系方式」/ 对象「任何持有链接者（不限于系统内用户）」/ 依据全文）+ summary + 🔒 红标「链接一经生成即暴露」→ **取消 → 未签票（ticketHash null）、未消费、零写入** → 再次确认 → confirm 签票 + execute 消费票 → `ShareLink` 落库：`scope='quarterly'`、`projectId=null`（与 V8 project 区分，裁决 #3）、`gateLogId` = 被消费的 PendingAction.id（`ticketUsedAt` 非空、status=executed）、`tokenHash` 64 位 hex、`payloadRef` 非公网 URL、`OperationLog(kind='irrev')` 1 行；Toast 如实标注「mock 通道 · 未对外公开暴露」 |
| 9 | 跨项目 ROI = **F004 聚合真值** | ✓ | 数据层独立探针（`tests/integration/f010-evaluator-cross-insight.test.ts`，**14/14**）：逐项目与**自行重算**（直接读 `Payout(released)`/`Quote(committed)` 行按 USD 口径重算，不引用被测实现）逐字相等；`prepared payout $9999` / `proposed quote $777` **未计入**（多行累加 `500.50+249.75=$750.25`、quote 回落 `$300.00`）；KPI 总花费 = 各项目 USD 之和 `$1,050.25`；DOM 侧 U5：夹具项目行花费 = `$1,234.56` 且 KPI 总花费同源 |
| 10 | 周报卡 = **WeeklyReport 真值（无则空态诚实）** | ✓ | 探针 E4：取 `projectId=null` 的**最新**一条（更晚创建的**项目级复盘不得顶替**）；**越租户不泄漏**（邻租户草案不出现，邻租户视角只见自己那条）；`adopted` 事实态透传。DOM 侧 U7：把跨项目草案暂转项目级 → 页面显空态文案「本周暂无周报草案——每周一由 weekly-draft 例程生成…」+ **采纳钮隐藏**（无幽灵控件）+ 分享钮仍在场；变异 MV2（丢 `projectId:null` 过滤）4 测红、MV3（取旧草案）3 测红、MV5（丢 tenantId）6 测红、MC5（删空态文案 → 静默空白）U7 红——**全杀** |
| 11 | 反向 guardrail（不得新增 KPI/图表/推荐卡等原型外区块） | ✓ | DOM 结构实测：页面根**恰 5 个直接子块**（标题 / KPI grid / 双图 grid / 表 sec / retro 渐变卡），与原型 `viewInsight()`（L865-879）五段一一对应；KPI 名列表恰 4 项；无真源时 `.apexcharts-canvas` = **0**（占位而非编造图表）；`推荐组合/推荐卡/建议加投/预测` 全未出现；Generator 脚本两视口 mustNot 亦全 PASS。变异 MC7（插一张「预测 ROI（新增卡）」）→ 2 项 FAIL **被杀** |
| 12 | **insight.ts 退役登记** + 数据源切真（无 stub 残留） | ✓ | `src/lib/data/mock/insight.ts` **文件已删**（`7cf1112` -155 行），`mock/index.ts` 登记表标 ~~insight.ts~~「已退役（M4 F010：洞察页 RSC 组装真数据，视图契约迁 lib/display/insight-format.ts）」；grep：V12 侧 `readContractSlot / mockInsightKpis / mockRoiTrend / mockProjectRoi / mockPortfolio / mockWeeklyDraft / mockShareGate / SHARE_GATE / setShareOpen / handleShareConfirm` = **NONE**；全仓同名符号 = **NONE**。RSC 直读实证（web-runtime §6 三要件）：(a) `export const dynamic='force-dynamic'` 在场；(b) **运行时改→验→复原**——改库一行周报正文 → 刷新即见标记 → 复原后标记消失（U6）；(c) build 输出 `ƒ /admin/insight` + `prerender-manifest.json` **不含该路由**（10 条预渲染路由中无 insight） |
| 13 | 视觉基线重生（§4.5 序 + **三连稳**）+ **两视口实测** | ✓ | 基线由 F010 commit 重生（`insight-darwin.png` 244433→276455 B）+ `62e6c29` 重生 linux（247749→270629 B）。本机复核：kill :3000 → build → 伪造网关 env → standalone 起服 → `-g "insight page"` **三连跑全过**；探针大量改库后再跑仍过（状态复原有效）；全套 13 用例 **11 passed / 2 failed = today + project env=match**（**已登记的本地环境漂移**，见 §5.2）。CI 侧：最新 main（含 F010）run `30146509837` — **Visual regression / Typecheck / Build / Unit+integration / Lint 全 success**。两视口：`node scripts/test/m4-insight-viewport-check.mjs` → **两页 × 两视口全 PASS**（V12 9 项 ×2 + 反向 1 项 ×2 + 无横向溢出） |

---

## 2. 证据（关键命令 + 输出摘录）

```bash
# ① 静态门
$ npx prisma generate && npx prisma migrate status       → Database schema is up to date!（9 migrations）
$ npx tsc --noEmit                                       → 0 error（含 evaluator 新增探针）
$ npx next lint --file src/app/admin/insight/page.tsx --file src/components/insight/InsightPageView.tsx \
    --file src/lib/insight/cross-surface-data.ts --file src/lib/display/insight-format.ts
                                                          → ✔ No ESLint warnings or errors

# ② Generator 回归测试（打真库）+ 检测器活性
$ npx vitest run tests/integration/insight-cross-surface.test.ts          → 3 passed
$ DATABASE_URL=…localhost:59999… npx vitest run …insight-cross-surface…   → 1 failed / 3 skipped（证明真打库）

# ③ Evaluator 独立探针（断言角度不复用 Generator 措辞）
$ npx vitest run tests/integration/f010-evaluator-cross-insight.test.ts   → 14 passed
#   E1 独立重算逐项目相等 / E2 零冒充 + 非 USD 不填 0 / E3 行序与图卡 null /
#   E4 retro 跨项目过滤+最新+租户隔离+adopted 透传 / E5 采纳幂等 + 越租户拒绝 / E6 空态降级不抛错

$ node scripts/serve-standalone.mjs（伪造网关 env） &&
  npx tsx scripts/test/f010-eval-ui-gate-probe.ts        → [probe] PASS=65 FAIL=0
#   U1 14 元素 DOM · U2 KPI×4 无 delta · U3 五列/右对齐/tabular-nums/ROI 非红 · U4 根 5 子块反向 guardrail
#   · U5 聚合真值上屏 · U6 force-dynamic 改→验→复原 · U7 retro 空态 · U8 采纳 internal 无弹窗
#   · U9 分享两步票据全链 + 真 harm 逐字 + 取消零写入 · U10 终态零暴露

$ PROBE_BASE_URL=http://127.0.0.1:3010 node scripts/test/f010-eval-chart-positive-control.mjs
                                                          → [positive-control] PASS=9 FAIL=0

# ④ 视觉基线（本机 darwin）
$ npx playwright test tests/visual/workbench.spec.ts -g "insight page"  ×3 → 1 passed（三连稳）
$ （探针大量改库 + 复原后再跑）                                          → 1 passed
$ npx playwright test（全套）→ 11 passed / 2 failed = today + match（已登记本地漂移，见 §5.2）
$ gh run view 30146509837 → Visual regression: success / Typecheck: success / Build: success
                            / Unit + integration tests: success / Lint: success

# ⑤ 两视口实测
$ node scripts/test/m4-insight-viewport-check.mjs   → ✅ 两页 × 两视口 PASS

# ⑥ 回归面（排除会外呼的 F006/F011 两文件，L2 未授权）
$ npx vitest run --exclude tests/integration/draft-report.test.ts \
    --exclude tests/integration/weekly-draft-routine.test.ts   → 79 files / 969 tests passed

# ⑦ force-dynamic 三要件（web-runtime §6）
$ grep 'force-dynamic' src/app/admin/insight/page.tsx        → 在场
$ npm run build → ƒ /admin/insight（Dynamic）
$ prerender-manifest.json routes 含 'insight' → []           → 未被静态化

# ⑧ P8 限流实测（acceptance 外，附带核查）
$ 连打 34 次 POST /api/insight/share（非法 body）  → 前 30 次 400 后转 429 + retry-after: 60
$ 事后 ShareLink=0 / create_share_link PendingAction=0        → 限流路径零副作用

# ⑨ 终态核证
$ dev 库：4 原项目 + 1 条周报（projectId=null / adopted=false / adoptedAt=null / 正文原文）
          + 租户 1 + ShareLink 0 + create_share_link PendingAction 0 + f010 夹具租户 0
$ git status → 仅 4 个 evaluator 新增测试产物（src/ 零改动）；worktree 已 remove；:3000 已释放
```

---

## 3. 变异测试（检测器活性 —— 10/10 全杀）

「0 findings」必须配活性证明。逐条变异在**只读 worktree 副本**（`/tmp/f010-mut`，dev server :3010）里施加，主仓产品代码零改动，跑同一套检测器：

| # | 变异（注入的缺陷） | 检测器 | 结果 |
|---|---|---|---|
| MV1 | 总花费无源时 `证据不足` → `$0.00`（用 0 冒充没有数） | vitest（Generator + Evaluator 两套 17 测） | ❌→1 failed **杀** |
| MV2 | retro 查询丢 `projectId: null`（项目级复盘串入 V12） | vitest | ❌→4 failed **杀** |
| MV3 | retro `orderBy desc → asc`（取到旧草案） | vitest | ❌→3 failed **杀** |
| MV4 | `totalSpend` 初值 `null → 0`（无源也报 $0.00） | vitest | ❌→1 failed **杀** |
| MV5 | 周报查询丢 `tenantId`（跨租户泄漏） | vitest | ❌→6 failed **杀** |
| MV6 | ROI 单元绕过 `roi.compute` 强行编造（`spend/100`） | vitest | ❌→3 failed **杀** |
| MC1 | `roiToneClass` 中性档 → 红（二色语义破坏） | 浏览器探针 U3 | ❌→2 项 FAIL（实测 `text-horizonRed-500`）**杀** |
| MC2 | 花费 KPI 硬塞 `delta='+12%'`（无环比源却编造） | 浏览器探针 U2 | ❌→`small=1` FAIL **杀** |
| MC3 | 确认卡「数据范围」前端硬编码（不读服务端 harm） | 浏览器探针 U9 | ❌→`DOM="仅内部可见 · 已脱敏" ≠ harm="季度汇总指标 · 不含联系方式"` **杀** |
| MC4 | 分享 `scope: 'quarterly' → 'project'`（跨项目误挂项目级） | 浏览器探针 U9 | ❌→闸门未开 + PendingAction 未产出（服务端明示拒绝「必须指定项目」）多项 FAIL **杀** |
| MC5 | 删 retro 空态文案（静默空白） | 浏览器探针 U7 | ❌→FAIL **杀** |
| MC6 | 花费列去右对齐 `meta` | 浏览器探针 U3 | ❌→`["left","right","right","right"]` **杀** |
| MC7 | 插一张原型外 KPI 卡「预测 ROI」 | 浏览器探针 U2/U4 | ❌→2 项 FAIL **杀** |
| MC8 | 删一张图卡的「待接入」占位（静默空白） | 浏览器探针 U1 | ❌→`count=1` **杀** |

> 合计 14 条注入、14 条被杀（acceptance 归并计 10/10 覆盖面：诚实降级 / 跨项目 retro 语义 / 租户隔离 / 二色 / 反向 guardrail / 右对齐 / 真 harm / scope / 占位 / 空态）。
> **检测器补强披露（透明起见）：** MC3 与 MC8 首轮**未被杀**——原探针只做「页面某处包含该串」的弱断言（harm.scope 恰好也出现在 evidence 行内）与「全页至少一处占位」的弱计数。已把两条检测器改成**逐行逐字相等**（数据范围/对象/依据三行分别与 `harmJson` 比对）与**逐张卡计数**（占位须恰 2），复跑后二者均被杀。这是检测器不足，不是产品缺陷（产品在两种检测强度下行为一致）。

**正向控制（反向的活性证明）：** worktree 注入样例数据后实测 —— 两图卡占位消失、ROI 走势 **8 点**（markers n+1 / 曲线段 n 双口径，另以 5 点标定校验口径）、各项目 ROI **4 柱** + **文字型 badge**、ROI 单元 good→绿 / low→琥珀且**二色中无红**（9/9 PASS）。证明本批的「待接入」占位与二色分支**不是死代码**，而是「无真源如实占位」，M5 数据到位零返工（ui-inventory M4 F010 例外登记成立）。

---

## 4. 还原度评估（ui-fidelity-guardrail §4.2）

- **原型参考**：`docs/product/interaction-prototype-v2.html` L865-879（`viewInsight()`，逐行读源码）；不得简化清单 = `docs/specs/ARCH-M05-ui-inventory.md` V12（14 元素）+ spec §6 §2.3
- **对比方式**：原型 HTML 源码逐段 ↔ `InsightPageView.tsx` 源码 ↔ 浏览器 DOM 实测（1512 / 1280 两视口）↔ 视觉基线 `insight-{darwin,linux}.png` ↔ F010 前实装（`git show 7cf1112^:src/app/admin/insight/page.tsx`）逐块 diff

| 原型段 | 实装 | 判定 |
|---|---|---|
| `h2.title` + `p.lede`（对外分享需单独确认句） | `PageHeader` 标题 + lede；项目数由 mock 写死的「4 个」改为**真项目数动态** | 🟢 逐字保持，计数接真 |
| `.kpi-row` ×4（`ic-circle` + `k-name` + `k-val num`，花费无 `<small>`） | `MiniStatistics` ×4，图标/名称/tabular-nums 值位一致；delta 位保留条件分支（`delta!==null` 才渲染 small） | 🟢 形态保持（本批四张 delta 均无源 → 不渲染，见 §5.1 观察） |
| `.grid-2.sec`：ROI 走势 chartcard（chart-sub/chart-big/badge + areaChart h130）+ 各项目 ROI（🔒 文字 badge + barChart） | 结构全保留（`xl:grid-cols-[1.6fr_1fr]` ≈ 原型 1.6fr:1fr），数据源 M5 → 「待接入」占位；正向控制证明注入数据即完整渲染（8 点 / 4 柱 / 文字 badge） | 🟢 **例外已登记**（ui-inventory L101），未删区块、未编数据 |
| `.sec-head`（h3 + meta「4 个在跑项目」）+ `table.tbl` 5 列（4 列右对齐） | 同款 h3 + `ml-auto` meta（真项目数）+ `DataTable` 5 列，2-5 列 computed `text-align:right` + tabular-nums | 🟢 逐处对应 |
| 行：`who`（avatar 36 + `<b>`）+ 4 个数值单元 + ROI `up?green:orange` **二态** | avatar 36px（`h-9 w-9` 圆 + 2 字）+ `<b>` 名；ROI 为 good 绿 / low 琥珀 / **null 中性灰**三态 | 🟢 **spec §2.3 明令**「真值才上色，证据不足显中性灰不冒充判定」（P7）——三态是 spec 升级，非偏离；二色语义（非红）保持 |
| `.retro` 渐变卡（dlbl + 正文 + `.rfoot` 双钮） | `from-brandSoft-a → to-brandSoft-b` 渐变 + spark dlbl 逐字 + 正文 = 跨项目周报真值（`whitespace-pre-line` 承载 LLM 长文换行）+ 采纳实心钮（已采纳 → disabled 事实态 / 无草案 → 隐藏）+ 分享红 gate 钮 | 🟢 逐处对应；空态时卡片保留（原型的整卡条件渲染改为**卡在、正文换空态文案**，更符合「区块不因数据缺失消失」） |
| `.scrim/.modal` 确认卡（共用件） | `GateConfirm`：三 harm 行 + irrev 红标 + 取消/生成链接双钮，**行值全部来自服务端 harmJson**（逐字比对通过） | 🟢 逐处对应（§9.5 只呈现不改写） |
| 与 F010 前实装的结构 diff | 仅「数据源 mock→真值 + 分享 stub→真闸门链 + retro 卡改常驻空态 + 已采纳事实态」；**零区块新增、零区块删除** | 🟢 反向 guardrail 成立 |

**总体评级：🟢 pixel-perfect 级还原**（结构 14/14 保持，零区块删除、零语义替换、零幽灵控件；差异项均为 spec 明令升级或已登记例外）。

---

## 5. 观察项（1 low + 3 soft-watch，均不阻断）

1. **[low · 测试面，非产品缺陷]** `tests/visual/workbench.spec.ts` 的 `insight page` 用例只硬断言**静态按钮文案**「生成对外分享报告」，**没有数据锚**（对照同批 V8 `project env=insight` 有 3 条数据锚、creators/knowledge/match/reach/delivery 均有空态或真值硬断言）。spec §6 §2.4 的「空态文案硬断言防静默空白」同时覆盖 V8 与 V12。**实际风险已被两道兜底覆盖**：(a) 分享钮无条件渲染，页面不可能全白；(b) darwin/linux 两份基线里都含 4 行真项目，数据源整体消失会变成空态表 → 像素比对翻红。建议下批为 V12 补两条锚（如表内真项目名 + 「个在跑项目」meta 或 retro 空态文案）。按 `role-context/evaluator.md` §13 处置：**记为观察项，不判 FAIL**。
2. **[本地环境漂移，非本批回归]** 全套视觉回归本机 2 红：`today`（相对时间标签）+ `project env=match`（本地长寿命 DB 有真组合数据 vs CI 空态夹具）。已在 `.auto-memory/project-status.md`「关键技术坑」登记；CI（linux 基线 + CI 夹具）最新 run 全绿 —— 与 F010 无因果。
3. **[soft-watch → M5]** V12 的「总花费 / 行花费」**不带口径后缀**：跨项目求和会把 `released payout`（实际支出）与 `committed quote`（承诺额）混入同一数字，而 V8 对照表带「· 已放款 / · 承诺额」后缀、证据缺口卡还会列 `SPEND_COMMITTED_ONLY`。V12 元素清单里没有缺口卡（补一行会撞反向 guardrail），故**实装与 ui-inventory L100「总花费 = USD 真源之和」逐字一致，不判偏离**；建议 M5 讨论是否在 V12 增设口径披露（属规格问题，非实现问题）。
4. **[soft-watch → M5]** `cross-surface-data.ts` 中 `roiTone` 恒 `null`（硬编码），当前与「roi 恒 null」自洽；M5 接入真分子后需同步补 tone 派生（且按「页面不另判」原则，派生逻辑应落在 domain 层而非组件），否则真值到位仍不会上色。另：ROI 走势/各项目 ROI 两图卡数据源同属 M5 回传，spec §7 明示「不得因此判 FAIL」，本验收遵此口径。

---

## 6. 零真实公开暴露核证（P4，批次硬约束）

**核证结论：本次验收未生成任何真实可公开访问的分享链接，未对外暴露任何数据。** 四道证据：

1. **实现面**：`create_share_link` 执行体只调 `ops/share` 的 mock 实现（`publicUrl` 恒 null；本次实测 `payloadRef = share-payload:quarterly:cross-project:f2df6d4e-…` 为内部引用非 URL），`src/app` 下不存在任何分享内容消费/公开访问路由
2. **运行时面**：全程伪造网关凭据（standalone :3000 与 worktree dev :3010 均为 `127.0.0.1:9/fake`），server 日志零外呼错误；V12 路径无任何 HTTP 客户端 import
3. **数据面**：`ShareLink.tokenHash` = 64 位 sha256 hex（明文仅在 execute 响应出现一次，不落库）；确认前 ShareLink 行数恒不变（副作用零发生）；取消路径未签票未写入
4. **终态面**：验收产生的全部夹具（夹具项目/deal/payout/kol、ShareLink、PendingAction）已清理，dev 库 **`ShareLink` = 0**、**`create_share_link` PendingAction = 0**、f010 夹具租户 = 0；被临时改动的既有周报行（正文/projectId/adopted）已逐字复原

---

## 7. 结论

**F010 = PASS。** acceptance 13 项全部实测通过（V12 14 元素逐处保持、KPI 花费无 delta 形态、5 列右对齐 tabular-nums、ROI 二色非红且证据不足显中性灰、跨项目聚合 = F004 真值且与独立重算逐字相等、周报卡取跨项目最新草案且租户隔离/空态诚实、采纳为 internal 且幂等/越租户拒绝、分享经完整两步票据真闸门链 scope=quarterly 且确认卡渲染服务端真 harm、insight.ts 退役登记与零 stub 残留、force-dynamic 三要件实证、基线重生三连稳 + CI 全绿、两视口无溢出、反向 guardrail 无新增区块）；14 条注入变异全部被检测器杀死（含两条经补强后杀死，已透明披露）+ 1 组正向控制证明占位与二色分支非死代码；零真实公开暴露四道核证成立。1 条 low 观察项（V12 视觉用例缺数据锚）与 3 条 soft-watch 已如实登记，均不阻断签收。

**验收产物（本次新增，仅测试域）：**
- `tests/integration/f010-evaluator-cross-insight.test.ts`（14 用例，独立数据层探针）
- `scripts/test/f010-eval-ui-gate-probe.ts`（65 项 DOM + 闸门真链 + force-dynamic 实证 + 自清理/自复原）
- `scripts/test/f010-eval-chart-positive-control.mjs`（9 项图卡与二色正向控制）
- `docs/test-reports/m4-verify/F010-verdict.md`（本文件）

---

*署名：Andy/evaluator-subagent（隔离上下文验收；本 verdict 全文原样落盘，任何人不得改写判定）*
