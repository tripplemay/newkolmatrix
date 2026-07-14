---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **CICD-VPS：`building`**（配 CI + Docker CD 到 VPS 供在线验收；7 features 全 generator）
- 部署：newkol.guangai.ai:3300 /opt/apps/newkolmatrix，Docker+ghcr+手动 deploy，复用旧 repo VPS 模式；与旧 kolmatrix(kol.guangai.ai) 共存不碰
- 用户授权 Andy 代执行 go-live（DNS via CF token / certbot / secrets / 首次部署），首次上线前确认
- spec `docs/specs/CICD-VPS-spec.md`

## 上一批次（DS-FOUNDATION done ✅）
- 6/6 PASS（fix_rounds=1，F005 删孤儿 SidebarContext）；signoff `docs/test-reports/DS-FOUNDATION-signoff-2026-07-14.md`

## 项目背景（为何重构）
- 本项目是旧项目 `kolmatrix`（已实现 MVP）的**全面重构**
- 动因 1：前端样式换为 Horizon UI Pro 模板风格，框架差异大 → 无法原地替换
- 动因 2：旧项目偏传统 SaaS 交互，与"AI 驱动的 KOL 营销平台"定位差异大 → 重构 UX

## 关键决策
- 技术栈：Next.js 15 App Router · React 19 · TS · **Tailwind（主设计系统，非 Chakra theme）** · Chakra 原语 · ApexCharts · DM Sans/Poppins
- 浅色默认（去 `<body dark>`）；品牌沿用 Horizon 紫 `#422AFB`
- 模板源目录 `db4rDjuaSCqaEFW9XcFo_...` 保持 gitignore，不入库（付费资产）
- 仓库 public（用户确认 license 允许）；repo: github.com/tripplemay/newkolmatrix

## 生产状态
- 暂无生产 / staging；本地 dev = localhost:3000

## 已知 gap / backlog（非阻塞）
- 模板 deps 未精简（fullcalendar/mapbox/nft）；测试 runner 未正式配置；React 19 RC + TS 4.9 沿用模板版本
