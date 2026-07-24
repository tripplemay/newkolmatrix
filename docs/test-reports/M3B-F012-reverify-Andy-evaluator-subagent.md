# M3-B-DELIVERY F012 — 复验报告（reverify）

- **批次：** M3-B-DELIVERY
- **Feature：** F012（BL-FE-16 hook 修复 + delivery:e2e 闭环 + 文档翻牌 + 批末新鲜度复核）
- **阶段：** reverifying（fix_rounds=1）
- **验收人：** Andy / evaluator-subagent（隔离上下文，fresh context，自行从磁盘取证）
- **HEAD：** `011d963`（fixing round1 commit）
- **修复前结论：** PARTIAL（对抗复核 UPHELD）
- **本轮结论：** **PASS**

---

## 0. 复验范围

首轮 12 features = 11 PASS（F001-F011）+ 1 PARTIAL（F012）。唯一阻断 = F012 acceptance「批末新鲜度复核」漏 2 处：architecture.md L254（顶层架构图 OPS 节）+ L372（源码目录树 ops/ 节）把已 mock 实装的 escrow/keys 标为「演进/归 M3-B+」（批内反向漂移）。本轮聚焦复核该修复是否达成 + 回归未破坏。

---

## 1. 取证边界

- 只读产品代码 + 运行测试；**未修改任何** `src/` / `prisma/` / 配置 / 文档基线（含 architecture.md，只复核不改）。
- L2（真实资金 / 发 key 外呼）**未授权**，本批设计恒 mock、无 REAL 分支 → 无 L2 需授权项。
- P1：全程零真实资金动作 / 零真实 key 发放（沿用首轮 delivery:e2e 观测标记结论，本轮未新增外呼路径）。
- 环境：本地 Postgres dev tenant（healthy）；`prisma generate` 先于 tsc（已执行，防 schema 误报）。

---

## 2. 原 PARTIAL 依据是否已消 — 逐条复核

### 2.1 L254 / L372 翻牌核对（git show 011d963 逐字）

| 行 | 修复前 | 修复后（HEAD） | 判定 |
|---|---|---|---|
| L254（顶层架构图 OPS 节） | `email ✅ M3-A F003；escrow/keys/share 演进 M3-B+` | `email ✅ M3-A F003；partner(escrow/keys) mock ✅ M3-B F004；share 演进 M4` | ✅ 已翻牌 |
| L372（源码目录树 ops/ 节） | `email/（…）；escrow · keys · share 归 M3-B+` | `email/（M3-A F003：…）· partner/（M3-B F004：EscrowPartner + KeyDistributor，仅 mock，真实现归 M5）；share 归 M4` | ✅ 已翻牌 + 补目录结构 |

escrow/keys 从「未来态」翻为 `mock ✅ M3-B F004`；L372 目录树进一步补上实际 `partner/` 结构（EscrowPartner + KeyDistributor mock），首轮报告 §3 指出的「目录树未反映 `ops/partner/`」一并消解。share 从 `M3-B+` 精修为 `M4`（与 §9.8 line 1307「share 归 M4」一致）。

### 2.2 escrow/keys 陈旧标记零命中

`grep -n '演进 M3-B\|归 M3-B' docs/dev/architecture.md` → 6 命中，**均不含 254/372**，且逐条为真未来项：

| 行 | 内容摘要 | 归属项 | 是否真未来 |
|---|---|---|---|
| L222 | `真入站回复收信归 M3-B+` | 入站邮件回复收信 | ✅ 真未来 |
| L499 | `Signal(email_reply)（真入站归 M3-B）` | 入站邮件回复信号 | ✅ 真未来 |
| L896 | `send_outreach … 批量归 M3-B` | 批量发信 | ✅ 真未来 |
| L1453 | §10.4 入站信号：`email_reply 真入站与 partner/平台源归 M3-B+` | partner **入站回调源**（signed/funded 回调 → Signal） | ✅ 真未来 |
| L1460 | §10.4 入站信号：`邮件回复·partner·平台 归 M3-B+` | 同上，入站信号源 | ✅ 真未来 |
| L1767 | `真入站收信/批量发信归 M3-B+` | 入站收信 + 批量发信 | ✅ 真未来 |

**关键辨析（L1453/L1460 的 "partner"）：** 位于 §10.4 **入站信号（Signal ingestion）** 段，指 partner **入站回调源**（signed/funded 回调作为 Signal 来源），与本批已 mock 实装的 partner **出站**适配器（EscrowPartner.release / KeyDistributor.distribute）是不同关注点。L221 明列 partner 双向：出站 = `接口先行 + mock ✅（M3-B F004）`；入站 = `signed/funded 回调 … 真实集成归 M5，现为人工登记单号`。故 L1453/L1460 标 M3-B+/M5 **正确无漂移**。

**零「已实装却标未实装」残留** — 出站 escrow/keys mock 已全文一致标 ✅ M3-B F004（见 2.3），入站回调源正确保留未来态。

### 2.3 文档不再自我矛盾（全文 escrow/keys 口径一致性）

`grep 'M3-B F004\|EscrowPartner\|KeyDistributor'` 交叉核对，partner 出站适配器 = mock ✅ M3-B F004 现全文一致：

- L221（外部集成表 · partner 出站）：`接口先行 + mock ✅（M3-B F004，零真实资金动作）；真实集成归 M5`
- L254（顶层架构图 OPS）：`partner(escrow/keys) mock ✅ M3-B F004` ← **本轮修复**
- L372（源码目录树 ops/）：`partner/（M3-B F004：EscrowPartner + KeyDistributor，仅 mock，真实现归 M5）` ← **本轮修复**
- L906/L907（工具表 payout / distribute_keys）：`mock EscrowPartner.release` / `mock KeyDistributor`（M3-B F005/F006）
- L1307（§9.8 副作用适配器）：`escrow/keys 接口 + mock ✅ M3-B F004，真实现归 M5`
- L1313（§9.8 as-built）：`ops/partner/ = EscrowPartner.release() / KeyDistributor.distribute() 两接口 + 仅 mock 实现`
- L1435/L1437（§10.3 出站集成）：`partner 接口先行 + mock ✅ M3-B F004；真实 partner 归 M5`
- L1768（§14 里程碑 M3-B 行）：`ops/partner 接口先行 + mock（零真实资金动作）… 真实 partner 归 M5`
- L1802（ADR-17）：`M3-B F004：ops/partner 接口先行 + mock，真实现留 M5`

对照磁盘实物 `ls src/lib/ops/partner/` = `index.ts + mock-escrow.ts + mock-key-distributor.ts + types.ts`（`getEscrowPartner()→MockEscrowPartner`、`getKeyDistributor()→MockKeyDistributor`、导出 `RELEASED_MARKER`/`DISTRIBUTED_MARKER`）——文档口径与实装一致，**顶层图/目录树/深层节三处再无冲突**。

**→ 首轮 PARTIAL 的全部依据（新鲜度漂移）已消。文档新鲜度 clause 满足。**

---

## 3. 修复是文档-only 核证

`git show 011d963 --stat`：

```
 docs/dev/architecture.md |  4 ++--   （L254 + L372 各 1 行，2+/2-）
 features.json            |  2 +-     （F012 status→completed）
 progress.json            | 25 +---    （fixing 落盘：status/fix_rounds/handoff）
 3 files changed, 9 insertions(+), 22 deletions(-)
```

**产品代码零改动**（`src/` / `prisma/` / `scripts/` / 配置全未触碰）。符合首轮及对抗复核给出的「fixing 仅需翻牌 L254/L372，产品码不动」范围。

---

## 4. 回归确认（修复未破坏别的）

| 检查 | 命令 | 结果 | 判定 |
|---|---|---|---|
| 类型检查 | `npx tsc --noEmit` | **EXIT=0**（0 error）| ✅ |
| 单元/集成套件 | `npx vitest run` | **64 files / 775 tests 全通过**（dev tenant，3.96s）| ✅ |
| Lint | `npx next lint` | **No ESLint warnings or errors** | ✅ |

> 首轮报告 §4 提及的 3 处 tsc TS7018 探针报错，源自兄弟 evaluator 的**未追踪** `*.evaluator-probe.test.ts`（非产品）——已在 commit `49308c1`「撤下本批 9 个 evaluator 探针」清理，本轮工作树 `git status --short` = 干净，tsc 全树 0 error。残留 `tests/unit/env-guards.evaluator-probe.test.ts` 为 M1-A-BRIEF 批次**已追踪**探针（非本批遗留），随绿 CI 一同编译通过。

---

## 5. CI 权威门

`gh run list` 独立核验：

| commit | 内容 | CI | Build & Push |
|---|---|---|---|
| `13eebb0` | F012 原始实现 | ✅ success | ✅ success |
| `49308c1` | 撤下 9 个非 CI-safe 探针（本批最后含产品/测试码的提交）| ✅ success | ✅ success |
| `011d963`（HEAD）| fixing round1（docs+state only）| 未触发（paths-ignore，符合预期）| — |

`git diff --name-only 49308c1..HEAD` = `docs/dev/architecture.md` + `features.json` + `progress.json`，**全在 paths-ignore 范围**（架构文档 / 状态机文件）→ 按 evaluator.md §12「chore-only 差异容许」等价部署，不阻断签收。绿 CI 权威门（49308c1，fresh DB + linux 基线 + 无网关凭据，含 visual job）覆盖本批全部产品/测试代码。

---

## 6. 结论

**F012 = PASS。** 首轮唯一 PARTIAL 依据（architecture.md L254/L372 escrow/keys 新鲜度漂移）已由 commit `011d963` 完全消解：两处翻牌为 `partner(escrow/keys) mock ✅ M3-B F004`，L372 补齐实际目录结构；escrow/keys 陈旧标记零命中；剩余 6 处 M3-B+ 标记逐条确认为真未来项（入站邮件回复 / 批量发信 / partner 入站回调源）；文档三层口径与实装一致，自我矛盾消除。修复为文档-only（产品码零改动），回归三件套全绿（tsc=0 / vitest 775 passed / lint clean），CI 权威门（49308c1）全绿、至 HEAD 的 diff 全 paths-ignore。

**全批 12 features 均 PASS（F001-F011 首轮 PASS + F012 复验 PASS）→ 可签发。**
