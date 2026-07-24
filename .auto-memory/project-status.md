---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M3-B-DELIVERY done ✅（2026-07-24，快车道，fix_rounds=1）** — 交付域立真闭环全验收：**12/12 PASS**（首轮 11 PASS + F012 PARTIAL 文档漂移→对抗复核 UPHELD→fixing 翻牌 architecture.md L254/L372→reverify PASS）。四表 + `deliveryCheck` 纯函数（三处复用）+ `dealAdvance` 资金状态机 + `ops/partner` mock 适配器（**零真实资金动作**）+ payout/distribute_keys 两 outbound 闸门（**服务端二次校验无绕过**）+ delivery 两 internal 工具 + 交付登记三端点 + V7 台账接真 + →delivery/→insight 真判（五流转自此全真判）+ backlog 两条消解。signoff `docs/test-reports/M3B-DELIVERY-signoff-2026-07-24.md`；验收入口 `npm run delivery:e2e`
- **M3-B-DELIVERY 已上线 ✅（2026-07-24，deploy run 30067908179 success + health 200 + delivery 页 200 + /api/delivery/payout 405 路由实证）**
- **M3-A-REACH-CRM done ✅**；M0→M2-C 全 done ✅；**下批 M4-INSIGHT**（ROI/周报/对外分享 + →insight 消费）

## 已上线
- `https://newkol.guangai.ai` 跑 **M3-B @ `49308c1a5e71e14b3ecaf55032dc971a304c7b93`**；回滚=deploy-prod 填 `a2751fd71b7572de276b0b7fc70ad8065c831810`（M3-A 上一 good）
- M3-B 部署面：compose 未改（无需 scp）· 无新增 env（partner 恒 mock，零真实资金动作）· migrate one-shot 建 4 表+5 枚举（expand-only，纯 CREATE 安全）
- ⚠️ 部署 SHA ≠ HEAD（文档/状态 commit 走 paths-ignore 不 build，M3-B 部署 SHA=49308c1 而非 HEAD 14c9825）；image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog：**已清空**（BL-BRIEF-GOAL / BL-FE-16 均已实装并移除）
- soft-watch：M3-A 结转四条已处置三条（F003-low-2 / F002-XFF / F004-low-1）；**F003-low-1 未修**（resend SDK 不暴露 signal，race 超时保留 + 明文标注，续记）
- proposed-learnings：**M3-A 4 条 + M3-B 1 条待确认**（新增：视觉基线含相对时间标签在本地长寿命 DB 下会自然翻红）
- 遗留归位：真入站收信/批量发信→M3-C+ · 洞察 ROI/周报→M4 · 真实 partner（Stripe/电子签/key 平台）+ 受众三键/brandSafety/真实认证+RLS→M5

## 关键技术坑（v1.0.11 + M3-B 新证）
- 闸门类 feature 必有「HTTP 创建→confirm」全链回归 · CI 无 dev tenant seed（route 测下沉服务层+夹具租户）· 新视觉基线 CI 首推必红（走 workflow+pull 回）· 基线重生前 kill :3000 + 伪造 AIGCGATEWAY_* · `--update-snapshots=all` 会顺带重写无关基线（须 checkout 还原）· Deal 有 `@@unique[projectId,kolId]`（多笔 Deal 夹具需多 KOL）· 格式化 hook 会重排 import（脚本改文件前先核对实物）
