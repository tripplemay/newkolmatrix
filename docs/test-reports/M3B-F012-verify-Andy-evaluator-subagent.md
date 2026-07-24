# M3-B-DELIVERY F012 隔离验收报告

- **Feature：** F012 — BL-FE-16 hook 修复 + delivery:e2e 闭环 + 文档翻牌 + 批末新鲜度复核
- **验收人：** Andy / evaluator-subagent（隔离上下文，fresh context）
- **验收时间：** 2026-07-23
- **HEAD：** `8ecd7ae`（F012 实现 commit = `13eebb0`）
- **阶段：** verifying（首轮，fix_rounds=0）
- **结论：** **PARTIAL**
- **唯一阻断项：** architecture.md 批末新鲜度复核不完整——line 254 / 372 仍把 escrow/keys 标为「演进 M3-B+ / 归 M3-B+」（未实装口径），而 M3-B F004 已 mock 实装（`ops/partner/`）。属批内反向漂移。

---

## 1. 取证边界

- 只读产品代码 + 运行测试；未修改任何 `src/` / `prisma/` / 文档基线 / 视觉 png。
- L2（真实资金 / 发 key 外呼）**未授权**，本批设计恒 mock、无 REAL 分支 → 无 L2 需授权项；标注见 §5。
- 环境：本地 Postgres `newkolmatrix-dev-db`（:5434，healthy）；Node v25.7.0；网关 key 在场（.env）。
- L1 前置：`prisma generate` 先于 tsc（已执行，防 schema 误报）。

---

## 2. Acceptance 逐条核对

| # | Acceptance 项 | 证据 | 判定 |
|---|---|---|---|
| 1 | useColorMode 跨实例同步（一处 toggle 另一处收到通知）| `tests/unit/color-mode-store.test.ts` 10/10 通过（含「一处 setDark，另一处纯读取方收到通知」+ 多消费者广播 + D20 变异体 A/B 翻红）；浏览器 `f012:colormode` 7/7 | ✅ PASS |
| 2 | 多标签页 storage 事件监听 | `color-mode-store.ts:131-138` browserColorModeTarget.observe 挂 `storage` 监听 + MutationObserver 双通道；浏览器测 B「A 切换后 B 页经 storage 事件跟随」通过 + D「无关 key 不触发」活性反证通过 | ✅ PASS |
| 3 | 既有 2 调用点行为不变断言 | 对外 API 不变 `{isDark,setDark,toggle}`；实际 hook 消费方 = navbar（`navbar/index.tsx:32`），第二「调用点」= layout.tsx pre-paint 脚本（同操作 body.dark）；`p2:f002` 14/14（默认浅色/切换/持久/刷新/损坏值回落/pre-paint 无闪烁全绿） | ✅ PASS |
| 4 | backlog.json 移除 BL-FE-16 | `backlog.json` = `[]`（已清空） | ✅ PASS |
| 5 | delivery:e2e 全链（24 断言）+ 副作用零发生 | `npm run delivery:e2e` 24 ✓ 全绿：commit_quote→Deal+5 条件 → 条件未齐服务端拒（PA 不产生）→ 登记 refs → key 分发闸门 → 条件齐 ready=true → payout pending（副作用零）→ confirm/execute → Payout released + Deal completed + irrev 留痕 → →insight 放行 | ✅ PASS |
| 6 | 零真实资金动作（mock 观测标记，无 REAL 分支）| `ops/partner/index.ts` 选择器**恒 mock**，配非 mock provider 明示 `PartnerError('not_implemented')`——无 REAL 分支；`delivery-e2e.ts` 头明文无 REAL 分支；RELEASED/DISTRIBUTED_MARKER 计数各 +1；脚本尾申报「真实资金动作 0 · 真实 key 发放 0」 | ✅ PASS |
| 7 | architecture.md 翻牌（§5.2/§5.3①③/§5.4/§9.8/§10.3/§14/工具表/delivery 人格）| 权威节全部正确翻牌（§5.2 line 412 ✅ M3-B；§5.3① line 488-489 hasDeal/allDealsSettled 真判；§5.3③ line 505-508 资金生命周期；§5.4 line 537 deliveryCheck；§9.8 line 1307-1313/1437 `ops/partner` mock ✅ F004；§10.3 line 1435；§14 line 1768 ✅ 已交付；工具表 906-907 payout/distribute_keys；delivery 人格 tools）| ⚠️ 见 §3 |
| 8 | ui-inventory V7 登记 | `ARCH-M05-ui-inventory.md:77-80`「V7 …（M3-B F009 接真）」11 元素逐处 + 新增例外登记（空态 emptyText，元素数不变） | ✅ PASS |
| 9 | agent-architecture 同步 | `agent-architecture.md:34` M3-B F005/F006/F007/F011 工具扩容 + 「delivery 人格 tools 由空数组填为四件」；line 109 payout·distribute_keys 已兑现 | ✅ PASS |
| 10 | 批末新鲜度复核（陈旧计数/未实装残留/演进 M3 标记）| DEPENDENCY_NOT_IMPLEMENTED src 内仅剩退役注释（零分支返回）；confirmPayout/mockDeliveryLedger 零命中；env-delivery 已退役（仅注释）；表计数 line 667「21 表」= 实测 21 模型表（17+4，四表在场）✔；**但「演进 M3」标记 sweep 漏 2 处** | ⚠️ 见 §3 |
| 11 | lint 绿 | `next lint` → No ESLint warnings or errors | ✅ PASS |
| 12 | tsc 绿 | 产品树 `tsc --noEmit` = **0 error**（3 处 error 均在**兄弟 evaluator 的未追踪探针文件** delivery-check/partner-adapters.evaluator-probe，非产品、非 F012） | ✅ PASS（见 §4 备注） |
| 13 | test:unit 绿 | `npm run test:unit` → 73 files / 938 tests 全通过 | ✅ PASS |
| 14 | test:visual 绿 | **CI 权威门绿**（F012 commit `13eebb0` CI run 30064426293 = success；ci.yml:112-151 visual job 跑 `test:visual`，fresh DB + linux 基线 + 无网关凭据）；本地 2 处失败均环境产物（见 §5） | ✅ PASS（CI 权威）|

---

## 3. 阻断项：批末新鲜度复核不完整（PARTIAL 依据）

`grep '演进 M3-B\|归 M3-B\|escrow/keys' docs/dev/architecture.md` 命中两处陈旧标记：

- **line 254**（§顶层架构图 OPS 节）：
  `OPS["ops/（部分实装）：email ✅ M3-A F003；escrow/keys/share 演进 M3-B+"]`
  同行 email 已给 ✅，escrow/keys 与 share 一并落在「演进 M3-B+」（未实装口径、无 ✅），但 escrow/keys 本批 F004 已 mock 实装。

- **line 372**（§源码目录树）：
  `└── ops/  [部分已建](M3-A F003) email/（…）；escrow · keys · share 归 M3-B+`
  ① escrow/keys 标「归 M3-B+」（未来），与实装矛盾；② 目录树未反映实际结构 `ops/partner/`（F004 建，含 mock-escrow.ts + mock-key-distributor.ts）。

**判据：** evaluator 角色规范「文档新鲜度 clause」——「已实装却仍标未实装 = 批内反向漂移，判 PARTIAL」。F012 acceptance 明列「批末新鲜度复核（…演进 M3 标记）」，一次 `grep 演进 M3` 即可命中此二处，属该复核应捕获而漏捕的项。

**修复建议（Generator，doc 基线，Evaluator 不改）：** 把 254/372 中 escrow/keys 改为「✅ mock M3-B F004（真实现归 M5）」，仅 share 保留未来标记；line 372 目录树补 `ops/partner/`（EscrowPartner + KeyDistributor mock）。权威节（§9.8/§10.3/§14）已正确，无需动。

**注：** 除此二处外，其余「M3-B+」标记（line 222/499/896/1453/1460/1767：真入站收信 / 批量发信 / email_reply / partner 真实集成 归 M3-B+/M5）指向**确属未来**的项，正确无漂移。

---

## 4. tsc 备注（非 F012 阻断）

`tsc --noEmit` 全树报 3 error，全部落在**其他 fan-out evaluator 的未追踪探针文件**：
- `tests/unit/delivery-check.evaluator-probe.test.ts`(23,24) — F002 探针
- `tests/unit/partner-adapters.evaluator-probe.test.ts`(196) — F004 探针
均为 `TS7018 隐式 any`（对象字面量属性）。排除后产品树 + F012 自身测试（color-mode-store.test.ts）= **0 error**。这些是兄弟 evaluator 的测试产物，不属 F012 范围、非产品缺陷；建议汇总环节由对应 evaluator / 编排者在合并前清理（否则合并后全树 tsc 红）。vitest 用 esbuild 不做类型检查，故 test:unit 仍全绿。

---

## 5. test:visual 本地 2 失败——环境产物核证（非 F012 回归）

CI（F012 commit）visual job = **success**（linux 基线 + fresh seed DB + 无网关凭据），为权威门。本地 `npm run test:visual` = 2 failed / 11 passed，逐一定性：

1. **dashboard `en-today`（像素 diff 4366px）**：本地长寿命 dev DB 的历史 OperationLog 行含相对时间标签「N 小时前」，随时间漂移。**generator_handoff 已明文记录**，并入 proposed-learnings。
2. **workbench `project env=match`（超时等空态文案）**：该基线态自证注释（workbench.spec.ts:43）=「CI 无网关凭据 lazy 静默降级空态」。本地 .env **有非空网关 key**（实测 count=1），env=match 页触发 lazy 候选生成而非降级空态 → 空态文案「组合方案尚未生成」不出现 → 超时。**同类环境产物**（本地凭据 ≠ CI 凭据），非产品缺陷。旁证：同项目 `xg` 的 brief/reach/delivery/insight 四张视觉断言均通过（null 优雅降级空态），F012 未触碰 match env / dashboard feed。

两项均 [L1-env] 环境产物，CI 为权威门且已绿。dashboard 一项有明文兜底（generator + proposed-learnings）；workbench 一项由测试注释自证 + CI 权威兜底。**建议 generator 在 F012 soft-watch 台账补记 workbench env=match 本地网关 key 差异项**（当前仅记了 dashboard 一项）——非阻断，但新鲜度台账应完整。

---

## 6. 运行证据汇总

```
color-mode-store.test.ts   10 passed (10)
delivery:e2e               24 ✓ 全绿（RELEASED/DISTRIBUTED_MARKER 各 +1，无 REAL 分支）
p2:f002 (browser)          14 passed, 0 failed
f012:colormode (browser)   7 passed, 0 failed
test:unit                  73 files / 938 tests 全通过
next lint                  No ESLint warnings or errors
tsc --noEmit（产品树）      0 error
CI F012 commit             success（含 visual job）
DB 模型表                  21（17 既有 + Deal/Deliverable/GameKey/Payout）
backlog.json               []（BL-FE-16 已移除）
:3000                      验收后已 kill（port clear）
```

---

## 7. P1 零真实资金动作申报

本批全程 mock 适配器，**未发生任何真实付款 / key 发放外呼**。`ops/partner` 选择器恒 mock、无 REAL 分支、配非 mock provider 明示拒绝；delivery:e2e 尾行申报「真实资金动作 0 · 真实 key 发放 0」。P1 铁律满足。

---

## 8. 结论

**F012 = PARTIAL。** 代码层（hook 跨实例同步 + delivery:e2e 闭环 + 零资金动作）+ L1（lint/tsc/unit）+ 视觉 CI 权威门 + 浏览器实测**全部 PASS**；唯一阻断 = architecture.md 批末新鲜度复核漏 2 处 escrow/keys「演进 M3-B+」陈旧标记（254/372），属批内反向漂移，按 evaluator 新鲜度 clause 判 PARTIAL。修复为 Generator 2 行 doc 编辑，成本极低。
</content>
</invoke>
