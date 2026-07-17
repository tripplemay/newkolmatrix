---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **AGENT-FOUNDATION（Phase 0）：`planning`（building 暂停）** — 后端/Agent 四柱地基，8 features 全 pending，未落地
- 会话主线转向**交互原型 v2**（前端设计探索，喂给 spec）：已定稿并入库

## 交互原型（canonical）
- `docs/product/interaction-prototype-v2.html` + `scripts/test/v2-prototype-smoke.js`（57 断言）
- Horizon 高保真 · 单角色 · 多 Agent 编队（每环节专家 + 协同交接）· AI→人闸门
- 6 页全实：今天/项目(+五环节纵推)/创作者库(+详情抽屉)/游戏知识(素材上传→AI解析)/洞察/Agent记录
- Horizon 复用审计（2026-07-17）→ 已全量对齐 token/结构；`docs/product/interaction-prototype-v2-落地规范.md` = 手写件→真组件映射
- **仓库已清理（2026-07-17）**：只留 v2 原型 + 落地规范 + smoke + 产品调研文档；role-first/small-team/旧 interaction-prototype/落地页/借鉴稿已删除

## 重构总方向（用户 2026-07-14 拍板）
- 保功能、去 SaaS 化、改 AI native（AI 从副驾提到主驾）；单角色 + 多专家 Agent
- 后端全新重建 · Vercel AI SDK→aigcgateway · CSV seed；路线 P0 地基→P1..P5

## 已完成批次
- **CICD-VPS done ✅**（剩 go-live，用户授权首次部署前确认）· **DS-FOUNDATION done ✅**（Horizon 地基）

## 关键技术决策
- Next 15 · React 19 · TS · Tailwind(主设计系统) · 浅色默认 · Horizon 紫 #422AFB · `body.dark` 深色
- 本批新增全栈：Prisma+pgvector · Vercel AI SDK · aigcgateway

## 已知下游（不在本批）
- Apify 采集管道 · 真实认证/多租户 RLS · 全栈 prod 部署 · CICD-VPS go-live
