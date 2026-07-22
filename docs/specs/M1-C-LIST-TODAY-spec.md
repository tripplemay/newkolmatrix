# M1-C-LIST-TODAY — 列表页/今天页真数据纵切 + 例程调度器最小闭环（普通批次）

> **批次类型：** 普通批次（全部 `executor:generator`），`planning → building → verifying → done`。
> **车道：** 快车道（单会话，Planner/Generator 主上下文，Evaluator 隔离 subagent）。无 `role_assignments`。
> **授权模式：** 用户 `/goal` 书面授权「按 harness 规则开 M1-C 并自动推进流程直到部署上线」——阶段切换按
> orchestration-patterns §6 授权+记账模式执行（session_notes 记账）；deploy 仍由既有 deploy-prod 链路执行。
> **Spec lock：** 2026-07-22 Planner 裁决 D1-D10（用户 /goal 授权范围内的 Planner 默认，全部基于三路勘查实物）。
> **事实依据：** planning 三路并行只读勘查（数据通道 / knowledge+例程 / 文档口径+基线影响面），结论均核到 文件:行。
> **上游：** M1-B-BRIEF（已上线 @ 19af7f1）——详情页 RSC 直读范式 + display 层 helpers + HealthBand/HEALTH_LABEL 单点。

---

## 1. 背景与目标

M1-B 证实了 mock→真数据契约层可平滑替换（详情页纵切一次成功）。M1-C 把同一范式扩展到**列表页与今天页**，
并立起 M1 官方清单（architecture.md:1798）剩余项中的**例程调度器**（最小闭环 health-scan）与**雷达聚合真数据**。
knowledge 域（2 新表 + 文件存储后端裁决 + 网关新调用范式）顺延 M1-D——存储后端属基础设施决策，留人类闸门。

**延续 M1-B 的诚实数据纪律：** 有真源接真源，无真源「待接入」降级或空态——不补 mock、不 seed 假指标、不打算法补丁。
接真后列表页/雷达 health 全 cr（全红）与雷达可能空态，都是数据可得性的诚实反映，M2/M3 指标落地后消解。

### 1.1 勘查核到的关键实物（全部 文件:行）

1. **列表页零障碍**：`campaigns/page.tsx:8` 'use client' 的唯一原因是 `:47` useRouter + `:94` router.push——换 `next/link` 即可整页转 RSC（stageHref 纯函数、Pill/ProjectAvatar/Card 均 server-safe）。
2. **今天页三个 client 叶子**：chartcard（react-apexcharts 经 dynamic ssr:false，`LineAreaChart.tsx:3-4`）；AgentSquad（已 'use client' island）；RadarCard 的进入钮（Link 化可归零）。⚠️ `AGENT_ICONS` 从 'use client' 模块 import（`today/page.tsx:32`）——RSC 不可用，须迁出至 server-safe 模块。
3. **雷达真数据缺口**：`PendingAction`（schema.prisma:171-186）无 projectId/agentId 列；`aggregatePending` 骨架已建（orchestrator.ts:45-68，读 status=pending + harm 原样透传）但未接今天页。
4. **例程留痕落点已就绪**：`OperationLogKind` 含 `auto`（schema.prisma:189）+ projectId/payloadJson 列已在（:209-210）——health-scan 例程零建表。5 条规划例程中仅 health-scan 本批可做（其余依赖 M2-M4 表），且纯计算不调网关（architecture.md:1180）。
5. **mock 退役前置链**：`mock/today.ts` 唯一消费方是今天页；`mock/projects.ts` 还有 `env-brief.ts:166-168` 的 getMockProject 消费点（xg 分流判定）+ LEGACY_ID_ALIAS（projects.ts:84-86，f007/f010 探针依赖 starlight-protocol→xg）。
6. **视觉回归面**：接真只动 campaigns.png / en-today.png 两张；en-today 的 waitFor『需要你确认』锚在无条件渲染的 SecHead（today/page.tsx:327-331），雷达空态不会超时。
7. **f008 探针历史漂移在案**（非 M1-C 引入）：§4 卡片 anchor 断言因列表卡是 router.push 早已中断（ARCH-M05-verify-B:65）、§5 todo link 期待 anchor 而 RadarCard 是 Button——**M1-C 的 Link 化恰好使这两条断言可复活**。

---

## 2. 功能范围（7 条，全 generator）

### F001 列表页 RSC 直读 Project

- `campaigns/page.tsx` 去 'use client' 转 RSC：`getDevTenantId()` + `prisma.project.findMany({ where: { tenantId }, include: { game: true }, orderBy: { createdAt: 'asc' } })`（**Planner 修订 2026-07-22**：seed 按 xg/lc/aw/mf 固定顺序 create，createdAt asc 在本地/CI/prod 三环境均确定且与 mock 卡序一致——零重排、零 avatar 色轮错位；原 slug asc 会把卡序变 aw/lc/mf/xg 引入纯噪声漂移）。
- 「进入」钮 Link 化：`<Link href={stageHref(p.slug ?? p.id, p.cur)}>` 包现有 Button 视觉（client 泄漏归零；Button 是 client island 无碍）。
- 展示字段映射（复用 M1-B display 层）：name/market 直读；game=关联 Game.name（avatar 首二字）；budget=`formatBudget`（与 mock 串同形，零漂移）；goal=`formatGoalText(parseProjectGoal(goal))`（D9 合成串）；health=RSC 内 `computeHealth`（null 因子组装口径与 `[id]/page.tsx:42-51` 逐字段一致）。
- 【D2 延续】四项目 health 全 cr 是预期非缺陷；「停在环节」「name/market/budget」与 mock 逐字一致零漂移。
- campaigns.png 基线漂移逐张对账（health pill×4 + goal 句×4，数据级 + goal 串变短的轻度高度变化）后重生；waitFor『只做进入』锚在 subtitle（:54）保留。
- lint + tsc + test:unit 绿。

### F002 PendingAction expand（projectId/agentId）+ aggregatePending 扩列

- expand 迁移：`PendingAction` 加 `projectId String?` + `agentId String?`（nullable，expand-contract，回滚安全）。
- 闸门创建点（`src/lib/agent/gate/` 内创建 PendingAction 处）从 `ToolContext.projectId` / `ToolContext.agentId` 填入两列——**只填不判**，null 合法。
- `aggregatePending`（orchestrator.ts:45）select + 返回结构扩 projectId/agentId 两字段；harm 仍原样透传。
- 回归测试：tests/ 内验证 aggregatePending 返回新字段；gate 创建路径带 ctx.projectId 时落列、不带时 null（复用既有 gate 测试基座）。
- lint + tsc + test:unit 绿（CI unit job 已起 DB，migrate deploy 自动应用）。

### F003 今天页 RSC 重构 + 雷达/KPI/feed 接真 + 无存处降级

- `today/page.tsx` 转 RSC 做数据读取；client 叶子仅三处：chartcard、AgentSquad（已 island）、（若保留钮语义）RadarCard 进入钮——**优先 Link 化归零**。`AGENT_ICONS` 迁出至 server-safe 模块（如 `components/common/agent-icons.ts`），AgentSquad 与 RadarCard 同源 import。
- **雷达接真（D-A）**：RSC 调 `aggregatePending(ctx)` → 有 projectId 的 pending 联 Project 行渲染完整卡（name/game/budget/health 真值 + title=harm.summary、amt=harm.amount/scope 合成、outbound 红标=kind==='outbound'）；无 projectId 的渲染极简卡（无项目头，深链省略）；stage 深链由 agentId 经 STAGE_AGENT 反查（无映射则链项目默认环节）。**空态必须渲染可见文案**（如「今天没有需要你确认的事」）——不得渲染 null（web-runtime-patterns §4.3 反静默空白）。
- **KPI 行接真（D-D）**：进行中项目=`project.count` 真值；待你确认=aggregatePending 条数（与雷达同源同一次查询，防两处各算）；Agent 今日完成=`operationLog.count({kind:'auto', createdAt:{gte:今日零点}})`（F004 落地前恒 0，诚实）；本月有效触达=无存处→「待接入」占位。delta 全部无存处→不渲染 delta。
- **feed 接真（D-D）**：OperationLog 最近 8 条（summary/actor/createdAt 相对时间），空则可见空态文案。
- **无存处降级（D-D）**：monthlyAutoDone chartcard 与 teamLoads 卡**保留区块结构**（设计稿保护规则：不删区块），内部渲染「待接入」占位；ENV_NAME 消费切到 `ENV_META[].name`（D-E 前置）。
- en-today.png 漂移逐处对账（雷达空态/KPI 数值/feed 空态/两卡占位——全部数据级+占位级，SecHead/布局结构不动）后重生；waitFor『需要你确认』不动，新增雷达空态文案的 waitFor 硬断言。
- 【过渡态记录】侧栏徽标（sidebar/index.tsx:18-22 NAV_BADGE_MOCK）本批不接真（D-B）：today 徽标 3 vs 雷达真值可能 0 的同页不一致，登记为已知过渡态（同 S2/S3 先例），徽标服务归 M1-D。
- lint + tsc + test:unit 绿；两视口实测今天页渲染正常。

### F004 例程调度器最小闭环（node-cron + health-scan）

- 新建 `src/lib/jobs/scheduler.ts`（node-cron 注册 + 进程内互斥锁：上一轮未结束不重入）+ `src/lib/jobs/routines/health-scan.ts`。
- 载体（D-C）：**node-cron 进程内**（ADR-20 二选一取此——docker 单容器自足，不动部署面/不需端点鉴权）。新增依赖 `node-cron`（+types）。`instrumentation.ts`（Next.js 标准钩子）在 `process.env.NEXT_RUNTIME === 'nodejs'` 时启动 scheduler；env 开关 `ROUTINES_DISABLED=true` 可关（默认开）；cron 表达式常量默认 `0 2 * * *`。
- health-scan 例程：读 tenant 全部 Project → 逐项 `computeHealth`（null 因子组装同页面/工具口径）→ 每项目写一条 `OperationLog { kind:'auto', actor:'strategy', projectId, summary:'例程巡检：《X》健康度 cr(26)', payloadJson:{score,band} }`。纯计算不调网关（architecture.md:1180）；无 outbound 动作，不涉闸门。
- 手动触发口：`npm run routine:health-scan`（scripts/ 直调例程函数，供实测与 Evaluator 验收，不依赖等 cron 到点）。
- 单测：例程核心逻辑（tests/unit 或 integration——写 OperationLog 断言 kind=auto + payloadJson 形状 + 幂等重跑不炸）；互斥锁行为单测。
- 可见面闭环：跑一次 routine:health-scan 后，今天页「Agent 今日完成」计数 >0 且 feed 出现巡检行（F003 已接真）。
- lint + tsc + test:unit 绿。

### F005 收敛与 mock 退役链

- **ENV_NAME 收敛**：今天页消费切 `ENV_META[].name`（mock/today.ts:16 自记的 EXTENSION POINT 兑现）。
- **env-brief 解耦（D-E）**：`env-brief.ts` 的 xg 分流判定改为内联 slug 比对 + 内联 `LEGACY_ID_ALIAS`（starlight-protocol→xg 兼容保留，f007/f010 探针零回归）；不再 import mock/projects。
- **mock 整删**：`lib/data/mock/today.ts` 与 `lib/data/mock/projects.ts` 删除；全仓 grep 零悬空引用（含 scripts/tests/package.json——M1-B F006 教训：按被删路径为 needle）。
- **PILL_TONE/DOT_TONE 收敛（S4 顺手，D-F）**：新建 `src/lib/display/health-tone.ts` 单点导出 PILL_TONE（canonical 取 today 版全 dark 变体）+ DOT_TONE；campaigns 页/今天页/ProjectDetail 三处 import 单点。浅色渲染零漂移（基线安全），深色 campaigns 略变（无深色基线，登记即可）。
- 回归：tsc 全绿 + grep 实证 mock 两文件零残留、tone 映射仅剩 display 单点。
- lint + tsc + test:unit 绿。

### F006 f008 探针修缮（Link 化使断言复活）

- 裁决（D-G）：**修缮而非退役**——f008 的死链/redirect/侧栏检查仍有守护价值，且其 §4『点击列表卡』anchor 断言（`a[href^="/admin/campaigns/"]`）与 §5 todo link（`a[href*="env="]`）恰因 F001/F003 Link 化而重新可命中。
- 修缮范围：更新历史漂移锚点（`:70`「五环节」文案改为现渲染文案；其余按脚本实跑逐条校准）；接真后仍成立的断言保留原样。
- 修缮后 `npm run f008:browser` 全绿（standalone 实测）；修缮说明落 commit 正文（对照 p2:f003 审计先例，本条为 planning 阶段预裁决，无需另立审计文档）。
- lint + tsc 绿。

### F007 architecture.md 口径校准（S8/S1 兑现，文档 feature）

- 按勘查清单 17 条逐条校准（A 类 8 条「未实装」翻牌为已实装 + 指向实物路径；B/C 类改写措辞/拆半句）：
  `:84` vitest 选型 · `:283` domain/ · `:402` §5 章头拆分 · `:481` 游标（含守卫表 as-built 差异：仅 →brief/→match 可判其余保守拒）· `:521` §5.4 逐行拆标 · `:563` 双重执行 · `:629-635` 契约层范围重写 · `:654` schemas/ · `:758` Project 列 · `:929` vitest 理由 · `:1128` compute_health · `:1628` §12.6.1 · `:1632` §12.6.2 · `:1642-1669` §12.6.3（D17/D18 as-built：原生 tsconfigPaths + include 收窄）· `:1684` CI 流程图（+unit job +visual 起 DB）· `:1797-1798` §14 M0.5 置 done/M1 行拆分 · `:1833` ADR-16 部分兑现。
- 本批交付项（列表/今天 RSC、雷达聚合、例程调度器 health-scan）在 §14 M1 行同步标注。
- 校准只改口径与状态标注，不改设计决策本身；每条附实物路径。
- 文档 commit（paths-ignore 不触发 CI，随批次尾实质 push 一并验证）。

---

## 3. 关键设计决策（Planner 裁决 D1-D10，/goal 授权范围内）

- **D1 范围**：列表页+今天页+雷达真数据+例程最小闭环入批；**knowledge 域顺延 M1-D**（2 新表+存储后端裁决留人类闸门；M1-A/M1-B spec 均标「M1-C+」）。
- **D-A 雷达接 PendingAction 真数据**（三选一裁决：非保 mock、非纯降级）：机制已真实存在（F009 闸门），expand 两列后 aggregatePending 即雷达真源；空态诚实渲染可见文案。CI 无 pending 行→空态入基线是诚实基线。
- **D-B 侧栏徽标本批不接真**：sidebar 与 layout 双 'use client' 无现成 server 通道，API+fetch 会给全部 13 张基线引入异步弹入抖动；登记过渡态，M1-D 与洞察页接真一并。
- **D-C 例程载体 = node-cron 进程内 + instrumentation.ts**：ADR-20 二选一，取不动部署面、无端点鉴权问题的一侧；`ROUTINES_DISABLED` env 开关；进程内互斥锁（单实例部署，ADR-20 明示不建队列）。
- **D-D 无存处一律诚实降级**：本月有效触达/delta/teamLoads/monthlyAutoDone→「待接入」占位（**保留区块结构**，设计稿保护规则）；feed/KPI 有真源接真源（OperationLog/count/aggregatePending）；「待你确认」与雷达同一次查询派生防两处各算。
- **D-E mock 退役前置链**：ENV_NAME→ENV_META.name 收敛、env-brief 内联 slug 判定+LEGACY_ID_ALIAS，然后 mock/projects+mock/today 整删。
- **D-F tone 收敛 canonical 取 today 版**（dark 变体最全）；浅色基线零漂移。
- **D-G f008 修缮而非退役**：Link 化使断裂断言复活；死链/redirect 检查有存续价值。
- **D-H 视觉决定论**：CI DB=migrate+seed:projects（零 PendingAction）→ 雷达空态基线确定；**本地重生基线前必须清空 PendingAction 表**（`gate:smoke` 会留行），操作写入 F003 对账记录。
- **D-I 基线重生流程沿 M1-B**：意图变更必重生（容忍带借绿教训）；darwin 本地重生 + linux 走 update-visual-baselines workflow；两张漂移基线（campaigns/en-today）逐张对账说明成因。

## 4. 数据准备步骤（Evaluator 验收前提）

- 本地/CI：`prisma migrate deploy` + `npm run seed:projects`（4 canonical 项目 + Game 行 + dev tenant，幂等）。
- 抽样白名单：xg（reach，$18,000，目标 300 万）/ lc（match，$12,000，200 万）/ aw（delivery，$9,000，150 万）/ mf（insight，$7,500，125 万）——slug 与 mock id 逐字一致。
- 雷达实测正样本：跑 `gate:smoke` 或经 /api/agent 触发 send_outreach 产生 pending 行（含/不含 projectId 两态）；实测毕清表恢复（视觉重生前必清，D-H）。
- 例程实测：`npm run routine:health-scan` 手动触发，OperationLog 出现 4 条 kind=auto。
- health 全 cr（xg 26/lc 37/aw 23/mf 20）是 D2 纪律下的预期，验收勿判缺陷。

## 5. 验收口径（verifying）

- **fan-out**：7 features ≥4 → fan-out + 对抗复核（orchestration §4，沿 M1-B Workflow 编排）。
- **F001**：列表页确为 RSC（无 'use client'，grep 实证）+ DB 数据实证（改行→变→复原）；进入钮为真实 anchor；全 cr 预期。
- **F002**：迁移应用后两列存在；gate 创建带 ctx 落列实证；aggregatePending 返回含新字段。
- **F003**：今天页 RSC + 三 client 叶子边界 grep 实证；雷达空态/有 pending 两态实测；KPI 与雷达同源；无存处区块保结构渲染占位；en-today 基线对账。
- **F004**：routine:health-scan 手动触发落 4 条 OperationLog(kind=auto)；互斥锁与 ROUTINES_DISABLED 行为实证；instrumentation 仅 nodejs runtime 注册。
- **F005**：mock/projects+mock/today 零残留（含 scripts/tests/package.json needle grep）；f007/f010 旧 id 深链零回归；tone 单点 grep 实证。
- **F006**：f008:browser 全绿（standalone）；修缮锚点逐条说明。
- **F007**：17 条清单逐条落实（抽查 A 类翻牌与实物一致）。
- **就绪回归**：lint + tsc + test:unit + test:visual 全绿；三条 p2 探针 + f007/f010 无回归；基线漂移逐张说明成因。

## 6. 不在本批次

- **knowledge 域**（Material/GameKnowledge 表 + 上传通道 + 解析管道 + 存储后端裁决）→ M1-D。
- 侧栏徽标真值 / 洞察页接真 / Copilot mock 接真（S3）→ M1-D+。
- 例程扩容（nightly-screen/signal-sync/delivery-watch/weekly-draft）→ M2-M4（依赖各自表）。
- health 三态丰富化 → M2/M3 指标存处落地后。
- 推进写 UI 入口（S10）/ 深链 canEnter（S9）→ 变更契约时另立。
