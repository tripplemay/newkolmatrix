# M3-B-DELIVERY · F007 验收报告

- **Feature：** F007 — delivery 内部工具：`track_delivery` / `check_deliverables`（internal）
- **验收人：** Andy / evaluator-subagent（隔离上下文，fresh context）
- **阶段：** verifying（首轮，fix_rounds=0）
- **日期：** 2026-07-23
- **结论：** ✅ **PASS**
- **执行者：** generator（本条非 executor:evaluator，纯验收）

---

## 0. 取证环境（L1 前置检查）

| 项 | 事实 |
|---|---|
| Prisma client | `npx prisma generate` 已跑；`migrate status` = *Database schema is up to date*（8 迁移全在场） |
| DB | 容器 `newkolmatrix-dev-db` :5434 运行；`Deal` 起始计数 0（干净基线） |
| Node | v25.7.0；仓内无 `.nvmrc`（不构成版本误报） |
| 命令 | `npx vitest run <path>` · `npx tsc --noEmit` |
| 被测提交 | `278eb31 feat(M3-B-DELIVERY-F007): delivery 内部工具 track_delivery / check_deliverables` |

对照 `testing-env-patterns.md`：prisma generate 先于 tsc ✓、Node/DB 就绪 ✓，无已知环境误报。

被测产物（git-tracked）：`src/lib/agent/tools/delivery-tracking.ts`（152 行，新增）、`src/lib/agent/registry.ts`（delivery 人格 tools 补齐）、`src/lib/agent/tools/index.ts`（NATIVE_TOOLS +2）。装配壳 `src/lib/delivery/check.ts` 与纯函数 `src/lib/domain/delivery-check.ts` 为复用基座。

---

## 1. Acceptance 逐条核对

> acceptance 原文（features.json F007）：两工具注册且挂 delivery 人格（registry tools 数组 + 单测同源断言）；class=internal 且无 buildHarm（只读，不过闸门）；check_deliverables 输出 = deliveryCheck 产物（不内联重算，grep 证复用）；track_delivery 返回 Deal + 条件快照（可序列化，供画布渲染）；输入契约单测。

| # | Acceptance 子项 | 判定 | 证据 |
|---|---|---|---|
| A1 | 两工具注册且挂 delivery 人格 + 同源断言 | ✅ PASS | 运行时自省：`getTool('track_delivery'/'check_deliverables')` 均命中；`delivery.tools = ["track_delivery","check_deliverables","payout","distribute_keys"]`，全部可解析。NATIVE_TOOLS（index.ts:35-36）装配二者。同源断言双证：Generator 测（delivery-tools.test.ts:127-140）+ 本探针 C（全 7 人格无悬空工具名） |
| A2 | class=internal 且无 buildHarm（只读不过闸门） | ✅ PASS | 运行时：两工具 `class=internal / source=native / buildHarm=undefined`。executeTool internal 分支不落 PendingAction；探针 C 用 240 次调用 + 本租户 scoped 计数证「零写入」（PendingAction/OperationLog/Deal/Deliverable/GameKey/Payout 计数不变 + 交付行快照逐行不变） |
| A3 | check_deliverables 输出 = deliveryCheck 产物（不内联重算，grep 证复用） | ✅ PASS | **两独立方法交叉核**：① grep `src/lib/agent/tools/delivery-tracking.ts` 全文无任何条件派生逻辑（`'ok'/'miss'/'na'`、`ready=`、`=== 'met'`、`conditionCellOf`、`checkDeliveryRow` 均零命中，仅第 6 行注释提及）——文件只搬运 `row.check.{conditions,ready,gaps}` + `describeGaps(row.check)`；② 24 组随机矩阵夹具，工具输出 `conditions/ready/gaps` 与 domain 纯函数 `checkDeliveryRow` 按库内事实直算**逐字相等**（探针 B）。`src` 内 `checkDeliveryRow` 唯一调用点在装配壳 `lib/delivery/check.ts:98` + `register.ts:60`（F008），工具层不重算 |
| A4 | track_delivery 返回 Deal + 条件快照（可序列化，供画布渲染） | ✅ PASS | `TrackDeliveryOutput = { projectId, total, readyCount, rows: DeliverySnapshotRow[] }`；每行含 Deal 事实（dealStatus/amount/currency/deliverables/contractRef/escrowRef/who）+ 条件快照（conditions 三态/ready/gaps/gapSummary）。探针 D 深检 JSON 安全：无 Date/Decimal/非 plain 对象，`JSON.parse(JSON.stringify(out))` 往返无损 |
| A5 | 输入契约单测 | ✅ PASS | zod schema：`check_deliverables{dealId:min(1)}`、`track_delivery{projectId:min(1),dealId?}`。探针 D 9 类坏入参（类型错/空串/缺字段/数字/undefined）全部 `rejects /入参校验失败/`；Generator 测另覆盖空 id / 缺字段 |

**5/5 子项 PASS。**

---

## 2. 附加不变式与边界（探针独立设计，超出 acceptance 的对抗核）

- **不变式 `ready ⟺ gaps 空 ⟺ gapSummary 空`：** 10 轮 × 24 笔 = **240 次** check_deliverables 调用，`violations = []`（结构上由 `ready = gaps.length===0` 与 `describeGaps`（gaps=[] ⟺ 返回 ''）保证）。
- **两工具同口径：** track_delivery 每行与 check_deliverables 单查结果 `toEqual`（同一判定函数，无第二套口径）。
- **三态不压二态：** 24 笔矩阵中 `ok / miss / na` 三种单元均出现（V7 §2.3 硬要求在工具层同样保持）。
- **五条件恒五行：** 含 ROW_ABSENT 补位（i=23 只建 3 类行 → 仍输出 5 行 conditions，顺序 = `DELIVERABLE_KINDS`）。
- **空态诚实：** 未知 dealId → `{found:false,row:null}` 不抛错；未知 projectId → `total=0, rows=[]`；零交易项目 → 空数组。
- **租户隔离：** 他租户 dealId 经 check_deliverables → `found:false`；经 track_delivery（projectId+dealId 收窄）→ `total:0`。**跨项目 dealId 不泄漏**（Generator 测 line 246-265 + 探针 D）。

探针文件（新增测试产物）：`tests/integration/delivery-tools.evaluator-probe.test.ts` — 12 用例全绿。

---

## 3. P1 硬约束（零真实资金/key 外呼）

F007 两工具均 **internal 只读**，不触及 `ops/partner`、不产生任何 outbound、不落 PendingAction。**本次验收未发生任何真实付款 / key 发放外呼**（探针 C 直证零写入）。放款/发 key 归 F005/F006 的 outbound 工具，不在本条范围。

**[L2] 未执行：F007 无外部服务依赖，不涉及 L2（真实网关/计费/生产写入）。** 无待授权项。

---

## 4. 执行记录（可复现）

```bash
npx prisma generate && npx prisma migrate status          # schema up to date
npx vitest run tests/integration/delivery-tools.test.ts   # 12 passed（隔离 ×10 + 并行组 ×1 全绿）
npx vitest run tests/integration/delivery-tools.evaluator-probe.test.ts  # 12 passed（含 240-call 不变式）
npx vitest run tests/integration/delivery-tools.test.ts \
  tests/integration/delivery-tools.evaluator-probe.test.ts \
  tests/integration/delivery-registry.test.ts \
  tests/integration/delivery-surface.test.ts \
  tests/unit/delivery-check.test.ts                       # 109 passed（并行 worker，无抖动）
npx tsc --noEmit                                          # F007 产物 + 探针零错（见 §5 说明）
```

---

## 5. 观察项（不降级，供编排者知情）

1. **[Soft · 非阻断 · 非产品缺陷] 首轮单次不可复现 transient：** 本会话最早一次 `npx vitest run delivery-tools.test.ts`（冷启动、与并行 fan-out 同时段）中「缺口带人类可读摘要」一例报 `expected '' to contain '合同 缺'`。随后 **isolated ×10 + 并行组 ×1 + 探针 240 次调用**共 250+ 次调用零复现。结构上 `ready` 与 `gapSummary` 同源于一次 `toSnapshot` 的 `row.check.gaps`，`ready=false` 与 `gapSummary=''` **不可能在同一快照内并存**——故该 transient 不反映真实缺陷，判为冷启动 DB 读瞬态（当时有 peer evaluator 并行跑同库）。不构成 F007 降级理由。

2. **[Info · 出 F007 范围] 全量 `tsc --noEmit` 有 2 处 TS7018 implicit-any**，位于 `tests/unit/delivery-check.evaluator-probe.test.ts` 与 `tests/unit/partner-adapters.evaluator-probe.test.ts`——二者均为**未追踪（`??`）的 peer-evaluator 探针文件**（F002/F004 本波次 fan-out 产物），**非 F007、非产品代码**。F007 产物（delivery-tracking.ts / registry.ts / index.ts）+ 本探针 tsc 零错。提请编排者知会对应 evaluator 修其探针 any 标注，与 F007 判定无关。

---

## 6. 结论

F007 全部 5 项 acceptance 子项 PASS，附加对抗不变式（240 次调用）全绿，P1 零资金/key 外呼硬约束满足。**判定 PASS。**
