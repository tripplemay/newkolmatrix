---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M4-INSIGHT building 完成 12/12 → verifying（2026-07-24，快车道）** — 洞察域立真：三表（MetricSnapshot/WeeklyReport/ShareLink）+ `roi.compute`/`attribution.gaps` 纯函数（三处复用，ROI 诚实降级分子缺显证据不足）+ spend 真源装配（released Payout＞committed Quote，仅 USD）+ `compute_roi`/`draft_report` internal + `create_share_link` outbound（**白名单第 6，mock 零真实公开暴露**）+ `ops/share` 接口先行 + V8/V12 接真（env-insight/insight 两 mock 退役）+ weekly-draft 例程 + `npm run insight:e2e`（23 断言）。HEAD CI 绿 @ f6a631b
- **待验收**：evaluator 隔离验收（/verify）。Generator 自行裁决点与已知漂移见 progress.json session_notes.Andy（① ROI 口径 conversions/spend 单点 ② ShareLink.projectId 软引用 ③ V8 对照表指标轴重立 ④ 图卡 M5 占位）
- M3-B-DELIVERY done ✅ 已上线 prod @ 49308c1；M0→M3 全 done ✅

## 已上线
- `https://newkol.guangai.ai` 跑 **M3-B @ `49308c1a5e71e14b3ecaf55032dc971a304c7b93`**；M4 未部署（验收后由用户手动触发 deploy-prod）
- M4 部署面预告：compose 未改 · 无新增必需 env（share 恒 mock；`AIGCGATEWAY_REPORT_MODEL` 可选路由插座）· migrate one-shot 建 3 表+1 枚举（expand-only 纯 CREATE 安全）
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本；部署 SHA 取最后一个非 paths-ignore commit

## 需求池 / 待人类
- backlog：空
- L2 授权未消耗：draft_report/weekly-draft 本批全程降级草案（零外呼）；验收真网关最小用量 = `INSIGHT_E2E_REAL_LLM=1 npm run insight:e2e`（需用户授权）
- soft-watch 续记：F003-low-1（resend SDK 不暴露 signal）未修；洞察侧栏徽标恢复（M4 接真后数据源已可用，恢复与否留下批裁决）
- proposed-learnings：M3-A 4 条 + M3-B 1 条待确认

## 关键技术坑（M4 新证）
- 注入缝 LLM caller 必须无条件调用（凭据降级只对默认 caller 生效——CI 无凭据曾把 mock 测试静默改道降级分支，c09ef41）· 测试钉注册表全量清单会连坐后续扩展（改「在场+前缀序」断言）· 新基线 CI 首推必红走 update-visual-baselines workflow · 本地长寿命 DB：today（相对时间）/match（真数据 vs CI 空态夹具）两基线本地自然翻红属预期
