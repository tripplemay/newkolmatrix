# P2-CLEANUP F005 验收报告 — CreatorDrawer 入视觉基线 + 单次重生

- **Feature：** F005「CreatorDrawer 入视觉基线 + 单次重生（必须最后）」
- **验收角色：** Evaluator（隔离 subagent，署名 `Andy/evaluator-subagent`）
- **验收时间：** 2026-07-21
- **被验收 commit：** `ad4f725`（F005 实装）· `6d56162`（CI linux 基线重生）· 树状态 HEAD `e01424c`
- **专属端口：** 3000（playwright webServer 自拉 standalone，未重建产物）
- **结论：** **PASS**

---

## 1. 逐条 acceptance 对照

| # | acceptance 条款 | 判定 | 实测依据 |
|---|---|---|---|
| 1 | `tests/visual/` 新增 CreatorDrawer 开启态基线（route mock 固定夹具，沿 ARCH-M05 F017 范式） | PASS | 新增 `tests/visual/creator-drawer.spec.ts`（43 行，`ad4f725`）；消费 F017 共用夹具 `mockFonts` + `mockHandoffs` + `SNAPSHOT_OPTS`；基线 `creator-drawer-{darwin,linux}.png` 均在位。肉眼核图：抽屉开启态实拍（PixelHana / 受众画像 donut / 91%·82% 环形 / 内容表现 / dw-foot 双钮），**非空白、非列表页** |
| 2 | 必须配 `waitFor(关键文案)` 硬断言（框架 v1.0.6 §4.3） | PASS | spec `:32-35` 三道守卫：`.chakra-modal__content[aria-label="创作者详情"]` visible + `受众匹配` + `加入某项目匹配`，均 scope 在 `drawer` 内。三处在 `CreatorDrawer.tsx:311/345/690` 各自唯一，只存在于抽屉内部 |
| 3 | **验证方式 = 临时抽掉 mock 数据应硬失败**，不得把空白静默固化为合法基线 | PASS | Evaluator 独立设计等效变异并实测，**守卫处 8s 超时硬失败且零基线写出**；反证探针（去守卫）确实静默写出假基线，且该假基线与 `creators-darwin.png` **MD5 逐位相同**。详见 §2 |
| 4 | F001-F004 全部合入后**单次**重生全部基线（`--update-snapshots=all`） | PASS | 全批次仅 2 个 commit 触碰 `tests/screenshots/baseline/`：`ad4f725`（darwin，位于 F004 `8f5f470` 之后）+ `6d56162`（linux）。无中途多次重生 |
| 5 | linux 基线经 CI 重生 | PASS | `6d56162` 作者 `github-actions[bot]`，来自 `update-visual-baselines.yml`（`workflow_dispatch` run 29833368651，success），该 workflow 跑的正是 `test:visual:update` = `--update-snapshots=all` |
| 6 | 断言阈值维持 ARCH-M05 F017 收紧口径，**不得为让基线过关而放宽** | PASS | `git diff f2a0b84 HEAD -- tests/visual/handoffs-mock.ts` **空**（F017 之后零改动），`maxDiffPixels: 1500` 原封；新 spec `:42` 直接传 `SNAPSHOT_OPTS` 无任何 override；`playwright.config.ts` 无 `expect` 块、本批零改动 |
| 7 | 本地 `test:visual` 全绿 | PASS | 独立连跑 **3 次全部 13/13 passed**（30.2s / 31.7s / 32.4s），无抖动 |
| 8 | CI visual 绿 | PASS | 最新 CI run 29833675719「Visual regression = success」（Lint/Typecheck/Build 同绿）。详见 §3 时序说明 |
| 9 | fe-audit 三脚本无回归（复跑前按 v1.0.6 检测器活性证明自证脚本未死） | PASS | 三脚本 pre-batch↔HEAD 逐项对照无回归；token-scan「0 findings」经注入活性证明。详见 §4 |

---

## 2. 硬断言活性证明（acceptance #3，本报告核心）

### 2.1 手段替换说明（为何不是「临时抽掉 mock 数据」原字面）

acceptance 字面要求「临时抽掉 mock 数据」。Evaluator 铁律禁止改产品代码，且创作者数据源
`src/lib/data/mock/creators` 是**静态模块非 API**，Playwright `route` 拦不到。故采用**运行时等效变异**：

```
CreatorDrawer.tsx:299        if (creator === null) return null;
creators/page.tsx:321-322    <CreatorDrawer creator={selected} ... />   // selected 初始 null
```

「抽掉抽屉数据源」在运行时的**唯一可观测后果** = 抽屉渲染 null、页面只剩创作者列表。
**不点行**（`selected` 恒 null）产生的 DOM 终态与之逐位等价，且零产品代码改动。
两条探针均在 `--update-snapshots`（基线生成模式）下跑 —— 这正是 §4.3 所指的危险场景。
探针源码归档：`/Users/yixingzhou/project/newkolmatrix/docs/test-cases/P2-CLEANUP-F005-liveness-probe.spec.ts`

### 2.2 PROBE-A（守卫在场 + 抽屉未渲染）→ 硬失败 ✅

```
✘  1 PROBE-A 守卫在场 + 抽屉未渲染 → 必须硬失败（不得静默出基线） (8.5s)

    TimeoutError: locator.waitFor: Timeout 8000ms exceeded.
    Call log:
      - waiting for locator('.chakra-modal__content[aria-label="创作者详情"]') to be visible
    > 39 |   await drawer.waitFor({ state: 'visible', timeout: 8_000 });
```

关键：失败发生在 `toHaveScreenshot` **之前**，落盘核验确认

```
$ test -f tests/screenshots/baseline/p2f005-liveness-guarded-darwin.png
NO — 守卫在截图前拦停，未写出任何基线 (GOOD)
```

### 2.3 PROBE-B（守卫移除，其余逐字相同）→ 静默固化假基线 ✅（反证守卫载荷性）

```
✓  2 PROBE-B 守卫移除 + 抽屉未渲染 → 会静默固化假基线（反证守卫载荷性） (2.8s)
A snapshot doesn't exist at .../p2f005-liveness-noguard-darwin.png, writing actual.
```

假基线内容比对 —— **与既有创作者列表页基线逐位相同**：

```
MD5 (p2f005-liveness-noguard-darwin.png) = cbfc745911e45898c5d7f9e08d16065e
MD5 (creators-darwin.png)                = cbfc745911e45898c5d7f9e08d16065e   ← 同一张
MD5 (creator-drawer-darwin.png)          = 9757f85c3ebaeab1f1807089fc5a593c
```

**证毕：** 若无这三道 `waitFor`，F005 交付的所谓「抽屉基线」会是 `creators.png` 的一份逐位副本
——增量覆盖为 0、且永远绿灯。守卫是载荷性的，不是装饰。Generator commit message 中的
活性证明主张经独立手段复现，结论一致。

> 清理：两条探针的临时快照与 `test-results/` 已删除，`git status --short tests/` 无 `M` 行，
> 13 张真实基线零改动。

---

## 3. CI 时序说明（acceptance #8，非缺陷）

F005 commit 当时的 CI run 29833073818「Visual regression = failure」，逐条查日志：

```
Error: A snapshot doesn't exist at .../tests/screenshots/baseline/creator-drawer-linux.png, writing actual.
  1 failed  |  12 passed (31.0s)
```

失败原因是 **linux 基线尚未生成**（新增用例的必然中间态），非画面回归；随后
`update-visual-baselines` workflow（run 29833368651, success）在 CI 重生 linux 基线并 commit
`6d56162`，下一次 CI run 29833675719 四个 job 全 success。**终态 CI visual 绿，acceptance 满足。**
（progress.json `session_notes` 中「两张 linux 基线尚未在 CI 重生」的遗留项，实物核验已闭环。）

---

## 4. fe-audit 三脚本无回归 + 检测器活性证明（acceptance #9）

### 4.1 pre-batch（`8248ab6`，只读 worktree）↔ HEAD 对照

| 脚本 | pre-batch | HEAD | 判定 |
|---|---|---|---|
| `fe-audit-token-scan.mjs` | 0 findings（扫 69 文件） | 0 findings（扫 71 文件） | 无回归（+2 文件 = 本批新增源文件） |
| `fe-audit-dup-scan.sh` | 命中 39 / 涉及 15 文件 | 命中 39 / 涉及 15 文件 | 无回归（逐项相同） |
| `fe-audit-component-matrix.mjs` | used-as-is 6 / forked 5 / dead 79 / never-ported 124 / removed 1 / **self-built 38** | 同前五项 / **self-built 39** | 无回归（+1 = F004 新增 `common/HandoffPanel.tsx`，预期内） |

### 4.2 token-scan「0 findings」活性证明（role-context 硬性要求）

在只读 worktree（**非主树**）注入 2 处硬编码 hex：

```
$ node scripts/test/fe-audit-token-scan.mjs
   [P1] src/components/common/HalfGauge.tsx:43  «#ff00aa»
   [P1] src/components/common/HalfGauge.tsx:44  «#123456»
合计 findings: 2
```

注入 2 → 恰报 2，检测器未死。worktree 已 `git worktree remove --force` 清除，主树零污染。
dup-scan（39）与 matrix（非零多类目）本身输出非零，无需额外活性证明。

---

## 5. 实测命令清单

```bash
npx playwright test --reporter=list                      # ×3 → 13 passed / 13 passed / 13 passed
npx playwright test tests/visual/p2-f005-liveness.probe.spec.ts --update-snapshots
                                                         # PROBE-A failed（守卫）· PROBE-B passed（反证）
md5 tests/screenshots/baseline/{p2f005-liveness-noguard,creators,creator-drawer}-darwin.png
git diff f2a0b84 HEAD -- tests/visual/handoffs-mock.ts   # 空 → 阈值未放宽
git log --oneline 8248ab6..HEAD -- tests/screenshots/baseline/ tests/visual/
gh run view 29833675719 --json jobs                      # Visual regression | success
node scripts/test/fe-audit-token-scan.mjs                # 0 findings（+ 注入 2 → 报 2）
bash  scripts/test/fe-audit-dup-scan.sh                  # 39 / 15，与 pre-batch 相同
node scripts/test/fe-audit-component-matrix.mjs          # self-built 38→39（HandoffPanel）
```

## 6. 结论

**PASS** — 9 条 acceptance 全部满足，无一条依赖 Generator 叙述。

核心风险点（「把空白静默固化为合法基线」）经 Evaluator 独立设计的等效变异实测排除，
并额外取得反证：去掉守卫后产出的假基线与 `creators-darwin.png` **MD5 逐位相同**，
量化坐实了守卫的载荷性。阈值未放宽、重生为批末单次、本地 3 连跑与 CI 终态均绿。

**未执行项：** 无 [L2] 项。本 feature 全部可在 L1 本地闭环。

**留给 Planner 的一条观察（不影响本判定）：** F004 的 `border-dashed` 改动在 linux 侧
1500px 阈值内**未触发** CI 失败（失败前那次 run 中 agent-canvas 属「12 passed」之列），
说明该阈值对细边框类改动不敏感。不属 F005 acceptance 范围，建议记入需求池评估。
