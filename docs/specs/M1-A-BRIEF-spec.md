# M1-A-BRIEF — 纵切 project+brief 之地基与领域层（普通批次）

> **批次类型：** 普通批次（全部 `executor:generator`），`planning → building → verifying → done`。
> **车道：** 快车道（单会话，Planner/Generator 主上下文，Evaluator 隔离 subagent）。无 `role_assignments`。
> **Spec lock：** 2026-07-22 用户四条裁决（见 §3 D1/D2/D3/D4）。
> **事实依据：** planning 阶段两路只读勘查（目标态规格 / 代码实物），结论均核到 `文件:行`，见各处引注。
> **上游：** `docs/dev/architecture.md` v1.2 §5.2/§5.4/§7.1/§10.1/§12.6.3 + ADR-16/18/22 + PRD FR-7.9/8.2.1.x。

---

## 1. 背景与目标

M1 官方交付清单是 **project + brief + knowledge 三域 + 游标守卫 + 知识解析管道 + 健康度纯函数 + 雷达聚合 + 例程调度器 + `domain/` 层 + vitest**（`architecture.md:1798`）—— 3~4 个批次的量。用户 2026-07-22 裁决：**先纵切一条 project+brief**，本批 **M1-A** 只做该纵线的**地基与领域层**，页面接真数据留 M1-B。

**本批要回答的问题不是「健康度算法怎么写」，而是「这条纵线的地基形态定得对不对」** —— `domain/` 的签名约定、`cur` 的持久化形态、数据通道走 RSC 还是 REST、单测怎么组织。这四件事定错了，knowledge / match / reach 三个域会跟着歪。

### 1.1 勘查暴露的关键实物（三条推翻了原有认知）

| # | 认知 | 实物 | 影响 |
|---|---|---|---|
| 1 | brief 面按项目渲染 | **没有分流**：`env-brief.ts:160` 的 `getEnvBrief` 是三元 `getMockProject(id) ? canonicalBrief : emptyBrief`，四个项目拿到**同一对象引用**（内容全是 xg《星轨协议》）| 线上现存真 bug：访问 `mf?env=brief`，头部「萌宠农场/$7,500/风险」与面内「$11.5k 消耗/停在触达谈判」打架。**本批不修**（属 M1-B 页面层），但 F004 的 `health.compute` 是其分流点 |
| 2 | 有单测框架 | **零**。`@types/jest ^25` 是 CRA 模板遗留（无 jest 本体、无配置、无测试文件）；`@testing-library/*` 三件同为遗留、全仓零 import | F001 可安全摘除，非「降级」 |
| 3 | RSC 直读可用 | **被自己掐掉**：`AppWrappers.tsx:20-22` 全树包 `NoSSR(ssr:false)`，全站无 SSR 首屏 | F002 必须先拆 NoSSR，否则 D3 裁决的 RSC 通道无收益 |

### 1.2 SSR 审查面（F002 的实际工作量）

全仓碰 `window`/`document`/`localStorage` 共 10 个文件，其中 **4 个是 D6 死代码**（`navbar/RTL.tsx`、`navbar/Configurator.tsx`、`fixedPlugin/FixedPlugin.tsx`、`rtlProvider/RtlProvider.tsx`——均无渲染入口）。**真实审查面 6 个**：

`components/dropdown/index.tsx` · `components/common/HalfGauge.tsx` · `app/AppWrappers.tsx` · `app/layout.tsx` · `hooks/useColorMode.ts` · `hooks/useMediaQuery.ts`

**四个 ApexCharts 组件不在风险面** —— `charts/{LineArea,Line,Pie,Bar}Chart.tsx:4` 各自已 `dynamic(..., { ssr: false })`，不依赖全局 NoSSR。

---

## 2. 功能范围（6 条，全 generator）

### F001 vitest 地基 + CRA 模板残留清理

**实物：** `package.json` 无 `test` script；`:57` + `:97` 重复声明 `@types/jest ^25.2.3`（dependencies 与 devDependencies 各一次）；`:54-56` `@testing-library/{jest-dom,react,user-event}` 在 dependencies 且**全仓零 import**；`:126-131` `eslintConfig.extends:["react-app","react-app/jest"]` 为 CRA 残留（项目实际用 `.eslintrc.json` + `eslint-config-next`）。现成样板 `scripts/test/provenance-smoke.ts:42-190`（唯一纯函数单测，自建 expect，**未进 package.json、CI 不跑**）。

- 装 `vitest` + `@vitest/coverage-v8` + `vite-tsconfig-paths`（`architecture.md:1648-1660` 规划配置）
- `vitest.config.ts`：`environment:'node'`、`include:['tests/unit/**/*.test.ts','tests/integration/**/*.test.ts']`、`coverage:{provider:'v8', include:['src/lib/**'], thresholds:{lines:80}}`
- `package.json` 补 `test:unit` script；**接入 CI**（与 lint/typecheck 同级门）
- 摘除：`@types/jest`×2、`@testing-library/*`×3、`eslintConfig` 段
- `provenance-smoke.ts` 改写为 `tests/unit/provenance.test.ts`（vitest 断言），作为首个样板；原脚本删除
- **不做 jsdom 组件单测**（`architecture.md:1670`：已装 `@testing-library/react ^13` 与 React 19 不兼容；组件正确性由 Playwright 兜底）
- lint + tsc 绿

### F002 拆 NoSSR → 恢复 SSR（D3 的前置）

- `AppWrappers.tsx` 移除 `NoSSR` 包装，全站恢复服务端渲染
- §1.2 的 **6 个活文件**逐个 SSR-safe 化：`typeof window === 'undefined'` 守卫 / 移入 `useEffect` / 必要时局部 `dynamic(ssr:false)`
- **D6 四个死代码文件不碰**（无渲染入口，SSR 触达不到）
- **回归红线（P2-CLEANUP 交付物不得破）：** 深色 pre-paint 内联脚本（`layout.tsx`）在 SSR 下仍须 paint 前置 `body.dark`、刷新无浅色闪烁；`npm run p2:f001 / p2:f002 / p2:f004` 三条探针全绿
- 浏览器控制台**零 hydration mismatch 警告**（须实测，非推断）
- 13 张视觉基线：**期望零漂移**（最终 DOM 不变）。若有漂移须逐处对账并说明成因，不得直接重生
- lint + tsc 绿

### F003 Prisma schema 扩展 `Project` + 迁移 + seed

**实物：** `Project` 现仅 6 列（`schema.prisma:103-115`：id/publicId/slug/tenantId/name/owner/createdAt）。mock 在用的 `market`/`budget`/`goal`/`health`/`cur`/`game` **DB 里一个都没有**（`mock/projects.ts:19-33`）。`Project` 与 `Game` 之间**无关联字段**。

- 按 D5 落列（字段级 schema 以本 spec 为准，ADR-22 授权范围）
- **expand-contract 迁移**（`architecture.md:938`：生产已有数据，先加列再收缩，保证回滚到上一 `IMAGE_TAG` 时 schema 兼容）—— 新列一律 nullable 或带默认值，**不得加 NOT NULL 无默认列**
- seed：四个 canonical 项目（xg/lc/aw/mf）落库，取值与 `mock/projects.ts:36-81` 一致（M1-B 页面切真数据时才有对照物）
- 通用列约定遵 `architecture.md:646-655`：`String @id @default(cuid())`、**无 `@map`/`@@map`**、`createdAt @default(now())`
- ⚠️ **`health` 不建列**（D6）
- lint + tsc 绿；`npm run db:migrate` 本地跑通

### F004 `domain/health.ts` — 健康度纯函数

- `src/lib/domain/health.ts` 导出 `computeHealth()`，签名与导出形态按 D7
- 算法按 PRD `:373`：加权（目标达成度 · 预算消耗率 · 时间进度 · 阻塞项数）→ 0–100，分档 **≥80 达标(gd) / 55–79 注意(wn) / <55 风险(cr)**
- 权重以常量导出、可单独引用（PRD 原文「权重与阈值为示意，上线以真实数据校准」→ 不得散落在函数体内的魔数）
- **三态不得压成二态**（`mock/projects.ts:10-17` 明令）；百分比 ↔ 分档一一映射（同一函数产出，不得两处各算）
- `tests/unit/health.test.ts`：覆盖三档 + **两个分档边界（55 / 80）的两侧**、零阻塞/多阻塞、周期未开始/已结束、除零防护
- lint + tsc 绿

### F005 `domain/env-guards.ts` — 环节流转守卫

- `src/lib/domain/env-guards.ts` 导出 `canEnter()` / `canAdvance()`，签名按 D7、返回结构按 D8
- 守卫条件按 `architecture.md:483-489` 五条；**依赖表未建的三条按 D9 保守拒绝**
- 维护 D2 的双值不变量：`curIdx ≤ maxReachedIdx` 且 `maxReached` 单调不减
- `tests/unit/env-guards.test.ts` + **变异测试**（D20 要求守卫/闸门/状态机类必配；断言验行为不验源码关键字）：至少覆盖「把不变量反转后测试必须翻红」
- lint + tsc 绿

### F006 环节推进写 `OperationLog`

- 推进动作（`cur` 前进 / `maxReached` 抬升）落 `domain/` 的推进函数，**服务端强制那一半**（`architecture.md:563` 要求页面与工具层双重执行；本批只做服务端半边，页面半边归 M1-B）
- 每次成功推进写一条 `OperationLog`，字段取值按 D10
- 失败推进（守卫拒绝）**不写日志**，仅返回 reason
- `tests/integration/env-advance.test.ts`：推进成功写一条、守卫拒绝零写入、`maxReached` 抬升幂等
- lint + tsc 绿

---

## 3. 关键设计决策

### 用户裁决（2026-07-22）

- **D1 批次范围 = 地基 + 领域层 6 条。** 页面接真数据（列表页/详情页/brief 分流 bug/`compute_health` 工具/死代码清理/视觉基线）留 **M1-B**。
- **D2 `cur` 存双值：`cur` + `maxReached`。** 支持 cur 回退（如组合被撤销后从 reach 退回 match）同时保留历史最远解锁位。**代价是一致性不变量**（`cur ≤ maxReached`、`maxReached` 单调不减），F005 须用变异测试守住——双值的风险就在这里，不守必漂。
- **D3 数据通道 = RSC 直读，顺带拆 NoSSR。** 故**不建** `api/envelope.ts` 信封、**不开** `/api/projects` REST 面（原拟 6 条中的两条据此替换为 F002 / F006）。
  > 遗留提示：信封仍是 `architecture.md:1405` 的演进目标，现有 5 个路由已 4 种形状；本批不做**不等于不欠**，M1-B 或后续批次仍应处理（已记 §5）。
- **D4 环节推进写 `OperationLog`。** 依据：北极星「操盘手杠杆」= 环节推进事件计数 × 周活（`architecture.md:1695`），而 ADR-21 明确不建 EventStore（`:539`）——不写就没有任何地方存，且**永久不可补录**。

### Planner 拍板（文档未覆盖，Generator 严格照此实装）

- **D5 `Project` 新增列（字段级以本 spec 为准，ADR-22）：**

  | 列 | 类型 | 说明 |
  |---|---|---|
  | `gameId` | `String?` + FK → `Game.id` | mock 的 `game` 是裸字符串，此处升为关联；nullable 以满足 expand-contract |
  | `goal` | `Json?` | 形状见 D6 |
  | `budgetTotal` | `Decimal?` | 金额不用 Float（精度） |
  | `currency` | `String?` | ISO 4217，如 `USD` |
  | `market` | `String?` | mock 在用（`projects.ts:36-81`），目标态清单未列，此处补 |
  | `cur` | `Stage` enum，默认 `brief` | Prisma enum，DB 层保完整性 |
  | `maxReached` | `Stage` enum，默认 `brief` | D2 |

  **不加 `status` 列** —— `architecture.md:462` 列了它但**未定义取值语义**。加一个语义未定的字段是负债，留到真有状态机需求时再加（expand 迁移廉价）。

- **D6 `goal` jsonb 形状 = `{ targetExposure: number, periodStart: string, periodEnd: string }`，不含预算。**
  架构 `:462` 的简写是 `goal{目标曝光/预算/周期} · budgetTotal · currency` —— 预算在两处出现。**本 spec 收敛为单一真相：预算只在 `budgetTotal` + `currency` 列**，`goal` 只管曝光与周期。配 zod schema 落 `src/lib/data/schemas/`（`architecture.md:655` 登记的演进目录，本批首次落地）。
  **`health` 不建列** —— 它是 `health.compute` 的产物（`architecture.md:525`），建列即等于把计算值固化成可漂移的第二真相，直接违反 DP-6。

- **D7 `domain/` 模块约定：kebab-case 文件名 + 具名导出，不用 namespace object。**
  架构 `:525` 表格写 `health.compute` / `envGuards.canEnter`，`:366` 目录注释写 `health · match-score · env-guards` —— 二者未对齐。**裁决：表格里的点号是注册表标签，不是模块路径。** 实装形态对齐项目既有惯例（`lib/agent/stage-routing.ts` 全部具名导出）：

  ```
  src/lib/domain/health.ts       → export function computeHealth(...)
                                   export const HEALTH_WEIGHTS / HEALTH_THRESHOLDS
  src/lib/domain/env-guards.ts   → export function canEnter(...)
                                   export function canAdvance(...)
  ```
  理由：具名导出可 tree-shake、可单独 mock、与全仓惯例一致；namespace object 在测试里更难替换。

- **D8 守卫返回结构 = `{ allowed: boolean; reason: EnvGuardReason | null }`，`EnvGuardReason` 是字符串字面量联合，不是自由文本、不是 i18n key。**
  依据 ADR-16 三处复用（页面渲染 / 工具层 / 例程）—— 自由文本无法在工具层做分支，i18n key 会把展示层耦合进领域层。**文案映射留在展示层**（M1-B）。

- **D9 依赖表未建的守卫一律「保守拒绝」，且理由必须可辨识。**
  五条守卫里只有 `→brief`（无条件）与 `→match`（brief 目标已确认，可由 `goal` 判定）在本批**真正可判**；`→reach` 依赖 `MatchPlan`（M2 建表）、`→delivery` / `→insight` 依赖 `Deal`（M3 建表）。
  **裁决：这三条返回 `{allowed:false, reason:'DEPENDENCY_NOT_IMPLEMENTED'}`，绝不返回 `true`。**
  理由：守卫是安全机制，「验不了前置条件」必须 fail-safe。返回 true = 假守卫，正是 PRD `:129` 点名的反模式「只有文案的阶段门」。该 reason 须与真实业务拒绝理由**可区分**，供 M2/M3 逐条替换时能 grep 到。

- **D10 `OperationLog` 写入取值：** `kind` 取现有枚举中语义最近者（Generator 实装时核 `schema.prisma:160-165` 实际枚举，若无合适值则本批**不扩枚举**、在 spec 回补裁决）；`projectId` 填（`Handoff` 已有 `projectId String?` 软引用先例）；载荷记 `{from, to, maxReachedBefore, maxReachedAfter}`。**append-only 由应用层保证**（DB 触发器是既有欠账 R14，不在本批）。
  > ⚠️ **D13 修正：** 本条「`projectId` 填」的事实前提有误 —— `OperationLog` 实际**没有** `projectId` 列，也没有任何 JSON 载荷列（有 `projectId` 的是 `Handoff`）。已由 D13 授权扩两列解决，`kind` 定为 `auto`。以 D13 为准。

- **D11 计算值不进契约位。** `health.compute` 输出**强类型直读**，不走 `readContractSlot`。`provenance.ts` 那套读时降级是为**外部/历史深字段**设计的（`architecture.md:884`），计算值出处确定，套上去只会掩盖计算 bug。
  > brief 面现有五个深字段仍是 `unknown` + `readContractSlot`（`env-brief.ts:86-97`）——**是否收窄为强类型直读属 M1-B 的页面层决策**，本批不动。

### 开工前审计裁决（2026-07-22，D13–D16）

Generator 开工前勘查暴露 4 处 spec 未覆盖的实物缺口，审计文档 → `docs/specs/M1-A-BRIEF-f003-f006-preimpl-audit.md`，裁决摘要：

- **D13** 授权本批扩 `OperationLog` 两列（`projectId String?` + `payloadJson Json?`，同一 expand 迁移）。**本批 schema 改动范围 = `Project` + `OperationLog`**。`kind='auto'`，不扩枚举；`ref` 语义不变。
- **D14** seed 的 `goal` jsonb **填满不留 null**：`targetExposure` 按 xg 的「$18,000 / 300 万曝光」得基准 ≈167 曝光/美元，其余三条按预算等比派生（lc 2,000,000 · aw 1,500,000 · mf 1,250,000）；周期按各项目 `cur` 阶段配置。**均为演示夹具，非实测**。
- **D15** `computeHealth` 中 `null` 因子**按 0 分计入**，返回类型无空态。**已知后果：** 四条 seed 项目健康度全落 `cr`（`actualExposure`/`budgetSpent` 本批仍无存处）。这不违反「三态不得压成二态」——该条约束的是函数，单测以合成入参实证三档；M1-B 接真实指标后自然消解，**不得靠给算法打补丁掩盖**。
- **D16** `computeHealth` 入参契约按审计 §A4 的 `HealthInput`/`HealthResult`（`now` 显式注入，`blockerCount` 无源时传 `0`）。

- **D12 迁移与回滚：** F003 的迁移必须可回滚到当前生产 `IMAGE_TAG`（`0c36fc2f…`）—— 新列全 nullable/带默认，旧代码读不到新列也不崩。**部署前须在本地 `db:migrate` + 起 standalone 实测一次**，不得只靠 `prisma validate`。

---

## 4. 验收口径（verifying）

- **fan-out：** 6 features ≥ 触发门 4 → 走 fan-out + 对抗复核（`orchestration-patterns.md` §4）
- **F001：** `npm run test:unit` 绿且**已进 CI**（须核 workflow 实际跑了，不能只看 package.json 有 script）；覆盖率门 ≥80% 对 `src/lib/**` 生效；摘除的六项依赖确认全仓零引用后才判通过
- **F002（本批最高风险项，逐条实测）：**
  - 六页 SSR 后**首屏 HTML 含实际内容**（`curl` 看得到，不是空壳）—— 这是「拆掉了 NoSSR」的实证，非「代码里删了那行」
  - 浏览器控制台**零 hydration mismatch**（两个视口 × 六页实测）
  - **P2-CLEANUP 回归红线：** `p2:f001`/`p2:f002`/`p2:f004` 三条探针全绿；深色刷新无浅色闪烁**肉眼确认**
  - 13 张视觉基线零漂移；有漂移须逐处对账，**不得直接重生**
- **F003：** 迁移 up 后 `db:migrate` 幂等重跑不报错；**回滚验证**——checkout 到 `0c36fc2f…` 的代码跑在新 schema 上不崩（D12）；seed 四条落库且字段与 mock 逐字一致
- **F004：** 分档边界 55/80 **两侧**各有用例（54/55/56、79/80/81）；权重与阈值是导出常量非魔数（grep 实证）；三态未压二态
- **F005：** 变异测试须证明**检测器活性**——把不变量反转后测试必须翻红（框架 v1.0.6 纪律）；D9 的三条 `DEPENDENCY_NOT_IMPLEMENTED` 逐条实测**返回 false**，不得有任一条返回 true
- **F006：** 推进成功写一条、守卫拒绝零写入、幂等抬升——三条各有集成测试；日志载荷字段齐全
- **就绪回归：** `next lint` + `tsc --noEmit` + `test:unit` + `test:visual` 全绿；fe-audit 三脚本无回归（复跑前按 v1.0.6「检测器活性证明」自证脚本未死）

---

## 5. 不在本批次

- **M1-B（下一批）：** 列表页/详情页/brief 面接真数据 · brief 按项目分流 bug（§1.1 #1）· `compute_health` 工具（`health.compute` 薄封装，Agent 与页面同源）· 页面层守卫（双重执行的前端半边）· `ProjectHealth`/`HEALTH_LABEL` 三重重复收敛（`projects.ts:11,13` × `today.ts:59` × `today/page.tsx:133`）· 视觉基线更新
- **BL-FE-16 / BL-FE-17 + `image/` 死代码清理** —— 用户原定并入 M1，但 D1 把本批收窄为地基层后，这两条与本批主题无关，**顺延 M1-B**（需求池条目保留）
- `api/envelope.ts` 统一信封（D3 的遗留，见上）
- knowledge 域 / 例程调度器 / 雷达真数据（M1-C+）
- `OperationLog` append-only DB 触发器（既有欠账 R14）· 闸门并发双确认原子防护（R15）
- 软删除 `deletedAt` 列（`architecture.md:652`，归 M1+ 但无本批需求）
