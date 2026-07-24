# M3-B-DELIVERY F010 验收报告 — env-guards →delivery / →insight 真判

- **Feature:** F010 — `env-guards →delivery / →insight 真判`（P12）
- **Evaluator:** Andy / evaluator-subagent（隔离上下文，fan-out 单条）
- **阶段:** verifying（首轮，fix_rounds=0）
- **日期:** 2026-07-23
- **结论:** **PASS**
- **取证方式:** 磁盘直读代码 + 独立跑测 + 真库集成 + 产品代码植入变异体独立复核（复核后 `git checkout` 还原）

---

## 1. Acceptance 逐条核验

| # | Acceptance 条目 | 判定 | 证据 |
|---|---|---|---|
| 1 | 两条流转真判（不再返 `DEPENDENCY_NOT_IMPLEMENTED`） | ✅ PASS | `env-guards.ts:136-142` — `delivery` 分支返回 `ctx.hasDeal ? allow() : deny('NO_DEAL_YET')`，`insight` 分支返回 `ctx.allDealsSettled ? allow() : deny('DEALS_NOT_SETTLED')`。`EnvGuardReason` 联合类型（:22-36）已无 `DEPENDENCY_NOT_IMPLEMENTED`。行为面穷举断言（env-guards.test.ts:163-189）：全状态空间下 `reasons` 集合永不含该占位理由，且必含 `NO_DEAL_YET`/`DEALS_NOT_SETTLED`。全仓 grep：**零功能残留**（无 `deny('DEP...')`、无联合成员，见 §3） |
| 2 | 新 reason 码 + 用户可读文案（`env-guard-messages.ts` 映射齐备） | ✅ PASS | `env-guard-messages.ts:17-20` — `NO_DEAL_YET`/`DEALS_NOT_SETTLED` 均有中文人话文案，非占位。`Record<EnvGuardReason,string>` 全量类型强制新增 reason 时 tsc 报错防漏配。集成测（env-guards-delivery.test.ts:193-201）断言两文案含「交易」「收尾」且全表无 D9 占位串「尚未接入」 |
| 3 | `EnvGuardContext` 扩字段（hasDeal/allDealsSettled）+ 两调用点组装齐全 | ✅ PASS | 接口 `env-guards.ts:59-69`（两字段**必填非可选**，杜绝「忘了查」静默降级）。**三个组装点全对**：① `env-advance.ts:81-88`（服务端硬闸 `canAdvance`，`findMany` 查 Deal 状态 → `hasDeal`/`allDealsSettled`，tenant 过滤）② `campaigns/[id]/page.tsx:56-88`（RSC 查库组装进 `ProjectDetailData`）③ `ProjectDetail.tsx:79-82`+`135-137`（`canEnter` 前端拦截传入）|
| 4 | 零 Deal 项目不被 →insight 阻断（P12 空态诚实） | ✅ PASS | `allDealsSettled = [].every(...) === true` → 放行。集成测 env-guards-delivery.test.ts:185-190 + 我的独立探针（零 Deal delivery→insight 放行且落痕一条）双证 |
| 5 | D20 变异（守卫恒放行 / 判据取反 → 测试翻红） | ✅ PASS | **独立复核**：向真实产品代码 `env-guards.ts` 逐个植入 4 个变异体，每个跑真实套件均翻红，还原后复绿（见 §2） |
| 6 | 集成测：无 Deal 拒 → 建 Deal 放行 → 全部 completed 后 →insight 放行 | ✅ PASS | env-guards-delivery.test.ts（15 用例，打真库走 `advanceStage` 全链）+ env-advance.test.ts（7）全绿；我的独立探针补穷举「全部非收尾态阻断」15 用例全绿 |

---

## 2. D20 变异检测力独立复核（向产品代码植入 → 观测翻红 → 还原）

在真实 `src/lib/domain/env-guards.ts` 上逐个植入变异体，跑 `tests/unit/env-guards.test.ts`（37 用例），每次跑完 `git checkout` 还原：

| 变异体 | 改动 | 结果 | 杀死 |
|---|---|---|---|
| A | →delivery 恒放行（丢弃 hasDeal 判据） | 6 failed / 31 passed | ✅ |
| B | →insight 恒放行（丢弃 allDealsSettled 判据） | 7 failed / 30 passed | ✅ |
| C | →delivery 判据取反（`hasDeal` → `!hasDeal`） | 7 failed / 30 passed | ✅ |
| D | →insight 判据取反（`allDealsSettled` → `!allDealsSettled`） | 8 failed / 29 passed | ✅ |

**4/4 全部杀死；还原后 `git status` 干净、`grep MUTANT_ = 0`。** 断言确有检测力，非死断言。
（另：套件内已含 Generator 自带的合成变异体测试 7 条，此处不重复计。）

---

## 3. `DEPENDENCY_NOT_IMPLEMENTED` 残留精查

`grep -rn` src/ + tests/ 命中 4 处，**逐条鉴定均非功能占用**：

| 位置 | 性质 | 是否违规 |
|---|---|---|
| `src/lib/domain/env-guards.ts:120` | 退役说明**注释**（"随之退役——没有任何分支再返回它"） | 否 |
| `tests/unit/env-guards.evaluator-probe.test.ts:35,68` | **注释** | 否 |
| `tests/unit/env-guards.test.ts:186` | **反向断言** `expect(reasons.has('DEP...')).toBe(false)`（正是在测「它不再出现」） | 否 |

精确 grep `deny('DEPENDENCY_NOT_IMPLEMENTED')` 与联合成员 `| 'DEPENDENCY_NOT_IMPLEMENTED'`：**零命中**。
> 说明：team-lead 转述的「含测试零命中」表述略不精确（字符串确以注释/反向断言形式存活），但 acceptance 判据是「不再**返回**」，已完全满足——残留串反而是「已退役」的正向证据。**不构成缺陷。**

---

## 4. L1 测试结果汇总

| 项 | 命令 | 结果 |
|---|---|---|
| 单元 | `vitest run tests/unit/env-guards.test.ts` | **37/37 PASS** |
| 单元探针 | `vitest run tests/unit/env-guards.evaluator-probe.test.ts` | **12/12 PASS** |
| 集成（F010 主） | `vitest run tests/integration/env-guards-delivery.test.ts` | **15/15 PASS**（打真库 :5434） |
| 集成（回归） | `vitest run tests/integration/env-advance.test.ts` | **7/7 PASS** |
| 集成（我的独立探针） | `vitest run tests/integration/m3b-f010-evaluator.test.ts` | **15/15 PASS**（全非收尾态穷举 + 混合态 + 空态） |
| 类型 | `tsc --noEmit`（F010 产品文件） | **CLEAN**（无 env-guards/env-advance/messages/两调用点错误） |
| Lint | `next lint` | **0 error / 0 warning** |

**独立探针增量价值：** Generator 的「未收尾」路径仅喂 `delivering` 一态。我的探针穷举 `DealStatus` 全部 5 个非收尾态（negotiating/signed/escrowed/delivering/blocked）逐态断言 →insight 被拒，并断言 7 个态全部满足 →delivery「≥1 Deal」——两条判据的边界各自独立守住（防「误把中间态并进已收尾集合」的退化）。

---

## 5. [L2] 标注

**F010 无 L2 项。** 本 feature 是纯服务端 domain 守卫 + RSC/前端组装，无外部服务调用、无计费、无生产写入、无资金/发 key 动作。P1 零真实资金动作对 F010 天然满足（本 feature 不触碰 ops/partner）。→ **[L2] 不适用。**

---

## 6. 观察项（非阻断，供 team-lead / Planner 记账）

1. **[边界·轻] `tests/unit/env-guards.evaluator-probe.test.ts`（标注为「Evaluator 独立探针」的 M1-A 遗留文件）在 F010 提交 `998a959` 中被 Generator 改动**（机械同步联合类型注释）。改动本身无害且必要（否则不编译），但触及了标注归 Evaluator 的测试文件，属边界轻微模糊。记录备查，不影响 F010 正确性。
2. **[批次级·非 F010] 全项目 `tsc --noEmit` 当前为红**——3 处 `implicit any` 错误全部落在**其他并行 evaluator 的探针文件**（`tests/unit/delivery-check.evaluator-probe.test.ts`、`tests/unit/partner-adapters.evaluator-probe.test.ts`，属 F002/F004 验收范围）。**非 F010 缺陷**，但红 tsc 会卡 CI，提请 team-lead 汇总时协调对应 evaluator 修正其探针的显式类型标注。我的探针 `m3b-f010-evaluator.test.ts` 已核 tsc 零错。

---

## 7. 结论

**F010 = PASS。** 6 条 acceptance 全部代码层 + 行为层 + 真库集成实测通过；D20 变异检测力经产品代码植入独立复核（4/4 杀死并还原）；无 soft-watch 遗留。产品代码与文档基线**零改动**，变异体已全部 `git checkout` 还原，仅新增测试产物 `tests/integration/m3b-f010-evaluator.test.ts` 与本报告。

**复现步骤（一键）：**
```bash
cd /Users/yixingzhou/project/newkolmatrix
npx prisma generate
npx vitest run tests/unit/env-guards.test.ts \
  tests/integration/env-guards-delivery.test.ts \
  tests/integration/env-advance.test.ts \
  tests/integration/m3b-f010-evaluator.test.ts
npx next lint
grep -rnE "deny\('DEPENDENCY_NOT_IMPLEMENTED'\)|\|\s*'DEPENDENCY_NOT_IMPLEMENTED'" src/   # 期望零命中
```
