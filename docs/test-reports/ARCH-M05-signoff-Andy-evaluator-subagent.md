# ARCH-M05 批次汇总 Signoff

> **状态：整批 PARTIAL —— 不予 done 签收，建议 `status=fixing`**
> **汇总人：** Andy/evaluator-subagent（C 路承担，隔离上下文）
> **日期：** 2026-07-21
> **被验 HEAD：** `f970124`
> **依据：** `features.json`（17 条 acceptance 权威）· `docs/specs/ARCH-M05-spec.md` §5 验收口径 · 五份分组报告
> **边界：** 未修改任何产品代码；未改动任何分组报告原文；未写状态机 JSON（`progress.json` / `features.json` 由编排者据本报告更新）。

---

## 0. 整批判定

| 项 | 值 |
|---|---|
| Feature 总数 | 17 |
| **PASS** | **14** |
| **PARTIAL** | **3**（F001 · F002 · F003） |
| FAIL | 0 |
| 需修缺陷 | **4 处定点修**（无结构返工） |
| L1 门（lint / tsc / build / visual / e2e / fe-audit） | ✅ 全绿（多组独立复跑一致） |
| **整批 verdict** | ⚠️ **PARTIAL** |
| **建议 status** | **`fixing`** |

> **不予 done 的理由（不可协商）：** 状态机要求 `verifying` 全 PASS 方可置 `done`。F001 存在 acceptance **明列交付物未执行**（CLAUDE.md 指向修复），F002/F003 各含一项已实测复现的功能性缺陷。四项均为定点小修，但在修复并复验前，本批**不得置 done**、不得部署。
>
> **同时明确：** 其余 **14 条 PASS 签收有效**，复验只针对修复项 + 一轮就绪回归，**不需要整批重验**（见 §4 复验口径）。

---

## 1. 17 Features 逐条 Verdict

| # | Feature | 分组 | Verdict | 依据摘要 |
|---|---|---|---|---|
| F001 | 架构文档定稿 v1.2 | A | ⚠️ **PARTIAL** | as-built 校准 10/10 实物为真、f5 增量 10/10 在场、schema 转录零差异、AI SDK 版本族核查属实；**但 C4 文件操作 3/4——CLAUDE.md 指向未修复**；另 C6 批内反向漂移 3 处 |
| F002 | 路由收敛 + 探针核销 | B | ⚠️ **PARTIAL** | 6 入口 / 7 redirect 落点 / 无死链全实测通过、附录 A 8 行逐条复核成立；**但 D4 探针存在第 9 类命中未入附录 A**（根入口三跳绕行 legacy 桩） |
| F003 | 三区外壳改造 | B | ⚠️ **PARTIAL** | S1 12/12 · S2 12/12 · S3 19/19 · 路由切换不重挂载 · 指令栏链路 · AgentSquad 双 variant 全通过；**但移动端 Copilot 抽屉单向不可关** |
| F004 | mock 渲染契约层 | B | ✅ **PASS** | 冒烟 19/19 复跑绿；双 variant 双处真实消费；「待核」判定与裁决 #2 机械对齐 |
| F005 | 共用产品件第一波 | B | ✅ **PASS** | 五新件齐备且 props 对位 S4/S5；Toast 单例语义逐条符合；port 口径批末成立 |
| F006 | 今天页（V1 37） | C | ✅ **PASS** | 37/37 元素，47/47 断言；irrev 条件渲染两态、delta 有无两态逐卡实测 |
| F007 | 项目列表+详情+`?env=` 迁移 | C | ✅ **PASS** | V2 10 + V3 14 = 24/24，49/49 断言；`?stage=` 三环节深链重写实测通过（附 1 项 MINOR 文档漂移，非阻断） |
| F008 | Brief 态势简报 glance | D | ✅ **PASS** | V4 19/19；裁决 #1（卡内 button=0）、三态圆点未压缩 |
| F009 | Match 对比矩阵 compare | D | ✅ **PASS** | V5 22/22；**刻意无闸门**、低置信度不显裸分 |
| F010 | Reach 对话收件箱 converse | D | ✅ **PASS** | V6 24/24；裁决 #6 报价钮仅 `stage==='谈判中'` 条件渲染；双闸门 harm 对位 |
| F011 | Delivery 条件台账 verify | D | ✅ **PASS** | V7 11/11；三态条件单元未压二态；反向 guardrail 未被补件 |
| F012 | Insight 对照账本 reconcile | D | ✅ **PASS** | V8 19/19；裁决 #3 项目级 scope |
| F013 | 创作者库 + 抽屉 | C | ✅ **PASS** | V9 16 + V10 34 = 50/50，56/57 断言；5 处 ProvenanceTag 逐字（附 1 项 MINOR 缺陷，非 acceptance 子句） |
| F014 | 游戏知识 | C | ✅ **PASS** | V11 19/19；`?game=` URL 化 + 上传 analyzing→done 时序实测 |
| F015 | 洞察（跨项目） | C | ✅ **PASS** | V12 14/14；badge 文字型、ROI 琥珀非红、GateConfirm 季度级 scope |
| F016 | Agent 记录 | C | ✅ **PASS** | V13 10/10；四态 pill、`?type=` 三路实测 |
| F017 | 视觉基线扩展 + 阈值收紧 | E | ✅ **PASS** | 8 clause 全 PASS；3 连跑 12×3 全绿；CI `29815799552` 四 job 绿；f010 6/6；fe-audit 三脚本无回归 |

**元素覆盖合计：** C 组 154/154 + D 组 95/95 + B 组外壳 S1-S5 52/52 = **301/301**（spec 附件「不得简化清单」全量达成，零简化、零退化）。

---

## 2. 交叉抽查记录（汇总方独立复核）

汇总不等于转录。对 A/B/D/E 四组各抽 ≥1 条关键结论**回实物复核**（C 组为本 evaluator 自出，**声明不自查**，其结论以原报告为准）：

| 组 | 抽查项 | 复核命令 / 证据 | 结果 |
|---|---|---|---|
| **A** | A-O1 CLAUDE.md 失效指针 | `grep -n "docs/dev/rules.md" CLAUDE.md` → **:74 命中**；`ls docs/dev/rules.md` → No such file；`git log --all --diff-filter=AD` → **0**（全史从未存在）；`docs/dev/` 实有 5 文件无 rules.md | ✅ **证实** |
| **A** | A-O2 文档反向漂移 | `architecture.md:851` 仍标「`resolveProvenance` 与 `ProvenanceTag` = 演进目标（未实装）」+ `:862` 代码块头注同；而 `provenance.ts:144` **`export function resolveProvenance` 已实装**。`architecture.md:587`「恰好 10 个文件」vs `ls src/components/common/*.tsx` = **17**。`architecture.md:1770` env 清单确未含 `provenance.ts`（其 `:88` 有 `process.env.NODE_ENV`） | ✅ **证实（3/3 处）** |
| **B** | B-O1 根入口三跳 | `src/app/page.tsx:3` = `redirect('/admin/dashboards/default')`；`admin/dashboards/default/page.tsx` = `redirect('/admin/today')` → **`/` → legacy 桩 → today 三跳绕行属实** | ✅ **证实** |
| **B** | B-O2 抽屉单向不可关 | `grep -rn "closeDrawer" src/` → 仅 `CopilotUiContext.tsx` 的 **25/43/62/71 四处定义与导出，零消费**；`CopilotPanel.tsx:311` aside 为 `z-40`；面板内 `grep scrim/Overlay/aria-label="关闭"` → **0 命中** | ✅ **证实** |
| **D** | 一处闸门 harm 文案（Delivery payout） | `envs/delivery/index.tsx:198-207`：`title="确认放款"` + harm **3 行**（收款方 / 金额 / 依据「交付证据 + 托管条件已齐」）+ `irrevText="资金动作 · 放款后不可撤销"` —— 与 inventory V7「payout（harm 3 行 + 资金 irrev）」逐条对位 | ✅ **证实** |
| **E** | token-scan = 0 复跑 | `node scripts/test/fe-audit-token-scan.mjs` → **「合计 findings: 0」** | ✅ **证实** |
| **E**（附加） | test:visual 12 绿 | 本 evaluator 于 C 组验收时独立复跑 `npm run test:visual` → **12 passed (24.2s)**，与 E 组 3 连跑结论一致 | ✅ **独立佐证** |

**结论：四组关键结论全部经实物复核成立，无夸大、无未经证实的断言。** 五份报告可信，汇总据其判定。

---

## 3. Fixing 清单（4 处定点修，精确化）

> **fixing 范围严格限定为下列四项**，不得夹带其他改动（铁律 10：无 feature 号归属的修改 = 越界）。

### FIX-1 · F001 · CLAUDE.md 失效指针 〔A-O1，P0，acceptance 明列交付物〕

- **位置：** `CLAUDE.md:74`
- **现状：** `- **开发规则：** → \`docs/dev/rules.md\`（Migration 规则、[框架]开发规则、设计决策、CI/CD）`
- **问题：** `docs/dev/rules.md` 在 git 全史中从未存在（bootstrap 模板残留，引入自 `98fbea7`）；同行 `[框架]` 占位符亦未替换。CLAUDE.md 是每次会话必读入口，失效指针导致后续实例按图索骥落空。
- **修复建议：** 删除该行；或改指实有文档（`docs/dev/deploy.md` / `template-port-guide.md`）。顺手替换 `[框架]` 占位符。
- **复验口径：** 解析 CLAUDE.md 全部路径引用，**逐条 `ls` 存在性检查全通过**；无未展开占位符。

### FIX-2 · F001 · 架构文档批内反向漂移 3 处 〔A-O2，P1-P2，口径权威文档〕

| 子项 | 位置 | 修正 |
|---|---|---|
| ② 溯源实现状态（**P1，中**） | `docs/dev/architecture.md:851` + `:862` | 去掉「演进目标（未实装）」，改标 as-built 并注明 F004 落点 `src/lib/data/provenance.ts:144`；如设计与实装有出入，**以实物为准回写** |
| ① 组件计数（P2，低） | `architecture.md:587` | 「恰好 10 个文件」→ 注明「F001 时点 10 件；本批 F003/F005 新增 7 件，现 17 件」或直接刷为当前清单 |
| ③ env 读取点清单（P2，低） | `architecture.md:1770` | 补 `src/lib/data/provenance.ts`（`NODE_ENV`） |

- **性质说明：** 三处均非 F001 交付时点的错误（当时表述为真），属**批次内串行交付导致的文档时效衰减**。但文档自身 §7.2.1 立有铁律「与实物冲突时以实物为准并即刻修订本文」，且其产物是后续批次的口径权威，验收基准应为 **done 闸门时刻的真值**。
- **复验口径：** 三处逐一 grep 确认已回写；`resolveProvenance` 不再被标为未实装。

### FIX-3 · F002 · 根入口三跳绕行 legacy 桩 〔B-O1，Medium〕

- **位置：** `src/app/page.tsx:3`
- **现状：** `redirect('/admin/dashboards/default')` → 该桩再 `redirect('/admin/today')`，应用根入口**绕行 legacy 桩**。
- **风险：** legacy 桩按其兼容寿命清理后，根路径将 404。
- **修复建议：** 改为 `redirect('/admin/today')`（直指），并在 `docs/specs/ARCH-M05-spec.md` **附录 A 补第 9 行**核销记录（D4 探针纪律要求命中逐条入清单）。
- **复验口径：** 浏览器实测 `/` **一跳直达** `/admin/today`；附录 A 第 9 行在场。

### FIX-4 · F003 · 移动端 Copilot 抽屉单向不可关 〔B-O2，Medium-High，唯一功能性缺陷〕

- **位置：** `src/components/copilot/CopilotPanel.tsx:311`（aside `z-40`）· `src/contexts/CopilotUiContext.tsx:25/43/62/71`（`closeDrawer` 定义但**全仓零消费**）
- **现状：** 移动端抽屉打开后**无关闭钮、无 scrim 遮罩**，且 `aside z-40` 遮住 navbar 的 cop-toggle（原型为 navbar z-25 > copilot z-20，**层叠倒置**）。用户须刷新页面才能脱困。
- **修复建议（B 组原文，改动均在 F003 文件集内）：** ① aside 降至 `z-10` 或 navbar 升至 `z-50`，恢复原型层叠 → toggle 自然双向；② 抽屉内加关闭钮接 `closeDrawer`；③ 补 scrim 遮罩点击关闭。**推荐 ① + ③。**
- **复验口径：** 移动视口（≤768px）实测：打开抽屉后**至少两条关闭路径可用**（toggle 双向 + scrim 或关闭钮）；`closeDrawer` 有真实消费点。

---

### 3.1 非阻断 MINOR（不入 fixing，建议 done 阶段顺手或转 backlog）

| ID | 组 | 内容 | 判定依据 |
|---|---|---|---|
| MINOR-F013-1 | C | 创作者抽屉遮罩点击不关闭（`.chakra-modal__content-container` 高度塌 0，Chakra `closeOnOverlayClick` 处理器够不到）；`CreatorDrawer.tsx:3` 注释宣称支持，与实物不符 | inventory V10 34 元素**未含遮罩关闭**（该要求只写在 S4 GateConfirm，而 GateConfirm 实测通过）；F013 acceptance 无此子句；存在 3 条可用关闭路径 |
| MINOR-F007-1 | C | `docs/dev/agent-architecture.md:86` 仍将 `routeToStage` 产出写为 `?stage=`（实物已返回 `?env=`）——**汇总时复核仍在** | 不影响运行时行为；**与 FIX-2 同属文档域，建议一并修**（边际成本近零） |
| INFO-1 | C/D | `next dev` 因 devtools `segment-explorer` 与 RSC client manifest 冲突导致**全路由 500 / 整页白屏**——C、D 两组独立踩中同一坑 | 环境问题非产品缺陷。**建议入 `framework/patterns/testing-env-patterns.md`：本项目 UI 实测一律走 `next build` + standalone，不走 `next dev`** |

> MINOR 两项均**不违反任何 acceptance 子句**，故不触发 fixing。是否即刻修复由 Planner / 用户裁定。**若 Generator 已在改 FIX-2 的文档域，MINOR-F007-1 建议顺带修掉。**

---

## 4. 复验（reverifying）口径建议

| 项 | 范围 |
|---|---|
| **定点复验** | FIX-1 ~ FIX-4 各按 §3 的「复验口径」逐条实测 |
| **回归范围** | **一轮就绪回归即可**：`lint` + `tsc` + `build` + `test:visual`（12）+ `f010 e2e`（6）+ fe-audit 三脚本 |
| **不需重验** | 14 条 PASS feature 的元素级清单（301/301 已达成，四处修复均不触及页面元素结构） |
| **需注意的连带** | FIX-3 改根 redirect → 复跑 `f008-browser-check` 的 redirect 断言；FIX-4 改 z 序 → **必须复跑 `test:visual`**（层叠变化可能影响截图） |
| **fix_rounds** | 修复完成后 +1，进入 `reverifying` |

---

## 5. 独立性记录（两次转派，逐条备查）

本批 verifying 采用 fan-out 五分组。因 **tmux 新建 pane 通路故障（ENXIO，pty 未触顶）**，D / E / 汇总三路无法拉起新 subagent，改由已完成组的 evaluator 经 resume 通路转派承接。**逐条核验独立性铁则（「无人评估自己的工作」）：**

| 分组 | 实际承担 | 该 evaluator 的既有上下文 | 独立性 |
|---|---|---|---|
| A（F001） | 原 A 路 | — | ✅ |
| B（F002-F005） | 原 B 路 | — | ✅ |
| C（六页） | 原 C 路 | — | ✅ |
| **D（F008-F012）** | **原 A 路承担** | 仅 A 组验收上下文（架构文档 + schema/gate 代码）；**未接触 `src/components/envs/`**，无 F008-F012 实现上下文 | ✅ **成立** |
| **E（F017 + 批末回归）** | **原 B 路承担** | 仅 B 组验收上下文（F002-F005）；**未参与 F017 或任何产品代码编写** | ✅ **成立** |
| **汇总 signoff** | **原 C 路承担（本报告）** | 仅 C 组验收上下文（六页）；**无任何实现上下文**；对 A/B/D/E 四组交叉抽查、**对自出的 C 组声明不自查** | ✅ **成立** |

**关键点：三条转派路承担的均是「验收→验收」，不存在任何「实现→验收」的自评。** 全部 evaluator 均以隔离 fresh context 运行，结论基于仓库实物 grep / headless 浏览器实测 / 脚本复跑，未采信编排者或实现者的质量描述。五份分组报告原文未被本汇总改写、筛选或软化。

---

## 6. 汇总声明与建议动作

**批次质量总评：** 本批交付密度与验收严谨度均高——301 元素「不得简化清单」**零简化达成**，as-built 纪律执行到位（含主动披露闸门并发缺口这类不粉饰的负面信息），视觉基线抖动三层根因被逐一实证根除，L1 全绿且经多组独立复跑一致。**四处待修缺陷全部是定点小改，无一涉及结构返工或设计返工。**

**建议编排者动作：**

1. `progress.json`：`status` → **`fixing`**；`evaluator_feedback` 写入本报告 §3 四项 fixing 清单
2. `features.json`：**F001 / F002 / F003** → `pending`；其余 14 条保持 `completed`
3. `docs.signoff` → 本文件路径（**注意：本文件是 verifying 轮的汇总判定，非 done 签收**；done 签收须待 reverifying 全 PASS 后另出或追加签收章节）
4. **不得部署**——部署人类闸门须在整批 PASS 之后
5. 建议将 INFO-1（`next dev` 白屏坑）提交 `framework/proposed-learnings.md`

---

**最终结论：ARCH-M05 整批 PARTIAL —— 14 PASS / 3 PARTIAL / 0 FAIL，4 处定点修后转 reverifying。本批不予 done 签收。**

*汇总 Evaluator: Andy/evaluator-subagent（C 路承担）· ARCH-M05 verifying · 2026-07-21*
