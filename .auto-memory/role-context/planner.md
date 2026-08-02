---
name: role-context-planner
description: Planner 角色行为规范 — 需求处理、框架维护、收尾流程（不存计划和进度）
type: feedback
---

## 需求处理

- 新批次启动前必读：`docs/test-reports/user_report/`（用户反馈）+ `backlog.json`（需求池）
- 用户反馈中的 P0/P1 级 DX 问题应优先纳入下一批次
- 涉及 UI 页面架构变更时，检查设计稿是否已同步，未同步则追加更新设计稿的功能条目
- 功能改造批次的 acceptance 必须包含设计稿一致性检查项（除非明确为「布局变更」）

## IA refactor 类批次 redirect 清单评估（v1.0 — BL-064 沉淀）

- spec §关键决策点必须逐条标记每个老路由 redirect 的 destination **wire-readiness** 状态
- destination 未 wire 等效功能 → 该条写 "kept deep-link，BL-XXX wire 后启 redirect"，不预设"所有老路由立即 redirect"
- redirect 清单除死链外必须同批扫**引用旧路由的探针/测试**：`tests/visual` route/selector + compose/workflows healthcheck 路由 + `curl` 探针，acceptance 要求同批重指（v1.0.5 — GO-LIVE 沉淀：visual goto 超时 + healthcheck 307 恒 unhealthy 两例均延迟暴露）

## 批内文档新鲜度（v1.0.6 — ARCH-M05 沉淀）

- 批次内若有「口径权威文档」（架构定稿、契约规范）作为**首个** feature 交付，后续 feature 的实装会**反向漂移**它（已实装的仍标「演进目标」、计数过期）
- 拆 features 时对策二选一：批末排一条**文档刷新 feature**，或在 acceptance 里给该文档加「批末新鲜度复核」clause
- 大批次（≥10 features）两者都上；反面案例 ARCH-M05 FIX-2（architecture.md 三处批内漂移）
- **acceptance 里的判据要从「批末 grep 复核」升级为「新增/扩展 doc-freshness 断言」**——人工 grep 已证不可靠（同坑三连踩：M3-B F012 → M4 issue-1..4 → M4 复验 issue-5）。grep 判据须不带左括号且含 `docs/` 范围，并先验活（`patterns/audit-methodology.md` §8）
- **凡涉及「模型自主性」的 acceptance**（自己发现入参 / 自己选专家 / 自己决定要不要咨询），必须显式标注它归 L1 装配层断言还是归 L2 真模型——mock 测试床对这类缺陷是结构性盲区（`patterns/agent-loop-patterns.md` §2；反面：M4.5 11/11 PASS 上线首轮即撞到）

## 角色分配

- 项目根存在 `.agents-registry` 时，展示可用 agent 列表，询问用户分配
- 校验：generator ≠ evaluator（同一执行上下文）；外部工具类实例只能担任 evaluator
- 用户说"默认"或不指定 → 不写 `role_assignments`，按默认映射

## done 收尾

1. **校验** project-status.md 是否准确完整（不重写，整合不一致处即可）
2. 处理 `framework/proposed-learnings.md`，逐条提交用户确认
3. 清除 progress.json 中的 `role_assignments`
4. 询问下一批次

## 框架维护

- 即时提出：影响当前决策的规则变更，对话中提出 → 用户确认 → 立即写入
- 后台队列：不紧急的，追加到 `framework/proposed-learnings.md`
- **不得未经用户确认直接修改 `framework/` 文件**（proposed-learnings.md 除外）
