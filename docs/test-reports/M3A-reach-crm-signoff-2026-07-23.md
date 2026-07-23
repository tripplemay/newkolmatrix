# M3-A-REACH-CRM 批次验收签收报告（signoff）

> **Evaluator：** Andy/evaluator-subagent（隔离上下文，fresh context）
> **日期：** 2026-07-23
> **批次：** M3-A-REACH-CRM · status=reverifying · fix_rounds=2
> **本轮范围：** round-3 窄幅复验——仅 F010 文档面（round-2 报告 §7 明文口径：「fixing round 2 速修后仅针对 F010 文档面做窄幅复验；F002/F008 无需重开——除非 round 2 触碰产品代码」；`git show defb9da --stat` 实证仅触 `docs/dev/architecture.md` + 状态文件，窄幅口径成立）
> **结论：** **10/10 PASS —— 批次可收官（fix_rounds=2）**

---

## 0. 取证方式（未采信任何转述）

全部输入自行从磁盘读取：`progress.json` / `features.json` /
`docs/test-reports/M3A-reach-crm-verify-round1-2026-07-23.md`（首轮）/
`docs/test-reports/M3A-reach-crm-reverify-round2-2026-07-23.md`（round-2，本轮复验基准）/
`git show defb9da`（修复实物 diff）/ `docs/dev/architecture.md` / `src/lib/agent/gate/gate.ts` /
`prisma/schema.prisma` / `.auto-memory/`（MEMORY.md + project-status.md + environment.md + role-context/evaluator.md）。

**产品代码零改动**（`git status` 干净可验）。本轮为纯文档核验，未起服务进程（:3000 全程未占用），
未消耗任何 L2 用量，无 DB 写入，无测试夹具产生。

---

## 1. 最终判定总表（三轮轨迹）

| Feature | round-1（verify） | round-2（reverify） | round-3（本轮） | 最终 |
|---|---|---|---|---|
| F001 四表迁移 + PA 7 态 + contactEmail | PASS | —（未重开） | — | **PASS** |
| F002 闸门两步票据（confirm 签票 / execute 消费票） | FAIL（critical+high+low） | **PASS**（cf94c5d 根治 + 回归可对比性实证） | —（defb9da 零触产品代码，判定延续） | **PASS** |
| F003 ops/EmailSender + Resend/Mock + send_outreach | PASS | — | — | **PASS** |
| F004 signals 接入 + /api/signals/inbound | PASS | — | — | **PASS** |
| F005 crmInfer 五态纯函数 + D20 变异 | PASS | — | — | **PASS** |
| F006 reach 工具扩容（draft/refine/commit_quote） | PASS | — | — | **PASS** |
| F007 contactEmail 抽屉录入口 + PATCH API | PASS | — | — | **PASS** |
| F008 V6 ConversationInbox 接真 | FAIL（critical） | **PASS**（UI 级全链实证 + 视觉 13/13） | —（同上，判定延续） | **PASS** |
| F009 CRM 人工覆盖入口（U4 三态） | PASS | — | — | **PASS** |
| F010 E2E 闭环 + 部署面 + 文档翻牌 + 新鲜度复核 | PARTIAL | PARTIAL（残留 1 medium + 1 low） | **PASS**（本轮两 issue 全消，§2） | **PASS** |

**批次可否收官：可以。** 10/10 PASS，无 FAIL/PARTIAL 残留，soft-watch 全部有明文兜底（§6）。

---

## 2. round-3 窄幅复验详情（F010 文档面）

### 2.1 round-2 §6 issue 1（medium）：:1151「无 /api/gate/execute 端点」反向漂移段 → **已修复（实证）**

按 round-2 steps_to_reproduce 复查：

- **违规段已删除**：`git show defb9da -- docs/dev/architecture.md` 证实原段（三句断言全反实物）整段改写；
  全文 grep「无 `/api/gate/execute` 端点」「同一函数内完成」「停在 pending 可重新确认」零命中。
- **改写段（现 :1153-1155「确认与执行分立」）逐句对实物核验，全部一致：**

| 改写段断言 | 实物依据 | 判定 |
|---|---|---|
| `confirmed` 是真实中间态，票 TTL 5 分钟 | `gate.ts:32` `TICKET_TTL_MS = 5 * 60 * 1000`；confirm 原子条件 UPDATE → confirmed + ticketHash（:247-282） | ✓ |
| 「已确认但未执行」由 GET 详情可见 | `getPendingActionDetail`（gate.ts:185-208）返回 status/ticketExpiresAt/ticketUsedAt，confirmed 态如实暴露 | ✓ |
| 超时惰性翻转 `expired` | `lazyExpire`（gate.ts:166-182）：pending 过确认窗 / confirmed 过票窗 → 原子条件写 expired（幂等） | ✓ |
| 副作用失败落 `failed` 终态（无 irrev 行） | gate.ts:394-397 失败路径 `status:'failed'` + 注释「无 irrev 行（业务写入已随事务回滚）」 | ✓ |
| 严禁静默重试，重试须产出新 PendingAction | failed 属终态集：confirm/execute 对 executing/executed/failed/rejected 一律 409 `GATE_ALREADY_DECIDED`（gate.ts:315 分支）；过期路径错误文案「请重新发起该动作」（:237/:329）；全文件无任何自动重试逻辑 | ✓ |

- **顺带扩写的 stableStringify 注记（:1149-1151）与实物一致**：object 中 undefined 值键丢弃
  （gate.ts:77 filter）、数组 undefined 元素 → null（gate.ts:72，仅数组路径可达）——与 gate.ts:65-68
  注释及 `tests/unit/payload-hash.test.ts`（在场，round-2 已实证其回归活性）逐点吻合。
- **与同节零矛盾**：端点表（:1130-1136，`/api/actions/[id]/execute` 在 :1135）、令牌机制表
  （:1145 双窗 TTL 15min/5min）、§9.3.1 攻击矩阵、§9.3.2 两步票据全量描述（:1173-1190）——改写段与
  as-built §9.3 全节内部一致，反向漂移消除。

### 2.2 round-2 §6 issue 2（low）：§7.2.1 枚举计数笔误 → **已修复（实证）**

三方计数一致：`grep -c '^enum ' prisma/schema.prisma` = **11**；doc :681 标签已改「枚举（**11 个**，
与实物逐字一致）」；doc prisma 代码块内 enum 行数（awk 提取）= **11**。标签 = 块内清单 = schema 实物。

### 2.3 `grep -n 'api/gate' docs/dev/architecture.md` 复扫 → **4 命中全部合法，零违规残留**

| 行 | 内容 | 定性 |
|---|---|---|
| :1128 | 「M0.5 单步确认（/api/gate/{confirm,reject}…）**已退役**；现行为 confirm 签票 / execute 消费票两步」 | 退役声明 ✓ |
| :1190 | 「旧单步 `/api/gate/*` 端点**退役**」 | 退役声明 ✓ |
| :1260 | 「**M0.5** 闸门 UI 边界（D6）：本批只做…真实 send/quote/payout/share 工具实装**归 M3/M4**」 | 历史批次记述（M0.5 锚定，前瞻已由 M3-A 兑现；现状由同节 :1128 退役声明覆盖）✓ |
| :1839 | v1.2 **变更记录** 引用块内「as-built 校准…闸门实为单步确认即执行…」 | changelog 历史记述（记述 ARCH-M05 定稿当时实况）✓ |

宽措辞加扫（`无 .*execute|execute 端点|confirm 即执行|同一函数内完成|停在 .*pending`）额外命中
:1153（改写段自身的历史对照句）/:1164（现行正确断言）/:1288（现行正确行为），均非残留。

### 2.4 defb9da 改写段抽查 → **零新引入矛盾**

defb9da 对 architecture.md 的 diff 全量仅三处（枚举标签 / stableStringify 注记 / 违规段改写），
三处均已逐句对实物核验（§2.1/§2.2），无新引入的与实物矛盾表述。

### 2.5 F010 全量 acceptance 终判

| 项 | 判定 | 依据 |
|---|---|---|
| E2E 闭环（含 L2 记账） | PASS | round-2 实证延续（reach:e2e 15 断言全绿；本轮 defb9da 零触产品代码，证据等价，§3） |
| P1 真实 KOL 零发信 | PASS | round-1/2 三重断言 + 全程合成夹具，延续 |
| 部署面（三键 + webhook + compose） | PASS | round-1 只读 ssh 实证，此后零变更，延续 |
| architecture.md 翻牌 + 批末新鲜度复核 | **PASS** | 本轮 §2.1-§2.4 两 issue 全消、复扫零违规 |
| lint+tsc+test:unit+test:visual | PASS | round-2 全绿证据经等价性验证对 HEAD 有效（§3） |

---

## 3. 证据等价性（round-2 绿证据 → HEAD）

`git diff a2751fd..HEAD --name-only` = `docs/dev/architecture.md` + `docs/test-reports/…round2….md` +
`progress.json`（features.json 变更含在 defb9da 内）——round-2 复验所在树（a2751fd）之后**代码面与测试面
零变更，二进制相同**。故 round-2 批级回归面证据对 HEAD 完全有效，无需重跑：

- `npx vitest run` 52 文件 **522/522** · `npm run gate:smoke` 54 断言全绿（G1-G8+G5.5+7 态+D20+竞态）
- `npm run reach:e2e` 15 断言全绿 · `npx tsc --noEmit` exit 0 · `npx next lint` 0/0
- `npm run test:visual` **13/13** 零漂移
- F002 回归可对比性：前版 worktree 6/7 红 / HEAD 7/7 绿（检测器活性自证）

## 三轮验收轨迹摘引

| 轮 | 报告 | 结论 |
|---|---|---|
| round-1（verifying，fix_rounds=0→1） | `docs/test-reports/M3A-reach-crm-verify-round1-2026-07-23.md` | 7 PASS + **F002 FAIL**（critical payloadHash undefined-键中毒 + high 工具注册副作用 + low）+ **F008 FAIL**（V6 confirm 恒 403）+ **F010 PARTIAL**（4 文档 issue）→ fixing |
| round-2（reverifying，fix_rounds=1→2） | `docs/test-reports/M3A-reach-crm-reverify-round2-2026-07-23.md` | 修复实物 cf94c5d：**F002 PASS · F008 PASS · F010 PARTIAL**（残留 :1151 反向漂移段 + §7.2.1 计数笔误）→ fixing，signoff 扣留 |
| round-3（reverifying，本报告） | 修复实物 defb9da（文档面 only） | **F010 PASS → 10/10 全 PASS，签收** |

---

## 4. 类型检查 / CI

round-2 实测（对 HEAD 代码面等价有效，§3）：`npx tsc --noEmit` exit 0（prisma generate 前置）·
`npx next lint` 0 errors 0 warnings。defb9da 为文档+状态文件 commit，不触 CI 编译面。

---

## 5. L2 实测记录与用量申报汇总

> 本批无 staging 独立环境；prod（`newkol.guangai.ai`）现跑 M2-C @42bacb3，M3-A 部署由用户手动触发。

| 轮 | L2 项 | 用量 |
|---|---|---|
| round-1 F006 验收 | 真网关 chat ×1（deepseek-v3，502 tokens） | ≈ $0.000157 |
| round-1 F010 验收 | reach:e2e 真网关起草 chat ×1（deepseek-v3，in=283 out=134） | ≈ $0.000124 |
| round-1 对抗复核 | reach:e2e 复跑 chat ×1（deepseek-v3） | ≈ $0.000118 |
| round-2 F010 复验 | reach:e2e 复跑 chat ×1（deepseek-v3，in=283 out=191） | ≈ $0.000146 |
| round-3（本轮） | 纯文档核验 | **0** |
| **合计** | **gateway chat ×4** | **≈ $0.000545** |
| 真实邮件投递 | **0 封**（全三轮 mock，零外呼；P1 真实 KOL 地址零发信全程成立） | — |

### [L2] 真投递 REAL 模式——未执行，部署后 prod 补验（明文兜底）

**本地不可执行系环境约束而非缺陷**：RESEND_API_KEY 仅存 VPS（U2 用户裁决：密钥不离服务器）。
验证路径明文兜底三处（progress.json `generator_handoff` / `.auto-memory/project-status.md` /
`docs/dev/deploy.md`）：**用户触发 deploy-prod 部署 M3-A 后，在 prod 实测真投递——仅发往
`OUTREACH_TEST_RECIPIENT=tripplezhou@gmail.com`（P1），验证 `mocked===false` + `providerMessageId`
非空 + Resend webhook（`/api/signals/inbound`）四事件回流落 Signal。**
`scripts/test/reach-e2e.ts` REAL 分支断言在场。部署面三键（RESEND_API_KEY / OUTREACH_TEST_RECIPIENT /
RESEND_WEBHOOK_SECRET）已于 2026-07-23 全部就位 VPS .env，compose 已 scp——部署即生效。

---

## 6. Soft-watch（不阻塞 done，随批转录记账）

round-2 §5 清单原样转录（均有明文兜底，不阻断）：

| ID | 描述 | 风险等级 | 建议处置 |
|---|---|---|---|
| F003-low-1 | ResendEmailSender 30s 超时为 Promise.race 非 AbortController 真中断——Idempotency-Key 在场不双发，功能无损 | low | 后续批次顺手改真 abort |
| F003-low-2 | 幂等重入分支返回 `mocked:false` 硬编码——重放时输出字段语义轻微失真，无断言面影响 | low | 后续批次顺手修正 |
| F004-low-1 | ingest 落库四步非同一事务——中途失败后重投走防重路径，该事件 lastSignalAt/重算/auto 留痕可能缺失（CRM 态最终收敛，影响有界） | low | 建议 $transaction 包裹或 duplicate 路径补幂等重算 |
| F002-low（结转） | XFF 首段可伪造旋转绕过限流（辅助防线）——可信段取法已明文记 M3-B 顺手项（rate-limit.ts 注释兜底） | low | M3-B 顺手项 |
| L2-REAL | 真投递 REAL 本地不可执行（U2 密钥不离 VPS）——验证路径三处明文兜底 = 用户触发 deploy-prod 后 prod 实测（仅 OUTREACH_TEST_RECIPIENT） | medium | 见 §5，部署后补验 |

已消解（不再挂账）：F009-low-1 编号互换（cf94c5d）· F009-low-2 探针未追踪（已入 git）·
F002-low 注释失真（cf94c5d）· F010-medium :1151 反向漂移 + low 枚举计数（defb9da，本轮核销）。

**Evaluator 备注（round-2 结转，供后续批次参考）**：mock 发送类验收清态必须额外按 summary 清
SENT_MARKER OperationLog 行（ref≠PA.id，按 ref 清理会漏）——round-2 视觉首跑失败即此自产污染，非产品回归。

---

## 7. Ops 副作用记录

本批次无 prod/staging 数据库 ops。round-1 部署面验证为**只读** ssh 实证（VPS .env 键名在场性 +
compose md5 比对，未读值未写入）。

---

## 8. Harness 说明

本批改动经 Harness 状态机完整流程交付：planning → building（10/10，快车道 + 并行 subagent×2）→
verifying（round-1，fan-out）→ fixing（cf94c5d）→ reverifying（round-2）→ fixing（defb9da）→
reverifying（round-3，本报告）→ done。fix_rounds=2。
签收后 `progress.json` 应置 `status: "done"`，`docs.signoff` 填入本文件路径
`test-reports/M3A-reach-crm-signoff-2026-07-23.md`（由编排者原样落盘，Evaluator 不改状态文件）。

---

## Framework Learnings

本批次验收轨迹产生的提案已由前两轮 Evaluator 记录（round-2 §6 备注 SENT_MARKER 清态坑）。
本轮（round-3）无新增 framework learnings。
