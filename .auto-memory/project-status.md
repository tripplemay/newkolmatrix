---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **GO-LIVE done ✅（2026-07-20）** — F001-F003 全绿（全栈部署基建：pgvector Postgres 容器 + migrate/seed 装配 + deploy-prod 全栈化 + healthcheck 修）；隔离验收 3×PASS + 批次末回归全绿；signoff `GO-LIVE-signoff`
- **AGENT-FOUNDATION（P0）done ✅** — F001-F010，signoff `AGENT-FOUNDATION-signoff`
- **待办：用户手动首次 go-live**（6 项人类闸门：DNS/Secrets/两 ghcr 包 public/server .env/nginx/cert/触发 deploy-prod）；agent 不代执行部署

## AGENT-FOUNDATION 交付（Agent 驱动地基）
- 四柱：工具层(唯一注册表+executeTool+internal/outbound 二分)·运行时(streamText loop, /api/agent)·对话面(useChat CopilotPanel)·generative canvas(工具名→组件)
- 多 Agent 编排框架：registry(7 人格)+persona router+handoff(§5.4 信封)+orchestrator；框架焊死 vs 语义扩展点边界
- AI→人闸门：outbound 服务端强制 pending+harm，模型拿不到令牌，token 只存 hash/TTL/单次/绑 payloadHash，D20 变异测试
- 全栈：Prisma6+Postgres16+pgvector(1024)·Vercel AI SDK v7⇄aigcgateway(deepseek-v3/bge-m3)·2524 KOL seed
- 架构文档：`docs/dev/agent-architecture.md`；e2e：`npm run f010:e2e`（hello-agent 闭环）

## 交互原型（canonical）
- `docs/product/interaction-prototype-v2.html`（Horizon 高保真，喂 spec）+ 落地规范

## 重构总方向（用户 2026-07-14 拍板）
- 保功能、去 SaaS 化、AI native（AI 主驾）；单角色 + 多专家 Agent；路线 P0 地基→P1..P5

## 已完成批次
- CICD-VPS done ✅（剩 go-live）· DS-FOUNDATION done ✅ · **AGENT-FOUNDATION done ✅**

## 关键技术坑（本批实战）
- 网关 SSE 流污染 undici 连接池 → resilientFetch(keepalive:false+空400重试)；JSONB 重排 → stableStringify 抗序
- 视觉基线随 IA 路由重定向漂移（F008 改 dashboard→today，F009 CI 才暴露）

## 已知下游（不在本批）
- 各专家领域工具 M1-M4 · MCP 实装 · 真实认证/多租户 RLS(M5) · 真实 outbound 投递 · prod 部署 · CICD-VPS go-live
