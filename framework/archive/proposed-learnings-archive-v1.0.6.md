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


---

# v1.0.7 归档（用户 2026-07-22 确认，来源 KOLMatrix P2-CLEANUP）

落地位置：`patterns/audit-methodology.md` §5 §6 · `patterns/web-runtime-patterns.md` §4.4 · `harness/pre-impl-adjudication.md` §2.1

## [2026-07-21] Andy/Generator — 来源：P2-CLEANUP F005 新增视觉基线用例

**类型：** 新坑

**内容：** 新增一条视觉回归用例后，首次 push 的 CI **必然红**——linux 基线尚不存在（`A snapshot doesn't exist`）。须手动跑 `Update visual baselines` workflow 补 linux 基线；而该 workflow 的 commit 带 `[skip ci]`，所以补完基线 CI 也不会自动复跑，必须另有一次触碰非 paths-ignore 路径的 push 才能验证 CI 真的绿。Generator 的「CI 绿才能切 verifying」纪律在此处需要这个额外动作，否则会误判为红灯滞留或误判为已绿。

**建议写入：** `framework/patterns/web-runtime-patterns.md` §4（视觉回归三静默坑，作为第四条「新增用例的 CI 首红是预期，且补基线不自动复验」）

**状态：** ✅ 已确认（用户 2026-07-22）并落地

## [2026-07-21] Andy/Generator — 来源：P2-CLEANUP F003 pre-impl 审计

**类型：** 新规律

**内容：** spec 里「某组件状态源脱节」类 feature，开工前应先核**该组件是否真被渲染**（全仓引用扫描）与**它声称的样式属性是否真产出 CSS**。本批 F003 两条都不成立：组件零引用，且 `borderColor` 被 spread 到一个纯 div 包装件上从不产出样式——acceptance 写的「深色下边框跟随」用规定的改法根本无法达成。planning 阶段的只读勘查看到了「引了哪个 useColorMode」，但没看到「这个组件有没有人用」「这个 prop 有没有效」。建议 Planner 起草此类 feature 时把「消费点存在性」与「属性生效性」列入勘查清单。

**建议写入：** `framework/patterns/audit-methodology.md` 或 `framework/harness/pre-impl-adjudication.md` §触发条件

**状态：** ✅ 已确认（用户 2026-07-22）并落地

## [2026-07-22] Andy/Evaluator-reverify — 来源：P2-CLEANUP F003 fix_round1 复验

**类型：** 新坑

**内容：** **换实现形态后，既有断言可能静默退化为恒真。** F003 首轮 harness 的 C3 断言是 `/border-navy-700/.test(className)`；修复把实现从 `isDark ? 'border-navy-700' : 'border-white'` 换成 Tailwind 变体 `dark:border-navy-700` 后，该正则在**浅色态同样为真**（子串命中变体名内部），C3 从此不携带任何信息。表面上「原测试由 2 failed 转 0 failed」，实际只有一条载荷断言真的转绿。规律：修复走了与原实现不同的形态时，不得仅以「原测试转绿」作为缺陷消除的证据，须先做断言强度审查（尤其子串/正则类断言），并补 discriminating 反向断言（如「浅色态该断言应为假」）。

**建议写入：** `framework/patterns/audit-methodology.md`（断言强度审查）或 `framework/harness/evaluator.md` 复验章节

**状态：** ✅ 已确认（用户 2026-07-22）并落地

## [2026-07-22] Andy/Evaluator-reverify — 来源：P2-CLEANUP F003 探针保真度

**类型：** 新规律

**内容：** **合成节点探针证明不了组件真把 className 落到了 DOM。** Generator 的 F003 探针用 `<div class="${从源码正则提取的类名}">` 验证 CSS 变体行为——类名非硬编码这点是对的，但不渲染真实组件，故若 `Image` 吞掉 `className` 该探针仍会绿。规律：验证「组件 X 的样式在条件 Y 下生效」时，合成节点只能证明**样式规则**存在，必须另有一条挂载真实组件的路径才能证明**组件真的发出了它**。零引用组件（产品无路由可达）应建最小挂载 harness（esbuild 打包真实组件 + link 真实产物 CSS），而非退化为合成节点。

**建议写入：** `framework/patterns/audit-methodology.md` 或 `framework/patterns/web-runtime-patterns.md`

**状态：** ✅ 已确认（用户 2026-07-22）并落地
