# Framework 提案暂存区

> Generator 和 Evaluator 在工作中发现值得沉淀的经验时，追加到本文件。
> Planner 在 done 阶段读取本文件，逐条提交给用户确认。
> 确认后由 Planner 正式写入 `framework/` 对应文件，并在 `CHANGELOG.md` 追加记录，最后从本文件移除已确认条目。
> 已闭环条目归档到 `framework/archive/proposed-learnings-archive-vX.Y.md`。

---

<!-- 2026-05-04: v0.9.9 沉淀完成（8 条 learnings 来源 BL-030/BL-031/BL-032），全部已写入 framework/ 对应文件 + CHANGELOG。 -->

<!-- 2026-05-04: v0.9.10 沉淀完成（3 条 learnings 来源 BL-033 + prod-mvp-readiness-audit），全部已写入 framework/ 对应文件 + CHANGELOG。 -->

<!-- 2026-05-05: v0.9.11 沉淀完成（5 条 learnings 来源 BL-020 + backend-full-scan-2026-05-04 audit），全部已写入 framework/ 对应文件 + 项目根 .nvmrc + .auto-memory/environment.md + CHANGELOG。归档：framework/archive/proposed-learnings-archive-v0.9.11.md。 -->

<!-- 2026-05-05: v0.9.12 沉淀完成（3 条 learnings 来源 BL-034），全部已写入 pre-impl-adjudication.md §11 + database-patterns.md §8.1 + deploy-patterns.md §5 + evaluator.md §17 + CHANGELOG。归档：framework/archive/proposed-learnings-archive-v0.9.12.md。 -->

<!-- 2026-05-06: v0.9.13 沉淀完成（2 条 learnings 来源 BL-024），全部已写入 deploy-patterns.md §5.1 + ai-action-contract.md §4.7 + CHANGELOG。归档：framework/archive/proposed-learnings-archive-v0.9.13.md。 -->

<!-- 2026-05-06: v0.9.14 沉淀完成（2 条 learnings 来源 BL-040 + BL-041 audit 过期 + BL-043 staging fix），全部已写入 planner.md 铁律 1 矩阵 +2 行延伸 + deploy-patterns.md §1.7（v0.9.7 §1.6 范围扩展）+ CHANGELOG。归档：framework/archive/proposed-learnings-archive-v0.9.14.md。 -->

<!-- 2026-05-07: v0.9.15 沉淀完成（2 条 learnings 来源 BL-021 F002 撤再翻盘 + BL-049 测试基建 audit），全部已写入 planner.md 铁律 1 矩阵 +2 行（v0.9.15 #1 跨 pool 复现 + #2 stub environment-agnostic）+ CHANGELOG。归档：framework/archive/proposed-learnings-archive-v0.9.15.md。 -->

<!-- 2026-05-08: v0.9.16 沉淀完成（1 条 learning 来源 BL-052 verifying P5 裁决），全部已写入 planner.md §"Planner 裁决职责" §P5.2 段 + CHANGELOG。归档：framework/archive/proposed-learnings-archive-v0.9.16.md。 -->

<!-- 2026-05-08: v0.9.17 沉淀完成（1 条 learning 来源 BL-012 apify-kol fork audit），全部已写入 planner.md 铁律 1 矩阵 +1 行（v0.9.17 记忆条目陈旧风险）+ 反面案例段（BL-012 5/7→5/8 实战）+ CHANGELOG。归档：framework/archive/proposed-learnings-archive-v0.9.17.md。 -->

<!-- 2026-05-08: v0.9.18 沉淀完成（1 条 learning 来源 BL-012 F001 fix-round 1 admin role enum mismatch），全部已写入 planner.md 铁律 1 矩阵 +1 行（v0.9.18 auth role enum 实物核查）+ CHANGELOG。归档：framework/archive/proposed-learnings-archive-v0.9.18.md。 -->

<!-- 2026-05-08: v0.9.19 沉淀完成（1 条 learning 来源 BL-012 F002 fix-round 2 prod zod schema mismatch），全部已写入 planner.md 铁律 1 矩阵 +1 行（v0.9.19 external API response zod schema 实物 sample 验证）+ CHANGELOG。归档：framework/archive/proposed-learnings-archive-v0.9.19.md。 -->

<!-- 2026-05-10: v0.9.20 沉淀完成（1 条 learning 来源 BL-060 fix-round 1→2 e2e suite-level isolation vs 单 case 信号区分），写入 .auto-memory/role-context/evaluator.md §"E2E suite 稳定性诊断" + .auto-memory/role-context/generator.md §"扩范围 vs 单点修的判断"。后续 batch 候选（抽 tests/e2e/helpers/auth.ts + global-setup.ts + storageState 复用）入 backlog 跟踪。归档暂未写 framework/archive/proposed-learnings-archive-v0.9.20.md（git history 已有 commits cae1f8f / 821c094 完整记录）。-->

<!-- 2026-07-09: v1.0.0 沉淀完成（1 条 learning 来源 BL-064 IA refactor redirect scope），写入 memory/role-context/generator.md §"IA refactor redirect scope 评估" + memory/role-context/planner.md §"IA refactor 类批次 redirect 清单评估" + CHANGELOG。归档：framework/archive/proposed-learnings-archive-v1.0.md。 -->

---

## [2026-07-12] Claude（harness-fit 分析 · 独立任务）— 来源：单工具 Claude + dynamic Workflow 工作流契合度评估（本会话 workflow wt27gd5xu，三视角 + 红队对抗复核）

**背景：** 用户已把主 coding 工作流收敛到单工具（仅 Claude Code），编码阶段用 Claude dynamic Workflow 编排。评估结论：harness 高契合且真提质，但价值不对称——**契约纪律 + 持久骨架**是纯增量（引擎给不了），**阶段内部编排**与引擎重叠、**多工具/多机底座**大部分是死重。以下提案已经过红队校准（推翻了"状态机=冗余仪式""慢车道=死重""Workflow 1:1 替代无自评"三个过度自信结论）。

---

### P0 —— 正确性前置（naive 上 Workflow 会踩的坑）

**P0-1 · 类型：新坑 / 铁律补充**
- **内容：** Claude Workflow 的 loop-until-done 天生会自主推进到"完成"并自排下一步，直接违反 `orchestration-patterns.md` §6 硬铁律「→verifying / →done 不得在无人值守循环中自动完成」。把阶段内部交给 Workflow 时，若不定契约就是**正确性回归**，不只是重复仪式。
- **建议写入：** `harness/orchestration-patterns.md` 新增「§8 Workflow run ⇄ progress.json 日志契约」小节（引擎只跑阶段内部、绝不 flip status 跨阶段；每步结果落盘持久文件；中途崩溃逐条对账）+ `harness-rules.md` 铁律区补一条呼应。
- **状态：** 部分落地 —— §8 已写入 `orchestration-patterns.md`（CHANGELOG v1.0.2）；剩余待确认：`harness-rules.md` 铁律区呼应条。

**P0-2 · 类型：新坑（最高风险）**
- **内容：** 沉淀闭环是事故驱动的，靠每批次一份 Evaluator 验收记录喂养。in-tool Workflow 若只在 context 里验完、不落"命名验收工件（BL-id + verdict + fix_round）"，`proposed-learnings.md` 会因**无 emitter 而静默饿死**（本文件现已显示"当前无待确认提案"即征兆）。这是模块级、产品级的静默失败——维护闭环本身就是本框架的产品。
- **建议写入：** `harness/orchestration-patterns.md` §4 + §8 + `templates/claude/skills/verify/SKILL.md`（verify 每轮必须持久化命名验收工件回喂沉淀，不可省）。
- **状态：** 部分落地 —— §8 契约 4 已写入 `orchestration-patterns.md`（CHANGELOG v1.0.2）；剩余待确认：verify SKILL.md 改写（Patch B，未落）。

**P0-3 · 类型：模板修订**
- **内容：** `/verify` step 3、`/build` step 5 把 fan-out/并行以**散文指针**（"按 §4 / §3"）交付，未真正 invoke Workflow——按框架自己"装进工具链才是强制"的标准，这层仍停在"写在文件里"。注意：fan-out 是**尾部场景**（触发门 ≥4 features），日常默认=单个隔离 evaluator subagent 本就 native，**不要把机制化 fan-out 当最高优先级**（红队降级）。
- **建议写入：** `templates/claude/skills/verify/SKILL.md` step 3 / `templates/claude/skills/build/SKILL.md` step 5 改为触发门命中时真正调 Workflow，并显式"停在阶段边界交还用户"。
- **状态：** 待确认

### P1 —— 结构精简 + 定位重申

**P1-1 · 类型：新规律（红队纠正，勿一刀切）**
- **内容：** 慢车道拆分：git **同步总线**语义单机确为死重，但两样单机也真实的能力搭在同一标签上不可一起砍——① **独立会话 evaluator** 是比 subagent **更强**的独立性（无编排者写的 prompt，免疫铁律 12 的作者污染风险）；② **跨会话/抗压缩交接**（多日批次 + 压缩会在同一会话内重现"新读者"问题）。
- **建议写入：** `docs/01-concepts.md` 慢车道段 + `harness/orchestration-patterns.md` §7（区分"同步总线"与"独立会话隔离 / 跨会话持久"两类，前者可选、后者保留）。
- **状态：** 待确认

**P1-2 · 类型：模板修订**
- **内容：** 快车道热路径剥离慢车道底座：`/plan /build /verify` step 1 的 `git pull --ff-only` + `.agent-id`/`.agents-registry` 读、`session-start.sh` 的 `role_assignments` 注入、`bootstrap.sh:71` 无条件铺 `AGENTS.md`——单机全是空转仪式，改为多机模式 opt-in。
- **建议写入：** 三个 skill SKILL.md step 1 + `templates/claude/hooks/session-start.sh` + `bootstrap.sh`。
- **状态：** 待确认

**P1-3 · 类型：新规律（定位重申）**
- **内容：** 把 harness 明确定位为坐在 Workflow 引擎之上的**薄契约纪律 + 持久骨架层**：引擎给编排**形状**，harness 给**常设默认强制 + 约束载荷（受限工具集 / 只认实物 / 误报预检 / 测试设计权）+ 用户闸门 + 抗压缩骨架**——这四样引擎都没有。
- **建议写入：** 新增 `harness/workflow-bridge.md`（角色 ⇄ Workflow stage 映射；标注哪些规则由引擎结构性强制、哪些仍是散文护栏）。
- **状态：** 待确认

### P2 —— 清理与补缺（须外科式，勿误伤承重项）

**P2-1 · 类型：铁律澄清（红队纠正）**
- **内容：** 机制化其实比宣传的薄：唯一硬阻断是 `validate-state-json.sh`（还只查 JSON **语法**，不查"status=done 但 signoff 为空"这种语义）；无自评 / done-门 / 裁决不洗白 / spec 源码核查**都活在散文里**。推论："砍散文仪式"必须外科式，勿把承重约定当仪式误删。
- **建议写入：** `harness-rules.md` §机制化守门（标注"当前硬阻断仅覆盖 JSON 语法，语义门仍靠约定"）。
- **状态：** 待确认

**P2-2 · 类型：新坑**
- **内容：** `executor:generator|evaluator` 是**活的路由位**（把报告类任务路进 verifying、选 Evaluator-only 批次流），与已死的 `executor:"codex"` 别名同段落；清 Codex 血缘时须**外科分离**，勿连带误删路由。
- **建议写入：** `harness-rules.md` lines 47/108 + `evaluator.md` + `planner.md` 相关行的清理注意事项。
- **状态：** 待确认

**P2-3 · 类型：新坑**
- **内容：** 对抗复核的误报目录（`patterns/testing-env-patterns.md`）是 **stack-coupled**（Prisma/Next/Postgres-RLS），换技术栈大半不可移植，且框架无"给新栈重播种目录"的机制。
- **建议写入：** `patterns/testing-env-patterns.md` 顶部标注适用栈 + 提供"新栈重播种"指引。
- **状态：** 待确认

**P2-4 · 类型：模板修订（与上一轮接入缺口同源）**
- **内容：** 补存量项目接入路径：`bootstrap.sh` 遇 `harness-rules.md` 存在即 abort（仅 greenfield）；加 `--adopt` 模式只装 `.claude/` 机制层（hooks + evaluator subagent + skills + progress.json），跳过 memory/spec 脚手架。
- **建议写入：** `bootstrap.sh` + `docs/03-quickstart.md` 补一节「已有项目接入」。
- **状态：** 待确认

**P2-5 · 类型：铁律澄清**
- **内容：** commit 粒度：per-feature commit 的**跨设备恢复**理由单机已失效，仅**抗压缩**承重（写状态文件即可恢复，逐 feature 打 git commit 是额外审计/回滚开销）；可放宽为 per-phase-boundary commit（保留状态文件写入 + JSON hook）。
- **建议写入：** `harness-rules.md` 铁律 2/3 理由重述（"跨设备恢复 + 抗压缩" → "抗压缩持久 + 审计轨迹"）。
- **状态：** 待确认

<!-- 2026-07-14: v1.0.4 沉淀完成（1 条 learning 来源 KOLMatrix DS-FOUNDATION F001 模板 scaffold secret 预扫），已写入 framework/patterns/web-runtime-patterns.md §3 + CHANGELOG v1.0.4。用户 2026-07-14 确认。 -->

<!-- 2026-07-13: 自主开发模式 + 进度看板 沉淀完成（用户确认，默认安装）。
     自主：机件转正入 templates/claude/{agents/{generator-restricted,spec-lock-critic}.md, skills/autodrive/, autonomous/*}；harness/autonomous-mode.md 转正为 T2 规范。
     看板：templates/dashboard.template.html + templates/claude/skills/dashboard/SKILL.md + progress.init.json(dashboard_url) + bootstrap chmod + harness-rules §四 + templates/CLAUDE.md。
     CHANGELOG v1.0.3。归档：archive/proposed-learnings-archive-v1.0.3.md。
     注：harness-fit 分析（P0-P2）不在本次确认范围，仍保留待确认。 -->

---

<!-- 2026-07-20: v1.0.5 沉淀完成（1 条 learning 来源 AGENT-FOUNDATION F008→F009 视觉基线漂移 + GO-LIVE healthcheck 307），已写入 framework/memory/role-context/{generator,planner}.md + 项目侧 .auto-memory/role-context/ 两份副本（铁律 7）+ CHANGELOG v1.0.5。用户 2026-07-20 确认。归档：framework/archive/proposed-learnings-archive-v1.0.5.md。
     注：harness-fit 分析（P0-3 / P1-1~P1-3 / P2-1~P2-5）用户 2026-07-20 裁决继续挂起，仍保留待确认。 -->

---

## [2026-07-20] Andy/Planner — 来源：FE-AUDIT 批次（Evaluator-only 三路 fan-out + 汇总对抗复核首次实跑）

**类型：** 新规律（审计类批次方法学三件套）

**内容：** FE-AUDIT 首次完整实跑「并行 finder + 串行对抗复核层」形态，沉淀三条可复用方法学：(1) **基线词表校准防误报** —— 对照类审计（tokens/组件/样式）必须先对基线实物（模板原件）做词表/逐字节分类，再扫项目侧；F003 借此撤回约 60+ 处会虚报的 finding（如 rounded-2xl 实为模板自己的词表 44 次）。(2) **import 图传递可达性防伪存活** —— 「组件是否在用」不能朴素 grep import（19 个），必须从 app 入口做传递可达性分析（实际 12 个，7 个为被死代码引用的伪存活）。(3) **汇总层必须是对抗复核层而非转述层** —— 给汇总 subagent 明确抽查配额（每份报告 ≥2 条、回原件重跑），实跑推翻了 1 处正面分句、修正 1 处推论机制、并新增 1 条三份并行报告全部漏掉的盲区（CI 无 DB 致视觉基线静默编码空区域）。

**建议写入：** `framework/harness/orchestration-patterns.md` §5（旁路 audit / fan-out 段补「审计类批次方法学」小节）或新建 `framework/patterns/audit-methodology.md`

**状态：** 待确认

---

## [2026-07-20] Andy/evaluator-subagent（Planner 自 FE-REFACTOR signoff §10 转录）— 来源：FE-REFACTOR 批次验收

**类型：** 新规律 ×2（Evaluator 方法学）+ 新坑 ×2

1. **「0 findings」必须配检测器活性证明才可采信**：脚本未被篡改（`git log -- <script>` 溯源）+ 前批基线复现（read-only worktree 跑同一脚本复现旧 findings 数）+ 终态判据（全仓 grep = 0）三道交叉，区分"真修干净"与"检测器死了/豁免被放宽"。来源 F005（34→0）。建议写入 `framework/harness/evaluator.md` 或 `patterns/testing-env-patterns.md`
2. **acceptance 计数与实测用量不符时先逐站点追溯再判定**：本批三次"数字对不上"（Badge 6→5 JSX、刻度 13→9、gray-500 11→7）全部证实为上游组件抽取去重的正确收敛；判据应落终态（全仓 grep=0 / 扫描归零）而非过程计数。建议写入 `framework/harness/evaluator.md`
3. **视觉基线"容忍带静默"是双向坑**：`--update-snapshots` 默认 changed 模式在容忍内不改写（重生 workflow 空转，已修 42d7d75 改 =all）；同一 maxDiffPixelRatio 也让整块 UI 出现/消失（1.44%）不判红。原则：**重生用 all、断言用紧阈值**，引入视觉测试时即按页面典型改动量级校准。已立 BL-FE-13 治理。建议写入 `patterns/web-runtime-patterns.md`
4. **纯 CI 环境"空数据渲染 null"会被基线静默编码为合法空白**：linux 基线曾把 HandoffCollab 空区域固化为"正确"，组件回归覆盖长期为零无人察觉。解法 = route mock 固定夹具 + `waitFor(关键文案)` 硬断言（渲染 null 即超时硬失败）。来源 BL-FE-11 / F003+F007。建议写入 `patterns/web-runtime-patterns.md`

**状态：** 待确认

---

## [2026-07-21] Andy — 来源：ARCH-M05 批次（架构定稿 + M0.5 六页工作台，17 features 大规模并行编排）

**类型：** 新坑 ×4 + 新规律 ×2

1. **（新坑）`next dev` 全路由 500/白屏**：devtools `segment-explorer` 与 RSC client manifest 冲突，C/D 两个验收组独立踩中同一坑——**本项目 UI 实测一律 `next build` + standalone，不走 `next dev`**。建议写入 `patterns/testing-env-patterns.md`（INFO-1）
2. **（新坑）CDN 字体是视觉测试抖动的总根源**：Playwright 每测试全新 context 零缓存 → 每用例重拉 Google Fonts，网络抖动即 fonts.ready 挂起/截图超时（先后伪装成 networkidle 挂起与多 worker 竞争，三层排查才见底）。解法 = woff2+改写 CSS 入库 `tests/visual/fonts/` + route 全离线回放（字形与线上一致；副产品套时 60-90s→24s）。建议写入 `patterns/web-runtime-patterns.md`
3. **（新坑）Tailwind JIT 静态扫描的静默丢类**：className 可达的色值必须定义在 tailwind.config（CSS 域），`from-[${JS常量}]` 不会生成任何 CSS——渐变静默消失。JS 域（Apex options/inline style）才走 `design-tokens.ts`。双域出处分工建议写入 `patterns/web-runtime-patterns.md` 或 horizon-tokens 附注
4. **（新坑）批内文档新鲜度**：批次首 feature 定稿的口径权威文档（architecture.md）被同批后续 feature 交付反向漂移 3 处（已实装仍标"演进目标"）——大批次应在批末（或 F-last）安排一次定稿文档刷新步，或 evaluator 验收增设"文档新鲜度"clause（本批 verify-A C6 即此，建议转正）。建议写入 `harness/planner.md` 或 `patterns/`
5. **（新规律）subagent 生成通路故障的 resume 兜底**：tmux 新建 pane ENXIO（pty 未触顶）时，向**已完成的 agent** SendMessage 走 resume 通路可绕过（本批 D/E/汇总/复验四次成功）；转派须核验独立性（只允许「验收→验收」，不得「实现→验收」）并在 signoff 记录。建议写入 `harness/orchestration-patterns.md`
6. **（新规律）fe-audit 三脚本作为跨批次回归 harness 成立**：FE-AUDIT 沉淀的扫描脚本在 ARCH-M05 批末对账中抓到真实回归（token-scan 53 findings→引出双域 token 收敛），「审计产物脚本化→后续批次 acceptance 引用复跑」闭环已两批验证。建议写入 `harness/evaluator.md` 或 `patterns/audit-methodology.md`（与 FE-AUDIT 方法学三件套合并）

**状态：** 待确认
