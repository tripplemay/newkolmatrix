# M3-B-DELIVERY F008 验收报告

- **Feature：** F008 — 交付登记 API：contract/escrow refs + Deliverable 人工核验 + key 池
- **验收角色：** Andy / evaluator-subagent（隔离上下文，快车道）
- **阶段：** verifying（首轮）
- **日期：** 2026-07-23
- **判定：** ✅ **PASS**
- **被验 commit：** `3a190a6 feat(M3-B-DELIVERY-F008)`（HEAD `8ecd7ae`）

---

## 1. 取证方式（不依赖转述）

自磁盘读取 `progress.json`（status=verifying）、`features.json` F008 条、`docs/specs/M3-B-DELIVERY-spec.md`（§5 F008 行 / P4 / P9 / §9 soft-watch）、三端点及服务层实物代码。

本机环境事实：Node v25.7.0；Docker `newkolmatrix-dev-db` Up(healthy) :5434；8 migrations 已 apply（`Database schema is up to date!`）；`prisma generate` 通过；**dev tenant 本机已 seed**（`slug=dev`，id `cmrrlq75d…`）——因此本探针得以**穿过完整 HTTP route 边界**端到端验收（Generator 自测把业务断言下沉服务层，route 只测「tenant 解析前」，本探针互补覆盖）。

**测试产物（本次新增，仅测试域）：**
- `tests/integration/delivery-registry.evaluator-probe.test.ts`（独立探针 20 例，走完整 route 路径）

**被验实物代码：**
- `src/app/api/delivery/deals/[id]/refs/route.ts`
- `src/app/api/delivery/deliverables/[id]/route.ts`
- `src/app/api/delivery/deals/[id]/keys/route.ts`
- `src/lib/delivery/register.ts`（三动作服务层，同一 `$transaction`）
- `src/lib/delivery/http.ts`（限流守卫 + 错误 envelope）
- `src/lib/delivery/deal-status.ts` · `src/lib/delivery/key-ref.ts`
- `src/lib/data/schemas/delivery.ts`（zod）· `src/lib/http/rate-limit.ts`（XFF 转正）

---

## 2. Acceptance 逐条核对

| # | Acceptance 项 | 证据 | 结论 |
|---|---|---|---|
| 1 | `POST /api/delivery/deals/[id]/refs`：登记 contractRef/escrowRef → 对应 Deliverable met + Deal signed/escrowed 推进 | 探针 §1：contract+escrow 一次到 `escrowed`（留痕 path `['signed','escrowed']` 逐级不跳态）；DB 校验 Deal.status=escrowed、contractRef/escrowRef 落库、条件 cell=ok+evidenceRef=单号 | ✅ PASS |
| 2 | `PATCH /api/delivery/deliverables/[id]`：人工核验 met/missing/na + evidenceRef + verifiedBy | 探针 §2：核验 content(met, evidenceRef, verifiedBy=`qa-andy`) → DB 校验三字段；撤回(missing, evidenceRef=null 显式撤证)；na 三态保留 | ✅ PASS |
| 3 | `POST /api/delivery/deals/[id]/keys`：key 池登记 | 探针 §4：登记 2 条 reserved + available=2；幂等重入 skipped；明文激活码 → 400 不入库 | ✅ PASS |
| 4 | 三端点在场且 nodejs runtime | grep 三文件均 `export const runtime='nodejs'`；探针 §0 import 断言三 runtime==='nodejs' | ✅ PASS |
| 5 | zod 校验坏入参 400 明示（逐字段） | 探针 §6：refs 两号皆缺 →400+issues[]；deliverables status=pending →400；evidenceRef>200 →400 明示「过长」；keys 空清单 →400；非法 JSON →400（非 500） | ✅ PASS |
| 6 | P9 限流 30/min/IP fail-open + escape hatch DISABLE_GATE_RATELIMIT | 探针 §7：第 31 次 →429+Retry-After；escape hatch=true 时 35 次从不 429；无 XFF → 放行(fail-open) | ✅ PASS |
| 7 | 三端点均写 OperationLog 留痕 | 探针 §1（交付登记+状态推进）§2（交付核验）§4（key 池登记）各断言 log 非空；key log payload 只存引用不含明文 | ✅ PASS |
| 8 | 集成测覆盖 登记→状态推进→deliveryCheck 重算联动 | Generator `delivery-registry.test.ts` 21 例 + 本探针 20 例 = 41 全绿；探针 §2 全齐→ready 翻 true、撤回→ready 回落 + 缺口 `{content, MISSING}`（recheck 用 tx 同事务重算） | ✅ PASS |

**附加独立核验（超出条目的稳健性）：**
- 不存在的 deal → 404 `NOT_FOUND`（探针 §5）
- defaulted 终态交易登记 → 409 `CONFLICT`（探针 §5）
- na 三态不被压成二态：key(na/非必需) cell=`na` 且不阻断 ready（探针 §2）——V7 §2.3 硬要求在服务层同源成立

---

## 3. spec §9 M3-A 结转 soft-watch 核查（本 feature 顺手项）

| 来源 | 项 | 本批约定处置 | 实测 | 结论 |
|---|---|---|---|---|
| F002-low | XFF 首段可伪造 | F008 新增端点时改可信段取法（右起首个非代理段）+ 注释兜底转正 | `rate-limit.ts:98-112` 已改为「从右往左跳过内网段取首个公网段」，`:84-97` 明文转正说明；探针 §8 实证：伪造左段旋转不改分桶（`9.9.9.9,203.0.113.5` 与 `8.8.8.8,203.0.113.5` 同归 `203.0.113.5`）、跳内网取公网、全内网退化取最右、无 XFF 回落 x-real-ip | ✅ 已处置 + 明文交代 |
| F003-low-1 | resend 超时非真 abort | 非 F008 scope（F003/F004 域）；`generator_handoff` 明示**未修** + `resend-sender.ts` 明文标注局限 + idempotencyKey 缓解，续记 soft-watch | 有明文交代 | 不属 F008，不判 FAIL（spec §9「未改不判 FAIL」） |
| F003-low-2 / F004-low-1 | 幂等语义 / ingest 事务 | 非 F008 scope | handoff 称已修 | 不属 F008 |

F008 相关的唯一 soft-watch（F002-XFF）已处置且有明文，符合 spec §9 口径。

---

## 4. L1 结果

| 项 | 结果 |
|---|---|
| DB / migrate / prisma generate | ✅ up-to-date，client 生成通过 |
| `delivery-registry.test.ts`（Generator） | ✅ 21 passed |
| `delivery-registry.evaluator-probe.test.ts`（本探针） | ✅ 20 passed |
| 合并运行 | ✅ 41 passed |
| tsc（F008 产品代码 + 本探针文件） | ✅ 干净（`src/`+`prisma/` 零错误，本探针零错误） |
| lint（F008 七个产品文件） | ✅ No ESLint warnings or errors |
| 探针夹具清理 | ✅ 残留 `m3b-f008-probe-%` KOL 计数 = 0（dev 共享租户只删自建） |

**L2：** [L2] 未执行，待授权（本 feature 三端点 internal、不外呼、不花钱，无 L2 依赖；本批 P1 零真实资金/key 动作 → 无需 L2 外部服务验证）。

---

## 5. 非 F008 范围的观察（供团队协调，不影响 F008 判定）

全量 `npx tsc --noEmit` 退出码为 1，但 **3 处报错全部落在其他 evaluator subagent 的探针文件**（并行验收产物，非产品代码、非 F008）：
- `tests/unit/delivery-check.evaluator-probe.test.ts:23,24`（F002 域）— `evidenceRef`/`note` implicit any
- `tests/unit/partner-adapters.evaluator-probe.test.ts:196`（F004 域）— `escrowRef` implicit any

F008 产品代码与本探针 tsc 全绿。**提请编排者/相应 evaluator 注意**：这些测试产物若原样入库会红 CI（TS7018）；属 F002/F004 评估者的清理项，不构成 F008 阻断。

---

## 6. 判定

**F008 = PASS。** 三端点端到端闭环（登记→met→Deal 推进→deliveryCheck 重算）、zod 400 逐字段、P9 限流 fail-open + escape hatch、三端点 OperationLog 留痕、XFF soft-watch 转正——全部 acceptance 项以完整 route 路径实测证据成立。首轮 verifying PASS（fix_rounds=0）：(a) acceptance 全代码层 PASS；(b) L1 全 PASS，L2 无依赖；(c) 唯一 F008 相关 soft-watch（F002-XFF）已处置且明文。

---

## 附：结构化返回

```json
{
  "feature_id": "F008",
  "result": "PASS",
  "description": "交付登记三端点（refs/人工核验/key 池）全部 acceptance 通过：走完整 HTTP route 路径端到端实测——登记 refs→Deliverable met+Deal signed/escrowed 推进、人工核验 met/missing/na+evidenceRef+verifiedBy、key 池登记（幂等+明文守卫）、三端点 nodejs runtime、zod 坏入参 400 逐字段明示、P9 限流 30/min/IP fail-open+DISABLE_GATE_RATELIMIT escape hatch、三端点均写 OperationLog、deliveryCheck 同事务重算联动（全齐→ready 翻 true、撤回→回落+缺口清单）。F002-XFF soft-watch 已转正（右起首个非代理段，实测伪造左段不改分桶）。Generator 21 例 + 独立探针 20 例 = 41 全绿；F008 产品代码 tsc+lint 干净。注：全量 tsc 退出 1 系其他 evaluator subagent 探针文件（F002/F004）的 TS7018，非 F008 范围。",
  "steps_to_reproduce": "N/A（PASS）。复现验收：docker 起 newkolmatrix-dev-db(:5434) + npx prisma generate + npx vitest run tests/integration/delivery-registry.test.ts tests/integration/delivery-registry.evaluator-probe.test.ts → 41 passed"
}
```
