# KOLMatrix 交互原型第二轮验收报告

> 复验日期：2026-07-15
> 验收对象：`docs/product/interaction-prototype.html`
> 基线：首轮报告 `docs/audits/KOLMatrix-interaction-prototype-review-2026-07-15.md`
> 当前提交：`c0d1340`
> 结论：**复验不通过；当前工作区仍有 3 个阻断原型冻结的语义 P0。**

## 0. 执行摘要

本轮修订不是文案性修补。组合待批不生效、报价与批量发信阈值、Brief 真修改、CRM 信号模型、周报 artifact、放款前置校验等关键机制已经进入原型状态代码，方向明显改善。提交 `5de5c23` 的 smoke 从 105 项扩到 134 项并全部通过；当前提交 `c0d1340` 又加入 Games 一级实体、按项目切换的知识视图和组织级折叠，最新完整 smoke 也已全绿。

但独立复核发现，测试把若干“源码里存在函数或文案”当成端到端成功，产生了假阳性。最典型的是测试名为“交付审核通过后财务才可放款（端到端）”，实际只检查源码包含 `payoutReady`；后面的“端到端黄金路径”也停在“放款条件不满足”，从未完成交付检查或点击放款。

当前仍有三个阻断原型冻结的核心问题：

1. 对象级权限只在项目列表使用，驾驶舱、作用域切换和项目详情可绕过，BD 可进入并操作不属于其 scope 的日韩项目。
2. `effectivePlan` 只认审批单，Lead 直接选定或 BD 额度内直接选定的组合永远不会成为下游有效组合。
3. 当前没有任何可实际走通的“交付合规完成 → 财务放款”路径，所谓黄金路径并未覆盖资金动作。

复验进行期间，另一实现者提交了 IA 改动 `c0d1340`。该改动把“游戏”提升为一级导航实体，并让 Brief 按当前项目组合项目级、游戏级和组织级知识；过程中短暂出现的脚本语法错误及 IA 测试误报均已在最终提交前修复。该方向改善了“组织 / 游戏 / 项目”的层级表达，但没有改变上述三条核心状态与权限缺口。

综合而言，本轮可以确认“P0 修复思路大部分正确”，但不能确认“P0 全清”或“黄金路径打通”。

---

## 1. 检查范围

- 检查目标：复验首轮 16 项问题的修复状态，并检查修复是否引入新的跨模块状态、权限和数据一致性问题。
- 平台/端：Web 单文件交互原型，包含桌面与声明的移动端样式。
- 分支/提交：`main` / `c0d1340`；验收过程中检测到另一实现者并发提交 IA 改动，未覆盖或回退。
- 变更范围：`848bff9..c0d1340`，重点为 `3ed6c10`、`5de5c23`、`c0d1340` 三次提交。
- 代码范围：`docs/product/interaction-prototype.html`、`scripts/test/prototype-smoke.js`。
- 规格基线：首轮审查报告、`docs/product/ai-native-usage.md`、`docs/product/gap-product-layer.md`、`docs/product/gap-data-layer.md`。
- 明确排除：落地页不作为产品原型；Next.js 业务实现尚未开始，不做原型还原验收。

## 2. 输入材料

- 首轮审查：`docs/audits/KOLMatrix-interaction-prototype-review-2026-07-15.md`
- 当前原型：`docs/product/interaction-prototype.html`
- 当前 smoke：`scripts/test/prototype-smoke.js`
- 产品使用方式：`docs/product/ai-native-usage.md`
- 产品与数据差距：`docs/product/gap-product-layer.md`、`docs/product/gap-data-layer.md`
- 当前状态说明：`progress.json`
- Git 变更：`848bff9..c0d1340`

## 3. 审查方法与限制

### 审查方式

1. 执行 `git pull --ff-only origin main`，结果为 `Already up to date`。
2. 在 `5de5c23` 工作区执行 `node scripts/test/prototype-smoke.js`，134 项断言通过。
3. 逐行审阅两次修复提交，独立追踪 `POLICY`、`APPROVALS`、`effectivePlan`、`DRAFTS`、`CRM`、`exitCriteria`、`payoutReady` 和事件委托的真实数据流。
4. 逐项复验首轮 16 项问题，不采信 `progress.json` 中的完成声明或 commit message。
5. 反向检查 smoke 的断言强度，区分实际操作验证与仅检查源码关键字。
6. 检测到并发 IA 改动后持续重跑 smoke。中间版本曾短暂初始化失败，随后已修复；最终版本脚本初始化成功，IA scope 断言也已通过。该中间态不计入最终问题清单。
7. 在内存中为现有 smoke 测试桩注入只读行为探针（未修改文件）：得到 `BD_DASH_HSR=true`、`BD_HSR_MARK_PUB=true`、`LEAD_DIRECT_PLAN_DRAFTS=0`。

### 限制

- in-app Browser 连接成功后返回可用浏览器列表 `[]`，因此无法执行真实点击、截图、移动端布局和焦点验证。按浏览器技能规则，本轮没有改用其他浏览器控制后端。
- 当前 smoke 使用模拟 DOM，并把 `setTimeout` 同步执行，不能覆盖真实异步切换、焦点、布局和快速操作竞态。
- 本报告只修改验收报告，不修改原型、产品代码、规格或状态机文件。

### 严重级别

- `P0`：阻断原型冻结或核心黄金路径。
- `P1`：进入业务开发前必须补齐的关键状态或交互。
- `P2`：不阻断方向，但会留下明确规格缺口。

## 4. 复验结果摘要

- 当前问题总数：16
- `P0`：3
- `P1`：10
- `P2`：3
- smoke：当前提交 `c0d1340` 为 `PASS`，但仍存在关键假阳性。
- 浏览器验收：`NOT RUN`，环境无可用 in-app Browser。
- 最终判定：`FAIL`

### 首轮问题状态矩阵

| 首轮问题 | 本轮状态 | 结论 |
|---|---|---|
| GAP-001 定位未锁定 | `RESOLVED` | `progress.json` 已记录用户决定：AI-native 全球游戏创作者营销平台 |
| GAP-002 阶段门仅 Brief 有守卫 | `PARTIAL` | 已有 `exitCriteria`，但其他项目可进入无数据阶段，越门理由仍错误 |
| GAP-003 交付前可放款 | `RESOLVED / 新阻断` | 交付前已阻断，但现在没有一条实际可完成的放款路径 |
| GAP-004 审批不绑定业务、阈值缺失 | `PARTIAL` | 三阈值已使用，待批组合被阻断；直接组合、外部动作撤销和批量信号仍错误 |
| GAP-005 角色边界失效 | `FAIL` | 项目列表已过滤，但驾驶舱、scope bar、详情入口仍绕过对象级权限 |
| GAP-006 人审修改是假动作 | `PARTIAL` | Brief 预算/市场已做真；知识卡、邮件、团队判断、周报编辑仍是假动作 |
| GAP-007 Match→Reach 数量不一致 | `PARTIAL` | 数量对齐，但用 6 位候选循环伪造 14 个重复创作者，模板也错配 |
| GAP-008 信号驱动 CRM 缺失 | `PARTIAL` | 单封发送有信号链；批量发送、重试和抑制名单不一致 |
| GAP-009 周报与分享缺失 | `PARTIAL` | artifact、分享闸门和撤销已存在；报告数据静态且“可编辑”仍不可编辑 |
| GAP-010 全球运营工作流 | `OPEN` | 未修 |
| GAP-011 Assets | `OPEN` | 未决策/未修 |
| GAP-012 移动端 | `OPEN` | 未修 |
| GAP-013 失败与恢复 | `PARTIAL` | 邮件增加部分失败；其他外部动作仍无完整四态 |
| GAP-014 精调抽屉 | `OPEN` | 未修 |
| GAP-015 数据新鲜度 | `OPEN` | 未修 |
| GAP-016 可访问性/次要控件 | `OPEN` | 未修 |

---

## 5. 结构化问题清单

### RE-GAP-001 对象级权限仍可从驾驶舱、作用域和详情入口绕过

- 严重级别：`P0`
- 页面/模块：Dashboard / Campaigns / Match / Delivery / Agent 跳转
- 原型期望：`POLICY.scope` 是对象级权限的唯一来源；BD 只能读取和操作自己负责的项目。
- 当前实际：只有 `renderCampaigns` 使用 `visibleCampaigns()`。Dashboard 仍遍历全部 `CAMPAIGNS`，显示全部项目、ROI 和所有项目待办；`scopeBar` 仍列全部项目；`renderCampaignDetail` 和 `[data-camp]` 跳转没有 `inScope` 守卫。BD 可从 Dashboard 的 HSR“去审核”待办进入日韩项目，并因拥有 `mark-pub` 动作权限而操作该项目。
- 差距类型：权限 / 数据边界
- 影响：上一轮最重要的角色 P0 未关闭；会造成跨区域项目信息泄露和越权业务动作。
- 证据：原型 1012-1038 行定义对象 scope；Dashboard 1527-1578 行仍遍历全部项目；详情 1863-1875 行、scope bar 2067-2076 行和事件入口 2915-2923 行均无 `inScope` 守卫。行为探针返回 `BD_DASH_HSR=true`、`BD_HSR_MARK_PUB=true`。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：产品/交互实现者。`renderCampaignDetail`、`scopeBar`、Dashboard queue/KPI/campaign list、Agent 硬编码跳转必须统一经过 `inScope`；动作权限还必须同时校验对象权限。

### RE-GAP-002 直接选定的组合不会成为有效组合

- 严重级别：`P0`
- 页面/模块：Match → Reach / 阶段 03
- 原型期望：Lead 作为组合 owner 可直接拍板；BD 在阈值内直接选定时，下游应消费该已生效组合。超阈值组合则在批准后生效。
- 当前实际：`effectivePlan(cid)` 只查找状态为 approved 的审批单。直接选择分支只设置全局 `selectedPlan=id`，没有创建 approved 业务记录。因此 Lead 直接选择、以及 BD 选择 `$7,400` 额度内方案后，Reach 的 `draftsFor` 仍拿不到有效组合，阶段 03 的 `exitCriteria` 也继续判定“尚未选定组合”。
- 差距类型：状态 / 数据映射
- 影响：营销负责人自己的核心决策路径不可用；当前只有“BD 超阈值提交 → Lead 批准”这一种偶然可用路径。
- 证据：原型 1166-1184 行由 `effectivePlan` 生成 roster；1441-1444 行只查 approved 审批；2826-2832 行的阶段门同样只认 `effectivePlan`；2890-2903 行的直接分支只写全局 `selectedPlan`。Lead 直接选择 `$7,400` 方案后的行为探针返回 `LEAD_DIRECT_PLAN_DRAFTS=0`。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：产品/交互实现者。建立按 campaign 存储的 `activePlan`，区分 direct activation、pending approval、approved activation、superseded；禁止用全局 `selectedPlan` 同时承担 UI 选中态和业务生效态。

### RE-GAP-003 “交付 → 财务放款”黄金路径仍不可执行

- 严重级别：`P0`
- 页面/模块：Delivery / Settlement / smoke 黄金路径
- 原型期望：至少一个 campaign 能从交付审核、披露合规通过，一直走到 finance 点击放款并看到逐笔结果。
- 当前实际：GSEA 的 `#ad` 检查固定为未通过，原型没有任何动作能修改它；因此 `payoutReady` 永远不会为 GSEA 返回 true。HSR 的 `#ad` 为通过，但当前唯一 BD 的对象 scope 不含 HSR；同时 HSR 的 04 阶段因没有 replies/emails 直接渲染空态，结算面板不可达。现有“端到端”测试只检查源码里存在 `payoutReady`，真正的 E2E 步骤仅验证“放款条件不满足”，没有执行交付或放款。
- 差距类型：工作流 / 测试假阳性 / 资金闸门
- 影响：报告中最关键的冻结门槛仍未达到，却被 smoke 错误标为已打通。
- 证据：原型 917 行将 GSEA `#ad` 固定为未通过；1712-1721 行的 `payoutReady` 因此阻断；1832-1846 行只有发布动作、没有披露审核动作。smoke 616-623 行只检索 `payoutReady`，700-706 行只验证“条件未满足”。
- 相关文件：`docs/product/interaction-prototype.html`、`scripts/test/prototype-smoke.js`
- 建议移交：产品/测试实现者。增加真实可操作的披露审核状态，补齐区域 BD/项目 owner，随后用一次完整 UI 状态序列验证“交付检查 → finance 放款”，不得再以源码关键字代替行为断言。

### RE-GAP-004 审批后的不可逆动作仍被错误地提供“撤销”

- 严重级别：`P1`
- 页面/模块：驾驶舱审批 / 批量发信 / 报价
- 原型期望：批准组合可撤回业务生效；但批准后立即执行的发信和对外报价不可撤销，必须在批准前明确动作后果。
- 当前实际：`approveIt` 先执行任意 `a.action()`，随后统一提供 `undoToast`。批量发信批准会把邮件标为已发送，报价批准会确认条款；点击撤销只把审批单改回 pending，无法撤回已发邮件或已作出的承诺。
- 差距类型：状态 / 不可逆动作
- 影响：UI 会向用户承诺不存在的撤销能力，审计状态还会与外部事实冲突。
- 证据：原型 `approveIt` 1446-1453 行对所有审批统一执行 action 后提供 undo；批量发送 action 在 2702-2708 行，报价 action 在 2734-2743 行。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：产品/交互实现者。审批对象需要声明 `effectType=reversible|external`；外部动作批准后不显示撤销，只允许补救动作和审计记录。

### RE-GAP-005 组合人数通过复制同一批 KOL 伪造，邮件并非逐人个性化

- 严重级别：`P1`
- 页面/模块：Match → Reach
- 原型期望：14 人组合应对应 14 个唯一创作者，每封草稿消费该创作者自己的画像。
- 当前实际：GSEA 只有 6 位候选，`rosterNames` 通过循环 `rest` 并给名称添加 `(2)`、`(3)` 凑满 14 人。邮件模板又按 3 个固定模板循环，因此 Linh 等创作者会收到引用 Ayu/Maya 内容的正文。
- 差距类型：数据完整性 / 个性化可信度
- 影响：数量断言虽然通过，但真实对象关系是假的；这会直接破坏 AI 个性化触达的核心卖点。
- 证据：原型 `rosterNames` 1166-1184 行循环复用候选和模板；smoke 529-535 行只排除了“恰好 3 封”，没有校验唯一性和内容归属。
- 相关文件：`docs/product/interaction-prototype.html`、`scripts/test/prototype-smoke.js`
- 建议移交：产品数据设计者。缩小方案人数到现有唯一候选数，或补足唯一 mock KOL；草稿必须按 `kolId` 关联画像和模板输入，不以数组下标轮换。

### RE-GAP-006 批量发送绕过 CRM 信号入口，抑制名单也未一致执行

- 严重级别：`P1`
- 页面/模块：Reach / CRM
- 原型期望：单封与批量发送使用同一信号和状态入口；退信进入抑制名单后不能直接重发。
- 当前实际：单封发送调用 `applySignal`，但批量审批 action 和直接批量发送只修改 `d.status`，没有推进 CRM、写 evidence 或更新 `SUPPRESS`。退信后的“重试”只是重置为草稿，`SUPPRESS` 仍存在，发送函数也不检查抑制名单，用户可对同一无效地址再次发送。
- 差距类型：状态 / 合规 / 数据映射
- 影响：同一业务动作因入口不同产生不同 CRM 事实，信号驱动原则不成立，抑制名单也只是标签。
- 证据：原型 `applySignal` 1149-1159 行；单封发送 2653-2689 行调用该入口；重试 2692-2697 行及批量发送 2698-2718 行没有保持同一状态与抑制规则。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：产品/交互实现者。所有发送结果统一进入 `applySignal`；抑制名单成为发送前硬门，必须先补有效联系方式或解除抑制并留痕。

### RE-GAP-007 “AI 起草、人审阅、可修正”只完成了 Brief 两个字段

- 严重级别：`P1`
- 页面/模块：Brief / 知识库 / Reach / Insight / 关系资产
- 原型期望：用户可修正 Agent 生成的关键 artifact，修改会落状态并影响下游。
- 当前实际：预算和目标市场已可真修改并展示 diff。知识卡“修正”仍只回复提示；邮件“编辑”、添加团队判断仍是 `data-noop`；周报标注“可编辑”，点击后也没有周报字段修改分支；Match 的“少点大号”仍只回复“已重排”，数据没有变化。
- 差距类型：交互 / 状态
- 影响：本轮只验证了一个局部 demo，尚未证明通用的人机共创交互契约。
- 证据：知识卡修正 2968-2971 行只回复提示；Reach 的团队判断、采用回信和邮件编辑仍在 2249、2282、2302 行使用 `data-noop`；周报 2350-2377 行没有可编辑字段状态。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：产品设计者。至少再做真知识卡修正、单封邮件编辑、周报摘要编辑，并统一 diff/来源/影响/撤销协议。

### RE-GAP-008 多项目阶段链仍有断点，越门审计理由与实际不符

- 严重级别：`P1`
- 页面/模块：项目阶段 02/05
- 原型期望：通过一个阶段门后，下一阶段必须获得可工作的业务对象；越过软门要记录用户填写的真实理由。
- 当前实际：ZZZ 在 02 有候选池，因此 `exitCriteria(2)` 通过，但 `plans=null`，推进到 03 后只得到空态，没有生成方案的动作。任何软门越过都由 `advanceStage(true)` 记录固定理由“知识覆盖度 <80%”，即使实际越过的是“终稿尚未标记可发布”；弹窗也没有理由输入。
- 差距类型：状态 / 审计
- 影响：除 GSEA 外的项目无法验证责任链；审计日志会记录错误事实。
- 证据：原型阶段数据与 `plans` 分片在 1050-1100 行；阶段 03 画布在 1806-1817 行依赖固定组合展示；`exitCriteria` 2817-2851 行与 `gateAdvance` 2853-2868 行没有采集越门理由。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：产品/交互实现者。阶段推进需触发下一阶段 artifact 创建；所有 override 使用当前 `bad[]` + 用户输入理由生成审计记录。

### RE-GAP-009 周报 artifact 已出现，但数据和“可编辑”仍是静态宣称

- 严重级别：`P1`
- 页面/模块：Insight
- 原型期望：周报读取当前 CRM/ROI/项目状态生成，用户能修改摘要后再导出或分享。
- 当前实际：artifact、分享闸门、脱敏说明和撤销已实现；但数字固定为 23/8/3，与本轮实际只发送一封的 CRM 状态无关；摘要的“改”没有对应状态修改，导出 PDF 也只切换一个布尔值。
- 差距类型：数据映射 / 交互
- 影响：周报仍不是工作流数据的真实产物，容易把静态假数据包装成 AI 结论。
- 证据：原型 `REPORT` / `reportCard` 2350-2377 行固定写入 23/8/3；生成逻辑 2574-2579 行只宣称“摘要可编辑”；导出 2961-2962 行只切换布尔状态。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：产品/交互实现者。报告指标从 CRM、campaign、ROI 状态派生；至少让摘要编辑和导出结果可观察。

### RE-GAP-010 全球化仍主要是地区字段，不是运营工作流

- 严重级别：`P1`
- 页面/模块：Brief / Reach / Delivery / 合规
- 原型期望：体现币种、时区、双语审阅、本地 reviewer、区域 scope 和逐市场披露要求。
- 当前实际：本轮没有新增相关状态；仍只有多地区样例和 UTC+8 周报时间范围，泰国邮件依旧为泰语问候 + 中文正文。
- 差距类型：全球化 / 产品能力
- 影响：已锁定“全球游戏创作者营销”定位，但原型没有证明全球团队如何实际执行。
- 证据：原型 campaign 与邮件样例仍主要集中在 850-903 行；周报时间固定为 UTC+8（2362 行）；未定义 currency/locale/本地化审阅流程。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：产品负责人。完成一个北美 + 东南亚跨市场样例，包含本地币种、时区、语言审阅和合规 owner。

### RE-GAP-011 Assets 模块仍未决策

- 严重级别：`P1`
- 页面/模块：Assets / Reach
- 原型期望：按 `ai-native-usage.md` 生成邮件/短视频脚本变体并送入 Reach，或正式从范围中删除。
- 当前实际：原型仍没有 Assets 导航、artifact 变体树或相关意图；产品使用方式仍将其列为正式模块。
- 差距类型：范围 / 功能缺失
- 影响：开发范围存在歧义。
- 证据：`ai-native-usage.md` 203-213 行仍定义 Assets；原型导航与 `renderModule` 未提供 Assets 模块。
- 相关文件：`docs/product/ai-native-usage.md`、`docs/product/interaction-prototype.html`
- 建议移交：产品负责人。原型冻结前明确保留、合并或删除。

### RE-GAP-012 移动端仍不可用

- 严重级别：`P1`
- 页面/模块：响应式
- 原型期望：窄屏可在导航、画布和 Agent 之间切换。
- 当前实际：`≤860px` 仍直接隐藏 rail，dock 固定覆盖 88vw，仍无开关和返回路径。
- 差距类型：响应式
- 影响：移动端无法完成任务；本轮因浏览器不可用未做视觉截图，但源码风险未变化。
- 证据：原型 689-695 行在窄屏隐藏 rail，并将 dock 固定覆盖到 88vw；没有移动端开关或返回路径。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：交互设计者。实现导航抽屉、画布、Agent sheet 三态并做 390/768/1440px 浏览器验收。

### RE-GAP-013 失败恢复仅覆盖部分邮件场景

- 严重级别：`P1`
- 页面/模块：Agent / 知识库 / 邮件 / partner / 分享
- 原型期望：外部动作具有进行中、部分成功、失败重试和人工接管状态。
- 当前实际：单封邮件增加 queued/bounced/retry，批量邮件也显示部分成功；但知识解析、搜索、报价审批执行、partner 放款和分享仍没有失败/超时/重试。邮件 retry 还不能修复无效邮箱根因。
- 差距类型：异常状态 / 信任
- 影响：AI 与外部服务失效时的控制感仍未被原型验证。
- 证据：邮件失败与重试在 2291-2303、2653-2697 行；分享和 partner 操作仍只有成功布尔状态，全文件没有对应失败状态。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：产品/交互设计者。优先补知识解析失败和放款失败两条，与现有邮件部分失败共同形成跨模块错误契约。

### RE-GAP-014 手工精调抽屉仍缺失

- 严重级别：`P2`
- 页面/模块：Match
- 原型期望：自然语言主入口之外提供少量精确约束兜底。
- 当前实际：仍只有对话精调和规则审计，没有精调抽屉。
- 差距类型：交互兜底
- 影响：专业用户无法核对 Agent 解析出的精确条件。
- 证据：`ai-native-usage.md` 128-147 行；原型 `renderMatch` 2121 行起仅提供对话精调和审计。
- 相关文件：`docs/product/ai-native-usage.md`、`docs/product/interaction-prototype.html`
- 建议移交：产品设计者。保留 4-6 个高价值约束并展示与自然语言解析的双向同步。

### RE-GAP-015 数据新鲜度仍未呈现

- 严重级别：`P2`
- 页面/模块：KOL 评估 / Match
- 原型期望：来源、评估时间和数据新鲜度共同支持花钱决策。
- 当前实际：仍只有来源徽标，没有 `assessedAt`、`dataFreshness` 或过期状态。
- 差距类型：数据可信度
- 影响：用户无法判断受众和可信评分是否仍有效。
- 证据：`gap-data-layer.md` 80-100 行；原型的数据溯源展示在 2237 行，但未定义 `assessedAt`、`dataFreshness` 或过期状态。
- 相关文件：`docs/product/gap-data-layer.md`、`docs/product/interaction-prototype.html`
- 建议移交：产品数据设计者。增加更新时间、过期策略和 Agent 降级提示。

### RE-GAP-016 可访问性和示意控件问题未处理

- 严重级别：`P2`
- 页面/模块：弹窗 / 顶栏 / 全局
- 原型期望：不可逆动作弹窗具备标题关联、Escape、焦点约束和恢复；可见控件有明确结果。
- 当前实际：仍无 `aria-labelledby`、Escape、focus trap/restore；通知按钮无行为；多个按钮仍走 `data-noop`。
- 差距类型：可访问性 / 交互完整性
- 影响：开发规格仍存在模糊和键盘风险。
- 证据：原型弹窗与事件处理未定义 `aria-labelledby`、Escape、focus trap/restore；`data-noop` 统一在 2993 行只显示示意 toast。
- 相关文件：`docs/product/interaction-prototype.html`
- 建议移交：交互/前端设计者。冻结前清理示意控件并补关键弹窗键盘契约。

---

## 6. Smoke 可信度审查

当前提交 `c0d1340` 的 `node scripts/test/prototype-smoke.js` 全部通过，新增 IA scope 断言也已通过。但以下断言不足以支撑其名称所声称的结论，测试全绿不能替代业务状态链验收。

| 断言 | 实际验证 | 缺失 |
|---|---|---|
| 批量发信阈值已执行 | 只检查源码出现 `THRESHOLD.bulkSend` | 未实际提交、批准、检查逐封/CRM 状态 |
| CRM 状态机存在/回复推进 | 只检查源码关键字 | 未验证批量入口、抑制名单和异步 scope |
| 交付审核后财务放款（端到端） | 只检查源码出现 `payoutReady` | 未完成交付、未让 `payoutReady=true`、未点放款 |
| 邮件草稿数=组合人数 | 只排除“等于 3” | 未检查唯一 KOL、方案人数和内容归属 |
| BD 看不到不负责项目 | 只检查 Campaigns 列表 | 未检查 Dashboard、scope bar、详情直达和动作权限 |

证据：`scripts/test/prototype-smoke.js` 412-425、485-489、529-535、583-593、616-623、700-706 行。

下一轮测试至少应新增：

1. BD Dashboard 和所有 scope selector 不出现 HSR/SKY，并对伪造 `data-camp=hsr` 做详情级阻断。
2. Lead 直接选择方案后，Reach 产生唯一 roster 草稿且 03 可推进。
3. 实际完成 GSEA `#ad` 审核、标记可发布、切 finance、点击放款并断言逐笔 `paid=true`。
4. 批量发送审批后逐封走 signal，CRM 状态与抑制名单一致，且不可撤销外部事实。
5. 14 位组合必须对应 14 个唯一 `kolId`，每封正文引用正确画像。

## 7. 待确认事项

1. 定位已在 `progress.json` 记录为“AI-native 全球游戏创作者营销平台”，但 `ai-native-usage.md` 和原型首屏尚未形成统一的一句话定位，冻结前应同步权威文档。
2. 区域通过 `scope` 表达意味着需要多个同角色用户。原型目前只有一个东南亚 BD，却同时存在日韩项目；需决定如何演示同角色多用户/多区域责任。
3. BD 对 `$8,000` 以下组合是否可直接生效，还是所有组合都必须由 Lead 批准？当前角色 gates 与阈值语义存在歧义。
4. 结算面板继续放在 04 是否只是信息架构归属？若是，应让 05 的交付事件驱动 04 面板，而不是要求用户返回历史阶段寻找放款按钮。
5. Assets 和移动端是否属于首版冻结范围；若不属于，应明确标注 out of scope，而不是继续保留隐含承诺。

## 8. 不在本次范围内

- 未审查 Next.js 业务实现，当前工程仍处于原型/架构规划阶段。
- 未验证真实 LLM、Resend、Stripe、电子签或平台 API。
- 未执行生产或 Staging 写操作。
- 未获得真实浏览器截图与移动端交互证据。
- 本次仅输出审查结果，未做任何产品代码、原型或测试代码修改。

## 9. 结论

### 是否通过第二轮验收

**不通过。**

本轮已经证明修复方向有效：原型从“展示审批”前进到了“部分业务对象受审批约束”，从静态回复前进到了单封邮件信号链，从聊天摘要前进到了周报 artifact。这些改动应保留。

但当前不能接受“P0 全清 + 黄金路径已打通”的结论。最新工作区虽然能够初始化且 smoke 全绿，对象级权限仍可真实绕过，组合 owner 的直接决策路径不可用，资金路径也从未被走通。继续按当前原型冻结开发，会把新的状态分裂和权限缺口写进业务实体与权限模型。

### 下一轮最低验收门槛

1. 修复三个语义 P0，并为每项补行为断言而非源码关键字断言。
2. 真正走完一次：Brief → 组合生效 → 唯一 roster → 单/批量触达 → 报价审批 → 交付合规 → finance 放款 → 周报。
3. 至少补一个全球化样例和一个非邮件外部动作失败样例。
4. 取得真实浏览器的桌面/移动截图与交互证据。

- 是否建议继续修订：**是。**
- 是否建议恢复全面业务开发：**否。** 可继续不依赖这些产品状态的基础设施工作，但业务实体和工作流实现应等待 P0 复验通过。
- 是否建议重新验收：**是。** P0 全清后进行第三轮。
- 备注：本次仅输出审查结果，未做任何产品实现修改。
