# M2-B-CREATORS F002 验收记录 — 深字段派生纯函数 + kol-deep zod 契约

- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-23
- **阶段：** verifying（首轮，fix_rounds=0）
- **结论：PARTIAL**（11 项 acceptance 中 10 项 PASS；deriveCredibility 合成输入集与 acceptance/spec 不符——followers 因子未实装且无偏离说明）
- **验收依据：** 实物（`src/lib/data/schemas/kol-deep.ts` + `src/lib/kol-sync/derive.ts` + `tests/unit/kol-deep.test.ts` 逐行 + lint/tsc/test:unit 实跑 + 独立评估探针 5 例实跑 + provenance/spec/architecture 交叉核验），不采信 commit message / 会话叙述。

---

## 逐条 acceptance 判定

### 1. audienceDemoSchema{ageDist?,genderDist?,geoDist?,interests 写侧非空} — **PASS**

`kol-deep.ts:25-30`：分布三键 `distSchema.nullish()`（键→0-100 占比域，`:19`）；`interests: z.array(z.string().min(1)).min(1)` 写侧非空。单测 `kol-deep.test.ts:71-82`：非空合法 / 空数组拒 / `ageDist:{'18-24':142}` 越域拒——全过。

### 2. credibilitySchema{score 0-100, method, signals.min(1), assessedAt} — **PASS**

`kol-deep.ts:51-61`：`score z.number().min(0).max(100)` + `method min(1)` + `signals array(min(1)).min(1)` + `assessedAt`（ISO 串，jsonb 读写同形注记在案）。

### 3. brandSafetySchema{rating, flags.min(1), assessedAt} — **PASS**

`kol-deep.ts:79-87`：`rating z.enum(['safe','review','risk'])`（枚举外 `'danger'` 拒，单测 `:66-68`）+ `flags min(1)` + refine。契约先立、本批无源不落库的语义在文件注释 `:76-77` 明记（与 spec §6 一致）。

### 4. refine 空依据非法（:838 欠账兑现 FR-11.4）— **PASS**

- `kol-deep.ts:59-61`（credibility）/ `:85-87`（brandSafety）：`.refine(v => v.signals/flags.some(s => s.trim().length > 0))`——min(1) 管条数，refine 管空皮，双门齐备。
- Generator 单测覆盖 `[]`（min(1) 拦）与 `['']`（element min(1) 拦）；**评估探针 probe-1 独立补验 refine 自身路径**：`['   ']`（长度 3 过 element min(1)，仅 refine 能拒）→ 判非法 ✓；混合 `['  ','平台认证 ✓']`（some 语义）→ 合法 ✓。brandSafety `['\t ']` 同拒 ✓。
- `architecture.md:838` 已翻为「✅ 已兑现（M2-B F002 refine：.min(1) + 空皮拒）」——与实物一致，无反向漂移。

### 5. 读侧宽松 parse* / 写侧 assert* 双形态（先例）— **PASS**

- parse*（`:34-37/:64-67/:90-93`）safeParse→null 不抛错；assert*（`:40-42/:69-71/:95-97`）zod parse 违规抛错。
- 单测 `:84-90`：五种脏形状（null/undefined/'broken'/42/{score:'high'}）三 parse* 全 null 不抛 ✓；**探针 probe-2**：`assertCredibility` 空 signals 抛错 ✓。
- 先例吻合：`match.ts:40,54,68` / `knowledge.ts:85,116,139` 同形态（grep 实证）。

### 6. derive.ts 纯函数（无 IO 无 LLM，P9）— **PASS**

- 导入面仅 `type ApifyKolRow` + kol-deep assert/type（`derive.ts:14-20`）；全文零 fetch/fs/prisma/LLM/`Date.now`（grep 实证）。
- assessedAt 由调用方注入（`sync.ts:175` 传 nowIso；`:179` fetchedAt = `row.lastScrapedAt ?? nowIso`）——health.ts `now` 先例兑现。
- 权重/阈值常量导出：`INTERESTS_MAX`、`CREDIBILITY_WEIGHTS`、`TIER_SCORE`、`CREDIBILITY_METHOD`（P9 透明可复算）。

### 7. deriveAudienceDemo（matchedTags+matchedKeywords+businessCategory 归一去重，全空→null）— **PASS**

`derive.ts:29-59`：`normalizeTags` trim + lowercase 去重（保留首现大小写展示形态）+ INTERESTS_MAX=12 截断，且导出供 F003 复用（P3 同口径）。单测 `:93-121`：三源合流去重（大小写不敏感）/ 全空/空串/纯空白 businessCategory → null 不编造 / 上限截断——全过。

### 8. deriveCredibility（verified/qualityScore/tier/**followers** 规则合成 + 权重导出 + signals 人话 + method + assessedAt 注入 + 全缺→null）— **PARTIAL** ⚠

**符合部分（实测全过）：**
- `CREDIBILITY_WEIGHTS{verified:0.35, quality:0.35, tier:0.3}` 导出、和=1（单测 `:126-131` toBeCloseTo）；`TIER_SCORE` 导出、枚举外按 cold 保守（`:115`，单测 `:158-162`）。
- signals 逐条人话依据（「平台认证 ✓/✗」「互动质量分 0.80（采集侧实测）」「热度分层 hot」，`:103/:111/:119`）；`method='rule-derived-from-crawl'`（`:83`）；assessedAt 调用方注入；弱信号全缺→null（`:123`）。
- 缺席因子重新归一化（`:125-127`）——YT qualityScore 恒 null 不被冤枉计 0，与 health D15 的刻意差异有注释说明（`:87-90`），设计诚实。qualityScore 越界钳制 [0,1]（`:107`，单测 + 探针 probe-5 上界不溢出）。

**不符部分（判 PARTIAL 的唯一原因）：**
- **followers 因子未实装。** acceptance（features.json F002）、spec（`M2-B-CREATORS-spec.md:98`）、derive.ts 自身文件头注释（`:10`「credibility ← 弱信号规则合成（verified/qualityScore/tier/followers）」）三处均列 followers 为合成输入；实现 `:97-121` 仅 verified/qualityScore/tier 三因子入场，`grep -n "followers" derive.ts` 仅命中 :10 注释一处，实现体零使用。
- **探针 probe-4 行为取证：** `deriveCredibility(row({followers: 9240000}), AT)` → `null`——仅有 followers 信号的行派生不出 credibility。
- **无任何偏离说明：** spec 无修订注记、`framework/proposed-learnings.md` 零记录；`architecture.md §7.2.2` as-built 只记三因子（同批 F008 Generator 所写，非 Planner 裁决记录，不构成豁免）。文件头注释 `:10` 与实现自相矛盾，说明系遗漏而非有意收窄。
- **附带观察（不计入本条判定）：** spec §3 P8「联系方式本批仅作 credibility 派生输入（hasBusinessEmail 信号）」同样未实装（derive.ts 全文零 hasBusinessEmail）——与 followers 缺失同向，合成输入集被静默收窄，建议 fixing 时一并裁决（补实装或 Planner 修订 spec/acceptance + 修正 :10 头注释）。

### 9. deriveFieldProvenance（六档内 source='crawl' + detail 明示派生）— **PASS**

- `derive.ts:151-173`：仅为实际写入字段标注（null 不标注，读写不对称 §7.5.2）；`source:'crawl'` 在 `provenance.ts:20-27` 六档枚举内（`:24`）；detail「由创作者标签规则派生（非受众实测分布）」/「由采集弱信号规则合成（verified/互动质量/热度分层）」明示派生非实测。
- **探针 probe-3 互操作验证：** 派生产物逐条过 `fieldProvenanceEntrySchema.safeParse` 成功且 source='crawl'——ProvenanceTag 消费链路契约兼容实证。
- 单测 `:172-193`：键集恰为实写字段 / 全 null → 空对象——全过。

### 10. 单测边界全覆盖（tags 空/空串/YT null/全缺/refine 拒空依据/分域钳制）不打库不打网关 — **PASS**

- `tests/unit/kol-deep.test.ts` 14/14 全过（verbose 逐例在案）；边界项逐一对上：tags 空/空串（:106-114）、YT qualityScore null → 缺席重新归一化（:151-156）、全缺→null（:159）、refine 拒空依据（:50-55,:65）、分域钳制（:164-169）。
- 导入面仅 vitest + 三个纯模块，零 prisma/fetch/mock——不打库不打网关实证。
- 注记（不影响判定）：refine 的全空白路径（`['   ']`）Generator 用例未直接覆盖（其 `['']` 由 element min(1) 拦截），由评估探针 probe-1 独立补验通过——防线真实存在。

### 11. lint + tsc + test:unit 绿 — **PASS**

按 testing-env-patterns §3 顺序实跑：`npx prisma generate` → `npx tsc --noEmit` exit 0 → `npm run lint`「✔ No ESLint warnings or errors」→ `npm run test:unit` **356/356 passed（34 files）**。本机 Node 25.7 vs CI Node 20：本批无 jsdom/localStorage 类测试，无版本敏感面（testing-env-patterns §4 排除）。

---

## 评估探针（独立取证，测毕已删除）

临时文件 `tests/unit/kol-deep.evaluator-f002-probe.test.ts`，5/5 全过后删除（内容要点已入上文各条）：

| 探针 | 断言 | 结果 |
|---|---|---|
| probe-1 | refine 真空皮：signals `['   ']` 拒 / 混合 some 语义合法 / brandSafety flags `['\t ']` 拒 | ✓ |
| probe-2 | 写侧 assert* 违规抛错不降级 | ✓ |
| probe-3 | deriveFieldProvenance 产物过 provenance.ts `fieldProvenanceEntrySchema`，source='crawl' | ✓ |
| probe-4 | **followers-only 行 → deriveCredibility null（followers 因子未实装取证）** | ✓（即偏离实证） |
| probe-5 | 三因子满值→100 不溢出；tier 空串不计因子→null | ✓ |

## D-H 清态核查（验收收尾）

`scripts/test/evaluator-f002-dh-check.ts`（临时，已删）打 dev DB 实测：Kol=2526（2524 CSV + VK-FULL/VK-NULL 夹具，基线态**不清**）；MatchPlan/MatchCandidate/PlanKol/PendingAction/OperationLog 全 0；仅 Dev Tenant 一个租户（集成测试夹具租户 pid 隔离自清理成功）；dataSource 分布 crawl 1 / user_upload 2525 与 F008 报告基线吻合。本验收零 DB 残留。

## L2 边界

本 feature 为纯函数 + zod 契约，无外部服务面——**零 L2 项，未动用 apify-kol 隧道 / embedding / TikHub**（P1 铁律零触碰）。

## 结论与修复建议

**PARTIAL。** 契约三 schema、refine 兑现、双形态、纯度、归一派生、溯源派生、测试与 L1 全部符合；唯一缺口 = deriveCredibility 合成输入集比 acceptance/spec 少 followers 因子（且 P8 的 hasBusinessEmail 信号同缺），无偏离说明，文件头注释与实现自相矛盾。

修复路径二选一（Generator/Planner 裁决）：
1. 补 followers（及 hasBusinessEmail）因子：`CREDIBILITY_WEIGHTS` 重归一（和=1 单测既有断言守门）+ followers 分档规则 + 单测补边界；
2. Planner 裁决有意收窄：修订 features.json acceptance 与 spec :98 + 修正 `derive.ts:10` 头注释 + 在批次记录中留偏离注记（P8 一并改注）。
