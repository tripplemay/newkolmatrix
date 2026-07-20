# FE-AUDIT — 前端地基全面审计（Evaluator-only 批次）

> **批次类型：** Evaluator-only（全部 `executor:evaluator`）。状态流转 `planning → verifying → done`，跳过 building。
> **Spec lock：** 2026-07-20 用户 plan mode 批准。
> **审计不修改任何产品代码**；发现的问题全部进报告分级，整改留给后续批次。

## 1. 背景与目标

GO-LIVE 收官、`newkol.guangai.ai` 已上线。在下一功能批次（ARCH-LOCK + M0.5 WORKBENCH-UI 六页工作台）之前，用户要求先审计当前上线版本的前端地基，回答三个问题：

1. 前端是否严格按照 Horizon UI Pro 模板实现
2. 是否存在模板已提供组件、但项目仍手写重复实现的内容
3. 该抽取的公共组件是否已全部抽取

目标：产出**可复核、分级、可直接转化为整改 backlog** 的审计报告，为 M0.5 起的大规模前端开发打好地基，避免在有债的地基上继续堆积。

## 2. 对照基线（三源）

| 基线 | 路径 | 用法 |
|---|---|---|
| 模板原件 | `~/project/db4rDjuaSCqaEFW9XcFo_horizon-tailwind-react-nextjs-pro-3.0.0/horizon-tailwind-react-nextjs-pro-main/`（Horizon UI Pro 3.0.0） | **只读**；组件对照、fork 偏离 diff 的权威依据 |
| tokens 契约 | `design-draft/horizon-tokens.md`（DS-FOUNDATION F002 沉淀） | 设计系统一致性审计依据（brand 色阶 CSS 变量 / 字体 / 阴影 / 渐变约定） |
| Figma 源文件 | 模板包内 `Horizon UI Dashboard PRO.fig` | 仅存档参考，本批不打开 |

**审计对象：** 项目 main HEAD。`src/` 最后一次产品代码变更为 GO-LIVE-F001（`6ec384d`），其后仅文档/记忆 commit——**HEAD 前端代码与线上版本一致**。

**盘子（planning 勘察）：** 99 个组件 tsx、15 个页面（`src/app/admin/*` 11 页 + preview 等）；`src/components/common/` 现仅 `Button.tsx` + `ComingSoon.tsx`；目录差异：项目自建 `common/ copilot/ project/`，模板有而项目无 `admin/`（模板页面级组件主仓，对照重点）与 `map/`（见 §4 白名单）。

## 3. 功能范围（4 条，全 evaluator）

### F001 模板组件对照审计（手写重复实现清单）
- 盘点模板 `src/components/` 全目录 vs 项目 `src/components/` + 页面内 inline 实现
- 产出**模板组件 × 项目使用状态矩阵**：`used-as-is / forked-modified / re-implemented / unused`
- 每个「模板已提供但项目手写重复实现」项：文件:行 + 模板对应组件路径 + 替换建议与风险
- forked 组件须附相对模板原件的偏离说明（diff 摘要）
- 所有结论附可复核证据（diff / grep 命令与输出摘录）

### F002 公共组件抽取完备性审计
- 扫描 15 个页面 + 自建组件（copilot / project / canvas 等）中出现 **≥2 次的重复 UI 模式**（card 头、stat 卡、表格、tab、badge、空态、loading、分页等）
- 逐条列出现位置（文件:行）
- 产出**建议抽取的公共组件清单**：命名 + 落位（`src/components/common/`）+ props 签名建议
- 按 复用次数 × 改造成本 排优先级

### F003 设计系统一致性审计（tokens/样式偏离）
- 对照 `design-draft/horizon-tokens.md` + `tailwind.config.js` + `src/app/AppWrappers.tsx`
- 扫描：hardcoded hex / 非 token 色、字体偏离（DM Sans/Poppins 之外）、shadow/radius 偏离、`dark:` 类完整性（浅色默认下深色仍可用）
- 逐项偏离：文件:行 + 应使用的 token
- **扫描方法可复跑**：脚本落 `scripts/test/`（如 `fe-audit-token-scan.sh` / `.mjs`），报告附使用说明

### F004 汇总报告 + 整改 backlog 候选
- 汇总 F001-F003，并对关键 finding **抽查复核**（防三路并行的误报）
- 分级：**P0**（阻塞后续开发的地基问题）/ **P1**（会累积技术债）/ **P2**（锦上添花）
- 产出可直接并入 `backlog.json` 的整改条目 **JSON 草案**（含工时估算），作为后续 FE-REFACTOR 批次输入
- done 阶段由 Planner 并入 backlog.json（evaluator 不写 backlog.json）

## 4. 关键设计决策

- **D1** Evaluator-only；evaluator 只写 `scripts/test/`（扫描脚本）+ `docs/test-reports/`（报告），不碰产品代码、不写状态机 JSON
- **D2** 对照基线三源见 §2；模板原件 repo 外只读
- **D3** 审计对象 = main HEAD（与线上一致，证据链见 §2）
- **D4** 报告落位：分项 `docs/test-reports/FE-AUDIT-F00N-<署名>.md`，汇总 `docs/test-reports/FE-AUDIT-report-<署名>.md`；署名 `Andy/evaluator-subagent`
- **D5** 车道与编排：**快车道（同会话）**；verifying **fan-out**——F001-F003 三路并行隔离 evaluator subagent，F004 依赖前三份报告故**串行汇总**（orchestration-patterns §4 触发门 features ≥4 命中）
- **D6** **已知合理偏离白名单**（不计 FAIL/finding）：
  1. `map/` 组件已删——模板 demo `MapComponent.tsx` 硬编码 Mapbox token，DS-FOUNDATION scaffold 时按 v1.0.4 secret 预扫规则删除
  2. Chakra 仅保留零散原语（Drawer / Modal / Tooltip / Popover / Accordion）——CLAUDE.md 既定架构
  3. 默认浅色（已去除模板 `<body className="dark">`）——DS-FOUNDATION F002 用户拍板
  4. `rtl/` / `rtlProvider/` 等模板 RTL 相关如未使用，标 `unused` 即可，不算债
- **D7** 发现问题一律不「顺手修」，全部进报告分级；评分口径以本 spec acceptance 为边界（P5.2：不引入「全仓无债」隐式门槛）

## 5. 验收口径

- 四份报告齐备且每条 finding 含 文件:行 + 模板对应物/token 依据，抽查可复核 → PASS
- F003 扫描脚本入库且可复跑
- F004 含 P0/P1/P2 分级 + backlog JSON 草案
- 全 PASS → signoff 落 `docs/test-reports/FE-AUDIT-signoff-<署名>.md` → done
- done 阶段 Planner 动作：整改候选并入 backlog.json → 回到「ARCH-LOCK + M0.5」批次讨论（审计结果可能影响其构成：P0 债多则先插 FE-REFACTOR 整改批次）
