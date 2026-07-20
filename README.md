# KOLMatrix

AI 驱动的 KOL 营销管理平台：跨平台（YouTube / Twitch / TikTok / Instagram）发现、评估、触达、追踪 KOL。单角色（营销操盘手）+ 多 Agent 编排，自然语言驱动。

> 旧项目 `kolmatrix` 的全面重构（前端换 Horizon UI Pro 风格 + 重构为「AI 驱动」使用流程）。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 15（App Router）· React 19 · TypeScript · **Tailwind CSS**（主设计系统，Horizon UI Pro scaffold）· Chakra UI（零散原语）· ApexCharts |
| 持久层 | **Prisma 6 + Postgres 16 + pgvector**（`vector(1024)`；单租户 dev tenant，D4） |
| AI 运行时 | **Vercel AI SDK v7**（`streamText` agent loop + `useChat`）⇄ **aigcgateway**（OpenAI 兼容网关，chat=deepseek-v3 / embedding=bge-m3） |
| Agent 架构 | 四柱（工具层 / 运行时 / 对话面 / generative canvas）+ **多 Agent 编排框架**（registry / persona router / handoff / orchestrator，7 人格共享单一 `/api/agent`）+ **AI→人闸门**（outbound 服务端强制拦在人确认前） |

架构详情见 **[docs/dev/agent-architecture.md](docs/dev/agent-architecture.md)**（四柱 + 编排框架 + 闸门 + 数据流 + how-to）。

## 快速开始

```bash
npm install
npm run db:up            # 起本地 Postgres（docker）
npm run db:migrate       # 建表 + pgvector 扩展
npm run seed:kol         # 灌 ~2500 KOL + embedding
npm run seed:demo-handoff
next dev                 # http://localhost:3000
```

需 `.env`（`DATABASE_URL` + aigcgateway 凭据 `AIGCGATEWAY_API_KEY` / `AIGCGATEWAY_BASE_URL`，见 `.env.example`）。`.env` 已 gitignore，绝不入库。

## 验证

```bash
npm run agent:smoke   # 工具层 executeTool
npm run orch:smoke    # 多 Agent 编排框架
npm run gate:smoke    # AI→人闸门（G1-G5 + D20 变异测试）
npm run f010:e2e      # hello-agent 端到端浏览器实测（需 dev server + 网关）
npm run test:visual   # 视觉回归
tsc --noEmit && next lint
```

## 开发流程

本仓库用 Harness 状态机 + 逐 feature 验收闸门协作开发。规则见 [`harness-rules.md`](harness-rules.md) 与 [`CLAUDE.md`](CLAUDE.md)。代码提交推 `main`，部署由用户手动触发。
