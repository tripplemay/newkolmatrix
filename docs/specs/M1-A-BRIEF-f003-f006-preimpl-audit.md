# M1-A-BRIEF · F003/F004/F006 开工前审计请求

> **发起者：** Andy (Generator)
> **日期：** 2026-07-22
> **触发条件：** `pre-impl-adjudication.md` §2.1「数据模型 gap」×2 +「多份参考源冲突」×1 +「规格文字含糊」×1
> **状态：** 等 Planner 裁决后才开工（F003 / F004 / F006）。**F001 / F002 无歧义，不受本审计阻塞，先行实现。**

---

## 0. 先说结论：哪些不是问题（勘查已自解，无需裁决）

| 疑点 | 实物核查 | 结论 |
|---|---|---|
| D10「`kind` 取现有枚举中语义最近者，若无合适值则停下走审计」 | `architecture.md:800` 定义 `auto` = **工具直接执行的可逆动作**。环节推进正是可逆动作（D2 明确允许 `cur` 回退） | **`kind='auto'`，不扩枚举**。D10 的 fallback 条件未触发 |
| Prisma 无 `Stage` enum | 全仓 `Stage` 只存在于 `lib/agent/stage-routing.ts:10` 的 TS 类型（`brief\|match\|reach\|delivery\|insight`） | F003 顺带建 Prisma `Stage` enum，取值与 TS 类型逐字一致。属 D5 题内之义 |
| seed 需要 tenant / Game | `scripts/seed/import-kol-csv.ts` + `demo-handoff.ts` 已有 `getDevTenantId()` 惯例（`src/lib/agent/context.ts`） | 复用该惯例；`gameId` FK 需先 seed 四条 `Game`（否则 FK 悬空） |

以下 A1–A4 才是真正需要裁决的。

---

## A1 · `OperationLog` 没有 `projectId` 列（D10 的事实前提不成立）

**spec D10 原文：** 「`projectId` 填（`Handoff` 已有 `projectId String?` 软引用先例）」

**实物（`schema.prisma:167-178`）：** `OperationLog` 共 7 列 —— `id / tenantId / kind / actor / summary / ref / createdAt`。**没有 `projectId`**。有 `projectId String?` 的是 `Handoff`（`:186`）—— D10 把「Handoff 有先例」误读成了「OperationLog 也有」。

于是 F006 acceptance 的「`projectId` 填」当前**无处可填**。

**候选方案：**

| 方案 | 做法 | 代价 |
|---|---|---|
| **A** | `OperationLog` 加 `projectId String? @@index([projectId])`（expand 迁移，与 `Handoff` 同形态） | 动了既有留痕表；但纯 expand（nullable、无默认），旧代码零感知 |
| **B** | 复用现有 `ref String?` 列存 projectId | `ref` 现语义是 `→ PendingAction.id`（`architecture.md:1358`），一列两义；北极星按项目聚合时无法区分 `ref` 是 PA 还是 project |
| **C** | 本批不填 projectId，只写 `summary` 文本 | 北极星指标（`architecture.md:1695` 环节推进事件计数）无法按项目聚合；D4 立项理由「不写就永久不可补录」自我落空 |

**Generator 倾向 A。** 理由：B 制造一列两义，正是留痕表最不该有的东西（审计表的字段语义必须单一，否则 M2/M3 加写入点时无法安全查询）；C 让 D4 的立项理由落空。A 是纯 expand，满足 D12 回滚兼容（旧 `IMAGE_TAG` 代码不读新列）。

---

## A2 · `OperationLog` 没有任何 JSON 载荷列（F006 acceptance 的载荷无处可存）

**spec F006 acceptance 原文：** 「载荷记 `{from, to, maxReachedBefore, maxReachedAfter}`」

**实物：** `OperationLog` 的可写文本位只有 `summary String?`（人类可读一句话，`runs.ts:5` 已把它固定为展示契约）与 `ref String?`。**没有 `Json` 列**。对照 `PendingAction` 有 `inputJson`/`harmJson`、`Handoff` 有 `messagesJson` —— 唯独 `OperationLog` 没有。

**候选方案：**

| 方案 | 做法 | 代价 |
|---|---|---|
| **A** | 加 `payloadJson Json?`（与 `Handoff.messagesJson` 同形态） | 同 A1-A：纯 expand |
| **B** | 把四元组编码进 `summary` 字符串 | `summary` 是展示契约（`runs.ts:5` + V13 Agent 记录页直渲），塞结构化数据会污染 UI 文案；且不可查询 |
| **C** | 本批只写 `summary` 人话，载荷留 M1-B | 「maxReached 抬升幂等」的集成测试无从断言 before/after |

**Generator 倾向 A**，且与 A1 **同一个迁移**落地（一次 expand 加两列，不分两次动留痕表）。

> ⚠️ 若 Planner 采纳 A1-A/A2-A，则本批的 schema 改动**从「只动 Project」扩为「Project + OperationLog」**。这超出 spec §2 F003 的字面范围（F003 标题只写 `Project`），故必须由 Planner 明示授权，Generator 不自行扩。

---

## A3 · F003 seed「与 mock 逐字一致」在三个字段上物理不可能

**spec F003 acceptance 原文：** 「seed 四个 canonical 项目 xg/lc/aw/mf 落库，取值与 `mock/projects.ts:36-81` **逐字一致**」

**实物冲突（`src/lib/data/mock/projects.ts:19-81`）：**

| mock 字段 | mock 实际值 | D5/D6 规定的落库形态 | 冲突 |
|---|---|---|---|
| `budget` | `'$18,000'`（**字符串含 `$` 与千分位**） | `budgetTotal Decimal?` + `currency String?` | 需解析：`18000` + `'USD'`。**不可能逐字** |
| `goal` | `'公测前 30 天内获得 300 万曝光，验证硬核射击向创作者对新用户的拉新效率'`（**散文**） | `{targetExposure:number, periodStart:string, periodEnd:string}` | 散文 → 结构化。`targetExposure` 可从文案抽（300 万 → 3000000），但**四条里只有 xg 与 mf 的文案含可抽取的数字目标**（lc 是「Top 20 榜位」、aw 是「800 条评测 / 8% 转化」——都不是曝光量） |
| 周期 | **mock 里完全不存在**（无任何日期） | `periodStart` / `periodEnd` 必填 | 无源可依 |
| `health` | `'wn'/'gd'/'gd'/'cr'` 硬编码 | **D6 明令不建列** | 落不了库；且 F004 的 `computeHealth` 若无 actuals 也算不出这四个值（见 A4） |

**候选方案：**

| 方案 | 做法 |
|---|---|
| **A** | 收窄「逐字一致」到**可无损映射的字段**：`id(slug) / name / game / market / owner / cur`；`budgetTotal+currency` 由 `budget` 串解析（`$18,000` → `18000`+`USD`）视为无损；`goal` 的 `targetExposure` 仅 xg/mf 可填、lc/aw 填 `null`；`periodStart/periodEnd` 全填 `null`（`goal Json?` 本就 nullable）。**`health` 不 seed**（D6） |
| **B** | 为四条项目**编造**周期与曝光目标凑齐 jsonb | 违反 mock 目录规则 #4「缺失字段一律 null，绝不填 0/'' 冒充实测」（`projects.ts:5`） |
| **C** | `goal` 直接存散文字符串 | 违反 D6 规定的 jsonb 形状 |

**Generator 倾向 A。** 理由：B 直接撞 `projects.ts:5` 写死的渲染契约（「绝不填 0/'' 冒充实测」），编造的周期会在 M1-B 页面接真数据时以「假实测」形态显形；C 违反 D6。**A 的代价是 `goal` 四条里两条为空壳**，需 Planner 确认这个空壳可接受（M1-B 页面层须按 D2 渲染「待补充」而非 0）。

---

## A4 · `computeHealth()` 的输入契约无源（spec 只定了算法与导出形态，没定入参）

**spec F004 原文：** 算法按 PRD `:373` 加权（**目标达成度 · 预算消耗率 · 时间进度 · 阻塞项数**）→ 0–100。

**实物：** 这四个因子的**分子全都不存在**：

| 因子 | 需要 | 全仓实物 |
|---|---|---|
| 目标达成度 | 实际曝光 ÷ 目标曝光 | 目标在 A3 后仅两条可填；**实际曝光无任何存处**（无指标表） |
| 预算消耗率 | 已消耗 ÷ 总预算 | `budgetTotal` 本批新建；**已消耗无存处**（无 Deal/结算表，归 M3） |
| 时间进度 | now 相对 period | `periodStart/End` 在 A3 后全 null |
| 阻塞项数 | 阻塞列表 | **无阻塞表**（PRD FR-8.2.1.2 的阻塞卡属 M1-B 页面层，无数据源） |

即：`computeHealth` 在本批**只能是一个纯函数**，其入参必须由调用方显式提供，DB 里取不到。这与 D6「health 是 `health.compute` 的产物，不建列」一致，但 spec 没写入参长什么样。

**Generator 拟定（属 D7 授权的模块形态范围内，若 Planner 无异议即按此实装）：**

```ts
export interface HealthInput {
  targetExposure: number | null;   // 目标曝光（null = 未设目标）
  actualExposure: number | null;   // 实际曝光（null = 无实测）
  budgetTotal: number | null;      // 总预算
  budgetSpent: number | null;      // 已消耗
  periodStart: Date | null;
  periodEnd: Date | null;
  now: Date;                       // 显式注入，保持纯函数可测
  blockerCount: number;            // 阻塞项数（无阻塞源时调用方传 0）
}
export interface HealthResult { score: number; band: 'gd' | 'wn' | 'cr'; }
```

**需 Planner 明确一点：某个因子的输入为 `null`（无实测）时怎么算？** 三选一：

| 方案 | 做法 | 后果 |
|---|---|---|
| **A** | 该因子**退出加权**，剩余因子权重按比例归一化 | 四因子全 null 时无法归一 → 需定义「全空」返回值 |
| **B** | 该因子按 0 分计入 | 无实测 = 直接判「风险 cr」。四条 mock 项目全会变 cr，与 mock 现有 `wn/gd/gd/cr` 三态全冲突 |
| **C** | 该因子按满分计入 | 无实测 = 判「达标 gd」，虚假绿灯 |

**Generator 倾向 A + 「全 null 返回 `{score: null, band: null}`」**（而非硬凑一个分数）。理由：B 制造虚假红灯、C 制造虚假绿灯，两者都是 PRD `:129` 点名的反模式变体；A 的「无数据就说没数据」符合 `projects.ts:5` 的渲染契约。**但这会让 `computeHealth` 的返回类型变为可空**，影响 F004 acceptance 里「三档不得压成二态」的表述 —— 实际是**三档 + 一个「无数据」态**。需 Planner 确认这不算「压成二态」的反面。

---

## 裁决请求汇总

| # | 问题 | Generator 倾向 | 需 Planner 拍板 |
|---|---|---|---|
| A1 | `OperationLog` 无 `projectId` | 加列（expand） | 是否授权本批动 `OperationLog` 表 |
| A2 | `OperationLog` 无 JSON 载荷列 | 加 `payloadJson Json?`，与 A1 同一迁移 | 同上 |
| A3 | seed「逐字一致」不可能 | 收窄到可无损映射字段，`goal` 部分为 null | 空壳 `goal` 是否可接受 |
| A4 | `computeHealth` 入参与 null 语义 | 因子退出加权 + 全空返回空态 | 「三档 + 无数据态」是否算违反「不得压成二态」 |

---

## 裁决段（Planner 填写）

<!-- 角色切换：以下由 Planner 填写（快车道同会话裁决，pre-impl-adjudication §4.6 豁免） -->

> **裁决人：** 用户（A1/A2、A3、A4 三处实体裁决）+ Andy 以 Planner 身份补齐机械细节
> **日期：** 2026-07-22
> **注：** A3 / A4 用户裁决与 Generator 倾向相反，按用户裁决执行。Generator 倾向作废，不得在实装中夹带。

### D13（A1 + A2）：授权本批扩 `OperationLog` 两列 —— 采纳方案 A

同一 expand 迁移加：

| 列 | 类型 | 说明 |
|---|---|---|
| `projectId` | `String?` + `@@index([projectId])` | 与 `Handoff.projectId` 同形态软引用，单租户下不强 FK |
| `payloadJson` | `Json?` | 与 `Handoff.messagesJson` 同形态；F006 载荷 `{from,to,maxReachedBefore,maxReachedAfter}` 落此 |

**本批 schema 改动范围据此从「只动 `Project`」正式扩为「`Project` + `OperationLog`」**，F003 acceptance 相应扩写。两列均 nullable 无默认，满足 D12 回滚兼容（`0c36fc2f…` 旧代码不读新列）。
`ref` 列语义保持不变（仍专指 `PendingAction.id`），不得一列两义。
`kind` 用 `auto`（`architecture.md:800` 定义 = 工具直接执行的可逆动作），**不扩枚举**。

### D14（A3）：seed 补齐周期与曝光目标 —— 采纳方案 B

四条 canonical 项目的 `goal` jsonb **填满**，不留 null。取值口径：

- **`targetExposure` 派生规则（可审计，非随手编）：** 仅 xg 的 mock 文案含明确曝光目标（「300 万曝光」/ `$18,000`），得基准 **≈167 曝光/美元**；其余三条按各自 `budget` 等比换算，四舍五入到万位。lc `$12,000`→2,000,000 · aw `$9,000`→1,500,000 · mf `$7,500`→1,250,000。
  > lc/aw/mf 的 mock 文案目标本非曝光量（依次为榜位 / 评测数 / 安装数），故不可直接抽取，改按预算等比派生。**该派生值是 seed 演示数据，不是实测**，M1-B 接真实目标时以真值覆盖。
- **`periodStart` / `periodEnd`：** mock 无任何日期，按各项目 `cur` 所处阶段配置合理周期（xg 进行中 / lc 刚开始 / aw 接近结束 / aw 已结束），使 F004 的「时间进度」因子在 seed 数据上可算出有区分度的值。绝对日期写死在 seed，属演示夹具。
- **`health` 仍不 seed**（D6 不变）；`budget` 串按 `$18,000 → budgetTotal=18000, currency='USD'` 解析。

### D15（A4）：`null` 因子按 0 分计入 —— 采纳方案 B

`computeHealth` 中任一因子输入为 `null`（无实测）时，**该因子按 0 分计入加权**，不退出加权、不归一化、不返回空态。返回类型保持 `{ score: number; band: 'gd'|'wn'|'cr' }`，**无空态**。

**已知后果（记录在案，非缺陷）：** `actualExposure` 与 `budgetSpent` 在本批仍无任何存处（指标表未建、`Deal` 归 M3），故四条 seed 项目的健康度**将全部落入 `cr`**，与 `mock/projects.ts` 现有的 `wn/gd/gd/cr` 三态不一致。

- 这**不违反** F004 acceptance 的「三态不得压成二态」——该条约束的是**函数**，`computeHealth` 仍能对三档输入产出三档输出，单测以合成入参覆盖 54/55/56、79/80/81 两侧边界实证。
- 「seed 全 cr」是**数据可得性**的事实，不是算法缺陷。M1-B 接真实曝光/消耗指标后自然消解。
- **M1-B 须知：** 页面接真数据时若沿用 seed，列表页四个项目会全显红。这是预期，不得靠给 `computeHealth` 打补丁（如「无实测就当达标」）掩盖——那正是 PRD `:129` 的反模式。

### D16（A4 附）：`computeHealth` 入参契约 —— 采纳 Generator 拟定形态

`HealthInput` / `HealthResult` 按审计 §A4 代码块实装（`now` 显式注入保持纯函数可测；`blockerCount` 无阻塞源时调用方传 `0`），**但去掉可空返回**（D15）。

### 未变更事项

D1–D12 全部保持不变。本裁决只新增 D13–D16。
</content>
</invoke>
