# FE-REFACTOR 验收报告 — C 路（F005 token 层 / F006 port 约定+库存登记）

> **批次：** FE-REFACTOR（普通批次，verifying 首轮）
> **验收范围：** F005、F006（其余 feature 由 A/B 路 subagent 负责，本报告不评分）
> **验收人：** Andy/evaluator-subagent（隔离上下文，fresh context）
> **验收时间：** 2026-07-20
> **被验对象：** HEAD = `60c7ef6`；F005 = `bafd917`，F006 = `652ea1d`
> **口径来源：** `docs/specs/FE-REFACTOR-spec.md` §2 F005/F006 + §4，`features.json` acceptance
> **产物边界：** 本次验收未修改任何产品代码（`git status` 与会话起点一致，见 §6）

---

## 0. 结论速览

| Feature | 判定 | clause 达成 |
|---|---|---|
| **F005** 设计 token 层：微排版命名刻度 + gray-600 统一 | **PASS** | 6/6 |
| **F006** admin/ port 约定文档 + dead 组件登记表 | **PASS** | 5/5 |

两条 feature 均为首轮 PASS，无 PARTIAL / FAIL 项。§5 记录 2 条不影响判定的观察项（其中 1 条为 spec 文本自相矛盾，建议 done 阶段由 Planner 修订）。

---

## 1. 验收方法（为何这些证据可信）

本报告刻意避免「跑一次脚本得 0 就判过」的弱验证。0 findings 有两种成因——**真的修干净了**，或**检测器死了/豁免被放宽**。三道交叉验证把二者区分开：

1. **脚本未被篡改**（git 溯源）：`fe-audit-token-scan.mjs` 与 `fe-audit-component-matrix.mjs` 自 FE-AUDIT 收官 commit `5d25945` 起未被任何 FE-REFACTOR commit 触碰
   ```
   git log --oneline 5d25945..HEAD -- scripts/test/fe-audit-token-scan.mjs   → 空
   git log -1 --format='%h' -- scripts/test/fe-audit-token-scan.mjs          → 5d25945
   ```
   ⇒ 豁免表 / 词表 / 阈值与产出 34 findings 的那一版逐字节相同，不存在「改口径换绿灯」。

2. **前批基线复现**（read-only worktree）：把同一脚本跑在 FE-REFACTOR 之前的树上，精确复现 34 findings
   ```
   git worktree add -f /tmp/fe-pre 5d25945 && node scripts/test/fe-audit-token-scan.mjs
   → shadow 10 · type-scale 13 · muted-text-token 11 · 合计 34
   ```
   ⇒ 检测器在**本仓库、本代码**上被证明是活的；HEAD 的 0 是代码变了，不是检测器瞎了。（worktree 已 `--force` 移除，无残留）

3. **像素等价实测**（不靠承诺，靠编译产物）：用项目自带 tailwind 3.4.19 编译探针，比对命名刻度与 arbitrary 值的真实 CSS 输出（详见 §2.3）。

---

## 2. F005 逐条验收

### 2.1 clause 对账表

| # | acceptance clause | 判定 | 实物证据 |
|---|---|---|---|
| 1 | `tailwind.config.js` 定义命名字号刻度覆盖 10/11/13px 三档 | **PASS** | `tailwind.config.js` `theme.extend.fontSize` = `{ mini:'10px', micro:'11px', compact:'13px' }`，三档齐全且附 6 行意图注释 |
| 2 | 替换 13 处 `text-[Npx]`（跨 9 文件） | **PASS** | 前批基线 type-scale **13 处**（worktree 复现），HEAD **0 处**；13 个原始站点全部经 F001-F004 收敛后由 common 组件承载（逐站点对账见 §2.2） |
| 3 | 11 处 `text-gray-500` → `gray-600` | **PASS** | 前批基线 muted-text-token **11 处**，HEAD **0 处**；`grep -rn "text-gray-500" src/ app/` → **0 命中**（全仓零残留，含豁免文件） |
| 4 | commit message 明示 tailwind.config 首次有意偏离及理由 | **PASS** | `bafd917` message 首行段落：【tailwind.config.js 首次有意偏离模板逐字节同】+ 判据（模板 <15px 0 次）+ 理由（M0.5 六页各写各的、刻度无法统一调整）+ 等价性声明，四要素齐全 |
| 5 | `horizon-tokens.md` **同 commit** 补命名刻度表 | **PASS** | `git show --stat bafd917` 含 `design-draft/horizon-tokens.md`（+12 行）；§7 表与配置逐值一致（对账见 §2.4） |
| 6 | lint + tsc 绿 | **PASS** | `npx tsc --noEmit` 退出 0 零输出；`npx next lint` → `✔ No ESLint warnings or errors` |

### 2.2 clause 2 的计数差异——已查证为「收敛」而非「遗漏」

commit message 自述「聚焦 6 文件 10 处」，实测 HEAD 命名刻度用量为 **9 处 / 6 文件**，与 acceptance 的「13 处 / 9 文件」均不等。这是本条最需要排除的假阳性，故逐站点追溯 FE-AUDIT F003 §4.5 表的全部 13 个原始站点：

| 原始站点（§4.5） | 值 | 现归属 | 现写法 |
|---|---|---|---|
| `CopilotPanel:77,78,148,161` ×4 | 13px | `common/ChatBubble`（3 常量） | `text-compact` |
| `CopilotPanel:105` | 11px | `CopilotPanel:97` | `text-micro` |
| `CopilotPanel:215` | 11px | `common/PanelHeader:23` | `text-micro` |
| `KolResultCards:59` | 10px | `KolResultCards:64` | `text-mini` |
| `KolResultCards:86` | 11px | `KolResultCards:99` | `text-micro` |
| `ExpertScope:18` | 10px | `common/Badge:23` | `text-mini` |
| `HandoffCollab:52` | 11px | `common/HandoffCard:73` | `text-micro` |
| `StagePanel:24` | 10px | `common/Badge:23` | `text-mini` |
| `today:29` | 10px | `common/Badge:23` | `text-mini` |
| `campaigns:21` | 11px | `common/Badge:23` | `text-mini`（尺寸漂移一并归一） |

13 → 9 的收缩全部由 **F001-F004 的组件抽取去重**贡献（4 处 13px 气泡塌缩为 3 个 ChatBubble 常量；4 处徽标站点塌缩为 1 个 Badge 分支）。已通过 `grep -n "Badge\|DefinitionRow\|SectionLabel\|HandoffCard"` 逐文件确认 ExpertScope / StagePanel / today / campaigns / HandoffCollab 均已 import 并使用对应 common 组件。**无一站点被漏改或被静默丢弃。**

同理 clause 3 的 commit 自述「7 处」vs acceptance「11 处」：11 个原始站点中 4 个（`campaigns:13`、`today:45,47`、`ProjectDetail:50`、`StagePanel:35`、`ExpertScope:28`、`HandoffCollab:84` 等）已在 F001/F002 抽取时并入 `PageHeader` / `SectionLabel` / `DefinitionRow`，F005 只需改组件内单点。终态判据（全仓 `text-gray-500` = 0）无条件成立，故判 PASS。

### 2.3 「纯 font-size / 像素等价」——编译产物实测

acceptance 与 commit 均声称「仅设 font-size 不绑 line-height，与被替换值像素等价」。这一点若为假，会导致**全站微字号行高静默漂移**且视觉基线已被 F007 重生固化，属高危项，故不接受声明，直接编译比对：

```
# 项目自带 tailwindcss 3.4.19 编译探针
.text-compact { font-size: 13px }        .text-\[13px\] { font-size: 13px }
.text-micro   { font-size: 11px }        .text-\[11px\] { font-size: 11px }
.text-mini    { font-size: 10px }        .text-\[10px\] { font-size: 10px }
# 对照组（内建刻度会绑 line-height）：
.text-xs      { font-size: 0.75rem; line-height: 1rem }
```

命名刻度与被替换的 arbitrary 值**产出规则逐字节等价**，且均不含 `line-height`——与内建 `text-xs` 的行为差异正是配置写「纯字符串」而非 `['10px', {lineHeight:...}]` 的必要条件。**像素等价成立，行高无漂移。**

### 2.4 horizon-tokens.md §7 与配置一致性

`design-draft/horizon-tokens.md:82` §7「微排版命名刻度（FE-REFACTOR F005 新增，项目扩展）」含：三行刻度表（`text-mini` 10px / `text-micro` 11px / `text-compact` 13px，各附用途与承载组件）+ 判据（模板 <15px 0 次）+ 禁令（禁止散落 arbitrary 值）+ 偏离声明。**三档值与 `tailwind.config.js` 逐值一致**，且用途列与实际用量（Badge/PanelHeader/ChatBubble）相符。

### 2.5 全域回归确认

`node scripts/test/fe-audit-token-scan.mjs` on HEAD：**合计 findings 0**（hardcoded-color / font-family / dark-pairing / shadow / type-scale / muted-text-token 六类全 0，扫 42 文件，豁免 2 个且豁免理由与 FE-AUDIT 时相同）。F005 目标的 §4.5 + §4.6 共 24 处**清零**，且未在其他四类引入新偏离。

残留的 18 处 `text-[Npx]` 全部位于模板继承目录（`sidebar/` `navbar/` `rtl/` `card/` `dataDisplay/` `auth/`），最小值 `text-[24px]`，**无一落在 <15px 区间**，属模板原件不在本批口径内；`src/app/admin/campaigns/page.tsx:24` 的 `text-[11px]` 唯一命中为 F001 的**注释文本**（`{/* …修复 px-2/text-[11px] 尺寸漂移 */}`），非 class。

**F005 判定：PASS（6/6 clause）**

---

## 3. F006 逐条验收

| # | acceptance clause | 判定 | 实物证据 |
|---|---|---|---|
| 1 | 新建 `docs/dev/template-port-guide.md`（port 约定 + 适配检查清单 + 用户拍板记录） | **PASS** | 文件存在（`652ea1d` 新增）。拍板记录见首段引用块，逐字复述 spec §1「逐个 port、保留模板结构」含"逐个"的释义；§2 四条 port 约定；§3 适配检查清单 **8 项** |
| 2 | 新建 `docs/dev/template-inventory.md`，按四分类登记 | **PASS** | 文件存在。A 白名单 RTL 13 / B 认证储备 6 / C M0.5 候选 25 / D demo 专用 34，四类齐备且各附处置建议 |
| 3 | 分类数量与实物对账（13/6/25/34 = 78） | **PASS** | 复跑矩阵脚本 `dead-in-repo = 78`；登记表与实测清单**双向集合比对零差异**（见 §3.1） |
| 4 | 本批不删任何组件 | **PASS** | `git diff --diff-filter=D --name-only 5d25945..HEAD` → **空**（全批次零删除）；矩阵 `dead-in-repo` 前后均为 78，`removed(whitelist)` 前后均为 1，未增 |
| 5 | 不改产品代码 | **PASS** | `git show --name-status 652ea1d` → 仅 `A docs/dev/template-inventory.md`、`A docs/dev/template-port-guide.md` + 状态机 JSON（features/progress），**零 `src/` 改动** |

### 3.1 登记表 × 实测清单双向集合比对（本条最强证据）

「数量对得上」不等于「条目对得上」——78 = 78 也可能同时存在漏登 1 个、错登 1 个。故把登记表 78 个条目全部展开为路径集合，与脚本实测集合做**双向差集**：

```
registry count: 78   dead count: 78
=== 在实测 dead 清单但未登记 ===   （空）
=== 已登记但不在实测 dead 清单 === （空）
=== 登记表内部重复项 ===           （空）
```

**三项全空 = 完全双射**：无漏登、无幻影条目、无重复计数。特别确认了一处易混淆点——`sidebar/componentsrtl/SidebarCard.tsx`（A 组 RTL）与 `sidebar/components/SidebarCard.tsx`（D 组模板推广卡）为两个不同文件，登记表正确区分且未重复计入。

### 3.2 矩阵前后差分符合 spec D4 预期

| 指标 | 前批（5d25945） | HEAD | 差分解读 |
|---|---|---|---|
| used-as-is | 10 | 10 | 无变化 ✓ |
| forked-modified | 2 | 2 | 无变化 ✓ |
| unused(dead-in-repo) | 78 | 78 | **未删任何模板组件** ✓ |
| unused(never-ported) | 124 | 124 | 本批只落约定不批量 port，符合拍板 ✓ |
| removed(whitelist) | 1 | 1 | 无新删除 ✓ |
| self-built | 9 | **17** | +8 = F001-F004 新增 common 组件（Badge/ChatBubble/DefinitionRow/PageHeader/PanelHeader/SectionLabel/HandoffCard/SurfaceCard） |

差分 = 「新增 common 组件 + 克隆消失」，与 spec §3 D4 对矩阵变化的预期**完全吻合**，无计划外增删。

### 3.3 文档内引用数据的准确性抽查

port-guide 与 inventory 中引用的量化断言逐条对实测：

- port-guide §1「模板 `admin/` 下 **124 个**页面级组件，项目当前一个未 port」→ 矩阵 `never-ported = 124` ✓
- port-guide §1 / inventory 标题「dead-in-repo **78** 个」→ 矩阵实测 78 ✓
- inventory C 组「`card/MiniStatistics` 已实测全仓零引用，用到 stat 卡先复用它」→ 该文件确在 dead 清单内 ✓
- port-guide §3 检查清单与本批已落地约定互洽：微字号项引用 F005 命名刻度、shadow 项引用 F004 `hover:shadow-xl` 拍板 ✓（文档未与同批次决策脱节）

**F006 判定：PASS（5/5 clause）**

---

## 4. L1 基础设施复证

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | **绿**（退出 0，零诊断） |
| `npx next lint` | **绿**（`✔ No ESLint warnings or errors`；仅有 Next 16 弃用提示，非错误） |
| `node scripts/test/fe-audit-token-scan.mjs` | **0 findings**（六类全清） |
| `node scripts/test/fe-audit-component-matrix.mjs` | 78/124/10/2/1/17，与登记表双射 |

无环境误报（对照 `framework/patterns/testing-env-patterns.md`：本路验收不涉及 prisma generate / DB 连接 / RLS 视角，纯静态检查与编译，无 L2 依赖）。

**[L2]** 本路无 L2 项（F005/F006 不触及外部服务 / 计费 / 生产写入）。

---

## 5. 观察项（不影响 F005/F006 判定）

**OBS-1 — spec 文本自相矛盾：「65」vs 四分类和「78」（建议 Planner 在 done 阶段修订 spec，非实现缺陷）**

`features.json` F006 acceptance 与 spec §2 F006 写「**65** dead 组件四分类登记（RTL 13 / 认证储备 6 / M0.5 候选 ~25 / demo 专用 ~34）」——但其自身四分类子项相加 13+6+25+34 = **78**，与标题的 65 不一致。溯源 `FE-AUDIT-F001` 报告 §6 第 80 行：dead-in-repo 实为 78，「其中 13 为 D6.4 白名单 RTL → **实际 65**」，即 65 = 78 − 13(RTL)。

实现方选择登记**全部 78 个**（把 13 个 RTL 白名单也显式登记为 A 组），是 acceptance 要求的**严格超集**，且与四分类子项数完全吻合。判 PASS 无争议；仅建议 done 阶段把 spec 的「65」订正为「78（含 13 白名单）」，避免后续批次引用时二次困惑。

**OBS-2 — 工作树存在与本批无关的未提交变更（批次外，仅告知）**

`git status` 显示 ` D docs/dev/architecture.md`（未提交删除）及 3 个未跟踪文件（`docs/audits/KOLMatrix-integrated-architecture-design-2026-07-17.md`、`docs/dev/architecture_f5.md`、`docs/dev/architecture_kimi.md`）。**该状态在本次验收会话起点即已存在**，非 F005/F006 commit 产生（两个 commit 的 `--name-status` 均不含这些路径），亦不在本路验收范围。但 `CLAUDE.md` 明确引用 `docs/dev/architecture.md`，其被删除且未提交是一处文档一致性隐患，建议 Planner 在 done 阶段一并处置。

---

## 6. 验收边界自证

- **未修改任何产品代码**：`git status --short` 输出与会话起点逐行一致（仅 OBS-2 的 4 项既有变更），`src/` `prisma/` `tailwind.config.js` 等零改动
- **未写入状态机 JSON**：未触碰 `progress.json` / `features.json` / `backlog.json`
- **临时产物已清理**：验证用 worktree `/tmp/fe-pre` 已 `git worktree remove --force`（`git worktree list` 仅剩主树）；探针文件建在 `/tmp/twcheck/`，仓库外
- **本报告为本路唯一新增文件**：`docs/test-reports/FE-REFACTOR-verify-C-Andy-evaluator-subagent.md`

---

## 7. 结构化结论

```json
{
  "F005": {
    "verdict": "PASS",
    "clauses_passed": 6,
    "clauses_total": 6,
    "notes": "34→0 findings 经同脚本前批基线复现交叉验证；像素等价经 tailwind 编译产物实测"
  },
  "F006": {
    "verdict": "PASS",
    "clauses_passed": 5,
    "clauses_total": 5,
    "notes": "78 条登记表与矩阵实测双向集合比对零差异；全批次零删除；spec「65」文本瑕疵见 OBS-1"
  }
}
```

_验收人：Andy/evaluator-subagent · 隔离上下文 · 2026-07-20_
