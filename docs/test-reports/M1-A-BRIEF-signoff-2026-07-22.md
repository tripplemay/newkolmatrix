# M1-A-BRIEF Signoff 2026-07-22

> 状态：**终审通过（全批 6/6 PASS）** — 由隔离 evaluator subagent 独立复核后签发
> 触发：reverifying 阶段 F001/F002 复验 PASS，全批 6 条均 PASS，进入 done 前置签收
> 署名：`Andy/evaluator-subagent`（快车道单实例，隔离 fresh context 运行；未继承实现/编排上下文，自行从磁盘取证）
> 验收对象 HEAD：`2e8a8ce18d4494044cdc06d8ab93b7658ff4eabc`

---

## 取证方式（独立，不采信任何转述）

本签收在 fresh context 中运行，全部结论基于以下实物证据，未采信前两轮报告的叙述或 commit message：

1. **磁盘直读**：progress.json / features.json（6 条 acceptance）/ 两轮验收报告 / spec + preimpl-audit（D13-D18）/ evaluator.md + role-context。
2. **git 层取证**：HEAD、`168dba87..HEAD` 全量 diff、逐 commit name-only、工作树 status、测试产物目录 untracked 检查。
3. **运行时复跑**：亲自跑 `npm run test:unit:coverage`、p2:f004（串行 + 4 路并发×2 轮）、p2:f001、p2:f002，全部打当前 HEAD 的 standalone 服务（127.0.0.1:3300，未 build、未重启、未占端口）。
4. **口径反证**：grep architecture.md / package.json / vitest.config.ts 交叉核对 soft-watch 的现时事实。

**环境边界遵守**：未修改任何产品代码（src/ / prisma/ / 配置 / 文档基线）；只新增本 signoff 一个测试报告文件。未执行 build、未重启 3300、未占端口。[L2]（生产写入/计费）未获授权，未执行——本批全部 acceptance 为纯函数 / 本地库 / 探针资产，L1 已足以覆盖。

---

## 全批判定汇总

| Feature | 首轮 | 复验 | 终审 | 我的独立抽验 |
|---|---|---|---|---|
| F001 vitest 地基 + CRA 残留清理 | PARTIAL | PASS | **PASS** | 亲自复跑 CI 覆盖率命令 + 工作树洁净实测 |
| F002 拆 NoSSR 恢复 SSR | PARTIAL | PASS | **PASS** | 亲自复跑 p2:f004 施压 11/11 + 三红线探针 |
| F003 Prisma schema 扩展 + 迁移 + seed | PASS | 沿用 | **PASS** | git diff 证 src/prisma 零改动 → 沿用成立 |
| F004 domain/health.ts | PASS | 沿用 | **PASS** | 零改动 + 单测在覆盖率跑中实绿 |
| F005 domain/env-guards.ts + 变异测试 | PASS | 沿用 | **PASS** | 零改动 + 单测实绿 |
| F006 环节推进写 OperationLog | PASS | 沿用 | **PASS** | 零改动 + 集成测试实绿 |

**全批判定 = PASS（6/6）。**

---

## 逐 feature 判定与抽验证据

### F001 — PASS（原 PARTIAL 缺陷已消除，我亲自复现其消失）

原 PARTIAL 唯一扣分项：vitest 覆盖率产物 `coverage/`（16 文件）入 git 且 `.gitignore` 未登记，导致 acceptance 强制接入 CI 的 `npm run test:unit:coverage` 每跑一次弄脏 8-9 个 tracked 文件。

**我的独立抽验（非采信 reverify 报告）：**
- 跑前 `git status --short` = 空。
- `npm run test:unit:coverage` → **Test Files 6 passed / Tests 109 passed / Lines 98.05%**（门 lines:80 通过）。
- 跑后 `git status --short` = **空（GIT_STATUS_LINES=0）** —— 原缺陷「跑一次弄脏 8-9 个文件」已彻底消失。
- `git ls-files coverage/` = **0**；`.gitignore:27` = `/coverage/`；`git check-ignore coverage/index.html` → exit 0（已忽略）。
- 修复 commit `3aa6be8` 逐文件核对：仅 `.gitignore`(+5) + 16 个 coverage 文件删除 + `tests/unit/repo-hygiene.test.ts`(+60)，**零 src/ / prisma/ / package.json / vitest.config / .github 改动**（`git show --name-only 3aa6be8` 实证）。回归测试位于 `tests/unit/**`（vitest include 内），CI unit job 实跑，缺陷已有守门。

F001 字面 acceptance 首轮已全部 PASS，本轮修复仅动 .gitignore + 测试产物，无回归。判 **PASS**。

### F002 — PASS（p2:f004 竞态已消除，我在原施压条件下复现稳定）

原 PARTIAL 唯一扣分项：p2:f004 探针 readPanel 的卡数竞态——恢复 SSR 后文案锚点进入服务端 HTML，不再隐含「数据到位」，`cardCount>=2` 断言在并发/施压下 ~20-25% 概率误红。

**我的独立抽验：**
- **修复设计核对**（`git diff` p2-cleanup-f004-handoff-panel.mjs）：readPanel 增 `expectCards` 参数，用 `page.waitForFunction({timeout:15000, polling:50})` 轮询 DOM 卡数至落定；**超时被 `catch` 吞掉后仍读真实 DOM 交给断言**——这是「非恒真、可证伪」的关键（数据真不到位时如实报红，而非「等到为止」把断言变成恒真）。生产侧 expectCards=2、夹具侧 expectCards=1。
- **稳定性实测**：串行 3 次 → **15/15 全绿**；**4 路并发 × 2 轮 = 8 次**（正是首轮此条件红 2/8 的施压条件）→ **8/8 全绿**。合计 11/11，无一误红。
- **三条红线探针全绿**（F002 acceptance 明列）：p2:f001 = 12 passed/0；p2:f002 = 14 passed/0；p2:f004 = 稳定绿。
- 修复 commit `1f11836` 仅改 `scripts/test/`（探针 + 回归脚本），`git diff 168dba87..HEAD -- src prisma` 为空。

F002 实质交付（SSR 真恢复、零 hydration 失配、13/13 视觉基线零漂移、深色无闪烁）首轮已 PASS，本轮修复的是探针资产的确定性。判 **PASS**。

### F003/F004/F005/F006 — PASS（结论沿用，前提已由我独立核实）

沿用首轮 PASS 的**唯一前提**是「首轮 PASS 后产品代码零改动」。我独立核实该前提成立：

- **`git diff --name-only 168dba876b0ce496aa2dc03b319aed27a1959424 HEAD -- src prisma` = 空（exit 0）** —— 自首轮验收 HEAD 至今，src/ 与 prisma/ 一字未改。
- `168dba87..HEAD` 之间 4 个 commit 逐个 name-only 核对：`3aa6be8`(F001 fix：.gitignore+coverage+回归测试)、`1f11836`(F002 fix：scripts/test/)、`fa52f86`(状态文件)、`2e8a8ce`(reverify 报告+progress.json)——**无一触及 F003-F006 的产品代码**。
- **活性旁证**：我跑 `npm run test:unit:coverage` 的 109 用例中，health.test（F004）、env-guards（F005）、env-advance 集成测试（F006，打真库）、provenance 均实绿，coverage 覆盖 health.ts 100% / env-guards.ts 96.42% / env-advance.ts 93.75%。domain 层在当前 HEAD 行为正确，非仅「代码未动」的静态推断。

F003-F006 首轮各自的逐条 acceptance 判定（含 schema 实物 psql 核对、seed 77 断言逐字比对 + 变异实证、D12 回滚三路实测、health 三百万样本穷举、env-guards 12/12 变异杀死率、env-advance 原生 SQL 双路读回 + 8 种拒绝零写入）已完整记录于首轮报告，本轮前提成立故沿用。判 **PASS × 4**。

---

## Soft-watch（不阻塞 done，需后续跟进）

> 每条均非 F001-F006 任一字面 acceptance 条目，不改变 PASS 判定；均为低风险记账事项，兜底明确。

| ID | 描述 | 风险等级 | 建议处置（兜底） |
|---|---|---|---|
| S1 | **口径文档反向漂移（brief 明点）**：`architecture.md:1642` §12.6.3 仍写 vitest「未实装，规划态」「当前仓库中不存在」并规定 `vite-tsconfig-paths` + `coverage.include:['src/lib/**']`；`:481` §5.3 仍标游标守卫「未实装」。三点均被 as-built 推翻（我实测：vitest 已装、vite-tsconfig-paths **未**装、include 已收窄至 `src/lib/domain/**`+provenance、env-guards/env-advance 已落地），裁决链 D17/D18 在 preimpl-audit:185/207 完整可溯。 | low | **M1-B 顺手校准** architecture.md §12.6.3 + §5.3 口径与 as-built 对齐（文档更新，非产品改动）。本条自 F001/F005 两轮持续记账，此处正式兜底。 |
| S2 | **canonical seed 未接入生产部署链**：`scripts/deploy/migrate-seed.sh` 自 0c36fc2f 起零改动，只灌 Kol、不跑 `seed:projects`，故 prod 部署后 Project 表为空。 | low | D1「页面接真数据留 M1-B」已覆盖此边界；M1-B 页面接真数据时一并把 `seed:projects` 纳入部署链。 |
| S3 | **seed 写入侧无 zod 运行时校验**：canonical-projects.ts 对 goal 仅 `import type`，写库前不跑 `parseProjectGoal`。当前 4 条数据实测全通过、zod schema 有真实鉴别力（9 组用例 REJECT 生效），无实际风险。 | low | M1-B seed 真实数据时在写库前加运行时 parse 兜底。 |
| S4 | **F006 幂等用例判别力缺口**：`env-advance.test.ts` 幂等夹具为 `maxReached==to`，变异体 M5（raiseMaxReached 取大者→直接赋 to）存活 12/12。真实实现正确（深度回退夹具 f006-maxreached-deep-probe.ts 实测 maxReached 保持不回落）。变异测试是 F005 acceptance 要求、非 F006，故不失分。 | low | M1-B 把 `f006-maxreached-deep-probe.ts` 的深度回退夹具折进正式集成套件。 |
| S5 | **既有欠账（非本批引入）**：`send-outreach.ts:47 ref: projectId` 一列两义，来自 AGENT-FOUNDATION F009（0c36fc2f 已存在）；tsconfig include 不含 `scripts/**` 故 seed 脚本不受 tsc 门（已单独显式 typecheck 0 error）；health.ts→mock/projects.ts 的 `import type` 方向依赖（编译期擦除、无运行时耦合）；「预算消耗率」因子实装为预算效率口径（PRD 未定义单因子公式，属实装裁量已注释）。 | low | 随各自归属批次（M1-B 三态取值收敛 / api envelope 统一）处理，均非当前批次义务。 |

**兜底闭环声明**：以上 5 条 soft-watch 均已明文写定处置去向（M1-B 或对应下游批次），无任何一条为「反正有问题再说」。满足 evaluator.md §14(c)「所有 soft-watch 项有明文兜底机制」，签收闭环。

---

## 回归面结论

- **产品代码零改动**：`168dba87..HEAD` 对 src/ 与 prisma/ 的 diff 为空，F002/F001 的修复全部落在 .gitignore + 测试产物，无产品回归面。
- **测试门全绿**：单测 + 集成 109 用例通过（含 12 条打真库集成测试），覆盖率 Lines 98.05%（门 80%）。首轮已核 CI run 29860371189 unit job success，与 lint/typecheck/build/visual 同级并行。
- **红线探针全绿**：p2:f001=12/0、p2:f002=14/0、p2:f004 施压 11/11。
- **工作树洁净**：全树 `git status --short` = 空；测试产物目录（docs/test-reports/ docs/test-cases/ scripts/test/ tests/）无 untracked 残留。
- **仓库卫生已建守门**：`tests/unit/repo-hygiene.test.ts` 入 CI，对 coverage/ 等产物入库有回归防护（首轮已实证注入缺陷可翻红）。

---

## L2 实测记录

| 项 | 证据 |
|---|---|
| L2 授权 | 未获用户授权，**未执行**。 |
| 适用性 | 本批全部 acceptance 为纯函数（health / env-guards）/ 本地库操作（schema/seed/env-advance）/ 探针资产（p2 红线）。生产 `https://newkol.guangai.ai` 仍跑上一批次 0c36fc2f，M1-A 尚未部署，无线上写入面可验。L1 已足以覆盖全部 acceptance。 |
| 回滚安全（F003 D12） | 首轮已在本地以「0c36fc2f 旧 client × 新 schema」+「旧 migrations 目录打新库 migrate deploy」+「旧 client 写入探针」三路等价实测覆盖，无需 L2。 |

---

## Ops 副作用记录

本批次无生产/staging 数据库 ops。本地 dev 库仅由 seed 重跑恢复为 4 项目 / 4 游戏（首轮 evaluator 操作，已记录并复原）；本签收未对任何数据库执行写操作。

---

## Harness 说明

本批经 Harness 状态机完整流程（planning → building → verifying → fixing → reverifying → 终审签收）交付，快车道单会话、Evaluator 以隔离 subagent 运行。

**本 signoff 由终审 evaluator 独立签发，判定 = 全批 PASS。** progress.json 的 `status` 由编排者按本结论置 `done`、`docs.signoff` 填本文件路径——状态流转不由 Evaluator 执行，结论原样落盘不得改写、软化。

---

## Framework Learnings

本批次 framework learnings 已由前序 evaluator 记入 `framework/proposed-learnings.md`（3 条：勘查审查面按目录而非按症状划 · 探针代理前提随架构变更失效 · 覆盖率门 include 不可大于批次范围），由 Planner 在 done 阶段与用户确认。终审无新增 framework learnings。
