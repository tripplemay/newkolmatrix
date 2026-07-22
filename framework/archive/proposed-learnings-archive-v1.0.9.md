# proposed-learnings 归档 v1.0.9（2026-07-22 用户逐条 Accept）

## [2026-07-21] Generator/主实例 — 来源：M1-B-BRIEF F006 实装期发现 spec 勘查遗漏

**类型：** 新坑（勘查方法学反面新证）

**内容：** F006 spec 断言 image/ 「除两处 f003 harness 外零引用」，实装期 grep 发现第三处：`p2-cleanup-f003-avatar-colormode.mjs` 硬读该文件且接 npm script、被就绪回归口径点名。根因=勘查时按「f003」字面 grep 划面，漏掉按「image/」**路径语义** grep 才命中的探针。与 audit-methodology §2.1「按语义划勘查面」同源——删除类 feature 的勘查面必须以**被删路径**为 needle 全仓 grep（含 scripts/、package.json scripts、CI yml），不能只以历史批次名为 needle。裁决记录：docs/specs/M1-B-BRIEF-f006-p2probe-audit.md。

**建议写入：** `framework/patterns/audit-methodology.md` §2.1 反面案例补一句

**状态：** 待确认

## [2026-07-22] Generator/主实例 — 来源：M1-C F001 构建期静态化冻结数据 + CI watch 盯错 run

**类型：** 新坑 ×2

**内容①：** RSC 直读 DB 的页面若无 dynamic API（params/searchParams/cookies），Next 默认构建期静态预渲染——prisma 查询在 build 时执行、数据冻结进 HTML，运行时不再读库；CI Build job（无 DB）则直接 prerender error 红灯。任何「RSC 直读 DB」的 feature，acceptance 应强制 `export const dynamic = 'force-dynamic'` + 「运行时改→验→复原」实证（构建期快照与运行时直读在 curl 上不可分辨——M1-C F001 的首轮 SSR 实测被快照骗过）。M1-B [id] 页因 await searchParams 天然动态而未暴露此坑。

**内容②：** push 后 `gh run list --limit 1` 取最新 run 可能抓到同 SHA 的其他 workflow（Build&Push），导致 CI 红灯漏看两个 feature（F001/F002 的 Build failure 被 exit 0 的错对象掩盖）。CI watch 必须 `--workflow CI` 过滤。宜机制化：`.claude/` hook 或脚本封装。

**建议写入：** `framework/patterns/web-runtime-patterns.md` 新增 §（RSC+DB 页面 force-dynamic）；`framework/harness/generator.md` §4.5 CI 检查命令修订（--workflow 过滤）

**状态：** 待确认

## [2026-07-22] Generator/主实例 — 来源：M1-C F005 首轮 PARTIAL（收敛声明失实被 Evaluator 像素取证抓获）

**类型：** 新坑（收敛类 feature 的声明纪律）

**内容：** tone 收敛声明「浅色基线零漂移」时只核对了 canonical 与 today 版一致，未比对 campaigns 版原值（实际 red-500 vs red-600 不同）——720px 实变被 1500px 容忍带借绿，首轮验收 PARTIAL。规律：**收敛/去重类 feature 声明「零漂移/等价」前，必须逐字 diff 全部被收敛副本与 canonical 的差异**（`git show <pre>:<file>` 逐份比对），任一副本与 canonical 有差即为意图变更 → 按 D-I 重生基线并对账，不得凭「取自其中一份」推定全体等价。这是 v1.0.8「容忍带借绿」坑的上游变体：借绿的根源不是没重生，而是没发现需要重生。

**建议写入：** `framework/patterns/web-runtime-patterns.md` §4.2 补充段

**状态：** 待确认
