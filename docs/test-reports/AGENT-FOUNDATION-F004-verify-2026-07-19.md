# AGENT-FOUNDATION F004 验收报告

- **Feature：** F004 — CSV seed 灌 ~2500 真实 KOL + bge-m3 embedding 入 pgvector（单 dev 用户）
- **验收日期：** 2026-07-19
- **验收人：** Andy/evaluator-subagent（fresh context 隔离验收，无自评）
- **被验提交：** 6cfe621 `feat(AGENT-FOUNDATION-F004): ...`
- **验收依据：** features.json F004 acceptance（权威副本）+ spec §F004 + §6 数据门/构建门 + database-patterns.md §7（staging 端到端跑脚本硬要求）+ ai-action-contract.md
- **验收环境：** 本机 docker db 容器 newkolmatrix-dev-db（healthy），已 seed 态；`.env` 有 DATABASE_URL + AIGCGATEWAY key。未 wipe 重灌（验 seeded 态 + 幂等 re-run + 脏 CSV + cosine）。
- **总判定：PASS**（8/8 acceptance 子条 PASS，构建门 PASS，数据门 PASS）

---

## 逐条 acceptance 结果

### C1 — 旧仓库 CSV 拷入 repo 并入 git（可复现） → PASS

- `git ls-files scripts/seed/data/` → `scripts/seed/data/kol-seed-enriched-final.csv`（已 track）
- `git show HEAD:...csv | wc -l` = 2525（1 表头 + 2524 数据行）
- commit 6cfe621 --stat 含 `scripts/seed/data/kol-seed-enriched-final.csv | 2525 +++`

### C2 — 解析（BOM/列名别名/空值/货币[数字]格式）+ 规范化 + 批量入库 → PASS（读码核对 + 实测）

- **真正的 RFC4180 parser（非 naive split）：** `import { parse } from 'csv-parse/sync'`（import-kol-csv.ts:16），`parse(raw, { skip_empty_lines, relax_column_count })`（:278）。csv-parse@7.0.1 在 package.json（commit 内）。
- **BOM 剥离：** `stripBom`（:54）在整文件读入（:276）+ 每个表头单元格（:59, :281）双重剥离。
- **列名别名：** `COLUMN_ALIASES`（:28-37）中文主 + 英文兜底（platform/name/url/region/followers/isGame/category/reason）；大小写不敏感匹配（:63）。
- **数字（粉丝数）格式容错：** `parseFollowers`（:76-89）去逗号/全角逗号/空格 + 支持 `万/w/k/m/亿` 量级后缀。CSV 无货币列（粉丝数为计数），数字格式容错以此实现，符合 acceptance 意图。
- **RFC4180 硬案例实测（决定性证据）：** CSV 内 950 行含引号字段；comma 分布 923 行 12 token / 22 行 13 / 3 行 14 / 各 1 行 15、16（表头为 11 列 = 10 逗号）——naive split 会散架。行 1690 `"Harrison, the Mana Dork"`（逗号落在第 3 列 displayName 内，naive split 会把后续所有列错位）→ DB 实测解析为单一 `displayName='Harrison, the Mana Dork'`，`country=加拿大 followers=7750` 列对齐正确。

### C3 — 用 F003 链路生成 bge-m3 向量入 pgvector → PASS

- `embeddingModel()` 取自 `src/lib/ai/gateway`（F003 交付），`embedMany({ model: embeddingModel(), values })`（:234）分 100/批 → raw SQL `UPDATE "Kol" SET embedding = $1::vector`（:239）。
- DB 实测：`format_type(...)` = `vector(1024)`；抽样 `array_length(embedding::real[],1)` = 1024；抽样值为真实浮点非全零（`[-0.018714843,-0.011956705,...]`）。

### C4 — seed 后 DB ≥2000 条真实 KOL 含非空 embedding → PASS

- dev tenant 下 KOL 总数 = **2524** ≥ 2000。
- 含非空 embedding 的 KOL = **2524** ≥ 2000（`WHERE embedding IS NOT NULL`）。
- 抽样为真实 KOL：MR. PZ FF / Android Games Play Mix / SHENRON Gaming …（platform=youtube，followers 真实，dataSource=`csv-seed:kol-seed-enriched-final.csv` = D15 provenance 按真实证据填写，categories 含 gaming）。

### C5 — seed 1 个 dev 用户 → PASS

- `User` 表 1 行：`dev@newkolmatrix.local` / `Dev User`（`seedDevTenantUser` upsert，:154-166）。

### C6 — 一条 cosine（<=>）查询对 NL query 返回相关 top-K → PASS（Evaluator 独立出题）

Evaluator 用 F003 gateway 现场生成 bge-m3 向量，独立出 3 条 NL query（非实现者内置的 WoT query）跑 cosine top-5：

| NL query | top-5 结果 | 距离区间 | 判定 |
|---|---|---|---|
| `first person shooter FPS gameplay commentary` | FPSProdigy / OneShotRich / Danye / splashrl / Quartz（全 FPS/gaming） | 0.3532–0.4200 | 语义命中 |
| `Minecraft sandbox building survival creative` | JDP Build's / VaderDad Builds / Mr GVSMRB-ROBLOX / Builder Playz / Kodek（沙盒/building/gaming） | 0.3905–0.4864 | 语义命中 |
| `手机休闲益智小游戏 儿童` | Vkids-Educational Games For Children / IT'S ZOE TIME!-Fun Videos for Kids / kids fun zahoor …（kids/educational/casual） | 0.3917–0.4219 | 语义命中（且中文 query 命中英文频道名 → 证 bge-m3 多语言 embedding 生效） |

脚本内置 sanity（WoT query）top-5 distance 0.3098–0.4526 同样命中。

### C7 — 脚本幂等（(tenantId, canonicalHandle) upsert） → PASS

- 唯一索引 `Kol_tenantId_canonicalHandle_key ON (tenantId, canonicalHandle)` 实测存在，与 upsert where 键（:184）一致。
- `npm run seed:kol` re-run：`exit=0`；KOL 总数 re-run 前后不变（2524→2524）；日志 `[seed] 所有 KOL 已有 embedding，跳过（幂等）` + `本次新 embed 0`（`embedMissing` 仅对 `embedding IS NULL` 的行调 bge-m3，:222-223）——不重复 embed，不产生重复行。

### C8 — 脏 CSV 校验失败返回非零退出码 → PASS（≥2 种，实测 3 种）

Evaluator 自造脏 CSV（临时目录，未入 repo）：

| 脏法 | exit | 错误信息 |
|---|---|---|
| 表头缺必需列（删 频道链接/url 列） | **1** | `脏 CSV：表头缺必需列 [url]。实际表头: idx \| 平台 \| 昵称 \| 地区 \| 粉丝数`（resolveColumns 结构性抛错，:66-72） |
| 数据行缺必需字段（platform 空 / name+url 均空） | **1** | `2 行校验失败`：`行3 缺必需字段（platform=空 …）` / `行4 缺必需字段（… name/url 均空）`（normalizeRow error + `process.exit(1)`，:293-297）。好行放行、坏行拦截，任一坏行使整批非零退出 |
| 表头存在但无数据行 | **1** | `脏 CSV：无数据行`（:279） |

---

## 门（spec §6）

### 数据门 → PASS
docker postgres+pgvector healthy；`Kol.embedding` = vector(1024)；seed → 2524 KOL 含非空 embedding + 1 dev 用户；cosine（Evaluator 独立 3 query + 内置 1 query）返回语义相关 top-K；幂等 re-run 通过。

### 构建门 → PASS
删 tsconfig.tsbuildinfo + .next/cache 后：
- `npx tsc --noEmit` → `TSC_EXIT=0`
- `npx next lint` → `LINT_EXIT=0`（✔ No ESLint warnings or errors）
- `npx next build` → `BUILD_EXIT=0`（✓ Compiled successfully + Generating static pages 10/10）

### 密钥门（顺带） → PASS
`.env` git-ignored（check-ignore exit 0）；脚本密钥走 `src/lib/ai/gateway` 的 env 懒校验，import-kol-csv.ts 内无硬编码端点/密钥。

---

## 非阻断观察（记录不打回）

1. **无货币列：** CSV 无货币字段，acceptance 的「货币格式」在本数据集体现为粉丝数（计数）的数字格式容错（逗号 + 万/w/k/m/亿）；实现符合意图。
2. **re-run 仍全量 upsert：** 幂等 re-run 会对全部 2524 行执行 update（刷字段），但 key = (tenantId, canonicalHandle) 不产生新行、不重复 embed，幂等成立（非缺陷，仅记录行为）。
3. **staging 端到端（database-patterns §7）：** 本 feature 的 `.ts` 脚本已在本机真实 docker DB + 真实 aigcgateway 端到端跑通（非 mock），满足「实装后端到端跑脚本」硬要求。

---

**总判定：PASS**（8/8 acceptance + 数据门 + 构建门全绿）。被验提交 6cfe621，改动仅 scripts/seed/**（+ package.json/lock 加 csv-parse 依赖），全在 F004 scope。仅验 F004（F005–F010 未实现属正常）。

验收人 Andy/evaluator-subagent
