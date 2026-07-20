# FE-REFACTOR Signoff — 批次末汇总验收

> 状态：**Evaluator 已验收，判定 PASS**（progress.json status=verifying → 建议置 done）
> 触发：A/B/C 三路并行验收完成，批次末汇总 signoff + 交叉抽查 + 就绪回归

- **批次：** FE-REFACTOR（普通批次，7 features 全 `executor:generator`）
- **验收人：** Andy/evaluator-subagent（隔离上下文，fresh context）
- **验收日期：** 2026-07-20
- **被验 HEAD：** `60c7ef6`（仅动 progress.json；产品代码 + tests 终态 = `7d34d00`）
- **口径来源：** `features.json` acceptance + `docs/specs/FE-REFACTOR-spec.md` §2/§3/§4
- **前置报告：** verify-A（F001/F002）、verify-B（F003/F004/F007）、verify-C（F005/F006），三份原文未被本报告改写

> 本 signoff 的结论**不是**对三份分路报告的转述汇总。所有引用的关键 clause 均已由本轮独立回实物复核（§2），凡复核结果与分路报告不一致处一律以实物为准。

---

## 0. 终判

# 整批：**PASS**（7/7 feature PASS，0 FAIL / 0 PARTIAL）

| Feature | 标题 | 归属路 | Verdict | clause |
|---|---|---|---|---|
| **F001** | common 抽取 A：Badge / ChatBubble / DefinitionRow + 术语统一 | A | **PASS** | 6/6 |
| **F002** | common 抽取 B：PageHeader / SectionLabel / PanelHeader + Button icon variant | A | **PASS** | 6/6 |
| **F003** | HandoffCard 容器/呈现拆分（P0） | B | **PASS** | 8/8 |
| **F004** | 卡片表面语言统一（SurfaceCard + hover:shadow-xl） | B | **PASS** | 6/6 |
| **F005** | 设计 token 层：微排版刻度命名化 + gray-600 统一 | C | **PASS** | 6/6 |
| **F006** | admin/ port 约定文档 + dead 组件登记表 | C | **PASS** | 5/5 |
| **F007** | 视觉基线单次重生 + CI 视觉盲区修复 | B | **PASS** | 7/7 |

**合计 44/44 clause PASS。** spec §4 验收口径 5 项全部达成：L1 双绿 + test:visual 全绿（口径 1）、三脚本对账达标（口径 2）、逐 feature acceptance 达成（口径 3）、基线 PNG 逐张人查变化仅限拍板项（口径 4，B 路 §4.1-4.3）、豁免项不计 FAIL（口径 3 后半）。

---

## 1. 批次末就绪回归（本轮实测，HEAD `60c7ef6`）

| # | 项 | 命令 | 结果 |
|---|---|---|---|
| 1 | 类型检查 | `npx tsc --noEmit` | **绿** — `EXIT=0`，零诊断输出 |
| 2 | Lint | `npx next lint` | **绿** — `✔ No ESLint warnings or errors`（仅 Next 16 弃用预告，非本批引入） |
| 3 | 视觉回归 | `npm run test:visual` | **绿** — `2 passed (5.4s)`：agent-canvas + today dashboard 均通过 |

**回归补充核对：**

- `.next/standalone` 产物存在（12:39，晚于产品代码终态 `7d34d00`），**无需重建**，不存在"拿旧产物验新代码"
- `git status --short tests/` 在 test:visual **运行前与运行后均为空** → 基线未被误改写，2 passed 是真实比对通过而非静默重生
- CI 覆盖完整性：HEAD `60c7ef6` 仅改 `progress.json`（`git show --name-status` 实证），属 CI paths-ignore 范围；产品代码与 tests 的最后改动落在 `7d34d00`，而 CI run **29772314482** 的 `headSha` 恰为 `7d34d00a70c...`，conclusion **success**，四个 job（Typecheck / Lint / Build / **Visual regression**）全 success。**HEAD 的全部产品代码均有绿 CI 背书。**

---

## 2. 交叉抽查（防三路结论与实物脱节）

对三份报告各抽 ≥1 条关键 clause 回实物独立复核。**11 项抽查全部与分路报告一致，无一处需要下修。**

### 2.1 A 路抽查（F001 / F002）

| 抽查项 | A 报告断言 | 本轮实测 | 一致性 |
|---|---|---|---|
| dup-scan **P4** SectionLabel 完全归零 | `3 命中/3 文件 → 0` | 复跑脚本：P4 段输出 **「(无命中)」** | ✅ |
| dup-scan **P1/P2/P3/P5** 仅剩组件定义 | P1 4/2、P2 3/1、P3 1/1、P5 1/1 | 复跑逐段实测：P1 = `Badge.tsx:32,33` + `Button.tsx:32,36`（4/2）；P2 = `ChatBubble.tsx:13,16,18`（3/1）；P3 = `DefinitionRow.tsx:21`（1/1）；P5 = `PageHeader.tsx:23`（1/1） | ✅ 逐行号吻合 |
| P1 残留判读（Button 非徽标克隆） | 指纹 `bg-brand-50` 过宽，捕获 Button 自身 solid/ghost 配色 | 实测 `Button.tsx:32` 为 `bg-brand-500 text-white hover:bg-brand-600…`、`:36` 为 `bg-transparent text-brand-500 hover:bg-brand-50…` — 确为 Button variant 配色，与 Badge 药丸无结构关系 | ✅ 判读成立 |
| 术语统一「职责/边界」落位 | `ExpertScope:26,29` + `StagePanel:30,31` 四处 | grep 实测：`copilot/ExpertScope.tsx:26` `label="职责"`、`:29` `label="边界" tone="muted"`；`project/StagePanel.tsx:30` `label="职责"`、`:31` `label="边界" tone="muted"` = 4/4 | ✅ |
| 术语「隔离」UI 层零残留 | UI 组件零残留，仅注释命中 | grep 实测：`ExpertScope.tsx:3` 命中为文件头注释（`duty + isolation 边界`），非渲染文案 | ✅ |

### 2.2 B 路抽查（F003 / F004 / F007）

| 抽查项 | B 报告断言 | 本轮实测 | 一致性 |
|---|---|---|---|
| F003 生产/预览共用同一呈现层 | 消费者恰为 `HandoffCollab:11` 与 `preview:12`，无第二实现 | `grep -rn "HandoffCard" src/` 实测：`HandoffCollab.tsx:11` import + `:58` 使用；`preview/agent-canvas/page.tsx:12` import + `:35` 使用 — **恰 2 个消费者，同一模块路径** | ✅ |
| F003 旧克隆体 `HandoffItem` 已消失 | 全仓命中 0 | `grep -rn "HandoffItem" src/ \| wc -l` → **0** | ✅ |
| F004 P6 克隆消失 | 命中 1 处且唯一落在 `HandoffCard.tsx:48` | dup-scan P6 段实测：唯一命中 `src/components/common/HandoffCard.tsx:48`（1 命中/1 文件） | ✅ |
| F004 hover 语言统一 | P9 命中 2 处且均 `hover:shadow-xl` | dup-scan P9 段实测：`campaigns/page.tsx:22` = `hover:shadow-xl`、`SurfaceCard.tsx:23` = `hover:shadow-xl` — **2/2 同一语言** | ✅ |
| F004 豁免项如实保留 | 手风琴内层 `HandoffCard.tsx:48` 未套 SurfaceCard | 实测该行为 `rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700`，**确未套 SurfaceCard** | ✅ 豁免属实 |
| F007 linux 基线由 CI bot 重生 | `7d34d00` Author/Committer 均 github-actions[bot] | `git show --format=fuller 7d34d00` 实测：Author & Committer 均 `github-actions[bot] <…@users.noreply.github.com>`，msg `chore(visual): update linux baselines [skip ci]`，改 `agent-canvas-linux.png` 117818→117764 与 `en-today-linux.png` 117451→126149 | ✅ 逐字节数吻合 |
| F007 CI 对新基线绿 | run 29772314482 success，headSha = 7d34d00 | `gh run view` 实测：`conclusion=success`，`headSha=7d34d00a70c…`，jobs Typecheck/Visual regression/Build/Lint **全 success** | ✅ |
| F007 基线文件终态 | 4 张 PNG | `ls tests/screenshots/baseline/` 实测 4 张齐全，linux 两张字节数（117764 / 126149）与 `7d34d00` 提交后值一致 | ✅ |

### 2.3 C 路抽查（F005 / F006）

| 抽查项 | C 报告断言 | 本轮实测 | 一致性 |
|---|---|---|---|
| token-scan 全类清零 | 合计 findings 0（六类全 0） | 复跑 `fe-audit-token-scan.mjs`：`dark-pairing 0 / shadow 0 / type-scale 0 / muted-text-token 0`，**合计 findings: 0**；豁免仍为 2 个（AppWrappers / preview 夹具页），理由文本与 FE-AUDIT 时相同 | ✅ 含豁免未被放宽 |
| `text-gray-500` 全仓零残留 | 0 命中 | `grep -rn "text-gray-500" src/ \| wc -l` → **0** | ✅ |
| tailwind 三档命名刻度 | mini 10 / micro 11 / compact 13，纯字符串不绑 line-height | `tailwind.config.js:16-20` 实测：`fontSize: { mini:'10px', micro:'11px', compact:'13px' }` — 三档齐全，**均为纯字符串**（非 `['10px',{lineHeight}]` 形式）→ 像素等价 + 行高无漂移成立 | ✅ |
| F006 组件矩阵六项 | 10 / 2 / 78 / 124 / 1 / 17 | 复跑 `fe-audit-component-matrix.mjs`：`used-as-is 10`、`forked-modified 2`、`unused(dead-in-repo) 78`、`unused(never-ported) 124`、`removed(whitelist) 1`、`self-built 17` — **六项逐值吻合** | ✅ |
| F006 self-built +8 = 新增 common | 8 个新 common 组件 | 矩阵 self-built 清单实测含 `common/` 下 Badge / ChatBubble / DefinitionRow / HandoffCard / PageHeader / PanelHeader / SectionLabel / SurfaceCard 共 8 个新增（另有既有 Button / ComingSoon） | ✅ 差分符合 D4 |
| F006 本批零删除 | `git diff --diff-filter=D 5d25945..HEAD` 为空 | 实测输出行数 **0** | ✅ |
| F006 两份文档存在 | port-guide + inventory 新建 | `ls -la` 实测：`template-port-guide.md`（3400B）、`template-inventory.md`（3546B）均存在 | ✅ |

**抽查结论：** 三路报告的关键 clause 与磁盘实物**零偏差**。分路结论可信，采信入本 signoff。

---

## 3. 逐 Feature 汇总（含关键证据）

### F001 · PASS（A 路，6/6）
- `common/Badge.tsx:6-16` 三 union props 逐字匹配 spec 签名；6 调用点到位；收敛前字面量取证证实 soft/xs 多数派 **3:1**，`campaigns:21`（`px-2 / text-[11px]`）确为离群漂移 → 修复方向正确；solid/sm 与 pill 映射逐 token 无损
- `ChatBubble` 6 重复指纹 → 5 JSX 元素为**正确收敛**（原 `CopilotPanel:77/78` 系同一三元表达式两分支），非缺项；dup-scan P2 3/1 仅剩定义
- `DefinitionRow` 4 处 label 全为「职责」/「边界」，同 commit `f7fc3cf`（本轮 grep 复核 4/4）

### F002 · PASS（A 路，6/6）
- PageHeader 4 处（today:71 / campaigns:14 / ProjectDetail:46 / ComingSoon:24）、SectionLabel 3 处（P4 归零实证）、PanelHeader 2 处
- `Button.tsx:24` `iconOnly?` + `:47-51` 尺寸表 + `:103-105` `rounded-full`；`CopilotPanel:170-179` 已收敛且 `h-8/w-8/bg-brand-500` 保留
- **豁免双时点取证**：`5341d7e` diff 对 HandoffCollab 仅动 SectionLabel；HEAD 上 `ProjectDetail:66` 仍原生 `<button>`，手风琴触发经 F003 迁至 `HandoffCard.tsx:50` 后**仍为原生 `<button>`**，未被 Button 化 → 豁免守住

### F003 · PASS（B 路，8/8，P0）
- `HandoffCard.tsx:10-19` props 逐字段匹配 spec，纯 props 驱动无 fetch
- 容器化到位：`HandoffCollab.tsx:34-46` 只剩 fetch + `:57-66` 列表编排；`HandoffItem` 全仓 0 命中（本轮复核）
- 空态 `:48 if (!loaded || handoffs.length === 0) return null;` 与重构前逐字符相同
- **共用呈现层经 import 图实证**（本轮复核：恰 2 消费者指向同一模块），dark: 变体单一来源，克隆漂移消解

### F004 · PASS（B 路，6/6）
- `SurfaceCard.tsx:14-29` 基类无 shadow-sm/md，`interactive` 附 `transition hover:shadow-xl`
- 5 处收敛全在 `a76a324` diff 中（5/5）；豁免手风琴内层如实保留（本轮复核 `HandoffCard.tsx:48` 未套 SurfaceCard）
- hover 三套语言 → 全仓仅剩 2 处且均 shadow-xl（本轮 P9 复核）
- shadow-sm/md：基线 11 token/10 行 → HEAD **零代码命中**（仅剩 3 条注释），token-scan `shadow` 类 0 findings 交叉印证

### F005 · PASS（C 路，6/6）
- 三档命名刻度到位（本轮复核纯字符串写法）；type-scale 13 → **0**，muted-text-token 11 → **0**
- 计数差异（13→9 用量、11→7 改点）经**逐站点追溯**证实系 F001-F004 组件抽取去重所致，**无一站点漏改**；终态判据（全仓 `text-gray-500` = 0）无条件成立
- **像素等价经 tailwind 3.4.19 编译探针实测**：`text-mini/micro/compact` 与 `text-[10/11/13px]` 产出逐字节等价且均不含 line-height → 无行高漂移
- 检测器可信度经**双向交叉验证**：脚本自 `5d25945` 未被触碰（git 溯源）+ 前批 worktree 复现 34 findings → HEAD 的 0 是代码变了而非检测器失效
- commit `bafd917` 明示 tailwind.config 首次有意偏离（判据 + 理由 + 等价性声明四要素齐全）；`horizon-tokens.md` 同 commit +12 行

### F006 · PASS（C 路，5/5）
- 两份文档新建到位（本轮 `ls` 复核）；port 约定 4 条 + 适配检查清单 8 项 + 用户拍板记录逐字复述 spec §1
- **78 条登记表 × 矩阵实测双向集合比对三项全空**（未登记 0 / 幻影 0 / 重复 0）= 完全双射；正确区分 `componentsrtl/SidebarCard` 与 `components/SidebarCard`
- 矩阵差分 = 「新增 common 组件 + 克隆消失」，与 spec D4 预期完全吻合（本轮六项逐值复核）
- 全批次零删除（本轮复核 0）；`652ea1d` 零 `src/` 改动

### F007 · PASS（B 路，7/7）
- route mock：`dashboard.spec.ts:9-22` 全字段定值夹具，`:25-27` 在 goto 前挂载；`:32` `waitFor('协同交接')` 使容器再渲染 null 时**硬失败而非静默留白**
- 单次重生：darwin 两张在 `9df773e`（唯一一次 darwin 改写），linux 两张在 `7d34d00`；F001-F005（`f7fc3cf`..`bafd917`）全部早于二者，期间无基线 commit
- **CI bot 重生 + CI 绿双实证**（本轮复核 `git show --format=fuller` 与 `gh run view`，headSha 精确匹配）
- 4 张 PNG 逐张人查：变更 100% 可归因至拍板项或其必然副产品；无区块删除 / 无语义替换 / 无字段图标链接变化 / 无深浅色误切
- **BL-FE-11 闭环决定性证据**：旧 `en-today-linux.png` 在 agent 气泡下方为**一片空白**（CI 无 DB → HandoffCollab 恒 null，基线静默编码空区域），新基线该处出现完整「协同交接」卡 → **生产 HandoffCollab 视觉回归覆盖由零变为有**，与 F003 P0 目标闭合

---

## 4. 未变更范围

| 事项 | 说明 |
|---|---|
| `admin/` 模板组件（124 never-ported） | 拍板「逐个 port」，本批只落约定不批量 port |
| 78 个 dead-in-repo 组件 | 本批只登记不删除（F006 acceptance 明列） |
| `HandoffCollab:29` / `preview:25` 手风琴内层 | spec §2 F004 豁免（F001 报告 §4：嵌套小表面不宜硬套模板 Card） |
| `HandoffCollab:30` 手风琴触发 / `ProjectDetail:67` tab | spec §2 F002 豁免（语义不同控件，不塞进 Button） |
| BL-FE-12 深色持久化 | 留池，价值未证 |
| Chakra 原语 / 模板 identical 文件 | 既定架构，不在本批口径 |

---

## 5. 预期影响（前批 `5d25945` → HEAD）

| 指标 | 改动前 | 改动后 |
|---|---|---|
| dup-scan P1 Badge | 9 命中 / 7 文件 | 4 / 2（仅组件定义 + Button 自身配色） |
| dup-scan P2 ChatBubble | 6 / 2 | 3 / 1（仅定义） |
| dup-scan P3 DefinitionRow | 4 / 2 | 1 / 1（仅定义） |
| dup-scan P4 SectionLabel | 3 / 3 | **0（完全归零）** |
| dup-scan P5 PageHeader | 4 / 4 | 1 / 1（仅定义） |
| dup-scan P6 HandoffCard | 克隆并存 | 1 / 1（克隆消失） |
| dup-scan P9 hover 语言 | 三套语言 | 2 处，**均 hover:shadow-xl** |
| token-scan findings 合计 | **34** | **0** |
| ├ shadow | 10 | 0 |
| ├ type-scale | 13 | 0 |
| └ muted-text-token | 11 | 0 |
| self-built 组件 | 9 | **17**（+8 common） |
| dead-in-repo | 78（无登记） | 78（**四分类全登记**） |
| 生产 HandoffCollab 视觉回归覆盖（CI/linux） | **零**（恒渲染 null，基线编码空白） | **有**（route mock 填充态入基线） |

---

## 6. 类型检查 / CI

```
$ npx tsc --noEmit
EXIT=0   （零输出）

$ npx next lint
✔ No ESLint warnings or errors
（仅 `next lint` is deprecated … Next.js 16 迁移预告）

$ npm run test:visual
Running 2 tests using 2 workers
  ✓  2 [chromium] › tests/visual/agent-canvas.spec.ts:6:5 › agent canvas visual baseline (3.5s)
  ✓  1 [chromium] › tests/visual/dashboard.spec.ts:24:5 › today dashboard visual baseline (4.0s)
  2 passed (5.4s)
$ git status --short tests/     →  （空，基线未被误改写）

$ gh run list --limit 3 --branch main
success   7d34d00   CI                                    ← 产品代码终态，四 job 全绿
success   42d7d75   test(FE-REFACTOR-F007): …
success   42d7d75   test(FE-REFACTOR-F007): …

$ gh run view 29772314482
conclusion = success   headSha = 7d34d00a70c…
jobs: Typecheck ✓  Lint ✓  Build ✓  Visual regression ✓
```

> HEAD `60c7ef6` 仅改 `progress.json`（paths-ignore），故无独立 CI run —— 产品代码与 tests 的终态 `7d34d00` 已被上述 run 全绿覆盖，**CI 背书无缺口**。

---

## 7. L2 实测记录

**无 staging 影响 — N/A。** 本批为纯前端组件层重构 + 文档 + 视觉基线，不触及外部服务 / 计费 / 生产写入，无 L2 项需授权执行。视觉验证使用 route mock，不依赖 DB。

---

## 8. Ops 副作用记录

**本批次无数据库 ops。** 三路验收与本汇总均未执行任何 SQL；F007 route mock 决策的动因之一即"零种子维护"（spec §2 F007）。

---

## 9. Soft-watch（不阻塞 done，需后续跟进）

三路观察项如实归集，**均不构成 FAIL/PARTIAL**，按处置归属分列：

| ID | 来源 | 描述 | 风险 | 处置建议归属 |
|---|---|---|---|---|
| **S1** | B-OBS-3 | **视觉断言容忍带过宽**：`maxDiffPixelRatio: 0.02` ≈ 29,700px（本轮复核实证：`agent-canvas.spec.ts:12` 与 `dashboard.spec.ts:35` 均为 0.02）。本批 en-today 全部有意改动仅 **1.53%(darwin)/1.44%(linux)**，**低于阈值** → 含"协同交接卡整块出现/消失"这一 1.44% 量级事件在内的变更**不会被 test:visual 判红**。盲区从"数据侧"消除了，"断言灵敏度侧"仍有 ~2% 静默带，与 F003/F007 目标存在张力 | **中** | **backlog 候选**（下批收紧阈值，如 `maxDiffPixels: 1500` 或 ratio 0.001 + 抗抖动手段）。非本批 acceptance 覆盖项，为 CICD-VPS F004 遗留配置 |
| **S2** | C-OBS-1 | **spec 文本自相矛盾**：spec §2 F006 与 features.json 写「**65** dead 组件」，但其四分类子项 13+6+25+34 = **78**。溯源 FE-AUDIT-F001 §6：78 − 13(RTL 白名单) = 65。实现方登记全部 78 个，是 acceptance 的**严格超集** | 低 | **Planner done 阶段**：把 spec「65」订正为「78（含 13 白名单）」，避免后续批次引用二次困惑 |
| **S3** | C-OBS-2 | **工作树批次外未提交变更**：` D docs/dev/architecture.md`（未提交删除）+ 3 个未跟踪文件（`docs/audits/…-2026-07-17.md`、`architecture_f5.md`、`architecture_kimi.md`）。会话起点即存在，非本批 commit 产生。但 **`CLAUDE.md` 明确引用 `docs/dev/architecture.md`**，删除且未提交是文档一致性隐患 | 低-中 | **Planner done 阶段**处置（决定是替换为 f5/kimi 版本、恢复、还是同步更新 CLAUDE.md 引用） |
| **S4** | B-OBS-2 | **边框 token 归一未在 D2 拍板枚举中列名**：TodoRow `border-gray-100`→`gray-200`（`#EEF0F6`→`#DADEEC`）、dark `white/5`→`white/10`；ExpertScope 由「左侧 4px brand 条 + shadow-sm」→「四边 gray-200 边框 + 左侧 brand 条」；随之 ±2px 位移与一处摘要断行位移。属 F004 acceptance 4.2 必然结果且 commit 已声明 | 低 | **Planner done 阶段追认入拍板记录**，使 spec D2 清单与实际基线一致 |
| **S5** | B-OBS-1 | 预览页 `StaticHandoffCard` **包装函数**仍在（`page.tsx:23-46`，本轮 grep 复核确认存在）。内部已无手抄卡片 markup，但外层容器 chrome（SurfaceCard + SectionLabel + MdGroups + 标签串「协同交接 · 多 Agent 联动 · 点开看交接」）与 `HandoffCollab.tsx:51-55` 逐字重复。spec §2 F003 只要求**单卡呈现层**共用，容器 chrome 未列入收敛范围 | 低 | **backlog 候选**（二次收敛）。当前风险：改标签文案需两处同步 |
| **S6** | A-OBS-1 | ComingSoon 副标题 `mt-2`→`mt-1`（4px 收紧），由 `PageHeader.tsx:27` 统一渲染。commit message 已主动披露，性质同 campaigns:21「漂移→canonical」（today/campaigns/ProjectDetail 三处 canonical 均为 mt-1） | 低 | 已入基线，无需动作；随 S4 一并追认即可 |
| **S7** | A-OBS-3 | F002 commit message 事实性小误：称两处 PanelHeader「字面量完全相同」，实测 `preview/agent-canvas:55` 克隆体**缺 `dark:text-white`**。统一后 `PanelHeader.tsx:19` 已补齐 → **实质是 dark 漂移修复（净收益）**，仅描述不精确 | 低 | 记录备查，无需动作 |
| **S8** | A-OBS-4 | 旧术语「隔离」UI 组件层零残留；唯一命中 `src/lib/agent/registry.ts:28` 为**不渲染的 JSDoc 注释**（本轮复核 `ExpertScope.tsx:3` 同属注释），不在 F001 术语 clause 的 UI 口径内 | 低 | 可留待后续顺手清理 |

> **A-OBS-2 / B-OBS-4（发送按钮 disabled 透明度 40→50 + 新增 dark 变体 / focus-visible / aria-label）** 两路指向同一事实，已在 F002 范围内经 A 路判 PASS（commit message 已披露；焦点环与 aria-label 属无障碍净收益；dark 变体属克隆漂移归一）。不单列 Soft-watch。

---

## 10. Framework Learnings

### 新规律
- **「0 findings」必须配检测器活性证明才可采信。** C 路的做法值得固化为 Evaluator 标准动作：脚本未被篡改（`git log -- <script>` 溯源）+ 前批基线复现（read-only worktree 跑同一脚本复现旧 findings 数）+ 终态判据（全仓 grep = 0）三道交叉，把"真的修干净了"与"检测器死了/豁免被放宽"区分开。
  - 来源：FE-REFACTOR F005（34 findings → 0）
  - 建议写入：`framework/harness/evaluator.md` 或 `framework/patterns/testing-env-patterns.md`

- **acceptance 计数与实测用量不符时，先做逐站点追溯再判定。** 本批出现三次"数字对不上"（Badge 6 处 → 5 JSX、type-scale 13 → 9、gray-500 11 → 7），全部证实为**上游 feature 组件抽取去重的正确收敛**而非漏改。判据应落在**终态**（全仓 grep = 0 / dup-scan 归零），而非过程计数。
  - 来源：FE-REFACTOR F001 §2.2、F005 §2.2
  - 建议写入：`framework/harness/evaluator.md`

### 新坑
- **视觉基线的"容忍带静默"是双向的坑。** `--update-snapshots` 默认 `changed` 模式在容忍内静默不改写（building 期已踩，`42d7d75` 改 `=all` 修复）；同一 `maxDiffPixelRatio: 0.02` 也让**整块 UI 出现/消失**（1.44%）不判红。两者同源：阈值既管重生也管断言。建议视觉回归配置**重生用 all、断言用紧阈值**，并在引入视觉测试时即校准阈值与页面典型改动量级的比例。
  - 来源：FE-REFACTOR F007 building 踩坑 + B-OBS-3
  - 建议写入：`framework/README.md` §经验教训 / `framework/patterns/web-runtime-patterns.md`

- **纯 CI 环境的"空数据渲染 null"会被基线静默编码为合法空白。** linux 基线曾把 HandoffCollab 的空区域固化为"正确"，使该组件视觉回归覆盖长期为零且无人察觉。route mock 固定夹具 + `waitFor(关键文案)` 硬断言是有效解法（渲染 null 时超时硬失败而非静默留白）。
  - 来源：BL-FE-11 / FE-REFACTOR F003+F007
  - 建议写入：`framework/patterns/web-runtime-patterns.md`

### 模板修订
- 无。

---

## 11. Harness 说明与验收边界自证

- 本批改动经 Harness 状态机流程交付；本轮为 **verifying 首轮**，7/7 首轮 PASS，**fix_rounds 保持 0**，无需进入 fixing/reverifying
- 建议编排者：`progress.json` status → `done`，`docs.signoff` → `test-reports/FE-REFACTOR-signoff-Andy-evaluator-subagent.md`
- **未修改任何产品代码**：`src/`、`prisma/`、`tailwind.config.js`、`tests/`、配置与文档基线一律未动；`git status --short` 与本轮起点逐行一致（仅 S3 所述 4 项既有变更 + 三份分路报告）
- **未改写三份分路报告原文**；**未写入任何状态机 JSON**（`progress.json` / `features.json` / `backlog.json` 未触碰）
- **未创建临时 worktree**；`npm run test:visual` 运行后 `git status --short tests/` 为空
- 本报告为本轮唯一新增文件
- 结论仅依据磁盘实物（源码、`git show`/`git log`、grep、三脚本输出、`gh run view`、tsc/lint/playwright 运行结果），未采信任何转述

---

*署名：Andy/evaluator-subagent — 隔离上下文验收，结论原样落盘，不受协商。*
