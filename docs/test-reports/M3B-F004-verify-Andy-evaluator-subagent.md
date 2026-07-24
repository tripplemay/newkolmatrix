# M3-B-DELIVERY · F004 验收报告

- **feature**：F004 — ops/partner 适配器层：EscrowPartner + KeyDistributor（mock 实现）
- **executor**：generator（本条为 executor:generator，Evaluator 只验收，不实现）
- **验收人**：Andy/evaluator-subagent（隔离上下文，fresh context）
- **阶段**：verifying（fix_rounds=0，首轮）
- **日期**：2026-07-23
- **判定**：**PASS**
- **L2 授权**：未授权任何真实外部服务/计费/生产写入 —— 本 feature 无 L2 项（P1 恒 mock，零外呼），故无「[L2] 未执行」挂账

---

## 1. 取证范围（自磁盘读取，不采信任何转述）

产品代码（只读，未改）：
- `src/lib/ops/partner/types.ts`（接口 + PartnerError 六码 + M5 硬要求文件头）
- `src/lib/ops/partner/mock-escrow.ts`（MockEscrowPartner + RELEASED_MARKER）
- `src/lib/ops/partner/mock-key-distributor.ts`（MockKeyDistributor + DISTRIBUTED_MARKER）
- `src/lib/ops/partner/index.ts`（env 选择器 + fail-fast 差异理由）
- 消费点：`src/lib/agent/tools/payout.ts:187`、`src/lib/agent/tools/distribute-keys.ts:165`
- 顺手项：`src/lib/ops/email/resend-sender.ts`、`src/lib/agent/tools/send-outreach.ts`

测试产物：
- Generator：`tests/unit/partner-adapters.test.ts`（12 用例）
- 本人新增探针：`tests/unit/partner-adapters.evaluator-probe.test.ts`（8 用例，补 Generator 够不到的角度）
- 标记消费实证：`tests/integration/payout-gate.test.ts`、`tests/integration/distribute-keys.test.ts`、`scripts/test/delivery-e2e.ts`

环境前置（对照 testing-env-patterns §3/§15/§16）：`npx prisma generate` 已先跑；node v25.7.0，仓内无 `.nvmrc`/engines 约束不冲突；本地 Postgres `newkolmatrix-dev-db` :5434 healthy。

---

## 2. Acceptance 逐条核对

| # | acceptance 项 | 结论 | 证据 |
|---|---|---|---|
| 1 | ops/partner 接口定义 + mock 实现两件 | ✅ PASS | `types.ts` 定义 `EscrowPartner.release` / `KeyDistributor.distribute` 两信道接口；`mock-escrow.ts` + `mock-key-distributor.ts` 为两件 mock 实现（沿 `ops/email` 接口+实现范式） |
| 2 | mock 副作用有可观测标记（沿 SENT_MARKER 先例，供闸门/变异测试观测） | ✅ PASS | `RELEASED_MARKER='payout:RELEASED'` / `DISTRIBUTED_MARKER='distribute_keys:DISTRIBUTED'` 落 OperationLog.summary；**已实证被下游消费**：payout-gate/distribute-keys 集成测 + delivery-e2e 均以 `summary contains marker` 计数观测副作用是否发生。变异 M1（抹掉 marker）→ 用例翻红 |
| 3 | env 选择器注释明示「本批无真实现，prod 不 fail-fast；M5 才启」+ 与 ops/email 差异明文理由 | ✅ PASS | `index.ts` 文件头逐段论证：ops/email 三分支（真/mock/prod fail-fast）vs 本层恒 mock 的理由（无真实现 → fail-fast 只砍功能不挡任何真丢失）+ M5 接真三步改法。变异 M7（引入 prod fail-fast）→ 用例翻红 |
| 4 | 单测覆盖 mock 实现契约 | ✅ PASS | Generator 12 + 本人 8 = 20 用例全绿；契约面（标记/载荷/拒绝路径无副作用/ctx.db 走事务/副本返回）全覆盖 |
| 5 | CI 与本地零外呼断言 | ✅ PASS | 双探测器：Generator 的 `globalThis.fetch` 抛错哨兵 + 本人**静态源码扫描**（http/https/undici/net/child_process/XMLHttpRequest 全载体）。partner 四文件外呼载体命中 = 0；依赖面仅 `@prisma/client` + `lib/db/prisma` |

**5/5 acceptance 全 PASS。**

---

## 3. 变异测试（检测器活性证明）

在隔离 worktree（`13eebb0` detach）逐个植入变异，观察对应检测器是否翻红：

| # | 变异 | 检测器 | 结果 |
|---|---|---|---|
| M1 | 抹掉 summary 中的 RELEASED_MARKER | Generator 单测 | 🔴 RED（杀死）|
| M2 | 选择器对未实装 provider 静默回落 mock | Generator 单测 | 🔴 RED |
| M3 | 在 release 注入 `fetch()` 真外呼 | Generator fetch 哨兵 | 🔴 RED（4 用例连红）|
| M3b | 在 release 注入 `node:https` 外呼（绕过 fetch 哨兵）| Generator 哨兵 | 🟢 GREEN（**盲区**）→ 本人静态扫描 🔴 RED |
| M4 | 绕过 ctx.db 直写全局 prisma | Generator 单测 | 🔴 RED |
| M5a | 跳过空 keyRefs 校验（静默成功）| Generator 单测 | 🔴 RED |
| M6 | 留痕落明文 key + 返回入参引用 | Generator 单测 | 🔴 RED（2 用例）|
| M7 | 引入 prod fail-fast | Generator 单测 | 🔴 RED |

7/8 变异被 Generator 自身测试杀死。**M3b 是 Generator fetch 哨兵的盲区**——`vi.stubGlobal('fetch')` 只拦 `globalThis.fetch` 一条路，注入 `node:https` 外呼后 Generator 用例仍全绿。但：
- 产品代码本身**无任何非 fetch 外呼路径**（本人静态扫描独立复核 = 0 命中，依赖面仅 prisma），故 M3b 是**测试网完整性观察，不是产品缺陷**；
- 本人已新增静态扫描探针补住此盲区（`partner-adapters.evaluator-probe.test.ts` P-1）。

结论：检测器活着，且被本轮补强。**不构成 FAIL 或 PARTIAL。**

---

## 4. 本人独立探针补充覆盖（tests/unit/partner-adapters.evaluator-probe.test.ts）

Generator 测试够不到、本人补的角度（8 用例全绿）：
- **P-1** 静态零外呼扫描（补 fetch 哨兵盲区）+ 依赖面锁定
- **P-2** 无绕过入口：payout/distribute_keys 经选择器取适配器，不直接 `new Mock*`（M5 接真时无分叉）
- **P-3** 明文 key 不落库（P8）：payload key 字段集精确锁定，summary 只报数量不列 ref
- **P-4** 放款留痕逐字节透传：小数金额不取整、escrowRef=null 路径、**负数金额被拒**、**NaN 金额被拒**（`!(amount>0)` 写法的 NaN 边界，实测被正确拦截）
- **P-5** 事实记录：mock 层不承担幂等（同键连调写两条标记）——说明「不双放」真防线在应用层 F005，验收时不得把 mock 当防线

---

## 5. L1 全量证据

| 项 | 命令 | 结果 |
|---|---|---|
| 类型 | `npx tsc --noEmit` | exit 0 |
| lint | `npx next lint` | ✔ No ESLint warnings or errors |
| F004 单测 | `vitest run partner-adapters*.test.ts` | 20 passed |
| 标记消费集成测 | `vitest run payout-gate + distribute-keys` | 24 passed |
| 全量单测/集成测 | `npx vitest run` | 64 files / **775 passed** |
| 交付闭环 | `npm run delivery:e2e` | **24 断言全绿**；用量申报「真实资金动作 0 · 真实 key 发放 0」 |

---

## 6. P1「零真实资金动作」独立复核

- `package.json` grep：无 stripe/paypal/wise/payoneer/adyen/airwallex/steam/humble/keymailer 等真实付款/发 key SDK 依赖（0 命中）
- env 驱动路径：仅 `mock` 受支持；配 `ESCROW_PARTNER_PROVIDER`/`KEY_DISTRIBUTOR_PROVIDER` 为非 mock 值 → **明示抛 PartnerError**（不静默回落，杜绝「以为在真放款、其实只写日志」）——变异 M2 已证此纪律有测试兜底
- delivery:e2e 经真闸门 execute 全链跑通后申报 mock 副作用各恰好一次、无 REAL 分支
- 结论：**本轮验收未触发任何真实付款/key 发放外呼，无可误触的真实资金开关。**

---

## 7. spec §9 M3-A 结转 soft-watch 核查（F004 处置范围）

spec §9 明示：以下均为 low，不构成 acceptance 阻断项；顺手改则 commit 说明，**未改不判 FAIL**（记入下批 soft-watch）。

| 项 | F004 归属 | 处置 | 独立复核 |
|---|---|---|---|
| F003-low-2 幂等重入 `mocked:false` 硬编码 | F004 顺手 | **已修** | `send-outreach.ts:124` 改为 `mocked: existing.providerMessageId == null`（null=当时走 MockEmailSender 未外呼）——语义正确，有 commit + 代码明文交代。全量 775 测试含 send-outreach 链路全绿 |
| F003-low-1 Resend 超时非真 abort | F004 复核 | **未修 + 明文标注** | **独立证伪其"无法修"的理由为真**：读 `node_modules/resend@6.18.0` d.ts —— 构造器 `(key, options?: ResendOptions)`，`ResendOptions` 仅 `{baseUrl?, userAgent?}`，**确无 signal / customFetch 注入点**。Generator 论断成立。`resend-sender.ts` 已明文标注局限 + idempotencyKey 缓解 + `types.ts` 文件头立「真实现不得抄这段」规矩。spec §9 明示未改不判 FAIL |
| F004-low-1 ingest 四步非同一事务 | **F008 归属**（非 F004）| 不在本条范围 | spec §9 标注由 F008「建交付登记 API 时同款事务范式」处置，不计入 F004 |

F004 范围内两项均有明文交代，符合 spec §9「未改不判 FAIL」与「有明文兜底」口径。**soft-watch 核查 PASS。**

---

## 8. 边界声明

- 未修改任何产品代码 / 文档基线；仅新增测试产物 `tests/unit/partner-adapters.evaluator-probe.test.ts` 与本报告
- 变异测试在隔离 worktree 进行，已 `git worktree remove`，主工作树无残留（`git worktree list` 仅主树）
- 本波次未启动浏览器服务（:3000），符合 team-lead 约束

---

## 9. 结论

**F004 = PASS。** 5/5 acceptance 全 PASS；接口+双 mock 两件齐、可观测标记被闸门与变异测试实证消费、选择器 fail-fast 差异有明文理由且被变异守住、契约单测充分、零外呼双探测器（fetch 哨兵 + 静态扫描）成立。P1 零真实资金动作独立复核通过。soft-watch 核查符合 spec §9 口径。发现的唯一测试网盲区（node:https 非 fetch 外呼）不构成产品缺陷，已由本人探针补强。
