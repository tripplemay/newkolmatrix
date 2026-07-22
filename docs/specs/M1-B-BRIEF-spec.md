# M1-B-BRIEF — 纵切 project+brief 之页面层（普通批次）

> **批次类型：** 普通批次（全部 `executor:generator`），`planning → building → verifying → done`。
> **车道：** 快车道（单会话，Planner/Generator 主上下文，Evaluator 隔离 subagent）。无 `role_assignments`。
> **Spec lock：** 2026-07-22 用户四条裁决（§3 D1–D4）+ Planner 五条默认（§3 D5–D9）。
> **事实依据：** planning 阶段三路并行只读勘查（数据通道 / brief bug+守卫 / BL-FE+视觉），结论均核到 `文件:行`。
> **上游：** M1-A-BRIEF（已交付上线）—— vitest 地基 · 全站 SSR 恢复 · `domain/` 三件 · Project schema 扩齐 + seed。

---

## 1. 背景与目标

M1-A 定下了地基与领域层。M1-B 是同一条 project+brief 纵线的**页面层**，但**本批的价值不是「让页面显示更真更丰富的数据」**——恰恰相反：在当前数据可得性下，接真数据会让页面内容变**差**（见 §1.1）。

**本批要回答的问题是「M1-A 的 mock→真数据契约层能不能平滑换」**（M1-A spec 开头即提此验证目标），顺带修掉 brief 那个线上真 bug、补齐 M1-A 只做了一半的守卫（服务端有、前端缺）。内容丰富化要等 M2/M3 有真实曝光/消耗/deal 数据才有意义。

### 1.1 勘查暴露的关键实物（接真数据会连锁引爆三个「数据不存在」）

| # | 接真数据后 | 结果 | 根因（核到文件） |
|---|---|---|---|
| 1 | health | 四项目**全变 cr** | `actualExposure`/`budgetSpent`/`blockerCount` 全库无存处；`health.ts:170` null 因子按 0 分（M1-A D15 已记）。真实分子要等 M2/M3 |
| 2 | brief 面 | lc/aw/mf **三个显「待接入」空面** | `env-brief.ts:160-162` 四项目共享同一 `canonicalBrief`（全是 xg），库里根本无 lc/aw/mf 的 brief 深字段 |
| 3 | goal | 散文丢失，须重合成 | mock 是整句（`projects.ts:46`），库里是结构化 `{targetExposure, period}`（`schemas/project.ts:18`） |

一个好消息 + 一个技术约束：
- **详情页 `[id]/page.tsx` 已是 server component**（`:12-13` async + await params/searchParams）——RSC 直读它成本最低，是最干净的纵切点。列表页/今天页是 `'use client'`，要拆 client/server 边界，大得多（故 D1 顺延）。
- **RSC 直连 DB 的页面无法用 playwright route-mock 隔离**——CI 的 visual job 没有 DB，详情页一旦 RSC 直读，视觉套件会**硬红**（不是漂移是翻红，同 BL-FE-11 盲区）。须给 visual job 起 DB（D7）。

---

## 2. 功能范围（6 条，全 generator）

### F001 详情页 RSC 直读 Project + health 接真算 + visual job 起 DB

- `[id]/page.tsx`（已 server）内 `prisma.project.findUnique`（按 slug 或 id + tenant 过滤，复用 `getDevTenantId()`），把 project 作 prop 传进 `ProjectDetail`；找不到 → 优雅降级（现有 D2 空态或 404）。
- `ProjectDetail.tsx`（保持 'use client'，tab 交互不可去）把 `:65` 的 `getMockProject(projectId)` 换成入参 `project` prop。
- RSC 内调 `computeHealth`（`parseProjectGoal` 解析 goal + null 因子）→ health 作 prop 传入。**四项目（含 xg）显 cr，接受（D2）。**
- 货币格式化 helper：`budgetTotal`(Decimal)+`currency` → 显示串（详情页 `:120`）。
- goal 散文：从结构化 `{targetExposure, period}` 合成展示串（D9）。
- **visual job 起 pgvector service + migrate deploy + seed**（D7：详情页 RSC 直读 DB 的既定代价，同 M1-A unit job 的做法）。
- 受影响视觉基线逐张对账（详情页头部 health 变 cr → `project-{brief,match,reach,delivery,insight}.png` 漂移），不盲重生（框架 v1.0.6 §4.2）。
- lint + tsc + test:unit 绿。

### F002 brief 分流 bug 修复（机械分流，优雅降级）

- `env-brief.ts:161` 按 projectId 分流：**仅 xg → `canonicalBrief`，lc/aw/mf → `emptyBrief`**（全 null 深字段，`readContractSlot` 已支持 null→「待接入」占位，绝不抛错）。D3。
- **不为 lc/aw/mf 补写 mock**（无真数据源，补即造假数据，违反 `projects.ts:5`「绝不填 0/'' 冒充实测」纪律）。
- 回归测试：验证 `getEnvBrief('mf')` 的五深字段全 null（不再是 xg 数据）；`getEnvBrief('xg')` 仍为 canonical。
- 视觉基线：先核实 `project-brief.png` 截的是哪个项目——若是 xg 则 brief 内容不变（仅 health 头部变，已在 F001 处理）；若是非 xg 项目则该页变「待接入」空面，逐处对账后更新。
- lint + tsc 绿。

### F003 compute_health 工具（Agent 与页面同源）

- 新建 `src/lib/agent/tools/compute-health.ts`：`class:'internal'`（纯计算只读，**无需 buildHarm**）、`source:'native'`，薄封装 `domain/health.ts` 的 `computeHealth`。范式对齐 `tools/get-kol-detail.ts`。
- 输入契约 = **projectId-only**（D8）：工具自读 Project + `parseProjectGoal`，缺失因子填 null → 按 D15 恒返 cr（与 F001 页面同源，逻辑零重复）。`now` 在工具 execute 边界 `new Date()` 注入（纯度约束只在 domain 函数）。
- 注册：`tools/index.ts` 的 `NATIVE_TOOLS` 加一条；挂 `strategy` 人格（`registry.ts` duty 含健康度监测）的 `tools` 数组。
- smoke（`agent:smoke` 走 executeTool 直调）+ 单测（`tests/unit/`，复用 health 测试基座）。
- lint + tsc 绿。

### F004 页面守卫前端半边（selectEnv + rail + toast 拦截）

- `ProjectDetail.tsx:80` `selectEnv(next)` 加 `canEnter` 拦截：放行则切换，拒绝则不切、弹 toast（复用 `components/common/Toast` 的 `useToast`，creators 页已有拦截提示先例）。D4。
- rail（`:145-204`）未解锁环节**仍可点**（不 disabled），点后由 `canEnter` 判定 → 拒绝弹 toast。
- **maxReached 数据源**：详情页 RSC 直读已从 DB 拿到 `maxReached`，作 prop 传入（D5：不给 `MockProject` 加字段——列表页顺延不接，无需动 mock）。
- **reason → 文案映射**：`EnvGuardReason` 字面量联合（D8 领域层产出）在**展示层**映射成中文 toast 文案（M1-A D8 明写「文案映射留展示层归 M1-B」，本批兑现）。映射表落展示层单点。
- 架构 `:483` 明确「服务端校验才是真守卫，前端仅 UX」——前端拦截是 UX 层，服务端 `env-advance` 的 `canAdvance` 仍是硬闸（M1-A 已建）。
- lint + tsc 绿。

### F005 ProjectHealth / HEALTH_LABEL 三重收敛

- **类型收敛**：`ProjectHealth` 现有三份副本（`projects.ts:11` × `today.ts:59` 类型 × `today/page.tsx:133` 是 label）。反转依赖——canonical 类型收敛到 `domain/health.ts` 的 `HealthBand`（M1-A `:14` 已定义，但当前 import 自 mock，须反转为 mock/页面 import domain）。因 `mock/*` 接真数据后要消亡，类型不能留在 `projects.ts`。
- **label 收敛**：`HEALTH_LABEL`（`projects.ts:13` × `today/page.tsx:133` 两份）收敛到**展示层单点**（D6：D9 明写文案留展示层，不入 domain——保持 domain 无 i18n 耦合）。新建展示层常量文件承载。
- 类型/import 重接是机械的；`domain/health.ts` 的计算逻辑不动。
- 回归：`tsc` 全绿证明 import 重接无遗漏；grep 实证无第二份副本残留。
- lint + tsc + test:unit 绿。

### F006 BL-FE-17 + image/ 死代码删除

- 删除整个 `src/components/image/`（`Avatar.tsx` + `Image.tsx`）——src/ 零引用（勘查实证），BL-FE-17（`showBorder` 恒不渲染）缺陷随之作废，**无需修白名单+补测试**。
- **一并退役** `scripts/test/f003-harness/` + `scripts/test/f003-reverify/`（P2-CLEANUP F003 遗留，硬 import 真实 src 路径，未接 CI；不删则留悬空 import 死脚本）。
- 删除前 grep 实证全仓（含 scripts/、tests/）除上述两处 harness 外零引用。
- BL-FE-16 **不做**（暴露面为零，勘查确认唯一消费者 navbar 工作正常，无纯读取方；本批亦不引入纯读取方消费者）——backlog 条目保留。
- lint + tsc 绿。

---

## 3. 关键设计决策

### 用户裁决（2026-07-22）

- **D1 范围收窄 = 详情页纵切 + 真 bug + 工具 + 守卫。** 列表页 / 今天页的 RSC 直读（client/server 边界大改 + 更多视觉漂移）**顺延 M1-C**。理由：详情页已是 server component，纵切成本最低，足以验证 D3 的 RSC 直读契约层能否平滑换；列表/今天页是投入产出更低的机械大改，留后续。
- **D2 health 接受全红。** 详情页接真算，四项目（含 xg）显 cr。**已知过渡态不一致：列表页仍读 mock（wn/gd/gd/cr）、详情页读真值（全 cr），同一项目列表说「正常」、详情说「风险」。** 这是 mock/真数据并存期的必然，M1-C 列表页接真后消解。**不得为消除不一致而给算法打补丁或 seed 假指标**（PRD :129 反模式 + M1-A D15 纪律）。全红如实暴露「health 需真实指标才有意义」，正是契约层验证的价值。
- **D3 brief 机械分流，优雅降级。** 仅 xg 真数据，lc/aw/mf 优雅降级「待接入」。不补 mock（造假数据）。
- **D4 未解锁环节可点 + toast 拦截。** 保留探索感；reason 字面量映射成文案（D8 留展示层的活本批兑现）。

### Planner 默认（文档未覆盖，Generator 严格照此实装）

- **D5 `maxReached` 页面数据源 = 详情页 RSC 直读从 DB 拿。** 不给 `MockProject` 加字段（列表页 D1 顺延不接，动 mock 无收益且增噪）。
- **D6 收敛归属 = 类型入 `domain/health.ts`，label 入展示层单点。** 依据 D9「文案留展示层」——domain 保持纯逻辑无 i18n 耦合。label 文案文件位置由 Generator 择项目惯例落地（建议 `src/lib/display/` 或与既有展示常量同处），单点导出供各页 import。
- **D7 visual job 起 DB。** RSC 直连 DB 的页面无法 route-mock，CI visual job 须起 pgvector service + migrate + seed（同 M1-A unit job）。这是 RSC 直读的既定代价，写入 `.github/workflows/ci.yml`。
- **D8 compute_health 输入契约 = projectId-only。** 工具自读库 + null 因子 → cr，与 F001 页面同源。不让模型传因子（模型不应编造实测），与 D2「全红」同根。挂 `strategy` 人格。
- **D9 goal 展示 = 从结构化字段合成。** 库里是 `{targetExposure, period}`，页面从结构化字段合成展示串（如「周期内目标曝光 300 万」），不再用整句 mock。具体文案 Generator 按详情页现有版式落地。

---

## 4. 验收口径（verifying）

- **fan-out：** 6 features ≥ 触发门 4 → 走 fan-out + 对抗复核（`orchestration-patterns.md` §4）。
- **F001：** 详情页确为 RSC 直读 DB（非 mock）——须实证（如 seed 改一条项目名后详情页头部随之变，或 curl 详情页确认数据来自库）；health 四项目全 cr 是预期非缺陷；visual job 在 CI 实起了 DB（须核 workflow 实际跑了 migrate+seed，非只加 service 块）；受影响基线逐张对账。
- **F002：** `getEnvBrief('mf')` 五深字段全 null（回归测试实证），`getEnvBrief('xg')` 仍 canonical；线上 bug（四项目共享 xg 数据）消除。
- **F003：** compute_health 工具经 executeTool 可调，输出与 F001 页面同源（同一 `computeHealth`）；projectId-only 契约；挂 strategy 人格 grep 实证。
- **F004：** 未解锁环节点击被 canEnter 拦截并弹 toast（两视口实测）；已解锁环节正常切换；reason 映射文案齐全；服务端硬闸（canAdvance）未被前端改动削弱。
- **F005：** grep 实证 `ProjectHealth`/`HEALTH_LABEL` 各只剩一份 canonical；tsc 全绿证 import 重接无遗漏；domain/health.ts 无中文文案（无 i18n 耦合）。
- **F006：** `src/components/image/` 已删且全仓（含 scripts/tests）零悬空 import；f003-harness/f003-reverify 已退役；BL-FE-17 作废登记。
- **就绪回归：** `next lint` + `tsc --noEmit` + `test:unit` + `test:visual` 全绿；四条 p2 探针无回归；视觉漂移逐张说明成因（数据变更而非布局/字体回归）。

---

## 5. 不在本批次

- **M1-C（下一批）：** 列表页 / 今天页 RSC 直读真数据（client/server 边界重构）· 雷达聚合真数据 · 更多视觉基线迁移。
- **knowledge 域 / 例程调度器**（M1 官方清单剩余，M1-C+）。
- **health 接页面显示丰富三态** —— 待 M2/M3 引入 actualExposure/budgetSpent/deal 真实指标存处后。
- **brief 面 lc/aw/mf 真内容** —— 无真数据源，M2+ 有真实 brief 生成链后。
- **BL-FE-16**（useColorMode 跨实例同步）—— 暴露面为零，仅登记，backlog 保留。
- `api/envelope.ts` 统一信封（D3 遗留，M1-A 已记）· `OperationLog` append-only DB 触发器（R14）· 软删除列。
