# M4-INSIGHT F008 验收 verdict — `create_share_link` outbound 工具 + 闸门

- **feature**：F008 `create_share_link` outbound 工具 + 闸门（scope project/quarterly）
- **验收者**：Andy/evaluator-subagent（隔离上下文，fan-out 单 feature 验收）
- **日期**：2026-07-24
- **被验对象**：`src/lib/agent/tools/create-share-link.ts` · `src/lib/ops/share/{index,types,mock-share-link}.ts` · `src/lib/agent/gate/gate.ts`（execute 事务口径） · `src/app/api/insight/share/route.ts` · `prisma/schema.prisma` + `prisma/migrations/20260724183013_m4_insight_three_tables`
- **结论：PASS**（acceptance 9/9 项逐条实测通过；4 条 soft-watch 观察 + 1 条同批他人在飞产物告知，均不阻断）

## 0. 环境与 L1/L2 边界

| 项 | 值 |
|---|---|
| dev DB | `newkolmatrix-dev-db` Up(healthy) · `prisma migrate status` = **Database schema is up to date!**（9 migrations） |
| prisma client | 验收前已 `npx prisma generate` 重生（testing-env-patterns §3 防误报） |
| L2 | **未执行**：`.env` 存在 `AIGCGATEWAY_API_KEY`，故一切可能外呼网关的路径被主动规避（`draft-report.test.ts` / `weekly-draft-routine.test.ts` 从回归集排除；`insight:e2e` 以 `env -u AIGCGATEWAY_*` 剥离凭据运行 → 走降级固定草案）。F008 自身路径无 LLM 依赖（`create-share-link.ts` 无网关 import） |
| 零暴露约束 | 全程 mock；另加运行时 `fetch` 劫持探针（见 E2）证明零外呼 |

## 1. acceptance 逐条核对

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | `create_share_link` 注册且挂 insight 人格 | ✓ | `scripts/test/f008-eval-persona-probe.ts` 实跑：`personaToolSubset(insight) = ['compute_roi','draft_report','create_share_link']`；`registry.ts:171` 声明；集成测同源断言（人格声明的每个工具名都在注册表） |
| 2 | class=outbound + async buildHarm | ✓ | 探针输出 `class = outbound | source = native | buildHarm = function`；`execute.ts:41` 对 `class==='outbound' && !ctx.confirmationToken` 强制走 pending |
| 3 | harm 三行：可见范围 / 有效期 /「一经生成即暴露」红标 | ✓ | 实测 harm：`scope='本项目汇总指标 · 不含联系方式'`（① 可见范围）；`evidence` 含 `有效期：7 天（至 …ISO）`（② 有效期，与 execute 同一 `resolveShare` 算法）；`evidence` 首句 `链接一经生成即暴露：撤销仅能阻止后续访问，已被打开/转发的内容无法收回`（③ 红标）；`irreversible=true` + `label='对外·不可撤销'` + `targets=['任何持有链接者（不限于系统内用户）']` |
| 4 | 无令牌 → pending 信封，副作用零发生（无 ShareLink 行、无 SHARE_CREATED_MARKER） | ✓ | 两套测试 + e2e 三路一致：pending 后 `ShareLink.count=0` 且 marker 计数=0。**强化**：入参夹带伪造 `confirmationToken`/`gateActionId` 仍只得 pending（zod 剥离未知键，模型无法自我放行，见 E4） |
| 5 | 执行后 ShareLink 落库 + `gateLogId` 非空 + `tokenHash` 在场（明文仅 execute 响应现一次，DB 只存 hash）+ irrev 留痕同事务 | ✓ | 原生 SQL 读回（E1，非 ORM 桩）：`gateLogId = PendingAction.id`、`tokenHash = sha256(明文)`、`expiresAt` 非空、`payloadRef` 非 URL；`PendingAction.status='executed'` + `ticketUsedAt` 非空；`OperationLog(kind='irrev', ref=paId)` 恰 1 行。同事务由 `gate.ts:361-395` 佐证（`prisma.$transaction` 内 `executeTool(..., db: tx)` + `executed` + irrev 三写同 tx），失败方向由第 7 项实证 |
| 6 | scope project 带 projectId / quarterly 跨项目 | ✓ | project：落库 `scope='project'`、`projectId=<夹具项目>`、披露「本项目汇总指标」；quarterly：落库 `projectId=NULL`、`scope='quarterly'`、披露「季度汇总指标 · 不含联系方式」（均以原生 SQL 复核） |
| 7 | 失败 → 无 irrev 行 + 业务回滚 | ✓ | pending→confirm 窗口内删除项目 → execute 抛「项目不存在」；ShareLink 行数不变、marker 计数不变、`OperationLog(kind='irrev', ref=paId)` 为 null、`PendingAction.status='failed'`。另有两条 buildHarm 阶段明示拒绝（缺 projectId / 项目不存在）→ PendingAction 根本不产生 |
| 8 | 幂等重入不双建（幂等键 = PendingAction.id） | ✓ | ① 同票二次 execute → 抛「执行票已被消费」，行数不变；② 执行体层同 `gateActionId` 重放 → `already=true` + `token=null`（明文不可复现，如实返回而非重生）+ 不双建 + marker 未再增；③ **并发强化**（E6）：两路并发 execute 同一票 → 1 成 1 败，ShareLink 只 +1、marker 只 +1 |
| 9 | P4 零真实公开暴露（mock 观测标记） | ✓ | `mocked=true` + `publicUrl=null` + marker 计数与落库行数一致；**运行时探针**：全链 pending→confirm→execute（两 scope）期间 `globalThis.fetch` 调用记录 `[]`（E2）；**结构性**：`src/app` 下无任何分享消费/公开访问路由（仅 `POST /api/insight/share` 发起口），全仓无 `tokenHash` 读取方；`ops/share` + 工具 + route 三处 grep `fetch(|https?://|axios` = NONE；**终态**：dev 库 `ShareLink` 行数 **0**（夹具自清理），无残留夹具租户 |

## 2. 证据（关键命令 + 输出摘录）

```bash
# ① Generator 回归测试（打真库）
$ npx vitest run tests/integration/create-share-link.test.ts
  Test Files 1 passed (1) | Tests 11 passed (11)

# ② Evaluator 独立探针（新增，不复用 Generator 断言措辞）
$ npx vitest run tests/integration/f008-evaluator-share-gate.test.ts
  Test Files 1 passed (1) | Tests 7 passed (7)
  # E1 原生 SQL 读回落库行 / E2 运行时零 fetch / E3 明文 token 全库扫描=0 命中
  # E4 闸门不可绕过 / E5 harm.expiresAt 被闸门确认窗覆盖 / E6 并发双消费只建一行 / E7 正向控制

# ③ 检测器活性（liveness）：DB 指向坏端口 → 两套测试必须红
$ DATABASE_URL=...localhost:59999... npx vitest run tests/integration/create-share-link.test.ts \
    tests/integration/f008-evaluator-share-gate.test.ts
  Test Files 2 failed (2) | Tests 18 skipped (18)   # 证明用例真打库，非内存桩假通过

# ④ 全链交叉取证（剥离网关凭据 = 零外呼）
$ env -u AIGCGATEWAY_API_KEY -u AIGCGATEWAY_BASE_URL DATABASE_URL=<dev> npx tsx scripts/test/insight-e2e.ts
  ✓ ⑤ 无令牌 → pending 信封（服务端强制停在确认前）
  ✓ ⑤ 副作用零发生（无 ShareLink 行、无 SHARE_CREATED 标记）
  ✓ ⑥ ShareLink.gateLogId 非空（经闸门）/ DB 只存 tokenHash（sha256，明文不落库）
  ✓ ⑥ irrev 留痕在场（与业务写入同事务）/ mock 分享恰好发生一次
  ✓ ⑦ mocked=true / publicUrl=null / payloadRef 为内部引用非公网 URL
  [insight-e2e] ✅ 全部断言通过（零真实公开暴露）

# ⑤ 回归面（排除会外呼的 F006/F011 两文件，L2 未授权）
$ npx vitest run --exclude tests/integration/draft-report.test.ts \
    --exclude tests/integration/weekly-draft-routine.test.ts
  Test Files 77 passed (77) | Tests 939 passed (939)

# ⑥ 静态门
$ npx next lint --file src/lib/agent/tools/create-share-link.ts --file src/lib/ops/share/*.ts \
    --file src/app/api/insight/share/route.ts   → ✔ No ESLint warnings or errors
$ npx tsc --noEmit → 2 errors，**全部**来自同批他人在飞产物 tests/unit/share-adapter.evaluator-probe.test.ts；
   与 F008 相关文件（create-share-link / ops/share / f008-evaluator-*）= NONE

# ⑦ 零暴露终态核证
$ ShareLink 行数（全库）: 0 | 残留夹具租户: 0
$ SHARE_CREATED 标记日志: 3（dev 租户，kind=auto，mocked=true，均无 64 位 hex 明文 token）
```

## 3. 零真实公开暴露核证（P4，批次硬约束）

**核证结论：本批未生成任何真实可公开访问的分享链接，未对外暴露任何数据。** 四道独立证据：

1. **实现面**：`ops/share` 选择器恒 mock，无真实现分支；非 mock provider 明示 `ShareError('not_implemented')` 拒绝而非静默回落（`index.ts`）；`publicUrl` 恒 `null`（不编造地址）
2. **运行时面**：`globalThis.fetch` 全程劫持，pending→confirm→execute（project + quarterly 两 scope）期间调用记录为空数组；`ops/share`/工具/route 三处静态 grep 无任何 HTTP 客户端
3. **结构面**：`src/app` 下不存在任何消费 ShareLink token 的公开路由（全仓无 `tokenHash` 读取方）——即便存在链接记录也无可访问入口
4. **数据面**：dev 库 `ShareLink` = **0 行**（所有夹具自清理）；残留 3 条 mock marker 审计日志 `mocked=true`、无明文 token

## 4. soft-watch 观察（不阻断 F008 PASS）

| # | 观察 | 依据 / 建议 |
|---|---|---|
| S1 | 幂等重入分支 `mocked: true` 为硬编码常量（`create-share-link.ts` 重入返回块） | 本批恒 mock 下如实；M5 接真后重入路径会**误报 mocked=true**。文件内注释已自认（"M5 接真后按原记录推断"）——建议 M5 批次将其接线到原记录推断，勿遗漏 |
| S2 | `ShareLink` 无 `(tenantId, gateLogId)` 唯一索引，去重靠闸门原子夺票 + 事务内 `findFirst` | 并发安全已实测成立（E6：两路并发只建 1 行）。M5 若出现非闸门写入口，DB 级唯一约束是更强的兜底 |
| S3 | `buildHarm` 内 `harm.expiresAt = new Date()`（当下时刻），依赖 `createPendingAction` 以确认窗 TTL 覆盖 | 覆盖已实证（E5：`harm.expiresAt === PendingAction.expiresAt` 且为未来时刻）。但任何未来"不经闸门直接预览 harm"的调用方会披露一个已过期时间——建议 M5 改为由工具直接给确认窗或显式留空 |
| S4 | `insight:e2e` 夹具清理 `ShareLink` 但不清 `SHARE_CREATED` marker `OperationLog` | dev 库累积审计噪声（当前 3 行），无暴露、无 token 泄漏；跨夹具的"marker 数 = 落库行数"不变式不能全库口径校验，仅夹具内成立 |

## 5. 需告知编排者（非 F008 缺陷）

- **他人在飞产物挡 CI**：`tests/unit/share-adapter.evaluator-probe.test.ts`（F007 验收者产物，untracked）含 2 处 `tsc` 报错（TS7005 / TS2749）。本文件不属产品代码、不属 F008，我不修改；**但若被 commit 进 main 会让 CI 的 `tsc --noEmit` 直接红**——请在推送前令其修复或剔除。
- **名词口径**：features/spec 称 `create_share_link` 为「outbound 白名单第 6」，实装 outbound 集合为 5 个（`send_outreach`/`commit_quote`/`payout`/`distribute_keys`/`create_share_link`），第 6 名 `send_bulk_outreach` 属 M3-C+。`architecture.md:909` 已如实标注「六工具白名单 = 6 中 5 已实装」，故为编号叙述而非功能缺口，不计缺陷。

## 6. 本次新增测试产物（Evaluator 域）

- `tests/integration/f008-evaluator-share-gate.test.ts`（7 用例：E1 原生 SQL 落库取证 / E2 运行时零外呼 / E3 明文 token 全库扫描 / E4 闸门不可绕过 / E5 harm 披露口径真实 / E6 并发双消费 / E7 断言正向控制）
- `scripts/test/f008-eval-persona-probe.ts`（人格子集 + class/buildHarm + outbound 集合快照）
- 未修改任何产品代码、未改 `progress.json` / `features.json`。

---

## 7. 结构化 verdict（原样，供编排者直接采信 / 落 progress.json）

```
feature_id: F008
result: PASS

acceptance_checklist:
  1. ✓ create_share_link 注册且挂 insight 人格 — 实跑探针：personaToolSubset(insight)=['compute_roi','draft_report','create_share_link']，人格声明的每个工具名均在注册表（同源断言）
  2. ✓ class=outbound + async buildHarm — 探针输出 class=outbound | source=native | buildHarm=function；execute.ts:41 对 outbound 且无令牌强制走 pending
  3. ✓ harm 三行齐 — harm.scope='本项目汇总指标 · 不含联系方式'（①可见范围）；evidence 含「有效期：7 天（至 ISO）」（②，与 execute 同一 resolveShare 算法）+ 首句「链接一经生成即暴露…已被打开/转发的内容无法收回」（③红标）；irreversible=true、label='对外·不可撤销'、targets=['任何持有链接者（不限于系统内用户）']
  4. ✓ 无令牌 → pending 信封，副作用零发生 — 三路一致：pending 后 ShareLink.count=0 且 SHARE_CREATED_MARKER=0；强化：入参夹带伪造 confirmationToken/gateActionId 仍只得 pending（zod 剥离未知键，模型无法自我放行）
  5. ✓ 执行后 ShareLink 落库 + gateLogId 非空 + tokenHash 存在（明文仅响应现一次）+ irrev 同事务 — 原生 SQL 读回：gateLogId=PendingAction.id、tokenHash=sha256(明文)、expiresAt 非空；PendingAction→executed + ticketUsedAt 非空；irrev 日志恰 1 行；同事务由 gate.ts:361-395（$transaction 内 executeTool(db:tx)+executed+irrev 三写）佐证
  6. ✓ scope project 带 projectId / quarterly 跨项目 — 原生 SQL 复核：project → scope='project'+projectId=夹具项目、披露「本项目汇总指标」；quarterly → projectId=NULL+scope='quarterly'、披露「季度汇总指标 · 不含联系方式」
  7. ✓ 失败 → 无 irrev 行 + 业务回滚 — confirm 窗口内删项目 → execute 抛「项目不存在」，ShareLink/marker 计数不变、irrev 为 null、PendingAction.status='failed'；另两条 buildHarm 阶段明示拒绝 → PendingAction 根本不产生
  8. ✓ 幂等重入不双建（键=PendingAction.id） — 同票二次 execute 抛「执行票已被消费」；同 gateActionId 重放 → already=true + token=null + 不双建 + marker 未增；并发强化：两路并发同票 → 1 成 1 败，ShareLink 只 +1、marker 只 +1
  9. ✓ P4 零真实公开暴露 — mocked=true + publicUrl=null + marker 数=落库行数；运行时 fetch 劫持全链调用记录=[]；src/app 无分享消费/公开访问路由、全仓无 tokenHash 读取方；ops/share+工具+route 三处 grep fetch|https?://|axios=NONE；dev 库 ShareLink 终态 0 行

evidence:
  - npx vitest run tests/integration/create-share-link.test.ts → 1 file / 11 tests passed
  - npx vitest run tests/integration/f008-evaluator-share-gate.test.ts（新增独立探针）→ 1 file / 7 tests passed（E1 原生 SQL 落库取证 / E2 运行时零外呼 / E3 明文 token 全库扫描 0 命中 / E4 闸门不可绕过 / E5 harm.expiresAt 被闸门确认窗覆盖 / E6 并发双消费 / E7 断言正向控制）
  - 检测器活性：DATABASE_URL=...:59999 跑同两文件 → Test Files 2 failed / Tests 18 skipped（证明真打库，排除假通过）
  - 零外呼全链交叉：env -u AIGCGATEWAY_API_KEY -u AIGCGATEWAY_BASE_URL … npx tsx scripts/test/insight-e2e.ts → 23 断言全绿，尾行「✅ 全部断言通过（零真实公开暴露）」
  - 回归面：npx vitest run --exclude draft-report.test.ts --exclude weekly-draft-routine.test.ts → 77 files / 939 tests passed（排除理由=L2 未授权，避免触网关）
  - 静态门：next lint（F008 五文件）→ ✔ 无告警；tsc --noEmit → 2 errors 全部来自同批他人在飞产物 tests/unit/share-adapter.evaluator-probe.test.ts，F008 相关文件 0 error
  - 零暴露终态：dev 库 ShareLink 0 行 / 残留夹具租户 0 / SHARE_CREATED marker 3 条（dev 租户、mocked=true、无 64 位 hex 明文）
  - 报告：docs/test-reports/m4-verify/F008-verdict.md

零真实公开暴露核证：本批未生成任何真实可公开访问的分享链接，未对外暴露任何数据。四道独立证据 = 实现面（恒 mock + 非 mock provider 明示拒绝 + publicUrl 恒 null）+ 运行时面（fetch 劫持零调用 + 三处 grep 无 HTTP 客户端）+ 结构面（无任何消费 token 的公开路由）+ 数据面（ShareLink 0 行、marker 无明文）。

soft_watch（不阻断 PASS，建议 M5 处理）:
  - S1 幂等重入分支 mocked:true 硬编码 → M5 接真后重入路径会误报（文件注释已自认，勿遗漏接线）
  - S2 ShareLink 无 (tenantId,gateLogId) 唯一索引，去重靠闸门原子夺票 + 事务内 findFirst（并发已实测安全）；M5 增非闸门写入口需补 DB 级约束
  - S3 buildHarm 内 harm.expiresAt=当下时刻，依赖 createPendingAction 覆盖（覆盖已实证）；未来"不经闸门预览 harm"的调用方会披露已过期时间
  - S4 insight:e2e 夹具清 ShareLink 但不清 SHARE_CREATED marker 日志 → dev 库审计噪声累积（无暴露）

需编排者处理（非 F008 缺陷，会挡 CI）:
  - tests/unit/share-adapter.evaluator-probe.test.ts（F007 验收者 untracked 产物）含 2 处 tsc 报错（TS7005 / TS2749）；我不碰他人产物与产品代码，但原样 commit 进 main 会让 CI 的 tsc --noEmit 直接红 —— 推送前请令其修复或剔除
  - 名词口径：features/spec 称「outbound 白名单第 6」，实装 outbound 集合为 5 个（send_outreach/commit_quote/payout/distribute_keys/create_share_link），第 6 名 send_bulk_outreach 属 M3-C+；architecture.md:909 已如实标注「6 中 5 已实装」→ 编号叙述非功能缺口，不计缺陷

新增测试产物（未动产品代码、未改 progress.json/features.json）:
  - tests/integration/f008-evaluator-share-gate.test.ts
  - scripts/test/f008-eval-persona-probe.ts
  - docs/test-reports/m4-verify/F008-verdict.md
```

---

*署名：Andy/evaluator-subagent（M4-INSIGHT F008 隔离验收，2026-07-24）*

