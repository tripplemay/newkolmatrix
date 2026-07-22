# M1-C-LIST-TODAY · F003 验收分报告 — 今天页 RSC 重构 + 雷达/KPI/feed 接真 + 无存处降级

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被验对象：** main @ `5a666a9`（F003 实现 commit `d222374`；linux 基线 `941bea7`）
- **验收环境：** 本地 standalone `http://127.0.0.1:3000`（main HEAD 构建产物）+ dev DB 容器 `newkolmatrix-dev-db`（4 canonical 项目，PendingAction/OperationLog 基线零行）
- **结论：PASS（逐条 acceptance 全过，零缺陷）**

---

## 1. 逐条 acceptance 判定

### 1.1 today/page.tsx 转 RSC；client 叶子边界 — PASS

- `grep -n "'use client'\|useRouter\|useState\|useEffect" src/app/admin/today/page.tsx` → 仅注释命中，**零指令零 hook**（exit=1）；页面为 `async function TodayPage()` RSC，`export const dynamic = 'force-dynamic'`（:55，防构建期静态化冻结数据，同 F001 fix 42a534a 口径）。
- client 叶子实测：`AgentSquad.tsx:1` 'use client'（island）+ `Button.tsx:1` 'use client'（Link 内视觉 island，acceptance 明示无碍）；`SurfaceCard` / `MiniStatistics` / `env-meta` 均无指令（server-safe）。chartcard（LineAreaChart）随数据源降级整体消失（区块保留，见 §1.5）——client 叶子少于 acceptance 上限，合规。
- 「进入项目」Link 化归零：RadarCard 内 `<Link href=... data-enter data-goenv>` 包 Button（page.tsx:252-264），无任何 router.push。
- 零 mock 依赖：`grep "lib/data/mock" page.tsx` → 0（F005 mock 整删的前置成立）。

### 1.2 AGENT_ICONS 迁出至 server-safe 单点 — PASS

- `src/components/common/agent-icons.ts` 新建，**无 'use client'**，导出 `AGENT_ICONS: Record<AgentId, IconType>`（7 人格全量）。
- 消费方 grep：today/page.tsx:34 从 `components/common/agent-icons` import（RSC 侧）；AgentSquad.tsx:14 import + :16 re-export（CopilotPanel.tsx:34 经 AgentSquad 消费零改动）。单点成立。

### 1.3 【D-A】雷达接 aggregatePending，三态实测 — PASS

代码层：

- `aggregatePending`（orchestrator.ts）select+返回含 `projectId/agentId`（F002 扩列到位）；页面单次调用后 `projectIds` 去重联 `Project`（含 game），`computeHealth` 的 null 因子组装与 `[id]/page.tsx` 同口径（targetExposure 取 goal、actual/spent=null、blockerCount=0 → D2 恒 cr）。
- 红标真源 = `harm?.irreversible === true`（page.tsx:189，符合 Planner 修订：PendingAction.kind 恒为 'gate'（gate.ts:75 实证），非 kind==='outbound'）。
- stage 深链 = `AGENT_STAGE`（STAGE_AGENT 反转，page.tsx:69-71）反查 agentId，回退 `project?.cur || 'brief'`。
- harm 经 `readContractSlot(harmSchema, ...)` 契约读取，脏数据降级不抛错（D2）。

运行时三态实测（fixture 改→验→立即恢复，D-H）：

1. **空态（基线零行）：** curl SSR HTML 命中「今天没有需要你确认的事——Agent 推进中…」可见文案 + SecHead「0 个待办在等你」——非 null，§4.3 反静默空白成立。
2. **有 pending 态：** 直插 3 条 fixture（`eval-f003-full`：projectId=xg + agentId=reach + 合法 harm irreversible=true / `eval-f003-mini`：无 projectId + irreversible=false / `eval-f003-dirty`：无 projectId + 脏 harm `{"broken":true}`）后 curl 实测：
   - 完整卡：《星轨协议》· 全球公测预热 + 三 pill（真 market/budget/health）+ harm.summary「向 3 位候选 KOL 发送首轮触达邮件」+ amt 合成「首轮触达 · 3 个对象 · $1,200」（scope·quantity·formatBudget）+ 红标「对外不可撤销」+ 深链 `href="/admin/campaigns/xg?env=reach"`（`data-enter="xg" data-goenv="reach"`，agentId 反查命中）+ 停在「触达谈判」。
   - 极简卡：「确认一份报价草案」无项目头（卡内无《星轨协议》段）、无「进入项目」钮（全页仅 1 个渲染实例）、无红标（irreversible=false 条件渲染正确）、环节回退「目标 Brief」。
   - 脏 harm 降级：title 回退 toolName「share_external」、amt 回退「工具「share_external」」——D2 不打死页面。
3. **恢复：** `DELETE WHERE id LIKE 'eval-f003-%'` → pending_rows=0，curl 复测空态文案回归。
- waitFor 硬断言：`tests/visual/dashboard.spec.ts:16-19` 新增 `getByText('今天没有需要你确认的事').waitFor()`（渲染 null 即超时硬红）。

### 1.4 【D-D】KPI 四位 + feed — PASS

- **待你确认 = 雷达同源：** 代码单次 `aggregatePending`，KPI 取 `pending.length`、雷达取同一 `pending` 数组（page.tsx:281/354/384）——防两处各算成立。实测：3 fixture 时 KPI=3 且 SecHead「3 个待办在等你」同步；清态后同步回 0。
- **进行中项目：** `prisma.project.count` 真值——实测 SSR 值 = 4（DB 4 行）。
- **Agent 今日完成：** `operationLog.count({kind:'auto', createdAt≥今日零点})`——基线态 0；F004 验收 agent 例程留痕 4 条期间实测同页 KPI=4（可见面闭环交叉验证）。
- **本月有效触达：** 「待接入」占位（PENDING_TEXT.connect）——SSR 实证。
- **delta 不渲染：** MiniStatistics `delta != null` 条件位，页面不传——SSR HTML KPI 段无 `<small>` 涨幅元素。
- **feed：** OperationLog `orderBy createdAt desc take 8`；空态可见文案「暂无 Agent 活动记录——例程与闸门动作会在这里留痕。」实测；非空态实测 4 条巡检行（actor 'strategy' 经 getPersona 映射「策略 Agent」、相对时间「3 分钟前」准确——`lib/display/relative-time.ts` 新建 + 单测随 test:unit 过）。

### 1.5 无存处区块保结构渲染占位 — PASS

- 「本月自动完成」chartcard：SurfaceCard 区块保留，值位「待接入」+ 图表位「趋势图待指标数据源接入」占位（设计稿保护规则不删区块；LineAreaChart 仅存注释，M4 回接登记在案）。
- 「团队负荷」：🔒 免责 eyebrow「团队负荷 · 单一角色，仅用于分工」逐字保留 + 「待接入 · 负荷度量尚无数据源」。
- 两块均在桌面/移动截图目检确认在位。

### 1.6 【D-B】侧栏徽标过渡态登记 — PASS

- `sidebar/index.tsx:18-22` NAV_BADGE_MOCK 原样未动（today=3/项目=4/洞察=2）；桌面截图可见 today 徽标 3 vs 雷达 0 的同页不一致——已在 page.tsx:17 注释、commit d222374 正文、session_notes 三处登记为过渡态，归 M1-D。预期非缺陷。

### 1.7 en-today.png 基线对账重生（D-H） — PASS

- darwin 基线随 d222374 重生（313026→309980 bytes），commit 正文逐处对账：漂移=KPI 真值+雷达空态+feed 空态+两卡占位，全为数据/占位级，布局结构零变化；D-H 清表决定论亦在正文声明。linux 基线经 update-visual-baselines workflow 重生（941bea7，316343→316626 bytes）。
- 本 Evaluator 于基线零行态针对性实跑 `npx playwright test tests/visual/dashboard.spec.ts` → **1 passed (2.3s)**（含空态 waitFor 硬断言 + 紧阈值截图比对）。

### 1.8 两视口实测 — PASS

- Playwright 亲测 standalone：desktop 1440×900 + mobile 390×844 两视口，六锚点（雷达头/编队/feed 头/chartcard/团队负荷/KPI）全命中，**console error 0**，全页截图目检布局正常（移动端单列堆叠无溢出）。

### 1.9 lint + tsc + test:unit 绿 — PASS

- 前置：`npx prisma generate`（testing-env-patterns §3）后 `npx tsc --noEmit` → **0 errors**；`npm run lint` → **No ESLint warnings or errors**；`npm run test:unit` → **12 files / 139 tests 全过**（含 relative-time 单测）。
- 本机 Node v25.7.0 ≠ CI Node 20（repo 无 .nvmrc）——本次全部通过，无 §4 误报情形需要豁免。

---

## 2. 环境与并发备注

- 全程未重启 :3000 standalone；fixture 实证严格「改→验→立即恢复」，本 agent 插入的 3 条 PendingAction 已删除并复测空态回归。
- 验收窗口内观测到 OperationLog 0→4→0（kind=auto 巡检行，F004 验收 agent 的 routine:health-scan 留痕与清态）——顺带用作 feed/KPI 非空态的真数据交叉验证，非本 feature 缺陷。终态 DB 校验：pending=0 / oplog=0 / projects=4（基线态复原）。
- 全量视觉套件 + p2 探针归就绪回归 agent，本报告只跑了 F003 针对性用例（dashboard.spec 单测过）。

## 3. 结论

**F003 = PASS。** 逐条 acceptance（含 Planner 修订口径）与 spec §2 F003 / §5 验收行全部实证通过，零缺陷、零 soft-watch 新增（D-B 徽标不一致为 spec 预登记过渡态）。
