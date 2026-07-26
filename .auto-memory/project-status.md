---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M4.5-AGENT-LOOP done ✅（2026-07-25，快车道，fix_rounds=1）** — agent 循环放开面 **11/11 PASS**。首轮 fan-out 5 组隔离 evaluator + 对抗复核 ×1 = 10 PASS + F010 PARTIAL（三条缺陷全在交付物：e2e 脚本 + 文档翻牌，**零产品代码缺陷**）→ 一轮 fixing 全闭环 → 复验 11/11。闸门两步票据 / 时刻隔离 / 行动承诺诚实三条红线经各组独立取证 + 变异测试均未击穿。signoff `docs/test-reports/M4.5-AGENT-LOOP-signoff-2026-07-25.md`（§8 有 soft-watch 全量清单及逐条兜底）
- **交付面**：按人格步数预算（`AgentPersona.maxSteps` 深链 10/常规 5，registry 单一真相源）+ loop 遥测（只记元数据，budgetHit 可查）+ **循环内跨人格接力**（`handoff_to` → `prepareStep` 切 system/activeTools）+ 行动计划卡（认可只留痕**不解锁执行权**）+ 跨项目 ROI 追问 + 合规核查单 + 批量备好聚合确认（逐项两步票据，**无批量端点**）+ 渐进渲染（裁决 C）+ mock-model 测试床。验收入口 `npm run agentloop:e2e`
- **F008 裁决记录**：用户实答选 C（`docs/specs/M4.5-AGENT-LOOP-f008-preimpl-audit.md` §6）；方案 A（产物流）入 backlog `BL-TOOL-STREAM-OUTPUT`
- **M4-INSIGHT done ✅（2026-07-25，fix_rounds=2）** — 洞察域 12/12 PASS。三表 + `roi.compute`/`attribution.gaps` + `compute_roi`/`draft_report`/`create_share_link` + `ops/share` mock（**零真实公开暴露**）+ weekly-draft 例程。signoff `docs/test-reports/M4-INSIGHT-signoff-2026-07-25.md`
- **机制化守门**：`architecture-doc-freshness.test.ts`（现覆盖 architecture.md **+ agent-architecture.md**：计数/枚举/工具表/名册/例程表 + 已作废流式 API 名 / stepCountIs 数字字面量 / 工具清单 / 档位值）· `e2e-cleanup-hygiene.test.ts`（清理段卫生）
- M0→M3-B 全 done ✅

## 已上线
- `https://newkol.guangai.ai` 跑 **M3-B @ `49308c1a5e71e14b3ecaf55032dc971a304c7b93`**；**M4 + M4.5 均未部署**（人类闸门：deploy-prod 手动触发，image_tag 填 `fd751ad`（40 位 SHA）——M4.5 终态，Build&Push success + CI 5 job 全绿）
- 部署面：compose 未改（无需 scp）· 无新增必需 env · M4.5 **零新增迁移**；migrate one-shot 只需应用 M4 的 3 表 + 1 枚举（expand-only 纯 CREATE 安全）
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本

## 需求池 / 待人类
- backlog 4 条：`BL-COST-CAP`（例程前置）· `BL-AGENT-ROUTINE`（F-E/F-F）· `BL-TOOL-STREAM-OUTPUT`（F008 方案 A）· **`BL-E2E-CLEANUP-PIN`**（e2e 清理段断言升级为行为级——源码级正则已被 evaluator 实测绕过；触发时机写死：下个改清理段的批次必须一并做）。下批候选：**M5**（真实认证+RLS / 真 partner / reach·conversions 真回传源 / 真实公开分享页）· **M3-C**（真入站收信 + send_bulk_outreach）· soft-watch 小批
- L2 未消耗：模型自主接力/追问质量 · 渐进渲染真流表现（mock 测试床不发 tool-input-delta）· 浏览器内真实渲染（persona_switch 换头 / 聚合卡逐项确认动线）· draft_report 全程降级验收
- soft-watch 续记：F003-low-1 · 洞察侧栏徽标恢复 · O2 + **S-M45-1**（e2e 每跑净增标记 OperationLog，**留不删**是显式决定，spec §9 写定）· O11 · O-G2-1（接力后 `ctx.agentId` 仍为起始人格）· S-G5-4（BATCH_EMPTY_MSG 死分支）· 无 `.nvmrc`
- proposed-learnings：M3-A 4 条已沉淀 ✅ v1.0.12；**M3-B 1 条 + M4 3 条 + M4.5 4 条挂起待确认**

## 关键技术坑（M4 + M4.5 新证）
- 注入缝 LLM caller 必须无条件调用 · 测试钉「恰好 N 条」清单会连坐后续扩展 · 新基线 CI 首推必红走 update-visual-baselines workflow
- **M4.5 新证**：装配入口不得被成员反向 import（循环只在 `next build` 炸）· `git grep` 断言只搜已跟踪文件，新文件未 commit 时恒空绿 · `fullPage:false` 基线对折叠线以下的新卡零覆盖 · **本地 dev 租户有 pending 时 admin 视觉基线全线翻红属预期**（重生基线前必须先清 dev pending 与 e2e 标记行）· **e2e 清理段自身绝不可再抛**（一抛就掩盖首因 + 跳过后续清理 + 污染 dev 库）· **源码级正则断言可被写法绕过，行为级断言才免疫**
