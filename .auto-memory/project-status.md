---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **ARCH-M05 done ✅（2026-07-21）** — 架构定稿 + M0.5 六页工作台，17/17（fix_rounds=1）；signoff `ARCH-M05-signoff`（§7 done 签收）
- **交付：** `docs/dev/architecture.md` v1.2（kimi 基底 + f5 十条增量 + as-built 校准，工程落法权威）· 六页工作台（today/项目+五环节语法面/创作者库+34 元素抽屉/知识/洞察/记录，301 元素清单验收）· 三区外壳（侧栏 CTA/玻璃 navbar 指令栏/Copilot 编队+协同+动作卡）· mock 渲染契约层（provenance+ProvenanceTag 双 variant）· common 17 件 + admin/ port 约定首执行 · 视觉基线 12 页（紧阈值 1500px + CDN 字体本地夹具，抖动根治）· ?env= 全链迁移
- **已部署 ✅（2026-07-21）**：M0.5 版本 live（用户授权，run 29822407758 钉 SHA `d5256a8`；线上确证 / 直指 today + M0.5 token 在线）

## 已上线
- `https://newkol.guangai.ai` 当前跑 **ARCH-M05/M0.5 版 @ d5256a8**；回滚=deploy-prod 填 42d7d75（FE-REFACTOR 版）

## 演进路线（architecture.md v1.2 §14）
- M0 ✅ → **M0.5 ✅** → **M1 BRIEF-CAMPAIGNS（下一站）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 PROD-HARDENING

## 需求池（backlog.json）
- BL-FE-12 深色持久化（P2）· BL-FE-14 HandoffPanel 二次收敛（P2）· 待入池：MINOR-F013-1 创作者抽屉遮罩关闭（P2）

## 关键技术坑（本批实战，proposed-learnings 待确认）
- next dev 白屏（devtools segment-explorer × RSC manifest 冲突）→ **UI 实测一律 standalone**（INFO-1，两组独立踩中）
- CDN 字体 = 视觉测试抖动总根源（每测试零缓存重拉）→ tests/visual/fonts/ 本地回放夹具
- Tailwind JIT 静态扫描：className 可达值必须走 tailwind.config，JS 常量进 className 会静默丢 CSS
- 批内文档新鲜度：首 feature 定稿的口径文档被后续 feature 反向漂移（FIX-2）→ 批末须刷新
- tmux pane 通路故障时 subagent 走已完成 agent 的 resume 转派兜底（独立性核验「验收→验收」）

## 已知下游（不在当前）
- M1 起各专家领域工具 · MCP 实装 · 真实认证/RLS（M5）· 真实 outbound 投递 · harness-fit 9 条挂起
