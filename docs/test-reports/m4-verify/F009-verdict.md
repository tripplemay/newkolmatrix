# M4-INSIGHT F009 验收 verdict — V8 项目级对照账本接真（env-insight mock 退役）+ 分享闸门真链

- **feature**：F009 V8 项目级对照账本接真 + 分享闸门真链（scope=project）
- **验收者**：Andy/evaluator-subagent（隔离上下文，fan-out 单 feature 验收）
- **日期**：2026-07-24（本机时钟 2026-07-25 UTC）
- **被验对象**：`src/components/envs/insight/index.tsx` · `src/lib/insight/surface-data.ts` · `src/lib/display/insight-format.ts` · `src/app/api/insight/{share,adopt}/route.ts` · `src/lib/insight/http.ts` · `src/components/project/ProjectDetail.tsx` · `src/app/admin/campaigns/[id]/page.tsx` · `src/lib/data/mock/index.ts`（退役登记） · `tests/visual/workbench.spec.ts` + `tests/screenshots/baseline/project-insight-{darwin,linux}.png` · `scripts/test/m4-insight-viewport-check.mjs`（commit `0f05af8`，linux 基线 `2346b40`）
- **结论：PASS**（acceptance 12 项逐条实测通过；变异 10/10 全杀；3 条 soft-watch + 1 条 acceptance 文本漂移告知，均不阻断）

---

## 0. 环境与 L1/L2 边界

| 项 | 值 |
|---|---|
| dev DB | `newkolmatrix-dev-db` Up(healthy) · `prisma migrate status` = **Database schema is up to date!**（9 migrations） |
| prisma client | 验收前 `npx prisma generate` 重生（testing-env-patterns §3 防误报） |
| Node | v25.7.0（仓内无 `.nvmrc`，vitest/playwright 全绿，非误报面） |
| 运行时 | :3000 独占：`lsof -ti :3000 \| xargs kill` → port-free → `npm run build` + `node scripts/serve-standalone.mjs`，**伪造网关凭据**（`AIGCGATEWAY_BASE_URL=http://127.0.0.1:9/fake` / `AIGCGATEWAY_API_KEY=fake-…`），web-runtime-patterns §4.5 重生序遵循；验收结束端口已释放 |
| L2 | **未执行**（未获授权）：V8 路径无 LLM 依赖（`surface-data.ts` / `insight/index.tsx` / `api/insight/*` 均无网关 import）；全程伪造凭据，server 日志零网关/连接错误；`draft-report` / `weekly-draft` 两个会外呼的测试文件从回归集排除 |
| 零真实公开暴露 | 恒 mock：`publicUrl` 概念不落库、`payloadRef` 非 URL；探针夹具自清理，**终态 dev 库 `ShareLink` 行数 = 0** |
| 变异环境 | `git worktree`（`/tmp/f009-mut` `/tmp/f009-pos`，symlink node_modules，dev server 走 :3010）——**主仓产品代码零改动**（`git status` 已跟踪文件无改动） |

---

## 1. acceptance 逐条核对

acceptance 原文（features.json F009）拆 12 项：

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | ui-inventory **V8 19 元素逐处保持** | ✓ | 浏览器 DOM 实测（`scripts/test/f009-eval-ui-gate-probe.ts`，41/41 PASS）：#1-4 表头 `指标/原目标/实际/差异` + 4 行 `目标曝光 / 花费 · 已放款 / 有效转化 / ROI`；#5 eyebrow「证据缺口 2」；#6 gaprow ×2；#7-#14 两图卡结构保留（本批数据源 M5 → 占位，**正向控制实证**见第 3 节）；#15-17 retro 渐变卡 dlbl「Agent 复盘草案 · 采纳后可复用到下个项目」+ 正文 = WeeklyReport 真值；#18「采纳结论」；#19 🚪「生成对外分享报告」danger 变体。与 ARCH-M05 F012 首验 19/19 清单逐条对齐 |
| 2 | 对照表 4 列 **三值三样式差异列不得压二态** | ✓ | 造三个真实项目（低于预算 / 超预算 / 持平）DOM 取差异单元 class：`text-horizonGreen-500\|\|-60%`（up）· `text-horizonRed-500\|\|+50%`（down）· `text-gray-500 dark:text-gray-400\|\|+0%`（flat 中性）。**三值均由真实数据可达**（集成探针 E1：`dirs.size === 3`），非死代码；变异「压二态」被 U2 当场杀死（MC1） |
| 3 | 证据缺口卡 gaprow ×N 诚实边界 = `attribution.gaps` 真值 | ✓ | 集成探针 E4 对 6 个夹具项目逐项目比对：页面 `gaps[]` 与独立重算 `attributionGaps(facts).gaps→标签` **逐字相等**；quote-only → `SPEND_COMMITTED_ONLY`（弱证据不与 `SPEND_ABSENT` 压成一码）；非 USD 唯一真源 → `SPEND_ABSENT` 三缺口（不吞）；payout USD → 恰 reach/conversions 两条。eyebrow 计数 = 缺口行数（DOM 实测「证据缺口 2」+ gaprow=2） |
| 4 | 渠道 BarChart **5 柱** | ✓ | 生产路径 data=null → 「待接入」占位（ui-inventory M4 F009 例外登记）。**正向控制**（worktree 注入样例数据）实测：`.apexcharts-bar-area` = **5**，chart-sub / chart-big / 绿 badge 全渲染 → 结构保留、数据到位零返工 |
| 5 | 受众 donut 150 + **中心叠加读数** + legend | ✓ | 同上正向控制：donut 盒 `h-[150px] w-[150px]` 在场、`.apexcharts-pie-area` = **4**、中心叠加 `71% / 休闲玩家` 渲染、legend 4 行色块 + 标签渲染；占位态下变异「删占位」被 U1 杀死（MC4） |
| 6 | retro 卡 | ✓ | DOM 实测正文 = 夹具 WeeklyReport `draftContent` 原文；取**最新项目级**草案（探针 E5：两条草案取新的一条）；跨项目周报（`projectId=null`）不串入 V8（变异 MV4 杀）；无草案 → 空态文案「暂无复盘草案…」 |
| 7 | 「采纳结论」**internal 无弹窗** | ✓ | 点击实测：`[role=dialog]` = **0**，仅 Toast「复盘结论已采纳，加入下季度默认组合」；库内 `WeeklyReport.adopted=true` + `adoptedAt` 非空；刷新后按钮转「已采纳」**disabled 事实态**；无草案时按钮**隐藏**（幽灵控件规则，ui-fidelity §3.3） |
| 8 | 🚪「生成对外分享报告」红 gate **scope=project** | ✓ | 点击 → 确认卡；执行后落库 `ShareLink.scope='project'` + `projectId = 当前项目`（裁决 #3 与 V12 quarterly 区分）；变异 MC3（scope 串成 quarterly）被 U5 一组断言杀死（8 FAIL） |
| 9 | 反向 guardrail：**无原型外新增区块** | ✓ | DOM 结构实测：InsightEnv 根**恰 3 个直接子块**（`recon 双列 grid` / `图卡双列 grid` / `retro 渐变卡`），与原型 `insight(p)` 三段一一对应；Generator 脚本两视口 mustNot（推荐组合 / 本季总触达 / KPI）全部未出现；1512 + 1280 两视口均无横向溢出 |
| 10 | ROI/差异值 = `roi.compute` 真值（**分子缺显证据不足**） | ✓ | 集成探针 E2：花费行 direction/delta 与独立 `compareGoal(budget, spend, {higherIsBetter:false})` 逐字相等；曝光行 = `computeRoi().exposure`；ROI 行恒 `insufficient_evidence` → 显「证据不足」。E3 全夹具扫描：**无任何单元格出现 `0` / `$0.00` / `0%`**；组件内无 `computeRoi/compareGoal/attributionGaps` 调用与任何阈值判断（grep 证：不另判） |
| 11 | 分享经**真闸门链**（POST 发起→GET 详情→confirm→execute，无 stub 残留 grep 证） | ✓ | 浏览器全链实测：点击 → `POST /api/insight/share` 产出**恰 1 条** PendingAction 且 `status='pending'`、**ShareLink 行数不变（0→0，副作用零发生）** → `GET /api/actions/[id]` 详情 → 确认卡渲染**服务端真 harm 原文**（数据范围/对象/依据/summary 四处逐字比对 `harmJson`，前端不改写；变异 MC2「前端硬编码 harm」被杀）→ 取消 → **无写入、票据未消费** → 再次确认 → confirm 签票 + execute 消费票 → `ShareLink` 落库（`gateLogId` = 被消费的 PendingAction.id、`ticketUsedAt` 非空、`tokenHash` 为 64 位 hex、`payloadRef` 非 URL）+ `OperationLog(kind='irrev')` **恰 1 行**。grep：组件内 `readContractSlot / mockEnvShareGate / SHARE_GATE / setShareOpen / handleShareConfirm` = **NONE**；全仓 `mockRecon/mockGaps/mockChannelChart/mockAudience/mockRetro/mockEnvShareGate` = **NONE** |
| 12 | 空态语义保留 · env-insight 退役登记 · 视觉基线重生（§4.5 序 + 三连稳）· 两视口实测 | ✓ | 空态：项目未命中 → 对照表空态硬锚「还没有度量事实——放款或承诺报价后自动生成对照账本」+ retro 空态 + 采纳钮隐藏 + 分享钮保留；`src/lib/data/mock/env-insight.ts` **文件已删**，`mock/index.ts` 登记表标 ~~env-insight.ts~~「已退役（M4 F009…）」；视觉基线 `project-insight-darwin.png` 由 F009 commit 重生并入 git（linux 由 `2346b40` update-visual-baselines 重生），本机 **三连跑稳过**；两视口（1512/1280）Generator 脚本 34 项全 PASS |

---

## 2. 证据（关键命令 + 输出摘录）

```bash
# ① 静态门
$ npx prisma generate && npx prisma migrate status      → Database schema is up to date!（9 migrations）
$ npx tsc --noEmit    → 仅 2 error，全部来自同批他人在飞产物 tests/unit/share-adapter.evaluator-probe.test.ts；
                        F009 相关面 = 0 error
$ npx next lint --file src/components/envs/insight/index.tsx --file src/lib/insight/surface-data.ts \
    --file src/lib/display/insight-format.ts --file src/app/api/insight/{share,adopt}/route.ts \
    --file src/lib/insight/http.ts             → ✔ No ESLint warnings or errors

# ② Generator 回归测试（打真库）
$ npx vitest run tests/integration/insight-surface.test.ts        → 7 passed
#   检测器活性（liveness）：DB 指向坏端口 → 必须红
$ DATABASE_URL=...localhost:59999... npx vitest run tests/integration/insight-surface.test.ts
                                                                  → 1 failed / 7 skipped（证明真打库）

# ③ Evaluator 独立探针（新增，断言角度不复用 Generator 措辞）
$ npx vitest run tests/integration/f009-evaluator-insight-surface.test.ts   → 16 passed
#   E1 三方向可达 / E2 与纯函数逐字相等 / E3 零冒充 / E4 缺口真值 / E5 retro / E6 图卡 null / E7 空态降级

$ node scripts/serve-standalone.mjs（伪造网关 env）&&
  npx tsx scripts/test/f009-eval-ui-gate-probe.ts       → [probe] PASS=41 FAIL=0
#   U1 19 元素 DOM · U2 三值三样式 class · U3 反向 guardrail 3 子块 · U4 pending 停闸门 + 真 harm
#   · U5 confirm→execute 落库/tokenHash/irrev · U6 采纳 internal 无弹窗 · U7 空态 · U8 终态零残留

$ PROBE_PROJECT_ID=… node scripts/test/f009-eval-chart-positive-control.mjs（worktree 注入样例数据）
                                                        → [positive-control] PASS=10 FAIL=0（5 柱 / 4 段 donut / 中心读数 / legend 4）

# ④ 视觉基线（本机 darwin）
$ npx playwright test tests/visual/workbench.spec.ts -g "project env=insight"   ×3 → 1 passed（三连稳）
$ npx playwright test（全套）→ 11 passed / 2 failed = today + match（**已登记的本地环境漂移**，见 §5）
$ gh run list --workflow CI --branch main
   f6a631b(F012) 及之后 = success（含 Visual regression job，-linux 基线）；
   0f05af8(F009) 当次 Visual 红 = 新基线 CI 首推必红的已知路径，已由 2346b40 重生拉回

# ⑤ 两视口实测（Generator 脚本，Evaluator 复跑）
$ node scripts/test/m4-insight-viewport-check.mjs   → ✅ 两页 × 两视口全 PASS（V8 11 项 ×2 + 反向 3 项 ×2 + 无溢出）

# ⑥ 回归面（排除会外呼的 F006/F011 两文件，L2 未授权）
$ npx vitest run --exclude tests/integration/draft-report.test.ts \
    --exclude tests/integration/weekly-draft-routine.test.ts   → 78 files / 955 tests passed

# ⑦ P8 限流实测（acceptance 外，附带核查）
$ 连打 34 次 POST /api/insight/adopt   → 前 27 次 404（业务拒绝）后转 429 + Retry-After（30/min/IP 生效）

# ⑧ 终态零暴露核证
$ ShareLink 全库行数 = 0 | create_share_link PendingAction = 0 | 探针夹具项目/租户 = 0
```

---

## 3. 变异测试（检测器活性 —— 10/10 全杀）

「0 findings」必须配活性证明。逐条变异在**只读 worktree 副本**里施加（主仓产品代码零改动），跑同一套检测器：

| # | 变异（注入的缺陷） | 检测器 | 结果 |
|---|---|---|---|
| MV1 | ROI 行「证据不足」→ `$0.00`（用 0 冒充没有数） | vitest（Generator + Evaluator 两套） | ❌→红（3 用例失败）**杀** |
| MV2 | `gaps` → `[]`（缺口被吞） | vitest | ❌→红（6 用例失败）**杀** |
| MV3 | 花费行极性翻转（`higherIsBetter:true`） | vitest | ❌→红（3 用例失败）**杀** |
| MV4 | retro 查询丢 `projectId` 过滤（跨项目周报串入 V8） | vitest | ❌→红（3 用例失败）**杀** |
| MV5 | 项目未命中改为抛错（降级兜底被拆） | vitest | ❌→红（3 用例失败）**杀** |
| MC1 | `deltaClass` 压二态（flat/null → 红） | 浏览器探针 U2 | ❌→`FAIL U2 差异列 flat → 中性灰`（实测 `text-horizonRed-500`）**杀** |
| MC2 | 确认卡 harm 前端硬编码（不读服务端） | 浏览器探针 U4 | ❌→2 项 FAIL（数据范围 / 对象与 `harmJson` 不符）**杀** |
| MC3 | 分享 `scope: 'project'` → `'quarterly'` | 浏览器探针 U5 | ❌→8 项 FAIL（落库 0 行 / scope / projectId / gateLogId / tokenHash…）**杀** |
| MC4 | 删除两图卡「待接入」占位（静默空白） | 浏览器探针 U1 | ❌→`占位 ×0` FAIL **杀** |
| MC5 | gaprow 区块不渲染 | 浏览器探针 U1 | ❌→`gaprow=0` FAIL **杀** |

另有**正向控制**（反向的活性证明）：在 worktree 注入 channel/audience 样例数据 → 两图卡 5 柱 / 4 段 donut / 中心叠加读数 / legend 4 行全部真渲染、「待接入」占位消失 → 证明本批的占位不是「代码已死」，而是「无真源如实占位」，数据到位零返工（ui-inventory M4 F009 例外登记成立）。

---

## 4. 还原度评估（ui-fidelity-guardrail §4.2）

- **原型参考**：`docs/product/interaction-prototype-v2.html` L806-817（`insight(p)` 渲染函数，逐行读源码）；不得简化清单 = `docs/specs/ARCH-M05-ui-inventory.md` V8（19 元素）+ spec §6 §2.3
- **对比方式**：原型 HTML 源码逐段 ↔ `src/components/envs/insight/index.tsx` 源码 ↔ 浏览器 DOM 实测（1512 / 1280 两视口）↔ 视觉基线 `project-insight-darwin.png`

| 原型段 | 实装 | 判定 |
|---|---|---|
| `.recon` 双列（对照表 `tbl` 4 列 + 证据缺口卡） | `xl:grid-cols-[1.15fr_0.85fr]`；DataTable 4 列（原目标灰 / 实际 navy-700 fw700 / 差异 fw800，右对齐 tabular-nums） | 🟢 逐处对应 |
| 差异列颜色 | 原型只有 `up ? green : red` **二态**；实装为 up 绿 / down 红 / flat·null 中性灰**三态** | 🟢 **spec §2.3 明令三值三样式**（P7），实装遵 spec 而非原型二态——是升级不是偏离 |
| 证据缺口卡 eyebrow + `.gaprow ×N`（alert 图标 + 文案） | eyebrow「证据缺口 N」+ `MdWarningAmber` 琥珀 + 逐条真值；原型 3 条 mock 文案 → 真值 2/3 条（口径随数据） | 🟢 结构逐处保持，文案随真值（M4 例外登记允许） |
| `.grid-2.sec`：渠道 chartcard（chart-sub / chart-big / 绿 badge / 5 柱）+ 受众卡（eyebrow / donut 150 / 中心叠加 / legend 4） | 结构全保留，数据源 M5 → 占位「待接入」；正向控制证明注入数据即完整渲染 | 🟢 **例外已登记**（ui-inventory L84），未删区块、未编数据 |
| `.retro` 渐变卡（dlbl + 正文 + `.rfoot` 双钮） | `from-brandSoft-a → to-brandSoft-b` 渐变 + spark 图标 dlbl 逐字 + 正文 = 真草案 + 采纳实心钮 + 分享红 gate 钮 | 🟢 逐处对应（正文改 `whitespace-pre-line` 承载 LLM 长文换行，语义无损） |
| 原型无「底部 shield 宣示」段 | 实装同样无 | 🟢 一致（见 §5 文本漂移说明） |

**总体评级：🟢 pixel-perfect 级还原**（结构 19/19 保持，零区块删除、零语义替换、零幽灵控件；三处差异均为 spec 明令升级或已登记例外）。

---

## 5. 观察项（soft-watch / 告知，均不阻断）

1. **[acceptance 文本漂移]** features.json F009 acceptance 列出「…/ 🚪 生成对外分享报告红 gate scope=project / **底部宣示**）」——但**原型 V8 与 ui-inventory V8 19 元素清单里都没有「底部宣示」元素**（该元素属 V6 reach / V7 delivery），ARCH-M05 F012 首验的 19/19 清单亦无。实装无此元素 = 与 source of truth 一致。按 `role-context/evaluator.md` §13 处置：**直接记为 checklist 文本漂移，不判 FAIL**；建议下批把 acceptance 的这四个字删去，避免后续验收误判。
2. **[本地环境漂移，非本批回归]** 全套视觉回归本机 2 红：`today`（相对时间标签）+ `project env=match`（本地长寿命 DB 有真组合数据 vs CI 空态夹具）。已在 `.auto-memory/project-status.md`「关键技术坑」登记；独立复核：match 页本机实渲染出真数据（「待你裁定 / Agent 推荐 / 批准这组」在场）而非报错，且 CI（linux 基线 + 空夹具）最新 run 全绿——与 F009 无因果。
3. **[审计噪声]** dev 库 `OperationLog` 留有 11 条 `SHARE_CREATED` mock 观测标记（含本次验收产生的若干条）。审计表 append-only，故意不删；**不构成暴露**（`ShareLink` 表已清零、`payloadRef` 为内部引用非 URL、mock 服务无公网地址）。
4. **[本批范围外，登记给 M5]** V8 图卡（渠道/受众）与 ROI 分子（reach/conversions）无真源属 M5 回传——spec §7 明示「不得因此判 FAIL」，本验收遵此口径；正向控制已证明接入即渲染。

---

## 6. 零真实公开暴露核证（P4，批次硬约束）

**核证结论：本次验收未生成任何真实可公开访问的分享链接，未对外暴露任何数据。** 四道证据：

1. **实现面**：`create_share_link` 执行体只调 `ops/share` 的 mock 实现（`publicUrl` 恒 null，`payloadRef = share-payload:project:<pid>:<uuid>` 为内部引用），`src/app` 下不存在任何分享内容消费/公开访问路由
2. **运行时面**：全程伪造网关凭据（`127.0.0.1:9/fake`），standalone server 日志零外呼错误；V8 路径无任何 HTTP 客户端 import
3. **数据面**：探针实测 `ShareLink.tokenHash` 为 sha256（明文只在 execute 响应出现一次，不落库）；确认前 ShareLink 行数恒不变（副作用零发生）
4. **终态面**：验收产生的全部夹具（3 项目 / 2 周报 / payout / ShareLink / PendingAction / irrev 日志）已清理，**dev 库 `ShareLink` 行数 = 0**、`create_share_link` PendingAction = 0、探针租户 = 0

---

## 7. 结论

**F009 = PASS。** acceptance 12 项全部实测通过（19 元素逐处保持、三值三样式真可达且未压二态、缺口卡 = `attribution.gaps` 真值、ROI 诚实降级零冒充、分享经完整两步票据真闸门链且确认卡渲染服务端真 harm、mock 退役登记、基线重生三连稳、两视口无溢出、反向 guardrail 无新增区块）；10 条变异全部被检测器杀死 + 1 组正向控制证明占位区块非死代码；零真实公开暴露四道核证成立。3 条 soft-watch 与 1 条 acceptance 文本漂移已如实登记，均不阻断签收。

**验收产物（本次新增，仅测试域）：**
- `tests/integration/f009-evaluator-insight-surface.test.ts`（16 用例，独立数据层探针）
- `scripts/test/f009-eval-ui-gate-probe.ts`（41 项 DOM + 闸门真链实测 + 自清理）
- `scripts/test/f009-eval-chart-positive-control.mjs`（10 项图卡正向控制）
- `docs/test-reports/m4-verify/F009-verdict.md`（本文件）

---

*署名：Andy/evaluator-subagent（隔离上下文验收；本 verdict 全文原样落盘，任何人不得改写判定）*
