---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M2-B-CREATORS done ✅（2026-07-23）· 快车道 · 9/9 PASS（fix_rounds=1）** — 创作者域纵切交付：apify-kol 外采接入（拉模型只读零投喂）+ 深字段规则派生（interests/credibility 五因子；brandSafety 契约先立）+ creators 页/抽屉七分区接真（mock 退役）+ ProvenanceTag 接真（dataSource 归一，恒 ai_estimate bug 根治）+ 裁定写入口（V5+2/V9+1 元素）+ 评分受众加权激活 + kol-sync 例程。signoff `docs/test-reports/M2-B-CREATORS-signoff-2026-07-23.md`
- **M1 全域 + M2-A 均 done ✅**

## 已上线
- `https://newkol.guangai.ai` 现跑 **M2-B 版 @ `7cebb524281de2613b43aaaad626610ae4f447f1`**（2026-07-23 部署，五项验证过：health/badges/creators 真数据/三例程注册/apify-kol 内网 200）。回滚=deploy-prod 填 `3d93f72a65681c6787d2daba9cf6cf4c76e5c087`
- ⚠️ image_tag 必须完整 40 位 SHA；部署 SHA≠HEAD；compose 是 VPS 人工副本（M2-B 已 scp 同步 + .env 已加 APIFY_KOL_API_KEY）
- **观察项：prod kol-sync 首跑今夜 03:00**（预期拉入 apify-kol 存量 8800+ 行 + 派生 + embedding 补灌 <1M token 一次性）——首跑后核 `docker logs newkolmatrix-app | grep kol-sync`

## 演进路线（architecture.md §14）
- M0→M2-B 全 ✅ → **M3 REACH/DELIVERY（CRM 事件推断+信号接入+真邮件/资金状态机+闸门 7 态）** → M4 INSIGHT → M5 硬化（含受众分布三键/brandSafety 真源 + R7 备份）

## 需求池 / 待人类
- backlog：仅 BL-FE-16（搁置）
- soft-watch ×2（M2-B 复验注记，下批顺手清）：derive.ts:195 provenance detail 三因子枚举未随五因子更新；kol-deep.test.ts 两处旧权重注释
- proposed-learnings：清零（harness-fit 长期挂起除外）
- 遗留归位：价格数据→M3 CRM · 洞察徽标→M4 · 受众分布三键/brandSafety 真源→M5 · apify-kol 上游债（GET /kol X 枚举缺口，另仓不越界）

## 关键技术坑（v1.0.11 + 本批新证）
- RSC 直读必 force-dynamic · 视觉意图变更必重生基线（容忍带借绿）· 重生前必查 :3000 残活（§4.5）· 集成测试夹具租户必独立 · **集成测试打 loadMatchSurfaceData 类带 lazy 的组装层前必先建组**（零 plans 触发 P2 lazy 回落真网关——P7 违反 + flaky，match-verdict/score-upgrade 双案例）
