# M1-D-KNOWLEDGE F001 首轮验收证据（round 1）

- **Feature:** F001 schema：Material + GameKnowledge 两表 + zod 契约
- **判定：PASS**
- **Evaluator:** Andy/evaluator-subagent（隔离 fresh context）
- **日期:** 2026-07-22 · **HEAD:** ecde6cd · **Feature commit:** 27aeec1
- **L2 用量:** 0（F001 无网关依赖，未打真网关；zod/DB 层全部本地实证）

## 1. 测了什么 / 怎么测

| # | 验证面 | 手段 |
|---|---|---|
| 1 | 两表在库（spec §5 \d 实证） | `docker exec newkolmatrix-dev-db psql -U kol -d kolmatrix -c '\d "Material"' -c '\d "GameKnowledge"'` |
| 2 | 三枚举 DB 端值域逐字一致 | `pg_enum` 联查（13 值） |
| 3 | migration 纯 expand + 已应用 | 读 `prisma/migrations/20260722120709_m1d_material_gameknowledge/migration.sql`（仅 CREATE TYPE/TABLE/INDEX + ADD FK，无 ALTER/DROP 既有对象）+ `_prisma_migrations` applied=t |
| 4 | DB 默认值活性 | 事务内 INSERT 探针 + ROLLBACK（零残留） |
| 5 | zod 契约 + 单测 | 读 `src/lib/data/schemas/knowledge.ts` / `tests/unit/knowledge-schemas.test.ts`；`npx vitest run tests/unit/knowledge-schemas.test.ts --reporter=verbose` |
| 6 | Evaluator 独立对抗探针 | 自写 9 案例脏形状探针（scratchpad，非 Generator 用例）：NaN percent / 字符串 percent 不 coerce / 深层嵌套垃圾 / max(20) 边界 21↔20 / confidence:null nullish / 未知键 strip / 溯源非数组抛错 / slices=[] 拒 |
| 7 | L1 门（环境前置已做：`npx prisma generate` 先行，testing-env-patterns §3） | `npx tsc --noEmit` · `npm run lint` · `npm run test:unit` |
| 8 | 同 commit 要求 + 铁律 10 归属 | `git show --stat 27aeec1` |
| 9 | 引用代码实际接线 | grep 消费点：`parse.ts` / `page-data.ts` |

## 2. 关键输出摘录

**\d 实证（节选）：** Material 14 列全数在位，`parseStatus "ParseStatus" not null default 'pending'::"ParseStatus"`；GameKnowledge 12 列在位，`structured jsonb` / `sourceMaterialIds text[]` / `generatedBy text not null default 'strategy'`；两表均有 `publicId` UNIQUE、`tenantId` index；`Material_gameId_fkey` / `GameKnowledge_gameId_fkey` 均 `ON DELETE CASCADE`；GameKnowledge 有链头热路径复合索引 `(gameId, kind)`。`sourceMaterialIds` / `supersededById` 无 FK 约束 = 软引用（D13 先例）确认。

**枚举（pg_enum 13 值）：** MaterialType = lore/art/gameplay_doc/review/data/video · ParseStatus = pending/parsing/parsed/failed · KnowledgeKind = selling_point/audience/compliance_redline —— 与 schema.prisma 与 `knowledge.ts` 应用层枚举三方逐字一致（单测「枚举与 Prisma enum 逐字一致」+ 本人 pg_enum 联查双证）。

**DB 默认值探针（BEGIN…ROLLBACK）：**
```
INSERT Material(不带 parseStatus) → parseStatus='pending', parseError=null, parsedAt=null
INSERT GameKnowledge(不带 generatedBy) → generatedBy='strategy', supersededById=null
ROLLBACK → material_rows_after=0 | knowledge_rows_after=0
```

**L1 门：**
```
npx tsc --noEmit        → exit 0
npm run lint            → ✔ No ESLint warnings or errors（0 warn 0 err，§15 矩阵无需 soft-watch）
npm run test:unit       → Test Files 20 passed (20) · Tests 224 passed (224)
vitest knowledge-schemas.test.ts --reporter=verbose → 18 passed (18)，含 8 类脏数据 it.each 全部「→ null 不抛错」
```

**独立对抗探针：** `probe result: 9 OK / 0 FAIL`（探针脚本在会话 scratchpad，不入 repo）。

**同 commit（27aeec1 --stat）：** `prisma/schema.prisma` + `prisma/migrations/.../migration.sql` + `src/lib/data/schemas/knowledge.ts` + `tests/unit/knowledge-schemas.test.ts` 同一 commit；commit tag `feat(M1-D-KNOWLEDGE-F001)` 对应 features.json F001（铁律 10 ✓）。

**引用代码接线：** `parse.ts:298/302/307` 消费 parseLlmOutput / hasAnyKnowledge / assertSourceMaterialIds（FR-11.9 唯一写入点把关）；`page-data.ts:31` 消费 parseKnowledgeStructured（读侧宽松降级）。

## 3. acceptance 逐条判定

| acceptance 子项 | 判定 | 证据 |
|---|---|---|
| expand 迁移新增 Material（gameId/type 六值枚举/source/fileName/storageRef/mimeType/sizeBytes/parseStatus 四态 @default(pending)/parseError?/parsedAt?） | PASS | §2 \d + migration.sql 纯 expand + applied=t |
| GameKnowledge（gameId/kind 三值枚举/content/structured Json?/sourceMaterialIds String[]/confidence?/generatedBy 默认 strategy/supersededById?） | PASS | §2 \d + 默认值活性探针 |
| sourceMaterialIds 非空溯源 FR-11.9 应用层校验 | PASS | `assertSourceMaterialIds`（parse 违规抛错不降级）+ 单测空数组/空串拒 + 探针非数组抛错 + parse.ts:307 实际接线 |
| 均带 tenantId+publicId；软引用沿 D13 先例 | PASS | 两表 publicId UNIQUE + tenantId index；sourceMaterialIds/supersededById 无 FK |
| schemas/knowledge.ts 落 zod（表深字段 + LLM 解析产物 schema） | PASS | 三类 kind structured 定型 schema（读侧宽松）+ llmParseOutputSchema（写侧严格，max 20 / confidence 0-1）+ 与 architecture §7.6 as-built 描述对位 |
| 单测：脏数据宽松降级 null 不抛错（D2） | PASS | 18/18 verbose 全过 + 独立探针 9/9（NaN/字符串/深层垃圾等 Generator 未测形状同样降级） |
| schema+migration+引用代码同 commit | PASS | 27aeec1 --stat 四件套同 commit |
| lint + tsc + test:unit 绿 | PASS | tsc exit 0 · lint 0/0 · unit 224/224 |

> 计数备注（role-context「计数不符先逐站点追溯」）：commit message 称「15 案例」，vitest 运行态 18 案例——差异源于 `it.each` 8 行展开计数口径，实测 ≥ 声称，非缺陷。

## 4. 环境与复原记录（D-H）

- Node v25.7.0（项目无 .nvmrc；本批单测纯逻辑无 jsdom/localStorage 路径，本机 224/224 全绿，无 §4 误报面）。
- `prisma generate` 已先于 tsc 执行（testing-env-patterns §3）。
- 未绑定 127.0.0.1:3000；F001 验收全程未起 dev/standalone 服务。
- DB 复原：探针走 BEGIN…ROLLBACK，终态 Material=0 行 / GameKnowledge=0 行 / Game=4 行（game-aw/lc/mf/xg）——与开跑前基线态一致，零残留。
- 磁盘：未在项目内创建任何临时目录/文件；探针脚本在会话 scratchpad。
