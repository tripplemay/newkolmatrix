# M3-B-DELIVERY F012 — 对抗复核报告（recheck）

- **批次：** M3-B-DELIVERY
- **Feature：** F012（BL-FE-16 hook 修复 + E2E 闭环 + 文档翻牌 + 批末新鲜度复核）
- **任务类型：** 对抗复核（orchestration-patterns.md §4 阶段 2）——尝试证伪一条既有 PARTIAL 发现
- **复核对象发现：** F012-freshness-drift（来源 `docs/test-reports/M3B-F012-verify-Andy-evaluator-subagent.md`）
- **执行者：** Andy / evaluator-subagent（隔离上下文，read-only）
- **日期：** 2026-07-23
- **约束：** 只允许「证伪或维持」，**不得放宽验收口径**；grep/read/tsc 只读，不改任何文件（含测试与文档）

---

## 结论

**VERDICT: UPHELD（发现成立，F012 维持 PARTIAL）**

三点独立取证全部成立，所有证伪角度均被击破。因产品代码本身无缺陷（escrow/keys mock 实装正确、可运行），判 **PARTIAL 而非 FAIL** 判级恰当。

---

## 被复核的发现（原文摘录）

> architecture.md 批末新鲜度复核不完整：`docs/dev/architecture.md` line 254（顶层架构图 OPS 节）与 line 372（源码目录树 ops/ 节）仍把 escrow/keys 标为「演进 M3-B+ / 归 M3-B+」（未实装口径），而 M3-B F004 已在 `ops/partner/` mock 实装（EscrowPartner + KeyDistributor）。属批内反向漂移，判 PARTIAL。F012 acceptance 明列「批末新鲜度复核（陈旧计数/未实装残留/演进 M3 标记）」。

---

## 独立取证

### ① 事实基础：L254 / L372 确把 escrow/keys 标为未实装未来态 — 属实

`grep -n` + 逐行读 `docs/dev/architecture.md`：

- **L254**（顶层架构图 OPS 节）：
  ```
  OPS["ops/（部分实装）：email ✅ M3-A F003；escrow/keys/share 演进 M3-B+"]
  ```
- **L372**（源码目录树 ops/ 节）：
  ```
  └── ops/   [部分已建](M3-A F003) email/（EmailSender + Resend/Mock 双实现）；escrow · keys · share 归 M3-B+
  ```

**铁证：** 同一 L254 内 `email = ✅ M3-A F003`（done 标记，带勾 + 功能号）vs `escrow/keys = 演进 M3-B+`（无勾、无功能号）——done / future 语义对比清晰。escrow/keys 被明确置于「未实装/未来」一侧。

### ② 实装真存在：escrow/keys 本批已 mock 实装 — 属实

- `ls src/lib/ops/partner/` → `index.ts` + `mock-escrow.ts` + `mock-key-distributor.ts` + `types.ts`
- `src/lib/ops/partner/index.ts`：
  - `getEscrowPartner()` → `return new MockEscrowPartner()`
  - `getKeyDistributor()` → `return new MockKeyDistributor()`
  - 导出 `RELEASED_MARKER` / `DISTRIBUTED_MARKER`（mock 可观测标记）
- **架构文档自我矛盾**：同一 architecture.md 的深层节已翻牌，唯独顶层图(254)+目录树(372)漏翻：
  - L1307：`escrow/keys 接口 + mock ✅ M3-B F004`
  - L1313：`当前 as-built（M3-B F004）：ops/partner/ = EscrowPartner.release() / KeyDistributor.distribute() 两接口 + 仅 mock 实现`
  - L1437：`partner 适配器（src/lib/ops/partner/，M3-B F004）… 只有 mock 实现`

  → 深层节承认 `✅ M3-B F004`，顶层图/目录树仍写 `M3-B+`，文档内部不一致。这正是「批末新鲜度复核」应捕获的漂移类别。

### ③ acceptance 范围：新鲜度复核为 F012 显式验收项 — 属实

`features.json` F012 acceptance 逐字：

> …architecture.md 翻牌（…§9.8/§10.3/§14 M3-B 行/工具表/delivery 人格 tools）+ ui-inventory V7 登记 + agent-architecture 同步 + **批末新鲜度复核（grep 陈旧计数/未实装残留/演进 M3 标记）**；lint+tsc+test:unit+test:visual 绿

→ 扫「演进 M3 标记」是**显式列明**的验收项，非 evaluator 自创门槛。2 处残留 `演进/归 M3-B+`（覆盖已实装的 escrow/keys）即该验收项未完成。

---

## 证伪角度全灭

| 证伪尝试 | 击破依据 |
|---|---|
| 「`M3-B+` = 含 M3-B 起，escrow/keys 在 M3-B 完成也符合此标记，不算漂移」 | 同一 L254 内 email mock = `✅`；escrow/keys 与 genuinely-future 的 `share` 并列于无勾的 `M3-B+` 侧。按文档自身标准（email mock 算 ✅ 实装），escrow/keys mock 必同等算 ✅——不存在「escrow/keys mock 算未实装、email mock 算 ✅」的自洽读法。 |
| 「这些标记指向真未来项（share / M5 partner 真实集成），标 M3-B+/M5 是正确的」 | `share` 确为正确未来态（line 1307 归 M4），**不动、非漂移**；但 escrow/keys 已在 M3-B F004 完成——分组标签对 escrow/keys 就是错的 = 「已实装却标未实装」反向漂移。 |

---

## tsc 旁证（供 fixing 范围判断，非本发现主体）

`npx tsc --noEmit` → `EXIT=1`，全树仅 **3 处** `error TS7018`（隐式 any）：

```
tests/unit/delivery-check.evaluator-probe.test.ts(23,5): error TS7018: ... 'evidenceRef' implicitly has an 'any' type.
tests/unit/delivery-check.evaluator-probe.test.ts(24,5): error TS7018: ... 'note' implicitly has an 'any' type.
tests/unit/partner-adapters.evaluator-probe.test.ts(196,7): error TS7018: ... 'escrowRef' implicitly has an 'any' type.
```

- 三处全在 `*.evaluator-probe.test.ts`——兄弟 evaluator 的未追踪探针（`git status` 为 `??`），非产品代码。
- **产品代码零 tsc 报错。** tsc 不构成 fixing 对产品代码的约束项。

---

## fixing 建议范围

仅需翻牌 `docs/dev/architecture.md` **L254 / L372 两处 escrow/keys**（对齐 L1307/L1313/L1437 的 `✅ M3-B F004 mock` 口径）；`share` 保持未来态正确，**不动**。产品代码无需改动。

---

## 结构化结论

```json
{
  "finding": "F012-freshness-drift",
  "verdict": "UPHELD",
  "reason": "三点独立取证全部属实：(1) docs/dev/architecture.md L254（顶层架构图 OPS 节）与 L372（源码目录树 ops/ 节）确把 escrow/keys 标为未实装未来态（『演进 M3-B+』/『归 M3-B+』），同行 email 却标 ✅ M3-A F003，done/future 语义对比清晰；(2) escrow/keys 已在 src/lib/ops/partner/ mock 实装（M3-B F004：MockEscrowPartner/MockKeyDistributor + RELEASED/DISTRIBUTED_MARKER），且 architecture.md 自身 L1307/L1313/L1437 已承认『✅ M3-B F004』——顶层图与目录树漏翻牌导致文档自我矛盾；(3) F012 acceptance 逐字含『批末新鲜度复核（grep 陈旧计数/未实装残留/演进 M3 标记）』，该复核为显式验收项且未达成。属批内反向漂移（已实装却标未实装），非放宽口径可豁免。因产品代码无缺陷，判 PARTIAL 而非 FAIL，判级恰当。fixing 仅需翻牌 L254/L372 两处 escrow/keys（share 保持未来态正确，不动）。",
  "tsc_probe_files": [
    "tests/unit/delivery-check.evaluator-probe.test.ts",
    "tests/unit/partner-adapters.evaluator-probe.test.ts"
  ],
  "tsc_untracked": true
}
```
