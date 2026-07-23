---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M3-A-REACH-CRM verifying 10/10（building 完成 2026-07-23，快车道）** — 触达域已立真：四表迁移 + 闸门两步票据 7 态（消 R15，/api/gate/* 退役 → /api/actions/[id]/*）+ ops/email（Resend port + mock 转正）+ signals webhook（Svix 验签+防重）+ crmInfer 五态纯函数（U4 有限覆盖）+ reach 工具扩容（draft/refine/commit_quote + P8 回填）+ contactEmail 录入口 + V6 收件箱接真（mock 退役，V6 24→26 登记）+ reach:e2e 闭环。待 fan-out 验收（10 features，orchestration §4）。spec `docs/specs/M3-A-REACH-CRM-spec.md` + F008 审计 `M3-A-REACH-CRM-F008-v6-wiring-audit.md`
- **M2-C done ✅ · M0→M2-B done ✅**；下批 M3-B-DELIVERY

## 已上线
- `https://newkol.guangai.ai` 现跑 **M2-C 版 @ 42bacb3**；M3-A 验收通过后由用户触发 deploy-prod（完整 40 位 SHA）
- **M3-A 部署面全齐（2026-07-23）**：VPS .env 三键就位——RESEND_API_KEY（服务器侧复制，未离开 VPS）+ OUTREACH_TEST_RECIPIENT=tripplezhou@gmail.com + RESEND_WEBHOOK_SECRET（用户已在 Resend 控制台建 endpoint → newkol.guangai.ai/api/signals/inbound 四事件，新 secret 已写入）；compose 已 scp。部署即生效
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本；prod kol-sync 03:00 首跑观察项仍在

## 演进路线（architecture.md §14）
- M0→M3-A ✅ → **M3-B DELIVERY**（Deal/Deliverable/GameKey/Payout + partner 适配器 + payout 闸门 + V7 接真）→ M4 INSIGHT → M5 硬化

## 需求池 / 待人类
- backlog：仅 BL-FE-16（搁置）；soft-watch 遗留见 M2-C signoff + derive.ts:195
- 真发 L2：密钥仅在 VPS——真投递验证 = 部署后 prod 实测（P1 仅 tripplezhou@gmail.com）
- 遗留归位：真入站收信/批量发信→M3-B+ · 洞察徽标→M4 · 受众三键/brandSafety→M5

## 关键技术坑（v1.0.11 + M3-A 新证）
- CI 跑集成测且**无 dev tenant seed**——route 层测试必须下沉服务层 + 独立夹具租户 · 新视觉基线 CI 首推必红（linux 基线走 workflow + pull 回）· fieldProvenance 必须条目对象 {source,fetchedAt}（flat 字符串整表降级）· crmInfer 合成 = max(事件面, 最新合法 override)（纯 override 可改标，事件面是地板）· RSC 直读必 force-dynamic · 基线重生前 kill :3000 + 伪造 AIGCGATEWAY_*
