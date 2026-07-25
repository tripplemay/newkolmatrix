# M4-INSIGHT F003 验收 verdict（原样落盘）

> Evaluator（隔离 subagent，fresh context）· 2026-07-24
> 被测 commit `a28a2c3` feat(M4-INSIGHT-F003)；工作树 HEAD `fc905c1`
> 约束核证：未修改任何产品代码 · 未触碰 AIGCGATEWAY_*（本 feature 零 IO）· 零真实对外副作用 · 未改 progress.json / features.json

```yaml
feature_id: F003
result: PASS

acceptance_checklist:
  - "✓ 纯函数无 DB 读 —— src/lib/domain/attribution-gaps.ts 全文件零 import（grep import|require 仅命中第 5 行注释）；扫描 Date./Math.random/process./fetch/prisma/console./async/await 亦仅命中注释 → 无 IO、无副作用、确定性；单测『不修改入参 + 同输入同输出 + 返回全新对象』用例通过"
  - "✓ 原因码字面量联合 4 码 —— L41-49 导出 type AttributionGapReason = 'REACH_ABSENT' | 'CONVERSIONS_ABSENT' | 'SPEND_COMMITTED_ONLY' | 'SPEND_ABSENT'（非自由文本）"
  - "✓ 逐条可分支渲染「缺什么显什么」 —— gaps[] 按漏斗序（spend→reach→conversions）+ byMetric 双视图（同源断言：byMetric[gap.metric] === gap）；display/insight-format.ts:144-151 四码四文案单一真相源，surface-data.ts:126 与 weekly-report.ts:140 各自按 reason 逐码取文案；SPEND_COMMITTED_ONLY 额外带 committed 事实（其余码恒 null）"
  - "✓ 无缺口时空清单 —— 证据齐备（payout+数额 / reach·conversions 已回传）→ gaps=[]、complete=true、byMetric 三项皆 null；且 reach=0/conversions=0 判为真实回传值不虚报缺口（『上报为零』≠『未上报』）"
  - "✓ 全矩阵单测（各分子缺失组合） —— spend 8 组合（数额{有,null} × 口径{payout,quote,none,null}）逐组期望码断言；reach × conversions 3×3 三态（null/0/正数）9 组合逐组断言；complete≡gaps.length===0 不变量在 8×3=24 组合上穷举；三维全缺最坏形态逐条列三码"
  - "✓ D20 变异（缺口被吞成空清单 / 强行标 complete → 翻红） —— 测试内置变异体 A–F 各自 toThrow 通过；另做源码级活性证明（只读 worktree 改真实源文件）：M1 吞 reach 缺口→7 failed、M2 complete 恒 true→16 failed、M3 quote 当 payout→5 failed、M4 conversions 0/null 混同→5 failed，还原后 35 passed"
  - "✓ 三处复用铁律注释 —— 文件头 L8-12 明列①V8/V12 页面 ②compute_roi ③weekly-draft；grep 实证三处真复用无内联重算：surface-data.ts:16,65 / agent/tools/compute-roi.ts:21-23,70 / insight/weekly-report.ts:36-38,165"
  - "✓ 不强行归因（P1/U1 语义） —— 函数只列缺口不算 ROI、不填 0；spend 值缺或 spendSource∈{none,null} 一律 fail-safe 判 SPEND_ABSENT（不把无源数字当已核花费）；quote 判 SPEND_COMMITTED_ONLY 与 SPEND_ABSENT 可区分（弱证据≠无证据，专项断言 + 变异体 E/M3 守）"

evidence:
  - "npx vitest run tests/unit/attribution-gaps.test.ts → Test Files 1 passed / Tests 35 passed (35)"
  - "npx vitest run tests/unit（回归面）→ Test Files 37 passed / Tests 643 passed (643)"
  - "npx eslint src/lib/domain/attribution-gaps.ts tests/unit/attribution-gaps.test.ts → exit 0"
  - "npx tsc --noEmit（干净 HEAD worktree /tmp/f003-tsc）→ TSC_ON_HEAD_EXIT=0"
  - "源码级变异活性证明：MUTANT_m1 => 7 failed|28 passed；m2 => 16 failed|19 passed；m3 => 5 failed|30 passed；m4 => 5 failed|30 passed；RESTORED_ORIG => 35 passed"
  - "被测 commit a28a2c3 feat(M4-INSIGHT-F003)；工作树 HEAD fc905c1；用例记录落 docs/test-cases/M4-INSIGHT-F003-attribution-gaps.md（未 commit，留批末统一收口）"
  - "[L2] 未执行且不需要：本 feature 为零 IO 纯函数，全程未触碰 AIGCGATEWAY_*，无任何真实对外副作用；验证用 worktree 已 remove，主工作树无产品代码改动"

description: null        # PASS，无问题
steps_to_reproduce: null # PASS，无需复现

observations_non_blocking:
  - "共享工作树存在其他 evaluator 的未追踪探针 tests/unit/share-adapter.evaluator-probe.test.ts，带入 2 处 TS 报错（TS7005 L178 / TS2749 L206），致工作树内 tsc 非零；干净 HEAD tsc=0 → 属验收期工作树污染，不计入 F003，建议批末清理"
  - "文件头注释①把 V12 与『gaprow ×N』并列，而 V12（ui-inventory 14 元素）实际不渲染 gaprow，其缺口经周报草案文本承载；措辞可精化，不构成 acceptance 缺失"
```

## 执行命令台账（可复跑）

| # | 命令 | 结果 |
|---|---|---|
| C1 | `npx vitest run tests/unit/attribution-gaps.test.ts --reporter=verbose` | 35 passed (35) |
| C2 | `npx vitest run tests/unit --reporter=dot` | 37 files / 643 passed |
| C3 | `npx eslint src/lib/domain/attribution-gaps.ts tests/unit/attribution-gaps.test.ts` | exit 0 |
| C4 | `git worktree add --detach /tmp/f003-tsc HEAD && npx tsc --noEmit` | exit 0（干净 HEAD） |
| C5 | `grep -nE "Date\.|Math.random|process\.|fetch|prisma|console\.|async|await" src/lib/domain/attribution-gaps.ts` | 仅注释行命中 |
| C6 | 只读 worktree 源码级变异 M1–M4 + 还原 | 7/16/5/5 failed；还原 35 passed |

---

署名：Andy/evaluator-subagent
