# M2-B-CREATORS F004 验收记录 — creators 页接真 + mock 退役 + CI 视觉夹具

- **署名：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **日期：** 2026-07-23
- **结论：** **PARTIAL**（功能/代码/测试/数据面逐项 PASS；2 处 acceptance 明文的文档同步项未完成）
- **验收对象：** commit `10a41df`（F004 主体）+ `d9ea2f1`（linux 基线重生）@ HEAD `e95a7ff`
- **验收方式：** 代码实物比读 + L1 本地实跑（lint/tsc/356 tests）+ dev DB 实测 + RSC 数据层直调脚本
  （`scripts/test/m2b-f004-pagedata-verify.ts`，22 断言）+ CI 实跑证据（gh run，HEAD 五 job 全绿）。
  端口纪律遵守：未起任何 dev/standalone server（:3000 归 READINESS）；视觉运行时证据取 CI Visual regression job。

---

## 逐条 acceptance 判定

### 1. page.tsx 拆 RSC 数据层（force-dynamic 必声明）+ client 交互层 — ✅ PASS

- `src/app/admin/creators/page.tsx:12` `export const dynamic = 'force-dynamic'` 显式声明（v1.0.9 §6）；
  RSC async 组件读 `searchParams` → `getDevTenantId` → `loadCreatorsPageData`（服务端直读 DB）。
- 交互层拆至 `src/components/creators/CreatorsClient.tsx`（'use client'）；`useSearchParams` 经 Suspense 包裹（Next 15 先例）。
- 数据组装层 `src/lib/creators/page-data.ts`（knowledge/page-data 先例；服务端筛选，URL 化裁决 #4）。

### 2. 布局零变更（V9 16 元素 🔒） — ✅ PASS

机械对账 `git show 10a41df^:src/app/admin/creators/page.tsx`（旧 inner）vs 新 `CreatorsClient.tsx`：
PageHeader（标题 + lede 逐字）、KPI grid class（`mt-[22px] grid ... 3xl:grid-cols-4`）、FilterRow 组件逐字符同构、
表 8 列 cell 标记同构、底部 shield 逐字、CreatorDrawer 调用同构。对照 ARCH-M05-ui-inventory V9 清单
16 元素逐项在场（🔒 lede / 平台+品类两行不合并 / 整行开抽屉 / 加入匹配 ghost stopPropagation / 底部 shield）。
差异仅两类，均为 acceptance 声明内：诚实降级条件渲染（reuse null→—、cred null→待核，FR-11.17/裁决 #2）
+ P10 截断提示行（Planner 批内裁决已在 spec §3 登记为布局变更小注；但见 ⑨-b 登记缺口）。

### 3. 8 列真数据映射 — ✅ PASS

- 可信度 ← credibility.score 分级：`CRED_GRADE_THRESHOLDS = {A:85, B:70}` 常量导出
  （`creator-format.ts:152`）+ `resolveCredGrade`；DB 实测 VK-FULL score 93 → A 级。
- 【P5】受众匹配列库级恒待核：`kolToCreatorView` 中 `match: null` 硬编码注释明示；
  **DB 实测 100 行全行 match=null**（脚本断言 ✅），显示层 `isPendingVerification` → 「待核」。
- #ad ← brandSafety：safe→ok，null/review/risk→warn 待核；实测 VK-FULL（无 brandSafety）→ warn ✅。
- 历史合作 null → —（不用 0 冒充）；实测全行 reuse=null ✅。
- 单测锚定：`tests/unit/creator-format.test.ts`（9 用例：P5/分级/脏数据不抛错/name 回退链/deep 面）。

### 4. KPI 4 卡真计数 + 筛选真值域 — ✅ PASS

dev DB 直调实测（脚本输出）：
```
KPI = {"total":"2526","reuse":"待接入","match":"待核","premium":"1"}
platformFilters = ["全部","YouTube","TikTok"]        ← 库内实际出现平台
categoryFilters = ["全部品类","Other","gaming","Casual","FPS"]  ← top4 频次
```
- 库内创作者 = 2526 全量真值（非截断值）；高价值可复用 = A 级真计数 1（库内唯一 A = VK-FULL）；
  无源两卡诚实「待接入/待核」（D2 不编数）。
- 服务端筛选实测：platform=TikTok → 1 行全 TikTok ✅；category=Other → 100 行 ✅；
  恶意/未知 URL 值（`'; DROP TABLE--`）回落默认 ✅。
- 【P10】LIST_LIMIT=100 截断实测：rows=100 + listTruncated=true + 截断提示行实装（不冒充全量）。

### 5. mock/creators.ts 退役：needle grep 零代码残留 — ✅ PASS；index.ts 翻牌 — ❌ 未完成

- `src/lib/data/mock/creators.ts` 已删除（10a41df）；全仓 grep `mock/creators` /
  `mockCreators|creatorKpis|matchesCreatorFilters|MockCreator`：仅 2 处注释引用（退役记录 +
  index.ts 命名示例），零代码残留 ✅。
- **❌ `src/lib/data/mock/index.ts` 翻牌未做**：acceptance 明文「+index.ts 翻牌」，但该文件
  末次触碰 = M2-A `0b81a18`（`git log -- src/lib/data/mock/index.ts` 实证），本批未动；
  creators.ts 行仍以未退役态登记（`| creators.ts | F013 | 创作者库 + 抽屉（V10...）|`），
  对照 today/projects/env-match/knowledge 四行均有 `~~xxx~~ 已退役` 标注。文档注释层缺陷，无运行时影响。

### 6. 【P6】视觉夹具 2 行 + CI 接入 — ✅ PASS

- `scripts/seed/visual-kols.ts`：固定 publicId `vk-visual-full-0001` / `vk-visual-null-0002`，
  幂等 upsert by (tenantId, canonicalHandle)；VK-FULL followers 9.99M 恒居首行（锚点确定性）。
- **DB 实测**：VK-FULL 在场且深字段齐备（dataSource='crawl' + interests + credibility 93 +
  fieldProvenance 双键）✅；VK-NULL 在场且深字段全 null（user_upload）✅；
  基线态总量 2526 = 2524 CSV + 2 夹具，dataSource 分布 `crawl:1 / user_upload:2525` ✅。
- 接入实证：`ci.yml:146` + `update-visual-baselines.yml:53` 均有 `npx tsx scripts/seed/visual-kols.ts`
  步骤；`package.json` `seed:visual-kols` 本地入口。D-H 基线态扩展（2 夹具行**不清**）与验收前提一致。

### 7. creators.png 基线对账重生 + §4.3 硬断言 — ✅ PASS（附口径注记）

- darwin 基线随 10a41df 重生（288710→274819 bytes）；linux 基线经 Update visual baselines
  workflow 重生（`d9ea2f1`，294812→271297 bytes，github-actions bot）。
- §4.4 两段式在 run 历史中实证：F004 run cancelled（被 F005 push 顶替）→ F005 run failure
  （新 creator-drawer 用例首推预期红）→ 基线重生 → F006/F007/F008 三连 success。
- `tests/visual/workbench.spec.ts:78-92` creators 用例：waitFor 硬断言「只做发现和分流」+
  「基线夹具·深字段齐备」+「基线夹具·待接入态」——数据源整个消失/RSC 组装回归即超时硬红，
  §4.3 反静默空白意图满足。**口径注记**：acceptance 写「空态文案硬断言」，夹具在场时列表非空、
  空态文案不渲染，实装为夹具行文案硬断言（同等达成 §4.3 目的）；DataTable emptyText 已更新为
  真话文案「创作者库暂无数据——外采同步（kol-sync）或 CSV seed 完成后展示。」
- §4.5 重生序无法回溯直证；后果面证据：HEAD `e95a7ff` CI 五 job 全绿含 **Visual regression: success**
  （CI 干净容器自起 server + 夹具 seed 渲染与基线一致——若基线曾被 :3000 残活污染必红）。

### 8. 运行时改→验→复原实证（RSC 组装层） — ✅ PASS（Evaluator 独立重演）

不起 server（端口纪律），以数据层直调独立重演：sentinel Kol（followers 99.99M）插入 →
`loadCreatorsPageData` 立即返回其为首行且 totalCount=2527（RSC 组装层实时直读 DB，无缓存冻结）→
删除 → 首行回 VK-FULL，totalCount=2526，终态与验前一致（D-H 清态，脚本断言 ✅×3）。
浏览器端渲染真实性由 CI Visual regression 覆盖（同一 RSC 路径渲染夹具行入基线）。

### 9. 两视口实测 — ⚠️ 无 artifact 可复核（不计缺陷）

Generator 构建期人工步，无留痕产物。等价证据：布局零变更机械对账（responsive class 与
ARCH-M05 F013 已验收版完全一致）+ CI 1512×982 运行时渲染绿。浏览器级视口复测归 READINESS。

### 10. lint + tsc + test:unit + test:visual 绿 — ✅ PASS

- 本地实跑（HEAD e95a7ff）：`next lint` ✔ No ESLint warnings or errors；`tsc --noEmit` 零输出；
  `vitest run` **34 文件 356 测试全过**（4.79s）。
- test:visual：不本地重跑（端口纪律 + 全量视觉归 READINESS）；CI HEAD run 五 job 全绿
  （Lint / Visual regression / Build / Unit + integration tests / Typecheck: success）。

---

## 未完成项汇总（PARTIAL 依据）

| # | 项 | 出处 | 性质 |
|---|---|---|---|
| 1 | `src/lib/data/mock/index.ts` 翻牌（creators.ts 行标退役） | features.json F004 acceptance 明文 | 文档注释层，无运行时影响；1 行 edit |
| 2 | P10 截断提示行未在 `ARCH-M05-ui-inventory.md` 备注登记 | spec §3 P10「随 F004 落地并在 ui-inventory 备注登记」 | 清单与实物漂移（grep P10/截断/前 100/LIST_LIMIT 全零命中；本批 F006 曾触碰该文件更新 V5，V9 之漏为实） |

两项均为文档同步缺失，代码行为正确（截断行为本身已实装且诚实）。修复预估合计 <10 行文档编辑。

## 复现步骤

1. `cat src/lib/data/mock/index.ts` → creators.ts 行无 `~~已退役~~` 标注（对照 today/projects/env-match/knowledge 四行）；
   `git log --oneline -1 -- src/lib/data/mock/index.ts` → `0b81a18`（M2-A，非本批）。
2. `grep -n "P10\|截断\|前 100\|LIST_LIMIT" docs/specs/ARCH-M05-ui-inventory.md` → 零命中；
   对照 spec §3 P10 末句「随 F004 落地并在 ui-inventory 备注登记」。

## 关键验证命令（PASS 面）

```bash
npx next lint && npx tsc --noEmit && npm run test:unit          # 0 warn / silent / 356 pass
node --env-file=.env --import tsx scripts/test/m2b-f004-pagedata-verify.ts   # 22 断言全 ✅
gh run list --workflow ci.yml --limit 1   # HEAD e95a7ff success（五 job 含 Visual regression）
grep -rn "mockCreators\|matchesCreatorFilters" src tests scripts  # 仅注释 2 处
```

## 测试产物

- `scripts/test/m2b-f004-pagedata-verify.ts`（新增，Evaluator 产物；幂等，含自清理）
- DB 终态：Kol=2526（2524 CSV + VK-FULL/VK-NULL），sentinel 零残留——D-H 清态确认
