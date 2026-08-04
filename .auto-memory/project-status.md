---
name: project-status
description: 项目当前状态快照（覆盖写，≤30 行）— 当前批次、计划、决策、遗留问题
type: project
---
## 当前批次
- **M4.8-HARDEN done ✅（2026-08-04，快车道，fix_rounds=0，首轮 7/7 PASS）** — 租户作用域收口（`findProjectByRef`/`gameKnowledgeSection` tenantId 必选 + census 普查钉 9 处全带；两层不重叠经 evaluator E1/E2/E3 双层翻红证实）+ 主 loop 超时可观测（onLoopTimeout 三件套 + 面板流级 stream-error/timeout-notice + 浏览器级钉核到 CI 层）+ budgetHitScope 四值化（v=2，'none' 语义收紧）。evaluator 22 条自建变异/探针、发现并**补钉**第四条误报路径（模型抛错收场,I-4 闭合）。signoff `docs/test-reports/M4.8-HARDEN-signoff.md`。**收尾已做**：S-M48-5 销账改完成态、S-M48-1/2/4 归属登记。**待人类**：I-1 两行建造期孤儿 opLog 清理（一条 delete）
- **M4.7-FRONTDESK done ✅（2026-08-02，fix_rounds=3）** — 11/11 PASS；纪律 5 入铁律 13（v1.6.5）。signoff §21-§29
- M4.6-CTX ✅ · M4.5-AGENT-LOOP ✅ · M4-INSIGHT ✅ · M0→M3-B 全 ✅
- **交付面**：单一前台 + 专家子 Agent 咨询 + 步数预算/接力 + 超时/撞顶全链可观测 + 租户作用域应用层收口 + mock-model 测试床。验收入口 `npm run frontdesk:e2e` / `agentloop:e2e`
- **机制化守门**：doc-freshness（29 条,含 S-RV3-4 段级钉）· project-scope-census · e2e-cleanup-hygiene · frontdesk:e2e 两层清态

## 已上线
- `https://newkol.guangai.ai` 跑 **M4 + M4.5 @ `fd751ad5cd0e1de306a2f59c17344e7ba26e2be2`**（2026-07-26 部署；回滚点 M3-B `49308c1a…`）——**M4.6 / M4.7 / M4.8 尚未部署**
- ⚠️ image_tag 必须完整 40 位 SHA；compose 是 VPS 人工副本
- **上线前应做**：部署后人工复测 M4.7 原始故障场景（环节人格拒答）+ M4.8 超时告知真网关表现（L2 面清单见两批 signoff §7）

## 需求池 / 待人类
- backlog 6 条：BL-COST-CAP(h) · BL-AGENT-COST-CALIBRATE(h，S-RV3-1 先补钉再改值硬前置) · BL-AGENT-ROUTINE(m) · BL-E2E-CLEANUP-PIN(m，残余 m47-rv-probe/S-RV3-5/S-M48-2/S-M48-4) · BL-VISUAL-DATA-ISOLATION(m，含 S-M48-1 两行孤儿清理) · BL-TOOL-STREAM-OUTPUT(l)。下批候选：**M5**（真实认证+RLS，census 钉届时降二线）· M3-C
- proposed-learnings：1 条待确认（registry-less 下 resolve-active-mode-role 硬退 vs /plan SKILL 预期 `{}`，db8712d）
- soft-watch 全量：M4.7 S-RV3-1…6 + M4.8 S-M48-1…5，逐条有兜底归属（见各 signoff §8）

## 关键技术坑（M4→M4.8 精选，全量见各批 signoff 与 patterns/）
- 注入缝 LLM caller 必须无条件调用 · mock 测试床对「模型自主性」缺陷是结构性盲区（acceptance 显式标 L1/L2）· 黑名单否定断言不可穷尽 · 源码级正则可被写法绕过，行为级才免疫 · as-built 陈述钉双向 · 清理登记表外再压一层不从登记表派生的普查 · `next build` 后必须重启 standalone · 收编测试钉核到 CI 层 · 软引用表无 FK 不级联
- **M4.8 新证**：变异还原不得用 `git checkout`（会连未提交的正身编辑一起抹掉,用 cp 备份还原 + `git diff --quiet` 核证）· fire-and-forget 落库的测试必须接 settle 等待否则清态断言漏行 · 超时判据须同时排除「非超时 abort」与「已落定会话」两类误报,且「模型抛错收场」是第四条独立路径
