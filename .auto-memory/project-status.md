---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **无** — 项目刚初始化（INIT 完成），等待第一个需求批次
- 下一步：第一个批次做**设计系统**（颜色 token / 排版 / 基础组件 / 公共 hook / 布局框架），非业务页面

## 项目背景（为何重构）
- 本项目是旧项目 `kolmatrix`（已实现 MVP）的**全面重构**
- 动因 1：前端样式换为 Horizon UI Pro 付费模板风格，框架差异大 → 无法原地替换
- 动因 2：旧项目偏传统 SaaS 交互，与"AI 驱动的 KOL 营销平台"定位差异大 → 重构 UX 与流程

## 关键决策
- 技术栈：Horizon 原生栈（Next.js 15 · React 19 · TS · Tailwind · Chakra UI · ApexCharts），前端优先，暂无后端 / DB
- 车道：快车道（单会话，主实例 Andy = Planner+Generator，evaluator 走隔离 subagent）
- 设计参考：`db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/`（Horizon 模板 + Figma 源）

## 生产状态
- 暂无生产 / staging；本地 dev = localhost:3000

## 已知 gap（非阻塞）
- 项目尚未 scaffold（无 package.json / src）；测试 runner 待配置
