# 用户反馈：Copilot 对话「创建项目」零落库 + 幻觉编排（2026-07-23）

## 用户原述（摘要）

在 Copilot 窗口对编排 Agent 说「创建一个王者荣耀东南亚推广的项目」，得到一篇华丽回复
（项目代号 KR-Phantom、7 环节专家编排表、KOL 名单、预算建议、甘特图承诺），
**但项目页面没有看到这个项目被创建出来**。

## Planner 分析（实物核证 2026-07-23）

**现象本质**：回复是纯文本幻觉——零落库（无 Project 行 / Handoff / OperationLog /
PendingAction），项目页、雷达、记录页自然全无痕迹。

**根因三层**：

1. **能力缺口（主因）**：`create_project` 全仓零命中——现役 6 工具无一能创建项目；
   UI 列表页亦无创建入口；项目写路径 = 仅 seed 脚本。产品核心动作未实装。
2. **诚实护栏缺口**：orchestrator `tools: []`（registry.ts:78），无工具提示语只说
   「只做本职分析与建议」（route.ts:115）——未禁止把建议包装成「已编排的任务雷达」。
   BASE_SYSTEM「不编造」只约束数据引用，未约束**行动承诺**。
3. **编队名册漂移**：回复中「创意/投放/KOL/社群/风控/数据 Agent」多数不存在
   （真实名册 = 编排/策略/匹配/触达/交付/洞察/合规 7 人格）——system prompt 未注入
   队友名单，模型按行业惯例杜撰。

## 处置

用户裁决（2026-07-23 实答）：**立即小批次修** → 立项 `M2-C-AGENT-HONESTY`
（create_project 工具 + UI 入口 / 诚实护栏 / 名册注入 + 端到端闭环）。
spec = `docs/specs/M2-C-AGENT-HONESTY-spec.md`。

**处置状态（2026-07-24 翻牌）：三层根因逐条消解，building 全量交付**

| 根因 | 消解 |
|---|---|
| 写路径不存在 | F001/F002：createProject 服务 + create_project 工具（orchestrator/strategy 挂载）+ POST /api/projects + 列表页「新建项目」入口——创建即入 brief、OperationLog 留痕雷达可见 |
| 诚实护栏缺失 | F003：BASE_SYSTEM 行动承诺铁律三条（真实返回才可声称已执行 / 超能力明说+指路 / 建议禁包装）+ 无工具分支强化 |
| 名册杜撰 | F004：编队名册注入（PERSONA_SEED 同源）+ 禁杜撰条款（点名「创意/投放/社群 Agent」反例） |

端到端闭环：对话路径 executeTool → 落库 → 列表卡可见（截图铁证）→ 详情三口径可达 →
雷达留痕（F005 集成测钉死）。真对话行为验证归 verifying L2。
