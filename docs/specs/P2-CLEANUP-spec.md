# P2-CLEANUP — 需求池 P2 清理（普通批次）

> **批次类型：** 普通批次（全部 `executor:generator`），`planning → building → verifying → done`。
> **车道：** 快车道（单会话，Planner/Generator 主上下文，Evaluator 隔离 subagent）。无 `role_assignments`。
> **Spec lock：** 2026-07-21 用户确认（两处裁决见 §3 D2/D4）。
> **事实依据：** 本批 planning 阶段一次只读勘查（Explore subagent），三条 backlog 的实物现状均已核到 `文件:行`；结论见各 feature 「实物」段。

## 1. 背景与目标

ARCH-M05（M0.5 六页工作台）交付后，需求池积压三条 P2。本批次清空需求池，同时补两处勘查中暴露的真实缺口，为 M1 BRIEF-CAMPAIGNS 让出干净起点。

**勘查推翻了两条池内描述，用户已裁决：**

| 条目 | 池内原描述 | 实物 | 裁决（2026-07-21） |
|---|---|---|---|
| BL-FE-14 | 「容器 chrome 逐字重复」 | 逐字重复仅 **3 行**，两处有 **3 处真实分叉**（`border-dashed` / `stage` 三元文案 / 多一层 flex 容器），下游 `HandoffCard` 另有 11 props vs 5 props 差集 | **两件都做** —— 抽 `HandoffPanel` 且经该抽象把夹具对齐生产（合为 F004，不拆两条） |
| BL-FE-12 | 「无 localStorage/cookie 持久层」 | 属实；但 `AppWrappers.tsx:20-22` 全树包在 `NoSSR (ssr:false)` 中，**全站本无 SSR 首屏** → cookie/SSR 方案零收益 | localStorage + pre-paint 内联脚本（D1） |

**额外纳入两项（用户 2026-07-21 确认）：**
- CreatorDrawer 回归覆盖 —— 该抽屉当前 visual 与交互**零覆盖**，正是 BL-FE-15 能活到现在的原因（F005）
- Avatar 的 Chakra `colorMode` 脱节 —— 与 `body.dark` 是两套互不相通的状态，不修则等于持久化一个半坏的深色（F003）

## 2. 功能范围（5 条，全 generator）

### F001 创作者抽屉遮罩点击关闭（BL-FE-15）

**实物：** `src/components/creators/CreatorDrawer.tsx:302-315`。根因已定位——项目无 `ChakraProvider`/theme，Chakra 默认给 `.chakra-modal__content-container` 的 `$100vh` token 不解析 → 容器高度塌 0 → 承载 `closeOnOverlayClick` 的点击区消失。`:313` `containerProps={{ style: { zIndex: 110 } }}` 只透传了 `zIndex`；`:308-312` 注释自证 className 路线已被推翻（会被组件内部 spread 覆盖），**`style` 是唯一可用通道**。

- 按 D3 修法优先级恢复遮罩点击关闭
- **同 commit 改真文件头 `:3` 注释**：现文「Esc + 遮罩关闭为 Drawer 自带」是假陈述（Esc 属实、遮罩不属实）；修好后如实描述实际机制（含为何要显式给 container 高度）
- 不得引入 `ChakraProvider`（项目明确无 theme，见 CLAUDE.md）
- 现存三条关闭路径（X 钮 `:328-335` / Esc `:303` 隐式 / dw-foot `:673-685` 副作用型）**均不得回归**
- lint + tsc 绿

### F002 深色模式持久化（BL-FE-12）

**实物：** `src/hooks/useColorMode.ts` 全文 31 行，唯一状态源是 `document.body.classList`，React state 仅镜像，无持久层；`setDark` 导出但零消费。唯一生产消费点 `src/components/navbar/index.tsx:30,92-103`。全项目 `localStorage|sessionStorage|document.cookie|next/headers` **零命中** —— 本批是第一处持久化。

- `useColorMode` 增持久层：`setDark` / `toggle` 写入 localStorage；挂载时读回
- `src/app/layout.tsx` 补 **pre-paint 内联脚本**（`<body>` 首子节点）：paint 前读 localStorage 置 `body.dark`，消除闪烁
- 存储键与取值按 D1；**缺省 / 损坏值一律回落浅色**（默认不变，不得动现有浅色基线）
- 死代码不碰（D6）
- lint + tsc 绿

### F003 Avatar colorMode 脱节修复

**实物：** `src/components/image/Avatar.tsx:2` 引 `@chakra-ui/system` 自带的 `useColorMode`，`:19,29` 用它决定 `borderColor`。项目无 `ChakraProvider` → 这个 `colorMode` 与 `body.dark` **互不相通**，深色下 Avatar 边框不跟随。

- 改读项目统一状态源（`hooks/useColorMode`），与 F002 同一真相
- 仍不得引入 `ChakraProvider`；`chakra()` 包装本身保留
- 浅色态渲染不得变化（避免污染既有基线）
- lint + tsc 绿

### F004 抽 HandoffPanel + 夹具对齐生产（BL-FE-14）

**实物：** 生产侧 `src/components/copilot/HandoffCollab.tsx:72-79`，夹具侧 `src/app/preview/agent-canvas/page.tsx:29-34`。逐字重复 3 行（`SectionLabel` / `MdGroups` / 标签文案）；三处分叉见 §1 表。`/preview/agent-canvas` **是视觉回归夹具不是产品页**（文件头 `:5-6` 自述 + `tests/visual/agent-canvas.spec.ts:10` 消费）。共享呈现层 `common/HandoffCard.tsx:21-39`（11 props）。

- 抽 `common/HandoffPanel.tsx` 承载容器 chrome（`SurfaceCard` + `SectionLabel` + 图标 + 标签文案）
- **抽象必须显式容纳三处分叉**，不得靠夹具将就：`border-dashed` 与 `stage` 文案作为 props / 变体；多张卡的 flex 容器由 panel 提供，单张卡亦走同一路径
- **夹具经此对齐生产**：`border-dashed` 统一到生产口径（这是本 feature 的回归价值所在——基线此前守的不是生产实际外观）
- 两处重复导入（`MdGroups`/`SectionLabel`/`SurfaceCard`）随之收敛
- 预期改动 `agent-canvas.png` 基线 → 由 F005 统一重生
- lint + tsc 绿

### F005 CreatorDrawer 入视觉基线 + 单次重生（必须最后）

- `tests/visual/` 新增 CreatorDrawer **开启态**基线（沿 ARCH-M05 F017 范式：route mock 固定夹具，确定性优先）
- **硬断言纪律（框架 v1.0.6 §4.3）：** 必须配 `waitFor(关键文案)` —— 抽屉渲染 null 时超时硬失败，不许把空白固化成合法基线
- F001-F004 全部合入后**单次**重生全部基线（`--update-snapshots=all`，框架 v1.0.6 §4.2；linux 基线经 CI 重生）
- 断言阈值维持 ARCH-M05 F017 收紧后的口径，**不得为让基线过关而放宽**
- 本地 `test:visual` 全绿 + CI visual 绿；fe-audit 三脚本无回归

## 3. 关键设计决策

- **D1 持久化载体 = localStorage + pre-paint 内联脚本。** 依据：`AppWrappers.tsx:20-22` 全树 `NoSSR (ssr:false)`，全站客户端渲染，cookie/SSR 读取无收益且徒增服务端耦合。键名与取值由 Generator 定（建议 `kolmatrix.colorMode` / `'light'|'dark'`），须在 commit message 记录。
- **D2 单一状态源 = `body.dark`。** Chakra 的 `colorMode` 在无 Provider 时是孤儿状态，一律不作为真相（F003 据此改造）。本批**不引入** `ChakraProvider`——与 CLAUDE.md「设计系统由 Tailwind + CSS 变量驱动，不是 Chakra theme」一致。
- **D3 遮罩修法优先级（F001）：** ① 首选 `containerProps.style` 补高度，恢复 Chakra 原生 `closeOnOverlayClick` 语义（最小改动，且让文件头注释重新成真）；② 实测不生效再退 FIX-4 自写 scrim 模式（`CopilotPanel.tsx:306-334` 为参照实现）。**两套不得并存**；最终采纳哪条须在 commit message 与文件头注释写明。
- **D4 BL-FE-14 裁决（用户 2026-07-21）：** 选「两件都做」。抽象与夹具对齐**合并为 F004 单条**——若拆成两条，「让夹具偏离生产」与「让夹具跟随生产」会在同一批次内互相打架。
- **D5 基线策略：** F001-F004 期间 `test:visual` 预期红（改动即目的），以「diff 与本 spec 拍板改动逐处对账」代替绿灯；F005 单次重生。期间 lint/tsc 必须绿——push 前本地跑 `next lint` + `tsc --noEmit`。
- **D6 死代码不碰：** `navbar/Configurator.tsx`、`navbar/RTL.tsx`、`fixedPlugin/FixedPlugin.tsx` 仍直接操作 `body.dark`，但均无组件渲染（唯一引用是 `CenteredAuthLayout/index.tsx:20` 一处**被注释掉的** `{/* <FixedPlugin /> */}`）。本批不改不删，处置留 `docs/dev/template-inventory.md`。
- **D7 铁律 10：** commit 打 `feat(P2-CLEANUP-F00N)` 标签；BL-FE-12 / BL-FE-14 / BL-FE-15 三条同批从 `backlog.json` 移除（本 spec 即其决策归档）。
- **D8 串行约束：** F002 → F003 同域（深色状态源），F003 依赖 F002 的统一后状态源，须串行；F001 与 F004 文件集不重叠可穿插；**F005 必须最后**（吸收 F001-F004 全部视觉变化，单次重生）。

## 4. 验收口径（verifying）

- **fan-out：** 5 features ≥ 触发门 4 → verifying 走 fan-out + 对抗复核（`framework/harness/orchestration-patterns.md` §4）
- **F001 逐路径实测：** 遮罩点击 / X 钮 / Esc / dw-foot 四条关闭路径**逐条浏览器实测**，桌面与移动视口各一遍；另验关闭后不残留遮挡层（下层交互可用）。UI 实测**走 standalone 不走 `next dev`**（框架 v1.0.6 `testing-env-patterns.md` §7）
- **F001 注释真实性：** 文件头注释所述机制须与实物一致——沿用 ARCH-M05 verify-A C6 的「文档新鲜度」clause（框架 v1.0.6 已转正）
- **F002 持久化实测：** 切深色 → 刷新 → 仍深色；切回浅色 → 刷新 → 仍浅色；**清 localStorage / 写入损坏值 → 回落浅色**；肉眼确认刷新无浅色闪烁
- **F003：** 深色下 Avatar 边框跟随；浅色态与改造前像素一致
- **F004：** 生产侧三处分叉（`border-dashed` / `stage` 三元文案 / 多卡 flex 容器）改造后逐项仍成立；夹具 `border-dashed` 已对齐生产；`HandoffCard` 11 props 全路径未退化
- **F005：** CreatorDrawer 基线含 `waitFor` 硬断言（**验证方式：临时抽掉 mock 数据应硬失败**，不得静默出空白绿灯）；阈值未被放宽（与 ARCH-M05 F017 口径比对）
- **就绪回归：** `next lint` + `tsc --noEmit` + `test:visual` 全绿；fe-audit 三脚本无回归（复跑前按框架 v1.0.6「检测器活性证明」自证脚本未死）

## 5. 不在本批次

- M1 BRIEF-CAMPAIGNS 任何内容（下一批次）
- 引入 `ChakraProvider` / Chakra theme（与项目设计系统定位冲突）
- 死代码模板组件的删除或改造（D6）
- harness-fit P0-3 / P1-1~3 / P2-1~5（长期挂起）
