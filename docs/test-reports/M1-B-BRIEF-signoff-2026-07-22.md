# M1-B-BRIEF Signoff 2026-07-22

> 状态：**签收通过（全批 6/6 PASS + READINESS PASS，首轮 verifying，fix_rounds=0）**
> 触发：verifying 首轮 fan-out 验收 7 份分报告（F001–F006 + READINESS）全 PASS，进入 done 前置签收
> 署名：`Andy/evaluator-subagent`（快车道单实例，隔离 fresh context 运行；未继承实现/编排上下文，自行从磁盘取证）
> 验收对象 HEAD：`126b41048e6435086e7e394130a2add93273ecf3`（产品树最后变更 commit = `6c8018f` F006；`6c8018f..126b410` diff 仅状态文件 + linux 基线）

---

## 合并方式声明

本 signoff 是对 7 份已落盘分报告的**机械合并**：每 feature 的判定与证据摘要**逐字取自对应分报告**，本文不重新评估、不改写、不软化任何结论（harness-rules.md 独立性铁则 §3 / 铁律 12）。分报告本身均为隔离 evaluator subagent 基于实物（代码 grep / git 取证 / L1 套件亲跑 / 本地 standalone 实测 / CI 步骤级核证）独立产出，未采信实现者叙述或 commit message。

**流程事实（如实记录）：**

- **首轮 verifying 全 PASS，fix_rounds=0**：F001–F006 六条 acceptance 与批次级就绪回归均在首轮判 PASS，未进入 fixing/reverifying 循环。
- **fan-out + 对抗复核零触发**：6 features ≥ 触发门 4，按 orchestration-patterns §4 分单验收；对抗复核环节零触发——无任何分判定被推翻或降级。
- **就绪回归口径经实装期审计裁决修订**：spec §4 原文「四条 p2 探针无回归」经 `docs/specs/M1-B-BRIEF-f006-p2probe-audit.md` 裁决修订为**三条（p2:f001/f002/f004）**——p2:f003 探针硬读被 F006 删除的 `image/Avatar.tsx`（勘查 grep 面遗漏的第三处引用），守护对象随死代码消亡，与 BL-FE-17 作废同一逻辑，随 F006 一并退役。验收以裁决文档为准，退役已实证（脚本与 npm script 均已移除，grep exit 1）。
- **首轮 PASS 硬条件（evaluator.md §14）核对**：(a) acceptance 全代码层 PASS ✓；(b) L1 全 PASS，L2 项均明示未执行待授权且不在就绪口径内（见 §L2 实测记录）✓；(c) 全部 soft-watch 均有明文兜底（见 §Soft-watch，逐条写定处置去向）✓。

---

## 变更背景

M1-A 定下地基与领域层（vitest 地基 / SSR 恢复 / domain 三件 / Project schema + seed）。M1-B 是同一条 project+brief 纵线的**页面层**，核心目标是验证「M1-A 的 mock→真数据契约层能否平滑换」：详情页 RSC 直读 Project + health 接真算（D2 接受四项目全 cr——数据可得性的诚实反映，不掩盖）、修 brief 分流线上真 bug、compute_health 工具（Agent 与页面同源）、页面守卫前端半边、ProjectHealth/HEALTH_LABEL 三重收敛、image/ 死代码删除。用户裁决收窄范围（D1），列表页/今天页顺延 M1-C。

---

## 全批判定汇总

| Feature | Commit | 判定 | 分报告 |
|---|---|---|---|
| F001 详情页 RSC 直读 Project + health 接真算 + visual job 起 DB | `e946b49` | **PASS** | [M1-B-BRIEF-verify-F001.md](M1-B-BRIEF-verify-F001.md) |
| F002 brief 分流 bug 修复（机械分流，优雅降级） | `e600977` | **PASS** | [M1-B-BRIEF-verify-F002.md](M1-B-BRIEF-verify-F002.md) |
| F003 compute_health 工具（Agent 与页面同源） | `8babdfa` | **PASS** | [M1-B-BRIEF-verify-F003.md](M1-B-BRIEF-verify-F003.md) |
| F004 页面守卫前端半边（selectEnv + rail + toast 拦截） | `2e212f1` | **PASS** | [M1-B-BRIEF-verify-F004.md](M1-B-BRIEF-verify-F004.md) |
| F005 ProjectHealth / HEALTH_LABEL 三重收敛 | `599dbfb` | **PASS** | [M1-B-BRIEF-verify-F005.md](M1-B-BRIEF-verify-F005.md) |
| F006 BL-FE-17 + image/ 死代码删除 | `6c8018f` | **PASS** | [M1-B-BRIEF-verify-F006.md](M1-B-BRIEF-verify-F006.md) |
| READINESS 批次级就绪回归 | HEAD `126b410` | **PASS** | [M1-B-BRIEF-verify-READINESS.md](M1-B-BRIEF-verify-READINESS.md) |

**全批判定 = PASS（6/6 + READINESS），evaluator_feedback 7 条结构化判定已原样落盘 progress.json。**

---

## 逐 feature 证据摘要（取自各分报告）

### F001 — PASS

RSC 确读 DB 经改→验→恢复闭环实证（psql UPDATE xg 项目名 → curl 页面立即出现 `EVALUATOR-PROBE-F001` → `seed:projects` 恢复 → 页面/DB 复核还原）；SSR payload 实测 xg health `{score:26, band:"cr"}`，四项目 xg 26 / lc 37 / aw 23 / mf 20 全 cr 红点+「风险」（D2 接受的预期，无算法补丁、seed 无假指标——diff 实证 `domain/health.ts` 批内非注释改动仅 F005 类型反转）；D2 降级（旧 id `starlight-protocol`）→ 200 + 名回退 + 待补充×4，无错误边界；D9 goal 合成串「目标曝光 300 万 · 周期 2026-07-01 ～ 2026-07-31」+ 货币 helper `$18,000` 页面原文命中；D7 CI visual job 起 pgvector service + migrate deploy + seed，CI run 29895524822 步骤级全 success（实跑非只加 service 块），基线重生 workflow 同构起 DB；5 张 `project-*` 基线漂移经本人独立抽查目检确认仅 header 数据变更（散文→合成串 + 琥珀→红点），无布局回归；tsc exit 0、eslint 触改文件 0 问题、vitest 42/42。

### F002 — PASS

`env-brief.ts:166-168` 现为 `getMockProject(projectId)?.id === 'xg' ? canonicalBrief : emptyBrief`；修复前 worktree@`e946b49` 复现 bug（四项目共享 xg 引用）。RED/GREEN 亲测对照：同一测试（6 用例，含 xg 64%/192万 防假绿锚定）在 HEAD 6 passed、在 pre-fix worktree 3 failed（mf/lc/aw 均报 gauge 应为 null）。standalone :3000 SSR 实测：mf/lc/aw `?env=brief` 各 4 处「待接入」+ xg 深字段数据 0 泄漏（blocker null=不渲染卡是 D2 既有契约故 4 非 5）；xg 页 canonical 全量。D3 遵守（未为 lc/aw/mf 补 mock）；`project-brief.png` 截 xg → 基线零变更（`git show --stat e600977 -- tests/visual` 空）；lint/tsc 绿。0 缺陷。

### F003 — PASS

`compute-health.ts` class='internal'/source='native'、无 buildHarm、schema 仅 projectId（D8），now 在 execute 边界注入；NATIVE_TOOLS 注册 + strategy 人格挂载（`registry.ts:72/:76`）grep 及运行时链路核实。executeTool 直调探针 21/21 断言 PASS：四 canonical 项目恒 cr（D15 null 记 0）、id/publicId/slug 三寻址、未命中 found=false 不抛错、空串 zod 拦、模型硬塞因子被 strip（26==26）。与 F001 页面同源三重实证：全仓 grep `computeHealth` 调用方唯二（page.tsx:42 / compute-health.ts:90）、HealthInput 组装逐字段一致、运行时同值 score=26 band=cr（页面实渲染红点+「风险」同档）。单测 36/36、tsc+lint 绿。

### F004 — PASS

`ProjectDetail.tsx:112-131` selectEnv 接 canEnter 拦截（拒→toast+return 不切，放行→setEnv+URL 同步）；rail 5 按钮 0 disabled（D4）；maxReached RSC 直读 DB 作 prop（D5，`grep maxReached src/lib/data/mock/` = 0 命中）；`ENV_GUARD_MESSAGE: Record<EnvGuardReason,string>` 全量 5 字面量落展示层单点（定义 1 处消费 1 处）。两视口实测（`scripts/test/m1b-f004-guard-probe.mjs`，desktop 1512×982 + mobile 390×844）26/26 断言绿：未解锁点击拦截 toast 文案逐字命中 + URL 不变 + 面不切、回看/切回放行、深链 `?env=` 直达（D4 设计）、D2 降级态自由切换、零 pageerror。服务端硬闸批内零改动（`git diff --name-only e946b49^..126b410 -- env-guards.ts env-advance.ts src/app/api/` = 空，vitest env-guards 40/40）；lint/tsc 绿。

### F005 — PASS

`git grep "ProjectHealth"` HEAD 全仓（src/tests/scripts）0 命中（exit 1），同一 pattern 在 `599dbfb^` 复现旧副本（projects.ts:11 + today.ts:59 + domain 反向 import）——0-findings 配检测器活性三道交叉；canonical 收敛为 `domain/health.ts:18` 的 `HealthBand`，其余 8 站点均 import，依赖已反转（domain 不再 import mock）。`HEALTH_LABEL` 唯一定义 `src/lib/display/health-label.ts:11`，三消费方（today/campaigns/ProjectDetail）全部 import 单点，旧两副本已删，band→中文映射全仓仅此一处。domain 计算逻辑零改动（diff 仅删 import + 类型改字面量联合 + 注释；health 32 用例行为双证）；health.ts 无中文字符串字面量（中文全在注释）。lint 0/0、tsc exit 0、test:unit 129/129；运行时三页标签渲染实证正常。

### F006 — PASS

ls 实证四目标全消失（`src/components/image/`、`f003-harness/`、`f003-reverify/`、`p2-cleanup-f003-avatar-colormode.mjs`），与 commit `6c8018f` diff（16 文件 -723 行）一致；终态 grep（含未跟踪文件，覆盖 src/scripts/tests/prisma/sdk/.github/package.json 等）`components/image|NextAvatar|ChakraNextAvatar` 零命中 exit 1，配检测器活性三道交叉（同 pattern 在 `6c8018f^` 复现全部删除前引用）。package.json 现存 p2:f001/f002/f004 三条、p2:f003 已除（审计裁决兑现），三条存续探针脚本在位。BL-FE-17 作废登记（project-status.md + commit 正文）、BL-FE-16 原文保留且本批零新增 useColorMode 消费者。prisma generate → tsc exit 0（零悬空 import 编译级证据）；lint 0/0。

### READINESS — PASS

被验对象 HEAD `126b410`（:3000 standalone 为 post-F006 构建，BUILD_ID mtime 晚于 F006 commit，非陈旧产物；dev DB healthy）。lint「No ESLint warnings or errors」；tsc exit 0；test:unit 9 文件 129/129；test:visual 13/13 passed（23.1s）；CI run 29895524822（`6c8018f`）五 job 全 success 含起 DB 的 Visual regression（D7 生效的运行时证据）。三条 p2 探针 12+14+15 断言全过（f002 含 F-mut 变异活性对照），三脚本本批零改动（git log 最后触碰均在 M1-A/P2-CLEANUP——绿不是改探针改绿的）；p2:f003 退役实证到位。基线漂移独立像素取证（自制 canvas diff）：4/5 张 project-* 差异严格局限 header 条带 (381,156)-(835,201)（数据变更，版式零变），其余为 ApexCharts 抗锯齿噪声；creators/runs-linux 0px；campaigns/today 零漂移声明属实。

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| 服务端硬闸 `env-guards.ts` / `env-advance.ts` / `src/app/api/` | 整批零改动（git diff 实证空），最后触碰 = M1-A `e12421c`；前端拦截仅 UX 层，未削弱硬闸 |
| `domain/health.ts` 计算逻辑 | 阈值/权重/四因子/resolveBand/computeHealth 零改动（仅 F005 类型定义反转 + 注释），32 用例行为双证 |
| 列表页 / 今天页数据源 | 仍读 mock（D1 用户裁决顺延 M1-C），campaigns/today 视觉基线两 commit 均未触碰、零漂移 |
| Copilot 侧栏 mock（`copilot/mock.ts`） | 本批零改动（git log 实证空），ARCH-M05 既有 mock 面 |
| BL-FE-16（useColorMode 跨实例同步） | 不做（暴露面为零），backlog 条目原文保留 |

---

## 预期影响

| 项目 | 改动前 | 改动后 |
|---|---|---|
| 详情页数据源 | `getMockProject`（mock） | prisma RSC 直读（slug/id/publicId 三寻址 + tenant 过滤） |
| 详情页 health | mock 三态（wn/gd/gd/cr） | 真算，四项目全 cr（D2 接受；列表页 mock 过渡态不一致 M1-C 消解） |
| brief 面（lc/aw/mf） | 泄漏 xg canonical 数据（线上真 bug） | emptyBrief 全 null →「待接入」优雅降级 |
| Agent 健康度能力 | 无 | compute_health 工具（strategy 人格，与页面同源单一 computeHealth） |
| 未解锁环节切换 | 无拦截（任意可进） | canEnter 拦截 + 中文 toast（服务端硬闸不变） |
| ProjectHealth 类型副本 | 2 份（mock 内）+ domain 反向依赖 | 0 份，canonical = domain `HealthBand`，依赖反转 |
| HEALTH_LABEL 副本 | 2 份 | 1 份（展示层单点 `display/health-label.ts`） |
| `src/components/image/` + f003 遗留 harness/探针 | 死代码 + 悬空风险 | 全删（-723 行），全仓零悬空引用 |
| CI visual job | 无 DB（RSC 直读将硬红） | pgvector service + migrate + seed（D7，基线重生 workflow 同构） |
| 就绪回归 p2 探针口径 | 四条 | 三条（p2:f003 随守护对象消亡退役，审计裁决 `M1-B-BRIEF-f006-p2probe-audit.md`） |

---

## 类型检查 / CI

```
npx next lint          → ✔ No ESLint warnings or errors（0 err / 0 warn）
npx tsc --noEmit       → exit 0（prisma generate 先行，testing-env-patterns §3）
npm run test:unit      → 9 files / 129 tests 全过
npm run test:visual    → 13/13 passed（本地 darwin，复用 :3000 standalone）
p2:f001 / f002 / f004  → 12 + 14 + 15 断言全过（探针零篡改）

CI run 29895524822（产品树最后 commit 6c8018f，branch main）：
Lint / Typecheck / Unit+integration / Visual regression（起 DB）/ Build — 五 job 全 success
```

---

## L2 实测记录

| 项 | 证据 |
|---|---|
| Staging git_sha 对齐 | N/A——本批未部署。生产 `https://newkol.guangai.ai` 仍跑 M1-A @ `fa52f861`（部署为人类闸门，验收通过后由用户手动触发） |
| 端到端流验证 | 本地 standalone :3000（HEAD 构建产物）+ dev DB 实测替代：RSC 直读改→验→恢复闭环（F001）、三页 brief 降级 SSR 实测（F002）、两视口守卫拦截 playwright 实测 26/26（F004）、三页 health 标签渲染（F005） |
| 关键 invariant | health 真算与工具输出同值同源（score=26/band=cr 三重实证）；模型硬塞因子被 zod strip；服务端硬闸批内零改动 + 40/40 |
| [L2] 未执行，待授权 | `npm run agent:smoke` 全量（search_kols 段调真实网关 embedding，计费面）未获授权未执行；不在就绪回归口径内，compute_health 段断言已被 F003 直调探针超集覆盖，不构成缺口 |

---

## Ops 副作用记录

本批次无生产/staging 数据库 ops。本地 dev 库仅 F001 验收探针执行过一次 `UPDATE "Project" SET name=... WHERE slug='xg'`（RSC 直读实证），随即经 `npm run seed:projects` 复原并经页面/DB 双复核（详见 F001 分报告 §1.1），无残留副作用。

| Agent | 阶段 | 操作摘要 | 副作用对齐 | 用户授权 |
|---|---|---|---|---|
| Evaluator（Andy/evaluator-subagent） | verifying | 本地 dev DB：UPDATE Project.name（1 行，探针） | seed:projects 全量复原 + curl/psql 双复核还原 ✓ | 本地 dev 环境，无需授权 |

---

## Harness 说明

本批经 Harness 状态机流程（planning → building → verifying → 签收）交付：快车道单会话，Planner/Generator 主上下文，Evaluator 以隔离 subagent fan-out 验收（7 份分报告独立落盘）+ 对抗复核（零触发）。首轮 verifying 全 PASS、fix_rounds=0，按状态流转图直接 `verifying → done`（无 fixing/reverifying 轮次）。实装期发现 spec 勘查遗漏（p2:f003 探针第三处引用）经快车道即时裁决（pre-impl-adjudication §4.6），裁决文档承载 spec §4 修订，验收以裁决为准。

**本 signoff 由隔离 evaluator 独立签发，判定 = 全批 PASS。** progress.json 的 `status` 置 `done`、`docs.signoff` 填本文件路径由编排者按本结论执行——结论原样落盘，不得改写、软化（铁律 12）。

---

## Soft-watch（遗留观察，不阻塞 done）

> 以下各条均取自分报告「观察项/备注」段（非缺陷类）及 M1-A signoff 顺延项，**均不阻塞签收**；逐条写定兜底，满足 evaluator.md §14(c)。

| ID | 描述 | 来源 | 风险等级 | 建议处置（兜底） |
|---|---|---|---|---|
| S1 | acceptance 文本 `findUnique` vs 实装 `findFirst`——「slug 或 id」OR 跨字段查询 Prisma `findUnique` 无法表达，`findFirst` 是唯一正确实现；功能等价文本漂移，按 evaluator.md §13 不改判 | F001 备注 1 | low | 记账即可，无需处置 |
| S2 | 列表页 mock（wn/gd/gd/cr）vs 详情页真值（全 cr）过渡态不一致——同一项目列表说「正常」详情说「风险」 | F001 备注 2（D2 裁决记录在案） | low | M1-C 列表页接真数据后消解；不得为消除不一致打算法补丁或 seed 假指标（D2 纪律） |
| S3 | Copilot 侧栏 mock 在所有项目页仍显 xg 风味内容（「192万 / 300万 曝光」卡，`copilot/mock.ts:322`）——ARCH-M05 既有 mock 面，本批零改动、非 F002 范围 | F002 观察项 | low | 后续批次 Copilot 接真数据时消解（spec D1 范围外） |
| S4 | `PILL_TONE` / `DOT_TONE` 样式映射仍各页一份（today/campaigns/ProjectDetail）——属 tone（CSS class）非 label 文案，不在 F005 acceptance 范围 | F005 OBS-1 | low | 后续 backlog 候选，如需收敛由 Planner 立项 |
| S5 | `insight` 是 12 张视觉基线中图表抗锯齿噪声余量最小的一张（linux 折线描边抖动在 delta>8 口径达 1811px；playwright pixelmatch 口径下当前绿） | READINESS §6.3 | low | 若未来 CI 偶发翻红优先怀疑图表尾帧抖动而非产品回归；既有消抖（`CHART_SETTLE_MS=1500` + 单 worker）为既定手段 |
| S6 | [L2] `agent:smoke` 全量未执行（search_kols 段真实网关 embedding，计费面未授权；不在就绪口径内） | F003 §4 / READINESS §7 | low | 待用户授权后批次外补跑；compute_health 段断言已被直调探针超集覆盖 |
| S7 | **M1-A S2 顺延（部署前必办记账）**：`scripts/deploy/migrate-seed.sh` 仍只灌 Kol、不跑 `seed:projects`（本签收现场复核属实，本批无 acceptance 涉及部署链）。若直接部署 M1-B，prod Project 表为空 → 详情页全走 D2 降级空态（优雅不崩，但内容为空） | M1-A signoff S2 + 本签收磁盘复核 | medium | 用户触发 M1-B 部署前，把 `seed:projects` 纳入部署链（或部署后手动执行一次）；部署为人类闸门，本条随部署动作兑现，不阻塞 done |
| S8 | **M1-A S1 顺延**：architecture.md §12.6.3/§5.3/§14 部分口径仍滞后 as-built（本批未做文档校准，project-status.md 已记账「顺延」） | M1-A signoff S1 + project-status.md | low | M1-C 顺手校准（文档更新，非产品改动） |
| S9 | 深链 `?env=` 不经 canEnter 拦截 = D4 设计（spec 字面只拦 selectEnv/rail 点击，URL 即状态契约不变；f007/f010/视觉深链探针零回归）——设计非漏拦 | F004 备注 / F001 备注 3 | low | 记账即可；若产品层未来要求深链也拦，须新立 feature 变更契约 |
| S10 | `advanceStage`（服务端推进写路径）当前唯一消费者为集成测试——M1-A as-built 口径，推进写 UI 入口尚未建 | F004 备注 | low | 归后续批次（推进交互落地时接入），「硬闸未削弱」已以批内零改动 + 40/40 判定 |

---

## Framework Learnings

本批次 learnings 已有 1 条由 building 期记入 `framework/proposed-learnings.md`（勘查 grep 面按被删路径划全——F006 p2:f003 探针第三处引用为 audit-methodology §2.1 语义划面的反面新证），由 Planner 在 done 阶段与用户裁决。**本签收终审无新增 framework learnings。**

### 新规律
- 本批次无新增（既有 1 条待裁决见上）。

### 新坑
- 本批次无新增。

### 模板修订
- 本批次无新增。
