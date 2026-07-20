---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **FE-AUDIT done ✅（2026-07-20）** — 前端地基全面审计（Evaluator-only，4/4 PASS 首轮过）；signoff `FE-AUDIT-signoff`；三路并行 fan-out + F004 对抗复核（15 项抽查、推翻 1 分句、新增 1 盲区）
- **体检结论：** 设计系统底座健康（hardcoded hex 0 / 字体偏离 0 / dark: 无缺口 / tailwind.config 与模板逐字节同）；债轻且集中展示型小组件层；**真风险 = 模板 admin/ 124 组件消费策略未决（BL-FE-01，阻塞 M0.5）**
- **12 条整改已入 backlog.json**（P0 2 / P1 7 / P2 3，约 4.25-5.25 人日）；3 条决策项待用户拍板：BL-FE-01 port/自写策略 · BL-FE-05 hover 语言 · BL-FE-09 duty/isolation 术语

## 已上线
- **`https://newkol.guangai.ai` live（2026-07-20 首次全栈 go-live）**：/api/health 200、2524 KOL 全含 embedding；旧 compose 备份 `.frontend-only.bak` 可回滚
- GO-LIVE done ✅（全栈部署基建）· AGENT-FOUNDATION（P0）done ✅（四柱+编排框架+AI→人闸门，`docs/dev/agent-architecture.md`）· CICD-VPS ✅ · DS-FOUNDATION ✅

## 下一批次（待定，用户裁决中）
- 候选顺序：FE-REFACTOR（P0+P1 整改）先行 → ARCH-LOCK + M0.5（六页工作台）；或整改并入 ARCH-LOCK+M0.5
- ARCH-LOCK 须含：架构文档定稿（用户本地 f5 3260 行 / kimi v1.1 1013 行两版取舍 + CLAUDE.md 指向修复 + audits 设计文档入 git——工作区未提交，agent 不碰）
- 演进路线（kimi v1.1 §14）：M0 ✅ → M0.5 WORKBENCH-UI → M1 BRIEF-CAMPAIGNS → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 PROD-HARDENING

## 重构总方向（用户 2026-07-14 拍板）
- 保功能、去 SaaS 化、AI native（AI 主驾）；单角色 + 多专家 Agent

## 关键技术坑（近期实战）
- IA 改路由 → 引用旧路由的探针/测试静默漂移延迟暴露（v1.0.5 已沉淀：redirect 清单须扫 visual route/selector + healthcheck + curl 探针）
- CI visual job 无 DB → HandoffCollab 渲染 null，基线静默编码空区域（BL-FE-11 记账）

## 已知下游（不在当前）
- 专家领域工具 M1-M4 · MCP 实装 · 真实认证/多租户 RLS（M5）· 真实 outbound 投递 · harness-fit 9 条提案挂起
