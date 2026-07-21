---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M1-A-BRIEF verifying 🔍（2026-07-22）· 快车道** — building 完成 6/6，CI 绿；验收以隔离 evaluator subagent 运行（`/verify`），不换会话
- **交付：** F001 vitest 地基（19 用例样板 + CI unit job）· F002 拆 NoSSR 恢复全站 SSR · F003 Project/OperationLog expand 迁移 + canonical seed · F004 `domain/health.ts` · F005 `domain/env-guards.ts` + 变异测试 · F006 环节推进写 OperationLog
- **测试规模：** 92 用例（80 单测 + 12 集成），`domain/` 行覆盖 97.5%（门 80%，已接 CI）
- **开工前审计出 6 条新裁决 D13-D18** → `docs/specs/M1-A-BRIEF-f003-f006-preimpl-audit.md`，spec §3 已同步

## 验收需知（三条易误判为 bug 的预期行为）
- **seed 四项目健康度全落 `cr`** 是 D15 记录在案的预期——实际曝光/已消耗预算本批无存处，M1-B 接真实指标后消解，不得改算法掩盖
- **creators / runs 两页 SSR 首屏只有外壳**：这两页自身用 `useSearchParams` + Suspense（Next 15 要求），非 F002 缺陷
- **p2:f002 用例数 13→14**：hydrate 判据随 SSR 恢复而失效，已换实现并补活性证明

## 已上线
- `https://newkol.guangai.ai` 仍跑 **P2-CLEANUP 版 @ `0c36fc2f24395be5bbf9af60a0cf4342dde057be`**（M1-A 尚未部署）
- ⚠️ **deploy 的 image_tag 必须填完整 40 位 SHA**，短 SHA 会 pull 失败（见 environment.md）

## 演进路线（architecture.md v1.2 §14）
- M0 ✅ → M0.5 ✅ → **M1-A ✅（验收中）→ M1-B（下一站：页面接真数据 + brief 分流 bug + BL-FE-16/17）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 PROD-HARDENING

## 需求池（backlog.json）
- **BL-FE-16 / BL-FE-17**（`image/` 模板残留统一处置）— D1 收窄范围后顺延 M1-B

## 待人类处理
- `framework/proposed-learnings.md`：P2-CLEANUP 4 条待裁决 + harness-fit 9 条长期挂起（用户三度裁决继续挂起）
- **本批新增 3 条待沉淀**（见 proposed-learnings）：勘查审查面按目录而非按症状划 · 探针代理前提随架构变更失效 · 覆盖率门 include 不可大于批次范围

## 关键技术坑（沿用 framework v1.0.7）
- UI 实测一律 standalone 不走 next dev · CDN 字体是视觉抖动总根源 · Tailwind JIT 双域 token · 基线重生用 `--update-snapshots=all` 断言用紧阈值
- **本批新踩：** `typeof window` 服务端分支在无 SSR 时无症状，恢复 SSR 即成 hydration mismatch 源 · Vite 8 已原生化 tsconfig paths · `@types/node ^18` 无 `process.loadEnvFile` 类型（运行时有）

## 已知下游（不在当前）
- `api/envelope.ts` 统一信封（D3 遗留，5 路由 4 种形状）· `OperationLog` append-only DB 触发器（R14）· 闸门并发双确认原子防护（R15）· MCP 实装 · 真实认证/RLS（M5）
