# M2-A-MATCH 首轮验收记录 — F001（schema：MatchPlan + PlanKol + MatchCandidate 三表 + zod 契约）

- **署名：** Andy/evaluator-subagent
- **日期：** 2026-07-22
- **阶段：** verifying（首轮，fix_rounds=0）
- **结论：PASS**
- **实物范围：** commit `36db288`（prisma/schema.prisma :251-343 + prisma/migrations/20260722161835_m2a_match_three_tables/migration.sql + src/lib/data/schemas/match.ts + tests/unit/match-schemas.test.ts）
- **验证方式：** 代码逐字段核对 + 迁移 SQL 通读 + dev DB 实测（information_schema / pg_enum / pg_indexes / pg_class + 物理约束插入实测）+ 工具链三绿 + Evaluator 独立边界探测。不依据 commit message 或任何叙述。

## L1 环境前置（testing-env-patterns 对照）

- `npx prisma generate` 先于 tsc 已执行（§3）；本机 Node v25.7.0，仓库无 `.nvmrc`（§4 不适用——本批无 jsdom/localStorage 测试，全套单测本机绿）；未起任何 dev/standalone server（端口纪律，:3000 留 READINESS）。

## 逐条 acceptance 判定

| # | acceptance 项 | 判定 | 证据 |
|---|---|---|---|
| 1 | expand 迁移新增三模型，均带 tenantId+publicId | PASS | migration.sql 纯 expand：2 CREATE TYPE + 3 CREATE TABLE + 11 CREATE INDEX + 5 ADD FK，**零 DROP/ALTER 破坏**；三表各含 tenantId+publicId（publicId UNIQUE 索引在库：`MatchPlan_publicId_key` / `PlanKol_publicId_key` / `MatchCandidate_publicId_key`）；`_prisma_migrations` 实测 `20260722161835_m2a_match_three_tables` applied=true |
| 2 | MatchPlan 字段（projectId 真 FK/name/metrics Json/rationale/recommended @default(false)/status enum draft\|approved\|superseded @default(draft)/approvedBy?/approvedAt?） | PASS | schema.prisma :273-295；DB 实测 13 列全在：`recommended def=false`、`status USER-DEFINED def='draft'::"MatchPlanStatus"`、approvedBy/approvedAt nullable；FK `MatchPlan_projectId_fkey → Project(id) ON DELETE CASCADE`（migration.sql :92）；pg_enum 实测 MatchPlanStatus = draft/approved/superseded 三值；插入实测默认值 `status=draft recommended=false approvedBy=null`；不存在 projectId 插入 → **P2003 FK violation 实测触发** |
| 3 | PlanKol（planId FK Cascade/kolId FK/matchScore Float/reasons String[] 非空即可解释依据——应用层 zod 校验空则非法） | PASS | schema.prisma :299-317；DB 8 列在库（matchScore double precision NOT NULL / reasons TEXT[]）；`PlanKol_planId_fkey → MatchPlan(id) ON DELETE CASCADE` + `PlanKol_kolId_fkey → Kol(id)`（migration.sql :95-98）；**Cascade 物理实测**：删 plan 后 PlanKol orphans=0；写侧非空由 `assertPlanKolReasons`（match.ts :66-70，`z.array(z.string().min(1)).min(1)`）把关，空数组/空串条目抛错（单测 :114-121 绿） |
| 4 | MatchCandidate（projectId FK/kolId FK/verdict enum pending\|kept\|dropped @default(pending)/doubts String[]/preJudge 三态串/matchScore Float?/scorePending Boolean @default(false)，@@unique([projectId,kolId]) 幂等键） | PASS | schema.prisma :321-343；DB 12 列全在（verdict def='pending' / doubts def=ARRAY[]::text[] / matchScore nullable / scorePending def=false）；pg_enum 实测 CandidateVerdict = pending/kept/dropped；唯一索引在库 `MatchCandidate_projectId_kolId_key [UNIQUE] (projectId,kolId)`；插入实测默认值 `verdict=pending doubts=[] scorePending=false matchScore=null`；同 (projectId,kolId) 二次插入 → **P2002 unique violation 实测触发** |
| 5 | schemas/match.ts：metrics/doubts 读侧宽松降级 null 不抛错（D2）+ PlanKol.reasons 写侧非空 | PASS | match.ts：`parsePlanMetrics`/`parseDoubts` 用 safeParse → 失败返 null 不抛（:40-43, :54-57）；`assertPlanKolReasons` 用 parse → 违规抛错（:68-70）；枚举 schema 与 Prisma enum 逐字一致（单测 :19-36 断言 + 本人比读）。Evaluator 独立探测（scripts/test/m2a-f001-edge-probe.ts）：未知额外键剥离通过（jsonb 演进容忍）/ people=3.5、-1 → null / reasons 含非串条目抛错 / doubts 嵌套脏 → null / 枚举大小写敏感（'Draft' 拒收）——6/6 符合预期 |
| 6 | 单测覆盖降级与拒收 | PASS | `npx vitest run tests/unit/match-schemas.test.ts` → **14/14 passed**（枚举一致 3 + 脏 metrics 降级 5 + doubts 降级 2 + reasons 拒收 3 + 合法路径 1） |
| 7 | 单租户不建 RLS（D4 先例） | PASS | pg_class 实测：三表 `relrowsecurity=false`；migration.sql 通读零 POLICY/ROW LEVEL SECURITY 语句 |
| 8 | D20 标注（status/verdict 流转变异测试义务落 F003/F004） | PASS | schema.prisma :253-255（MatchPlanStatus 注释「D20：…流转逻辑落 F003/F004，须配变异测试」）+ :262-263（CandidateVerdict「P4，F003 变异测试"）+ match.ts :11 同注 |
| 9 | schema+migration+引用代码同 commit | PASS | `git show 36db288 --stat`：schema.prisma + migration.sql + src/lib/data/schemas/match.ts + tests/unit/match-schemas.test.ts 同一 commit 落地 |
| 10 | lint + tsc + test:unit 绿 | PASS | `npm run lint` → ✔ No ESLint warnings or errors；`npx tsc --noEmit` → exit 0；`npm run test:unit` → **28 files / 307 tests 全绿**（1.68s） |

## D-H 清态确认（数据纪律）

物理约束实测采用「测前计数 → 插入 → 断言 → 删除 → 测后计数」闭环：

```
pre-test:  {"MatchPlan":0,"PlanKol":0,"MatchCandidate":0}
post-test: {"MatchPlan":0,"PlanKol":0,"MatchCandidate":0}
```

Match 三表验收后保持零行清态（PendingAction/OperationLog 本 feature 验收未触碰）。

## L2 说明

F001 为纯 schema/契约层，acceptance 无网关依赖项——本 feature 验收零真网关调用（L2 用量 = 0）。

## 验收产物

- `scripts/test/m2a-f001-db-verify.ts` — DB 实物验证脚本（三表/枚举/索引/RLS/物理约束/D-H 闭环，可重复执行）
- `scripts/test/m2a-f001-edge-probe.ts` — zod 契约独立边界探测（单测之外 6 项）
- 本记录

## 结论

F001 十项 acceptance 全 PASS。schema 与迁移、zod 契约、单测、工具链、DB 物理行为完全对齐 spec §2 F001 与 architecture §5.2 口径，无偏差、无 soft-watch。
