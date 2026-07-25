---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M4-INSIGHT done ✅（2026-07-25，快车道，fix_rounds=2）** — 洞察域立真全验收 **12/12 PASS**（首轮 11 PASS + F012 PARTIAL→对抗复核 UPHELD→两轮 fixing 全为文档翻牌层，零产品缺陷）。三表 + `roi.compute`/`attribution.gaps`（三处复用，分子缺显「证据不足」绝不填 0）+ spend 真源装配 + `compute_roi`/`draft_report`/`create_share_link`（outbound 白名单第 6）+ `ops/share` mock（**零真实公开暴露**）+ V8/V12 接真（两 mock 退役）+ weekly-draft 例程。signoff `docs/test-reports/M4-INSIGHT-signoff-2026-07-25.md`；验收入口 `npm run insight:e2e`
- **机制化新增**：`tests/unit/architecture-doc-freshness.test.ts`（9 断言对实物：schema 计数/枚举/工具表/名册/例程表）——文档计数漂移三连踩后入 CI 硬门
- M0→M3-B 全 done ✅；backlog 空

## 已上线
- `https://newkol.guangai.ai` 跑 **M3-B @ `49308c1a5e71e14b3ecaf55032dc971a304c7b93`**；**M4 未部署**（人类闸门：deploy-prod 手动触发，image_tag 填 `300b5c169e976c1b3cf0bddcaedcc30556822f4d`——最新 Build&Push success）
- M4 部署面：compose 未改（无需 scp）· 无新增必需 env（share 恒 mock；`AIGCGATEWAY_REPORT_MODEL` 可选插座）· migrate one-shot 建 3 表 + 1 枚举（expand-only 纯 CREATE 安全）
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog：空。下批候选：**M5**（真实认证+RLS / 真 partner / reach·conversions 真回传源 / 真实公开分享页）· **M3-C**（真入站收信 + send_bulk_outreach）· soft-watch 小批
- L2 未消耗：draft_report/weekly-draft 全程降级验收；真网关最小用量 = `INSIGHT_E2E_REAL_LLM=1 npm run insight:e2e`（需授权）
- soft-watch 续记：F003-low-1（resend SDK signal）· 洞察侧栏徽标恢复（数据源已就绪，待产品裁决）· O2（insight:e2e 每跑净增 1 行 marker OperationLog，append-only 语义一致不建议删，仅知晓）· O11（§12.6 所称 OUTBOUND_TOOL_NAMES 断言为前瞻描述债，早于 M4）
- proposed-learnings：M3-A 4 条 + M3-B 1 条 + **M4 新增 3 条**待确认

## 关键技术坑（M4 新证）
- 注入缝 LLM caller 必须无条件调用（凭据降级只对默认 caller 生效——CI 无凭据曾把 mock 测试改道降级分支）· 测试钉「恰好 N 条」清单会连坐后续扩展（改「在场+前缀序」）· 新基线 CI 首推必红走 update-visual-baselines workflow · 本地长寿命 DB：today/match 基线自然翻红属预期（CI 权威）
