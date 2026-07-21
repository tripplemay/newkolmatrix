# ARCH-M05 验收报告 · 分组 A（F001 架构文档定稿 v1.2）

| 项 | 内容 |
|---|---|
| 批次 | ARCH-M05 |
| 分组 | **A — F001 架构文档定稿 v1.2（kimi 基底 + f5 十条增量 + as-built 校准）** |
| 阶段 | verifying（首轮） |
| Evaluator | Andy/evaluator-subagent（隔离上下文，fresh context） |
| 日期 | 2026-07-21 |
| 被验对象 | `docs/dev/architecture.md`（1907 行，v1.2 定稿）· commit `95a7b3c` |
| 验收依据 | `features.json` F001 acceptance（权威）· `docs/specs/ARCH-M05-spec.md` §2 定稿口径 · §5.2 验收口径 |
| 方法 | 逐 clause 对**仓库实物**（`prisma/schema.prisma` / `src/` / `package.json` / `node_modules` / git history）grep 对账。**未采信任何实现者叙述或 commit message 描述** |

## 0. 总判定

> ## **PARTIAL**
>
> 文档主体质量高：as-built 校准十项**逐条经实物验证全部为真**，f5 十条增量落点齐备且 schema 转录**逐字段零差异**，矛盾裁决纪律执行到位，AI SDK 版本族核查结论与 `node_modules` 实情完全一致。
>
> **未达标项：acceptance 明列的交付物「CLAUDE.md 指向修复」未执行**——F001 commit 未触碰 `CLAUDE.md`，其中的失效指针 `docs/dev/rules.md` 仍在（该文件在 git 全史中从未存在）。
>
> **附带发现：** 定稿文档在批次内被 F003/F004/F005 的后续交付**反向漂移** 3 处（文档写于批次首个 feature，此后未刷新）。文档是后续批次的口径权威，建议在 done 闸门前一并校准。

| # | Clause | Verdict |
|---|---|---|
| C1 | as-built 校准十项逐条 grep 实物对账 | ✅ **PASS**（10/10） |
| C2 | f5 十条增量落点在场且以实物转录 | ✅ **PASS**（10/10 在场；4 条深验 + 4 条抽验） |
| C3 | 矛盾裁决原则（未实装标「演进目标」按 M 路线归位） | ✅ **PASS** |
| C4 | 文件操作四项（f5 归档 / kimi 移除 / audits 入 git / CLAUDE.md 指向） | ❌ **FAIL**（3/4，CLAUDE.md 未修复） |
| C5 | AI SDK 版本族配对核查结论与实情一致 | ✅ **PASS** |
| C6 | 批末文档新鲜度（定稿 vs 批内后续交付） | ⚠️ **PARTIAL**（3 处漂移） |

---

## C1 · as-built 校准十项逐条实物对账 —— ✅ PASS（10/10）

| # | 文档断言 | 实物证据 | 判定 |
|---|---|---|---|
| 1 | `OperationLog` 实为 **7 列 cuid**（非 bigint、无 11 结构化列） | `prisma/schema.prisma:168-179` — `id String @id @default(cuid())` + `tenantId/kind/actor/summary/ref/createdAt` = **恰好 7 列** | ✅ |
| 2 | `PendingAction` 实为 **3 态**，`confirmed` 未被任何代码写入 | `schema.prisma:135-139` enum = `pending/confirmed/executed`；`grep -rn "confirmed" src/` → **0 命中** | ✅ |
| 3 | 闸门 **单步确认即执行**：`/api/gate/{confirm,reject}`，无 execute 端点 | `find src/app/api/gate` → **仅 2 个 route.ts**；`find src/app/api -type d -name execute` → 空 | ✅ |
| 4 | **无 HMAC、无 `GATE_TOKEN_SECRET`**，令牌服务端内部消费，TTL 15min | `grep -rin "hmac" src/` → **0**；`grep -rn GATE_TOKEN_SECRET src/ .env.example` → **0**；`gate.ts:127` `randomBytes(32).toString('hex')`；`gate.ts:25` `TOKEN_TTL_MS = 15*60*1000`；令牌未出现在任何 `Response.json` | ✅ |
| 5 | append-only **触发器未落地** → 记欠账（不得声称 NFR-S4 已满足） | `grep -rin "trigger\|rule\|revoke" prisma/migrations/` → **0 命中**（2 个 migration）；文档 §7.7 以「⚠️ 欠账登记」显式记录并写明「补齐前不得声称已满足」 | ✅ |
| 6 | 「零后端」快照已删除 | 文档 §1.4 末 line 113 记录删除动作及理由；全文无残留「后端尚未落地」断言 | ✅ |
| 7 | 版本表 TS5.9 / React19.2 / Prisma6.19 / ai7 | `package.json` 实测：`typescript 5.9.3` · `react 19.2.7` · `prisma 6.19.3` · `@prisma/client 6.19.3` · `ai 7.0.31` — **与 §1.4 表格逐字相符** | ✅ |
| 8 | 工具字段名为 **`class`** 非 `kind`，且无 `agents` 字段 | `src/lib/agent/tools/types.ts:41` `class: ToolClass`；`grep -n "agents" types.ts` → **0 命中** | ✅ |
| 9 | canvas 落点 `components/copilot/canvas/`，**路由键为工具名**非结果 type | 目录存在，含 `canvas-registry.tsx` + `KolResultCards.tsx`；`canvas-registry.tsx:18-24` `hasCanvasRenderer(toolName)` / `CANVAS_REGISTRY[toolName]` | ✅ |
| 10 | 旧 5 路由为 **redirect 桩非删除** | 5 个桩全部在场且 redirect 目标正确：`dashboards`→today · `dashboards/default`→today · `discovery`→creators · `database`→creators · `outreach`→campaigns | ✅ |

**附加验证 · `common/` 10 件**：§6.4 断言的「既有 10 件」（Badge/Button/ChatBubble/ComingSoon/DefinitionRow/HandoffCard/PageHeader/PanelHeader/SectionLabel/SurfaceCard）**逐个在场**，命名无误。（当前目录共 17 个文件——差额 7 件系本批 F003/F005 新建，见 C6-①。）

**精度 nit（不影响判定）**：§7.7 写「代码中不存在任何 `operationLog.update` / `delete` 调用」。实测 `scripts/test/gate-smoke.ts:107,109` 有 `operationLog.deleteMany`（测试夹具清理）。产品路径（`src/`）确实零 update/delete，断言的实质成立；建议措辞收窄为「`src/` 内不存在」。

---

## C2 · f5 十条增量落点 —— ✅ PASS

十条落点**全部在场**，章节位置与 spec §2.2 规定一致：

| f5 条目 | 规定落点 | 实际 | 状态 |
|---|---|---|---|
| ① 闸门端点契约 + 防重放矩阵 | §9.3 | §9.3 + §9.3.1 攻击面矩阵 | ✅ 深验 |
| ② Prisma schema 权威（实物转录） | §7.2.1 | §7.2.1 | ✅ 深验 |
| ③ API envelope + ApiErrorCode | 新 §API 契约 | §10.1（10.1.1/10.1.2/10.1.3） | ✅ 深验 |
| ④ env 清单 + serverEnv 校验 | §13 | §13.2 | ✅ 深验 |
| ⑤ 测试架构（vitest 注明规划态） | §12.6 | §12.6 + 12.6.3 | ✅ 抽验 |
| ⑥ 技术选型表 + 反选型 | §1.4 | §1.4（含「反选型」列） | ✅ 抽验 |
| ⑦ 文件级目录树 | §4.3 | §4.3（`[已建]/[新建]/(M0.5)` 图例） | ✅ 在场 |
| ⑧ resolveProvenance 三级回退 + 读写不对称 | §7.5 | §7.5.1 + §7.5.2 | ✅ 抽验 |
| ⑨ 生产化 R1–R7 销项标注 | §13 | §13.3（R1–R6 已完成 / R7 未做） | ✅ 在场 |
| ⑩ 五层 prompt 装配 + 承诺-兑现断言 | §8.3/8.6 | §8.3.1 + §8.6.1 | ✅ 在场 |

### 深验 ② · §7.2.1 schema 逐字段机械比对 —— 零差异

以脚本解析 `prisma/schema.prisma` 与文档 §7.2.1 代码块，逐模型比对字段集合：

```
MODEL                  PRISMA  DOC  RESULT
Tenant                      9    9  ✅ IDENTICAL
User                        6    6  ✅ IDENTICAL
Kol                        26   26  ✅ IDENTICAL
Project                     8    8  ✅ IDENTICAL
Game                        8    8  ✅ IDENTICAL
PendingActionStatus         3    3  ✅ IDENTICAL
PendingAction              11   11  ✅ IDENTICAL
OperationLogKind            4    4  ✅ IDENTICAL
OperationLog                7    7  ✅ IDENTICAL
Handoff                    10   10  ✅ IDENTICAL

only-in-prisma models: []   only-in-doc models: []
OVERALL: ALL FIELD SETS MATCH
```

**8 模型 + 2 枚举全覆盖，字段集合完全一致，无遗漏无杜撰。**「以实物转录」要求达成。附带正确记录了 `Kol` 去重为**单键** `@@unique([tenantId, canonicalHandle])`（v1.1 的「双键」及 `platformUserId` 列确不存在）。

### 深验 ① · §9.3 闸门契约与防重放矩阵

文档表格中每条 as-built 断言均落实到代码行：

| 断言 | 实物 |
|---|---|
| 令牌 = `randomBytes(32).toString('hex')` | `gate.ts:127` ✅ |
| 只存 `sha256(token)` | `gate.ts:54` `createHash('sha256').update(token)` ✅ |
| TTL 15 分钟 | `gate.ts:25` ✅ |
| 失败 409 | `confirm/route.ts:23`、`reject/route.ts:19` ✅ |
| reject 置 `expiresAt = epoch(0)` 不改 status | `gate.ts:172` `data: { expiresAt: new Date(0) }` ✅ |
| `buildToolContext()` 不设 `confirmationToken`（模型无法自我放行） | `src/lib/agent/context.ts:41-46` 返回对象**无该字段** ✅ |
| ⚠️ 并发双确认「无原子防护，已知缺口」 | `gate.ts:107 findFirst` → `gate.ts:138 update` 之间无事务锁/条件 UPDATE ✅ **诚实披露属实** |

**特别记录**：§9.3.1 未粉饰实现——主动标注「重复确认为应用层检查、非原子条件 UPDATE」并写明「不得声称『并发安全已保证』」，同时把两步票据 + 7 态 + 原子 UPDATE 归位 §9.3.2「演进目标（未实装，归 M3）」。这是 as-built 纪律的正面样本。

### 深验 ④ · §13.2 env 清单

| 断言 | 实测 |
|---|---|
| 无集中 `serverEnv()`、无 `src/instrumentation.ts` | 两文件均不存在；`grep -rn serverEnv src/` → 0 ✅ |
| 分散懒校验，`gateway.ts` 的 `requireEnv` | `gateway.ts:35` 定义，`:125,126,162,163` 调用 ✅ |
| `GATE_TOKEN_SECRET` 不存在 | 0 命中 ✅ |
| 变量名为 `AIGCGATEWAY_CHAT_MODEL`（非 f5 稿 `AIGC_CHAT_MODEL`） | `gateway.ts:23` ✅ |
| 集中式 fail-fast 代码块标为「演进目标（未实装）」 | §13.2 line 1747 ✅ |

**偏差（轻微）**：文档「当前散落的 `process.env` 读取点」清单列出 `gateway.ts`（4 处）·`db/prisma.ts`·`Fonts.tsx`·`image/Image.tsx`，**遗漏 `src/lib/data/provenance.ts:88`（NODE_ENV）**。该文件由本批 F004 于文档定稿后创建 → 归 C6-③。

### 深验 ③ · §10.1 API 契约

`find src/app/api -name route.ts` → 5 条（agent / gate.confirm / gate.reject / handoffs / health），**与 §10.1.1 路由表 5 行一一对应**，无虚构端点。统一 envelope 与 `ApiErrorCode` 正确标为 §10.1.2「演进目标（未实装）」，并说明当前为裸 JSON + HTTP status。§10.1.1 还记录了与 f5 R5 建议相反的 `/api/health` 决策（不查 DB）并给出理由——属合规的 as-built 优先裁决。

### 抽验 ⑤ · vitest 规划态

`grep -c vitest package.json` → **0**；`node_modules/vitest` 不存在。文档 §1.4 标「**未装**」、§12.6.3 标「演进目标（未实装，规划态）」、§7.7 与 §8.6 的相关欠账均注明「需 vitest」。**一致，无夸大。**

---

## C3 · 矛盾裁决原则 —— ✅ PASS

- 文档开篇设「**阅读约定：as-built vs 演进目标**」强制章（line 17-28），定义两级标注与判定规则，并声明「v1.0/v1.1 中与实物冲突的表述已逐条改写，**不保留双份说法**」。
- 全文「演进目标」**53 处**，其中带 M 路线归位的分布：`归 M3` ×10、`归 M1` ×7、`归 M5` ×3、`归 M2/M3+/M3-M4/M1+/M0.5` 各 1–2；全文 `归 M{n}` 标记共 **44 处**。
- spec §2.4 点名的三项裁决**逐条到位**：两步票据/HMAC → §9.3.2 归 M3 ✅；例程调度器 → §8.10「演进目标（未实装，归 M1）」✅；路线图采 M0–M5 → §14 ✅；TS5 升级销项 → §1.4「ADR-08 的 TS5 升级**已销项**」✅。
- 7 处「演进目标（未实装）」未带 M 编号，均位于上下文已注明归属或整章级声明处（如 §5.2–§5.5 整章声明、§10.1.2/10.1.3 随 M1+ 资源面开放），不构成纪律破口。

---

## C4 · 文件操作四项 —— ❌ FAIL（3/4）

| # | 要求 | 实测 | 判定 |
|---|---|---|---|
| 1 | f5 归档至 `docs/archive/` | `docs/archive/architecture_f5-v1.0-draft.md`（253,894 B）在场且 `git ls-files` 已跟踪 | ✅ |
| 2 | `architecture_kimi.md` 已移除 | `find . -name "architecture_kimi*"`（排除 node_modules）→ **0 命中**；git 全史无该文件（原为工作区未提交件，已按 spec「由本 feature 正式处理」消化为 v1.2 基底） | ✅ |
| 3 | audits 设计文档入 git | `git ls-files docs/audits/` → 含 `KOLMatrix-integrated-architecture-design-2026-07-17.md`（F001 commit 新增 656 行）+ 另 2 份 audits | ✅ |
| 4 | **CLAUDE.md 指向修复** | **未执行** | ❌ |

### FAIL 详情 · CLAUDE.md 指向未修复

**证据链：**

1. **F001 commit 未触碰 CLAUDE.md** — `git show --stat 95a7b3c` 变更文件仅 3 个：
   ```
   docs/archive/architecture_f5-v1.0-draft.md
   docs/audits/KOLMatrix-integrated-architecture-design-2026-07-17.md
   docs/dev/architecture.md
   ```
   `git show 95a7b3c -- CLAUDE.md` → 空 diff。

2. **CLAUDE.md 仍存在失效指针** — 逐条解析 CLAUDE.md 中的路径引用：
   ```
   ✅ docs/dev/architecture.md          ✅ docs/dev/agent-architecture.md
   ✅ .auto-memory/MEMORY.md            ✅ .claude/agents/evaluator.md
   ✅ framework/patterns/README.md      ✅ orchestration-patterns.md
   ✅ framework/harness/autonomous-mode.md   ✅ tailwind.config.js
   ❌ docs/dev/rules.md   ← MISSING
   ```
   CLAUDE.md:74 —「**开发规则：** → `docs/dev/rules.md`（Migration 规则、**[框架]**开发规则、设计决策、CI/CD）」

3. **该文件在 git 全史中从未存在** — `git log --all --diff-filter=AD -- docs/dev/rules.md` → 空。`ls docs/dev/` 实有：`architecture.md` · `agent-architecture.md` · `deploy.md` · `template-inventory.md` · `template-port-guide.md`。

4. **系 bootstrap 模板残留** — `git log -S"docs/dev/rules.md" -- CLAUDE.md` 定位到引入 commit `98fbea7 chore: bootstrap Triad Workflow v1.0 骨架`（2026-07-13）。同行内 **`[框架]` 占位符未被替换**，佐证该段自脚手架落地起从未维护。CLAUDE.md 最后一次修改为 `26ee34b`（AGENT-FOUNDATION-F010），早于本批。

**影响**：CLAUDE.md 是每次会话必读的项目指令入口，其「Reference Documents（按需阅读）」小节指向不存在的文件，会导致后续实例按图索骥落空。修复成本极低（删除该行，或改指 `docs/dev/deploy.md` / `template-port-guide.md` 等实有文档），但属 acceptance 明列交付物，**不予豁免**。

---

## C5 · AI SDK 版本族配对核查 —— ✅ PASS

acceptance 要求「核实 AI SDK core/provider 版本族配对并记录结论」。文档 §1.4「附注 · AI SDK 版本族配对核查」在场。逐项复核其表格与 `node_modules` 实读：

| 文档断言 | `node_modules` 实测 | 判定 |
|---|---|---|
| `ai@7.0.31` deps `@ai-sdk/provider@4.0.3` + `provider-utils@5.0.11`；peer `zod ^3.25.76 \|\| ^4.1.8` | **完全一致** | ✅ |
| `@ai-sdk/openai@4.0.16` deps 与 `ai` **完全相同**的 provider/provider-utils | 实测 `{provider: 4.0.3, provider-utils: 5.0.11}` — 一致 | ✅ |
| `@ai-sdk/react@4.0.34` deps 含 `ai@7.0.31`（精确等于根装版本） | 实测 deps 含 `ai: 7.0.31` | ✅ |
| `@ai-sdk/react` peer `react ^18 \|\| ~19.0.1 \|\| ~19.1.2 \|\| ^19.2.1`，装机 react 19.2.7 满足 | 逐字一致 | ✅ |
| `zod@4.4.3` 满足三处 peer 的 `^4.1.8` | 一致 | ✅ |
| `npm ls` 中 provider / provider-utils / zod **全部 deduped，各仅一份实例，无 UNMET PEER** | `npm ls` 输出：所有相关节点标 `deduped`，根级 `zod@4.4.3` 单例，**无告警** | ✅ |

**结论「`ai@7` + `@ai-sdk/*@4/5` 为 AI SDK v5+ 正常版本策略、配对无冲突」经独立复算成立**，且给出了可执行的升级纪律（升 `ai` 时须同步核对 provider 契约版本）。此项为高质量交付。

---

## C6 · 批末文档新鲜度 —— ⚠️ PARTIAL（3 处批内反向漂移）

`git log -- docs/dev/architecture.md` 显示定稿后**再无提交**（仅 `bd2063f` v1.0 与 `95a7b3c` v1.2）。而 F001 是本批**首个** feature，其后 F003/F004/F005 落地了新代码，使定稿文档在若干处**落后于实物**。文档自身 §7.2.1 立有铁律：「本节与实物冲突时，以实物为准并**即刻修订本文**」——故此类漂移应在 done 闸门前收敛。

| # | 文档表述 | 当前实物 | 引入者 | 严重度 |
|---|---|---|---|---|
| ① | §6.4「既有 `common/` **10 件**（as-built，**恰好 10 个文件**）」 | `src/components/common/` 现有 **17 个 .tsx**（新增 AgentSquad / DataTable / GateConfirm / HalfGauge / ProvenanceTag / Toast / UploadZone） | F003 `2284333`、F005 `c3cfe2d` | 低（文档已把这 7 件列在「新建产品件」表中，逻辑自洽；仅「恰好 10 个文件」的绝对措辞失真） |
| ② | §7.5.1 代码块头注「`src/lib/data/provenance.ts`（**演进目标，未实装**）」；§7.5 头「`resolveProvenance` 与 `ProvenanceTag` = 演进目标（未实装，归 **M0.5 UI** / M2 真数据）」 | **已实装**：`src/lib/data/provenance.ts:144` `export function resolveProvenance`（三级回退 field→row→fallback 与文档设计一致）；`ProvenanceTag.tsx` 已含 `variant: 'badge' \| 'inline'` 双形态 | F004 `7c64f38` | **中**——口径权威文档把已实装模块标为未实装，后续 Planner/Generator 可能误判需重建。（缓解：文档已正确将其归位到 `M0.5`＝本批，属"预期本批交付"的前瞻标注，只是未回写） |
| ③ | §13.2「当前散落的 `process.env` 读取点」清单（gateway.ts ×4 · db/prisma.ts · Fonts.tsx · image/Image.tsx） | 漏 `src/lib/data/provenance.ts:88`（`NODE_ENV`） | F004 `7c64f38` | 低（引入 `env.ts` 时的收口清单少一项） |

> **定性**：三处均非 F001 交付时的错误——F001 commit 时点的表述均为真。属**批次内串行交付导致的文档时效衰减**。但 F001 的产物是「后续批次的口径权威」，验收基准应为 **done 闸门时刻的真值**，故记 PARTIAL 并建议随修复轮一并回写。

---

## 修复建议（供 Generator，按优先级）

| P | 项 | 建议动作 | 对应 |
|---|---|---|---|
| **P0** | CLAUDE.md 失效指针 | 删除 `docs/dev/rules.md` 引用行，或改指实有文档（`deploy.md` / `template-port-guide.md`）；顺手替换同行未展开的 `[框架]` 占位符 | C4 |
| **P1** | §7.5 / §7.5.1 溯源实现状态 | 去掉「演进目标，未实装」标注，改为 as-built 并标注 F004 落点；如设计与实装有出入，以 `provenance.ts` 实物为准回写 | C6-② |
| **P2** | §6.4 组件计数 | 「恰好 10 个文件」→ 注明「F001 时点 10 件；本批 F003/F005 新增 7 件，现 17 件」，或直接刷为当前清单 | C6-① |
| **P2** | §13.2 process.env 清单 | 补 `src/lib/data/provenance.ts`（NODE_ENV） | C6-③ |
| **P3** | §7.7 措辞精度 | 「代码中不存在任何 operationLog.update/delete」→ 收窄为「`src/` 产品路径内不存在」（`scripts/test/gate-smoke.ts` 有夹具清理用 `deleteMany`） | C1 nit |

---

## 附：本次验收执行的实物核查命令（可复现）

```bash
# C1
grep -n -A 22 "model OperationLog" prisma/schema.prisma
grep -rn "confirmed" src/                          # → 0
find src/app/api/gate -type f                      # → confirm/reject 各 1
grep -rin "hmac" src/ | wc -l                      # → 0
grep -rin "trigger\|rule\|revoke" prisma/migrations/ | wc -l   # → 0
grep -n "class: ToolClass" src/lib/agent/tools/types.ts
grep -n "TOKEN_TTL_MS\|randomBytes" src/lib/agent/gate/gate.ts

# C2（schema 机械比对脚本见正文结果表）
find src/app/api -name route.ts | sort
grep -c vitest package.json                        # → 0

# C4
git show --stat --format="" 95a7b3c
git log --all --diff-filter=AD -- docs/dev/rules.md   # → 空
git log -S"docs/dev/rules.md" --oneline -- CLAUDE.md  # → 98fbea7 bootstrap

# C5
npm ls @ai-sdk/provider @ai-sdk/provider-utils zod     # → 全 deduped，无 UNMET

# C6
git log --oneline -- docs/dev/architecture.md          # → 定稿后无提交
git log --diff-filter=A -- src/lib/data/provenance.ts  # → 7c64f38 (F004)
```

---

**Evaluator 声明**：本报告在隔离上下文中产出，全部结论基于仓库实物 grep / 脚本比对 / git history，未采信编排者或实现者的任何质量描述。本次验收**未修改任何产品代码或文档**，仅新增本报告文件。分组 B/C/D/E 的 feature 不在本报告评分范围内。
