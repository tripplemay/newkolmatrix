# FE-AUDIT Signoff 2026-07-20

> 状态：**Evaluator 验收通过**（progress.json status=verifying → 建议置 done）
> 触发：GO-LIVE 收官、`newkol.guangai.ai` 已上线；在 ARCH-LOCK + M0.5 六页工作台开工前，用户要求先审计前端地基
> 署名：**Andy/evaluator-subagent**（隔离上下文，fresh context）

---

## 变更背景

本批次为 **Evaluator-only 审计批次**（4 条 feature 全 `executor:evaluator`，状态流转 `planning → verifying → done`，跳过 building）。

审计回答用户提出的三个问题：

1. 前端是否严格按照 Horizon UI Pro 模板实现
2. 是否存在模板已提供组件、但项目仍手写重复实现的内容
3. 该抽取的公共组件是否已全部抽取

**审计不修改任何产品代码**（spec §4 D1/D7）。发现的问题全部进报告分级，整改留给后续批次。

**编排形态：** 快车道同会话，verifying 阶段 fan-out —— F001/F002/F003 三路并行隔离 evaluator subagent，F004 依赖前三份报告故串行汇总（spec §4 D5）。

---

## 变更功能清单

### F001：模板组件对照审计（手写重复实现清单）

**Executor：** evaluator

**文件：**
- `scripts/test/fe-audit-component-matrix.mjs`（新增，扫描脚本）
- `docs/test-reports/FE-AUDIT-F001-Andy-evaluator-subagent.md`（新增，报告）

**改动：**
对照 Horizon UI Pro 3.0.0 模板原件（只读）产出模板组件 × 项目使用状态矩阵。方法学采用**从 `src/app/**` 出发的 import 图传递可达性分析**，而非朴素 grep —— 二者差异显著（19 vs 12 个「在用」组件，7 个为被死代码引用的伪存活）。

**验收标准与结果：**

| # | Acceptance clause | 结果 | 实物证据 |
|---|---|---|---|
| 1 | 矩阵四类，覆盖模板 `src/components/` 全目录 | ✅ 达成 | F004 复跑脚本：215 模板 tsx / 99 项目 tsx；used-as-is 10 / forked 2 / dead 78 / never-ported 124 / removed 1 / self-built 9；`10+2+78+124+1=215` 模板侧闭合，`10+2+78+9=99` 项目侧闭合 |
| 2 | 手写重复项含 文件:行 + 模板对应组件路径 + 替换建议与风险 | ✅ 达成 | §4 七条卡片表面全含三要素；F004 抽 5 条 `sed -n` 逐行比对，class 串逐字符相符 |
| 3 | forked 组件附 diff 摘要 | ✅ 达成 | §3 两个 fork（`navbar/index`、`sidebar/index`）逐行归因，全部为品牌替换 + 已记录 DS-FOUNDATION 决策；脚本独立确认 forked 集合恰为这 2 个 |
| 4 | 所有结论附可复核证据 | ✅ 达成 | 脚本 F004 已复跑数字一致；grep 命令 F004 已重跑 |
| 5 | 白名单（spec §4 D6）项不计 finding | ✅ 达成 | §7 明列 4 类剔除项；`map/MapComponent`、13 个 RTL 相关均未入 finding |
| 6 | 报告落位 | ✅ 达成 | 文件存在 |

**判定：PASS**

---

### F002：公共组件抽取完备性审计

**Executor：** evaluator

**文件：**
- `scripts/test/fe-audit-dup-scan.sh`（新增，扫描脚本）
- `docs/test-reports/FE-AUDIT-F002-Andy-evaluator-subagent.md`（新增，报告）

**改动：**
扫描 27 个 tsx（15 页面 + 3 布局 + 9 自建组件）中出现 ≥2 次的重复 UI 模式，识别 8 条模式 / 30 处，产出 8 个建议抽取的公共组件（R1-R8，含 TS props 签名与落位）。严格执行 ≥2 次阈值纪律：单次出现（3 条）与零出现（3 类）均不计 finding 并说明。

**验收标准与结果：**

| # | Acceptance clause | 结果 | 实物证据 |
|---|---|---|---|
| 1 | 扫描 15 页面 + 自建组件中 ≥2 次重复模式 | ✅ 达成 | 27 文件入扫，10 组指纹，8 条 ≥2 次模式 / 30 处 |
| 2 | 逐条列出现位置 文件:行 | ✅ 达成 | §3 全条附 文件:行；F004 逐行验证 D3 四行 —— 前 3 行逐字节相同、第 4 行 `px-2`/`text-[11px]` 漂移，均属实 |
| 3 | 公共组件清单：命名 + 落位 `src/components/common/` + props 签名 | ✅ 达成 | §5 R1-R8 均含 TS interface 与落位路径 |
| 4 | 按 复用次数 × 改造成本 排优先级 | ✅ 达成 | §6 八条排序表，含成本口径定义与 Top 3 点名 |
| 5 | 报告落位 | ✅ 达成 | 文件存在 |

**判定：PASS**（5/5 clause）

**⚠ 附带结论更正（不影响 acceptance 判定）：**
F002 §7「做对的部分」第 1 条中的分句「**未出现手写卡片外框**」经 F004 复核**推翻** —— 与 F001-03（7 处手写卡片表面）、F003 §4.4（7 处自写卡片语言分叉）及 F004 独立 grep（自建域 11 处 `rounded-*` + `bg-white` 表面）三方冲突。

- 该分句**不属任何 acceptance clause**，位于附加的正面观察章节
- 其涉及的债已由 F001-03 与 F003 §4.4 完整记账，并在 **BL-FE-05** 中合并承接 → **无债务遗漏**
- 同章节第 2 条「未见页面内手写按钮 class 串」：字面限定「页面内」（`src/app/**`）时成立，但自建**组件**中存在 3 处手写 `<button>`（F001-04 已记账）→ 判为**表述易误导，予以限定**，不推翻
- 附带小订正：F001 记 Card 被 5 处复用（含 `ComingSoon.tsx:3`），F002 记 4 处（漏记）。F004 实测活代码域 5 处，**以 F001 为准**

更正已在 F004 汇总报告 §2.2 显著记录。**F002 原报告未被修改**（Evaluator 不改他人已落盘结论，只在汇总层记更正）。

---

### F003：设计系统一致性审计（tokens / 样式偏离）

**Executor：** evaluator

**文件：**
- `scripts/test/fe-audit-token-scan.mjs`（新增，扫描脚本，Node ≥18 零依赖）
- `docs/test-reports/FE-AUDIT-F003-Andy-evaluator-subagent.md`（新增，报告）

**改动：**
对照 `design-draft/horizon-tokens.md` + `tailwind.config.js` + `AppWrappers.tsx` 扫描 tokens 偏离。先按模板原件逐字节分类（115 identical / 9 forked / 50 new），只审计项目引入的行，避免把模板自己的写法当成项目的债。产出 34 findings（P1 23 / P2 11，P0 = 0）。

**验收标准与结果：**

| # | Acceptance clause | 结果 | 实物证据 |
|---|---|---|---|
| 1 | 对照三源（horizon-tokens.md + tailwind.config.js + AppWrappers.tsx） | ✅ 达成 | §4 每项 finding 回指具体 token 条款 |
| 2 | 扫 hardcoded hex / 非 token 色 | ✅ 达成 | **0 处**。F004 反向挑战：独立全仓 grep 另找到 `variables/charts.ts`、`navbar/Configurator.tsx` 含大量 hex → `diff -q` 证实二者与模板**逐字节相同**，排除正确 |
| 3 | 扫字体偏离（DM Sans/Poppins 之外） | ✅ 达成 | **0 处**，仅 `font-dm`×1 / `font-poppins`×2，无第三字族 |
| 4 | 扫 shadow / radius 偏离 | ✅ 达成 | shadow **10 处**；radius 经模板词表校准判**合规**（F004 复核：模板 `components/` 用 `rounded-2xl` 恰 44 次） |
| 5 | 扫 `dark:` 类完整性 | ✅ 达成 | 项目域 **0 缺口**，行级 + 元素感知两法交叉验证；F004 复跑负控 `--all` → **恰 16**，证明检查器未静默失效 |
| 6 | 逐项偏离给 文件:行 + 应使用 token | ✅ 达成 | 34 处全含；F004 复跑 `--json` 精确复现 **34 = shadow 10 + type-scale 13 + muted-text 11** |
| 7 | 扫描方法可复跑，脚本落 `scripts/test/` | ✅ 达成 | F004 以默认 / `--json` / `--all` / `TEMPLATE_ROOT` 四种模式复跑成功，退出码恒 0（审计工具非门禁） |
| 8 | 报告落位 | ✅ 达成 | 文件存在 |

**判定：PASS**

**方法学表扬（Evaluator 交叉评价）：** F003 主动**撤回**两类共约 60 处候选 finding（`rounded-2xl` 圆角偏离、`text-gray-*` 缺 dark 配对），理由是模板实测词表证伪。撤回比报出更需复核——撤错等于放过真债。F004 逐条验证其判据（模板 `rounded-2xl` 44 次 / `text-gray-600` 408 次 / `dark:text-gray-N` 仅 7 次 / `shadow-sm|md` 0 次 / `text-[<15px]` 0 次），**全部属实，撤回成立**。负控验证的设计（让检查器在已知有缺口的文件上报出 16 处）是三份报告中方法学最严谨的一处。

---

### F004：汇总报告 + 整改 backlog 候选

**Executor：** evaluator

**文件：**
- `docs/test-reports/FE-AUDIT-report-Andy-evaluator-subagent.md`（新增，汇总报告）
- `docs/test-reports/FE-AUDIT-signoff-Andy-evaluator-subagent.md`（新增，本文件）

**改动：**
三路并行审计的**对抗复核层**：回原件抽查关键 finding、跨报告去重、按 spec 定义统一分级、产出 backlog JSON 草案。

**验收标准与结果：**

| # | Acceptance clause | 结果 | 实物证据 |
|---|---|---|---|
| 1 | 汇总 F001-F003 并对关键 finding 抽查复核（防并行误报） | ✅ 达成 | **15 项复核**（F001 5 / F002 5 / F003 6），每份 ≥2 条回原件实测；三份报告移交的复核要点（F001 §9 三条 + F002 §9 四条 + F003 §6 一条）逐条处理 |
| 2 | P0/P1/P2 分级（合并后全批次清单） | ✅ 达成 | 报告 §4.2：**12 条**，P0 2 / P1 7 / P2 3；分级口径与 F002 的差异在 §4.1 明示理由 |
| 3 | 可直接并入 `backlog.json` 的 JSON 草案 + 工时估算 | ✅ 达成 | 报告 §5：12 条完整 JSON，字段合 harness-rules 需求池格式，`confirmed_at` 全 `null`；合计 **4.25–5.25 人日**；实测现有 `backlog.json` = `[]`，可整体写入 |
| 4 | 报告落位 | ✅ 达成 | `docs/test-reports/FE-AUDIT-report-Andy-evaluator-subagent.md` |

**判定：PASS**

---

## 抽查复核汇总（F004 核心职责）

| 档次 | 数量 | 内容 |
|---|---:|---|
| ❌ **推翻** | **1** | F002 §7.1「未出现手写卡片外框」分句（非 acceptance 项，债已被他处记账） |
| ⚠ **修正** | **1** | F002 D1 视觉盲区**机制**不完整 → F004 补全为「双路径同时落空」，**结论维持并加强**，衍生新 finding BL-FE-11 |
| ✅ **证实** | **13** | 含 3 项 F004 主动发起的反向挑战：差一陷阱（Button 计 3 而非 4）、hex 反查（charts.ts/Configurator 经 diff 排除）、撤回复核（60 处证伪候选判据全部属实） |

**无一份报告存在虚报凑数。** 三份共同特征：主动标注低置信项、主动撤回被证伪候选、主动声明工具局限。

---

## 未变更范围

| 事项 | 说明 |
|---|---|
| `src/` 全部产品代码 | 审计批次不改产品代码（spec §4 D1/D7）。全程 `git status --short src/` 为空 |
| `prisma/` / `sdk/` / 配置文件 | 本批次不涉及 |
| F001-F003 报告原文 | Evaluator 不改他人已落盘结论；F004 的更正意见只写在汇总报告与本 signoff |
| `progress.json` / `features.json` / `backlog.json` | Evaluator 不写状态机 JSON（spec §4 D1）。backlog 仅出草案，由 Planner 在 done 阶段并入 |
| 用户本地未提交的架构文档 | `docs/dev/architecture.md`（删）+ `architecture_f5.md` / `architecture_kimi.md`（新增未跟踪）—— 属 ARCH-LOCK 批次范围，本批次不碰 |
| `tests/visual/` 基线 | 未重生。本批次无代码改动，基线无需更新 |

---

## 预期影响

| 项目 | 改动前 | 改动后 |
|---|---|---|
| 前端地基债可见性 | 未知（三个问题无据可答） | 12 条分级 backlog，逐条含 文件:行 与工时 |
| 模板组件消费策略 | 无决策依据 | 215 组件使用状态矩阵 + 124 个 `admin/` 未 port 的 P0 决策窗口点名 |
| 可复跑审计能力 | 无 | 3 个脚本入库（组件矩阵 / 重复模式 / tokens），支持后续批次回归审计 |
| 产品代码 | — | **零改动** |
| 已知测试盲区 | 未知 | 点名 1 处（生产 `HandoffCollab` 视觉回归覆盖为零） |

---

## 类型检查 / CI

本批次**未改动任何产品代码**（`src/` / `prisma/` / 配置全程无变更），tsc / eslint 结果与批次前一致，无需重跑作为验收依据。

新增产物均为非编译路径：
- `scripts/test/*.mjs` / `*.sh` —— 独立审计脚本，不参与 `next build`
- `docs/test-reports/*.md` —— 文档

三个脚本 F004 均已实际执行成功（退出码 0）：

```
node scripts/test/fe-audit-component-matrix.mjs   → 215 模板 / 99 项目，矩阵闭合
node scripts/test/fe-audit-token-scan.mjs         → 合计 findings: 34
node scripts/test/fe-audit-token-scan.mjs --json  → shadow 10 / type-scale 13 / muted-text 11
node scripts/test/fe-audit-token-scan.mjs --all   → dark-pairing 负控 16 ✓
```

> 注：`docs/` 与 `scripts/` 变更不触发 CI（paths-ignore 已配置）。

---

## L2 实测记录

**本批次无 L2 项 — N/A。**

理由（按 `.auto-memory/role-context/evaluator.md` 测试分层）：本批次为**静态审计**，全部工作为 L1 —— 代码原件比对、模板 diff、本地零依赖脚本复跑。**无真实外部服务调用、无计费、无生产写入、无 staging 部署影响**。

- 审计对象为 main HEAD `bab9c10`，已实测与线上一致（`git log 6ec384d..HEAD -- src/` = 0 行）
- CI 视觉任务（`.github/workflows/ci.yml`）仅做**配置文件静态阅读**以复核 F002 D1 的盲区推论，**未触发运行**
- 未连接任何数据库、未调用 aigcgateway、未部署

---

## Ops 副作用记录

**本批次无数据库 ops。** 未执行任何 SQL、未连接 prod / staging 数据库、未跑 seed。

---

## Harness 说明

本批为 **Evaluator-only 批次**，经 Harness 状态机流程 `planning → verifying → done` 交付（全部 4 条 feature 均 `executor:evaluator`，按 harness-rules 批次类型规则跳过 building）。

**独立性铁则遵守情况：**

| 要求 | 状态 |
|---|---|
| Evaluator fresh context | ✅ F001-F004 均以隔离 subagent 运行，未继承实现过程对话 |
| 评估基于实物 | ✅ F004 未采信编排者 prompt 中的任何转述，自行从磁盘读取 progress.json / features.json / spec / 三份报告，并回原件实测 15 项 |
| 结论原样落盘 | ✅ 本 signoff 与汇总报告由 Evaluator 直接写入 `docs/test-reports/` |
| Evaluator 不改产品代码 | ✅ 仅新增 `scripts/test/`（3 脚本）与 `docs/test-reports/`（5 报告） |

**待 Planner 在 done 阶段执行：**
1. `progress.json`：`status` → `done`，`docs.signoff` → `test-reports/FE-AUDIT-signoff-Andy-evaluator-subagent.md`，`completed_features` → 4
2. `features.json`：F001-F004 status → `done`（全 PASS，无回退 `pending` 项）
3. `backlog.json`：并入汇总报告 §5 的 12 条 JSON 草案（当前为 `[]`，可整体写入）
4. 与用户确认 §7.3 的路径 A/B/C 选择，及 §4.4 的三条待拍板决策
5. 回到「ARCH-LOCK + M0.5」批次讨论

---

## Soft-watch（不阻塞 done，需后续跟进）

| ID | 描述 | 风险等级 | 建议处置 |
|---|---|---|---|
| S1 | **生产 `HandoffCollab` 视觉回归覆盖为零**：`agent-canvas.spec` 截克隆体；`dashboard.spec` 虽挂载 CopilotPanel 且 viewport 1512≥xl，但 CI visual job 无 DB/seed → `/api/handoffs` 失败 → `HandoffCollab.tsx:79 return null` → 同样不在基线内 | **medium** | BL-FE-02（P0）修复；BL-FE-11（P2）记账 CI 侧 |
| S2 | **F002 §7.1 含一处已被推翻的正面结论**，原报告未修改（Evaluator 不改他人落盘结论） | low | 后续读 F002 §7 时须同时参阅 F004 汇总报告 §2.2 更正；建议 Planner 在并入 backlog 时以 F004 口径为准 |
| S3 | **模板 `admin/` 决策窗口**：124 个页面级组件未 port 也未 re-implement，当前无债仅因 15 页中 11 页是壳（全部 app 代码 1159 行）。M0.5 开工即产生不可逆重复 | **medium** | BL-FE-01（P0），M0.5 开工前必须拍板 |
| S4 | **78 个 dead-in-repo 组件未分类登记**，其中约 25 个是 M0.5 采纳候选、约 34 个是 demo 专用 | low | BL-FE-08（P1）。**明确不建议直接删** —— 属已付费模板库存，非历史遗留垃圾 |
| S5 | **`tailwind.config.js` 当前与模板逐字节相同**（正面项）。BL-FE-07（微排版刻度命名化）将是首次有意扩展该底座 | low | 执行 BL-FE-07 时留意：此后模板升级 diff 不再为空，需记录扩展点 |
| S6 | **视觉基线连锁失效风险**：BL-FE-02 与 BL-FE-05 都会使 `tests/visual/` 基线失效 | low | 二者绑定同批施工，避免基线连续两轮失效（已写入 BL-FE-05 decisions） |

---

## Framework Learnings

### 新规律

- **并行 fan-out 审计必须配一个对抗复核层（F004 模式），且复核层的价值主要来自「回原件重跑」而非「读报告」**
  - 本批 15 项复核中，1 项推翻、1 项修正，均来自回原件实测；纯读报告无法发现（F002 §7.1 的错误与其自身 §3 findings 并不显式矛盾，只有跨报告 + 独立 grep 才暴露）
  - 来源：FE-AUDIT F004
  - 建议写入：`framework/patterns/` 或 `orchestration-patterns.md` §fan-out 验收

- **审计报告的「撤回」需要与「报出」同等强度的复核 —— 撤错等于放过真债**
  - F003 撤回约 60 处候选 finding，F004 逐条验证其模板词表判据（44/408/7/0/0）全部属实。若不复核撤回，审计层可通过「大量撤回」系统性低报债务而不被发现
  - 来源：FE-AUDIT F003 §3 + F004 §2.3
  - 建议写入：`framework/harness/evaluator.md` 或 `framework/patterns/`

- **扫描类审计脚本应内建负控（negative control）验证检查器未静默失效**
  - F003 用 `--all` 让 `dark:` 检查器在已知有缺口的文件上报出 16 处，从而证明「项目域 0 缺口」是真实结果而非检查器失灵。这是「0 结果」类结论唯一可信的自证方式
  - 来源：FE-AUDIT F003 §4.3
  - 建议写入：`framework/patterns/testing-env-patterns.md`

### 新坑

- **跨报告的「计债归属移交」会制造债务蒸发缝隙**
  - F001 §9.2 把 `dark:` 缺失移交 F003 计债，而 F003 §2.1 恰好豁免了该文件 —— 两边口径各自成立，债却在缝隙中消失。汇总层必须逐条追踪移交要点的**落点**，而非只看是否被提及
  - 来源：FE-AUDIT F004 §3 组 C
  - 建议写入：`framework/README.md` §经验教训

- **并行 subagent 各自的「相对优先级」不等于批次级分级，直接合并会导致 P0 通胀**
  - F002 在其 feature 内把 4 条标 P0（成本曲线理由），按 spec「阻塞后续开发」定义仅 2 条够格。汇总层须按 spec 字面定义重新对齐，并**明示口径差异**而非静默改写
  - 来源：FE-AUDIT F004 §4.1
  - 建议写入：`framework/harness/evaluator.md`

- **组件「在用」判定必须用 import 图传递可达性，朴素 grep 会系统性误判**
  - 被死组件 import 的组件仍然是死的。本项目实测：朴素 grep 19 个「在用」vs 传递可达 12 个，7 个伪存活
  - 来源：FE-AUDIT F001 §1
  - 建议写入：`framework/patterns/`（前端审计 pattern）

---

## 最终判定

| Feature | 判定 | 一句依据 |
|---|---|---|
| **F001** | **PASS** | 6/6 clause；矩阵脚本复跑数字完全一致、双向对账闭合，抽查 5 项全证实 |
| **F002** | **PASS** | 5/5 clause；D3/D1 抽查属实，8 条模式与 R1-R8 清单完整。§7.1 一处非 acceptance 分句被 F004 推翻，债已由他处记账，无遗漏 |
| **F003** | **PASS** | 8/8 clause；34 findings 精确复现，60 处撤回判据逐条属实，负控证明检查器有效 |
| **F004** | **PASS** | 4/4 clause；15 项抽查复核、5 组去重、12 条分级 backlog JSON 草案（4.25–5.25 人日） |

# 整批判定：**PASS**

**合并后债务：12 条（P0 2 / P1 7 / P2 3），合计 4.25–5.25 人日。**

**P0 点名：**
- **BL-FE-01** 模板 `admin/` 124 组件 port/自写策略决策 —— 阻塞 M0.5 六页工作台开工，**决策类需用户拍板**（0.5 人日）
- **BL-FE-02** `HandoffCard` 抽取 + 容器/呈现拆分 —— 恢复当前失效的视觉回归保护（0.5–1 人日）

**地基体检一句话结论：设计系统底座与模板还原严格性均健康（hardcoded hex 0 / 字体偏离 0 / `dark:` 无缺口 / `tailwind.config.js` 与模板逐字节相同）；现存债轻且集中在展示型小组件层；真正的风险不是存量，而是模板 `admin/` 消费策略未决 —— M0.5 六页工作台开工后债将按页数线性放大。**

`progress.json` 的 `docs.signoff` 应填入本文件路径后方可置 `done`。

---

*本 signoff 由隔离上下文 Evaluator subagent 独立产出，结论基于 main HEAD `bab9c10` 实测与模板原件比对，未采信任何叙述性描述，未经编排者改写。*
