# FE-REFACTOR — 前端地基整改（普通批次）

> **批次类型：** 普通批次（全部 `executor:generator`），`planning → building → verifying → done`。
> **Spec lock：** 2026-07-20 用户 plan mode 批准。
> **事实依据：** FE-AUDIT 五份报告（`docs/test-reports/FE-AUDIT-*.md`），文件:行 级证据经 F004 抽查复核；HEAD 产品代码自审计后未变，引用处不再重复勘察。

## 1. 背景与目标

FE-AUDIT（4/4 PASS）结论：设计系统底座健康，债集中在展示型小组件层；12 条整改入 backlog。本批次消化其中 11 条（P0×2 + P1×7 + P2×2），在 ARCH-LOCK + M0.5 六页工作台前把地基整净。**留池：** BL-FE-12（深色持久化，价值未证）。

**用户拍板四项（2026-07-20，本批次执行依据）：**

| 决策 | 结果 |
|---|---|
| 批次顺序 | FE-REFACTOR 先行，随后 ARCH-LOCK + M0.5 |
| BL-FE-01 admin/ 策略 | **逐个 port、保留模板结构**（原始命名+目录；“逐个”= M0.5 各页用到时随需 port，本批只落约定不批量 port） |
| BL-FE-05 hover 语言 | 可点卡片统一 **hover:shadow-xl** |
| BL-FE-09 术语 | duty=**职责**，isolation=**边界** |

## 2. 功能范围（7 条，全 generator）

改动位置的完整 文件:行 清单见 backlog 各条 description（已随 FE-AUDIT 收官 commit `5d25945` 入 git history）与对应报告章节；下表为权威口径摘要。

### F001 common 抽取 A：Badge / ChatBubble / DefinitionRow + 术语统一
- `common/Badge.tsx`：props `{ variant?: 'soft'|'solid', size?: 'xs'|'sm', shape?: 'rounded'|'pill' }`；收敛 6 处（today:29、ExpertScope:18、StagePanel:24、campaigns:21【修复既有尺寸漂移】、StagePanel:18、KolResultCards:50）
- `common/ChatBubble.tsx`：props `{ role: 'user'|'agent', children, muted? }`；收敛 6 处（CopilotPanel:77/78/148/161、preview:62/67）
- `common/DefinitionRow.tsx`：props `{ label, children, tone?: 'default'|'muted' }`；收敛 4 处（ExpertScope:22-29、StagePanel:29-36），**同 commit 统一术语文案为「职责」「边界」**
- 依据：F002 报告 §5 R2/R3/R5

### F002 common 抽取 B：PageHeader / SectionLabel / PanelHeader + Button icon variant
- `common/PageHeader.tsx`（4 处：today:44-45、campaigns:12-15、ProjectDetail:47-54、ComingSoon:22-27；props 含 `align?: 'left'|'center'`、`actions?`）
- `common/SectionLabel.tsx`（3 处：today:47、HandoffCollab:84、preview:21）+ `common/PanelHeader.tsx`（2 处：CopilotPanel:211-218、preview:49-54）
- `common/Button.tsx` 补圆形纯图标 variant，收敛 CopilotPanel:181 发送按钮
- **明确不做**：HandoffCollab:30 手风琴触发、ProjectDetail:67 tab——语义不同控件，不塞进 Button（F004 报告去重组 E 已定）
- 依据：F002 报告 §5 R4/R6/R8 + F001-04

### F003 HandoffCard 容器/呈现拆分（P0）
- 抽 `common/HandoffCard.tsx` 纯呈现组件：props `{ fromName, toName, summary, artifactType, artifactRef, defaultOpen?, collapsible? }`
- `copilot/HandoffCollab.tsx` 保留为容器（fetch `/api/handoffs` → 传 props；:79 空态逻辑保留）
- `preview/agent-canvas/page.tsx:16-43` 删除手抄 `StaticHandoffCard`，改 import 真实呈现组件 + 夹具 props（效仿该页 ExpertScope/KolResultCards 姿势）；克隆体 dark: 漂移自动消解
- 依据：BL-FE-02 + F004 报告 §2.2 专项复核

### F004 卡片表面语言统一
- 抽 `common/SurfaceCard.tsx` 轻量表面（F001 报告 §4 证实嵌套小表面不宜硬套模板 Card 的 20px 圆角+重阴影）
- 收敛 5 处自写卡片（today:25、KolResultCards:38、preview:20、HandoffCollab:83、ExpertScope:14）；**豁免**：HandoffCollab:29、preview:25（手风琴内层结构，F001 §4 不建议改造，spec 记录在案）
- 可点卡片 hover 统一 `hover:shadow-xl`（3 处现存三套语言处）；清除 shadow-sm/md 共 10 处（含 Button.tsx:27×2，判据：模板生产代码 shadow-sm/md 0 次）
- 依据：BL-FE-05（F001-03 + F003 §4.4 + F002 R7/D7 合并）

### F005 设计 token 层：微排版刻度命名化 + gray-600 统一
- `tailwind.config.js` 定义命名字号刻度覆盖 10/11/13px 三档（命名由 Generator 定，如 `mini/micro/compact`），替换 13 处 `text-[10/11/13px]`（跨 9 文件，清单见 BL-FE-07）
- 11 处 `text-gray-500` → `text-gray-600`（清单见 BL-FE-10；依据 horizon-tokens.md §6 + 模板用词比 408:7）
- **注意**：这是 `tailwind.config.js` 首次有意偏离「与模板逐字节相同」（F001 报告正面项），commit message 必须明示该偏离及理由
- 依据：F003 报告 §4.5/§4.6

### F006 admin/ port 约定文档 + dead 组件登记表（纯文档）
- 新建 `docs/dev/template-port-guide.md`：port 约定（保留模板原始命名/目录，落位 `src/components/admin/…` 保持结构；每次 port 的适配检查清单：token/dark:/文案 i18n/从页面可达）+ 用户拍板记录
- 新建 `docs/dev/template-inventory.md`：65 个 dead-in-repo 组件登记表，按 F001 报告 §6 四分类（RTL 13 白名单 / 认证储备 6 / M0.5 采纳候选 ~25 / demo 专用 ~34 附处置建议）；**本批不删任何组件**
- 依据：BL-FE-01（决策已拍板，本 feature 为约定落地）+ BL-FE-08

### F007 视觉基线单次重生 + CI 视觉盲区修复（必须最后）
- `tests/visual/` 给 `/api/handoffs` 加 **route mock** 固定夹具响应（page.route），本地与 CI 行为一致，HandoffCollab 填充态进入基线（消 BL-FE-11：CI 无 DB 致其恒渲染 null）
- F001-F005 全部合入后**单次**重生全部基线 PNG（linux 基线经 CI 重生，沿用既有流程），一个 commit 完成
- 依据：BL-FE-11 + F004 报告 §2.2；决策：选 route mock 而非 seeded DB（确定性高、零种子维护；F003 完成后预览页已覆盖真实呈现组件）

## 3. 关键设计决策

- **D1 基线策略**：视觉基线只在 F007 单次重生；F001-F005 期间 `test:visual` 预期红（改动即目的），以「diff 与已拍板改动逐处对账」代替绿灯；CI visual job 允许期间红但 lint/tsc 必须绿——push 前本地跑 `next lint` + `tsc --noEmit`
- **D2 视觉等价口径**：除拍板改动（hover shadow-xl / gray-600 / 术语 / shadow 收敛 / campaigns:21 漂移修复）外，重构应视觉等价
- **D3 building 串行**：F001-F004 文件集重叠（copilot 域），逐 feature 串行 commit；F006 可穿插；F007 必须最后
- **D4 验收 fan-out**：7 features → verifying fan-out + 对抗复核；Evaluator 复跑 FE-AUDIT 三脚本对账：`fe-audit-dup-scan.sh` 重复模式归零（或仅剩豁免）、`fe-audit-token-scan.mjs` findings 清零（除白名单/豁免）、`fe-audit-component-matrix.mjs` 变化 = 新增 common 组件 + 克隆消失
- **D5 铁律 10**：commit 打 `feat(FE-REFACTOR-F00N)` 标签；11 条 BL 从 backlog.json 移除（本 spec 即其决策归档）
- **D6 设计稿说明**：design-draft/ 无对应页面原型（仅 horizon-tokens.md），视觉一致性以基线对账代替设计稿检查项；horizon-tokens.md 若因 F005 命名刻度需补充 token 表，同 commit 更新

## 4. 验收口径（verifying）

1. L1：`next lint` + `tsc --noEmit` 全绿；`npm run test:visual` 在 F007 后全绿
2. 三脚本对账达标（D4）
3. 逐 feature acceptance 达成（§2 各条），豁免项（HandoffCollab:29 / preview:25 / HandoffCollab:30 / ProjectDetail:67）不计 FAIL
4. 基线 PNG diff 逐张人查：变化仅限拍板项
5. 全 PASS → signoff → done；done 阶段 Planner 从 backlog 移除项归档确认、询问 ARCH-LOCK + M0.5
