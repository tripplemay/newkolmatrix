---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **FE-REFACTOR done ✅（2026-07-20）** — 前端地基整改 7/7 首轮 PASS（44/44 clause，fix_rounds=0）；signoff `FE-REFACTOR-signoff`；消化 FE-AUDIT 11 条 BL
- **交付：** common 层 8 组件（Badge/ChatBubble/DefinitionRow/PageHeader/SectionLabel/PanelHeader/HandoffCard/SurfaceCard）· 术语「职责/边界」· hover=shadow-xl · shadow-sm/md 清零 · fontSize mini/micro/compact + gray-600（tailwind.config 首次有意偏离模板，理由入 commit bafd917）· admin/ port 约定（逐个 port 保留模板结构，`docs/dev/template-port-guide.md`）+ 78 组件登记表 · 视觉基线全量重生 + CI 盲区修复（route mock，生产交接卡回归覆盖零→有）
- **FE-AUDIT done ✅（同日）**：地基体检 4/4 PASS，报告 `docs/test-reports/FE-AUDIT-*`

## 已上线
- **`https://newkol.guangai.ai` live（2026-07-20 首次全栈 go-live）**；旧 compose 备份 `.frontend-only.bak` 可回滚
- GO-LIVE ✅ · AGENT-FOUNDATION（P0）✅（四柱+编排框架+AI→人闸门）· CICD-VPS ✅ · DS-FOUNDATION ✅

## 需求池（backlog.json，3 条）
- BL-FE-13 视觉断言阈值收紧（P1，重生 all/断言紧阈值分离）· BL-FE-14 HandoffPanel 二次收敛（P2）· BL-FE-12 深色持久化（P2）

## 下一批次（用户已定顺序，待启动）
- **ARCH-LOCK + M0.5 WORKBENCH-UI**：架构文档定稿（用户本地 f5/kimi 两版取舍 + CLAUDE.md 指向修复 + audits 文档入 git——工作区未提交，agent 不碰）+ 六页工作台外壳（mock 先行 §6.7，验证 A6 canvas 方向）
- 演进路线（kimi v1.1 §14）：M0 ✅ → M0.5 → M1 BRIEF-CAMPAIGNS → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 PROD-HARDENING

## 关键技术坑（近期实战）
- 视觉基线容忍带双向静默：--update-snapshots 默认 changed 空转（已修 =all）+ 断言 2% 阈值吞整块 UI 变化（BL-FE-13）
- CI 无 DB 时组件渲染 null 被基线固化为合法空白 → route mock + waitFor 硬断言（F007 范式）

## 已知下游（不在当前）
- 专家领域工具 M1-M4 · MCP 实装 · 真实认证/RLS（M5）· 真实 outbound 投递 · proposed-learnings 5 组待确认 · harness-fit 9 条挂起
