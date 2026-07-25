# M4-INSIGHT F002 验收结论（Evaluator 隔离验收）

> 批次：M4-INSIGHT · feature：F002 `roi.compute` 纯函数（domain）+ D20 变异测试
> 验收基准 commit：`fc905c1`
> 验收日期：2026-07-24
> 独立性：隔离上下文（fresh context）· 自行从磁盘取证 · 未采信任何实现过程叙述

---

```
feature_id: F002
result: PASS
```

## acceptance_checklist

1. **✓ 纯函数无 DB 读（ctx 传入）** — `src/lib/domain/roi-compute.ts` 全文 0 条 import/require；grep `prisma|fetch|process\.|new Date|Date.now|Math.random|async|await` 仅命中注释行。入参 spend/reach/conversions/actualExposure/targetExposure 全部由调用方查好传入。单测另证不可变性（入参 JSON 快照前后相等；两次调用 `toEqual` 但 `not.toBe`，含 exposure 子对象）。
2. **✓ 分子缺 → roi=null + basis=insufficient_evidence（绝不填 0/不猜）** — 2³=8 组合全矩阵断言 `toBeNull()` 且显式 `not.toBe(0)`；非法值（-1 / NaN / +Infinity）× 3 分子键 = 9 组同样降级。源码级变异 M2（缺分子返 roi=0+computed）12 例翻红、M3（猜 roi=1.2）12 例翻红。
3. **✓ 目标差异 + 达成方向三值逐值可分支** — up(120k/100k, Δ=+20000, ratio=0.2) / down(80k, −20000, −0.2) / flat(100k, 0, 0) 三态各自断言，并用 Set 断言两两可区分；null（缺数据）与 flat 语义独立。消费侧类型 `'up'|'down'|'flat'|null`（`src/lib/display/insight-format.ts:20`）；全仓 grep 无二态三元内联另判。极性 `higherIsBetter=false`（越低越好）单独覆盖。
4. **✓ spend 缺失与 spend=0 语义可区分** — null→`insufficient_evidence`+回显 null；0→`zero_spend`+回显 0；专门断言两者 basis 与 spend 回显都不同。源码级变异 M1（`normCount(spend) ?? 0`）4 例翻红、M8（zero_spend 并入 insufficient_evidence）3 例翻红。
5. **✓ 全矩阵单测** — 39 用例：分子 present/missing 2³ 循环生成 + 分子非法值矩阵 + spend 四态（正常/null/0/非法）+ 方向三值 + 目标缺失 + actualExposure 双重身份 + compareGoal standalone（极性 / target=0 不除零 / 非法值不透传）+ JSON 序列化往返。全绿 39/39。
6. **✓ D20 变异测试** — 文件内 7 个变异体（A 缺证据填 0 / B 猜正数 / C `spend ?? 0` / D 方向恒 up / E 三值压二态 / F 缺数据默认 flat / G 极性被忽略）经同一组行为断言全部翻红。**独立加验**（bare `toThrow()` 可能因无关异常误过）：抓取 7 个变异体实际抛出信息，逐条为领域判据文案（如「分子 reach 缺失仍返回了 roi=0（缺证据编数）」「持平未判 flat（三值被压成二态？）」），无一例是偶发 TypeError。
7. **✓ 三处复用铁律注释就位 + 实际复用** — 文件头 §8-12 明列 ① V8/V12 页面 ② `compute_roi` 工具 ③ `weekly-draft` 例程；grep 证实四个真实调用点：`lib/insight/surface-data.ts:58,77`（V8）、`lib/insight/cross-surface-data.ts:74`（V12）、`lib/agent/tools/compute-roi.ts:63`（工具）、`lib/insight/weekly-report.ts:172`（例程）。全仓无内联 ROI 算式 / 方向另判（消费侧只读 `roi.exposure.direction` / `deltaRatio`）。

## evidence

- `npx vitest run tests/unit/roi-compute.test.ts` → Test Files 1 passed / **Tests 39 passed (39)**
- 全量单测（干净 HEAD worktree）`npx vitest run tests/unit --coverage` → **36 files / 630 tests passed**，All files 93.11% stmts / 94.71% branch（配置门 `src/lib/domain/**` ≥80% 绿）
- **源码级变异测试（本次新增，检测器活性证明）**：`git worktree add --detach /tmp/f002-mut HEAD` 隔离副本内直改**真实源码** 9 处 → 逐个跑同一单测：M1 `spend??0` / M2 缺分子填 0 / M3 猜正数 / M4 方向恒 up / M5 三值压二态 / M6 缺数据默认 flat / M7 极性忽略 / M8 zero_spend 合流 / M9 normCount 去校验 → **KILLED 9/9，SURVIVED=0，PATCH-MISS=0**（每个 2–12 例翻红）。产品代码零改动，跑完还原并 `git worktree remove`。harness 存档 `scripts/test/f002-roi-source-mutation-probe.py`（`.py` 后缀，不入 tsc/vitest/lint glob，零工具链噪声）。
- `npx prisma generate` 前置后 `npx tsc --noEmit`（干净 HEAD worktree）→ **0 error**；`next lint --file src/lib/domain/roi-compute.ts` → No ESLint warnings or errors
- 产品代码零改动核证：`git diff --stat HEAD -- src prisma sdk docs/specs` → 空

## soft_watch（不影响 PASS，供 Planner M5 复核，非缺陷）

- ROI 数值口径 `conversions/spend` 系 Generator 自裁决（spec §3 P1 未给公式），`reach`/`actualExposure` 只作**证据闸门**不入公式——比 spec 更保守（少一项证据即降级），文件头 §29-36 已作为 EXTENSION POINT 显式记录。本批 reach/conversions 生产路径恒 null → roi 恒 `insufficient_evidence`，**无用户可见数字风险**；M5 真分子回传时货币化倍数（V12「3.1x」形态）需 Planner 重新裁决口径。
- 主树存在 2 个**其他并行 evaluator 的未追踪探针**（`tests/unit/share-adapter.evaluator-probe.test.ts`、`scripts/test/f006-eval-probe.ts`），前者引入 2 处 tsc 报错（TS7005 / TS2749）。**与 F002 无关、未入库**，干净 HEAD tsc 为 0 error——提请勿误记到本批账上。
- L2 未执行且不需要：F002 为纯函数，零外部依赖，无网关 / DB / 资金 / 对外副作用；全程未触碰 `AIGCGATEWAY_*`。

## description / steps_to_reproduce

不适用（PASS）。

## 边界声明

本次验收未修改 `progress.json` / `features.json` / 任何产品代码；唯一新增文件为验收探针 `scripts/test/f002-roi-source-mutation-probe.py` 与本报告。

---

*签名：Andy/evaluator-subagent*
