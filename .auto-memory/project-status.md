---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M4.8-HARDEN building ▶（2026-08-04 立项，快车道，7 features，spec lock=用户实答）** — 租户作用域收口（实物核证真缺口仅 2 处：`project-context.ts:36` / `knowledge-context.ts:64`，backlog 登记漂移已按实物更正；census 普查钉与修复点两层不重叠）+ 主 loop 超时可观测（onLoopTimeout 镜像 onBudgetExhausted 三件套 + CopilotPanel 流级 error/abort 渲染 + 浏览器级钉核到 CI 层）+ budgetHitScope 四值化（双向钉）。携带 BL-E2E-CLEANUP-PIN 之 S-RV3-4（F007）与 S-RV3-3 project-context-route 部分（F001）。spec `docs/specs/M4.8-HARDEN-spec.md`
- **M4.7-FRONTDESK done ✅（2026-08-02，fix_rounds=3）** — 11/11 PASS；done 收尾全闭环：四条裁决 + 12 条 learnings v1.0.13 + 纪律 5 入**铁律 13**（v1.6.5，2026-08-03 用户裁决：交付叙述每句「已修/已验证/全绿」必须有命令输出依据）。报告 `docs/test-reports/M4.7-FRONTDESK-signoff.md`（§21-§29 轮三 + S-RV3-1…6）
- M4.6-CTX ✅（07-26）· M4.5-AGENT-LOOP ✅（07-25）· M4-INSIGHT ✅ · M0→M3-B 全 ✅
- **交付面**：单一前台 + 专家子 Agent 咨询（consult_specialist / 成本硬上限 / 诚实透传 / 协作痕迹 UI）+ 人格步数预算 + 循环内接力 + 行动计划卡 + 批量备好聚合确认 + mock-model 测试床。验收入口 `npm run frontdesk:e2e` / `agentloop:e2e`
- **机制化守门**：architecture-doc-freshness（双文档）· e2e-cleanup-hygiene · frontdesk:e2e 两层清态断言

## 已上线
- `https://newkol.guangai.ai` 跑 **M4 + M4.5 @ `fd751ad5cd0e1de306a2f59c17344e7ba26e2be2`**（2026-07-26 部署；回滚点 M3-B `49308c1a…`）——**M4.6 / M4.7 尚未部署**
- 部署实况：migrate one-shot 正常 · db/app Healthy。⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本
- **上线后未做**：M4.6/M4.7 部署 + 真网关 L2 人工复测（M4.7 六条 L2 缺口零消耗，上线前应复测原始故障场景「环节人格拒答」）

## 需求池 / 待人类
- backlog 6 条：BL-COST-CAP(h) · BL-AGENT-COST-CALIBRATE(h，S-RV3-1「先补钉再改值」硬前置) · BL-AGENT-ROUTINE(m) · BL-E2E-CLEANUP-PIN(m，残余 m47-rv-probe 部分 + S-RV3-5 census 扩表) · BL-VISUAL-DATA-ISOLATION(m) · BL-TOOL-STREAM-OUTPUT(l)。M4.8 后候选：**M5**（真实认证+RLS）· M3-C
- proposed-learnings：历史全部沉淀 ✅（v1.0.13 + v1.6.5）；新增 1 条待确认（registry-less 下 resolve-active-mode-role 硬退 vs /plan SKILL 预期 `{}`，db8712d）
- L2 未消耗面与 soft-watch 全量见 M4.7 signoff §27-§29（S-RV3-1…6 逐条有兜底归属）

## 关键技术坑（M4→M4.7 精选，全量见各批 signoff 与 patterns/）
- 注入缝 LLM caller 必须无条件调用 · mock 测试床对「模型自主性」缺陷是结构性盲区（acceptance 必须显式标 L1/L2 归属）· 黑名单否定断言不可穷尽，正向精确匹配才根治 · 源码级正则可被写法绕过，行为级断言才免疫
- **M4.7 新证**：as-built 陈述必须钉成双向行为 · 清理登记表须再压一层不从登记表派生的整表普查（两层失效模式不重叠）· `next build` 后必须重启 serve-standalone（chunk 指纹错配伪装成视觉门全红）· 收编测试钉必须核到 CI 那一层 · e2e 清理段自身绝不可再抛 · OperationLog/Handoff 软引用无 FK 不级联，漏清即留孤儿行
