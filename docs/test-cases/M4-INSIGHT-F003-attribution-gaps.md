# M4-INSIGHT F003 验收用例记录 — `attribution.gaps` 纯函数 + D20 变异

> Evaluator（隔离 subagent）· 2026-07-24 · 被测物 commit `a28a2c3`（工作树 HEAD `fc905c1`）
> 约束：未修改任何产品代码；未外呼网关（本 feature 纯函数，零 IO）；零对外副作用。

## 1. 被测物

- `src/lib/domain/attribution-gaps.ts`（145 行，零 import）
- `tests/unit/attribution-gaps.test.ts`（355 行，35 用例）

## 2. 执行命令与结果

| # | 命令 | 结果 |
|---|---|---|
| C1 | `npx vitest run tests/unit/attribution-gaps.test.ts` | 35 passed (35) |
| C2 | `npx vitest run tests/unit`（回归面） | 37 files / 643 passed |
| C3 | `npx eslint src/lib/domain/attribution-gaps.ts tests/unit/attribution-gaps.test.ts` | exit 0 |
| C4 | `npx tsc --noEmit`（干净 HEAD worktree） | exit 0 |
| C5 | `grep -nE "Date\.\|Math.random\|process\.\|fetch\|prisma\|console\.\|async\|await" src/lib/domain/attribution-gaps.ts` | 仅注释行命中 → 无 IO / 无副作用 / 确定性 |

## 3. 检测器活性证明（源码级变异，独立于测试文件自带的包装变异体）

测试文件自带变异体 A–F 是**包装式**（wrap 真实函数后篡改返回值）。为排除「断言只对包装变异敏感、对真实源码退化不敏感」，
在只读 worktree（`git worktree add --detach /tmp/f003-activity HEAD` + 软链 node_modules）中直接改**源文件**再跑同一套测试：

| 变异 | 源码改动 | 结果 |
|---|---|---|
| M1 缺口被吞 | `byMetric.reach` 恒 `null`（REACH_ABSENT 分支删除） | **7 failed** / 28 passed |
| M2 强行标 complete | `complete: gaps.length === 0` → `complete: true` | **16 failed** / 19 passed |
| M3 承诺额冒充放款 | `if (spendSource === 'quote')` → `if (false)` | **5 failed** / 30 passed |
| M4 `0` 与 `null` 混同 | `input.conversions == null` → `!input.conversions` | **5 failed** / 30 passed |
| 还原 | 恢复原文件 | 35 passed (35) |

worktree 已 `git worktree remove --force` 清除；主工作树 `git status` 无本 feature 相关改动。

## 4. 三处复用铁律（P2）实证 grep

| 复用点 | 文件 : 行 |
|---|---|
| ① V8 页面（RSC 装配 → gaprow ×N） | `src/lib/insight/surface-data.ts:16,65,126`（`ATTRIBUTION_GAP_LABEL[g.reason]` 逐码渲染） |
| ② `compute_roi` 工具 | `src/lib/agent/tools/compute-roi.ts:21-23,70`（无内联重算） |
| ③ `weekly-draft` / `draft_report` 例程 | `src/lib/insight/weekly-report.ts:36-38,140,165`（`describeGapLine` 共用同一文案源） |

原因码 → 文案单一真相源：`src/lib/display/insight-format.ts:144-151`（4 码 4 文案，逐条可分支）。
V12 不渲染 gaprow（ui-inventory 14 元素无该卡），其缺口经 ③ 周报草案文本承载 —— 与文件头注释①口径一致。

## 5. 观察项（非 F003 缺陷）

- 共享工作树中存在**其他 evaluator 的未追踪探针文件** `tests/unit/share-adapter.evaluator-probe.test.ts`，
  在其中带入 2 处 TS 报错（TS7005 / TS2749）。干净 HEAD worktree 的 `tsc --noEmit` = 0 错误，
  故属验收期工作树污染，不计入 F003；建议批末清理或修正后再入库。
