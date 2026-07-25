# M4-INSIGHT 首轮验收汇总（round 1，2026-07-25）

> 编排：Andy（主上下文，仅机械汇总）；验收：12 个隔离 evaluator subagent（fan-out，每 feature 一个，fresh context）+ 1 个对抗复核 subagent。各 feature 完整 verdict 见 `docs/test-reports/m4-verify/F0XX-verdict.md`（Evaluator 本人写盘，未经改写/筛选/软化）。

## 结果总表：11 PASS / 1 PARTIAL

| feature | result | 要点（摘自 verdict，原样） |
|---|---|---|
| F001 迁移三表+枚举 | PASS | migration 与 spec §4 逐项一致；expand-only；回滚说明与 RLS 例外登记在场 |
| F002 roi.compute | PASS | 诚实降级/三值方向全矩阵；D20 变异全杀（含 evaluator 独立变异探针） |
| F003 attribution.gaps | PASS | 4 原因码逐条可分支；缺口不吞不虚报；D20 变异全杀 |
| F004 装配服务 | PASS | 10 acceptance 全 ✓；变异 10/10 全杀（evaluator 独立探针 8 用例） |
| F005 compute_roi 工具 | PASS | 6/6 变异全杀；委派证明 + 真库探针 9 |
| F006 draft_report | PASS | 起草落库/采纳幂等/降级明示；evaluator 独立探针 + router 检查 |
| F007 ops/share 适配器 | PASS | mock 契约 + 零外呼断言；env 选择器三分支核证 |
| F008 create_share_link 闸门 | PASS | acceptance 9/9 实测；4 条 soft-watch 观察不阻断；闸门链/回滚/幂等/零暴露全核 |
| F009 V8 接真 | PASS | 12 项全过；变异 10/10 全杀；浏览器 DOM 实测 41/41；图卡正向控制 |
| F010 V12 接真 | PASS | 13 项全过；变异 14 注入全杀 + 图卡/二色正向控制 9/9；零暴露四道核证 |
| F011 weekly-draft 例程 | PASS | 注册表 4/4 实跑注册幂等；执行体/幂等/降级明示全核 |
| F012 e2e+文档翻牌 | **PARTIAL** | e2e 闭环与四件套无缺陷（19 细项中 15 PASS）；**4 FAIL 全在文档翻牌/新鲜度复核**（下详） |

## F012 PARTIAL 明细（对抗复核 4/4 UPHELD，见 `m4-verify/F012-recheck.md`）

1. **issue-1**：architecture.md §9.2「已实装工具」表未加 M4 三工具行（compute_roi / draft_report / create_share_link）——acceptance 显式命名项
2. **issue-2**：architecture.md §8.6 编队名册 as-built 表 insight 行 `tools` 仍为 `[]`——与 registry.ts 实物（三件）矛盾
3. **issue-3**：architecture.md §7.2.1 三表 + 一枚举 + 迁移计数整条未更新（schema 权威转录节）
4. **issue-4**：批末新鲜度复核漏 4 处陈旧标记（§5.4 标题未随行翻 / escrow·keys·share「演进 M4」两处残留——M3-B F012 fixing 已显式把翻牌责任指派给 M4 / mock env-* 语法面句仍含 insight 字样）

> 对抗复核附注：issue-4 与 M3-B F012 属**同一坑第二次复发**（文档翻牌只翻 acceptance 点名处、不做全文新鲜度扫描）。

## 过程记录（编排层事实）

- 波 1（F001-F008/F011）并行 fan-out；期间 4 个 subagent 遇 API 基础设施故障（ECONNRESET / stalled mid-stream）经恢复续跑完成，不影响结论独立性
- 波 2（F009/F010/F012）串行（独占 :3000 做构建/视觉/视口实测）
- 期间一次 CI 红：F008 evaluator 探针文件 2 处 tsc 类型标注错误（测试语义无关），由该 evaluator 自修，CI 复绿 @ c66db99；该探针文件含 2 个 NUL 字节（疑为输入净化测试用例），git 按二进制处理——观察项
- L2 真网关全程未消耗（未获授权，降级路径验收）；零真实公开暴露经 F008/F010/F012 三处独立核证

## 状态流转

- 11 PASS 保持 completed；F012 → pending，status → **fixing**
- 修复范围（供 Generator）：仅文档层 4 项，见上（issue-1/2/3 为 acceptance 显式命名点，issue-4 为新鲜度扫描补漏）；无产品代码缺陷

—— 汇总：Andy（编排，机械合并；判定原样取自各 evaluator verdict）
