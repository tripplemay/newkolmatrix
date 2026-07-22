---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M1-C-LIST-TODAY done ✅（2026-07-22）· 快车道 · /goal 授权自动推进** — 首轮 6 PASS + F005/F007 PARTIAL（对抗复核维持）→ 修复 → 复验双 PASS，fix_rounds=1；signoff `docs/test-reports/M1-C-LIST-TODAY-signoff-2026-07-22.md`
- **已交付：** 列表页/今天页 RSC 直读（force-dynamic）· 雷达接 PendingAction 真数据（expand projectId/agentId）· 例程调度器（node-cron + health-scan + instrumentation）· mock/projects+today 退役 · tone/label 展示层单点 · f008 修缮双态断言 · architecture.md 口径校准（M1 置✅已交付，knowledge 拆 M1-D）
- **M1（project+brief 域）三批全交付**：M1-A 地基 → M1-B 详情页纵切 → M1-C 列表/今天页 + 例程
- **已部署 ✅**：生产 @ `8438dab`（2026-07-22，health+三页 SSR 实测全过）；prod 例程 02:00 首跑巡检为观察项

## 已上线
- `https://newkol.guangai.ai` 现跑 **M1-C 版 @ `8438dab1a07eced2e211dfebd07da7f43df9c701`**（2026-07-22 部署，列表/今天页真数据+例程调度器已上线）。回滚=deploy-prod 填 `19af7f1b03f00241fbac001559fcf5845a100bfc`
- ⚠️ **image_tag 必须完整 40 位 SHA**；**部署 SHA≠HEAD**——纯文档/状态 commit 不构建镜像

## 演进路线（architecture.md §14，M1-C F007 已校准）
- M0 ✅ → M0.5 ✅ → **M1 ✅（A/B/C 三批）→ M1-D（knowledge 域：Material/GameKnowledge 表 + 上传通道 + 解析管道 + 存储后端裁决=人类闸门）** → M2 MATCH → M3 REACH/DELIVERY → M4 INSIGHT → M5 硬化

## 需求池 / 待人类
- backlog：仅 BL-FE-16（暴露面零，登记不做）
- `framework/proposed-learnings.md`：**4 条待裁决**（M1-B 勘查按被删路径 grep ×1 + M1-C force-dynamic/CI watch 过滤 ×2 + 收敛零漂移声明两侧比对 ×1）+ harness-fit 9 条长期挂起
- M1-C 遗留观察（signoff）：D-B 侧栏徽标过渡态（M1-D 徽标服务）· F005 wn 档差异 M2/M3 显形 · S10 推进写 UI 入口未建 · prod 例程首跑观察

## 关键技术坑（v1.0.8 + 本批新证）
- RSC 直读 DB 页面必须 force-dynamic（构建期静态化冻结数据 + CI 无 DB 硬红）· CI watch 必须 --workflow 过滤且显式核 conclusion · 收敛类「零漂移」声明须逐份 diff 全部副本 · 意图变更必重生基线（容忍带借绿）· 本地重生基线前清 PendingAction/OperationLog（D-H）

## 已知下游（不在当前）
- `api/envelope.ts` 信封 · OperationLog append-only 触发器（R14）· 闸门并发原子防护（R15）· 徽标服务/洞察页接真（M1-D+）· 真实认证/RLS（M5）
