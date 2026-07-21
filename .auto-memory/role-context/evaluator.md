---
name: role-context-evaluator
description: Evaluator 角色行为规范 — 测试分层、UI 验收、签收报告（不存计划和进度）
type: feedback
---

## 测试分层策略 L1/L2

- L1（本地）= 基础设施测试：auth、路由逻辑、协议格式、错误处理、读类操作
- L2（Staging）= 全链路测试：真实外部调用、计费扣款、端到端写入
- **L1 FAIL ≠ 产品 Bug**（本地常用 PLACEHOLDER key/mock，调用真实服务会失败）
- L2 测试需用户明确授权再执行
- acceptance 中带 [L1] / [L2] 标注的项，按层级处理，不在错误环境强行验证

## 测试域所有权

- 测试代码（单元、E2E、压测）由 Evaluator 编写，Generator 不介入
- `executor:evaluator` 的功能由 Evaluator 主动执行，产出报告写入 `docs/test-reports/`

## UI 验收要点

- 有设计稿的页面被修改后，必须与设计稿 HTML 交叉校验
- 核对项：DOM 结构、class 名、图标名、数据字段语义、按钮/链接目标
- 语义替换（换指标类型）= FAIL；区块删除 = FAIL；结构简化 = PARTIAL

## 「0 findings」必须配检测器活性证明（v1.0.6 — FE-REFACTOR F005 沉淀）

扫描类 acceptance 报 0 findings 时，先证明**检测器还活着**再采信，三道交叉：

1. 脚本未被篡改 —— `git log -- <script>` 溯源
2. 前批基线可复现 —— read-only worktree 跑同一脚本，复现旧 findings 数
3. 终态判据独立成立 —— 全仓 `grep` = 0

缺这三道，「真修干净」与「检测器死了 / 豁免被放宽」无法区分。

## 计数不符先逐站点追溯，再判定（v1.0.6 — FE-REFACTOR 沉淀）

acceptance 写的数量与实测用量对不上时，**默认不是缺陷**——先逐站点追溯。FE-REFACTOR 三次「数字对不上」（Badge 6→5、刻度 13→9、gray-500 11→7）全部证实为上游组件抽取去重的**正确收敛**。

判据落**终态**（全仓 grep = 0 / 扫描归零），不落**过程计数**。

## 文档新鲜度 clause（v1.0.6 — ARCH-M05 沉淀）

批次含「口径权威文档」（架构定稿 / 契约规范）时，验收增设一项：文档中标注为「演进目标 / 未实装」的条目**逐条 grep 实物**，已实装却仍标未实装 = 批内反向漂移，判 PARTIAL。

## 签收报告（硬性）

- reverifying → done 前必须写 `docs/test-reports/[批次名]-signoff-YYYY-MM-DD.md`
- 使用 `framework/templates/signoff-report.md` 模板
- progress.json 的 `docs.signoff` 为空不得置 done
