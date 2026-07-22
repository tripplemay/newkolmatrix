---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M1-B-BRIEF verifying 🔍（2026-07-21 building 完成）· 快车道** — 6/6 features 已实现全 CI 绿，待隔离 evaluator 验收（/verify，fan-out+对抗复核）
- **已交付：** F001 详情页 RSC 直读+health 真算（D7 双 workflow 起 DB）· F002 brief 分流 bug 修复 · F003 compute_health 工具（strategy 人格）· F004 守卫前端半边（canEnter+toast）· F005 三重收敛（HealthBand 入 domain、HEALTH_LABEL 入 display 单点）· F006 image/ 死代码删除
- **验收需知：** health 四项目全 cr 是 D2 预期（xg score=26）；列表 mock vs 详情真值不一致是过渡态（M1-C 消解）；**就绪口径修订=三条 p2 探针**（p2:f003 随死代码退役，裁决 `docs/specs/M1-B-BRIEF-f006-p2probe-audit.md`）；D4 深链不拦只拦点击（设计非漏拦）
- **上一批 M1-A-BRIEF done ✅ 并已上线** — 生产 @ `fa52f861`

## 已上线
- `https://newkol.guangai.ai` 现跑 **M1-A 版 @ `fa52f8619b2277e578d3a6e1bbd5b77a5bd062ad`**（M1-B 验收通过后待用户手动触发部署）
- ⚠️ **image_tag 必须完整 40 位 SHA**；**部署 SHA≠HEAD**——纯文档/状态 commit 命中 build-push paths-ignore 不构建镜像

## 演进路线（architecture.md v1.2 §14）
- M0 ✅ → M0.5 ✅ → M1-A ✅ → **M1-B 🔍 → M1-C（列表/今天页 RSC 直读/knowledge/例程）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 硬化

## 需求池 / 待人类
- **BL-FE-17 已作废**（F006 删 image/ 兑现）；**BL-FE-16** 暴露面零，backlog 保留
- `framework/proposed-learnings.md`：**新增 1 条待裁决**（勘查 grep 面按被删路径划，M1-B F006 反例）+ harness-fit 9 条长期挂起
- architecture §12.6.3/§5.3/§14 M0.5 口径滞后 as-built（M1-A signoff S1 建议，本批未做，顺延）

## 关键技术坑（framework v1.0.8）
- UI 实测一律 standalone 不走 next dev · 基线重生 `--update-snapshots=all` 断言紧阈值 · **容忍带会把故意变更「借绿」——意图变更必须重生基线**（M1-B F001 实证）· RSC 直连 DB 页面无法 route-mock（CI/基线重生 workflow 都要起 DB，D7）· 删除类 feature 勘查面按被删路径 grep（含 package.json scripts）

## 已知下游（不在当前）
- `api/envelope.ts` 信封 · OperationLog append-only 触发器（R14）· 闸门并发原子防护（R15）· 真实认证/RLS（M5）
