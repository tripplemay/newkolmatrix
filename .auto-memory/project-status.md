---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M2-A-MATCH done ✅（2026-07-22）· 快车道 · 首轮 10/10 PASS（9F + 就绪回归）fix_rounds=0** — match 域纵切交付：三表 + matchScore 纯函数 + 候选/组合规则化生成 + 矩阵/待裁定接真（mock 退役）+ 批准 internal 解锁 →reach（S10 消解）+ nightly-screen（scheduler 注册表化）+ match 工具×2/canvas type 路由（ADR-28 兑现）/uiSyntax 注入 + 侧栏徽标接真（D-B 消解）+ SW-R1 退役/OBS-1 迁移。signoff `docs/test-reports/M2-A-MATCH-signoff-2026-07-22.md`
- **M1 全域 done ✅**（A/B/C/D 四批全 PASS）

## 已上线
- `https://newkol.guangai.ai` 现跑 **M2-A 版 @ `3d93f72a65681c6787d2daba9cf6cf4c76e5c087`**（2026-07-22 部署，health+nav-badges 真计数+today+match 面 lazy 真生成 四项验证过）。回滚=deploy-prod 填 `ecde6cdfabc7cae570ace4006d6af7a307457110`
- ⚠️ **image_tag 必须完整 40 位 SHA**；**部署 SHA≠HEAD**——状态/文档 commit 不构建镜像
- ⚠️ **compose 是 VPS 人工副本**：M2-A 零 compose 变更，本次不需 scp

## 演进路线（architecture.md §14）
- M0 ✅ → M0.5 ✅ → M1 ✅ → **M2-A ✅ → M2-B（抽屉七分区接真 + Kol 深字段数据源裁决）** → M3 REACH/DELIVERY → M4 INSIGHT → M5 硬化

## 需求池 / 待人类
- backlog：仅 BL-FE-16（暴露面零，登记不做）
- `framework/proposed-learnings.md`：**1 条待裁决**（dev server 残活 :3000 → 视觉基线污染坑，M2-A F008 沉淀）+ harness-fit 9 条长期挂起
- 遗留归位：M2-B 待裁决 = Kol 深字段数据源（AI 估算 vs 外部采集）· 洞察徽标恢复归 M4 · MatchCandidate 人工裁定写入口归 P8 后续批 · 价格数据归 M3 CRM · prod 例程 02:00/02:30 首跑观察

## 关键技术坑（v1.0.10 + 本批新证）
- RSC 直读必 force-dynamic · CI watch 必 --workflow 过滤 · 视觉意图变更必重生基线（1500px 容忍带会借绿——两枚徽标消失也不红）· 重生基线前必查 :3000 无残活 dev server（reuseExistingServer 静默复用）· 本地重生前清 Match 三表+PendingAction/OperationLog（D-H 扩展）· 集成测试夹具租户必须独立（共享 dev tenant find+create 在 CI 并行必撞 P2002）
