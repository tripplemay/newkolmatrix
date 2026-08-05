# M5-AUTH-RLS 验收报告（首轮 verifying）

> **Evaluator：** 隔离 subagent（fresh context，快车道回落形态）
> **日期：** 2026-08-05
> **被测快照：** `cc873debd06fa96b7679d57d87d03027c7965398`
> **判定：** **10 PASS / 2 PARTIAL / 0 FAIL** → 批次进入 `fixing`
> **形态说明：** 本批四次异构派发（codex ×2 认证两难 / kimi ×2 墙钟 + DNS 瞬断）均为基础设施失败，零验收结论产生。本报告是本批第一份实际验收结论。

---

## 0. 前置：被测快照自证

编排者称「HEAD `d1f8d75` 与 `cc873de` 产品面逐字节一致」。**已自证，不采信转述：**

```
$ git diff --stat cc873de..HEAD
 .agents-registry.json                           | 49 ++++++--
 .claude/dispatch/transports/adapters/codex.json | 20 ++++--
 framework/proposed-learnings.md                 | 10 +++
 progress.json                                   |  6 +--
```

`src/` · `prisma/` · `tests/` · `docs/dev/` 零改动 → 结论对 HEAD 同样成立。

---

## 1. L1 基线（全部本机实跑）

| 项 | 命令 | 结果 |
|---|---|---|
| 类型 | `npx tsc --noEmit` | **exit 0** |
| Lint | `npx next lint` | **No ESLint warnings or errors** |
| 单元 + 集成 | `npx vitest run` | **141 files / 1760 tests 全绿** |
| 构建 | `npx next build` | **exit 0** |
| 视觉门 | `npm run test:visual` | **29 passed / 2 failed**（两条为已登记本机项，身份未变 —— 见 §F012） |
| e2e 循环面 | `npm run agentloop:e2e` | **全绿**（零外呼 · 零真实对外副作用） |
| e2e 前台面 | `npm run frontdesk:e2e` | **全绿**（两层清态断言通过） |

> 首次 `vitest run --reporter=basic` 启动失败 = **我的命令错误**（vitest 4 已移除 `basic` reporter），非被测缺陷，已改默认 reporter 重跑。

---

## 2. 变异清单（9 条，全部实跑 · cp 备份还原 · `git diff --quiet` 核证复位）

「0 findings 必须配检测器活性证明」——本批每一条关键断言我都先把它打红过一次。

| # | Feature | 变异 | 结果 | 判读 |
|---|---|---|---|---|
| M1 | F004 | `requireSessionIdentity` 无会话时回落 dev 租户 | **4 failed** | 无隐式回落钉活 |
| M2 | F006 | 限流器 catch 改 `allowed:true`（fail-open） | **1 failed** | fail-closed 钉活 |
| M3 | F003 | 豁免清单塞 `/api/projects` | **6 failed** | 豁免全集钉活 |
| M4 | F001 | `verifyPassword` 换成明文 `===` 比对 | **2 failed** | bcrypt 钉活 |
| M5 | F008 | `Project` policy 改 `USING(true)`（真库 ALTER POLICY） | **9 failed** | RLS 负向套件钉活 |
| M6 | F007 | `isPrivilegedConnection` 恒 false（哨兵摘断言） | **5 failed** | BYPASSRLS 哨兵钉活 |
| M7a | F013 | architecture.md「恰 7 条」→「恰 8 条」 | **1 failed** | 豁免计数文档钉活 |
| M7b | F013 | 「RLS 地基已就位、运行时未切换」→「RLS 已全面启用」 | **1 failed** | RLS 状态句钉活 |
| M7c | F013 | 「Auth.js v5」→「NextAuth v4」 | **1 failed** | 认证选型行钉活 |

M5 的 DB 侧变异已还原并双向核证：`pg_policies` 恢复双侧同式、全库 `weak_policies = 0`、套件回到 28/28 绿。

---

## 3. 逐 Feature 判定

### F001 Auth.js v5 Credentials + JWT + User expand 迁移 —— **PASS**

- `next-auth@5.0.0-beta.32` + `bcryptjs@3.0.3` 入 `package.json`；`/api/auth/[...nextauth]` + `/api/auth/register` 就位。
- 迁移**纯 expand** 实读：`ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;` —— 单列 nullable，不动既有行、无约束、无类型改动。
- bcrypt 实证：注册后直查库 `passwordHash` 前缀 `$2b$12$`、长度 60 → cost 12 属实。变异 M4 → 红。
- **401 语义（裁-1）**：承载层 = middleware，实测未登录访问受保护 API 恒 `401 {"ok":false,"error":"unauthorized"}`。
- **零新增 403**：`auth-status-code-census` 绿；全仓认证面 `403` 三处命中**全部是注释**（census 剥注释后计数），无实码。
- 不泄露用户存在性：错口令 / 不存在用户 / 老用户无摘要三路同一文案 + `TIMING_EQUALIZER_HASH` 时延拉平。
- prod 禁建测试用户：`assertDevSeedAllowed` 在 `NODE_ENV=production` 抛错，判定在 lib 且被单测钉。
- JWT 携带 `{userId, tenantId}` 且 session 回调透出：`auth-signin-http.test.ts` 走真 csrf→callback→session 链断言，4/4 绿。

> 附带问题（不违反本 feature 任一 acceptance，登记为 I-3）：该测试文件每跑一轮泄漏 5 行孤儿 `OperationLog`。

### F002 登录/注册页 Horizon port + 视觉基线 —— **PASS**

- `template-inventory.md` §B.1 登记 6 个落点的模板实源路径与形态（port+fork / 接线零改动），fork 改动点逐条落文件头。
- §2.2 未引入新 UI 库：`package.json` 本批新增项只有 `next-auth` / `bcryptjs` 与两条 npm script，无 UI 依赖。
- §2.3 裁-2 已执行：`google|github|apple|oauth|sign in with` 在两页共 3 处命中，**全部是说明删除原因的注释**，无实钮。
- §2.4 基线齐备：`auth-login` / `auth-signup` × 桌面(1512×982)/移动(430×932) × darwin/linux = 8 张 PNG 入库；本机 4 条截图用例 + 3 条表单错误态用例**真浏览器全绿**。
- CI 覆盖已核到 `ci.yml` 命令链（非只看脚本名）：visual job 补 `AUTH_SECRET` 与 `seed:dev-user` 前置步。
- 未登录可达实测：`/login` → 200、`/signup` → 200。

### F003 `src/middleware.ts` 鉴权边界 —— **PARTIAL**（见 I-1）

**成立的部分**（逐条实测）：

- 豁免清单为导出常量 + 单测钉 id 全集；变异 M3 塞 `/api/projects` → 6 条红。
- 未登录 API → 401 JSON：`/api/projects` · `/api/actions/abc` · `/api/delivery/deliverables/abc` 逐类实测。
- 未登录页面 → 307 跳 `/login` 且带 `callbackUrl`。
- 已登录零行为变化：storageState 会话下 29 条既有视觉用例原样通过。
- webhook 面不受影响：`/api/signals/inbound` 在册豁免，`frontdesk/agentloop` e2e 全链绿。
- **我自建的绕过矩阵**（standalone 生产形态）—— 路径穿越、前缀混淆、大小写、双斜杠全部**未击穿**：

| 探针 | 结果 |
|---|---|
| `/api/auth/../projects` · `/api/auth/%2e%2e/projects` · `/api/health/../projects` | 401 ✅ |
| `/api/authorize` · `/api/auth-bypass/projects` | 401 ✅ |
| `/API/projects` · `/Admin/today` | 307 ✅（仍 fail-closed） |
| `/api/projects/` · `//api/projects` | 308 → 规范化后 401 ✅ |

**不成立的部分 → I-1**：第 8 条豁免规则 `public-asset` 是**作用于整条 path 的扩展名后缀正则**，middleware `matcher` 的负向排除同式。凡**末段为动态段**的路由，攻击者只要在 id 后缀加 `.json`/`.js`/`.txt`/`.map` 即可让 middleware **根本不执行**：

```
控制组  /api/actions/abc            -> 401 {"ok":false,"error":"unauthorized"}
绕过    /api/actions/abc.json       -> 500  (handler 已执行，闸门未运行)
绕过    /api/delivery/deliverables/abc.json -> 405 (路由已命中)
绕过    /admin/campaigns/abc.json   -> 500  (页面面同样失守)
```

- **今日无数据泄漏**：两条可达路由各自独立要求会话（`buildToolContext` / `requireSessionTenantId`），F004 的 fail-closed 把它兜成 500 —— 纵深防御按设计生效，这是它救下的第一场。
- 但 acceptance 明写「未登录访问任一非豁免 API → **401 JSON**」，`/api/actions/<id>.json` 属非豁免 API 却得 500 且闸门未运行 → 判定不成立。
- 且 spec D-2 枚举的豁免集是 6 类，实装 7 条 —— 多出的 `public-asset` 正是造洞的那条（public/ 静态件确有真实需要，但不必以「全路径扩展名」的最宽形态表达）。
- **本 feature 自带的反通配守卫对这一类是盲的**：`豁免规则没有「通配一切」的写法` 只拿 `/api/projects` 与 `/admin/today` 试探后缀正则，两者都没有扩展名，故恒绿。

### F004 会话租户注入 —— **PASS**

- `_devTenantId` 模块级缓存**已删**：`src/` + `scripts/` 命中 0（残余 3 处全在普查测试自身，且该普查只扫 `src`/`scripts`，不是自我豁免）；检测器活性经基线对照（`3901404` 时 `context.ts` 4 处命中）。
- `getDevTenantId` 在 `src/` 只剩定义处与两处注释引用，零调用点。
- **无隐式回落**：无会话且未显式传租户 → 抛 `MissingSessionTenantError`。变异 M1 装回 dev 回落 → 4 条红。
- `systemContext(tenantSlug)` 显式路径就位；HTTP 面普查钉住「`src/app/**` 不得给 `buildToolContext` 传 tenantId」与「显式租户路径只有 webhook 一处在册豁免」。
- 既有测试床显式传 ctx 不受影响：全量 1760 绿。

### F005 开放注册 —— **PASS**

真库真端点四步实测（独一前缀 `m5rv-1785905555`，隔离源 IP）：

| 步 | 期望 | 实测 |
|---|---|---|
| 弱口令 | 400 | `400 {"error":"密码至少 10 位，且需同时包含字母和数字"}` |
| 合法注册 | 201 + 建租户 | `201 {"created":true,...,"tenantId":"cmsfm22jx..."}` |
| 邮箱重复 | 409 不 500 | `409 {"error":"该邮箱已注册，请直接登录"}` |
| 原子性 | 事务内 Tenant+User+留痕 | 单 `$transaction`，唯一性交 DB 约束裁定（非 TOCTOU 先查后插） |

- 隐私断言串实证：`OperationLog` 只落 `emailDomain`（**不含邮箱本地部分**、不含口令任何形态）；全表搜明文口令与 `passwordHash` 命中 **0 / 0**。
- 注册后自动登录：`signup/page.tsx` 拿 201 后调 `signIn('credentials')`（服务端不另起签会话路径，签会话唯一入口保持在 Credentials provider）。
- 新租户空态属 spec 语义，已在代码注释登记，不判缺陷。

### F006 fail-closed 限速 + 审计留痕 —— **PASS**

- 阈值导出常量：登录 5/min + 5min block、注册 3/min，桶名与既有面隔离。
- **fail-closed 双条**：IP 不可得 → 拒；限流器抛异常 → 拒（`catch` 不重抛不放行）。变异 M2 改 fail-open → 红。
- 实测第 4 次注册 → `429 {"error":"尝试过于频繁，请稍后再试"}` + `Retry-After: 60`。
- **无 escape hatch**：本模块不读 `DISABLE_GATE_RATELIMIT`，测试设上该变量后限速仍生效。
- 留痕落库实证：`[auth] register rate_limited domain=...`（kind=block）与 `[auth] register ok domain=...`（kind=auto）均在库，元数据 only。

### F007 非特权角色 kol_app + BYPASSRLS 哨兵 —— **PASS**

- 角色属性真库核证：`kol_app` → `rolsuper=f rolbypassrls=f rolcreatedb=f`；`kol` 仍 `t/t/t`（迁移连接保持特权，符合 D-5）。
- 幂等建角色 SQL + bootstrap 脚本落 `scripts/db/`；dev compose initdb 钩子接线；CI 建角色步实读 `ci.yml` 核证（排在 migrate 之后，注释写明 `GRANT ON ALL TABLES` 的时序理由）。
- deploy.md 追加 prod 人工前置段，**R16 备份置于段首第 0 条**（acceptance 点名）。
- **哨兵双向实测**（本报告自建，不采信注释）：

| 场景 | 结果 |
|---|---|
| `DB_APP_ROLE_RUNTIME=1` + 特权连接串 | **抛 `PrivilegedConnectionError`**（fail-closed）✅ |
| `DB_APP_ROLE_RUNTIME=1` + kol_app 连接串 | `status=ok role=kol_app bypassRls=false` ✅ |
| 开关关闭（本机 dev 现状） | dev server 启动日志确有大声告警，裁-6 的「刻意可见态」属实 ✅ |

- 变异 M6 摘掉哨兵判定 → 5 条红。

### F008 RLS 迁移 23 表 + default-deny —— **PASS**

- 覆盖面真库核证：`relrowsecurity` 表 = **24**（23 张带 tenantId + `Tenant`）；「有 tenantId 列却没开 RLS」的表 = **0**；policy 24 条，`qual` 与 `with_check` **各 24 条非空**（双侧齐）。
- **default-deny 全表普查**（非抽测 ≥5 张，是 24 张全查）：

| 连接 | 可见行数 | 非空表数 |
|---|---|---|
| 特权 `kol`（BYPASSRLS） | 2908 | 11 |
| `kol_app` **未设** `app.tenant_id` | **0** | **0** |
| `kol_app` 设 dev 租户 | 2716 | 10 |

  第二行是 default-deny 的机械证明；第三行 < 第一行说明看到的是**变量决定的子集**，不是「恰好只有这些」。
- **WITH CHECK 写侧**（acceptance 点名的「双侧」，我单独驱动）：

| 探针 | 结果 |
|---|---|
| 会话=dev，INSERT 标 B 租户 | `ERROR: new row violates row-level security policy` ✅ |
| 会话=dev，INSERT 标 dev | `INSERT 0 1` ✅ |
| 会话=dev，UPDATE 把自己行改挂 B 租户 | `ERROR: new row violates row-level security policy` ✅ |
| 会话=dev，DELETE 别人的行 | `DELETE 0`（看不见即删不掉）✅ |
| `Tenant` 表自隔离 | 5 个租户中只见 `Dev Tenant` 一行 ✅ |

- expand 属性核证：迁移语句仅 `ALTER TABLE`×24 + `DROP POLICY IF EXISTS`×24（幂等用）+ `CREATE POLICY`×24，**零 INSERT/UPDATE/DELETE/TRUNCATE**；`FORCE ROW LEVEL SECURITY` 只出现在注释里，DB 侧 `relforcerowsecurity` 计数 = 0 → 特权连接与既有测试确实不受影响。
- 变异 M5 单表改 `USING(true)` → 9 条红。

> 更正记录：我最初的 grep 把 `DROP POLICY IF EXISTS` 与注释里的 FORCE 误报为「破坏性语句」，经逐条拆解与 DB 侧对照证伪 —— **属我的正则不精确，非被测缺陷**，据实登记。

### F010 scheduler / scripts 系统上下文收敛 —— **PASS**

- `scheduler.ts` 注册表新增 `tenantSlug` 字段，4 条例程**注册处指名 + 调用点 `systemTenantId(tenantSlug)`**（租户写在两处而非藏在函数名里）。
- `scripts/jobs/*` 4 个入口全部 `systemTenantId(DEV_TENANT_SLUG)` 显式；`scripts/` 下 `getDevTenantId` 命中 0。
- kol-sync 例程按现语义作用于 dev 租户且**显式写明**，符合 acceptance。
- `routine-tenant-explicit` + `system-context-convergence` 13 条绿；负向复用 F004（变异 M1 已证）。

### F011 RLS 负向套件（双租户双层双证）+ S-M48-2 —— **PASS**

- 双真租户夹具、A/B 各带代表性数据、独一前缀 `f011-<pid>`。
- **两层分工写清（裁 Q4 的硬要求）—— 且不止写清，还机械钉住**：文件头明写「§1 API 层跑在特权连接上，那里的 404/零行是**应用层 where** 的功劳，与 RLS 无关」；`§0` 用两条断言分别核证「DB 层连接确实不可绕过 RLS」与「API 层单例此刻确实是特权连接」。M5.1 切换运行时那天，后一条会自动翻红逼人回来改这段话 —— 这比一句免责声明强得多。
- DB 层：`kol_app` + `set_config(A)` → raw SQL 按主键直查 B 的行逐表 0 行；不注入任何变量 → 连 A 自己的行都看不见。
- 缺 `DATABASE_URL_APP` 时**硬抛**（不是 skip）—— 我专门检查过：两个套件零 `skip`/`runIf`/`skipIf`，不存在「静默全绿」的形态。
- S-M48-2 已按 evaluator 点名修法拓宽：`/\.project\s*\.\s*(?:findFirstOrThrow|findFirst|findMany)\s*\(/`，并显式注释「`findFirst\s*\(` 认不了 `findFirstOrThrow(`」。
- **一处良性偏离，我判为正确**：acceptance 写「加注释降二线」，实装写的是「运行时未切换前**仍是主力**，切换后才降二线」双态注释。这与裁-6 的事实一致 —— 运行时还在特权连接上，此刻把它称作二线才是错的。据实采纳。
- 清理纪律实证：连跑后 `f011` 前缀在 Tenant/Project/OperationLog **三表 census 均 0**，孤儿行 delta **0**。

### F012 e2e / visual 鉴权适配 —— **PASS**

- `auth.setup` 真登录一次落 storageState，三重校验（URL 落 /admin、API 面不 401、回读确认真有会话 cookie），实跑绿。
- 既有视觉用例**零改动**跑通：29 passed。
- **本机 2 条 failed 身份逐条对账**（acceptance：不新增翻红）：
  - `today dashboard` ↔ `BL-VISUAL-DATA-ISOLATION` / S-RV2-5 在案
  - `workbench env=match` ↔ M4.7 signoff §RV-5「本机库有 3 条 MatchPlan 故空态文案不出现」在案
  M4.8 签收记载 19 passed / 2 failed；本批 29 passed / 2 failed（+10 = 认证面新增用例）。**failed 条数与身份均未变化 → 无新增视觉回归。**
- 两套 e2e 走真 route 带会话：`agentloop:e2e` / `frontdesk:e2e` 全绿，闸门语义未被认证改动侵蚀（副作用仍恰在人确认后发生）。
- CI 前置链实读 `ci.yml` 核证：`AUTH_SECRET` 临时值（附「与生产凭据无关」说明）+ `seed:dev-user` 排在 canonical-projects 之后。

### F013 文档翻牌 + doc-freshness 扩 + deploy + backlog —— **PARTIAL**（见 I-2）

**成立的部分：**

- architecture.md 六处翻牌全部落地（选型表 / 边界声明 / 迁移清单 11 条 / 状态码语义 / NFR-S9 / ADR-04）。
- **「地基就位 / 运行时未切换」双半句诚实性 —— 逐处核证通过**，这是本批最容易被写飘的地方，实装反而写得很克制：
  - 选型表：「RLS 地基同批就位…**运行时非特权切换归 M5.1**」
  - :215：「**RLS 地基已就位、运行时未切换**：…应用运行时仍特权连接，切换是显式开关 `DB_APP_ROLE_RUNTIME`（默认关，开而配错即抛）」
  - 边界声明：「**运行时非特权切换与注入机制不在当前批**」
  - ADR-04：「M5 已解除：真实认证 + RLS 地基落地（运行时切换 M5.1）」
  三处半句齐全，无一处只写「已启用」的半截话。
- doc-freshness 扩钉**变异证活**：认证选型行 / RLS 状态句 / 豁免清单计数 三条各自打红（M7a/b/c），33/33 基线绿。
- 数字钉与实物对账：迁移「11 条」= 实际 11 个目录 ✅；豁免「恰 7 条」= `EXEMPT_RULE_IDS.length === 7` ✅。
- deploy.md 前置段齐全且 **R16 备份置段首**；backlog 三项记账到位（`BL-AUTH-EMAIL-VERIFY` 新增、`BL-M51-TENANT-INJECTION` 新增、`S-M48-2` 已销账为完成态并引用实现 commit、`BL-VISUAL-DATA-ISOLATION` 补记 M5 登录留痕耦合）。

**不成立的部分 → I-2（铁律 13）：** NFR-S9 段落把「既有 **137** 个测试文件**零翻修**、全量绿」当作「预留兑现的机械证据」。逐条核：

- 「137」在「baseline 全部 `tests/**/*.ts`」口径下**成立**（`git ls-tree 3901404` = 137）。
- 「零翻修」**不成立**：本批修改了 13 个既有 `tests/**/*.ts`，其中 7 个是 `*.test.ts`，且是实质增删（`+24`/`+18`/`+32` 行）。

改动性质我看过：全是 F004 会话注入缝的适配（`vi.mock('lib/auth/session-tenant')`），**不是**为 RLS 翻修 —— 所以这句话想论证的底层结论（「RLS 启用确实没改上层」）是真的，只是拿来当证据的那半句是假的。属表述精度问题，非功能缺陷，但正是铁律 13 点名的那一类。

---

## 4. Issues（需 fixing，逐条）

### I-1 · F003 · 豁免后缀正则作用于整条 path → 鉴权闸门可被绕过

- **实物**：`EXEMPT_RULES` 第 7 条 `public-asset` 与 `middleware.ts` 的 `matcher` 负向排除，都按「path 以某扩展名结尾」判定，未限定在静态资源前缀内。
- **后果**：末段为动态段的路由（`/api/actions/[id]`、`/api/delivery/deliverables/[id]`、`/admin/campaigns/[id]` …）加 `.json`/`.js`/`.txt`/`.map` 后缀即可让 middleware 完全不执行。实测 401 → 500 / 405。
- **当前未泄漏数据**，因为这两条 API 各自独立要求会话（F004 fail-closed 兜住）。**但闸门本身已不成立**：任何将来新增的、不经 `buildToolContext` 的路由（公开读端点、探针类、从 body 取 tenantId 的端点）会直接裸奔，且现有测试**一条都不会红**。
- **违反**：F003 acceptance「未登录访问任一非豁免 API → 401 JSON」；spec D-2 枚举豁免集（6 类）被扩到 7 条而多出的正是造洞那条。
- **建议修法**（供 Generator 裁量，我不改产品码）：把扩展名豁免限定在已知静态前缀内（如 `/img/`、`/fonts/`、`/favicon.ico`、`/manifest.json`），或在规则前置一条「`/api/` 一律不适用扩展名豁免」；`matcher` 负向排除同步收窄。
- **必须同时补的钉**（否则修了也测不出）：现有 `豁免规则没有「通配一切」的写法` 只试探无扩展名路径，对本类恒绿；须加 `/api/actions/abc.json`、`/admin/campaigns/abc.json` 一类样本进 `GUARDED_API_PATHS` / matcher 覆盖面断言。

### I-2 · F013 · architecture.md「既有 137 个测试文件零翻修」与实物矛盾

- **实物**：本批修改 13 个既有 `tests/**/*.ts`（7 个 `*.test.ts`），非零。
- **建议**：改成如「既有测试仅 13 处会话注入适配（F004 缝），**RLS 面零翻修**、全量绿」——保留真实结论，去掉被证伪的半句。

### I-3 · F001 测试产物 · `auth-signin-http.test.ts` 每轮泄漏 5 行孤儿 `OperationLog`（低）

- **实物**：`afterAll` 删了夹具 `User` 与 `Tenant`，但没删 F006 审计路径以该租户 id 写入的 `OperationLog`；`OperationLog.tenantId` 无 FK → 不级联（**正是项目记忆里已登记的「软引用表无 FK 不级联」这条坑**）。
- **量化**（我逐套件测 delta 隔离出来）：`auth-rate-limit` delta 0 · `auth-register` delta 0 · **`auth-signin-http` delta 5**。dev 库孤儿行已从批前 4 行涨到 124 行（其中约 50 行由我本轮多次跑测产生，见 §6）。
- **不违反 F001 任一 acceptance**，故未据此降级；但违反批内既有清理纪律，且与 `BL-VISUAL-DATA-ISOLATION` 同族。建议 `afterAll` 补一条按 `tenantId` 删 `OperationLog`。
- **旁证**：dev 库另有 2 个 `f005-52865-*` 残留租户（2026-08-04 20:32，建造期某轮遗留）；`auth-register` 当前轮 delta 为 0，说明其清理现已可用，属历史残渣。

---

## 5. soft-watch 新登记

| 编号 | 内容 | 兜底归属 |
|---|---|---|
| **S-M5-2** | middleware 豁免的扩展名规则一旦收窄，须回归确认 `public/` 下真实静态件（`/img/auth/auth.png`、`/fonts/*.woff2`、`/favicon.ico`、`/manifest.json`）仍免闸门，勿把修 I-1 修成静态资源每张图跑一次 edge 函数 | 随 I-1 修复同轮验证 |
| **S-M5-3** | `isApiPath` 大小写敏感：`/API/projects` 落 307 跳登录而非 401 JSON。仍 fail-closed 不构成缺陷（Next 路由本身大小写敏感，该路径无实体路由），仅登记口径不一致 | BL-E2E-CLEANUP-PIN（断言强度家族） |
| **S-M5-4** | 认证审计占位租户 `__auth-audit__` 会在**任意环境**被 `upsert` 建出（含 prod 首次匿名失败时）。设计上自洽（无 User 故任何会话都看不见），但它是一行会出现在 prod `Tenant` 表里的非产品租户，部署后建议人工确认其不出现在任何用户可见面 | 上线后 L2 复测清单 |

> 承接：裁-3 的 **S-M5-1**（视觉基线 `maxDiffPixels=1500` 容得下小字文案微调）本批未改，仍归 `BL-E2E-CLEANUP-PIN`。

---

## 6. 副作用自查（我这一轮对环境做了什么）

| 动作 | 处置 |
|---|---|
| 建 1 个探针租户 + 1 用户 + 若干 opLog（前缀 `m5rv-1785905555`） | **已清**。两层核证：登记表精确删 → **不从登记表派生的整表 census**，后者抓到 1 行登记删漏掉的行（写在 `__auth-audit__` 占位租户下，不在我的租户名下），已补删；复查 Tenant/User/OperationLog 三表命中 **0/0/0** |
| 真库 `ALTER POLICY tenant_isolation ON "Project" USING(true)`（变异 M5） | **已还原**并双向核证：policy 双侧同式复原、全库 `weak_policies=0`、套件 28/28 回绿 |
| 6 个源码文件 + architecture.md 变异 | **全部 cp 备份还原**，`git diff` 对这 7 个文件为空；工作树对 HEAD 仅剩 `?? .harness-dispatch/`（非我产生） |
| 反复运行认证测试套件 | 因 I-3 缺陷累积约 50 行孤儿 `OperationLog`（2026-08-05）。**我刻意未清** —— 它们是 I-3 的现场物证，且清掉会让复验看不到基数。修 I-3 时可随手清 |
| **2026-07-27 的 4 行既有孤儿 opLog** | **未动**，复查仍为 4 行 ✅ |
| `next build` 覆盖 `.next/` + 起停 dev(3100)/standalone(3000) | 服务均已停；`test-results/`、`tests/.auth/` 为未追踪测试产物 |
| 产品代码 | **零修改**（边界铁律） |

---

## 7. L2 缺口（未授权，零执行）

1. 真多用户并发下的会话正确性（进程内限流为单实例口径，分布式限流是既有登记项）。
2. **生产 RLS 实测**：部署后以两个真账号跨租户手测。注意本批语义 —— 运行时仍特权连接，故生产此刻**只有应用层 where 一道**，RLS 尚未接管（M5.1 才切）。
3. 开放注册在真实公网下的滥用面（邮箱验证缺失，`BL-AUTH-EMAIL-VERIFY` 在案）。
4. `DB_APP_ROLE_RUNTIME=1` 的真实运行时切换 —— 按裁-6 本批不做，其后果（登录/注册/slug 解析在 kol_app 下全断）已由 F009 审计实测在案，属 M5.1 面。
5. prod 人工前置步（建 `kol_app`、`AUTH_SECRET` 下发、R16 备份）的实机执行。

---

## 8. 结论

**10 PASS / 2 PARTIAL / 0 FAIL。**

这批的地基质量是高的：RLS 的 default-deny 我做了 24 张表的全表普查而不是抽测，WITH CHECK 的四条写侧探针全部正确拒绝，哨兵双向都实测过，9 条变异无一条哑火。尤其 F011 把「运行时没切换、所以 API 层那半证的不是 RLS」这件容易被含糊过去的事，用 `§0` 两条断言机械钉死并留了自动翻红机制 —— 这是很少见的诚实。

需要回炉的两条也很清楚：**I-1 是唯一的实质缺陷**（闸门可绕过，今日靠 F004 纵深兜住没出事，但不能留），I-2/I-3 是精度与卫生问题。修完 I-1 必须连带补上能抓住这一类的断言，否则修复本身无法被证明。

**建议流转：`verifying → fixing`**（F003、F013 回 `pending`）。
