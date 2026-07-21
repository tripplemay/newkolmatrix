# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Harness 规则（最高优先级）
读取并严格遵守 @harness-rules.md 中的所有规则。

**每次会话启动必须执行：**
1. SessionStart hook 会自动注入当前状态机 status（`.claude/hooks/session-start.sh`）；据此进入对应角色入口
2. 读取 `.auto-memory/MEMORY.md`（项目记忆索引），按 T0/T1/T2 分层加载记忆文件
3. 阶段角色入口：`/plan`（new / planning / done）、`/build`（building / fixing）、`/verify`（verifying / reverifying，编排隔离 evaluator subagent）

**独立性铁则：** 验收必须在隔离上下文中进行（`.claude/agents/evaluator.md`），结论原样落盘。任何人不得评估自己的工作。

**分支规则：** 代码提交推 `main` 分支。部署由用户手动触发。

**记忆分层：** `.auto-memory/`（git-tracked）是跨实例共享记忆源。本机用户偏好存储在 `~/.claude/projects/.../memory/` 中，不入 git。

**规格文档分级：** 新功能批次须有 `docs/specs/` 下的规格文档（硬性）；Bug 修复批次可省略（软性）。

**编排：** 并行实现、fan-out 验收、后台 CI、/loop 场景见 `orchestration-patterns.md`（同会话快车道为默认；跨机器 / 独立实例走 git 总线慢车道）。

**进度看板：** 阶段边界可 `/dashboard` 刷新图形化看板（Artifact 快照，URL 存 `progress.json.dashboard_url`）。

**自主模式（可选）：** 长时无人值守推进见 `framework/harness/autonomous-mode.md` 与 `/autodrive`；开启需人类建 `autonomy-policy.json` 并手动合入 deny-list，deploy/prod/spend 永留人类闸门。

---

## Project Overview

KOLMatrix — AI 驱动的 KOL 营销管理平台：跨平台（YouTube / Twitch / TikTok / Instagram）发现、评估、触达、追踪 KOL。

> 本项目是旧项目 `kolmatrix` 的全面重构：旧项目已实现 MVP，但（1）前端样式需替换为 Horizon UI Pro 付费模板风格，框架差异过大无法原地替换；（2）旧项目偏传统 SaaS 的交互与流程，与"AI 驱动"产品定位差异大，需重构用户体验与使用流程。

**Tech Stack:** Next.js 15（App Router）· React 19 · TypeScript · **Tailwind CSS**（主设计系统：`tailwind.config.js` 色板 + `AppWrappers.tsx` 运行时 CSS 变量色阶）· Chakra UI（仅零散原语 Drawer / Modal / Tooltip / Popover / Accordion）· ApexCharts · DM Sans + Poppins（基于 Horizon UI Pro 模板 scaffold）

> **全栈层（AGENT-FOUNDATION 批次立起）：** **Prisma 6 + Postgres 16 + pgvector**（`vector(1024)`，D3 自定义扩展迁移；单租户 dev tenant，D4）· **Vercel AI SDK v7**（`streamText` agent loop + `useChat`）⇄ **aigcgateway**（OpenAI 兼容网关，默认 chat=deepseek-v3 / embedding=bge-m3）· **单角色（营销操盘手）+ 多 Agent 编排框架**（registry / persona router / handoff / orchestrator，7 人格共享单一 `/api/agent`）· **AI→人闸门**（outbound 动作服务端强制拦在人确认前，F009）。架构详情 → `docs/dev/agent-architecture.md`（四柱 + 编排框架 + 闸门 + 数据流 + how-to）。

> 注意：模板**无** `src/theme/` / `ChakraProvider` / `extendTheme` —— 设计系统由 Tailwind + CSS 变量驱动，不是 Chakra theme。品牌主色 `--color-500 #422AFB`（Horizon 紫）。默认浅色（已去除模板的 `<body className="dark">`）。

## Commands

```bash
# Development
next dev                  # http://localhost:3000

# Build
next build
next start                # 生产模式启动

# Database（Prisma + Postgres 16 + pgvector）
npm run db:up             # docker compose 起本地 Postgres
npm run db:migrate        # prisma migrate deploy
npm run seed:kol          # 灌 ~2500 真实 KOL + embedding（F004）
npm run seed:demo-handoff # 灌一条 demo handoff 供协同交接可视化

# Lint & Type Check
next lint
tsc --noEmit

# Test（smoke / e2e / 视觉回归）
npm run agent:smoke       # 柱一 executeTool 直调
npm run orch:smoke        # 多 Agent 编排框架
npm run gate:smoke        # AI→人闸门（G1-G5 + D20 变异测试）
npm run f010:e2e          # hello-agent 端到端浏览器实测（需 dev server + 网关）
npm run test:visual       # Playwright 视觉回归（dashboard/today + agent-canvas）
```

## Reference Documents（按需阅读）

涉及对应模块时再读，不需要每次启动都加载：

- **架构详情：** → `docs/dev/architecture.md`（v1.2 定稿：全站目标态 + as-built 校准；Agent 层细节另见 `docs/dev/agent-architecture.md`）
- **部署与 CI/CD：** → `docs/dev/deploy.md`（首次 go-live 一次性清单、日常部署、回滚）
- **模板 port 约定：** → `docs/dev/template-port-guide.md`（admin/ 逐个 port 保留结构）+ `docs/dev/template-inventory.md`（库存登记表）
- **规格文档：** → `docs/specs/`（开发时优先查阅）
- **设计稿：** → `design-draft/`（UI 页面还原时参考）
- **技术域 pattern 库：** → `framework/patterns/README.md`（触发条件命中才读）

<!--
注意：主文件只放「每次必读」的内容（启动流程、Commands、核心约束索引）。
架构详情、规则细节、策略矩阵等放在 docs/dev/ 子文档中按需加载。
原则：agent 启动时加载量越少，信息焦点越清晰。
-->
