---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M1-A-BRIEF done ✅ 并已上线（2026-07-22）· 快车道** — 6/6 PASS，fix_rounds=1，signoff 已签发（隔离 evaluator）。生产已部署验证通过
- **交付：** vitest 地基（+CI unit job 起 pgvector 跑集成测）· 拆 NoSSR 恢复全站 SSR · Project/OperationLog expand 迁移 + canonical seed · `domain/` 三件（health / env-guards / env-advance）· 变异测试
- **下一站 M1-B：** 页面接真数据 + brief 分流 bug + compute_health 工具 + 页面层守卫 + BL-FE-16/17

## 验收轨迹（证据链）
- verify-1 fan-out 6 evaluator → 4 PASS + 2 PARTIAL（对抗复核未证伪）→ fixing-1 → reverify-1 2 PASS → 终审 signoff
- 报告：`docs/test-reports/M1-A-BRIEF-{verify-fanout,reverify,signoff}-2026-07-22.md`

## M1-B 须知（三条易误判为 bug 的预期行为，均记录在案）
- **seed 四项目健康度全 `cr`**（D15）：实际曝光/已消耗预算本批无存处，接真实指标后消解，不得改算法掩盖
- **creators/runs SSR 首屏只有外壳**：两页自身 `useSearchParams`+Suspense（Next 15），非缺陷
- **architecture.md §12.6.3/§5.3 口径滞后于 as-built**（vitest 已装 / vite-tsconfig-paths 未装 / include 已收窄 / 游标守卫已落地）→ signoff S1 建议 M1-B 校准

## 已上线
- `https://newkol.guangai.ai` 现跑 **M1-A-BRIEF 版 @ `fa52f8619b2277e578d3a6e1bbd5b77a5bd062ad`**（2026-07-22 部署，healthy + F002 六页 SSR 首屏实测确证）。回滚=deploy-prod 填上一版 **完整 SHA** `0c36fc2f24395be5bbf9af60a0cf4342dde057be`（P2-CLEANUP 版）
- ⚠️ **deploy 的 image_tag 必须填完整 40 位 SHA**，短 SHA 会 pull 失败（见 environment.md）
- ⚠️ **部署的 SHA ≠ 当前 HEAD**：done 收官的纯文档/状态 commit 命中 build-push 的 paths-ignore 不构建镜像；须部署最后一个含代码改动的已构建 SHA（本批 = fa52f861，非 done commit ffd9a15）

## 演进路线（architecture.md v1.2 §14）
- M0 ✅ → M0.5 ✅ → **M1-A ✅ → M1-B（下一站）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 PROD-HARDENING

## 需求池（backlog.json）
- **BL-FE-16 / BL-FE-17**（`image/` 模板残留统一处置）— 顺延 M1-B

## 待人类处理
- `framework/proposed-learnings.md`：**M1-A 新增 3 条待裁决**（勘查审查面按语义划 / 探针代理前提随架构失效 / 覆盖率门 include 不可大于批次范围）+ P2-CLEANUP 4 条 + harness-fit 9 条长期挂起

## 关键技术坑（沿用 framework v1.0.7 + 本批新踩）
- UI 实测一律 standalone 不走 next dev · CDN 字体是视觉抖动总根源 · 基线重生用 `--update-snapshots=all`
- **本批：** `typeof window` 服务端分支在无 SSR 时无症状、恢复 SSR 即成 hydration mismatch 源 · 测试的「代理判据」随架构变更静默失效（p2:f002/f004 同因）· Vite 8 已原生化 tsconfig paths · git add -A 易把生成产物扫进库

## 已知下游（不在当前）
- `api/envelope.ts` 信封 · OperationLog append-only 触发器（R14）· 闸门并发原子防护（R15）· MCP 实装 · 真实认证/RLS（M5）
