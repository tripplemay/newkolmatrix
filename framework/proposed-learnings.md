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

<!-- 2026-07-21: v1.0.6 沉淀完成（13 条 learnings 来源 FE-AUDIT 方法学三件套 + FE-REFACTOR Evaluator 方法学 4 条 + ARCH-M05 6 条），已写入 patterns/web-runtime-patterns.md §4-§5 + patterns/testing-env-patterns.md §7 + 新建 patterns/audit-methodology.md + harness/orchestration-patterns.md §4.1 + memory/role-context/{planner,evaluator}.md + 项目侧 .auto-memory/role-context/ 两份副本（铁律 7）+ patterns/README.md 触发表 + CHANGELOG v1.0.6。用户 2026-07-21 确认。归档：framework/archive/proposed-learnings-archive-v1.0.6.md。
     注：harness-fit 分析（P0-3 / P1-1~P1-3 / P2-1~P2-5）用户 2026-07-21 三度裁决继续挂起，仍保留待确认（见上方 2026-07-12 条目）。 -->

---

**当前无待确认提案**（harness-fit P0-3 / P1-1~3 / P2-1~5 见上，状态=长期挂起，非待办）。

<!-- 2026-07-22: v1.0.9 沉淀完成（4 条 learnings 来源 M1-B F006 + M1-C F001/F005 + CI watch 流程坑），用户逐条 Accept。
     已写入 patterns/audit-methodology.md §2.1 + patterns/web-runtime-patterns.md §4.2/§6 + harness/generator.md §4.5
     + 项目根 generator.md + memory/role-context/generator.md 与 .auto-memory/role-context/generator.md（铁律 7 四副本同步）+ CHANGELOG v1.0.9。
     归档：framework/archive/proposed-learnings-archive-v1.0.9.md -->

---

**当前无待确认提案**（harness-fit P0-3 / P1-1~3 / P2-1~5 长期挂起，非待办）。

<!-- 2026-07-22: v1.0.10 沉淀完成（1 条 learning 来源 M1-D F006 compose 人工副本漂移），用户 Accept。
     已写入 patterns/deploy-patterns.md §8 + CHANGELOG v1.0.10。 -->

---

<!-- 2026-07-22: v1.0.11 沉淀完成（1 条 learning 来源 M2-A F008 dev server 残活基线污染），用户 Accept。
     已写入 patterns/web-runtime-patterns.md §4.5 + CHANGELOG v1.0.11。 -->

---

<!-- 2026-07-25: v1.0.12 沉淀完成（M3-A round1 4 条 critical 级新坑），用户确认采纳。
     已写入 patterns/database-patterns.md §9 + patterns/testing-env-patterns.md §8/§9
     + patterns/web-runtime-patterns.md §7 + CHANGELOG v1.0.12。
     归档：framework/archive/proposed-learnings-archive-v1.0.12.md。
     同次裁决：M3-B 1 条（相对时间基线）+ M4 3 条（注入缝/文档新鲜度机制化/清单断言）**继续挂起待确认**（见下方条目）。 -->

## [2026-07-23] Andy/Generator — 来源：M3-B F012 批末视觉门本地翻红

**类型：** 新坑

**内容：** 视觉基线里若包含**相对时间标签**（「N 小时前」）+ 长寿命本地 dev DB，mac 基线会随「重生时刻 → 断言时刻」的自然流逝翻红（M3-B 实测：feed 三行由 17:10 产生，20:00 重生标「2 小时前」、20:30 断言变「3 小时前」→ 4366px 差异）。CI 用 fresh DB 故不受影响，但本地重生—验证之间的时间差会造成「本地红、CI 绿」的误判耗时。建议：视觉夹具页含相对时间的区域，要么在基线环境用固定夹具时间（seed 时写死 createdAt），要么把该区域 mask 掉。

**建议写入：** `framework/patterns/web-runtime-patterns.md` §4（视觉基线章节）

**状态：** 待确认

## [2026-07-25] Andy/Generator+编排 — 来源：M4-INSIGHT（fixing round1 CI 红 + 文档翻牌两轮 PARTIAL）

**类型：** 新坑 ×2 + 新规律 ×1

**内容：**
1. **注入缝 LLM caller 必须无条件调用，凭据降级只对默认 caller 生效。** M4 F006 的 `draftWeeklyReport` 曾在无凭据时忽略注入的 mock caller 直接走降级分支——本地（.env 有凭据）测试全绿、CI（无凭据）三断言红（run 30119127279）。规律：`fn(input, ctx, llm = defaultCaller)` 形态的注入缝，环境判定（凭据/开关）必须包在 `llm === defaultCaller` 条件内，否则测试注入被静默改道，且只在与开发机环境相异的 CI 暴露。
2. **「口径权威文档」的计数/清单/表行类 as-built 断言应机制化为对实物的单元测试，批末人工 grep 已证不可靠。** 同坑三连踩：M3-B F012 首轮 PARTIAL（2 行漂移）→ M4 首轮 issue-1..4（3 个点名翻牌点整条漏 + 4 处陈旧标记）→ M4 复验 issue-5（ADVISORY 交办仍漏）。M4 fixing 落地范式 `tests/unit/architecture-doc-freshness.test.ts`：doc 计数/清单 vs schema·注册表·迁移目录·ROUTINES 实物 grep，9 断言进 CI 硬门（上线即抓出 health-scan 行旧措辞，实证载荷真实）。建议 Planner 拆批时把「文档刷新 feature」的 acceptance 从「grep 复核」升级为「新增/扩展 doc-freshness 断言」。
3. **测试钉「恰好 N 条」全量清单会连坐后续批次的合法扩展。** M4 F011 注册 weekly-draft 后，kol-sync 测试的 `expect(names).toEqual([恰 3 条])` 无辜翻红。规律：清单本身不是验收对象时，断言写「目标项在场 + 既有前缀序稳定」而非全量相等；全量相等只用于清单即验收对象的场景（如 doc-freshness）。

**建议写入：** 坑 1 → `patterns/testing-env-patterns.md`（或 ai-action-contract.md 注入缝节）；规律 2 → `memory/role-context/planner.md`「批内文档新鲜度」段升级 + `patterns/audit-methodology.md`；坑 3 → `patterns/testing-env-patterns.md`

**状态：** 待确认

## [2026-07-25] Andy/Generator — 来源：M4.5-AGENT-LOOP（building 期两次 CI 红 + 视觉基线覆盖面误判）

**类型：** 新坑 ×3 + 新规律 ×1

**内容：**

1. **模块循环导入只在生产构建期炸（vitest/dev 全绿）。** F004 的 `tools/propose-plan.ts` 从 `./index` 导入 `ensureNativeToolsRegistered`，而 `index.ts` 反向 import 该工具并在模块顶层调用注册——vitest 与 `next dev` 下模块求值顺序恰好安全，只有 `next build` 的 prerender 阶段 TDZ 崩（`ReferenceError: Cannot access 'l' before initialization`，run 30159192684 之前那次）。规律：**装配入口（把所有实现聚合起来并在顶层执行副作用的模块）不得被它聚合的成员反向 import**；需要「确保已初始化」的场景交给唯一执行入口。已落回归测试 `tests/unit/tool-module-cycles.test.ts`（目录级扫描，新工具自动纳入）。此类失效延迟暴露，本地全绿不能作为通过依据——**改动模块图后必须本地跑一次 `npm run build`**。

2. **`git grep` 类断言只搜「已跟踪」文件 → 新文件未 commit 时恒空绿。** F007 的「全仓无批量确认端点」断言本地绿、入库后 CI 才红（新文件此前不在索引里，且文件头把反面教材端点名写进了注释）。规律：以 `git grep` 为证据的架构约束断言，(a) 必须滤掉注释行，(b) 本地首次绿**不算数**——要么 `git add` 后再跑，要么改用文件系统读取。

3. **`fullPage:false` 的视口基线对「新加在页面下方的卡」零覆盖。** F006 起初想把新卡并进既有 `agent-canvas` 基线页，实测新卡落在折叠线以下——基线文件更新了，但新卡一个像素也没被守住。规律：给新构件加视觉覆盖时，先确认它是否在截图范围内；不在就**另起确定性预览页**（或该页改 `fullPage`），别只更新一张看不见它的基线。

4. **agent loop 的机械面应当离线可测——用 SDK 官方 mock model，不要 mock 网关 HTTP 层。** 本批把 loop 装配抽成带 `model`/`ctx` 注入缝的函数（`lib/agent/loop.ts`），测试床（`tests/support/agent-loop-testbed.ts`）用 `ai/test` 的 `MockLanguageModelV4` 脚本化 tool-call 序列驱动**同一个** `runAgentLoop`，于是步数上限截停 / 工具子集收窄 / outbound pending 停驻 / 人格接力切换全部离线可断言，零外呼。关键是**测试床与生产共用同一装配函数**——在测试里复刻一份 loop 必然漂移。另：mock model 发的是完整 `tool-call` 片、不发 `tool-input-delta`，故「入参流式渲染」这类特性离线只能测分支判定，真流表现仍归 L2。

**建议写入：** 坑 1 → `patterns/web-runtime-patterns.md`（构建期专属失效节）；坑 2 → `patterns/testing-env-patterns.md`；坑 3 → `patterns/web-runtime-patterns.md` §4 视觉基线节；规律 4 → `patterns/ai-action-contract.md`（agent loop 可测性节）或新起 `patterns/agent-loop-patterns.md`

**状态：** 待确认

## [2026-07-25] Andy/编排者 + Evaluator — 来源：M4.5-AGENT-LOOP 首轮 fan-out 验收 + 一轮 fixing + 复验

**类型：** 新规律 ×3 + 新坑 ×1

**内容：**

1. **e2e / 验收脚本的清理段自身绝不可再抛——它一抛就同时干掉「首因可见」与「环境干净」两件事。** M4.5 F010 首轮 PARTIAL 的主因：`pendingIds` 先 push 后 assert，闸门红线一回归就把 `undefined` 塞进 `deleteMany({in:[...]})`，Prisma 拒绝 → `finally` 整段中断 → 原始 `ASSERT FAIL` 被二次抛错盖掉 + dev 库残留污染下一个隔离 evaluator 的视觉基线。**而 e2e 失败在 fixing 轮里是常态，那正是清理最该生效的时刻。** 规律：清理段每步独立 try/catch 只告警；入删除清单的 id 必先过滤；清理键不得依赖「被测行为正确」才存在的字段（本例 `gateLogId` 在闸门回归时恒 null、`projectId` 因 scope=quarterly 恒 null，两把键同时落空——**跑前 id 基线差集**才是不受被测代码影响的键）。

2. **源码级正则断言可被写法绕过，行为级断言才免疫。** fix_round1 给清理段加的三条断言（catch 内无 `throw` / 无裸 `deleteMany` / id 必经 `.filter(`）全部被复验 evaluator 实测绕过并**复证等价于原缺陷**（`return Promise.reject(err)` / 跨行 `await prisma.x` ⏎ `.deleteMany(` / `.filter(() => true)`）。规律：当被测物是「顶层执行 main() 的脚本」这类不可 import 的形态时，源码级断言是权宜之计而非终局——应把关键函数导出后加行为级单测（喂一个必抛的 fn，断言包装器正常 resolve）。已入 backlog `BL-E2E-CLEANUP-PIN` 并写死触发时机。

3. **「0 findings」的 grep 判据必须先证明它能看见目标。** M4.5 文档漂移活过整个批次的成因是两道防线盲区重叠：doc-freshness 机械门不覆盖 `agent-architecture.md`，人工批末复核用的 grep 又带左括号（`stepCountIs(`）且不搜 `docs/`——代码写 `stepCountIs(5)`、文档写 `stepCountIs 5`，模式差一个字符就全盲。规律：以 grep 为证据的「无残留」结论，必须先构造一个已知命中项验证模式能抓到它（同 role-context「0 findings 必配活性证明」，此处是它在**文档面**的实例）。

4. **`framework/patterns/README.md` 的角色路由是真实的分发闸门，标错角色 = 该 pattern 对另一个角色不存在。** `testing-env-patterns.md` §9 正文写的是「清态必须按业务标记清，不能只按 `ref=PA.id` 清」——这是写给 Generator 的施工要求，但索引表把该文件的适用角色只标了 **Evaluator**。M4.5 F010 两条缺陷正是该分发缺口的直接后果（pattern 在库、Generator 没被路由到、批内原样复现）。**建议（需用户裁定，未擅改 framework）：** 角色列改为 `Generator / Evaluator`，触发条件补一条「新增或修改 e2e / smoke / 验收脚本的清理段」。

**建议写入：** 规律 1 → `patterns/testing-env-patterns.md` §9 扩写（或新起 e2e 脚本节）；规律 2 → `patterns/audit-methodology.md`（断言强度分级）；规律 3 → `patterns/audit-methodology.md` + `memory/role-context/evaluator.md`「0 findings 活性证明」段补文档面实例；坑 4 → `framework/patterns/README.md` 索引表角色列（**须用户确认后才改**）

**状态：** 待确认

## [2026-07-26] Andy/Generator + Evaluator — 来源：M4.6-CTX（生产实测缺陷修复，一轮 fixing）

**类型：** 新规律 ×3 + 新坑 ×1

**内容：**

1. **黑名单式否定断言天然有上限，正向精确匹配才是根治。** 「降级时不得编造项目名」这条，第一版写 `not.toContain('（')`（只挡带括号的），验收变异「编造名字但不带括号」直接绕过；第二版升级成「6 类占位名黑名单 + 括注正则」，复验又用 `${id} 星辰出海计划` / `${id}【王者荣耀出海】` 两种形态绕过。而**一行正向全串匹配**（断言 section 恰等于 `【当前上下文】用户正在项目 ${id} 的页面上与你对话。`）即可穷尽。规律：凡「不得编造 / 不得出现 / 不得包含」类断言，优先写成「必须恰好等于」——否定断言的强度取决于你能想到多少种违法形态，正向断言不受此限。

2. **机械钉的覆盖面必须与它守护的那句话逐项对齐，N-1 段 = 留了一道静默门。** 给文档 as-built 句加机械钉时，文档句列了 4 段（人格 / 项目上下文 / 知识段 / 工具指引），我的钉子只比对前 3 段实物；复验实测把「工具指引」挪到知识段之前 → 真实文档漂移，而钉子与两个集成测全绿。

3. **「取证器看不见目标」是系统性习惯问题，不是偶发失误。** 本会话内同一件事撞了三次：M4.5 复验打穿我三条源码级断言（`return Promise.reject` / 跨行写法 / `.filter(() => true)` 全部绕过）；M4.6 首轮我两条断言是死的（手工拼 system 绕开 `systemForAgent`、断言引用常量本身构成同义反复）；修 D4 时又踩两次（切片终点用 `indexOf('NO_TOOL_CLAUSE')` 而它在 import 行就出现 → 切出空串；order 数组按声明顺序 map 未 `sort` → 实物挪序照样绿）。根因是写测试时的默认姿势是「写出能通过的断言」而非「先构造一个必须失败的场景」。**建议做法：每写一条断言，先想清楚「什么改动应该让它红」，然后真的去改一次看它红不红**——不做这一步，断言的存在只提供心理安慰。

4. **mock-model 测试床把工具入参写死，会系统性掩盖「模型能否自己发现入参」这类缺陷。** M4.5 以 11/11 PASS 收尾，上线首轮真实对话就撞到「模型反问用户要 projectId」——因为 `ctx.projectId` 从不进 system 段，而 13 个工具把它当模型入参。测试床里所有 tool-call 的 input 都是脚本写死的（`input: { projectId: fx.id }`），模型从不需要「自己发现」任何入参，于是这条缺口落在测试床的结构性盲区里，11 条 acceptance 也无一要求「模型能在项目页自动认到当前项目」。规律：**凡「模型需要自己填的入参」，测试床验不到，必须在 acceptance 里单列一条装配层断言**（system 段里到底有没有它），或留给 L2 真模型验。

**建议写入：** 规律 1、2、3 → `patterns/audit-methodology.md`（断言强度分级 + 「先证明能看见目标」升为硬步骤）+ `memory/role-context/generator.md`「回归测试沉淀」段补一句；坑 4 → `patterns/agent-loop-patterns.md`（若采纳 M4.5 提案新建该文件）或 `patterns/ai-action-contract.md`

**状态：** 待确认
