# M1-B-BRIEF 验收分报告 — F004 页面守卫前端半边（selectEnv + rail + toast 拦截）

- **验收人：** Andy/evaluator-subagent（隔离 fresh context）
- **日期：** 2026-07-22
- **被测版本：** main HEAD `126b410`（F004 实现 commit `2e212f1`）
- **环境：** 本地 standalone `http://127.0.0.1:3000`（126b410 构建产物，testing-env-patterns §7）+ dev DB（容器 newkolmatrix-dev-db，四 canonical 项目已 seed）
- **结论：PASS**（acceptance 7 项全过，两视口实测 26/26 断言绿）

---

## 1. 逐条 acceptance 判定

### 1.1 selectEnv 加 canEnter 拦截：放行则切换，拒绝则不切并弹 toast（复用 useToast）— PASS

**代码证据：** `src/components/project/ProjectDetail.tsx:112-131` — `selectEnv(next)` 在 `project` 非空时调 `canEnter({cur, maxReached, goal}, next)`（import 自 `lib/domain/env-guards`）；`!verdict.allowed` → `toast(ENV_GUARD_MESSAGE[...])` + `return`（不 `setEnv`、不 `router.replace`）；放行才 `setEnv(next)` + URL 同步。`useToast` import 自 `components/common/Toast`（`:32`），creators 页先例确认（`src/app/admin/creators/page.tsx` 已用 useToast）。

**实测证据：** 探针 `scripts/test/m1b-f004-guard-probe.mjs` 于 lc 项目（seed 快照 cur=match / maxReached=match → reach/delivery/insight 未解锁）：
- 点未解锁「触达谈判」→ toast 弹出、URL 未变 `?env=reach`、active rail 仍=创作者匹配（落地面未切）；「复盘洞察」同拦
- 点已解锁「目标 Brief」（回看）→ 正常切换 + URL `?env=brief`；切回「创作者匹配」→ `?env=match`
- toast 2.4s 自动收起（Toast 单例契约）

### 1.2 【D4】rail 未解锁环节仍可点（不 disabled），点后由 canEnter 判定 — PASS

**代码证据：** rail 按钮（`ProjectDetail.tsx:201-249`）无任何 `disabled` 属性，`onClick={() => selectEnv(s)}` 统一走拦截。
**实测证据：** 两视口各断言 `button[aria-pressed]` 共 5 个、`isDisabled()` 全 false（n=5, disabled=0）。

### 1.3 【D5】maxReached 数据源 = RSC 直读 DB，不给 MockProject 加字段 — PASS

**代码证据：** `src/app/admin/campaigns/[id]/page.tsx:61` — `maxReached: row.maxReached`（prisma.project.findFirst 直读行）+ `:62` `goal`（parseProjectGoal 产物）一并入 `ProjectDetailData` prop。
**grep 实证：** `grep -rn "maxReached" src/lib/data/mock/` = **0 命中**——MockProject 未加字段。

### 1.4 reason → 文案映射：EnvGuardReason 字面量联合在展示层映射，映射表落展示层单点 — PASS

**代码证据：** 新建 `src/lib/display/env-guard-messages.ts` — `ENV_GUARD_MESSAGE: Record<EnvGuardReason, string>` 全量覆盖 5 个字面量（STAGE_NOT_UNLOCKED / BRIEF_GOAL_NOT_CONFIRMED / DEPENDENCY_NOT_IMPLEMENTED / ALREADY_AT_FINAL_STAGE / INVARIANT_VIOLATED）；`Record` 全量类型使新增 reason 时 tsc 报错防漏配。
**单点实证：** `ENV_GUARD_MESSAGE` 全仓仅定义 1 处、消费 1 处（ProjectDetail.tsx:124）；中文文案串（如「该环节尚未解锁」）在 src/ 无第二份副本（唯一额外命中是 env-guards.ts:25 的 JSDoc 注释，非运行时文案）。domain 层保持无 i18n 耦合。
**实测证据：** 拦截 toast 文案逐字 = `STAGE_NOT_UNLOCKED` 映射「该环节尚未解锁，项目推进到此处后即可进入」（两视口各 1 断言）。

### 1.5 服务端硬闸（canAdvance）未被前端改动削弱 — PASS

**git 实证：** `git diff --name-only e946b49^..126b410 -- src/lib/domain/env-guards.ts src/lib/domain/env-advance.ts src/app/api/` = **空**（整个 M1-B 批次零改动）；两文件最后触碰 commit = M1-A 的 `e12421c`。F004 commit `2e212f1` 足迹仅 4 文件（ProjectDetail.tsx +23 / env-guard-messages.ts 新建 +17 / 状态文件 ×2）。
**回归实证：** `npx vitest run tests/unit/env-guards.test.ts tests/unit/env-guards.evaluator-probe.test.ts` → **40/40 passed**（domain 守卫逻辑无回归）。

### 1.6 未解锁环节点击被拦截弹 toast 须两视口实测 — PASS

`scripts/test/m1b-f004-guard-probe.mjs`（Evaluator 产物，playwright chromium）：
- **desktop 1512×982：13/13 断言过**
- **mobile 390×844：13/13 断言过**
- 覆盖：初始落 cur 环节 / rail 不 disabled / 未解锁拦截 ×2（toast+文案+URL 不变+面不切）/ toast 自动收 / 回看放行 / 切回放行 / 深链 `?env=reach` 直达（D4 设计：深链不拦，URL 即状态契约，session_notes 已记录非漏拦）/ D2 降级态（DB 无此行，project=null）自由切换无 toast 不抛错 / 零 pageerror

### 1.7 lint + tsc 绿 — PASS

- `npx prisma generate` → `npx tsc --noEmit` exit=0（L1 前置按 testing-env-patterns §3）
- `npx next lint` → `✔ No ESLint warnings or errors`（0 error / 0 warning，无 lint 处理矩阵触发）

---

## 2. 复现步骤

```bash
# 前置：standalone 已起 :3000（126b410 构建）、dev DB up、npm run seed:projects 已灌
node scripts/test/m1b-f004-guard-probe.mjs        # 两视口 26 断言，期望全绿 exit 0
npx vitest run tests/unit/env-guards.test.ts tests/unit/env-guards.evaluator-probe.test.ts
git diff --name-only e946b49^..126b410 -- src/lib/domain/env-guards.ts src/lib/domain/env-advance.ts src/app/api/   # 期望空输出
grep -rn "maxReached" src/lib/data/mock/           # 期望 0 命中
```

## 3. 备注（非缺陷）

- canEnter 运行时仅产出 STAGE_NOT_UNLOCKED / INVARIANT_VIOLATED 两种拒绝；其余 3 个 reason 是 canAdvance（服务端推进闸）语义，映射表按 Record 全量覆盖是类型完备性要求（新增 reason tsc 防漏配），符合 acceptance「映射文案齐全」。
- 深链 `?env=` 不拦为 D4 设计（spec 字面只拦 selectEnv/rail 点击，URL 即状态契约不变），实测 f007 语义深链探针路径无回归。
- `env-advance.ts` 的 `advanceStage` 当前唯一消费者为 `tests/integration/env-advance.test.ts`（M1-A as-built：推进写路径尚无 UI 入口）——「硬闸未削弱」以批内零改动 + 单测 40/40 判定，符合 acceptance「M1-A 已建，本批不碰」口径。
- 新增测试产物：`scripts/test/m1b-f004-guard-probe.mjs`（可复用于 M1-C 列表页接守卫时的回归）。
