---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M3-A-REACH-CRM done ✅（2026-07-23 · 快车道 · fix_rounds=2 · 10/10 PASS）** — 触达域立真：四表迁移 + 闸门两步票据 7 态（消 R15，`/api/gate/*` 退役 → `/api/actions/[id]/*`）+ ops/email（Resend port + mock 转正）+ signals webhook（Svix 验签+防重）+ crmInfer 五态纯函数（U4 有限覆盖）+ reach 工具扩容（draft/refine/commit_quote + P8 回填）+ contactEmail 录入口 + V6 收件箱接真 + reach:e2e 闭环。三轮验收（fan-out×10+对抗×3 → fix1 → reverify → fix2 → reverify）。signoff `docs/test-reports/M3A-reach-crm-signoff-2026-07-23.md`
- **M0→M2-C 全 done ✅**；下批 **M3-B-DELIVERY**（Deal/Deliverable/GameKey/Payout + partner 适配器 + payout 闸门 + V7 台账接真）

## 已上线 / 待部署
- `https://newkol.guangai.ai` 现跑 **M2-C @42bacb3**；**M3-A 已验收待部署**——用户触发 deploy-prod（完整 40 位 SHA）即上线
- **M3-A 部署面全就位**：VPS .env 三键齐（RESEND_API_KEY 服务器侧复制未离 VPS / OUTREACH_TEST_RECIPIENT=tripplezhou@gmail.com / RESEND_WEBHOOK_SECRET 用户建 endpoint 后写入）+ compose 已 scp；部署即生效
- **部署后必做**：prod 补验真投递 REAL（仅 tripplezhou@gmail.com，验 mocked=false + providerMessageId + webhook 四事件回流）——本地不可跑（U2 密钥不离服务器）
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本；prod kol-sync 03:00 观察项仍在

## 需求池 / 待人类
- backlog：仅 BL-FE-16（搁置）
- soft-watch（M3-A 随批记账，均有明文兜底）：F003 ResendSender Promise.race 非真 abort / F003 幂等重入 mocked 硬编码 / F004 ingest 四步非同事务 / F002 XFF 首段可伪造（M3-B 顺手）
- proposed-learnings：**M3-A 4 条待确认**（payloadHash JSONB 往返语义 / 闸门 HTTP 全链回归 / 工具注册模块图副作用 / mock SENT_MARKER 清态）
- 遗留归位：真入站收信/批量发信→M3-B+ · 洞察徽标→M4 · 受众三键/brandSafety→M5

## 关键技术坑（v1.0.11 + M3-A 新证）
- 完整性 hash「建立算/存储后复算」必对齐 JSONB 往返（undefined 值键丢弃）· 闸门类 feature 必有「HTTP 创建→confirm」回归（服务层直调漏检 undefined-键毒化）· 工具注册勿依赖模块图副作用（冷进程直达坑）· mock 发送清态按 SENT_MARKER 非 ref · CI 无 dev tenant seed（route 测下沉服务层+夹具租户）· 新视觉基线 CI 首推必红（走 workflow+pull）· 基线重生前 kill :3000 + 伪造 AIGCGATEWAY_*
