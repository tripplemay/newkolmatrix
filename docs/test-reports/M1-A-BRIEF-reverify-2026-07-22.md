# M1-A-BRIEF 复验报告（reverify-1）

> 编排：2 个隔离 evaluator subagent 各复验一条上轮 PARTIAL 的修复。
> 本文件由编排者**机械转录** subagent 的结构化返回，未改写、未筛选、未软化。
> 待验 HEAD `fa52f861` · 上轮验收 HEAD `168dba87`。
> F003-F006 上轮已 PASS 且本轮 `git diff 168dba87 HEAD -- src prisma` 为空，结论沿用未重验。

## 判定汇总

| Feature | 上轮 | 本轮 | 原缺陷消除 |
|---|---|---|---|
| F001 | PARTIAL | **PASS** | True |
| F002 | PARTIAL | **PASS** | True |
| F003 | PASS | PASS（沿用） | — |
| F004 | PASS | PASS（沿用） | — |
| F005 | PASS | PASS（沿用） | — |
| F006 | PASS | PASS（沿用） | — |

---

## F001 — PASS（原缺陷消除：True）

### 结论

上一轮 F001 判 PARTIAL 的唯一缺陷——vitest 覆盖率产物 coverage/（16 个文件）被提交进 git 且 .gitignore 未登记，导致 acceptance 要求接入 CI 的 `npm run test:unit:coverage` 每跑一次弄脏 8-9 个 tracked 文件、并在仓内留下会过期的假覆盖率快照——本轮已真正消除。我亲自复现了缺陷的消失：干净树上跑该 CI 命令后 git status 仍完全干净，0 个 tracked 文件被弄脏，coverage/ 虽在磁盘重生但全部被忽略。git ls-files coverage/ 现为 0；/coverage/ 已登记于 .gitignore:27；git check-ignore coverage/index.html 返回 exit 0。新增回归测试 tests/unit/repo-hygiene.test.ts 经实测确有检测力（非恒真）：基线 6/6 绿，我在隔离 worktree 中注入原缺陷（git add -f coverage + 摘掉 /coverage/ 条目）后精确翻红——6 条中恰好 2 条 coverage 断言失败，其余 4 条 test-results/playwright-report 断言保持绿。修复 commit 3aa6be8 只改 .gitignore + 删 coverage + 加回归测试，零产品代码/构建配置改动，F001 上一轮已 PASS 的字面 acceptance 无回归风险。该测试位于 tests/unit/**（vitest include 内），CI unit job 实跑，缺陷在 CI 有守门。原缺陷已消除且未引入新问题，判 PASS。

### 复现步骤

```
【原缺陷消失复现，主 worktree，非破坏性——coverage/ 现已 gitignore】
1. cd /Users/yixingzhou/project/newkolmatrix; set -a; source .env; set +a
2. git status --short → 空（干净）
3. npm run test:unit:coverage → Test Files 6 passed / Tests 109 passed / Lines 98.05%（门 lines:80 通过）
4. git status --short → 空（0 个 tracked 文件被弄脏；对比原 PARTIAL 弄脏 8-9 个）
5. ls coverage/ → base.css/clover.xml/... 磁盘重生；git ls-files coverage/ | wc -l → 0
6. git check-ignore coverage/index.html coverage/clover.xml coverage/base.css → 全部 exit 0（已忽略）
7. grep -n '/coverage/' .gitignore → 27:/coverage/
8. git rev-parse HEAD → fa52f861（未变）

【回归测试检测力实证——隔离 worktree，不碰共享主树】
9. git worktree add --detach <scratch>/hygiene-wt HEAD; ln -s <main>/node_modules <wt>/node_modules
10. 基线：<wt> 内 npx vitest run tests/unit/repo-hygiene.test.ts → 6 passed
11. 注入缺陷：<wt> 内 mkdir coverage、写 index.html/base.css/coverage-final.json；grep -v '^/coverage/$' 剔除 .gitignore 中 /coverage/ 行；git add -f coverage（worktree 独立 index）→ ls-files coverage=3、check-ignore exit=1
12. <wt> 内重跑该测试 → Tests 2 failed | 4 passed；失败正是「coverage/ 无 git 跟踪文件」与「coverage/ 已被 .gitignore 登记」两条，另 4 条 test-results/playwright-report 断言保持绿
13. 清理：rm 符号链接、git worktree remove --force、git worktree prune
14. 复核主树未被污染：git status --short 空 / .gitignore:27 /coverage/ 完好 / ls-files coverage=0 / HEAD 未变 / worktree list 仅剩主树

【修复范围核验】
15. git show --name-only 3aa6be8 → 仅 .gitignore(+5) + 16 个 coverage 文件删除(-3354) + tests/unit/repo-hygiene.test.ts(+60)；grep 产品路径(src/|prisma/|package.json|vitest.config|tsconfig|.github/) → 零命中
16. grep include vitest.config.ts:42 → include:['tests/unit/**/*.test.ts', ...] → 回归测试在 CI 覆盖范围内
```

### 回归检查

F001 相关既有回归全绿（p2 探针/视觉基线属 F002 范畴，本轮 F001 不涉）：(1) 全量单测+集成 `npm run test:unit:coverage` → 6 test files / 109 tests passed，覆盖率门 lines:80 在 98.05% 通过；(2) 新增回归测试 tests/unit/repo-hygiene.test.ts 基线 6/6 pass 且在注入缺陷下精确翻红 2/6，已入 vitest include，CI unit job 实跑；(3) 仓库卫生实测：跑完 CI 覆盖率命令后 git status --short 保持空，git ls-files coverage/=0。修复 commit 零产品代码改动，F001 上轮已 PASS 的字面 acceptance 条目无回归。未 build、未重启 3300 服务、未占端口；仅在 scratchpad 建/删隔离 worktree + 跑 vitest。

### 新发现

无（本轮无新发现的问题）。仅重申上一轮已记录的一条不扣分 soft-watch，状态未变、不属 F001 acceptance、不阻断：docs/dev/architecture.md §12.6.3（约 :1642-1660）仍写 vitest「未装/规划态」且仍规定 vite-tsconfig-paths + coverage.include:['src/lib/**']，均已被 D18/D17 推翻且实物落地，口径文档滞后于 as-built，建议 M1-B 顺手校准。

### 证据

HEAD=fa52f8619b2277e578d3a6e1bbd5b77a5bd062ad。F001 修复 commit=3aa6be8。关键实测输出：npm run test:unit:coverage 后 git status --short 空、git ls-files coverage/=0、check-ignore coverage/index.html exit 0；隔离 worktree 注入缺陷后 repo-hygiene.test.ts 报「coverage/ 下有 3 个文件被 git 跟踪... expected [...] to deeply equal []」与「coverage/index.html 未被 .gitignore 忽略... expected false to be true」两条精确失败，其余 4 断言绿。相关文件（绝对路径）：/Users/yixingzhou/project/newkolmatrix/.gitignore（:27 /coverage/）、/Users/yixingzhou/project/newkolmatrix/tests/unit/repo-hygiene.test.ts、/Users/yixingzhou/project/newkolmatrix/vitest.config.ts（:42 include）。上一轮 F001 PARTIAL 全文见 /Users/yixingzhou/project/newkolmatrix/docs/test-reports/M1-A-BRIEF-verify-fanout-2026-07-22.md。

---

## F002 — PASS（原缺陷消除：True）

### 结论

上一轮 F002 判 PARTIAL 的唯一缺陷——p2:f004 探针 readPanel 的卡数竞态（拆 NoSSR 恢复 SSR 后文案锚点进入服务端 HTML，不再隐含「hydration 完成、数据到位」，读数落在 1 卡中间态，「A 生产侧多卡路径仍在 cardCount>=2」在并发/CPU 施压下 ~20-25% 概率误红）——本轮已真正消除。修复（commit 1f11836，纯测试产物）给 readPanel 增 expectCards，用 page.waitForFunction({timeout:15000,polling:50}) 轮询 DOM 卡数到落定；关键分寸是超时被 catch 吞掉后仍读真实 DOM 交给断言，因此不是恒真断言。三条判据我亲自实测全部成立：(1) 原缺陷消失——上轮红 2/8 的同一 4 路并发×2 轮条件下实测 8/8 绿，6 路并发×3 轮 18/18 绿，回归脚本 4x CPU 节流下 NEW 读法 8/8 稳定 vs OLD 8/8 踩中间态，共 27/27 施压运行全绿；(2) 未矫枉过正——临时 route 拦截 /api/handoffs 使其永不返回（hang）/返回空列表（empty），readPanel 在 15002ms 超时后读到 cardCount=1，临界断言如实报红，总耗时 16043ms 有限（非无限挂死、非误绿），证明是可证伪断言而非「等到为止」的恒真；(3) 回归证据脚本如声称——默认 4x 节流 OLD 8/8 踩中间态、NEW 8/8 稳定、产品恒 settled=2，且区分力自检真实有效：THROTTLE=1 无节流时 OLD 未踩中，脚本判「无区分力」并 exit 1，不会给假绿。无新问题：姊妹红线探针 p2:f001=12/0、p2:f002=14/0 完好；F002 修复 commit 仅动 scripts/test/（探针+回归脚本），全轮零 src/ 与 prisma/ 改动；工作树干净。原缺陷已消除且未引入新问题，判 PASS。

### 复现步骤

```
环境 HEAD=fa52f86（reverifying 待验版本），standalone 服务在 127.0.0.1:3300，export BASE=http://127.0.0.1:3300。
【1 原缺陷消除】
- 基线：node scripts/test/p2-cleanup-f004-handoff-panel.mjs → 15 passed, 0 failed。
- 4 并发×2 轮（上轮此条件红 2/8）：8 个进程全部 15 passed/0 failed，「A 生产侧多卡路径仍在」8/8 ✓。
- 6 并发×3 轮：18 个进程全部 15 passed/0 failed。
- node scripts/test/m1a-f002-p2f004-race-regression.mjs（4x CPU 节流×8 轮）→ OLD 卡数序列[1,1,1,1,1,1,1,1] 不足 8/8；NEW[2,2,2,2,2,2,2,2] 不足 0/8；「修复前可复现竞态：是 修复后稳定：是 ✓ 对照成立」，REGRESSION_EXIT=0。
【2 非恒真验证】scratchpad/f002/tautology-check.mjs 逐字复制 shipped readPanel 逻辑 + page.route 拦截 /api/handoffs：
- MODE=hang（永不返回）：readPanel cardCount=1 waitMs=15002 timedOut=true，total elapsed=16043ms，临界断言 FAIL(red)，EXIT=0（NON-TAUTOLOGY）。
- MODE=empty（返回空列表）：cardCount=1 waitMs=15005 timedOut=true，total elapsed=15897ms，断言 FAIL(red)。
  → 数据真不到位时探针报红而非挂死/误绿。
【3 区分力自检】THROTTLE=1 ROUNDS=6 node scripts/test/m1a-f002-p2f004-race-regression.mjs → OLD[2,2,2,2,2,2] 不足 0/6，脚本打印「✗ 旧做法未踩中中间态…该结论无区分力」，REAL_EXIT=1（自检真实，不给假绿）。
【无新问题】node scripts/test/p2-cleanup-f001-drawer-close.mjs → 12 passed/0；node scripts/test/p2-cleanup-f002-colormode-persist.mjs → 14 passed/0。git diff --name-only 168dba87 HEAD -- src/ prisma/ → 空。git status --short → 空（未污染仓库）。
```

### 回归检查

跑了 F002 相关既有回归：p2:f001=12 passed/0 failed、p2:f002=14 passed/0 failed（红线三探针中另两条完好）；p2:f004 在 4 并发×2 轮 + 6 并发×3 轮共 26 次施压运行全部 15/0，加基线 27/27 绿。产品行为对照恒正确（回归脚本每轮 settled=2）。修复隔离性已证：F002 fix commit 1f11836 仅改 scripts/test/p2-cleanup-f004-handoff-panel.mjs 与新增 scripts/test/m1a-f002-p2f004-race-regression.mjs，全轮 168dba87..HEAD 零 src/ 与 prisma/ 改动，工作树干净。未 build、未重启 3300、未占端口，未干扰并发 F001 evaluator。

### 新发现

无。修复干净、隔离、可证伪，未观察到任何残留竞态或新引入问题。（范围说明：本轮仅复验 F002；F001 由并发 evaluator 复验，故未改动状态文件、未写 signoff——全 PASS 门槛不由我单独判定。）
