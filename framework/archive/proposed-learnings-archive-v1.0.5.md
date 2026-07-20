# Proposed Learnings 归档 — v1.0.5（2026-07-20 确认）

> 已闭环条目从 `framework/proposed-learnings.md` 移入本文件。写入落点见 `framework/CHANGELOG.md` v1.0.5。

---

## [2026-07-20] Andy/Generator — 来源：KOLMatrix AGENT-FOUNDATION F008→F009 视觉基线漂移

**类型：** 新坑

**内容：** IA 重构改路由（重定向旧路由）会让**引用旧路由/旧页元素的既有配置**静默失效，且**延迟暴露**。本项目撞了两处同根因实例：(1) **视觉回归测试** `page.goto(旧路由)` 被重定向、`waitFor(旧页元素)` 超时——F008 改 dashboard→today 时其自身 CI 侥幸过了 visual job，直到 F009 无关 push 才红；(2) **prod compose + deploy-prod 的 healthcheck** 命中 `/admin/dashboards/default` 期待 200，重定向后返 307 → 容器恒 unhealthy / 部署健康检查恒失败（GO-LIVE F001/F003 才发现并修至 `/api/health`）。既有 v1.0.0「IA refactor redirect scope」learning 只覆盖死链清单，未覆盖这类「引用旧路由的探针/测试」漂移。IA 重构类批次的 redirect 清单评估应**同时扫**：`tests/visual/*.spec.ts`（route/selector）+ `docker-compose*.yml` / `.github/workflows/deploy*.yml` 的 healthcheck 路由 + 任何 `curl <旧路由>` 探针，并在同批内一并重指，不留给后续批次/首次部署撞见。

**建议写入：** `memory/role-context/generator.md` §"IA refactor redirect scope 评估"（补：redirect 清单须含视觉测试 route/selector + healthcheck/探针路由）+ `memory/role-context/planner.md` §"IA refactor 类批次 redirect 清单评估" 呼应。

**状态：** 已采纳（用户 2026-07-20 确认）— 写入 framework/memory/role-context/{generator,planner}.md + 项目侧 .auto-memory/role-context/ 两份副本（铁律 7）+ CHANGELOG v1.0.5
