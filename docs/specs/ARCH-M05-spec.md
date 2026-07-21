# ARCH-M05 — 架构文档定稿 + M0.5 六页工作台（普通批次）

> **批次类型：** 普通批次（17 条全 `executor:generator`），`planning → building → verifying → done`。
> **Spec lock：** 2026-07-21 用户 plan mode 批准。
> **附件（硬性）：** `docs/specs/ARCH-M05-ui-inventory.md`——18 视图 / 301 元素逐条「不得简化清单」+ 10 处不一致的 Planner 裁决记录。UI 类 feature 的验收以附件对应视图清单为准。

## 1. 背景与目标

FE-REFACTOR 收官上线、地基整净。本批 = ARCH-LOCK（架构文档定稿）+ M0.5 WORKBENCH-UI（kimi 路线 §14 下一里程碑：六页工作台外壳，mock 先行验证 A6 激进 canvas 方向）。落地规范 §11 口径：M0.5 = 阶段 A（外壳与路由）+ 阶段 B（静态页 mock+真组件）；C/D/E（数据层/Agent 运行时/闸门）已由 AGENT-FOUNDATION 完成。

## 2. ARCH-LOCK 定稿口径（F001，用户 plan 批准）

1. **基底 = architecture_kimi.md v1.1**（唯一覆盖 PRD 全站）
2. **并入 f5 十条实现层增量**（对比分析 §2，落点按其建议）：①闸门端点契约+防重放矩阵→§9.3 ②Prisma schema 权威（**以实物转录**）→§7.2.1 ③API envelope+ApiErrorCode→新§API 契约 ④env 清单+serverEnv 校验→§13 ⑤测试架构（vitest 规划态注明）→§12.6 ⑥技术选型表+反选型→§1.4 ⑦文件级目录树→§4.3 ⑧resolveProvenance 三级回退+读写不对称→§7.5 ⑨生产化 R1-R7（已完成项销项标注）→§13 ⑩五层 prompt 装配+承诺-兑现断言→§8.3/8.6
3. **as-built 校准（硬前提）**：OperationLog 实为 7 列 cuid｜PendingAction 实为 3 态（pending/confirmed/executed，confirmed 未使用）｜闸门实为**单步确认即执行**（/api/gate/{confirm,reject}，无 execute 端点、无 HMAC、令牌服务端内部消费）｜append-only 触发器未落地→记欠账（backlog 候选）｜删「零后端」快照｜版本表 TS5.9/React19.2/Prisma6.19/ai7｜工具字段 `class` 非 `kind`｜canvas 落点 `components/copilot/canvas/`｜common 10 组件｜旧路由为 redirect 桩非删除
4. **矛盾裁决原则：已实装一律 as-built；未实装标「演进目标（未实装）」按 M 路线归位**（两步票据/HMAC→M3；例程调度器→M1；路线图采 M0-M5；TS5 升级销项）
5. 定稿 `docs/dev/architecture.md` v1.2；f5 归档 `docs/archive/architecture_f5-v1.0-draft.md`；`docs/audits/KOLMatrix-integrated-architecture-design-2026-07-17.md` 入 git；CLAUDE.md 指向修复；顺手核实 AI SDK core/provider 版本族配对并在文档记录结论
6. 本批 M0.5 决策同步入定稿：kimi §6.1 today 语法表补「团队负荷（免责：单一角色仅分工）」（裁决 #8）、§6.4 组件表补 Toast（裁决 #9）与两 variant 组件（裁决 #7/#10）、§6.5 URL 化四状态位（裁决 #4）

## 3. 功能范围

17 条 feature 见 features.json（acceptance 为权威）。分层：

- **地基段（串行）**：F001 架构定稿 → F002 路由收敛+探针 → F003 三区外壳 → F004 渲染契约层 → F005 共用产品件
- **页面段（可并行 worktree）**：F006 today / F007 项目+详情外壳 / F008-F012 五环节语法面 / F013 创作者库+抽屉 / F014 知识 / F015 洞察 / F016 记录
- **收口段（必须最后）**：F017 视觉基线扩展 + 阈值收紧（BL-FE-13）

### UI 类 feature 通用 4 段硬要求（ui-fidelity-guardrail §2）

- **§2.1 原型参考：** `docs/product/interaction-prototype-v2.html`（**浏览器打开为主视觉参照**，行号见附件清单）+ 落地规范 §4 映射表
- **§2.2 必用公共组件：** common 既有 10 件（Badge/Button/ChatBubble/ComingSoon/DefinitionRow/HandoffCard/PageHeader/PanelHeader/SectionLabel/SurfaceCard）+ 本批新建（DataTable/HalfGauge/UploadZone/Toast/ProvenanceTag/AgentSquad/GateConfirm/ConversationInbox/Match 矩阵/环节导轨）+ port 件（MiniStatistics/LineAreaChart/BarChart/PieChart/CircularProgress/Progress）；**模板已提供的能力禁止在 common/ 重新发明**（template-port-guide）
- **§2.3 不得简化：** 附件 `ARCH-M05-ui-inventory.md` 对应视图全部 N 元素；🔒 项要简化必须 pre-impl 审计
- **§2.4 visual baseline：** 六页+外壳全部入基线，由 F017 统一单次重生（含 route mock 固定动态数据）；L2 浏览器并排验收 = Evaluator 原型 HTML vs 本地页面同分辨率逐 section 对

## 4. 关键设计决策

- **D1 UI 参照铁律**：见上 4 段；mock 数据一律走 F004 契约层
- **D2 渲染契约**：null→「待接入/待补充」，绝不抛错/填 0；「待核」触发 = 字段缺失/契约层 null（裁决 #2）
- **D3 编排**：快车道；地基段串行 → 页面段按 orchestration §3 并行 subagent+worktree（文件集不重叠：各页 page.tsx + components/envs/<env>/ 独立；共用件全在地基段建完）→ 汇合跑全量 L1 → F017 最后；verifying fan-out+汇总 signoff（沿 FE-REFACTOR 范式）
- **D4 IA 探针纪律（v1.0.5）**：F002 同批核销——`grep -rn "dashboards/default\|/admin/dashboards\|/admin/discovery\|/admin/database\|/admin/outreach" tests/ scripts/test/ .github/workflows/ docker-compose*.yml src/`，命中逐条重指并在 F002 commit message 列清单；已知探针：tests/visual 2 spec（route 均为保留页，预期不动）、compose/deploy healthcheck=/api/health（不受影响）、f010-e2e-check.mjs route 引用（核对）
- **D5 新依赖**：@tanstack/react-table、react-dropzone（落地规范既定）；Toast 自建不引 @chakra-ui/toast；不引入全局 store（ADR-18）
- **D6 闸门 UI 边界**：M0.5 只做**触发与确认卡 UI**（GateConfirm 接既有 /api/gate 链路或 mock pending 流并显式 stub 标注）；真实 send/quote/payout/share 工具实装归 M3/M4；确认卡 harm 行随 4 类动作与 scope 不同（裁决 #3）
- **D7 URL 即状态**：?env=（F007，含 ?stage= 兼容重写）、creators 筛选（F013）、runs 筛选（F016）、kbGame（F014）——四位全 URL 化（裁决 #4）
- **D8 五语法不退化**：F008-F012 五套结构互不相同（FR-7.10/7.11）；Delivery 反向 guardrail：刻意无 KPI/图表/推荐卡/批量按钮，不得补
- **D9 规模与恢复**：预计跨多日多会话；逐 feature 落盘 commit（铁律 3），新会话 /build 续接；commit 标签 `feat(ARCH-M05-F0NN)`
- **D10 期间视觉口径（building 中 Planner 补记，沿 FE-REFACTOR D1 先例）**：F003-F016 均改动 UI 而基线由 F017 单次重生——期间 CI visual job 允许红，lint/tsc/build 必须绿；F017 后恢复 test:visual 全绿硬门槛

## 5. 验收口径（verifying）

1. L1：每 feature lint+tsc 绿；F017 后 test:visual 全绿（新基线+紧阈值）+ CI 绿 + e2e f010 通 + fe-audit 三脚本无回归
2. F001：as-built 校准逐条 grep 实物对账（evaluator 抽查 §2.3 九项）；f5 十条增量落点在场且以实物转录
3. UI 逐页：按附件清单逐元素核对（含 🔒 项在场、🚪 触发点行为、条件渲染规则、URL 化四位）；Evaluator 浏览器并排（原型 HTML vs 本地）
4. 探针清单（D4）核销记录在 F002 commit
5. 全 PASS → signoff 落 docs/test-reports/ → done → 部署留人类闸门

## 附录 A：F002 探针核销清单（D4，2026-07-21 实测）

routes.tsx 已由 AGENT-FOUNDATION F008 提前收敛为 kimi §6.1 的 6 入口，redirect 桩已在（dashboards→today / dashboards/default→today / discovery→creators / database→creators / outreach→campaigns / admin 根→today）。本批全仓 grep 旧路由引用逐条处置：

| # | 命中 | 处置 | 状态 |
|---|---|---|---|
| 1 | `src/components/common/ComingSoon.tsx:34` 返回按钮 push `/admin/dashboards/default` | **重指 `/admin/today`**（F002 代码改动） | ✅ 已改 |
| 2 | `scripts/test/f010-e2e-check.mjs:37` 使用 `?stage=` | 现行契约仍是 ?stage=；**F007 迁移 ?env= 时同批重指**（列为 F007 探针项） | ⏳ 转 F007 |
| 3 | `scripts/test/ds-foundation-verify.mjs` / `ds-sidebar-toggle-check.mjs` goto 旧路由 | DS-FOUNDATION 时代一次性验证脚本，不在 CI / npm scripts 活跃链路——**标注历史脚本不重指**（范围正交） | ✅ 记录在案 |
| 4 | `scripts/test/f008-browser-check.mjs:62-65` | **专测 redirect 行为本身**的断言（期望 dashboards→today），引用正确非漂移 | ✅ 保留 |
| 5 | `scripts/test/orchestration-smoke.ts:73-76` | persona-router 对旧 route 的容错回归测试，保留 | ✅ 保留 |
| 6 | `src/components/navbar/NavbarAuth.tsx:134` | dead-in-repo 认证储备件（登记表 B 组，不可达），不动 | ✅ 不动 |
| 7 | compose/prod healthcheck 与 `/api/health` 注释、`dashboards/page.tsx` 桩自身 | 注释性/桩本体，正确 | ✅ 保留 |
| 8 | `tests/visual/*.spec.ts` | route 均为保留页（/admin/today、/preview/agent-canvas），无旧路由引用 | ✅ 净 |
