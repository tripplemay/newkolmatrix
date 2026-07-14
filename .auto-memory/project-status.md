---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **AGENT-FOUNDATION（Phase 0）：`building`**（Agent 驱动架构地基；7 features 全 generator，串行）
- 目标：全栈化 + Agent 四柱（工具层/Agent 运行时/常驻对话面/generative canvas）+ hello-agent 闭环（NL→search_kols→KOL 卡片流画布渲染）
- spec `docs/specs/AGENT-FOUNDATION-spec.md`；数据源=旧仓库 `docs/kol-seed-enriched-final.csv`（~2524 真实 KOL）

## 重构总方向（用户 2026-07-14 拍板）
- 旧 kolmatrix 功能逐步重构进新系统：保功能、去 SaaS 化、改 AI native
- **诊断：旧系统 AI 基建已生产级，但都是"副驾/逃生舱"——本质是把 AI 从副驾提到主驾（问题在 UX/IA 非能力）**
- 决策：后端全新重建（复用外部 infra，不移植旧 lib）· 激进 Agent 驱动一切 · Vercel AI SDK→aigcgateway · CSV seed 先灌数据
- 路线图：P0 地基 → P1 Brief+Campaigns → P2 Match → P3 Reach+CRM → P4 Insight+ROI+周报 → P5 收尾
- 旧系统 IA 已是工作流式（Brief→Campaigns→Match→Reach→Insight），新系统继承

## 已完成批次
- **CICD-VPS done ✅**（7/7 PASS）：CI + Docker CD 到 VPS；**剩 go-live**（Andy 代执行，用户授权，首次部署前确认）；signoff `docs/test-reports/CICD-VPS-verifying-2026-07-14.md`
- **DS-FOUNDATION done ✅**（6/6，Horizon 设计系统地基）

## 关键技术决策
- Next.js 15 App Router · React 19 · TS · Tailwind（主设计系统）· 浅色默认 · Horizon 紫 `#422AFB`
- **本批新增全栈：Prisma + Postgres + pgvector（dev 本地 docker）· Vercel AI SDK · aigcgateway（AI 出口）**
- 仓库 public；repo github.com/tripplemay/newkolmatrix；模板源目录保持 gitignore

## 已知下游（不在本批）
- 真实认证/多租户 RLS · 全栈 prod 部署改造（当前 CICD-VPS 前端-only）· Apify 采集管道 · CICD-VPS go-live
