---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **P2-CLEANUP building 🔨（2026-07-21 起）** — 清空需求池三条 P2 + 两项勘查缺口，5 features 全 generator；spec `docs/specs/P2-CLEANUP-spec.md`
- **范围：** F001 抽屉遮罩关闭（根因=无 ChakraProvider 致 container 塌 0）· F002 深色持久化（localStorage + pre-paint，全站 NoSSR 故不走 cookie）· F003 Avatar colorMode 脱节 · F004 抽 HandoffPanel 且夹具对齐生产 · F005 CreatorDrawer 入基线 + 单次重生（必须最后）
- **上一批 ARCH-M05 done ✅** — 架构定稿 v1.2 + M0.5 六页工作台，17/17（fix_rounds=1），已部署 live（钉 SHA `d5256a8`）；framework v1.0.6 沉淀 13 条 learnings 已闭环

## 已上线
- `https://newkol.guangai.ai` 当前跑 **ARCH-M05/M0.5 版 @ d5256a8**；回滚=deploy-prod 填 42d7d75（FE-REFACTOR 版）

## 演进路线（architecture.md v1.2 §14）
- M0 ✅ → **M0.5 ✅** → **M1 BRIEF-CAMPAIGNS（下一站）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 PROD-HARDENING

## 需求池（backlog.json）
- **空** —— 三条 P2 已并入 P2-CLEANUP 批次（决策归档见该批 spec §1 表）

## 关键技术坑（本批实战，proposed-learnings 待确认）
- next dev 白屏（devtools segment-explorer × RSC manifest 冲突）→ **UI 实测一律 standalone**（INFO-1，两组独立踩中）
- CDN 字体 = 视觉测试抖动总根源（每测试零缓存重拉）→ tests/visual/fonts/ 本地回放夹具
- Tailwind JIT 静态扫描：className 可达值必须走 tailwind.config，JS 常量进 className 会静默丢 CSS
- 批内文档新鲜度：首 feature 定稿的口径文档被后续 feature 反向漂移（FIX-2）→ 批末须刷新
- tmux pane 通路故障时 subagent 走已完成 agent 的 resume 转派兜底（独立性核验「验收→验收」）

## 已知下游（不在当前）
- M1 起各专家领域工具 · MCP 实装 · 真实认证/RLS（M5）· 真实 outbound 投递 · harness-fit 9 条挂起
