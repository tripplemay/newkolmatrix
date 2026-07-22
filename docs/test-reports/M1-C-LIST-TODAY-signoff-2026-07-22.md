# M1-C-LIST-TODAY Signoff 2026-07-22

> 状态：**已签收（reverifying 复验全 PASS，可置 done）**
> 触发：M1-C 批次首轮验收 6 PASS + 2 PARTIAL → fixing（fix_rounds=1）→ 复验双 PASS，签发批次收官报告
> 签收人：**Andy/evaluator-subagent**（隔离 fresh context；本报告为对 8 份分报告判定与证据的**机械合并**，不重新评估、不改写任何结论）

---

## 变更背景

M1-C 把 M1-B 验证过的 mock→真数据契约层扩展到**列表页与今天页**（RSC 直读 + Link 化归零 client 泄漏），雷达接 PendingAction 真数据（expand projectId/agentId），例程调度器立最小闭环（node-cron + health-scan 写 OperationLog kind=auto），mock/projects+mock/today 整链退役，f008 探针修缮复活，architecture.md 17 条口径校准（M1-A S1 + M1-B S8 两批顺延欠账兑现）。knowledge 域顺延 M1-D。用户 /goal 书面授权全程自动推进（授权记账见 progress.json session_notes）。

- **Spec：** `docs/specs/M1-C-LIST-TODAY-spec.md`（含 fixing 轮 D-F Planner 修正注记 :108）
- **验收模式：** fan-out 隔离验收（7 features + 批级就绪回归，orchestration §4）+ PARTIAL 对抗复核 + fix_round=1 隔离复验
- **验收对象：** 首轮 @ main `5a666a9`；复验 @ `11d606c`（修复 commit `c362711` + linux 基线 workflow 重生）

---

## 判定总览

| Feature | 标题 | 首轮 | 对抗复核 | 复验（fix_round=1） | 最终 |
|---|---|---|---|---|---|
| F001 | 列表页 RSC 直读 Project | PASS | — | — | **PASS** |
| F002 | PendingAction expand + aggregatePending 扩列 | PASS | — | — | **PASS** |
| F003 | 今天页 RSC 重构 + 雷达/KPI/feed 接真 | PASS | — | — | **PASS** |
| F004 | 例程调度器最小闭环（node-cron + health-scan） | PASS | — | — | **PASS** |
| F005 | 收敛与 mock 退役链 | PARTIAL | refuted=false，维持 | PASS | **PASS** |
| F006 | f008 探针修缮 | PASS | — | — | **PASS** |
| F007 | architecture.md 口径校准（17 条） | PARTIAL | refuted=false，维持 | PASS | **PASS** |
| READINESS | 批级就绪回归 | PASS | — | — | **PASS** |

**fix_rounds = 1。** 分报告：`docs/test-reports/M1-C-LIST-TODAY-verify-{F001..F007,READINESS}.md`（F005/F007 末尾含对抗复核段 + 复验段）。

---

## 变更功能清单（判定 + 关键证据摘录）

### F001：列表页 RSC 直读 Project — PASS（0 缺陷）

**Executor：** generator · **Commit：** `7f86062` + force-dynamic 修复 `42a534a` · **文件：** `src/app/admin/campaigns/page.tsx`（RSC 化）、`tests/screenshots/baseline/campaigns-*.png`（重生）

- 'use client'/useRouter/useState 仅注释命中；async RSC + `prisma.project.findMany({include:{game:true},orderBy:{createdAt:'asc'}})` + `force-dynamic`
- DB 改行→变→复原闭环实证运行时读库（EVAL-F001-MUTATION ×2 出现→seed 复原归零）；4 真实 anchor 卡序 xg/lc/aw/mf 零重排
- display 层逐字段复用（budget/goal/health 与详情页同源）；D2 全 cr 预期确认非缺陷；基线对账重生 + 针对性视觉复跑 1 passed；lint/tsc/unit 139 全绿

### F002：PendingAction expand（projectId/agentId）+ aggregatePending 扩列 — PASS（0 缺陷）

**Executor：** generator · **Commit：** `5bdc47a` · **文件：** `prisma/schema.prisma` + migration `20260722082147` + `src/lib/agent/gate/gate.ts` + `src/lib/agent/orchestrator.ts` + `tests/integration/pending-action-columns.test.ts`（同 commit）

- 两列 nullable text 已应用在库（`\d "PendingAction"` 实证）；migration 纯 ADD COLUMN 回滚安全
- 唯一创建点 gate.ts:83-84 只填不判；orchestrator select+返回扩列、harm 原样透传（Evaluator 独立探针 raw SQL 直读逐字段核对 PROBE_PASS）
- 集成测试 3/3 真库过；CI 一次红实证为 F001 prerender 连带（42a534a 已修），非 F002 引入

### F003：今天页 RSC 重构 + 雷达/KPI/feed 接真 + 无存处降级 — PASS（0 缺陷）

**Executor：** generator · **Commit：** `d222374`（+ linux 基线 `941bea7`）· **文件：** `src/app/admin/today/page.tsx`（RSC 化）、`src/components/common/agent-icons.ts`（server-safe 单点）、`src/lib/display/relative-time.ts`、`tests/visual/dashboard.spec.ts`（空态 waitFor 硬断言）

- RSC/client 叶子边界 grep 零泄漏；雷达四态 fixture 实测全命中（空态可见文案/完整卡含红标=harm.irreversible+agentId 反查深链/极简卡/脏 harm 降级）
- KPI 与雷达同一次 aggregatePending 派生（防两处各算实证）；feed 两态实测；无存处区块保结构占位（chartcard/团队负荷）
- en-today 基线 D-H 清表对账重生；两视口 console error 0；D-B 侧栏徽标过渡态按 spec 预登记（见 Soft-watch S2）

### F004：例程调度器最小闭环 — PASS（0 缺陷，3 条非阻断观察）

**Executor：** generator · **Commit：** `948d327` · **文件：** `src/lib/jobs/scheduler.ts`（runExclusive 互斥）、`src/lib/jobs/routines/health-scan.ts`、`src/instrumentation.ts`（NEXT_RUNTIME gate）、`tests/integration/health-scan-routine.test.ts`、node-cron ^4.6.0

- 注册/互斥锁/ROUTINES_DISABLED 开关/nodejs gate 全实证（进程隔离探针 disabled size=0 / default size=1 幂等）；cron 常量 `'0 2 * * *'`
- 可见面闭环改→验→恢复：手动触发落 4 条 OperationLog(kind=auto,actor=strategy,payloadJson{score,band})，分值 xg26/lc37/aw23/mf20 与 spec §4 逐字吻合 → 今天页 KPI=4 + feed 4 巡检行 → 清理复归 0
- 集成测试 3/3 含活性证明（DATABASE_URL 指死端口 → 1 failed，真打库非 mock）；standalone 构建产物含 instrumentation.js + node-cron（prod 镜像可用）

### F005：收敛与 mock 退役链 — 首轮 PARTIAL → 复验 PASS

**Executor：** generator · **Commit：** `2289343`；修复 `c362711`（darwin 基线重生 + spec D-F 修正注记）+ `11d606c`（linux 基线 workflow 重生）· **文件：** 删 `src/lib/data/mock/{projects,today}.ts`、`src/lib/agent/tools/env-brief.ts`（内联解耦）、新建 `src/lib/display/health-tone.ts`

**首轮已 PASS 的主体（8/9 子项）：** mock 整删零悬空引用（被删路径 needle 全仓 grep 零命中，仅 6 处注释历史标注）；env-brief 内联 LEGACY_ID_ALIAS + slug 判定（import 仅剩 zod）；旧 id 深链 `starlight-protocol` curl 差分零回归；ENV_NAME→ENV_META 全仓归零；tone 单点化（HealthBand 域全仓仅 1 处定义、三处 import）；canonical 与 pre-F005 today 版逐字一致；L1 三件套全绿。

**缺陷定性（首轮 PARTIAL 的唯一子项，对抗复核独立复现维持）：** acceptance 明文子项「浅色基线零漂移」不成立——D-F canonical 取 today 版使 campaigns 浅色 cr pill `text-red-500(#f53939)→text-red-600(#ea0606)`，像素级取证 **720px 实变**（bbox 恰为四卡 health pill 文本区，抽样 (245,57,57)→(234,6,6) 精确对应色变），campaigns darwin/linux 基线均未按 D-I「意图变更必重生」重生，变更被 maxDiffPixels 1500 容忍带吸收（**借绿**，framework v1.0.8 明文反模式）；commit 正文「浅色 canonical 与原值逐字同」与实物不符。根因：spec D-F「浅色零漂移」的前提对 campaigns 本就不成立（其 cr/wn 浅色类原本即与 today 版不同）。

**修复路径与复验实证（fix_round=1 → PASS）：**
1. darwin 基线 `c362711` 重生——新旧基线直接 diff **恰 720px/maxΔ=51/bbox 与首轮取证逐项吻合，零夹带变更**；纯色统计 pill 区 red-500→red-600 真值反转完备
2. linux 基线经既有 chore(visual) workflow 通道重生（`11d606c`）；`git merge-base --is-ancestor` 实证 `2289343 → c362711 → 11d606c` 严格时序
3. spec :108 D-F Planner 修正注记落盘（strikethrough + 定性意图变更按 D-I 重生 + wn 档登记；**canonical 裁决本身不变**，diff 恰 1 行）
4. 当前渲染 vs 新基线 exact-diff 41px（亚感知级噪声，pill 区零 diff），视觉用例在新基线上 1 passed（非借绿）；断言余量恢复 1459px
5. 检测器活性 A/B 对照：同一仪器对旧基线仍测出 720+41px——归零是基线修正的结果而非测量失效
6. `git diff 5a666a9..HEAD` 产品代码零变更，首轮已 PASS 的 8 子项无回归风险

### F006：f008 探针修缮 — PASS（0 findings）

**Executor：** generator · **Commit：** `9d4aaa4`（零产品代码，仅测试脚本+状态文件）· **文件：** `scripts/test/f008-browser-check.mjs`

- D-G 预裁决兑现（修缮非退役，演进链 `dd85b6b→4719d9d→9d4aaa4` 完整）；历史漂移锚点校准实证（旧锚『五环节』等在现构建 0 命中，ARCH-M05-verify-B §1.3 原文在案证明漂移非 M1-C 引入）
- §4/§5 断言复活正反两态亲测各 **12/12**（standalone；fixture 改→验→恢复合规）；双态断言失败安全性核验通过（深链损坏时 fallback 必 FAIL，无静默放行）

### F007：architecture.md 口径校准（17 条）— 首轮 PARTIAL → 复验 PASS

**Executor：** generator · **Commit：** `022003e`；修复 `c362711`（恰 3 行文档改动）· **文件：** `docs/dev/architecture.md`

**首轮已 PASS 的主体：** 17 条清单逐 hunk 对账全兑现；A 类 8 条翻牌与实物全量核对一致（vitest/domain//游标 as-built/schemas//Project 列/compute_health/§12.6.1/§12.6.2）；B/C 类 9 条改写与实物交叉一致；§14 M1 行本批交付项标注兑现；只改口径不改设计决策边界守住；push 验证过（022003e 在 origin/main，批次尾 CI+Build&Push 双绿）。

**缺陷定性（文档新鲜度 clause v1.0.6 命中，对抗复核维持）：** 全文筛查发现 **3 处批内反向漂移**——本批 F004 自己交付的例程调度器/instrumentation 仍标「未实装/不存在」：
1. **:1161 §8.10 同节自相矛盾**：节头已翻「骨架已实装（M1-C F004）」，4 行下表列头仍「Proactive 例程（未实装）」——F007 只翻节头引入矛盾（§8.10 在 commit 自述 sanity 扫描范围内，扫描不完整）
2. **:280 §4.2 作业通道**仍标「未实装，归 M1/M3」——调度器例程半边已实装；commit「归 M1）」归零 grep 的 needle 收窄，漏掉「归 M1/M3」联写变体
3. **:1746 §13 存在性断言失实**：「无 `src/instrumentation.ts`」与在仓实物直接冲突

**修复路径与复验实证（fix_round=1 → PASS）：** `c362711` 对 architecture.md 恰 3 行（6 +++---）逐处翻牌，复验逐条实物交叉一致；§8.10/：280 上下文/§13 周边全节通读无新引入矛盾（instrumentation「已存在但只承担例程调度启动、不做 env 校验」与实物逐项吻合）；宽 needle 复扫全文 37 处「未实装」逐条筛查——与本批交付物相关的反向漂移归零；「只改口径不改设计决策」边界复核守住（守卫表/规划表/ADR 本体零改动）。

### READINESS：批级就绪回归 — PASS

**Executor：** evaluator（就绪回归分片）

- lint 0/0 · tsc exit 0 · unit **139/139** · **test:visual 13/13**（standalone，D-H 零行态核实）· p2:f001 12/12 · p2:f002 14/14 · p2:f004 15/15 · f008:browser 双态各 12/12
- 基线漂移批级净变更恰 5 文件，逐张成因核对 + 独立 canvas 像素取证均为数据/占位级（差异区域封闭在内容列，侧栏/顶栏/aside 逐像素稳定，无布局/字体回归）；CI 旁证 `9d4aaa4` 全绿
- f007:browser 原样跑不能绿——5 处锚点溯源全部先于 M1-C（`git diff 19af7f1..HEAD -- src/components/copilot/` 为空，失败签名与 M1-B 生产 SHA 逐字相同，非本批回归），且 §2 为网关计费 [L2] 未授权本就不可全绿；守护面以替代探针 `scripts/test/m1c-readiness-f007-l1-substitute.mjs` **10/10 全绿**（含旧 id 深链切触达 Agent、demo handoff 200 可展开）。列 Soft-watch S1 测试债附兜底，不阻塞

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| knowledge 域（侧栏徽标接真/知识库存储后端） | 顺延 M1-D（存储后端裁决留人类闸门，D-B 登记） |
| mock 存续面（env-\*/creators/knowledge/insight/runs） | 本批只退役 projects/today 两件，其余按 §6.7 校准后口径存续 |
| copilot 组件树 | M1-C 零触碰（`git diff 19af7f1..HEAD -- src/components/copilot/` 为空），f007 探针失败签名批前批后一致的判定依据 |
| 认证/RLS、OperationLog append-only 触发器、闸门并发原子防护 | 既有登记下游（M5/R14/R15），本批无涉 |

---

## 类型检查 / CI

```
next lint            → ✔ No ESLint warnings or errors（0 err / 0 warn，§15 矩阵不触发）
tsc --noEmit         → exit 0（prisma generate 先行，F002 有 schema 变更）
npm run test:unit    → 12 files / 139 tests 全过（含本批 3 个新测试文件）
npm run test:visual  → 13/13 passed
gh run list（收官态）：
  c362711  CI success · Build & Push image success · Update visual baselines success
  9d4aaa4  CI success · Build & Push image success
```

F001 在途曾两次 CI 红（构建期静态化冻结数据 → `42a534a` force-dynamic 修复；campaigns 基线在途漂移 → 重生消解），F002 分报告已归因排除连带，收官态全绿。

---

## L2 实测记录

| 项 | 证据 |
|---|---|
| Staging git_sha 对齐 | N/A——本项目无 staging，prod 部署为批后人类闸门（deploy-prod workflow_dispatch），签收时点未部署 |
| 端到端流验证 | 本地 standalone :3000（HEAD 构建）+ dev DB 完成全部运行时验收：列表页/今天页 DB 改→验→恢复、雷达三态 fixture、例程可见面闭环、f008 双态浏览器实测 |
| 关键 invariant | PendingAction expand 两态落列/NULL、harm 原样透传（raw SQL 直读）、aggregatePending 单次调用 KPI/雷达同源、OperationLog kind=auto 形状与分值 spec 吻合 |
| [L2] 未执行项 | **f007:browser / f010 全量跑含网关真聊天调用（计费）——未授权不执行，待授权**；守护面已由 L1 替代探针 10/10 覆盖（READINESS §7.3） |
| 部署后观察 | 见 Soft-watch S4/S5（prod 例程首跑 + image_tag 记账） |

---

## Ops 副作用记录

本批次**无 prod/staging 数据库 ops**。dev DB 夹具全部按「改→验→立即恢复」闭环并有终态核验（PendingAction=0 / OperationLog=0 / Project=4 canonical）：F001 xg 改名→seed 复原；F002 探针 tenant 级联自清；F003 三条 fixture 即插即删；F004 四条 oplog 巡检行删除复归；F006/READINESS 各 1 行 pending fixture 即插即删。fan-out 并行窗口互见的在途夹具（F001 见 F004 巡检行、F002 见 F006 fixture）均命名自明、属主自清，无交叉污染。

---

## Harness 说明

本批经完整状态机流程交付：planning → building（7/7 独立 commit，CI 全绿）→ verifying（fan-out 8 分片隔离验收，6 PASS + 2 PARTIAL，PARTIAL 均经独立对抗复核 refuted=false 维持）→ fixing（`c362711`，fix_rounds=1）→ reverifying（隔离复验双 PASS）→ 本 signoff。所有判定由隔离 evaluator subagent 直接落盘，无任何改写。快车道（lane=fast），验收产物署名 Andy/evaluator-subagent。

---

## Soft-watch（不阻塞 done，需后续跟进）

| ID | 描述 | 风险等级 | 建议处置 |
|---|---|---|---|
| S1 | **f007:browser 探针锚点陈旧**（5 处停留 AGENT-FOUNDATION 时代文案，FE-REFACTOR/ARCH-M05 改文案未同步；非 M1-C 引入，守护面替代探针 10/10 实证无回归） | medium | 下批做「修缮 vs 退役」裁决（对照 F006/D-G 先例；「多 Agent 编队」标题在现 S3 外壳已无对应物需重定义）；任何授权 L2 全量跑前先按 READINESS §7.1 清单校准锚点，现行锚点已固化于 `scripts/test/m1c-readiness-f007-l1-substitute.mjs` |
| S2 | **D-B 侧栏徽标过渡态**：NAV_BADGE_MOCK 仍 mock（today 3 vs 雷达 0 同页不一致），spec 预登记 | low | 归 M1-D 接真消解 |
| S3 | **F005 wn 档 tone 差异无渲染面**：canonical 收敛使 campaigns wn `text-amber-700→text-orange-600`，当前四项目全 cr 不显形；spec :108 已登记 | low | M2/M3 三态丰富化后随基线自然显形，届时按 D-I 重生对账 |
| S4 | **prod 例程首跑观察**：S7 已在 M1-B 入部署链（migrate+seed 幂等），本批 instrumentation/node-cron 随镜像自动生效——部署后次日 02:00（容器时区）health-scan 将在 prod 首跑，预期落 4 条 OperationLog kind=auto 且今天页 KPI/feed 可见 | low | 部署后首日观察一次；异常时 `ROUTINES_DISABLED=true` 可关（默认开） |
| S5 | **部署 SHA 记账**：最后已构建镜像 = `c362711bd79043550547baf9ea78714e3ad99f6f`（Build & Push success）；HEAD `11d606c` 为 [skip ci] linux 基线 commit 无镜像，二者 diff 仅测试基线文件，等价部署 | low | deploy-prod 的 image_tag 填上述完整 40 位 SHA |
| S6 | **feed 双层书名号**（F004 O1）：summary 模板《${name}》与 canonical 项目名自带《》嵌套呈现「《《星轨协议》…》」；模板系 spec 原样规定，判 spec 相符 | low | 后续批次顺手改为直用 name |
| S7 | **architecture.md 次要陈旧 4 处**（首轮/复验均登记「不计问题」）：:1035 knowledge 域里程碑引用 M1→M1-D 漏改、:1112「需 vitest」阻塞理由过时、§8.10 规划表 health-scan 频率「每小时（示意）」与实装 02:00 不同（表已标规划值）、风险表 R17 标题相对已装 vitest 显陈旧 | low | M1-D 校准时顺手翻，均一行级 |
| S8 | **demo Handoff 软引用悬空**：`projectId='demo-starlight-protocol'` 不指向任何现 Project 行（canonical xg 为 cuid）；现唯一消费方 /api/handoffs 不按 project 过滤，无碍 | low | M1-D 徽标/洞察接真若按 projectId 联查需留意 |

---

## Framework Learnings

> 以下为 Evaluator 提案，由 Planner 在 done 阶段消化、与用户确认后处置（追加至 `framework/proposed-learnings.md` 或直接裁决）。

### 新规律
- **「借绿」反模式获得首个像素级实锤闭环案例**：意图变更 720px 被 1500px 容忍带吸收→像素取证定位→按 D-I 重生基线→A/B 活性对照证明归零非测量失效。v1.0.8 已有明文，本批提供完整「检出→修复→复验」执行范式可引用。
  - 来源：F005 首轮 PARTIAL + 复验
- **fan-out 并行验收的共享环境纪律有效**：多分片同库同服并行，夹具「命名自明 + 属主自清 + 不代删 + 终态核验」四条使 5 个分片零交叉污染（两次互见在途夹具均正确识别未误判）。
  - 来源：F001 §3 / F002 环境记录 / READINESS §0

### 新坑
- **grep 归零断言的 needle 收窄会漏联写变体**：「归 M1）」归零不等于「归 M1/M3」也归零——归零类自证 grep 应用宽 needle（如「归 M1」裸串）再人工筛，或列全变体。
  - 来源：F007 问题 2（c362711 修复时已附教训）
- **翻牌类文档校准的 sanity 扫描必须覆盖同节全部载体**（节头 + 对照表 + 周边存在性断言）——只翻节头会把原本一致的「双未实装」变成同节自相矛盾。
  - 来源：F007 问题 1（§8.10）
- **node-cron 4.x 双构建（ESM/CJS）**：探针动态 `import()` 与 tsx CJS 转译各拿一份模块实例，`getTasks()` 读到空注册表——同实例需静态 import。已固化在 `scripts/test/f004-scheduler-probe.ts` 头注释。
  - 来源：F004 观察 O2（验收侧自坑，非产品问题）

### 模板修订
- 本批次无模板修订提案。
