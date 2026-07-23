---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M3-B-DELIVERY building 0/12（spec lock 2026-07-23，快车道）** — 交付域立真：Deal/Deliverable/GameKey/Payout 四表 + deliveryCheck 条件核对纯函数 + payout/distribute_keys 两 outbound 闸门（**零真实资金动作**，partner 接口先行+mock）+ V7 台账接真 + →delivery/→insight 守卫真判 + backlog 两条消解。spec `docs/specs/M3-B-DELIVERY-spec.md`
- **M3-A-REACH-CRM done ✅ 已上线（2026-07-23）** — 三轮验收 10/10 PASS（fix_rounds=2）；prod 真投递 + webhook 回流闭环实证。signoff `docs/test-reports/M3A-reach-crm-signoff-2026-07-23.md`
- **M0→M2-C 全 done ✅**；下批 M4-INSIGHT

## 已上线
- `https://newkol.guangai.ai` 跑 **M3-A @ `a2751fd71b7572de276b0b7fc70ad8065c831810`**；回滚=deploy-prod 填 `42bacb3dda7aebfdd71bc4a859987d7d2a9ee717`
- VPS .env 三键齐（RESEND_API_KEY / RESEND_WEBHOOK_SECRET / OUTREACH_TEST_RECIPIENT=tripplezhou@gmail.com）；compose 已 scp
- ⚠️ 部署 SHA ≠ HEAD（文档/状态 commit 走 paths-ignore 不 build）；image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog：**已清空**（两条均并入 M3-B F011/F012；实装完成时才从 backlog.json 移除）
- soft-watch：M3-A 结转 4 条（F003×2 / F004 事务 / F002-XFF）列为 M3-B 顺手项（spec §9），不阻断
- proposed-learnings：**M3-A 4 条待确认**（payloadHash JSONB 往返 / 闸门 HTTP 全链回归 / 工具注册模块图副作用 / mock SENT_MARKER 清态）
- 遗留归位：真入站收信/批量发信→M3-B+ · 洞察徽标→M4 · 受众三键/brandSafety/真实认证+RLS→M5

## 关键技术坑（v1.0.11 + M3-A 新证）
- 完整性 hash「建立算/存储后复算」必对齐 JSONB 往返（undefined 值键丢弃）· 闸门类 feature 必有「HTTP 创建→confirm」全链回归 · 工具注册勿依赖模块图副作用 · mock 发送清态按业务标记非 ref · CI 无 dev tenant seed（route 测下沉服务层+夹具租户）· 新视觉基线 CI 首推必红（走 workflow+pull 回）· 基线重生前 kill :3000 + 伪造 AIGCGATEWAY_*
