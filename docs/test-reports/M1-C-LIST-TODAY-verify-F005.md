# M1-C-LIST-TODAY — F005 验收分报告（收敛与 mock 退役链）

- **Feature：** F005 收敛与 mock 退役链（ENV_NAME/env-brief/tone + mock 整删）
- **判定：** **PARTIAL**
- **验收人：** Andy/evaluator-subagent（隔离 fresh context，fan-out 分片）
- **日期：** 2026-07-22 · **验收对象：** main HEAD `5a666a9`（F005 commit `2289343`）
- **环境：** 本地 standalone http://127.0.0.1:3000（HEAD 构建产物）+ dev DB（四 canonical 项目已 seed；本次验收零数据变更——只读 curl / grep / 截图比对，无需恢复步骤）
- **L2 声明：** f007/f010 探针全量含真实网关聊天调用（[L2] 计费），未获授权不执行；F005 触及面（旧 id 深链 alias）已用本地 curl 差分实证覆盖

---

## 1. 逐条 acceptance 判定

| # | acceptance 条目 | 判定 | 关键证据 |
|---|---|---|---|
| 1 | ENV_NAME 消费切 `ENV_META[].name` | ✅ PASS | 全仓 grep `ENV_NAME` 零命中（src/scripts/tests/package.json）；`today/page.tsx:197` = `ENV_META[item.env].name`；`env-meta.ts` 五环节名与原 ENV_NAME 值逐字一致（目标 Brief/创作者匹配/触达谈判/交付结算/复盘洞察，对照 `git show d222374^:src/lib/data/mock/today.ts`） |
| 2 | 【D-E】env-brief 分流改内联 slug 比对 + 内联 LEGACY_ID_ALIAS，不再 import mock/projects | ✅ PASS | `env-brief.ts:160-162` 内联 `LEGACY_ID_ALIAS = { 'starlight-protocol': 'xg' }`；`:170-173` `getEnvBrief` 内联 `canonical === 'xg'` 判定；文件 import 仅剩 `zod`（无 mock/projects） |
| 3 | f007/f010 旧 id 深链零回归 | ✅ PASS（L1 面） | curl 差分：`/admin/campaigns/starlight-protocol?env=brief` 出 canonical『192万 / 300万 曝光』×2、0 个「待接入」（与 `xg?env=brief` 同形）；`nonexistent-id?env=brief` 4×「待接入」（降级对照成立，页面另 1 处 192万 串属 Copilot 建议卡与 brief 无关）；`starlight-protocol?env=reach` HTTP 200 + 专家头「触达 Agent」在 HTML 中。f007/f010 全量跑（含网关聊天）留给就绪回归/授权后 |
| 4 | 删除 mock/today.ts + mock/projects.ts，按被删路径 needle 全仓 grep 零残留 | ✅ PASS | 两文件磁盘不存在（`ls src/lib/data/mock/`）；全仓正则 grep `from/import/require ... mock/(projects\|today)` 零命中（除 docs/test-reports 历史报告）；needle `mock/today` 零命中；`mock/projects` 仅 6 处注释类历史出处标注（health-label.ts:3 / domain/health.ts:15 / canonical-projects.ts:7,53 / env-brief.ts:156-157 / campaigns/page.tsx:8，均已标注退役，符合 spec「零悬空引用」口径）；package.json 无 `eval-m1a\|seed-parity` 残留；`mock/index.ts:10-11` 目录表已标 `~~today.ts~~`/`~~projects.ts~~` 已退役 |
| 5 | 【D-F】health-tone.ts 单点导出 PILL_TONE + DOT_TONE，三处 import 单点 | ✅ PASS（单点性） | `src/lib/display/health-tone.ts` 导出两常量；HealthBand 语义的 tone 映射全仓仅此 1 处定义；campaigns/page.tsx:36、today/page.tsx:50 import PILL_TONE，ProjectDetail.tsx:29 import DOT_TONE，三文件内本地副本已删。同名异义 map 甄别不属收敛范围：brief/index.tsx:152 DOT_TONE 键为 timeline `done/cur/todo`、reach ConversationInbox:42 PILL_TONE 键为 ReachStageTone、match:197 FIT_PILL_TONE、creator-ui:38 PILL_TONE_CLASSES——均非 HealthBand 域 |
| 6 | 【D-F】canonical 取 today 版全 dark 变体 | ✅ PASS | health-tone.ts PILL_TONE 与 `git show 948d327:src/app/admin/today/page.tsx:123-128`（pre-F005 today 版）逐字一致；DOT_TONE 与 pre-F005 ProjectDetail:51-55 逐字一致 |
| 7 | 【D-F】**浅色基线零漂移** | ❌ **不成立** | 见 §2——campaigns 浅色渲染实变 720px，基线未重生，被 1500px 容忍带吸收（借绿） |
| 8 | 回归：tsc 全绿 + grep 实证零副本残留 | ✅ PASS | tsc exit 0（`set -o pipefail` 实测）；tone/needle grep 见上 |
| 9 | lint + tsc + test:unit 绿 | ✅ PASS | `next lint`：No ESLint warnings or errors；`tsc --noEmit` exit 0；`vitest run`：**12 files / 139 tests 全过**（455ms） |

## 2. 主要发现：campaigns 浅色基线漂移被容忍带「借绿」（判 PARTIAL 的原因）

**事实链（全部实测）：**

1. pre-F005 campaigns 本地 PILL_TONE（`git show 948d327:src/app/admin/campaigns/page.tsx:37-42`，与基线拍摄时刻 `7f86062` 版本一致）：
   `wn: 'bg-orange-50 text-amber-700 …'`、`cr: 'bg-red-50 text-red-500'`
2. F005 canonical（today 版）：`wn: … text-orange-600 …`、`cr: … text-red-600 …`——**campaigns 的浅色类也变了**，不止 dark 变体（spec D-F「浅色渲染零漂移、深色 campaigns 略变」的前提对 campaigns 不成立）。
3. 当前服务器实渲染：`curl /admin/campaigns` 出 4× `bg-red-50 text-red-600`（四项目全 cr，D2 预期）。
4. 色板（tailwind.config.js:198-209）：red-500 `#f53939` → red-600 `#ea0606`，G/B 通道差 51。
5. **像素级量化**（同口径复刻 workbench.spec campaigns 用例：viewport 1512×982 / mockFonts / mockHandoffs / fonts.ready+1500ms settle，比对 `tests/screenshots/baseline/campaigns-darwin.png`）：
   - exact-diff **720 px**、Δ>16 共 540 px、max Δ=51，全部落在 bbox x531-962 / y251-458（= 四张卡 health pill 文本区），其余全图逐像素相同（渲染确定性成立，非环境噪声）；
   - 抽样 diff 像素：基线 `(245,57,57)` ≡ red-500，当前 `(234,6,6)` ≡ red-600——漂移即该色变，无其他成分。
6. 基线未重生：`git log -- tests/screenshots/baseline/campaigns-darwin.png` 最后一次 = `7f86062`（F001）；campaigns-linux 最后 = `11e67ba`（F003 前）。均早于 F005（`2289343`）。
7. `npx playwright test -c tests/visual/playwright.evaluator.config.ts -g "campaigns list"`（BASE=:3000）**通过**——720 < maxDiffPixels 1500，变更被容忍带吸收。

**定性：** 这正是 spec §3 D-I 与 framework v1.0.8 明文禁止的反模式——「容忍带会把故意变更『借绿』——**意图变更必须重生基线**」。D-F 采 today 版 canonical 使 campaigns 浅色 cr pill 变色是**意图变更的必然结果**，却未重生基线：当前基线余量只剩 780px，且 acceptance/commit 正文（「浅色 canonical 与原值逐字同」）的断言与实物不符。另有潜在项：wn `text-amber-700→text-orange-600` 当前无渲染面（四项目全 cr），M2/M3 三态丰富化后将显形，应一并登记。

**建议修复（Generator）：** ① 重生 campaigns darwin + linux 基线，并按 D-I 附逐张对账说明（cr pill 文字色 `#f53939→#ea0606`，系 D-F canonical 取 today 版的意图变更）；② 更正 D-F 登记：campaigns 浅色 wn/cr 与 today 版原本不同，「浅色零漂移」仅对 today/ProjectDetail 成立，campaigns 属浅色略变 + 登记 wn 潜在项。不建议改回 campaigns 旧值（与 D-F canonical 裁决冲突）。

## 3. 复现步骤（发现 #1）

```bash
# 1) 类名层：当前浅色渲染 vs 基线拍摄口径
curl -s http://127.0.0.1:3000/admin/campaigns | grep -o 'bg-red-50 [^"]*' | sort | uniq -c   # → 4× text-red-600
git show 7f86062:src/app/admin/campaigns/page.tsx | sed -n '31,36p'                          # → cr: text-red-500
# 2) 基线未重生
git log --oneline -- tests/screenshots/baseline/campaigns-darwin.png                          # 最后 = 7f86062（F005 之前）
# 3) 像素层量化（脚本存 evaluator scratchpad：f005-campaigns-pixel-diff.mjs，同口径截图 + PIL 逐像素比对）
#    → exact-diff 720px，max Δ=51，抽样 (245,57,57)→(234,6,6)，即 red-500→red-600
# 4) 借绿确认：断言在旧基线上仍绿
BASE=http://127.0.0.1:3000 npx playwright test -c tests/visual/playwright.evaluator.config.ts -g "campaigns list"  # → 1 passed
```

## 4. 结论

mock 退役链主体（整删零悬空引用、env-brief 解耦、ENV_NAME 收敛、tone 单点化、L1 三件套）全部达成且证据充分；唯 acceptance 明文子项「浅色基线零漂移」经像素级实测**不成立**（720px 意图变更借绿入库、基线未按 D-I 重生、变更登记失实）。按「主要功能可用，但有具体问题」判 **PARTIAL**，F005 应改回 pending 交 Generator 重生基线 + 更正登记后复验。

---

## 5. 对抗复核（独立 evaluator · fresh context · 2026-07-22）

- **复核人：** Andy/evaluator-subagent（对抗复核分片，与 §1-§4 验收人不同上下文）
- **任务：** 仅尝试证伪 §2 发现（不放宽验收口径）。三条证伪路径逐一排查。
- **结论：** **证伪失败，原判定维持 PARTIAL。**

### 5.1 路径 1：亲自复现 steps_to_reproduce → 完全复现

全部步骤独立重跑（HEAD `5a666a9`，standalone :3000，只读零数据变更）：

| 步骤 | 结果 |
|---|---|
| 类名层：`curl /admin/campaigns` grep `bg-red-50` | ✅ 4× `bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-400`（复现） |
| 基线拍摄口径：`git show 7f86062:campaigns/page.tsx` | ✅ `cr: 'bg-red-50 text-red-500'`、`wn: '… text-amber-700 …'`（复现；948d327 同值，即 F005 前一直如此） |
| 基线未重生：`git log -- campaigns-darwin.png` | ✅ 最后 = `7f86062`；linux 最后 = `11e67ba`；`git merge-base --is-ancestor` 实证两者均为 F005 `2289343` 的祖先 |
| 像素层：独立自写脚本（`f005-diff-regions.mjs`，未复用原 scratchpad 产物）复刻同口径（1512×982 + mockFonts/mockHandoffs + fonts.ready + 1500ms settle + `animations:'disabled'`/`caret:'hide'` 即 toHaveScreenshot 稳定化） | ✅ **exactDiff 720 / Δ>16 540 / maxΔ 51，逐项与原报告一致**；diff 全落 y200-499（356+364），y<200 零 diff；maxΔ 51 ≡ `#f53939`→`#ea0606` 的 G/B 通道差（57−6） |
| 借绿确认：`BASE=:3000 npx playwright test -c playwright.evaluator.config.ts -g "campaigns list"` | ✅ 1 passed（720 < 1500 容忍带，复现） |

旁证：色板 `tailwind.config.js:204-205` red-500 `#f53939` / red-600 `#ea0606`；canonical `health-tone.ts` 与 pre-F005 today 版（`948d327:today/page.tsx:123-128`）逐字一致（D-F 收敛本体正确，缺陷仅在基线未重生+登记失实——与原判定 scope 一致）；页面 `bg-orange-50` 零命中，wn 潜在登记项属实。

### 5.2 路径 2：已知环境误报排查 → 不命中

- 实测走 standalone :3000（testing-env-patterns §7 要求，非 dev server）；
- diff 具**确定性**：复核首轮未加 `animations:'disabled'` 得 884px（上部多出动画类噪声），补稳定化后精确收敛 720px 且逐项吻合——恰证明 720px 是确定性渲染差而非环境噪声；
- prisma generate（§3）/ Node 版本 jsdom（§4）/ suite isolation（§5）/ RLS 视角（§6）均与浏览器截图比对无关，不适用。

### 5.3 路径 3：与 spec 裁决 / Planner 修订注记冲突排查 → 不冲突（同向）

- D-F 裁决原文自带「浅色基线零漂移」子项（spec §3 + §2 F005「浅色渲染零漂移（基线安全）」）；features.json F005 acceptance 无任何 Planner 修订注记豁免该子项（F001/F003 有修订注记，F005 没有）；
- D-I 明文「意图变更必重生（容忍带借绿教训）」——原发现正是执行该裁决，非对抗裁决；
- 原判定未把 D2 全 cr 预期当缺陷（正确避开了「裁决预期误判为缺陷」的误报模式），且不建议回改 canonical（与 D-F 不冲突）——判定边界准确；
- commit 正文「test:visual 13/13 零漂移（浅色 canonical 与原值逐字同）」对 campaigns 不成立，grep 实证（pre-F005 campaigns cr=`text-red-500` ≠ canonical `text-red-600`）——「登记失实」定性成立。

### 5.4 判级复核

PARTIAL 判级恰当：主体（退役链五组子项 + L1 三件套）全 PASS，唯一明文子项以实测证伪，修复路径具体（重生 campaigns darwin+linux 基线 + D-I 对账说明 + 更正 D-F 登记）。不构成 FAIL（无功能性破坏），也不可 PASS（acceptance 明文子项 + D-I 裁决双重不满足，借绿是 framework v1.0.8 明文反模式）。

**对抗复核最终结论：refuted = false，维持 PARTIAL。**
