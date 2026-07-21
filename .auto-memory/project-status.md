---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **P2-CLEANUP verifying 🔍（2026-07-21）** — building 完成 **5/5**，CI 全绿（Build/Lint/Typecheck/Visual）；spec `docs/specs/P2-CLEANUP-spec.md`
- **交付：** F001 抽屉遮罩关闭（根因浏览器量化坐实 container height=0px，采纳 D3 修法① containerProps.style 补 100vh）· F002 深色持久化（键 `kolmatrix.colorMode`，localStorage + pre-paint 内联脚本）· F003 Avatar 状态源统一 + 边框通道改真 · F004 抽 `common/HandoffPanel`，夹具获 border-dashed 对齐生产 · F005 CreatorDrawer 入基线 + 批末单次重生
- **回归资产：** 四条探针 `npm run p2:f001~f004`（浏览器探针须 standalone 前置）+ `tests/visual/creator-drawer.spec.ts`；darwin/linux 基线均已重生
- **上一批 ARCH-M05 done ✅** — M0.5 六页工作台 17/17，已部署 live（钉 SHA `d5256a8`）

## 已上线
- `https://newkol.guangai.ai` 当前跑 **ARCH-M05/M0.5 版 @ d5256a8**（P2-CLEANUP 尚未部署）；回滚=deploy-prod 填 42d7d75

## 演进路线（architecture.md v1.2 §14）
- M0 ✅ → **M0.5 ✅** → **M1 BRIEF-CAMPAIGNS（下一站）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 PROD-HARDENING

## 需求池（backlog.json）
- **空** —— 三条 P2 已并入 P2-CLEANUP（决策归档见该批 spec §1 表）

## 待人类确认（阻塞项）
- **F003 实装偏离裁决措辞**：用户裁决 C 含「改 Image border 通道」，实装未动 `Image.tsx`（缺陷在 Avatar 发错通道，从 Avatar 侧改发 className 即达成同一结果）。详见 `docs/specs/P2-CLEANUP-F003-avatar-deadcode-audit.md` §4.2，**若本意要连 Image 一起改造须驳回重做**

## 关键技术坑（沿用 framework v1.0.6）
- UI 实测一律 standalone 不走 next dev · CDN 字体是视觉测试抖动总根源 · Tailwind JIT 双域 token · 视觉基线重生用 `--update-snapshots=all` 断言用紧阈值 · 空数据基线须 waitFor 硬断言
- **本批新踩：** 新增视觉用例后首推 CI 必红（linux 基线不存在）→ 须手动跑 `Update visual baselines` workflow，而该 workflow 的 commit 带 `[skip ci]`，须另有一次非忽略路径的 push 才能验证 CI 绿

## 已知下游（不在当前）
- M1 起各专家领域工具 · MCP 实装 · 真实认证/RLS（M5）· 真实 outbound 投递 · harness-fit 9 条挂起
