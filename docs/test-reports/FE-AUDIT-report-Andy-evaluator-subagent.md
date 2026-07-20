# FE-AUDIT 汇总报告 — 前端地基全面审计（F004）

| 项 | 值 |
|---|---|
| 批次 / Feature | FE-AUDIT / F004（`executor: evaluator`） |
| 署名 | Andy/evaluator-subagent（隔离上下文，fresh context） |
| 日期 | 2026-07-20 |
| 审计对象 | main HEAD `bab9c10`（实测复核见 §1） |
| 汇总来源 | F001 / F002 / F003 三份报告（未改动其原文） |
| 判定 | **PASS**（F001-F004 全部 acceptance 达成） |
| 合并后 backlog | **12 条**（P0 **2** · P1 **7** · P2 **3**），合计约 **4.25–5.25 人日** |

> 本报告是三路并行审计的**对抗复核层**。职责不是转述，而是：回到代码原件抽查关键 finding、跨报告去重、按 spec 定义统一分级、把结论转成可执行的 backlog 草案。
> 本报告未修改任何产品代码，未写任何状态机 JSON。

---

## 1. 前提独立复核（不采信任何转述）

三份报告均声称审计对象 = main HEAD = 线上版本。实测：

```bash
$ git rev-parse --short HEAD                    → bab9c10
$ git log --oneline 6ec384d..HEAD -- src/ | wc -l → 0
$ git status --short src/ | wc -l                → 0
$ ls -d ~/project/db4rDjuaSCqaEFW9XcFo_.../horizon-tailwind-react-nextjs-pro-main → 存在
```

→ 前提成立。三份报告的审计对象一致，可安全合并。✅

---

## 2. 抽查复核结果（每份报告 ≥2 条，共 15 项）

复核原则：**不复述报告，回原件重跑 / 重 grep**。结果分三档 —— **✅ 证实** / **⚠ 修正** / **❌ 推翻**。

### 2.1 F001 抽查（5 项，全部证实）

| # | 复核项 | 报告声称 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | 矩阵脚本复跑 | 215 模板 / 99 项目；10 used-as-is / 2 forked / 78 dead / 124 never-ported / 1 removed / 9 self-built | 逐项**完全一致**，`10+2+78+124+1=215` 闭合 | ✅ |
| 2 | F001-03 手写卡片表面 文件:行 | 5 条高/中置信条目 | 抽 5 条逐行 `sed -n` 比对，**class 串逐字符相符** | ✅ |
| 3 | F001-04 Button 引用方 | 仅 `ComingSoon.tsx:4` 一处 | `grep -rn "common/Button"` → **恰 1 处** | ✅ |
| 4 | F001-04 手写 `<button>` 计 3 处 | 3 处活代码 | 自建域实测 **4 处**，第 4 处为 `common/Button.tsx:87`（组件自身实现）→ 报告排除正确 | ✅ |
| 5 | F001-01 模板 `admin/` 规模 | 124 tsx，项目无对应目录 | `find` → **124**；`ls src/components/admin` → 不存在 | ✅ |

> 第 4 项是典型的「差一」陷阱：naive grep 会把组件自身实现算成违规。F001 避开了。

### 2.2 F002 抽查（5 项，4 证实 / 1 修正 / 1 结论更正）

| # | 复核项 | 报告声称 | 实测 | 结论 |
|---|---|---|---|---|
| 6 | D3 Badge 逐字节相同 | 3 处逐字节相同 + `campaigns:21` 尺寸漂移 | 四行全部取出，**前 3 行逐字符相同**；第 4 行 `px-2`/`text-[11px]` 确为漂移 | ✅ |
| 7 | §4.2 `MiniStatistics` 零引用 | 全仓除定义外零命中 | `grep` → 2 命中，**均在其自身定义文件内** | ✅ |
| 8 | D1 克隆体位置 | `preview/agent-canvas/page.tsx:16-43` 为 `HandoffCollab` 手抄 | 预览页 import 清单确认**未 import** HandoffCollab，仅 import `ExpertScope`/`KolResultCards` | ✅ |
| 9 | **D1 视觉回归盲区推论** | 「HandoffCollab 的视觉改动不会触发任何测试失败」 | **结论成立，但机制不完整** → 见下方专项 | ⚠ 修正（结论维持并加强） |
| 10 | §7.1「未出现手写卡片外框」 | 正面项 | **与 F001-03、F003 §4.4 及本层实测冲突** → 见下方专项 | ❌ 该分句推翻 |

#### 专项 ⚠ 复核 9 — D1 盲区结论**维持**，证据链比报告更强

F002 的推理是「基线截的是克隆体」。本层追查发现机制其实是**双路径**：

```
src/app/admin/layout.tsx:81        <CopilotPanel />        ← 生产 HandoffCollab 确实挂在 /admin/today 下
playwright.config.ts               viewport 1512×982       ← ≥ xl(1280)，CopilotPanel（xl:flex）可见
```

即 `dashboard.spec.ts` 截的 `/admin/today` **本应**覆盖生产 HandoffCollab。但：

```
src/components/copilot/HandoffCollab.tsx:79   if (!loaded || handoffs.length === 0) return null;
.github/workflows/ci.yml:68-84  visual job —— 无 DB service、无 migrate、无 seed
```

CI 视觉任务没有数据库 → `/api/handoffs` 不 ok → `handoffs=[]` → **组件 return null** → 生产 HandoffCollab 同样不在 `en-today.png` 里。

**净结论：生产 `HandoffCollab` 的视觉回归覆盖为零 —— 两条路径同时落空。** F002 的判断正确，严重性甚至被低估。同时这暴露了一条三份报告都没提的新事实，本层补记为 **BL-FE-11**。

#### 专项 ❌ 复核 10 — F002 §7.1 分句正式更正

F002 §7 第 1 条写：「`components/card` 被 4 处自建面统一复用，**未出现手写卡片外框**」。后半句与两份独立报告直接冲突：

| 来源 | 证据 |
|---|---|
| F001-03 | 7 处手写卡片表面，逐条 文件:行（本层已抽验 5 条属实） |
| F003 §4.4 | 「项目自写卡片（copilot/canvas/today，**7 处**）」与模板 Card 并存两套语言 |
| 本层实测 | `grep -rn "rounded-2xl.*bg-white\|rounded-xl.*bg-white"` 自建域 → **11 处** |

**裁定：F002 §7.1 的「未出现手写卡片外框」分句由 F004 推翻。** 前半句（Card 在 4-5 处被正确复用）成立，予以保留。

> **为何这条必须点名：** §7 是「做对的部分」章节。若不更正，读者会得到「卡片层健康」的相反印象，而这恰是本批次**最大的一处实存债**（三报告交叉指向同一批文件）。
> **但债务未丢失** —— F001-03 与 F003 §4.4 已各自完整记账，合并后见 **BL-FE-05**。故该错误不影响交付物完整性，不构成 F002 的 acceptance 失败（详见 §5）。

**附带小订正（不影响结论）：** F001 记 Card 被 5 处复用（含 `ComingSoon.tsx:3`），F002 记 4 处（漏记 ComingSoon）。本层实测活代码域为 **5 处**，以 F001 为准。

### 2.3 F003 抽查（6 项，全部证实）

F003 主动**撤回**了两类共约 60 处候选 finding。撤回比报出更需要复核 —— 撤错等于放过真债。逐条验证其模板词表判据：

| # | 复核项 | 报告判据 | 实测 | 结论 |
|---|---|---|---|---|
| 11 | §3.1 撤回 `rounded-2xl` 偏离 | 模板 `components/` 用 44 次 | `grep -c` → **44** | ✅ 撤回成立 |
| 12 | §3.2 撤回 `text-gray-*` 缺 dark 配对 | 模板 `text-gray-600` 408 次 / `dark:text-gray-N` 仅 7 次 | → **408** / **7** | ✅ 撤回成立 |
| 13 | §4.4 shadow 判据 | 模板生产代码 `shadow-sm/md` 0 次；`shadow-lg` 21 次全在 demo 页 | → **0**；21 处全部落在 `app/admin/main/others/buttons/page.tsx` 单文件 | ✅ |
| 14 | §4.5 微排版判据 | 模板 `text-[<15px]` 0 次 | → **0** | ✅ |
| 15 | §4.1 hardcoded hex = 0 | 唯一命中 `navbar:31` 系模板继承 | 项目 `:31` 与模板 `:36` **整行逐字符相同** | ✅ |
| 15b | **本层反向挑战** hex=0 | — | 独立全仓 grep 另找到 `variables/charts.ts`、`navbar/Configurator.tsx` 含大量 hex → `diff -q` 证实**两者均与模板逐字节相同** | ✅ 排除正确 |
| 15c | 脚本复跑 + 负控 | 34 = shadow 10 + type-scale 13 + muted 11；负控 `--all` dark-pairing 应为 16 | 全部**精确复现**，负控 → **16** | ✅ |

> **15b 是本层对 F003 最强的一次挑战：** 我不接受「0 处硬编码色」这一反直觉结论，独立全仓扫描后确实找到两个满是 hex 的文件。逐字节 diff 后证明二者都是模板原件 —— F003 的分类方法学（115 identical 文件不计债）经得起反向检验。
> **负控设计值得表扬：** 用 `--all` 让检查器在已知有缺口的文件上报出 16 处，证明「项目域 0 缺口」是真实结果而非检查器静默失效。这是三份报告中方法学最严谨的一处。

### 2.4 复核总评

- **推翻：1 处**（F002 §7.1 分句），且该债已被另两份报告完整记账，无债务遗漏
- **修正：1 处**（F002 D1 机制补全，结论维持并加强，衍生 1 条新 finding）
- **证实：13 项**，含 3 项本层主动发起的反向挑战（差一陷阱 / hex 反查 / 撤回复核）
- **未发现任何一份报告存在虚报凑数**：三份均主动标注低置信项、主动撤回证伪项、主动声明脚本局限

---

## 3. 跨报告去重（同一债不重复计）

三份报告存在 5 组重叠。按各报告自己声明的归属建议统一口径：

| 组 | 重叠来源 | 归属裁定 | 落入 |
|---|---|---|---|
| **A** 预览页克隆 | F001-05（复刻 HandoffCollab + 气泡）⊂ F002 D1（HandoffCard）+ D2（ChatBubble） | 依 F001 §9.1 自述「以 F002 抽取清单为准」→ **归 F002**，F001-05 不单列 | BL-FE-02 / BL-FE-04 |
| **B** 手写卡片表面 | F001-03（7 处，应用 Card）≡ F003 §4.4（同 7 处，shadow/圆角/深色分叉）≡ F002 D7/R7（其中 3 处 hover 语言不一） | **同一批物理行的三个视角**，合并为一条，避免三重计债。依 F003 §8「与 F002 合并执行」 | **BL-FE-05** |
| **C** `dark:` 计债归属 | F001 §9.2 移交 F003；F003 §2.1 **豁免**了该文件 | ⚠ **险些落空的债** → 见下方裁定 | 并入 BL-FE-02 |
| **D** stat 卡 / 表格来源 | F002 §4.2（应复用模板 `MiniStatistics`，勿新抽 StatCard）≡ F001 §5（M0.5 应评估模板 `admin/` 现成件） | 依 F002 §9.2「以 F001 结论为准」→ **归 F001 的 port 决策** | **BL-FE-01** |
| **E** Button 绕过的三处 | F001-04 三处中，2 处（Tabs/Accordion）在 F002 §4.1 被判定为**单次出现、不计债** | 拆分：仅 `CopilotPanel:181` 计债；Tabs/Accordion 保留为 M0.5 前瞻，**不入 backlog** | BL-FE-06 备注 |

### 组 C 专项裁定 — 防止 `dark:` 债在报告缝隙中蒸发

F001 §9.2 明确写「`dark:` 缺失计债请归 F003」，而 F003 §2.1 把 `preview/agent-canvas/page.tsx` 整体豁免了。**若机械执行两边的口径，这条债会消失在交接缝里。** 本层裁定：

1. **F003 的豁免成立** —— 实测该文件头自述「浅色 / 独立路由 / 保证像素确定」，强行补 `dark:` 破坏其存在目的。判为 finding 属误报。
2. **但债并非不存在**，只是**性质不是「dark: 缺失」而是「克隆体独立漂移」** —— `dark:` 全丢正是漂移的**证据**，不是独立缺陷。
3. **归属：并入 BL-FE-02**（容器/呈现拆分）。拆分后预览页 import 真实呈现组件，`dark:` 差异自动消失，无需单独整改。

→ 结论：不单列 `dark:` 条目，但在 BL-FE-02 的验收标准中显式写入「拆分后预览页与生产共用同一呈现层，`dark:` 变体自动一致」，确保该债有人接。

---

## 4. 合并后统一分级（P0 / P1 / P2）

### 4.1 分级口径声明（与 F002 存在定义性差异，明示不隐藏）

按 spec §3 F004 定义：**P0 = 阻塞后续开发的地基问题** / **P1 = 会累积技术债** / **P2 = 锦上添花**。

F002 §6 将 R3 `Badge` / R2 `ChatBubble` 标为 P0，理由是「成本曲线：M0.5 后成倍上升」。本层**按 spec 字面定义下调为 P1** ——

- 二者均为纯 class 收敛，**不阻塞任何后续开发**，M0.5 可在其存在的情况下正常推进 → 不满足 P0「阻塞」要件
- 但 F002 的成本曲线论断本身正确，故**保留其「建议 M0.5 前完成」调度标记**，不因降级而丢失排期意图

**这是定义口径的统一，不是对 F002 判断的否定。** F002 在其 feature 范围内按「相对优先级」排序合理；F004 的职责是按 spec 的跨批次定义重新对齐，避免 P0 通胀（4 条 P0 会让「阻塞」失去信号价值）。

### 4.2 合并分级清单（12 条）

#### P0 — 阻塞后续开发（2 条）

| ID | 标题 | 来源 | 为何阻塞 |
|---|---|---|---|
| **BL-FE-01** | 模板 `admin/` 124 组件的 port / 自写策略决策 | F001-01 + F002 §4.2（组 D） | **M0.5 六页工作台无法开工**：表格/stat 卡/步骤器要么 port 模板现成件，要么六页各写一遍。决策不做，开发即产生不可逆重复。**决策类，需 Planner/用户拍板** |
| **BL-FE-02** | `HandoffCard` 抽取 + 容器/呈现拆分 | F002 R1/D1 + F001-05 + 组 A/C | **安全网当前是破的**：生产 `HandoffCollab` 视觉回归覆盖为零（§2.2 专项复核证实双路径落空）。在无回归保护的组件上继续开发即盲飞 |

#### P1 — 会累积技术债（7 条）

| ID | 标题 | 来源 | 规模 |
|---|---|---|---|
| **BL-FE-03** | 抽取 `common/Badge` | F002 R3/D3 | 6 处调用点，含 1 处既有尺寸漂移 |
| **BL-FE-04** | 抽取 `common/ChatBubble` | F002 R2/D2 + 组 A | 6 处（同文件内已重复 3 次） |
| **BL-FE-05** | **统一卡片表面语言**（抽 `SurfaceCard` 或复用模板 `card`），含 shadow / 圆角 / 深色底 / hover 四重收敛 | F001-03 + F003 §4.4 + F002 R7/D7（组 B） | 7 个自写卡片 + 10 处 shadow 偏离 + 3 套不一致 hover。**含设计决策：hover 语言统一为哪套，需拍板** |
| **BL-FE-06** | 展示层小组件三件套：`PageHeader` / `SectionLabel` / `PanelHeader` | F002 R4/R6/R8 | 4+3+2 = 9 处，纯 class 收敛，可一次施工 |
| **BL-FE-07** | 微排版刻度命名化（`tailwind.config.js` 定义 `fontSize.micro` 等） | F003 §4.5 | 13 处散落 `text-[10/11/13px]`，跨 9 文件 |
| **BL-FE-08** | 78 个 dead-in-repo 组件分类登记（**不删**） | F001-02 | 扣 13 白名单 RTL → 65 个待登记 |
| **BL-FE-09** | 抽取 `DefinitionRow` + **术语统一**（`duty`/`isolation` 现有两套叫法） | F002 R5/D5 | 4 处。**含术语决策，需 Planner/用户拍板** |

#### P2 — 锦上添花（3 条）

| ID | 标题 | 来源 |
|---|---|---|
| **BL-FE-10** | 次要文本统一 `gray-500` → `gray-600` | F003 §4.6（11 处，零风险） |
| **BL-FE-11** | **视觉基线覆盖缺口记账**：CI 无 DB → `HandoffCollab` 渲染 null，`en-today.png` 静默编码空区域 | **F004 新增**（§2.2 专项复核衍生） |
| **BL-FE-12** | 深色模式选择持久化（localStorage/cookie） | F003 §4.3 观察（超出 clause，F003 已声明由 Planner 定夺） |

### 4.3 统计

| 分级 | 条数 | 工时小计 |
|---|---:|---:|
| **P0** | **2** | 1.0 – 1.5 人日 |
| **P1** | **7** | 2.5 – 3.0 人日 |
| **P2** | **3** | 0.75 人日 |
| **合计** | **12** | **4.25 – 5.25 人日** |

**原始 finding → 合并后：** F001 5 条 + F002 8 条 + F003 3 组 + F003 可选 1 条 = 17 条原始 → 去重合并 → **12 条 backlog**（组 A/B/D 合并消化 5 条，组 E 剔除 2 条非债项，F004 新增 1 条）。

### 4.4 需 Planner / 用户拍板的决策项（3 条，不可由 Evaluator 代决）

| ID | 待决问题 | 影响 |
|---|---|---|
| **BL-FE-01** | 模板 `admin/` 组件：port 复用 vs 自写？ | 决定 M0.5 六页工作台的全部实现路径 |
| **BL-FE-05** | 可点卡片 hover 语言统一为 `shadow-md` / `shadow-xl` / `border+shadow` 哪一套？ | 视觉语言，影响全站交互反馈一致性 |
| **BL-FE-09** | `duty`/`isolation` 的中文术语统一为「职责/边界」还是「本环节专家职责/隔离」？ | 产品文案一致性 |

---

## 5. backlog.json 并入草案（JSON）

> **Evaluator 不写 `backlog.json`**（spec §4 D1）。以下为草案，由 Planner 在 done 阶段并入。
> 当前 `backlog.json` 实测为 `[]`（空数组），下列条目可直接作为数组元素整体写入。
> 字段遵 harness-rules「需求池」格式：`{ id, title, description, decisions[], confirmed_at, priority }`；`confirmed_at` 一律 `null`（待用户确认）。

```json
[
  {
    "id": "BL-FE-01",
    "title": "模板 admin/ 124 组件 port/自写策略决策",
    "description": "模板 src/components/admin/ 提供 124 个页面级组件（数据表格 CheckTable/ColumnsTable/ComplexTable、统计卡 MiniStatistics、步骤器 Stepper+StepperContext、搜索表格 SearchTableOrders、图表 BarChart/LineChart/PieChart），项目一个未 port 也未 re-implement。根因是当前 15 页中 7 页 redirect + 4 页 ComingSoon，仅 4 页有真实内容（全部 app 代码 1159 行），尚未开始画真页面。M0.5 六页工作台开工即需要这些能力：不先决策则六页各自手写一遍表格与 stat 卡，届时整改成本数倍。另：模板 card/MiniStatistics.tsx 全仓零引用（已实测），M0.5 需 stat 卡时应优先复用而非新抽 common/StatCard，否则制造新的『模板已提供却手写』债。来源 F001-01 + F002 §4.2（F004 去重组 D）。产出物为决策文档，不含 port 执行工时。",
    "decisions": [
      "待决：逐个 port 到 src/components/ / 按需拷贝改造 / 全部自写 —— 三选一",
      "待决：port 的组件是否保留模板原始命名与目录结构（影响后续模板升级 diff 成本）",
      "已定（F001 §6）：78 个 dead-in-repo 组件不删，其中约 25 个是 M0.5 采纳候选，属已付费模板库存"
    ],
    "confirmed_at": null,
    "priority": "P0",
    "estimate": "0.5 人日（调研 + 决策文档，不含 port 执行）",
    "source": "FE-AUDIT F001-01, F002 §4.2",
    "blocks": "M0.5 WORKBENCH-UI 六页工作台"
  },
  {
    "id": "BL-FE-02",
    "title": "HandoffCard 抽取 + 容器/呈现拆分（恢复失效的视觉回归保护）",
    "description": "src/app/preview/agent-canvas/page.tsx:16-43 的 StaticHandoffCard 是 src/components/copilot/HandoffCollab.tsx:26-59+83-93 的逐行手抄副本，且已开始独立漂移（克隆体 dark: 变体全丢：page:20/25/33 vs HandoffCollab:83/29/48）。根因是 HandoffCollab 把取数与呈现耦合（:66-78 useEffect fetch('/api/handoffs')），自取数不确定 → 无法用于确定性截图 → 只能手抄。整改：抽 src/components/common/HandoffCard.tsx 为纯呈现 props-only 组件，HandoffCollab 保留为容器（fetch → 传 props），预览页改为 import 真实呈现组件 + 夹具 props（效仿已正确复用的 ExpertScope/KolResultCards）。F004 复核确认：生产 HandoffCollab 视觉回归覆盖为零 —— agent-canvas.spec 截的是克隆体；dashboard.spec 虽经 admin/layout.tsx:81 挂载 CopilotPanel 且 viewport 1512≥xl，但 CI visual job 无 DB/seed → /api/handoffs 失败 → HandoffCollab.tsx:79 return null → 同样不在基线内。",
    "decisions": [
      "已定（F002 R1）：props 签名 { fromName, toName, summary, artifactType, artifactRef, defaultOpen?, collapsible? }",
      "已定（F004 去重组 C）：预览页 dark: 缺失不单列为债 —— F003 §2.1 的豁免成立（该页刻意浅色以保像素确定），dark: 全丢是克隆漂移的证据而非独立缺陷；拆分后自动消解",
      "验收须含：拆分后预览页与生产共用同一呈现层，dark: 变体自动一致；视觉基线由截克隆体改为截真实生产组件"
    ],
    "confirmed_at": null,
    "priority": "P0",
    "estimate": "0.5–1 人日（含视觉基线重生）",
    "source": "FE-AUDIT F002 R1/D1, F001-05, F004 §2.2 专项复核"
  },
  {
    "id": "BL-FE-03",
    "title": "抽取 common/Badge（brand 药丸徽标 6 处）",
    "description": "6 处 brand 徽标：soft 变体 4 处（today/page.tsx:29、ExpertScope.tsx:18、StagePanel.tsx:24 三者 class 串逐字节相同 —— F004 已逐行验证；campaigns/page.tsx:21 已发生尺寸漂移 px-2/text-[11px]）+ solid/pill 变体 2 处（StagePanel.tsx:18、KolResultCards.tsx:50）。props 建议 { variant?: 'soft'|'solid', size?: 'xs'|'sm', shape?: 'rounded'|'pill' }。纯 class 收敛零逻辑零结构变动，6 处全为单行替换，同时消除既有漂移。F002 评为改造成本最低/复用面最广的一条。",
    "decisions": [
      "已定（F002 R3）：落位 src/components/common/Badge.tsx，导入别名沿用 components/common/X",
      "建议时机：M0.5 之前（F002 成本曲线论断，F004 认可其调度意图）"
    ],
    "confirmed_at": null,
    "priority": "P1",
    "estimate": "0.25 人日",
    "source": "FE-AUDIT F002 R3/D3"
  },
  {
    "id": "BL-FE-04",
    "title": "抽取 common/ChatBubble（对话气泡 6 处）",
    "description": "6 处对话气泡：CopilotPanel.tsx:77（user 渐变右）/:78（agent 浅色左）/:148（开场白，复制 agent 变体）/:161（正在思考…，复制 agent 变体）—— 同文件内已重复 3 次；preview/agent-canvas/page.tsx:62,67 跨文件再克隆 2 次（克隆体缺 dark:）。与 BL-FE-02 同源：气泡逻辑内嵌在 MessageParts 中无法被预览页复用，只能手抄。props 建议 { role: 'user'|'agent', children, muted? }。抽取后预览页可复用真实气泡。",
    "decisions": [
      "已定（F002 R2）：落位 src/components/common/ChatBubble.tsx；muted 对应『正在思考…』态",
      "建议与 BL-FE-02 同批施工（同源问题，F002 称其为 R1 的前置拆分练习）"
    ],
    "confirmed_at": null,
    "priority": "P1",
    "estimate": "0.25 人日",
    "source": "FE-AUDIT F002 R2/D2, F001-05"
  },
  {
    "id": "BL-FE-05",
    "title": "统一卡片表面语言（shadow/圆角/深色底/hover 四重收敛）",
    "description": "【F004 三报告合并条目 —— 同一批物理行的三个视角，勿重复计债】项目并存两套卡片写法：模板 components/card/index.tsx（rounded-[20px] + shadow-3xl + shadow-shadow-100/500 + dark:!bg-navy-800）vs 项目自写卡片 7 处（rounded-2xl + shadow-sm + dark:bg-navy-700）。7 处位置：today/page.tsx:25、KolResultCards.tsx:38、preview/agent-canvas/page.tsx:20、HandoffCollab.tsx:83、ExpertScope.tsx:14、HandoffCollab.tsx:29、preview/agent-canvas/page.tsx:25（前 3 处高置信，F004 已逐行验证 5 条）。叠加 F003 shadow 偏离 10 处（模板生产代码 shadow-sm/md 出现 0 次 —— F004 已复核判据）：KolResultCards:38、ExpertScope:14、HandoffCollab:83、CopilotPanel:78/148/161、today:25、Button.tsx:27(×2)、KolResultCards:38 hover。叠加 F002 D7：3 处可点卡片 hover 反馈各不相同（shadow-md / shadow-xl / border+shadow-md）已是三套不一致交互语言。注：rounded-2xl 本身合规（F003 §3.1 实测模板用 44 次，F004 已复核），不是圆角违规，问题是与模板 Card 的 20px 同屏并置不一致。",
    "decisions": [
      "待决（设计决策，Evaluator 不代决）：可点卡片 hover 语言统一为 shadow-md / shadow-xl / border+shadow 哪一套",
      "待决：自写卡片改为直接复用 components/card，还是新抽 common/SurfaceCard 作轻量表面（F001 指出 #4-#7 嵌套小表面套 Card 会带来 20px 圆角+重阴影，不宜硬套）",
      "已定（F001 §4）：HandoffCollab:29 与 preview:25 为手风琴内层结构，不建议改造",
      "风险：改动使 tests/visual/ dashboard/today + agent-canvas 基线失效，须与 BL-FE-02 合并为一次改动，避免基线连续两轮失效"
    ],
    "confirmed_at": null,
    "priority": "P1",
    "estimate": "0.5–1 人日",
    "source": "FE-AUDIT F001-03 + F003 §4.4 + F002 R7/D7（F004 去重组 B）"
  },
  {
    "id": "BL-FE-06",
    "title": "展示层小组件三件套抽取：PageHeader / SectionLabel / PanelHeader",
    "description": "三个纯 class 收敛组件可一次施工共 9 处。PageHeader（4 处：today/page.tsx:44-45、campaigns/page.tsx:12-15、ProjectDetail.tsx:47-54、ComingSoon.tsx:22-27，均为 H1+灰副标题，text-2xl font-bold text-navy-700 dark:text-white 完全一致，差异仅外边距与对齐；M0.5 后复用面 4→10+）；SectionLabel（3 处：today:47、HandoffCollab:84、preview:21，图标+小标题卡内区块头，差异仅 text-xs/text-sm）；PanelHeader（2 处：CopilotPanel:211-218、preview:49-54，主标题字面量完全相同）。另附 F001-04 备注：CopilotPanel.tsx:181 的发送按钮应收敛到既有 common/Button（当前 Button 采纳率 1/4，唯一引用方为 ComingSoon.tsx:4），需先给 Button 补纯图标圆形 variant（现 5 个 variant 均为 rounded-xl 方角）。",
    "decisions": [
      "已定（F002 R4/R6/R8）：props 签名见 F002 §5；PageHeader 需 align?: 'left'|'center' 以覆盖 ComingSoon 居中变体，actions? 覆盖 ProjectDetail:56 返回链接",
      "已定（F004 去重组 E）：F001-04 另两处绕过（HandoffCollab:30 手风琴触发、ProjectDetail:67 tab）是语义不同的控件，不应塞进 Button；Tabs/Accordion 在自建域均仅出现 1 次，按 F002 阈值纪律不计债，不入本池，留 M0.5 前瞻"
    ],
    "confirmed_at": null,
    "priority": "P1",
    "estimate": "0.5 人日",
    "source": "FE-AUDIT F002 R4/R6/R8, F001-04（部分）"
  },
  {
    "id": "BL-FE-07",
    "title": "微排版刻度命名化（tailwind.config.js 定义 fontSize.micro 等）",
    "description": "项目新造了一套 <12px 微排版刻度散落各处：text-[10px]×4、text-[11px]×5、text-[13px]×4，共 13 处跨 9 文件（CopilotPanel:77/78/148/161/105/215、KolResultCards:59/86、ExpertScope:18、HandoffCollab:52、StagePanel:24、today:29、campaigns:21）。判据：模板全域 text-[Npx] 用 76 次但最小值 text-[15px]，低于 15px 出现 0 次（F004 已复核 grep 判据）。整改建议在 tailwind.config.js 显式定义命名刻度而非散落 arbitrary 值，否则 M0.5 每页各写各的、刻度无法统一调整。另 10px 正文有可读性/可访问性风险。注：tailwind.config.js 当前与模板逐字节相同（F001 §3 正面发现），此改动是首次有意扩展设计系统底座。",
    "decisions": [
      "待定：命名刻度取值与命名（如 fontSize.micro=11px / fontSize.mini=10px），建议与设计确认",
      "已定（F003 §4.5）：本项属 acceptance『字体偏离』的邻接发现（字面 clause 指字族，已判 0 处 PASS），不影响 F003 判定"
    ],
    "confirmed_at": null,
    "priority": "P1",
    "estimate": "0.5 人日",
    "source": "FE-AUDIT F003 §4.5"
  },
  {
    "id": "BL-FE-08",
    "title": "78 个 dead-in-repo 模板组件分类登记（明确不删）",
    "description": "78 个已入库但从 src/app/** 传递不可达的模板组件（F004 已复跑脚本复现该数字）。扣除 13 个 D6.4 白名单 RTL 相关 → 65 个待登记。F001 §6 已给出初步四分类：白名单 RTL 13（不计债）、认证批次储备 6（auth/variants×3、footer/FooterAuth×2、navbar/NavbarAuth，保留）、M0.5 采纳候选约 25（charts×6、fields×4、card/{MiniStatistics,CardMenu}、checkbox、switch、progress、tooltip、popover、dataDisplay 等，保留并登记）、demo 专用约 34（NFT/课程/信用卡等，可在 FE-REFACTOR 评估删除）。产出物为登记表，非删除动作。",
    "decisions": [
      "已定（F001 §6）：不执行『清理死代码』—— 这 78 个不是历史遗留垃圾而是付费模板库存，M0.5 恰要消费其中一部分，此刻删除等于扔掉已付费资产再手写一遍",
      "依赖：本条与 BL-FE-01 的 port 决策强相关，建议同批处理"
    ],
    "confirmed_at": null,
    "priority": "P1",
    "estimate": "0.25 人日",
    "source": "FE-AUDIT F001-02"
  },
  {
    "id": "BL-FE-09",
    "title": "抽取 common/DefinitionRow + 统一 duty/isolation 术语",
    "description": "4 处标签-值定义行共享 <span className='shrink-0 font-semibold text-gray-400'>{label}</span> + 值 span 两列结构：ExpertScope.tsx:22-25(职责)/26-29(隔离)、StagePanel.tsx:29-32(本环节专家职责)/33-36(边界)。不止视觉重复，是语义重复 —— 两个组件渲染同一份 persona 数据的同两个字段（duty/isolation），却用了两套中文叫法，属文案一致性隐患。props 建议 { label, children, tone?: 'default'|'muted' }。",
    "decisions": [
      "待决（术语决策，Evaluator 不代决）：duty 统称『职责』还是『本环节专家职责』；isolation 统称『边界』还是『隔离』",
      "已定（F002 R5）：抽取时一并统一术语，不要抽完仍留两套叫法"
    ],
    "confirmed_at": null,
    "priority": "P1",
    "estimate": "0.25 人日（术语拍板后）",
    "source": "FE-AUDIT F002 R5/D5"
  },
  {
    "id": "BL-FE-10",
    "title": "次要文本 token 统一 gray-500 → gray-600",
    "description": "11 处次要文本用 text-gray-500，应为 text-gray-600（horizon-tokens.md §6）：campaigns/page.tsx:13、today/page.tsx:33/45/47、ExpertScope.tsx:28、HandoffCollab.tsx:52/84、KolResultCards.tsx:45/82、ProjectDetail.tsx:50、StagePanel.tsx:35。判据：模板 text-gray-600 用 408 次 vs text-gray-500 仅 7 次（F004 已复核），项目自写域反向（gray-500 13 次 vs gray-600 8 次）。附带可读性收益：gray-500 #B5BED9 比 gray-600 #A3AED0 更浅，白底对比度更低。纯 token 选择，改动零风险。",
    "decisions": [
      "已定（F003 §4.6）：应使用 gray-600；可随手做，零风险，可并入任一前端批次"
    ],
    "confirmed_at": null,
    "priority": "P2",
    "estimate": "0.25 人日",
    "source": "FE-AUDIT F003 §4.6"
  },
  {
    "id": "BL-FE-11",
    "title": "视觉基线覆盖缺口记账：CI 无 DB 致 HandoffCollab 渲染 null",
    "description": "【F004 抽查复核新增，三份原报告均未覆盖】.github/workflows/ci.yml 的 visual job 无 DB service、无 migrate、无 seed，而 HandoffCollab.tsx:66-78 依赖 fetch('/api/handoffs')、:79 有 if (!loaded || handoffs.length === 0) return null。结果：CI 中该组件恒渲染 null，en-today.png 基线静默编码了一块空区域。双重风险：(1) 该组件的填充态永远不被回归测试覆盖；(2) 若未来 CI 获得 seeded DB（项目已有 npm run seed:demo-handoff），基线会无故失效并被误判为回归。注：本地跑 test:visual 若连着已 seed 的库，本地与 CI 基线行为不一致。",
    "decisions": [
      "待定：给 CI visual job 加 seeded DB（覆盖填充态，但需维护种子数据稳定性）/ 用 route mock 固定 /api/handoffs 响应 / 接受现状仅记账",
      "关联：BL-FE-02 完成后预览页改截真实呈现组件，可部分覆盖该缺口，建议届时一并复评"
    ],
    "confirmed_at": null,
    "priority": "P2",
    "estimate": "0.25 人日",
    "source": "FE-AUDIT F004 §2.2 专项复核（新增）"
  },
  {
    "id": "BL-FE-12",
    "title": "深色模式选择持久化",
    "description": "深色模式选择未持久化（无 localStorage/cookie），刷新即回浅色。src/hooks/useColorMode.ts 统一 toggle（document.body.classList.toggle('dark', dark)）但无持久层。F003 §4.3 明确标注此项属行为/UX 范畴而非 tokens 一致性，按 spec D7 未并入 F003 评分，交 Planner 定夺是否入池。附：深色体系本身健康 —— 项目自写域 dark: 出现 106 次/14 文件，是被主动维护的，且 layout.tsx:20 已无硬编码 dark、tailwind darkMode:'class' 配置正确。",
    "decisions": [
      "待定：是否值得做（用户是否实际使用深色模式尚无数据）",
      "已定（F003 §4.3）：属超出 F003 clause 的观察项，不影响 F003 的 PASS 判定"
    ],
    "confirmed_at": null,
    "priority": "P2",
    "estimate": "0.25 人日",
    "source": "FE-AUDIT F003 §4.3 观察"
  }
]
```

---

## 6. 整批 acceptance 逐条核验

### F001 — 6 clause

| # | Clause | 判定 | 实物证据 |
|---|---|---|---|
| 1 | 矩阵四类，覆盖模板 `src/components/` 全目录 | ✅ | F004 复跑 `fe-audit-component-matrix.mjs`：215 模板/99 项目，10/2/78/124/1，双向对账闭合 |
| 2 | 手写重复项含 文件:行 + 模板对应组件路径 + 替换建议与风险 | ✅ | §4 七条含全部三要素；F004 逐行验证 5 条 class 串相符 |
| 3 | forked 组件附 diff 摘要 | ✅ | §3 两个 fork（navbar/index、sidebar/index）逐行归因；脚本独立确认 forked 集合恰为这 2 个 |
| 4 | 所有结论附可复核证据 | ✅ | 脚本可复跑（F004 已复跑一致）；grep 命令 F004 已重跑 |
| 5 | 白名单项不计 finding | ✅ | §7 明列 4 类剔除项；`map/`、13 RTL 均未入 finding |
| 6 | 报告落位 | ✅ | `docs/test-reports/FE-AUDIT-F001-Andy-evaluator-subagent.md` 存在 |

**F001 = PASS**（抽查 5 项全部证实，含 1 项差一陷阱规避正确）

### F002 — 5 clause

| # | Clause | 判定 | 实物证据 |
|---|---|---|---|
| 1 | 扫描 15 页面 + 自建组件中 ≥2 次重复模式 | ✅ | 27 文件入扫，8 条 ≥2 次模式/30 处；单次(3)与零次(3)按阈值排除且说明 |
| 2 | 逐条列出现位置 文件:行 | ✅ | §3 全条附 文件:行；F004 逐行验证 D3 四行（3 行逐字节相同 + 1 行漂移属实） |
| 3 | 公共组件清单：命名 + 落位 + props 签名 | ✅ | §5 R1-R8 均含 TS interface 与 `src/components/common/` 落位 |
| 4 | 按 复用次数 × 改造成本 排优先级 | ✅ | §6 八条排序表，含成本口径定义 |
| 5 | 报告落位 | ✅ | 文件存在 |

**F002 = PASS**（5/5 clause 达成）
**⚠ 附带一处结论更正（不影响 acceptance）：** §7.1「未出现手写卡片外框」分句经 F004 推翻（§2.2 专项）。该分句位于「做对的部分」附加章节，**不属任何 acceptance clause**，且其涉及的债已由 F001-03 与 F003 §4.4 完整记账、并在 BL-FE-05 中承接 —— **无债务遗漏，不构成 acceptance 失败**。更正已在本报告显著位置记录，供后续读者对照。

### F003 — acceptance 各分句

| # | Clause | 判定 | 实物证据 |
|---|---|---|---|
| 1 | 对照 horizon-tokens.md + tailwind.config.js + AppWrappers.tsx | ✅ | §4 每项 finding 回指具体 token 条款 |
| 2 | 扫 hardcoded hex / 非 token 色 | ✅ | 0 处；F004 反向挑战（独立全仓 grep 找到 charts.ts / Configurator.tsx）经 `diff -q` 证实二者与模板逐字节相同，排除正确 |
| 3 | 扫字体偏离 | ✅ | 0 处，仅 font-dm/font-poppins |
| 4 | 扫 shadow / radius 偏离 | ✅ | shadow 10 处；radius 经模板词表校准判合规（F004 复核 rounded-2xl 模板用 44 次属实） |
| 5 | 扫 `dark:` 类完整性 | ✅ | 项目域 0 缺口，两法交叉验证；F004 复跑负控 `--all` → 恰 16，证明检查器未静默失效 |
| 6 | 逐项偏离给 文件:行 + 应使用 token | ✅ | 34 处全含；F004 复跑脚本精确复现 34 = 10+13+11 |
| 7 | 扫描方法可复跑，脚本落 `scripts/test/` | ✅ | `fe-audit-token-scan.mjs` 入库；F004 以 `--json`/`--all`/`TEMPLATE_ROOT` 三种模式复跑成功 |
| 8 | 报告落位 | ✅ | 文件存在 |

**F003 = PASS**（方法学最严谨：主动撤回 60 处证伪候选 + 负控验证 + 脚本 severity 与报告 severity 差异主动声明）

### F004 — 4 clause（本 feature 自查）

| # | Clause | 判定 | 实物证据 |
|---|---|---|---|
| 1 | 汇总 F001-F003 并对关键 finding 抽查复核（防并行误报） | ✅ | §2：15 项复核（F001 5 / F002 5 / F003 6），每份 ≥2 条回原件实测；1 处推翻 + 1 处修正 + 13 项证实，含 3 项主动反向挑战；三份报告移交的复核要点（F001 §9 三条 / F002 §9 四条）逐条处理于 §2-§3 |
| 2 | P0/P1/P2 分级（合并后全批次清单） | ✅ | §4.2：12 条，P0 2 / P1 7 / P2 3；分级口径差异（F002 的 2 条 P0 下调 P1）在 §4.1 明示理由，不隐藏 |
| 3 | 可直接并入 backlog.json 的 JSON 草案 + 工时估算 | ✅ | §5：12 条完整 JSON，字段合 harness-rules 格式，`confirmed_at` 全 null；逐条含 estimate，合计 4.25–5.25 人日；实测现有 `backlog.json` 为 `[]`，可整体写入 |
| 4 | 报告落位 `docs/test-reports/FE-AUDIT-report-Andy-evaluator-subagent.md` | ✅ | 本文件 |

**F004 = PASS**

### 跨报告去重完成度（spec §3 F004 要求）

| 移交要点 | 来源 | 处理 |
|---|---|---|
| F001-03/04 与 F002 抽取清单重叠 | F001 §9.1 | ✅ §3 组 A/B/E |
| `dark:` 计债归 F003 | F001 §9.2 | ✅ §3 组 C 专项裁定（防落空） |
| 视觉基线联动，整改合并一次改动 | F001 §9.3 | ✅ 写入 BL-FE-05 decisions |
| D1 视觉盲区推论需交叉确认 | F002 §9.1 | ✅ §2.2 专项，结论维持并加强 |
| MiniStatistics 与 F001 矩阵交叉，以 F001 为准 | F002 §9.2 | ✅ §3 组 D → BL-FE-01 |
| R5 术语 / R7 悬停语言需 Planner 拍板 | F002 §9.3 | ✅ §4.4 决策项清单 |
| 排期建议由 Planner 与用户裁定 | F002 §9.4 | ✅ §7 建议，未代决 |
| 脚本 severity ≠ 报告 severity | F003 §6 | ✅ §2.3 复核 34=10+13+11 一致，无矛盾 |

---

## 7. 整批结论与给 Planner 的输入（建议性，未代决）

### 7.1 整批判定：**PASS**

四条 feature 的 acceptance 全部达成。三份分项报告质量高于一般水平，共同特征：**主动标注低置信项、主动撤回被证伪的候选、主动声明工具局限**。F003 的负控验证与 F001 的传递可达性分析尤为可取 —— 二者都是「防止自己的结论看起来更漂亮」的设计。

### 7.2 地基体检结论：**健康，但有一个关键决策窗口正在关闭**

| 维度 | 结论 |
|---|---|
| 设计系统底座 | **健康**。`tailwind.config.js` 与模板逐字节相同；hardcoded hex 0；字体偏离 0；`dark:` 无缺口且被主动维护（106 次/14 文件） |
| 模板还原严格性 | **健康**。仅 2 个 fork，偏离全部有记录且合理，其中 2 处实为修正模板自身缺陷 |
| 手写重复实现 | **轻度**。绝对量小（自建 UI 面仅约 760-1000 行），但形态集中在「展示型小组件」层 |
| 公共组件抽取 | **停在原语层**。容器层（Card）与交互原语层（Button）复用健康，未向上覆盖到展示层 —— 这解释了 `common/` 只有 2 个组件的成因，不是疏于抽取 |
| **模板 admin/ 消费策略** | **未决策，且窗口正在关闭** ← 唯一真正的 P0 风险 |

**一句话：现在没有严重的存量债，因为还没开始画真页面（15 页中 11 页是壳）。真正的风险是 M0.5 六页工作台开工后，债会按页数线性放大。**

### 7.3 关于「是否插入 FE-REFACTOR 批次」（spec §5 要求 F004 提供输入，裁定权在 Planner 与用户）

事实输入，不代决：

- **P0 仅 2 条，其中 1 条（BL-FE-01）是决策而非施工**，0.5 人日产出决策文档即可解锁
- **另 1 条 P0（BL-FE-02）是恢复失效的测试保护**，0.5–1 人日
- P0+P1 合计约 3.5–4.5 人日；全部 12 条约 4.25–5.25 人日
- 按 spec §5「P0 债多则先插 FE-REFACTOR」的判据 —— **P0 债不多（2 条），且其中一条无需施工**

**因此三种路径均在合理区间，供用户选择：**

| 路径 | 内容 | 代价 |
|---|---|---|
| **A（最小闸门）** | 仅先做 BL-FE-01 决策（0.5 人日），P1 随 M0.5 施工中消化 | 最快进入 M0.5；但 BL-FE-02 的测试盲区在 M0.5 期间持续存在 |
| **B（推荐区间）** | 做完 2 条 P0 + 3 条零风险 P1（BL-FE-03/04/06）约 2 人日，再开 M0.5 | 拿到抽取地基与测试保护；成本可控 |
| **C（完整 FE-REFACTOR 批次）** | 12 条全做，4.25–5.25 人日 | 地基最干净；但 P2 三条价值有限，可能过度投入 |

Evaluator 的事实性观察：**BL-FE-05（卡片语言）与 BL-FE-02 共享视觉基线失效风险**，两者若分批做会导致基线连续两轮失效 —— 若选路径 A/B，建议把 BL-FE-05 与 BL-FE-02 绑定同批，或都推迟到 M0.5 后一次做完。

### 7.4 三条待拍板决策（阻塞对应 backlog 条目）

见 §4.4：BL-FE-01 port 策略 / BL-FE-05 hover 语言 / BL-FE-09 术语统一。

---

## 8. 边界合规声明

| 约束 | 状态 |
|---|---|
| 不修改产品代码 | ✅ `git status --short src/` 全程为空 |
| 不改 F001-F003 报告原文 | ✅ 三份原报告未被编辑；更正意见只写在本报告 |
| 不写状态机 JSON | ✅ 未触碰 `progress.json` / `features.json` / `backlog.json`（backlog 仅出草案） |
| 新增文件仅测试产物 | ✅ 仅本报告 + signoff 两份 md |
| [L2] 授权边界 | 本批为静态审计 + 本地脚本复跑，**无 L2 项**（无真实外部服务 / 计费 / 生产写入）。CI 视觉任务仅做配置文件静态阅读，未触发运行 |

---

*本报告由隔离上下文 Evaluator subagent 独立产出。全部结论基于 main HEAD `bab9c10` 实测、模板原件比对与脚本复跑，未采信编排者或其他 subagent 的任何叙述性描述。结论未经改写。*
