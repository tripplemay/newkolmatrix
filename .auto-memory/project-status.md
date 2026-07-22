---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M1-B-BRIEF done ✅（2026-07-22）· 快车道** — 6/6 + 就绪回归首轮全 PASS，fix_rounds=0，对抗复核零触发；signoff `docs/test-reports/M1-B-BRIEF-signoff-2026-07-22.md`
- **已交付：** 详情页 RSC 直读+health 真算（契约层平滑换证实）· brief 分流 bug 修复 · compute_health 工具 · 守卫前端半边 · HealthBand/HEALTH_LABEL 收敛 · image/ 死代码删除
- **S7 已兑现：** `migrate-seed.sh` 第 3 步纳入 `seed:projects`（幂等 upsert，19af7f1）——prod Project 表已灌，每次 deploy 安全重跑

## 已上线
- `https://newkol.guangai.ai` 现跑 **M1-B 版 @ `19af7f1b03f00241fbac001559fcf5845a100bfc`**（2026-07-22 部署，run 29900851056；health+四项目 SSR 真数据+D2 降级实测全过）。回滚=deploy-prod 填 `fa52f8619b2277e578d3a6e1bbd5b77a5bd062ad`
- ⚠️ **image_tag 必须完整 40 位 SHA**；**部署 SHA≠HEAD**——纯文档/状态 commit 不构建镜像，须部署最后一个含代码的已构建 SHA

## 演进路线（architecture.md v1.2 §14）
- M0 ✅ → M0.5 ✅ → M1-A ✅ → **M1-B ✅ → M1-C（列表/今天页 RSC 直读/knowledge/例程）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 硬化

## 需求池 / 待人类
- **BL-FE-17 已作废**（F006 兑现）；**BL-FE-16** 暴露面零，backlog 保留
- `framework/proposed-learnings.md`：**1 条待裁决**（删除类 feature 勘查面按被删路径 grep，M1-B F006 反例）+ harness-fit 9 条长期挂起
- signoff 遗留观察 10 条（均不阻塞）：S7 部署链 seed（上）· architecture M0.5 口径滞后（M1-A S1 顺延，M1-C 顺手校准）等，全文见 signoff §遗留

## 关键技术坑（framework v1.0.8）
- UI 实测一律 standalone · 基线重生 `=all` 断言紧阈值 · **容忍带会把故意变更「借绿」——意图变更必须重生基线** · RSC 直连 DB 页面无法 route-mock（CI/基线重生 workflow 都要起 DB）· 删除类 feature 勘查按被删路径 grep（含 package.json scripts）

## 已知下游（不在当前）
- `api/envelope.ts` 信封 · OperationLog append-only 触发器（R14）· 闸门并发原子防护（R15）· 真实认证/RLS（M5）
