# M3-B-DELIVERY F001 验收报告 — 迁移：Deal/Deliverable/GameKey/Payout 四表 + 五枚举

- **批次：** M3-B-DELIVERY（progress.json `status=verifying`，`fix_rounds=0`）
- **Feature：** F001（`executor: generator`，priority high，Generator 报 completed）
- **验收人：** Andy / evaluator-subagent（隔离上下文，自行从磁盘取证；未接受任何实现过程叙述）
- **日期：** 2026-07-23
- **被测 SHA：** `13eebb0a2d5422ba689b435980d85b1fd3cef6c6`（工作树干净，`git status --short` 空）
- **F001 实现 commit：** `aa2a458`（`feat(M3-B-DELIVERY-F001)`）
- **判定：** **PASS**

---

## 0. 环境前置（testing-env-patterns L1 检查）

| 项 | 实测 |
|---|---|
| DB 容器 | `newkolmatrix-dev-db  Up 2 days (healthy)  127.0.0.1:5434->5432/tcp` |
| `prisma generate` 先于 tsc | 已执行（§15 要求，本批含 schema 改动） |
| Node | `v25.7.0`；仓库无 `.nvmrc`（无版本约束冲突） |
| L2 | 本 feature **无 L2 项**（纯 schema/迁移，零外部服务、零资金动作）。批次 P1 硬约束（禁真实资金/发 key 外呼）在 F001 范围内**结构性不适用**：本 feature 未引入任何外呼代码路径 |
| 浏览器实测 | 本 feature 不涉及 UI，**无需**启动 standalone 服务（未占用 :3000） |
| 取证隔离 | 破坏性/写入类实测全部在**一次性 scratch database `m3b_f001_verify`** 中进行，验收结束已 `DROP DATABASE`（复核 `SELECT datname ... LIKE 'm3b%'` → 0 rows）；dev DB `kolmatrix` **只读**（仅 `\d` / `SELECT`）；产品代码零改动 |

---

## 1. Acceptance 逐条对照

acceptance 原文拆为 9 条判据（features.json F001）：

| # | 判据 | 结果 | 实测证据 |
|---|---|---|---|
| A1 | migration 落 `prisma/migrations` 且 `db:migrate` 干净 | **PASS** | §2.1 |
| A2 | 四表字段与 spec §4 逐项一致 | **PASS** | §2.2 |
| A3 | `@@unique` 在场：`Deal(projectId,kolId)` / `Deliverable(dealId,kind)` | **PASS** | §2.3（含**行为级**重复插入被拒实证） |
| A4 | 五枚举全量（7/5/4/2/3 值，值名逐一） | **PASS** | §2.4 |
| A5 | `Payout.amount` `Decimal(14,2)` | **PASS** | §2.5（含 scale 舍入 + precision 溢出实证） |
| A6 | `gateLogId` 软引用列在场（GameKey / Payout） | **PASS** | §2.6 |
| A7 | migration 含单向回滚说明 | **PASS** | §2.7（说明**可执行**，已在 scratch DB 真跑一遍） |
| A8 | RLS 例外理由在 spec §4 记录 | **PASS** | §2.8（含 DB 侧 RLS 口径一致性实测） |
| A9 | tsc + 既有 522 测试不破 | **PASS** | §2.9 |

补充核验（description 声明的 expand-only 口径）：§2.10 —— **PASS**。

---

## 2. 实测证据

### 2.1 [A1] 迁移落盘 + db:migrate 干净

迁移目录在场（第 8 个）：

```
prisma/migrations/
  20260718000000_init
  ...
  20260723115700_m3a_reach_four_tables_gate7_contact_email
  20260723235106_m3b_delivery_four_tables      ← 本批
  migration_lock.toml
```

**dev DB 上 `npm run db:migrate`（= `prisma migrate deploy`）：**

```
8 migrations found in prisma/migrations
No pending migrations to apply.
```

**`npx prisma migrate status`：** `Database schema is up to date!`（无 "modified after applied" 校验和告警）

**迁移记录表状态（无失败/回滚残留）：**

```
                      migration_name                      | finished | rolled_back_at | applied_steps_count
----------------------------------------------------------+----------+----------------+---------------------
 20260723235106_m3b_delivery_four_tables                  | t        |                |  1
 20260723115700_m3a_reach_four_tables_gate7_contact_email | t        |                |  1
```

**零库全新部署实测**（比"dev 库已 up to date"更强的证据——排除"手工建表后补迁移"的假绿）：新建空库 `m3b_f001_verify` → `prisma migrate deploy`：

```
Applying migration `20260723235106_m3b_delivery_four_tables`
...
All migrations have been successfully applied.
```

**drift 双向核验：** `prisma migrate diff --from-schema-datamodel --to-schema-datasource --exit-code`
- dev DB：`No difference detected.` EXIT=0
- 全新库：`No difference detected.` EXIT=0

→ schema.prisma 与迁移产物**完全同构**，不存在"schema 写了但迁移没生成"的缝。

### 2.2 [A2] 四表字段与 spec §4 逐项一致

spec §4（`docs/specs/M3-B-DELIVERY-spec.md:45-48`）逐字段对 `psql \d` 实测：

**Deal**（spec:45）

| spec 字段 | DB 实测 | 一致 |
|---|---|---|
| `id cuid` | `id text not null` PK `Deal_pkey` | ✓ |
| `tenantId` | `tenantId text not null` | ✓ |
| `projectId` | `text not null` + FK→`Project(id)` ON DELETE CASCADE | ✓ |
| `kolId` | `text not null` + FK→`Kol(id)` ON DELETE CASCADE | ✓ |
| `quoteId?`（软引用） | `quoteId text` nullable，**无 FK 约束** | ✓（§2.6 行为实证） |
| `termsJson` | `termsJson jsonb not null` | ✓ |
| `contractRef?` / `escrowRef?` | 均 `text` nullable | ✓ |
| `status DealStatus` | `"DealStatus" not null default 'negotiating'` | ✓ |
| timestamps | `createdAt`(default CURRENT_TIMESTAMP) + `updatedAt` | ✓ |
| `@@unique([projectId,kolId])` | `Deal_projectId_kolId_key` UNIQUE btree | ✓ |

**Deliverable**（spec:46）：`id / tenantId / dealId`(FK cascade) `/ kind DeliverableKind / status DeliverableStatus default pending / required boolean not null default true / evidenceRef? / verifiedBy? / note? / createdAt+updatedAt / @@unique(dealId,kind)` —— **11 列逐项命中，无缺无余**。

**GameKey**（spec:47）：`id / tenantId / dealId`(FK cascade) `/ keyRef text not null / status GameKeyStatus default reserved / distributedAt? / gateLogId? / createdAt` —— **8 列逐项命中**；spec 只列 `createdAt`（无 updatedAt），实装亦只有 `createdAt` ✓。

**Payout**（spec:48）：`id / tenantId / dealId`(FK cascade) `/ payee text not null / amount numeric(14,2) / currency / basis / status PayoutStatus default prepared / gateLogId? / releasedAt? / createdAt+updatedAt` —— **12 列逐项命中**。

**无超规字段**：四表实测列集合与 spec §4 列举**完全相等**（既无缺列，也无 spec 外新增列）。附加的 `@@index([tenantId])` / `@@index([dealId])` / `@@index([kolId])` 属非语义性索引，沿既有表同款检索维度，不构成 spec 偏离。

`keyRef` 的"存引用不存明文"约束在 schema 注释明示（`schema.prisma:588` "明文 key 值不得入库"）——该项的行为断言归属 F006/F008，F001 只需列在场，已满足。

### 2.3 [A3] 两个 @@unique —— 行为级实证（非仅 DDL 目视）

在 scratch DB 用真实 fixture（Tenant→Project→Kol→Deal）跑约束探针：

```
=== TEST1: duplicate (projectId,kolId) must FAIL ===
ERROR:  duplicate key value violates unique constraint "Deal_projectId_kolId_key"
DETAIL:  Key ("projectId", "kolId")=(p1, k1) already exists.
=== TEST2: same project different kol must SUCCEED ===
INSERT 0 1
=== TEST3: Deliverable five kinds must SUCCEED ===
INSERT 0 5
=== TEST4: duplicate (dealId,kind) must FAIL ===
ERROR:  duplicate key value violates unique constraint "Deliverable_dealId_kind_key"
DETAIL:  Key ("dealId", kind)=(d1, content) already exists.
=== TEST5: same kind other deal must SUCCEED ===
INSERT 0 1
```

→ 两约束**双向成立**（该拒的拒、该放的放），非仅索引存在。这直接支撑 F003 的"upsert 幂等"与 P3 的"五条件每类一行"。

同批附带核验（为下游 feature 提供地基证据，不计入 F001 判定）：

```
=== TEST10: 默认值 ===  Deal.status=negotiating · Deliverable(5 行)=pending/required=t · GameKey=reserved/gateLogId 空 · Payout=prepared
=== TEST12: cascade delete Deal -> children ===
DELETE 1 → deliverables_left=0 | gamekeys_left=0 | payouts_left=0
```

### 2.4 [A4] 五枚举全量

```
      typname      |                               values                               | n
-------------------+--------------------------------------------------------------------+---
 DealStatus        | negotiating,signed,escrowed,delivering,completed,blocked,defaulted | 7
 DeliverableKind   | content,key,contract,escrow,ad_disclosure                          | 5
 DeliverableStatus | pending,met,missing,na                                             | 4
 GameKeyStatus     | reserved,distributed                                               | 2
 PayoutStatus      | prepared,released,blocked                                          | 3
```

值名与顺序与 acceptance/spec §4 **逐字一致**；四态未被压成三态（`na` 在场，P3/V7 §2.3 硬要求的数据前提成立）。

枚举**排他性**实证（非法值真被 DB 拒）：

```
=== TEST8: bad enum value must FAIL ===
ERROR:  invalid input value for enum "PayoutStatus": "paid"
```

### 2.5 [A5] Payout.amount Decimal(14,2)

DDL：`amount | numeric(14,2) | not null`（`\d "Payout"`）。行为实证两条：

```
=== scale 舍入到 2 位 ===
INSERT ... amount = 999999999.349  →  存储值 999999999.35
=== TEST7: 13 位整数部分必须 FAIL（precision 14 / scale 2）===
ERROR:  numeric field overflow
DETAIL:  A field with precision 14, scale 2 must round to an absolute value less than 10^12.
```

→ 精度与标度**真生效**，不是"声明了 Decimal 但落成 float/text"的假实装。

### 2.6 [A6] gateLogId 软引用列在场

- `GameKey.gateLogId text` nullable，`\d "GameKey"` 的 Foreign-key constraints 段**仅** `GameKey_dealId_fkey` → gateLogId **无 FK**（软引用成立）
- `Payout.gateLogId text` nullable，同理仅 `Payout_dealId_fkey`
- schema 注释标注 `→ PendingAction.id（软引用；released/distributed 必非空）`——"必非空"是应用层不变量，归属 F005/F006 断言，F001 只需列在场且可空 ✓

软引用语义行为实证（`Deal.quoteId` 同款，代表本批软引用口径）：

```
=== TEST11: quoteId soft-ref accepts arbitrary id (no FK) ===
UPDATE 1 → Deal.quoteId = 'quote-not-exists'
```

### 2.7 [A7] 单向回滚说明 —— 存在且可执行

migration.sql 头部 14 行注释含：expand-only 声明、RLS 例外指针、**单向回滚顺序**（"先子表后父表"）、以及"本迁移无 `ADD VALUE` 类不可逆残留（对比 M3-A 的 PendingActionStatus）"的对照说明。

不止于"有说明"——把注释里的语句**原样在 scratch DB 执行**：

```
=== ROLLBACK per migration header comment (order as documented) ===
DROP TABLE ×4 → OK        (Payout, GameKey, Deliverable, Deal)
DROP TYPE  ×5 → OK        (PayoutStatus, GameKeyStatus, DeliverableStatus, DeliverableKind, DealStatus)
=== post-rollback ===
base_tables = 18          （17 既有产品表 + _prisma_migrations）
m3b_enums_left = 0
=== sanity: 既有对象完好 ===
Quote 列数 = 11 · PendingActionStatus 枚举值 = 7
```

→ 文档化的回滚序列**真可跑通**（依赖顺序正确、无残留类型），且回滚后既有 17 表与 M3-A 枚举完好无损。

### 2.8 [A8] RLS 例外理由已记录 + DB 侧口径一致

- spec §4 明文（`M3-B-DELIVERY-spec.md:52`）：「本项目单租户 dev **不建 RLS policy**（AGENT-FOUNDATION D4 既定…全部既有 17 表同口径），M5 真实认证时统一补。本批四表沿同一口径，spec 此处显式记录该例外理由。」——database-patterns §8 要求的**显式登记**成立
- 代码侧二次登记：`prisma/schema.prisma:477-478` 同口径注释
- **DB 侧口径一致性实测**（防"spec 写了例外、实际却给新表单独开了 RLS/或既有表有而新表没有"的不一致）：

```
SELECT relname, relrowsecurity ... WHERE relrowsecurity  →  (0 rows)
SELECT count(*) FROM pg_policies WHERE schemaname='public'  →  0
```

→ 全库 **0 张表启用 RLS、0 条 policy**，新四表与既有 17 表口径**确实一致**，例外是全局既定而非本批新开的特例。

### 2.9 [A9] tsc + 既有 522 测试不破

```
$ npx prisma generate    → 成功（§0 前置）
$ npx tsc --noEmit       → 无输出，TSC_EXIT=0
```

```
$ npx vitest run
 Test Files  64 passed (64)
      Tests  775 passed (775)
   Duration  25.63s
```

"既有 522"基线溯源：M3A signoff（`docs/test-reports/M3A-reach-crm-signoff-2026-07-23.md:108`）记 **52 文件 522/522**。本批后为 **64 文件 775/775 全绿**，且：

```
$ git diff --diff-filter=D --name-only 09fbb1a..HEAD -- tests/ scripts/   → 空（批次内零测试文件删除）
$ git ls-tree -r --name-only 09fbb1a tests/ | grep -c 'test.ts\|spec.ts'  → 56
$ git ls-tree -r --name-only HEAD     tests/ | grep -c 'test.ts\|spec.ts'  → 68
```

→ 既有测试**一条未删**，全量绿的 775 是 522 的**超集**，"既有测试不破"成立。
F001 自身 commit `aa2a458` 未触碰任何测试文件（改动文件仅 `migration.sql` / `schema.prisma` / `features.json` / `progress.json`），不存在"改测试迁就实现"的可能。

### 2.10 [补充] expand-only 口径核验（description 声明）

```
$ git show aa2a458 --numstat -- prisma/schema.prisma prisma/migrations/
139  0  prisma/migrations/20260723235106_m3b_delivery_four_tables/migration.sql
153  0  prisma/schema.prisma        ← 0 删除行
```

migration.sql 内 `ALTER TABLE` 语句仅 5 条，**全部作用于本批新表**（Deal×2 / Deliverable / GameKey / Payout 的 ADD CONSTRAINT FK），既有表零 ALTER、既有枚举零 ADD VALUE：

```
ALTER TABLE "Deal"        ADD CONSTRAINT "Deal_projectId_fkey" ...
ALTER TABLE "Deal"        ADD CONSTRAINT "Deal_kolId_fkey" ...
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_dealId_fkey" ...
ALTER TABLE "GameKey"     ADD CONSTRAINT "GameKey_dealId_fkey" ...
ALTER TABLE "Payout"      ADD CONSTRAINT "Payout_dealId_fkey" ...
```

schema.prisma 侧对既有 model 的改动仅 2 行**新增反向关系字段**（`Project.deals Deal[]` / `Kol.deals Deal[]`，Prisma 关系声明必需，**不产生任何 DDL**）——与 migration.sql 零既有表变更相互印证。回滚到上一个镜像 tag 时旧代码不读新表、不认新枚举，D12 前向兼容成立。

---

## 3. 未执行项

| 项 | 状态 |
|---|---|
| L2（真实外部服务 / 计费 / 生产写入） | **[L2] 未执行，待授权** —— 但 F001 acceptance **不含任何 L2 判据**（纯本地 schema/迁移），此项不构成覆盖缺口 |
| 生产库迁移实测 | 未执行（需部署授权）。风险评估：本迁移为纯 CREATE，无数据回填、无既有表改动，对生产数据零依赖 |
| 浏览器 UI 实测 | 不适用（本 feature 无 UI 面） |

## 4. 零真实资金动作声明（批次 P1）

F001 范围内**未新增任何外呼代码路径**（交付物 = 1 个 migration + 1 段 schema）。验收过程中的全部写操作发生在一次性 scratch database `m3b_f001_verify`（已 DROP），dev 库 `kolmatrix` 全程只读。**本 feature 验收未发生任何真实付款 / key 发放 / 外部调用。**

## 5. Soft-watch / 备注（不影响 F001 判定）

- **S1（信息项）：** `GameKey.gateLogId` / `Payout.gateLogId` 的"distributed/released 必非空"是**应用层不变量**，DB 层无 CHECK 约束兜底。这与 spec §4 的字段定义一致（spec 亦只写"必非空"于括注），且下游 F005/F006 承担断言责任；若 M5 接真 partner 后要求更强保证，可考虑加 `CHECK (status <> 'released' OR "gateLogId" IS NOT NULL)`。**本批不作为缺陷计**。
- **S2（信息项）：** 四表 `tenantId` 为裸列无 FK→Tenant（与既有 `Project.tenantId`/`Kol.tenantId` 有 FK 的做法不同）。单租户 D4 口径下不影响功能；跨租户隔离整体留 M5 与 RLS 一并处理，spec §4 已把 RLS 例外登记在案。
- 本次验收**未修改任何产品代码 / 文档基线**，仅新增本报告一份；`git status --short` 在验收开始与结束时均为空（scratch DB 不入仓）。

---

## 6. 结论

**F001 = PASS。** 9 条 acceptance 判据全部有实测证据支撑，且关键项均做了**行为级**验证而非 DDL 目视：全新零库迁移可跑通、双向 drift 为零、两个 @@unique 双向成立、`numeric(14,2)` 精度与标度真生效、枚举拒非法值、文档化回滚序列真可执行且回滚后既有对象完好、全库 RLS 口径一致（0 policy）、tsc 零错、64 文件 775 测试全绿且既有测试一条未删。
