# M1-B-BRIEF 验收分报告 — F003 compute_health 工具（Agent 与页面同源）

- **验收人：** Andy/evaluator-subagent（隔离 fresh context，fan-out 分单）
- **日期：** 2026-07-22
- **被验对象：** main HEAD `126b410`（F003 实装 commit `8babdfa`，证据均取自工作区实物，非 commit message）
- **结论：PASS**（逐条 acceptance 全过；1 条 [L2] 注记见 §4，不构成缺陷）

## 1. 验收环境（L1 前置检查）

- 本地 dev DB 已起（容器 newkolmatrix-dev-db），四 canonical 项目已 seed；standalone 已跑在 http://127.0.0.1:3000（未重启，只读实测）
- `npx prisma generate` 已先跑（testing-env-patterns §3）；本项目无 `.nvmrc`，Node v25.7.0，本 feature 测试均为 node 环境无 jsdom/localStorage 面，无已知环境误报命中
- L2（真实网关调用/计费）未获授权 → `npm run agent:smoke` 全量未跑（其 search_kols 段调真实网关 embedding），以 executeTool 直调探针覆盖 compute_health 段（§4）

## 2. 逐条 acceptance 判定

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | 新建 `src/lib/agent/tools/compute-health.ts` | PASS | 文件存在，全文通读（106 行） |
| 2 | `class:'internal'`、无 buildHarm | PASS | `compute-health.ts:102` `class: 'internal'`；全文件无 `buildHarm` 属性；探针断言 `getTool('compute_health').buildHarm === undefined` ✓；单测同断言 ✓ |
| 3 | `source:'native'` | PASS | `compute-health.ts:103`；探针断言 ✓ |
| 4 | 薄封装 `domain/health.ts` 的 computeHealth，逻辑零重复 | PASS | `compute-health.ts:17-23` import 自 `lib/domain/health`；全仓 grep：`computeHealth` 调用方仅 `[id]/page.tsx:42`（F001 页面）与 `compute-health.ts:90` 两处，无第三份打分逻辑 |
| 5 | 范式对齐 `tools/get-kol-detail.ts` | PASS | 逐段对照：同为 zod inputSchema + `run(input, ctx)` + `prisma.*.findFirst({ where: { tenantId: ctx.tenantId, OR: [...] } })` + `ToolDefinition` 具名导出 |
| 6 | 【D8】输入契约 = projectId-only | PASS | schema 仅 `projectId: z.string().min(1)`（`:27-29`）；探针：空串经 executeTool 被 zod 拦（抛错）✓；模型硬塞 `actualExposure:99999999, budgetSpent:0` 被 strip，score 不受影响（26==26）✓；单测同断言（parsed.data 只剩 projectId）✓ |
| 7 | 工具自读 Project + parseProjectGoal + 缺失因子填 null → 按 D15 恒返 cr | PASS | `:51-64` prisma 自读（tenant 过滤 + id/publicId/slug 三寻址）；`:69` parseProjectGoal；`:74/:76` actualExposure/budgetSpent = null；运行时实测四 canonical 项目全 cr：xg=26 / lc=37 / aw=23 / mf=20，四因子拆解 exposure=0、budget=0（D15 null 记 0）；未命中项目 → `found:false` 不抛错 ✓ |
| 8 | 与 F001 页面同源（同一 computeHealth） | PASS | 三重实证见 §3 |
| 9 | `now` 在 execute 边界 `new Date()` 注入 | PASS | `compute-health.ts:79`（domain 函数自身不读时钟，`health.ts:69` 契约注释一致） |
| 10 | 注册 `tools/index.ts` NATIVE_TOOLS | PASS | `index.ts:10,17`；探针 `getNativeToolNames()` 含 compute_health ✓；单测 ✓ |
| 11 | 挂 strategy 人格（duty 含健康度监测） | PASS | grep 实证：`registry.ts:72` duty=`'目标拆解·预算配比·健康度监测·复盘框架'`，`:76` `tools: ['get_kol_detail', 'compute_health']`；运行时链路核过：`persona-router.ts:79-81 personaToolSubset` → `route.ts:91-92 toAiSdkTools`，strategy 被选中时工具确实递入 streamText |
| 12 | smoke（agent:smoke 走 executeTool 直调） | PASS（[L2] 注记） | smoke 脚本已含 compute_health 段（`scripts/test/agent-tools-smoke.ts:94-130`：class 断言 + xg 恒 cr + 四因子 + 未命中不抛错）。全量 agent:smoke 未跑（search_kols 段调真实网关 embedding，L2 未授权）；以隔离探针直调 executeTool 覆盖该段断言之超集，21 项全过（§4） |
| 13 | 单测（tests/unit/ 复用 health 测试基座） | PASS | `npx vitest run tests/unit/compute-health-tool.test.ts tests/unit/health.test.ts` → 2 files / **36 passed**（工具契约 4 + health 基座 32） |
| 14 | lint + tsc 绿 | PASS | `npx tsc --noEmit` exit 0；`npx next lint` → "No ESLint warnings or errors" |

spec §4 F003 行（「经 executeTool 可调；输出与页面同源；projectId-only；挂 strategy grep 实证」）四点全部命中，对应上表 #6/#8/#11/#12。

## 3. 同源实证（spec §4 核心项）

三道交叉，全部一致：

1. **静态**：全仓 grep `computeHealth|resolveBand`（排除 domain 定义文件）仅两个调用方——`src/app/admin/campaigns/[id]/page.tsx:42` 与 `src/lib/agent/tools/compute-health.ts:90`。打分逻辑只有 `domain/health.ts` 一份。
2. **组装口径逐字段对照**：工具 `:72-81` 与页面 `:42-51` 的 HealthInput 组装完全一致（targetExposure←parseProjectGoal / actualExposure=null / budgetTotal=Number(Decimal) / budgetSpent=null / periodStart,End←goal / now=new Date() / blockerCount=0）。
3. **运行时**：探针在同一时点用页面口径独立复算 xg → score=26 band=cr，与工具 executeTool 输出逐值相等；同时 curl 正在跑的 standalone 详情页 `/admin/campaigns/xg`，实渲染红点（bg-red-500）+「健康度 **风险**」= cr 档，与工具输出同档。

**口径注记（非缺陷）**：acceptance 写「缺失因子填 null」，实装中 `blockerCount` 填 `0` 而非 null——这是 domain 契约强制（`HealthInput.blockerCount: number` 非空，`health.ts:71` 明写「无阻塞源时调用方传 0」），且页面（F001，`page.tsx:50`）与工具两处一致。null 只适用于可空因子 actualExposure/budgetSpent，同源性不受影响。

## 4. 运行时探针（executeTool 直调，不经网关）

- 探针：scratchpad `f003-probe.ts`（隔离验收临时脚本，覆盖 agent:smoke `:94-130` compute_health 段断言之超集 + 边界补充，不落 repo）
- 运行：`node --env-file=.env --import tsx <probe>`（项目根）→ **21/21 断言 PASS**
- 覆盖：注册面（NATIVE_TOOLS/class/source/无 buildHarm）· 四 canonical 项目恒 cr · publicId/id/slug 三寻址同项目 · 未命中 found=false 不抛错 · 空串 zod 拦截 · 因子注入 strip · 页面口径复算同值
- **[L2] 未执行，待授权**：`npm run agent:smoke` 全量（含 search_kols 真实网关 embedding 调用）。compute_health 自身不经网关（纯 DB 读 + 纯函数），其 smoke 断言已被本探针全覆盖，故不影响 F003 判定；全量 smoke 留待批次级授权后执行。

## 5. 复现步骤

```bash
# 前置：npm run db:up 且已 seed（npm run seed:projects）；.env 有 DATABASE_URL
npx prisma generate
npx vitest run tests/unit/compute-health-tool.test.ts tests/unit/health.test.ts   # 36 passed
npx tsc --noEmit && npx next lint                                                  # 均绿
# 运行时（不经网关）：复制 §4 探针逻辑，或授权 L2 后 npm run agent:smoke
# 页面同源目测：curl -s http://127.0.0.1:3000/admin/campaigns/xg | grep -o '健康度.*风险' 附近可见红点+风险
```

## 6. 问题清单

无（PASS）。
