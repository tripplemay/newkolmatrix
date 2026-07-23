# M3-A F008 · V6 ConversationInbox 接真 规划稿 / 审计请求

> **发起者：** Andy (Generator)
> **日期：** 2026-07-23
> **触发：** F008 开工前审计——UI feature 强制（ui-fidelity-guardrail §3）+ spec 决策缺口
> **状态：** 快车道同会话裁决（pre-impl-adjudication §4.6 豁免：Planner/Generator 同实例，裁决段分段标注，同 commit 完成）

## 1. 背景 & 目标

F008 = V6 三栏收件箱数据源切真（thread/message/quote）+ 两处 D6 stub（confirmSend/confirmQuote）替换为真 pending→GET 详情→confirm→execute 链路。约束：ui-inventory V6 24 元素逐处保持；「确认报价」仅 negotiating 条件渲染（裁决 #6）；五态 pill = crmInfer 真值；空态语义保留；视觉基线对账重生（§4.5）。

**挂载现状（实物核证）：** `campaigns/[id]/page.tsx` RSC 组装 `loadMatchSurfaceData` → `ProjectDetail` prop → env 组件（M2-A F005 先例）。F008 沿此加 `loadReachSurfaceData`。动作后刷新 = `router.refresh()` 重跑 RSC。

## 2. 公共组件复用清单（guardrail §3.2）

沿 ARCH-M05 F010 已建结构改造不重建：`SurfaceCard` / `GateConfirm` / `Button` / `CircularProgress` / `ProjectAvatar` / `useToast` / `readContractSlot`（契约读取层）。新增 API 消费均走既有 `/api/actions/[id]*`（F002）+ 两个薄 route（见 #1/#4）。

## 3. 决议请求（5 条）

| # | 决议点 | A 方案 | B 方案 | 建议 |
|---|---|---|---|---|
| 1 | **「确认报价」真链的条款来源**（原型 harm 三行值是 mock；真链必须有金额/交付物/范围输入源，本批无 proposed Quote 写入口） | 前置最小条款表单（金额/币种/交付物/范围）→ POST `/api/reach/quote` → 真 harm 确认卡两步票据；表单 modal 登记 ui-inventory 新增例外 | 读 thread 最新 proposed Quote；无则按钮 disabled+tooltip（本批无 proposed 写入口 → 按钮永久禁用=幽灵化） | **A**（人是谈判条款唯一权威输入源；B 使裁决 #6 保留的条件渲染形同虚设） |
| 2 | **send 链 subject 缺位**（原型 draft 区无主题字段；send_outreach 需 subject） | 最新 draft 行带 subject 则用之；无则 route 派生默认「合作邀约：{项目名}」；UI 不加字段 | draft 区加 subject input（布局变更，需授权） | **A**（保持原型结构；主题在确认卡 harm 中如实披露，人可见可拒） |
| 3 | **draft 持久化**（V6 textarea 初值数据源；chat 起草 → V6 审阅的闭环载体） | `draft_email`/`refine_email` 落 `OutreachMessage(direction=draft)`（upsert thread + insert draft 行）；textarea 初值 = 最新 draft 行 body | 不持久化（草稿仅在 chat 内；V6 textarea 恒空） | **A**（direction 枚举 draft 值 F001 已建即为此用；PRD 15.3 E2E「起草→审阅→确认发送」跨面闭环必需；属 F008「数据源切真」范围内对 F006 文件的前置依赖增量，§4.7 边界内） |
| 4 | **「重写」按钮接线**（现为 toast stub；幽灵控件禁令二选一） | 接 `refine_email` 真链：POST `/api/reach/refine`（固定指令「更自然简洁」）+ loading/error 态 | disabled + tooltip「即将上线」 | **A**（F006 工具已实装，降级无理由） |
| 5 | **左栏人列数据源** | 已有 thread 的 KOL ∪ 现行 approved 组合成员（无 thread 成员 = pending_send 虚拟行，与 crmInfer 空事实推断一致） | 仅已有 thread 的 KOL（组合批准后 V6 仍空，动线断） | **A**（PRD 动线：批准组合 → 触达；pending_send 态获得真实语义） |

## 4. 幽灵控件检查（guardrail §3.3）

- 搜索框：原型即「仅呈现」，保持（V6-2 登记语义如此，非幽灵）
- 「重写」：见 #4，接真
- 「确认报价」：见 #1，接真

## 5. 机械项（非决议，按既有规则执行）

- 五态 pill 中文映射沿 mock 原词（待发送/已发送/已回复/谈判中/已确认）+ 原 tone 映射
- 受众匹配 ring：approved PlanKol.matchScore ?? MatchCandidate.matchScore ×100；缺失 → 「待核」（裁决 #2 语义已在组件内）
- 「历史合作」：无真数据源 → 「—」占位（guardrail：保留结构不删）
- env-reach.ts mock 退役登记（mock/index.ts 表更新）
- 视觉基线 §4.5 重生序：kill :3000 → build → 伪造网关 env → 三连稳

## 6. 开工条件

Planner 裁决段落盘（同 commit）即开工。

---

## 7. Planner 裁决（Andy · 2026-07-23）

> **⚠️ 角色切换：以下为 Planner 角色裁决段（快车道同实例，§4.6 豁免条款）**

**短格式决议：`#1:A #2:A #3:A #4:A #5:A`**

| # | 决定 | 理由 |
|---|---|---|
| 1 | A | 谈判条款唯一权威输入源是人；B 的永久禁用与裁决 #6「negotiating 条件渲染」的产品意图矛盾。表单是**闸门前置输入**而非新画布区块——modal 形态，与 F009 覆盖控件一并在 ui-inventory 登记为本批新增例外（V6 24→26；编号按落地序：#25 报价条款表单 modal(F008)、#26 覆盖控件(F009)——fix_round1 与 ui-inventory 对齐，验收 F009 low issue 消解） |
| 2 | A | 保持原型结构铁律优先；subject 经 harm 全披露，人有拒绝权，无失控面 |
| 3 | A | draft 枚举值即为此设计；E2E（F010）闭环必需。范围归属：F008 acceptance「数据源切真 thread/message/quote」涵盖 draft 行数据源；对 email-drafting.ts 的增量在 F008 commit 内完成，spec 本段即为明示（§4.7 前置依赖边界条款） |
| 4 | A | 工具已在场，B 是无理由降级；错误态经 describeGatewayError 诚实呈现 |
| 5 | A | 与 →reach 守卫判据（hasApprovedMatchPlan）同构：批准组合即触达候选集；虚拟行 status=crmInfer(空事实)=pending_send，「五态 pill=crmInfer 真值」在虚拟行同样成立 |

**同步文档更新：** 本裁决即 spec §6 的补充定义；ui-inventory V6 计数变更（24→26）随 F008/F009 实装时在 `docs/specs/ARCH-M05-ui-inventory.md` 登记。features.json F008 acceptance 不改（「ui-inventory V6 24 元素逐处保持」指既有 24 元素不缺不改，新增例外走登记流程——F009 acceptance 已有同款先例句式）。

**额外叮嘱（非阻塞）：** ① `router.refresh()` 后 RSC 重查——page.tsx 已 force-dynamic 需核实，否则 pill 不动；② GateConfirm 渲染真 harm 时不得在前端改写/筛选 harm 行（§9.5 只做渲染）；③ 报价表单金额用 `type="number"` + 客户端仅格式校验，权威校验在 zod route。
