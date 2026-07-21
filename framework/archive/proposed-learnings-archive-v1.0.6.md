# proposed-learnings 归档 — v1.0.6（2026-07-21 用户确认）

> 本文件保存 v1.0.6 沉淀的 13 条 learnings 提案原文。落地去向见 `framework/CHANGELOG.md` v1.0.6。
> 来源批次：KOLMatrix FE-AUDIT / FE-REFACTOR / ARCH-M05。

---

## [2026-07-20] Andy/Planner — 来源：FE-AUDIT 批次（Evaluator-only 三路 fan-out + 汇总对抗复核首次实跑）

**类型：** 新规律（审计类批次方法学三件套）

**内容：** FE-AUDIT 首次完整实跑「并行 finder + 串行对抗复核层」形态，沉淀三条可复用方法学：(1) **基线词表校准防误报** —— 对照类审计（tokens/组件/样式）必须先对基线实物（模板原件）做词表/逐字节分类，再扫项目侧；F003 借此撤回约 60+ 处会虚报的 finding（如 rounded-2xl 实为模板自己的词表 44 次）。(2) **import 图传递可达性防伪存活** —— 「组件是否在用」不能朴素 grep import（19 个），必须从 app 入口做传递可达性分析（实际 12 个，7 个为被死代码引用的伪存活）。(3) **汇总层必须是对抗复核层而非转述层** —— 给汇总 subagent 明确抽查配额（每份报告 ≥2 条、回原件重跑），实跑推翻了 1 处正面分句、修正 1 处推论机制、并新增 1 条三份并行报告全部漏掉的盲区（CI 无 DB 致视觉基线静默编码空区域）。

**建议写入：** `framework/harness/orchestration-patterns.md` §5（旁路 audit / fan-out 段补「审计类批次方法学」小节）或新建 `framework/patterns/audit-methodology.md`

**落地：** 新建 `patterns/audit-methodology.md` §1-§3；`orchestration-patterns.md` §5 表格指向该文件。

---

## [2026-07-20] Andy/evaluator-subagent（Planner 自 FE-REFACTOR signoff §10 转录）— 来源：FE-REFACTOR 批次验收

**类型：** 新规律 ×2（Evaluator 方法学）+ 新坑 ×2

1. **「0 findings」必须配检测器活性证明才可采信**：脚本未被篡改（`git log -- <script>` 溯源）+ 前批基线复现（read-only worktree 跑同一脚本复现旧 findings 数）+ 终态判据（全仓 grep = 0）三道交叉，区分"真修干净"与"检测器死了/豁免被放宽"。来源 F005（34→0）。建议写入 `framework/harness/evaluator.md` 或 `patterns/testing-env-patterns.md`
2. **acceptance 计数与实测用量不符时先逐站点追溯再判定**：本批三次"数字对不上"（Badge 6→5 JSX、刻度 13→9、gray-500 11→7）全部证实为上游组件抽取去重的正确收敛；判据应落终态（全仓 grep=0 / 扫描归零）而非过程计数。建议写入 `framework/harness/evaluator.md`
3. **视觉基线"容忍带静默"是双向坑**：`--update-snapshots` 默认 changed 模式在容忍内不改写（重生 workflow 空转，已修 42d7d75 改 =all）；同一 maxDiffPixelRatio 也让整块 UI 出现/消失（1.44%）不判红。原则：**重生用 all、断言用紧阈值**，引入视觉测试时即按页面典型改动量级校准。已立 BL-FE-13 治理。建议写入 `patterns/web-runtime-patterns.md`
4. **纯 CI 环境"空数据渲染 null"会被基线静默编码为合法空白**：linux 基线曾把 HandoffCollab 空区域固化为"正确"，组件回归覆盖长期为零无人察觉。解法 = route mock 固定夹具 + `waitFor(关键文案)` 硬断言（渲染 null 即超时硬失败）。来源 BL-FE-11 / F003+F007。建议写入 `patterns/web-runtime-patterns.md`

**落地：** 1/2 → `memory/role-context/evaluator.md` 新增两节（+ 项目侧副本）；3/4 → `patterns/web-runtime-patterns.md` §4.2 / §4.3。

---

## [2026-07-21] Andy — 来源：ARCH-M05 批次（架构定稿 + M0.5 六页工作台，17 features 大规模并行编排）

**类型：** 新坑 ×4 + 新规律 ×2

1. **（新坑）`next dev` 全路由 500/白屏**：devtools `segment-explorer` 与 RSC client manifest 冲突，C/D 两个验收组独立踩中同一坑——**本项目 UI 实测一律 `next build` + standalone，不走 `next dev`**。建议写入 `patterns/testing-env-patterns.md`（INFO-1）
2. **（新坑）CDN 字体是视觉测试抖动的总根源**：Playwright 每测试全新 context 零缓存 → 每用例重拉 Google Fonts，网络抖动即 fonts.ready 挂起/截图超时（先后伪装成 networkidle 挂起与多 worker 竞争，三层排查才见底）。解法 = woff2+改写 CSS 入库 `tests/visual/fonts/` + route 全离线回放（字形与线上一致；副产品套时 60-90s→24s）。建议写入 `patterns/web-runtime-patterns.md`
3. **（新坑）Tailwind JIT 静态扫描的静默丢类**：className 可达的色值必须定义在 tailwind.config（CSS 域），`from-[${JS常量}]` 不会生成任何 CSS——渐变静默消失。JS 域（Apex options/inline style）才走 `design-tokens.ts`。双域出处分工建议写入 `patterns/web-runtime-patterns.md` 或 horizon-tokens 附注
4. **（新坑）批内文档新鲜度**：批次首 feature 定稿的口径权威文档（architecture.md）被同批后续 feature 交付反向漂移 3 处（已实装仍标"演进目标"）——大批次应在批末（或 F-last）安排一次定稿文档刷新步，或 evaluator 验收增设"文档新鲜度"clause（本批 verify-A C6 即此，建议转正）。建议写入 `harness/planner.md` 或 `patterns/`
5. **（新规律）subagent 生成通路故障的 resume 兜底**：tmux 新建 pane ENXIO（pty 未触顶）时，向**已完成的 agent** SendMessage 走 resume 通路可绕过（本批 D/E/汇总/复验四次成功）；转派须核验独立性（只允许「验收→验收」，不得「实现→验收」）并在 signoff 记录。建议写入 `harness/orchestration-patterns.md`
6. **（新规律）fe-audit 三脚本作为跨批次回归 harness 成立**：FE-AUDIT 沉淀的扫描脚本在 ARCH-M05 批末对账中抓到真实回归（token-scan 53 findings→引出双域 token 收敛），「审计产物脚本化→后续批次 acceptance 引用复跑」闭环已两批验证。建议写入 `harness/evaluator.md` 或 `patterns/audit-methodology.md`（与 FE-AUDIT 方法学三件套合并）

**落地：** 1 → `patterns/testing-env-patterns.md` §7；2/3 → `patterns/web-runtime-patterns.md` §4.1 / §5；4 → `memory/role-context/{planner,evaluator}.md`（+ 项目侧副本）；5 → `orchestration-patterns.md` §4.1；6 → `patterns/audit-methodology.md` §4（与 FE-AUDIT 三件套合并）。
