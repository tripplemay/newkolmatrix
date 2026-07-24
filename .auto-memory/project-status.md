---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M3-B-DELIVERY 首轮验收完成 → fixing（2026-07-24，快车道）** — 12 features fan-out 隔离验收：**11 PASS，1 PARTIAL（F012）**，0 FAIL。F012 PARTIAL 经对抗复核 UPHELD：唯一阻断 = architecture.md line 254（顶层架构图 OPS 节）/ line 372（源码目录树）仍把 escrow/keys 标「演进 M3-B+/归 M3-B+」，而 F004 已 mock 实装（`ops/partner/`）+ 同文档 §9.8/§10.3/§14 已翻牌——批内反向漂移，F012 acceptance 显式含此复核项。**修法：翻牌 L254/L372 两处 escrow/keys（share 保持未来态不动），产品代码不动。** 报告全在 `docs/test-reports/M3B-F0*-verify-*.md` + `M3B-F012-recheck-*.md`
- **building 完成 12/12（2026-07-23）** — 交付域立真：四表 + `deliveryCheck` 纯函数（三处复用）+ `dealAdvance` 资金状态机 + `ops/partner` mock 适配器（**零真实资金动作**）+ payout/distribute_keys 两 outbound 闸门（**服务端二次校验无绕过**）+ delivery 两 internal 工具 + 交付登记三端点 + V7 台账接真 + →delivery/→insight 真判（五流转自此全真判）+ backlog 两条消解。spec `docs/specs/M3-B-DELIVERY-spec.md`
- **M3-A-REACH-CRM done ✅ 已上线**（prod 真投递 + webhook 闭环实证）；M0→M2-C 全 done ✅；下批 M4-INSIGHT
- 验收入口：`npm run delivery:e2e`（24 断言全链）· `npm run f009:viewport` · `npm run f012:colormode`（后两者需 build + standalone）

## 已上线
- `https://newkol.guangai.ai` 跑 **M3-A @ `a2751fd71b7572de276b0b7fc70ad8065c831810`**；回滚=deploy-prod 填 `42bacb3dda7aebfdd71bc4a859987d7d2a9ee717`
- M3-B 尚未部署（验收通过后由用户手动触发 deploy-prod）；本批无新增 env（partner 恒 mock）
- ⚠️ 部署 SHA ≠ HEAD（文档/状态 commit 走 paths-ignore 不 build）；image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog：**已清空**（BL-BRIEF-GOAL / BL-FE-16 均已实装并移除）
- soft-watch：M3-A 结转四条已处置三条（F003-low-2 / F002-XFF / F004-low-1）；**F003-low-1 未修**（resend SDK 不暴露 signal，race 超时保留 + 明文标注，续记）
- proposed-learnings：**M3-A 4 条 + M3-B 1 条待确认**（新增：视觉基线含相对时间标签在本地长寿命 DB 下会自然翻红）
- 遗留归位：真入站收信/批量发信→M3-C+ · 洞察 ROI/周报→M4 · 真实 partner（Stripe/电子签/key 平台）+ 受众三键/brandSafety/真实认证+RLS→M5

## 关键技术坑（v1.0.11 + M3-B 新证）
- 闸门类 feature 必有「HTTP 创建→confirm」全链回归 · CI 无 dev tenant seed（route 测下沉服务层+夹具租户）· 新视觉基线 CI 首推必红（走 workflow+pull 回）· 基线重生前 kill :3000 + 伪造 AIGCGATEWAY_* · `--update-snapshots=all` 会顺带重写无关基线（须 checkout 还原）· Deal 有 `@@unique[projectId,kolId]`（多笔 Deal 夹具需多 KOL）· 格式化 hook 会重排 import（脚本改文件前先核对实物）
