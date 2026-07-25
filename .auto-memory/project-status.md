---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M4.5-AGENT-LOOP 首轮验收完成 → fixing（2026-07-25，快车道，fix_rounds=0）** — fan-out 5 组隔离 evaluator + 对抗复核 ×1：**10 PASS + F010 PARTIAL**。三条缺陷全落在 F010 交付物（e2e 脚本 + 文档翻牌），**零产品代码缺陷**；闸门/隔离/诚实三条红线经各组独立取证均未击穿。F010 待修：① `agentloop:e2e` 清理段失败路径崩溃（`pendingIds` 含 undefined → Prisma 拒 → 清理中断 + 掩盖首因 + 污染 dev 库）② SHARE_CREATED 留痕处置写定（对抗复核建议照 M4 S5 口径登记 append-only，不删）③ 4 处已作废 as-built 陈述未翻牌 + `agent-architecture.md` 零 doc-freshness 覆盖。报告 `docs/test-reports/M4.5-AGENT-LOOP-verify-G{1..5}.md` + `-F010-adversarial.md`
- **M4.5 已验收面（10 PASS）** — agent 循环放开（红线零触碰）：按人格步数预算（`AgentPersona.maxSteps` 深链 10/常规 5，registry 单一真相源）+ loop 遥测（只记元数据，budgetHit 可查）+ **循环内跨人格接力**（`handoff_to` → `prepareStep` 切 system/activeTools，时刻隔离两道防线）+ 行动计划卡（认可只留痕**不解锁执行权**）+ 跨项目 ROI 追问 + 合规核查单 + 批量备好聚合确认（逐项两步票据，**无批量端点**）+ 渐进渲染（裁决 C）+ mock-model 测试床。验收入口 `npm run agentloop:e2e`（29 断言全绿，零外呼零真实副作用）
- **F008 裁决记录**：用户实答选 C（`docs/specs/M4.5-AGENT-LOOP-f008-preimpl-audit.md` §6）——draft 类工具正文是 execute 内部产物、入参流对其无效；方案 A（产物流）入 backlog `BL-TOOL-STREAM-OUTPUT`
- **M4-INSIGHT done ✅（2026-07-25，快车道，fix_rounds=2）** — 洞察域立真全验收 **12/12 PASS**（首轮 11 PASS + F012 PARTIAL→对抗复核 UPHELD→两轮 fixing 全为文档翻牌层，零产品缺陷）。三表 + `roi.compute`/`attribution.gaps`（三处复用，分子缺显「证据不足」绝不填 0）+ spend 真源装配 + `compute_roi`/`draft_report`/`create_share_link`（outbound 白名单第 6）+ `ops/share` mock（**零真实公开暴露**）+ V8/V12 接真（两 mock 退役）+ weekly-draft 例程。signoff `docs/test-reports/M4-INSIGHT-signoff-2026-07-25.md`；验收入口 `npm run insight:e2e`
- **机制化新增**：`tests/unit/architecture-doc-freshness.test.ts`（9 断言对实物：schema 计数/枚举/工具表/名册/例程表）——文档计数漂移三连踩后入 CI 硬门
- M0→M3-B 全 done ✅；backlog 空

## 已上线
- `https://newkol.guangai.ai` 跑 **M3-B @ `49308c1a5e71e14b3ecaf55032dc971a304c7b93`**；**M4 未部署**（人类闸门：deploy-prod 手动触发，image_tag 填 `300b5c169e976c1b3cf0bddcaedcc30556822f4d`——最新 Build&Push success）
- M4 部署面：compose 未改（无需 scp）· 无新增必需 env（share 恒 mock；`AIGCGATEWAY_REPORT_MODEL` 可选插座）· migrate one-shot 建 3 表 + 1 枚举（expand-only 纯 CREATE 安全）
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog 3 条：`BL-COST-CAP`（例程前置）· `BL-AGENT-ROUTINE`（F-E/F-F）· `BL-TOOL-STREAM-OUTPUT`（F008 方案 A）。下批候选：**M5**（真实认证+RLS / 真 partner / reach·conversions 真回传源 / 真实公开分享页）· **M3-C**（真入站收信 + send_bulk_outreach）· soft-watch 小批
- L2 未消耗：draft_report/weekly-draft 全程降级验收；真网关最小用量 = `INSIGHT_E2E_REAL_LLM=1 npm run insight:e2e`（需授权）。**M4.5 新增 L2 面**：模型自主接力/追问质量 + 渐进渲染真流表现（mock 测试床不发 tool-input-delta，离线只到分支判定）
- soft-watch 续记：F003-low-1（resend SDK signal）· 洞察侧栏徽标恢复（数据源已就绪，待产品裁决）· O2（insight:e2e 每跑净增 1 行 marker OperationLog，append-only 语义一致不建议删，仅知晓）· O11（§12.6 所称 OUTBOUND_TOOL_NAMES 断言为前瞻描述债，早于 M4）
- proposed-learnings：**M3-A 4 条已沉淀 ✅ v1.0.12**（2026-07-25 用户确认：db-patterns §9 / testing-env §8·§9 / web-runtime §7）；M3-B 1 条 + M4 3 条继续挂起待确认
- **M4.5 待验收**（status=verifying，隔离 evaluator）；M4/M4.5 均未部署，人类闸门待触发

## 关键技术坑（M4 + M4.5 新证）
- 注入缝 LLM caller 必须无条件调用（凭据降级只对默认 caller 生效）· 测试钉「恰好 N 条」清单会连坐后续扩展 · 新基线 CI 首推必红走 update-visual-baselines workflow · 本地长寿命 DB 基线自然翻红属预期（CI 权威）
- **M4.5 新证**：装配入口（顶层执行注册副作用的模块）不得被成员反向 import——循环只在 `next build` 炸，vitest/dev 全绿（改模块图后必须本地 build）· `git grep` 断言只搜已跟踪文件，新文件未 commit 时恒空绿 · `fullPage:false` 视口基线对折叠线以下的新卡零覆盖 · **本地 dev 租户有 pending 时 admin 视觉基线全线翻红属预期**（Copilot 面板聚合卡数据依赖；CI 库无 pending）
