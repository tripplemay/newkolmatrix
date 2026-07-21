# P2-CLEANUP F004 验收报告 — 抽 HandoffPanel + 夹具对齐生产（BL-FE-14）

| 项 | 值 |
|---|---|
| 批次 | P2-CLEANUP |
| Feature | F004 抽 HandoffPanel + 夹具对齐生产（两件合一） |
| 阶段 | verifying（首轮） |
| Evaluator | Andy/evaluator-subagent（隔离上下文，fresh context） |
| 验收日期 | 2026-07-21 |
| 被验 SHA | `e01424c`（F004 实装 commit = `8f5f470`） |
| 实测环境 | standalone 生产产物，`PORT=3104 node scripts/serve-standalone.mjs`（遵 testing-env-patterns §7，不走 `next dev`） |
| **结论** | **PASS** |

---

## 1. 逐条 acceptance 对照

| # | acceptance 条款 | 判定 | 依据 |
|---|---|---|---|
| 1 | 抽 `common/HandoffPanel.tsx` 承载容器 chrome（SurfaceCard + SectionLabel + MdGroups + 标签文案） | PASS | 文件存在（46 行），`HandoffPanel.tsx:36-44` 依次渲染 `SurfaceCard` → `SectionLabel` → `MdGroups size={15}` → 标签文案 → flex 列表 |
| 2 | 生产 `HandoffCollab.tsx` 与夹具 `preview/agent-canvas/page.tsx` **共用同一外壳** | PASS | 两处均 `import HandoffPanel`（`HandoffCollab.tsx:15` / `page.tsx:12`）；**DOM 实证**：两侧容器 class 逐字相同（探针 A1/A2），非「各写各的碰巧相似」 |
| 3 | 抽象**显式容纳三处分叉**作为 props 或变体，不得靠夹具将就 | PASS | 三处分叉逐项落为 props/职责，详见 §2 |
| 4 | 夹具 `border-dashed` 经此**对齐生产口径**（本 feature 回归价值） | PASS | 活页 DOM：夹具容器含 `border-dashed`（探针 A2）；基线 PNG 前后对比肉眼确证虚线框（§4） |
| 5 | 两处重复导入 `MdGroups`/`SectionLabel`/`SurfaceCard` 随之收敛 | PASS | 两文件 grep 三个符号 = **0 命中** |
| 6 | `HandoffCard` 11 props 全路径不退化 | PASS | 文件本批次**零改动**；实际 12 props 经两侧并集**逐项浏览器实测**覆盖，详见 §3 |
| 7 | 预期改动 `agent-canvas.png`，基线由 F005 统一重生 | PASS | darwin 基线在 `ad4f725`(F005) 重生、linux 在 `6d56162` 重生；前后 md5 不同且差异即虚线框 |
| 8 | lint + tsc 绿 | PASS | `npx next lint` → `✔ No ESLint warnings or errors`；`npx tsc --noEmit` → 退出码 0、零输出 |

---

## 2. 三处分叉逐项核验（acceptance 第 3 条展开）

| 分叉 | 抽象中的容纳方式 | 生产侧实测 | 夹具侧实测 |
|---|---|---|---|
| ① `border-dashed` | `dashed?: boolean` prop，缺省 `true`（生产口径）<br>`HandoffPanel.tsx:24,36` | 容器含 `border-dashed`（A4-1） | 容器含 `border-dashed`（A2）——**由无到有，即本 feature 回归价值** |
| ② `stage` 三元文案 | `stage?: string \| null` prop，`HandoffPanel.tsx:39-41` 二分支三元；原写在 `HandoffCollab` 内的三元被收敛至此 | `?env=brief` → 「**本环节协同** · 多 Agent 联动 · 点开看交接」（A4-2） | 无 stage → 「**协同交接** · 多 Agent 联动 · 点开看交接」（A4-2b）<br>**两条支路均被实测覆盖** |
| ③ 多卡 flex 容器 | 一律由 panel 提供（`HandoffPanel.tsx:43`），单卡亦走同一路径 | `flex flex-col gap-1.5`，卡数 ≥2（A4-3 / A4-3b） | `flex flex-col gap-1.5`，卡数 =1（A4-3c）——不再裸放单卡 |

**「不得靠夹具将就」的反向核验：** 生产侧容器 class 与 F004 之前硬编码值 **逐字一致**（探针 A3）：

```
rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700 border-dashed p-3
```

即抽取过程未反向偷改生产外观来迁就夹具——对齐方向正确（夹具 → 生产），符合 spec D4 裁决。

**额外结构核验（防抽象引入多余 DOM 层）：** 两侧 panel 直接子节点数均 = 2（SectionLabel + flex 列表），`HandoffCollab` 用 fragment 包裹 children 未产生额外 wrapper（探针 A5）。

---

## 3. HandoffCard props 不退化核验（acceptance 第 6 条展开）

**溯源：** `git log 8f5f470^..HEAD -- src/components/common/HandoffCard.tsx` → **空**，该文件本批次零改动，组件层面不存在退化面。

**计数说明（非缺陷）：** acceptance 与 spec §2 均写「11 props」，实清 `HandoffCardProps` 为 **12 个**字段。该计数出自 planning 勘查，早于 F004 且与本 feature 改动无关。按 evaluator role-context「计数不符先逐站点追溯，判据落终态」，终态判据 = 全 props 路径可达且未退化，下表逐项实测成立。

| # | prop | 覆盖侧 | 实测断言 |
|---|---|---|---|
| 1-2 | `fromName` / `toName` | 生产 + 夹具 | 卡头「匹配 Agent ↔ 触达 Agent」渲染 |
| 3 | `summary` | 生产 | A6-1 收起态即见「对齐组合覆盖能否达成 300 万曝光目标」 |
| 4-5 | `artifactType` / `artifactRef` | 夹具 | A6-5 静态展开态「交接物：」行 |
| 6-7 | `collapsible=false` / `defaultOpen` | 夹具 | A6-5 无 chevron 静态展开形态成立 |
| 8-9 | `fromColor` / `toColor` | 生产 | A6-6 双色 agent 名走 inline style，色值集合 size ≥2（可区分） |
| 10 | `turns` | 生产 | A6-4 展开后逐轮台词「目标是 30 天 300 万曝光…」 |
| 11 | `payload` | 生产 | A6-2 交接物 chip「交接物：组合预估覆盖」 |
| 12 | `outcome` | 生产 | A6-3 绿色结论行「策略 Agent 采纳」 |

注：`payload` / `outcome` / `turns` 仅展开态渲染（`HandoffCard.tsx:132` `open &&`），探针先点击卡头再断言。

---

## 4. 视觉基线核验

| 基线 | 重生 commit | md5 |
|---|---|---|
| `agent-canvas-darwin.png`（F004 前） | `9df773e`（FE-REFACTOR F007） | `537603854b4f198815175d58a0131dc8` |
| `agent-canvas-darwin.png`（当前） | `ad4f725`（P2-CLEANUP F005 单次重生） | `ff64e68a54c2dcd2ce00b36d76086f08` |
| `agent-canvas-linux.png`（当前） | `6d56162`（CI update-visual-baselines） | — |

两图 1512×982 逐帧肉眼比对：**除协同交接面板边框由实线变为虚线外，页面其余部分（专家头 / 消息气泡 / 3 张 KOL 卡 / 交接卡内容）无差异**。这正是 acceptance 第 7 条「预期改动 agent-canvas.png」的预期形态，且证明基线此后守的是生产实际外观。

**CI 交叉确证：** 最新 CI run（`ccece3a`，含全部 F004 代码 + 重生后 linux 基线）四个 job 全绿：

```
Build: success
Typecheck: success
Visual regression: success
Lint: success
```

---

## 5. 实测命令与输出摘录

### 5.1 Evaluator 独立探针（本次新写，非复用 Generator 脚本）

`scripts/test/p2-cleanup-f004-evaluator-probe.mjs` — 定位逻辑刻意与 Generator 探针不同（标签文案锚定 + `rounded-2xl` 祖先上溯 vs. Generator 的 `querySelectorAll('div').find`），保证两套探针失效模式不相关。

```
$ PORT=3104 node scripts/serve-standalone.mjs &
$ BASE=http://127.0.0.1:3104 node scripts/test/p2-cleanup-f004-evaluator-probe.mjs

--- 生产侧 /admin/campaigns/lc?env=brief ---
  PASS  A1 生产侧 HandoffPanel 在场
  PASS  A3 生产侧 chrome 与 F004 之前逐字一致（抽取未偷改生产外观）
  PASS  A4-1 生产侧虚线框（分叉 1：dashed）
  PASS  A4-2 生产侧 stage 命中 → 「本环节协同」文案（分叉 2 支路 a）
  PASS  A4-3 生产侧多卡 flex 容器（分叉 3）
  PASS  A4-3b 生产侧多卡路径仍在（≥2 张）
  PASS  A5 生产侧 panel 直接子节点恰为 2（SectionLabel + flex 列表，无多余 wrapper）
  PASS  A6-1 生产侧 summary prop（收起态）
  PASS  A6-2 生产侧 payload prop（交接物 chip）
  PASS  A6-3 生产侧 outcome prop（绿色结论行）
  PASS  A6-4 生产侧 turns prop（逐轮台词）
  PASS  A6-6 生产侧 fromColor/toColor prop（双色 agent 名，色值可区分）

--- 夹具侧 /preview/agent-canvas ---
  PASS  A1 夹具侧 HandoffPanel 在场
  PASS  A2 夹具侧已获 border-dashed —— 对齐生产口径（本 feature 回归价值）
  PASS  A1/A2 两侧 chrome class 逐字相同（共用同一外壳的 DOM 实证）
  PASS  A4-2b 夹具侧无 stage → 「协同交接」文案（分叉 2 支路 b）
  PASS  A4-3c 夹具单卡亦走同一 flex 容器路径（不再裸放）
  PASS  A5 夹具侧 panel 直接子节点恰为 2（无多余 wrapper）
  PASS  A6-5 夹具侧 artifactType/artifactRef prop（静态展开态，非 turns 分支）
  PASS  NC 负控：检测器能区分「无虚线框」的 SurfaceCard（判否 7 个 / 共 8）

=== F004 Evaluator 探针：20 passed, 0 failed ===
```

### 5.2 检测器活性证明（框架 v1.0.6 纪律）

本报告多条判定依赖「容器含 `border-dashed`」这一检测器，故须先证明它不是恒真断言：

- **同页负控（NC）**：夹具页共 8 个 `rounded-2xl` SurfaceCard，检测器判定其中 **7 个「无虚线框」、1 个（HandoffPanel）「有虚线框」** → 检测器具备判别力，A2/A4-1 非恒真。
- **探针自证未死**：首轮运行时因选择器 bug（`<html>` 被误当作标签元素）**19/20 硬失败**，修正后转全绿——证明断言真实求值，不是无条件放行。首轮失败输出见 §5.4。
- **静态反证**：`git show 8f5f470^:src/app/preview/agent-canvas/page.tsx` 中夹具为 `<SurfaceCard className="p-3">`，且 `SurfaceCard.tsx:22` 基类不含 `border-dashed` → F004 之前夹具**确无**虚线框，A2 是真实的状态跃迁而非既有事实。

### 5.3 Generator 探针交叉复跑（第二数据点）

```
$ BASE=http://127.0.0.1:3104 node scripts/test/p2-cleanup-f004-handoff-panel.mjs
=== F004 HandoffPanel：15 passed, 0 failed ===
```

两套独立探针结论一致。

### 5.4 探针首轮硬失败记录（活性证明原始输出）

```
  FAIL  A1 生产侧 HandoffPanel 在场
  FAIL  A3 生产侧 chrome 与 F004 之前逐字一致（抽取未偷改生产外观）
          期望=rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-700 border-dashed p-3
          实得=undefined
  ...
=== F004 Evaluator 探针：1 passed, 18 failed ===
```

（根因为 Evaluator 探针自身选择器缺陷，非产品缺陷；已修正。同时暴露一条恒真断言——两侧 chrome 皆 `undefined` 时相等判定曾误过，已加非空守卫。）

### 5.5 静态核验

```
$ grep -rn "MdGroups\|SectionLabel\|SurfaceCard" \
    src/components/copilot/HandoffCollab.tsx src/app/preview/agent-canvas/page.tsx
NO MATCHES (imports converged)

$ git log --oneline 8f5f470^..HEAD -- src/components/common/HandoffCard.tsx
（空 — 本批次零改动）

$ npx tsc --noEmit   → 退出码 0，零输出
$ npx next lint      → ✔ No ESLint warnings or errors
```

---

## 6. 观察项（不影响判定，供 Planner 记账）

1. **`dashed={false}` 零消费。** `dashed` prop 的 `false` 分支在全仓无调用点（两侧均走缺省 `true`）。这是「夹具对齐生产」的**预期终态**，且 acceptance 只要求分叉「作为 props 或变体容纳」，故不判缺陷；但该分支未被任何测试覆盖，若后续无消费方出现，可考虑在下批次评估是否收敛掉。
2. **spec / acceptance「11 props」与实物 12 处对不上。** 计数出自 planning 勘查，早于 F004，非本 feature 引入。建议 Planner 在 spec 归档时勘误，避免后续批次沿用错误基数。
3. **`/admin/campaigns/lc?env=brief` 无 DB 亦可渲染协同面板**（数据来自 `COLLAB_MOCK[stage]`，`/api/handoffs` 失败降级为空数组），故本次 L1 实测未依赖 Postgres。属实现既有设计，记录以便后续验收复用该路由。

---

## 7. 结论

**PASS。** 8 条 acceptance 逐条成立，无一软化：抽象已落地且被两侧共用（DOM 逐字同源实证），三处分叉全部显式作为 props/职责容纳且两条文案支路均实测覆盖，夹具虚线框已对齐生产（活页 DOM + 基线 PNG 双证），重复导入归零，HandoffCard 12 props 经两侧并集逐项实测不退化，基线已由 F005 单次重生且 CI 视觉回归绿，lint/tsc 双绿。

关键判定均配检测器活性证明（同页负控 7/8 判否 + 探针首轮硬失败 + F004 前静态反证），排除「恒真断言导致的假绿」。

**未执行项：** 无 [L2] 项。`npm run test:visual` 本地未跑——该 config 硬绑端口 3000，与并行验收冲突；其 acceptance 归属 F005，且已由 CI `Visual regression: success`（SHA `ccece3a`）覆盖。

---

## 附：本次新增测试产物

- `scripts/test/p2-cleanup-f004-evaluator-probe.mjs`（20 断言，含负控）
- `docs/test-reports/P2-CLEANUP-F004-verify.md`（本文件）

未修改任何产品代码（`src/` / `tailwind.config.js` / `package.json` / 配置文件全部零改动）。
