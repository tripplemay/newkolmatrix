# M5-DEPLOY-FIX Signoff 2026-08-06

> 状态：**验收通过（PASS）** — 首轮 verifying，零 fixing 轮次
> 被测 SHA：`312eb9a`（实现提交 `5a5648c`）
> 验收者：隔离 Evaluator subagent（fresh context，未继承实现过程对话）
> 判据：`features.json` F001 的 acceptance（本批为 bug 修复批次，无 spec，acceptance 即唯一判据）

---

## 0. 验收方法声明

本报告每一条结论都有一条自跑命令作依据。**未采信编排者转述、未采信 commit message 的任何叙述**——
commit 正文中的变异证活、compose 自证、L1 结果全部由本次验收**独立重跑一遍**；
其中「鉴别力」一项刻意**换用作者未使用的写法**重做，以区分「真通用断言」与「只对今天这一个键有效的白名单」。

边界遵守：未修改任何产品代码 / compose / 文档基线；未连接或操作 VPS；未执行任何部署动作。
产出物仅 `docs/test-reports/` 与 `scripts/test/`。L2（真实外部服务 / 生产写入）未授权，未执行。

---

## 1. 缺陷本体复核（先确认「修的是不是真问题」）

| 断言 | 机械依据 | 结论 |
|---|---|---|
| `resolveAuthSecret` 在 production 缺键抛错、不回落 | `src/lib/auth/config.ts:32-40` 实读 | 成立 |
| middleware 在模块作用域调它 | `src/middleware.ts:34-37` 实读 | 成立 |
| matcher 会拦 `/api/health`（healthcheck 端点） | 取 `src/middleware.ts:54` 的 matcher 正则实跑：`/api/health` → **被拦**；`/img/logo.png`、`/_next/static/x.js` → 放行 | 成立 |
| 故障链 = 每请求 500 → healthcheck 永不转绿 → `up -d --wait` 超时 | 上三条 + `.github/workflows/deploy-prod.yml:56-61` | 成立 |

**缺陷是真的、且是阻断级**。生产当前健康（跑 M4.8），缺陷在部署动手前被拦下，未造成事故。

---

## 2. Acceptance 逐项判定

### ① compose 必填插值形态 — **PASS**

`docker-compose.prod.yml:78`：`- AUTH_SECRET=${AUTH_SECRET:?AUTH_SECRET 必填（放 /opt/apps/newkolmatrix/.env，用 openssl rand -base64 32 生成）}`
形态与既有 `AIGCGATEWAY_API_KEY` / `APIFY_KOL_API_KEY` 同款（`:?` 而非 `:-`）。

**不只读文本，实测三种调用面**（临时 dummy env 文件，无任何真密钥，已删）：

| 实测 | 结果 |
|---|---|
| `docker compose --env-file <含 AUTH_SECRET> config` | exit=0，输出 `AUTH_SECRET: dummy-auth-secret-XYZ` |
| `docker compose --env-file <摘掉 AUTH_SECRET> config` | **exit=1**，`error while interpolating services.app.environment.[]: required variable AUTH_SECRET is missing a value: AUTH_SECRET 必填（...）` |
| `docker compose --dry-run --env-file <摘掉> up -d --wait` | **同一插值错误，在任何容器动作之前中止** |
| `docker compose --dry-run --env-file <摘掉> pull` | **同一插值错误，同样在动作前中止** |

> 后两行**补齐了实现方明确标注的「未核」项**（commit 正文与 deploy.md 都诚实写了「`up` 未单独实测」）。
> 现已实测：`pull` 与 `up` 与 `config` 走同一份解析，缺键在**解析阶段**中止。
> 这一点对部署安全至关重要——deploy 工作流第 1 步就是 `$COMPOSE pull`（`set -euo pipefail`），
> 故缺键时脚本在 **recreate 任何容器之前**失败，旧容器（`restart: unless-stopped`）原样继续跑。
> 失败模式 = 「部署中止 + 报错信息精确」，而非「生产被打下线」。

### ② 机械断言（vitest 收集范围内，键名不硬编码） — **PASS**

`tests/unit/deploy-env-passthrough.test.ts`（346 行，AST 扫描）。收集范围已核：
`vitest.config.ts` → `include: ['tests/unit/**/*.test.ts', ...]` ✓；
CI 真执行已核：`ci.yml` 跑 `npm run test:unit:coverage` = `vitest run --coverage`（全量），
且 `docker-compose.prod.yml` / `tests/**` **均不在 `paths-ignore` 内** → 这条边确已挪进 CI 执行面。

本地实跑：**9 passed (9)**。

**验活用例真实存在且有效**（防「扫描器死了 → 无键可查的假绿」）：
扫描器验活（须命中 AUTH_SECRET 且来源含 `src/lib/auth/config.ts`）+ compose 解析验活（须解出 NODE_ENV / DATABASE_URL / AIGCGATEWAY_API_KEY）+ 解析失败即 `throw`（不返回空 Map）。

### ③ 鉴别力：是通用断言还是白名单？ — **PASS（有 3 处已量出的盲区，见 §4）**

**这是本批最要紧的一条，故用作者未使用的 8 种写法各做一次变异**（每次：写探针 → 全跑 → 删除 → `git status src/` 验干净）：

| # | 写法（刻意与作者的 ②a/②b 不同） | 是否翻红 | 是否点名键 + 来源文件 |
|---|---|---|---|
| p1 | **解构赋值** `const { PROBE_ALPHA_SECRET } = process.env` | ✅ 红 2 条 | ✅ 点名键与文件 |
| p2 | **模板字符串键** ``process.env[`PROBE_BRAVO_TOKEN`]`` | ✅ 红 2 条 | ✅ |
| p3 | **类字段初始化** `class C { private readonly key = process.env.PROBE_CHARLIE_KEY }` | ✅ 红 2 条 | ✅ |
| p6 | **`.tsx` 文件内** fail-fast | ✅ 红 2 条 | ✅ |
| p4 | **动态键** `const NAME='...'; process.env[NAME]` | ❌ 漏 | — |
| p5 | **反向判据** `if (env.NODE_ENV !== 'production') return fallback; throw ...` | ❌ 漏 | — |
| p7 | **helper 判 production** `if (isProd()) throw ...` | ❌ 漏 | — |
| p8 | 同文件「1 个 fail-fast 键 + 2 个带默认值的可选键」 | ⚠️ 红 6 条（连带） | 见 §4-S2 |

**结论：不是白名单式假断言。** 键名不硬编码，对**将来新增**的同类键在 4 种作者从未测过的写法下均能翻红，
且失败信息同时点名「键名 + 来源文件 + 修法 + 逃生口」。3 处漏检是判据边界，性质见 §4。

**独立交叉验证（第二实现）：** 另写 `scripts/test/m5-deploy-fix-env-census.mjs`（正则口径，非 AST，
**不复用被测代码**）普查 src/ 全部 env 读取：25 个键；严格判据命中 **4 个 = AUTH_SECRET、
DEV_TEST_USER_EMAIL、DEV_TEST_USER_PASSWORD、RESEND_API_KEY**——与被测断言的命中集**完全一致**；
放宽到「文件含 production 字样 + throw」的宽判据，**额外命中 0 个**。
即：今日实物上，被测判据**没有漏掉任何一个活体 fail-fast 键**，§4 的盲区是将来风险而非当前缺口。

### ④ 三张例外清单：各带真断言 + 理由与实物一致 — **PASS**

| 清单 | 断言（非跳过） | 变异证活（本次自跑） | 理由 vs 实物核对 |
|---|---|---|---|
| `COMPOSE_LITERAL` = NODE_ENV | 断言 compose 写死 `production` | 改成 `${NODE_ENV:-production}` → **红 1** | `docker-compose.prod.yml:48` 确为字面值 ✓ |
| `PROD_FORBIDDEN` = DEV_TEST_USER_EMAIL/PASSWORD | 断言**不出现在** compose 全文 | 往 compose 塞入该键 → **红 1** | `src/lib/auth/dev-seed.ts:24-32` `assertDevSeedAllowed` 在 production **一律抛错、无 escape hatch** ✓；「prod seed 不建」已去实物核：调用方只有 `scripts/seed/dev-user.ts`，而 prod migrate 服务入口 `scripts/deploy/migrate-seed.sh` 只跑 `prisma migrate deploy` + `import-kol-csv.ts` + `canonical-projects.ts`，**不含 dev-user** ✓ |
| `OPTIONAL_BY_DESIGN` = RESEND_API_KEY | 断言**仍须透传**，只放宽形态 | 删掉该键透传行 → **红 1** | `src/lib/ops/email/index.ts:15-27` 三分支：缺 key + production → **发送时刻抛错拒发**（非模块加载期）✓ 故 `:-` 正确，M3-A 既定语义未被误伤 |
| 防腐用例 | 清单条目须仍在 fail-fast 面上 | 复制一份测试并塞入过期键 `LEGACY_GONE_KEY` → **红 2**（含防腐用例点名该键） | — |

三张清单**均非白名单式豁免**：每张都把「豁免」转成了一条方向相反的正向约束。

### ⑤ 变异证活 ①②③（acceptance 明列） — **PASS（全部独立重跑复现）**

| acceptance 要求 | 自跑结果 |
|---|---|
| ① 从 compose 删掉 AUTH_SECRET 行 → 新断言红 | **红 2**（透传 + 形态），还原后 9/9 绿 |
| ② src/ 加 production fail-fast 新键不透传 → 红并点名 | **红 2**，用例名含键名与来源文件（4 种写法各复现一次，见 §2-③） |
| ③ `:?` 改 `:-` → 形态断言红 | **只红 1**（形态用例），透传用例仍绿 → **鉴别力方向正确**（区分「没透传」与「透传了但形态弱」） |

compose 变异后已还原，`git hash-object docker-compose.prod.yml` 前后同为 `47697d7a...`，`git status` 干净。

### ⑥ deploy.md 同步与 compose 实物一致 — **PASS**

`docs/dev/deploy.md:115-136` diff 核对：
- 缺键表现的描述（「compose 解析阶段当场报错并中止」）与 §2-① 实测一致 ✓
- 第 5 步改为「**先同步 compose 再部署**」并点明「只更新 .env 不更新 compose = 容器里没这个变量」——
  这正是本缺陷的操作面根因，写对了 ✓
- 文档**主动标注**「`up` 读同一份文件走同一插值解析，**但未单独实测**」——诚实标注未核项，
  符合铁律 13。本次验收已补测（§2-①），该标注可在后续批次回填为已实测。
- 全文 `grep AUTH_SECRET` 无残留的旧口径（「容器崩」类表述已被替换）✓

> 备注（非缺陷）：文档里逐字的 `docker compose -f docker-compose.prod.yml config` 在**本仓库根**执行会先撞
> `POSTGRES_PASSWORD` 缺失（仓库 `.env` 是 dev 用途，无生产键）。文档语境是 VPS 部署目录（`.env` 齐全），
> 在该语境下复现的正是文档所写的 AUTH_SECRET 错误——我用「全量 env 摘掉 AUTH_SECRET」的方式复现验证，一致。

### ⑦ L1：tsc / lint / 全量 vitest — **PASS（独立重跑）**

| 项 | 自跑结果 |
|---|---|
| `npx tsc --noEmit` | **exit=0** |
| `npx next lint` | **✔ No ESLint warnings or errors** |
| `npx vitest run`（全量） | **142 files passed / 1809 tests passed**，22.77s |

L1 环境前置检查（`framework/patterns/testing-env-patterns.md`）：无 prisma client 失配类误报（tsc 零错），
Node v25.7.0 / vitest 4.1.10 正常，无需 `prisma generate` 补救。新测依赖 `typescript`（package.json `dependencies`，
非仅 devDep）→ CI 侧可用，无「本地绿 CI 红」风险。

### ⑧ 边界：本批是否触碰了不该碰的面 — **PASS（diff 自证）**

```
git diff --stat 546d0e8^ 312eb9a
 docker-compose.prod.yml                   |  10 +
 docs/dev/deploy.md                        |  15 +-
 features.json                             | 107 +--
 progress.json                             | 137 +--
 tests/unit/deploy-env-passthrough.test.ts | 346 +++
```
`git diff --stat 546d0e8^ 312eb9a -- src/ prisma/ sdk/` → **空**。产品逻辑零改动，与 hotfix 范围声明一致。
compose 的 10 行新增全部在 app.environment（1 行配置 + 9 行注释），无其他服务、卷、网络、端口变更。

---

## 3. 判定

| # | Acceptance 项 | 判定 |
|---|---|---|
| 1 | compose 必填插值形态（缺键在 compose 层即报错） | **PASS** |
| 2 | 机械断言在 vitest / CI 收集范围内、判据先验活 | **PASS** |
| 3 | 豁免清单显式写死 + 注释理由 + 理由与实物一致 | **PASS** |
| 4 | 变异证活 ①②③ | **PASS** |
| 5 | compose 语法自证 | **PASS**（并补齐 `up`/`pull` 面） |
| 6 | deploy.md M5 前置段同步 | **PASS** |
| 7 | tsc / lint / 全量 vitest 绿 | **PASS** |
| 8 | 未越界（src/ 零改动） | **PASS** |

### **verdict：PASS（7/7 acceptance 项 + 边界项全部通过，无 FAIL、无 PARTIAL）**

无 issue 需回 `fixing`。以下 4 条为 **soft-watch**，不阻断本批签收。

---

## 4. Soft-watch（新增，不阻断）

**S1 — 扫描判据的 3 处盲区（将来风险，今日 0 例活体漏网）**
判据是「文件内同时有 `NODE_ENV === 'production'` 字面比较 + throw」，故漏：
(a) 动态键 `env[NAME]`；(b) **反向写法** `if (NODE_ENV !== 'production') return fallback; throw ...`；(c) 经 helper（`isProd()`）判 production。
其中 **(b) 最值得盯**——它与 `resolveAuthSecret` 语义完全等价，只差一个 `!`，是极常见的等价重写。
已去实物核过：当前 src/ 中含 `NODE_ENV !== 'production'` 的文件只有 `lib/db/prisma.ts` 与 `lib/data/provenance.ts`，
两者 **throw 数均为 0**；全仓无 `isProd`/`isProduction` helper。**故今日无活体漏网**（第二实现普查亦佐证：宽判据额外命中 0）。
建议：下次动 auth / 部署面时，把 `!==` 反向形态并入判据（代价是需要区分 dev-only guard，非本批范围）。

**S2 — 文件级判定的连带误红（有逃生口，但首选文案会误导）**
p8 实测：同一文件里只要有一处 production fail-fast，**该文件读到的所有 env 键**（包括带默认值、本就可选的）
都会被要求必填透传——一个探针文件红了 6 条。逃生口存在（登记进 `OPTIONAL_BY_DESIGN_KEYS`）且报错文案有指路，
但**首选修法文案是「加一行 `${KEY:?...}`」**，照做会把可选调优键变成部署硬前置。
现实触发点：将来给 `src/lib/ai/gateway.ts`（读 4 个带默认值的调优键）加一处 production 硬校验时即会命中。
建议：把文案顺序改为「先判断该键是否本就可选」，或把判定单元收窄到函数/语句作用域。

**S3 — 守门只覆盖 `app` 服务 + 只扫 `src/`**
`migrate` 服务（tools 镜像，入口 `scripts/deploy/migrate-seed.sh`）同样在生产跑代码，但其面上的
production fail-fast 键无任何守门（扫描不含 `scripts/`，断言不查 `migrate.environment`）。
今日无缺口（已核：migrate 链路 `import-kol-csv.ts` / `canonical-projects.ts` 不读 AUTH_SECRET，
只需 DATABASE_URL + AIGCGATEWAY_*，compose 已透传）。属 acceptance 范围外，登记为将来面。

**S4 — `PROD_FORBIDDEN` 用 `\bKEY\b` 扫 compose 全文**
将来若在 compose **注释**里写「禁止出现 DEV_TEST_USER_EMAIL」这类说明文字，会误红。极轻，记录备查。

---

## 5. 部署放行意见（本批的实际用途）

### **建议放行部署 —— 但必须按下列顺序执行，顺序错会导致部署中止（不会导致生产下线）。**

放行依据：
1. 阻断缺陷已修复且**修复形态本身是 fail-safe 的**——实测 `pull` / `up -d --wait` 在缺键时于**解析阶段中止**，
   发生在 recreate 任何容器**之前**；deploy 工作流第 1 步就是 `$COMPOSE pull`（`set -euo pipefail`），
   故最坏结局是「Actions 红 + 报错信息精确指出缺哪个键」，旧容器 `restart: unless-stopped` 原样继续服务。
2. 产品代码零改动 → 本批不引入任何新的运行时行为，回归面为零（全量 1809 测试绿即充分）。
3. 同类缺口已挪进 CI 执行面，且经 8 次变异证明该守门对将来新增键真实有效（非白名单）。

**部署前人工前置（顺序不可颠倒）：**

| 序 | 动作 | 漏做的后果 |
|---|---|---|
| 1 | VPS `/opt/apps/newkolmatrix/.env` 写入 `AUTH_SECRET=$(openssl rand -base64 32)`（连同 M5-AUTH-RLS 既有的 `DATABASE_URL_APP` 等前置） | `pull` 阶段即中止 |
| 2 | **`scp docker-compose.prod.yml deploysvr:/opt/apps/newkolmatrix/`**（VPS 是人工副本） | **只做第 1 步不做第 2 步 = 完全没修**：旧 compose 不透传该键，`.env` 里有也不会进容器，仍是「每请求 500 + healthcheck 永不转绿」的原始故障 |
| 3 | 可选自检：VPS 上先跑 `docker compose -f docker-compose.prod.yml config >/dev/null`，exit=0 再触发 Actions | 少一次早期反馈 |
| 4 | GitHub Actions → Deploy to Production 手动触发 | — |

> 第 2 步是本批**唯一的人为失误面**，deploy.md 第 5 步已改写为「先同步 compose 再部署」并显式点名此坑。
> 另注：`AUTH_SECRET` 是会话签名密钥，轮换会使**全部现存登录会话失效**（用户需重新登录）——
> 首次配置无此问题（此前生产根本没有该键，也就没有有效会话）。

**未执行（如实标注）：** VPS 上的真实 `up -d` 与部署后 staging 实测——本次验收无部署权，生产是活的，
按边界一律未连接、未操作。属 [L2]，待用户授权且部署完成后另行验收。

---

## 6. 本次验收产出物

| 文件 | 说明 |
|---|---|
| `docs/test-reports/M5-DEPLOY-FIX-signoff.md` | 本报告 |
| `scripts/test/m5-deploy-fix-env-census.mjs` | 独立第二实现（正则口径）的 env 键普查器，用于交叉验证被测 AST 扫描器的命中集与覆盖差；只读，可随时复跑 |

临时变异探针（8 个 src/ 探针文件、1 份测试副本、5 次 compose 变异、3 份临时 dummy env）**全部已删除并核对还原**：
`git status --short src/ tests/ docker-compose.prod.yml` 干净，compose 文件 hash 与变异前一致。
本机 docker 未产生任何本项目容器（`docker ps -a --filter name=newkolmatrix` 仅有既有的 `newkolmatrix-dev-db`，未被触碰；
所有 docker 调用均为 `config` 或 `--dry-run`）。
