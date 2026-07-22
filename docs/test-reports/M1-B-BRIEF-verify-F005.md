# M1-B-BRIEF 验收分报告 — F005 ProjectHealth / HEALTH_LABEL 三重收敛

- **验收者：** evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-21（本机时钟）
- **被验对象：** main HEAD `126b410`（F005 实装 commit `599dbfb`）
- **判定：PASS**（逐条 acceptance 全符合，无 PARTIAL/FAIL 项）

---

## 1. 验收范围与依据

- features.json F005 acceptance 全文 + spec `docs/specs/M1-B-BRIEF-spec.md` §2 F005 / §3 D6 / §4 F005 行
- 验收方法：代码 grep（HEAD + pre-F005 基线对照）· commit diff 实证 · L1 套件亲跑（lint/tsc/test:unit）· 运行中 standalone (:3000) curl 实测
- 本 feature 无 [L2] 项（纯类型/常量收敛重构，无外部调用），全部 L1 可闭环
- L1 前置（testing-env-patterns §3/§4）：`npx prisma generate` 已先跑；项目无 `.nvmrc`（本机 Node v25.7.0），全套测试通过，无版本误报

---

## 2. 逐条 acceptance 判定

### 2.1 类型收敛：ProjectHealth 两份副本 → domain/health.ts 的 HealthBand（依赖反转）— PASS

**pre-F005 基线（`git grep -n "ProjectHealth" 599dbfb^ -- 'src/**'`，同一 pattern 复现旧 findings = 检测器活性证明）：**

- `src/lib/data/mock/projects.ts:11` — `export type ProjectHealth = 'gd' | 'wn' | 'cr'`（副本 1）
- `src/lib/data/mock/today.ts:59` — `export type ProjectHealth = 'gd' | 'wn' | 'cr'`（副本 2，`git show 599dbfb^:src/lib/data/mock/today.ts` 第 59 行实证）
- `src/lib/domain/health.ts`（pre-F005）— `import type { ProjectHealth } from 'lib/data/mock/projects'`（**反向依赖：domain import mock**）
- 消费方 campaigns/page.tsx、today/page.tsx、ProjectDetail.tsx 均 import 自 mock

**HEAD 终态：**

- `git grep -n "ProjectHealth" HEAD -- 'src/**' 'tests/**' 'scripts/**'` → **0 命中（exit=1）**，类型名全仓归零
- canonical 唯一定义：`src/lib/domain/health.ts:18` `export type HealthBand = 'gd' | 'wn' | 'cr'`；grep `HealthBand` 全仓仅此一处定义，其余 8 站点全部是 `import type { HealthBand } from 'lib/domain/health'` + 用法：
  - `src/lib/data/mock/projects.ts:9,25`（`MockProject.health: HealthBand`）
  - `src/lib/data/mock/today.ts:11,70`（`TodayProject.health: HealthBand`）
  - `src/app/admin/today/page.tsx:38,125` · `src/app/admin/campaigns/page.tsx:19,23,34` · `src/components/project/ProjectDetail.tsx:26,51` · `src/lib/display/health-label.ts:9,11`
- 依赖方向已反转：domain 不再 import mock（F005 diff 实证删除 `import type { ProjectHealth } from 'lib/data/mock/projects'`），mock/页面/today 全部 import domain。mock 消亡时类型不陪葬——acceptance 意图达成
- 全仓无第二处 `'gd' | 'wn' | 'cr'` 联合重声明（grep 排除 domain/health.ts 后 0 命中）

### 2.2 【D6】label 收敛：HEALTH_LABEL 两份 → 展示层单点新文件 — PASS

**pre-F005 基线（同 pattern 复现）：** `HEALTH_LABEL` 定义两份——`src/lib/data/mock/projects.ts:13` + `src/app/admin/today/page.tsx:133`。

**HEAD 终态：**

- 新建展示层常量文件 `src/lib/display/health-label.ts`（F005 commit 新增 15 行），唯一 canonical：`HEALTH_LABEL: Record<HealthBand, string> = { gd:'正常', wn:'注意', cr:'风险' }`（`Record<HealthBand,…>` 全量覆盖，档位增减 tsc 防漏配）
- 位置符合 D6 Planner 建议（`src/lib/display/`，与既有 `env-guard-messages.ts` / `project-format.ts` 同处展示层单点惯例）
- 三个消费方全部 import 自 `lib/display/health-label`：today/page.tsx:39,181 · campaigns/page.tsx:20,75 · ProjectDetail.tsx:27,179
- 旧两处副本删除实证：today/page.tsx:134 处仅余收敛注释（`本页副本已删`）；projects.ts 无任何 HEALTH_LABEL
- band→中文 label 映射全仓 grep（`gd:\s*'正常'` 等）仅 health-label.ts:12-14 一处命中，无第二份映射残留

### 2.3 domain/health.ts 计算逻辑不动 — PASS

- `git diff 599dbfb^..599dbfb -- src/lib/domain/health.ts`：仅 (a) 删 mock import；(b) `export type HealthBand = ProjectHealth` 改为字面量联合直接定义；(c) JSDoc 注释更新。**阈值/权重/四因子函数/resolveBand/computeHealth 零改动**
- 行为证据：M1-A 的 `tests/unit/health.test.ts`（32 用例，穷举测试基座）在 HEAD 亲跑 **32/32 全绿**（`npx vitest run tests/unit/health.test.ts`）

### 2.4 domain/health.ts 无中文文案（无 i18n 耦合）— PASS

- 代码字符串字面量逐一核查：文件内全部字符串仅 `'gd'` / `'wn'` / `'cr'`（band 值），**零中文字符串字面量**
- 全文件中文字符命中共 6 类站点（:27/:30/:75/:112/:124/:143/:145/:176 等），逐行核实**全部位于 JSDoc / 行尾 `//` 注释**（如 `// 除零防护`）——注释非文案（不进 bundle、不面向用户），不构成 i18n 耦合。判定口径：D6 "domain 保持纯逻辑无 i18n 耦合" 指用户可见文案，中文注释是项目全仓惯例（spec/CLAUDE.md 同为中文）

### 2.5 回归：tsc 全绿证 import 重接无遗漏 + lint + test:unit — PASS

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npx prisma generate && npx tsc --noEmit` | **exit 0，0 errors**（import 重接无遗漏） |
| Lint | `npm run lint` | **No ESLint warnings or errors**（0/0，无需 warnings 矩阵裁量） |
| 单测 | `npm run test:unit` | **9 files / 129 tests 全过**（668ms） |
| health 定向 | `npx vitest run tests/unit/health.test.ts` | **32/32** |

### 2.6 运行时实证（补充，非 acceptance 硬项）

标签渲染源自单点的端到端确认（运行中 standalone `127.0.0.1:3000`，只读 curl，未动服务器/数据）：

- `/admin/campaigns`（mock wn/gd/gd/cr）→ 正常×2 · 注意×1 · 风险×1 ✅
- `/admin/today`（雷达仅含有 ask 的项目）→ 正常×2 · 注意×1 ✅
- `/admin/campaigns/xg?env=brief`（HTTP 200，真算 health）→ 风险×1（cr，D2 预期全红）✅

label 文案值收敛前后不变（正常/注意/风险）→ 渲染零漂移，与 F005 commit 宣称一致且已独立实证。

---

## 3. 观察项（非缺陷，不影响判定）

- **OBS-1：** `PILL_TONE`（band→CSS class 样式映射）在 today/page.tsx:127 与 campaigns/page.tsx:23 各有一份、ProjectDetail.tsx:51 另有 `DOT_TONE`。这些是**样式 tone 映射非 label 文案**，不在 F005 acceptance 范围（acceptance 仅点名 ProjectHealth 类型 + HEALTH_LABEL 文案）；如需收敛可作后续 backlog 候选，不构成本 feature 副本残留。
- **OBS-2：** 项目无 `.nvmrc`；本机 Node v25.7.0 下全套 L1 通过，未触发 testing-env-patterns §4 的 jsdom/localStorage 误报面。

## 4. 结论

**F005 = PASS。** 三重收敛全部落地且方向正确：类型 canonical 入 domain（依赖反转、ProjectHealth 全仓归零，含 0-findings 活性证明——同一 grep 在 `599dbfb^` 复现全部旧副本）；label 入展示层单点新文件（两副本删除、三消费方重接）；domain 计算逻辑零改动（diff + 32 用例行为双证）；domain 无中文字符串字面量；lint/tsc/test:unit 全绿；运行时三页标签渲染实证正常。
