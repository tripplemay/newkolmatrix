# M5-AUTH-RLS — 真实认证 + RLS 多租户隔离

> 批次类型:正式发布性质的基础设施批次。**执行形态:本地异构**(2026-08-04 用户裁决:只 Evaluator 异构,family=codex;generator/planner 走默认映射,`role_assignments` 只指派 evaluator)。
> 规格依据:M5 侦察报告(2026-08-04,只读实物侦察)+ 用户四项裁决。file:line 断言均来自侦察实测。

## 1. 背景与实物现状(侦察核证)

- **认证零实装**:next-auth 引用 0 处、middleware.ts 不存在、无 login 页、无 auth 依赖;全仓仅 webhook svix 签名一处鉴权(`api/signals/inbound`)。architecture.md:1450 明记「无认证故无 401;**403 已锁死为闸门语义**」。
- **租户硬编码面**:`getDevTenantId()`(`src/lib/agent/context.ts:16`)45 处调用/39 文件;`buildToolContext()` 22 处/13 文件;`context.ts:13` **模块级缓存 `_devTenantId` 是多租户串数据风险点**;`context.ts:30` 已标注 M5 EXTENSION POINT。
- **schema**:24 model 中 23 个带 tenantId(+索引+级联);`User`(schema:40)仅 id/tenantId/email/name/createdAt,**无 passwordHash/role**;Auth.js adapter 表(Account/Session/VerificationToken)不存在;迁移 9 个,**RLS 相关 0**。
- **API 面**:29 个 route,**28 个裸奔**(限速仅 5/29);server actions 0 处。
- **⚠️ RLS 硬阻塞(实测)**:DB 用户 `kol` 为 **SUPERUSER + BYPASSRLS**(dev/prod compose 同病,CI 用 postgres/postgres)——不建非特权应用角色,RLS policy 完全不生效。
- **raw SQL 7 处/5 文件**(pgvector 检索等)绕过 Prisma 类型层,**只有 DB 侧 RLS 能覆盖**。
- **RLS 平滑切换前提已备**(architecture:1594 NFR-S9):全部查询已带 tenantId 条件(M4.8 收口 + census 钉)。
- `src/app/admin/layout.tsx` 是 **client component**,鉴权只能靠新建 `src/middleware.ts`。
- rate-limit 双库已存在:`src/lib/http/rate-limit.ts`(IP,fail 策略归调用方)+ `knowledge/rate-limit.ts`(tenantId);fail-closed 先例 = signals/inbound。
- design-draft **无 login 原型** → 登录页从 Horizon 模板 port(用户裁决)。

## 2. 用户裁决(2026-08-04 实答)

| 决策点 | 裁决 |
|---|---|
| 认证方式 | **邮箱+密码**:Auth.js v5 Credentials + **JWT 会话**(无 adapter 表) |
| RLS 深度 | **真 PG RLS + 非特权角色**;应用层 where + census 钉降为纵深防线 |
| 开通方式 | **开放注册**(注册即建新租户,注册者为 owner) |
| 登录页 UI | **Port Horizon 模板 sign-in 页**(登记 template-inventory) |
| 执行形态 | **本地异构**:evaluator = codex(`local-cli--codex--evaluator`),generator = 主上下文(默认映射) |

## 3. 范围

**13 features 全部 executor:generator**。**不做**:邮箱验证(→ backlog `BL-AUTH-EMAIL-VERIFY`,开放注册的已知缺口,先靠限速+密码强度兜)· RBAC/角色字段(D26 延续)· 真 partner/真回传源/真实公开分享页(M5 伞下其余项,另批)· R16 生产备份(独立 ops 任务,建议部署本批前完成)· 分布式限流(登记既有)。

## 4. 关键设计决策

### D-1 Auth.js v5 Credentials + JWT(无 adapter 表)
`User` expand 迁移:+`passwordHash`(String?,bcrypt cost 12)。JWT 携带 `{ userId, tenantId }`;session 回调透出。**401 专用于认证失败**(403 不许碰——闸门语义已锁,architecture:1450)。`AUTH_SECRET` 入 env(dev `.env` + VPS 人工前置 + CI secret)。

### D-2 `src/middleware.ts` 鉴权边界(从零建)
**豁免清单显式写死并单测钉**(要放行必须改断言):`/api/health` · `/api/signals/inbound`(svix 自鉴权)· `/api/auth/*` · `/login` · `/signup` · Next 静态资源。其余:API 未登录 → **401 JSON**;页面未登录 → redirect `/login`。middleware 只做「有无合法会话」粗闸,细粒度租户归属仍在数据层(RLS)。

### D-3 会话租户注入(context.ts EXTENSION POINT 兑现)
- `buildToolContext()` 从会话解析 `{ tenantId, actor=email }`;**删除模块级缓存 `_devTenantId`**(串数据风险,侦察点名)。
- **双路收敛**:HTTP 面(29 route + admin pages)走会话;**无会话面**(scheduler 4 处 + scripts 9 处 + seed)走新的显式 `systemContext(tenantSlug)`——**不得留任何隐式回落 dev 的路径**(回落 = 静默跨租户,负向断言钉死:无会话且未显式传租户 → throw,不默认 dev)。
- vitest 既有集成测:测试床显式传 ctx(现状已如此),不受影响;新增负向用例见 F011。

### D-4 开放注册 = 注册即建租户
`/signup`:email 唯一 + zod 密码强度(≥10 位含字母数字)+ **fail-closed IP 限速**(注册 3/min/IP、登录 5/min/IP + 5min block,复用 `checkRateLimit`,签名 fail-closed——登录/注册是安全敏感面,Redis/存储不可用时拒绝而非放行)。事务内:建 Tenant(name=注册输入)+ User(owner 语义仅注释,无 role 字段)。**新租户空态是产品现状**(KOL 池 per-tenant,seed 2500 KOL 属 dev 租户)——注册后首屏空态不是缺陷,spec 明示防误判。注册/登录成败落 `OperationLog`(只记元数据:email 域名+结果,不记密码任何形态)。

### D-5 非特权 DB 角色(RLS 硬前置)
- 新建 `kol_app`:`NOSUPERUSER NOBYPASSRLS NOCREATEDB`,GRANT 常规 DML;**迁移仍用特权 `kol`**(migrate 容器/`prisma migrate` 连接串不变),**应用运行时连接串切到 `kol_app`**。
- 三环境落地:dev compose(init SQL 或幂等 bootstrap 脚本)· CI workflow(建角色步 + app 用 DATABASE_URL 切换)· **prod 人工前置**(在既有 pgdata 上执行角色创建 SQL + VPS `.env` 加 `DATABASE_URL_APP`;写进 deploy.md 前置段)。
- **运行时哨兵**:应用启动/测试断言当前连接角色 `rolbypassrls=false`(防连接串配回特权——RLS 静默失效是本决策最大风险)。

### D-6 RLS 迁移(23 表)
每表 `ENABLE ROW LEVEL SECURITY` + policy:`USING (tenant_id = current_setting('app.tenant_id', true))`(写侧 `WITH CHECK` 同式)。**未设变量 → current_setting 返回 NULL → default deny(零行)**,这是负向断言的锚。`Tenant` 表本身:按 id = current_setting 隔离(用户只见自己租户行)。迁移属 expand(不动数据),回滚安全:旧镜像 + 特权连接不受 policy 影响。

### D-7 Prisma 租户变量注入($extends)
应用层唯一 PrismaClient 单例(`src/lib/db/prisma.ts`)加 client extension:**每次操作在事务内先 `SELECT set_config('app.tenant_id', $1, true)` 再执行**;既有 `$transaction` 20+ 处与 raw SQL 7 处必须同样被覆盖。**实现机制(interactive tx 包装 / itx 兼容 / AsyncLocalStorage 传租户)允许 Generator 开工前按 pre-impl-adjudication 提审**——spec 锁行为不锁机制:任何经该 client 的查询(含 raw)在 `kol_app` 连接下都只见当前租户行;未注入租户上下文的查询得零行而非全量。3 处散装 `new PrismaClient()`(scripts/test)收敛到单例或显式标注特权用途。

### D-8 测试面分层(既有 1470 tests 不翻修)
- **vitest 集成测保持现状连接**(特权 `kol`,RLS 不拦)——它们测业务行为,不测隔离;**翻修 123 文件不在本批**。
- **RLS 负向专套**(F011):专用 `kol_app` 连接串驱动,两真租户,API 层(带 A 会话请求 B 资源)与 DB 层(raw SQL 直查)双证;BYPASSRLS 哨兵;census 钉(S-M48-2)降二线标注。
- **e2e/visual 鉴权适配**(F012):seed 测试用户;playwright `storageState` 登录态复用;CI visual job 增登录前置。两套 e2e 脚本走真 route 需带会话。

### D-9 车道与编排(本地异构首跑)
- `role_assignments = {"evaluator": "local-cli--codex--evaluator"}`(已过 assignments 校验,family claude×codex 互斥成立);generator/planner 默认映射。
- **verifying**:Coordinator 按 dispatch 流程派 codex——固定信封(`repo.ref` 锁 40 位 SHA、`l2_authorized=false`、deliverable=verdict 工件过 schema)→ `dispatch-run.sh` → 回执推断(exit 0 但产物缺失判 FAILED;重派上限 1)→ 结论机械转录。codex 在独立 sandbox checkout 自行取证,**不采信任何转述**。
- building 主上下文串行/按域派 generator-restricted subagent(M4.8 同款);阶段边界落盘纪律不变。

### D-10 登录/注册页 port(UI checklist,§2.1-2.4)
- §2.1 原型:Horizon UI Pro 模板 sign-in 页(按 `docs/dev/template-port-guide.md` 定位实源,port 后登记 `docs/dev/template-inventory.md`)
- §2.2 必用公共组件:沿模板 scaffold 既有原语;禁止引入新 UI 库、禁止 Chakra 新面
- §2.3 不得简化:模板卡片布局/品牌区/输入态样式保留;不得新增第三方登录按钮(本批无 OAuth)
- §2.4 视觉基线:login + signup 两页 × 两视口(1512×982 / 430×932)PNG 基线;CI visual job 覆盖

## 5. 数据准备(Evaluator 验收前提)

- dev 库:seed 增测试用户(dev 租户,已知邮箱/密码,仅 dev/CI;prod seed 不建)。
- RLS 负向套件自建第二租户(独一前缀),清理登记表 + 不从登记表派生的整表普查(M4.7/M4.8 两层纪律照旧),零外呼。
- **验收环境需三个连接串**:特权(迁移/既有测试)· `kol_app`(应用/RLS 负向)· 未设租户变量的 `kol_app`(default-deny 证明)。

## 6. 部署人工前置(deploy.md 本批必须追加段)

1. prod pgdata 上执行 `kol_app` 角色创建 SQL(幂等);
2. VPS `.env`:`AUTH_SECRET` + 应用连接串切换键;
3. CI secrets/workflow 同步;
4. **建议先完成 R16 备份**(architecture:1871)再部署本批——认证+RLS 是首个动生产访问面的批次。

## 7. Planner 裁决记录(building 期)

**裁-1(2026-08-04,F001 401 语义偏差)**:采纳 Generator 报告。Auth.js **内建端点**循其协议(表单 POST 恒 302→/login?error=、fetch 模式 200+{url}),非配置项;「认证失败恒 401」的**承载层 = middleware**(F003 已活体实证:未登录访问受保护 API 恒 401 JSON);「零新增 403」由 `auth-status-code-census` 普查钉守。F001 acceptance 已按此修订(P3 扫全文:spec 内无其他「恒 401」表述残留)。

**裁-2(F002 删模板 Google 按钮)**:采纳。§2.3「不得新增第三方登录按钮」优先于「不得简化」——port 一个点击无响应的按钮是假功能,违反行动承诺诚实的产品红线精神。

**裁-3(F002 变异发现:视觉基线 maxDiffPixels=1500 容得下 14px 小字文案微调)**:登记 soft-watch **S-M5-1**,本批不改全仓共用阈值(影响既有 12 条基线,超 scope);done 收尾归入 BL-E2E-CLEANUP-PIN(断言强度家族)。

**裁-6(2026-08-04,F009 提审 → 移出本批,用户实答)**:Generator 开工前审计以真库实测证伪 D-7 两前提(官方范例式注入毁 $transaction 原子性 B1-4 / raw SQL 不在覆盖面 B1-2 / 会话变量粘池 B3;登录/注册/slug 解析引导悖论 B2-1/2/3)。裁决 #Q1:A #Q2:B+C #Q3:A:**本批止步 F008**(RLS 地基就位且可证,运行时暂不切换,`DB_APP_ROLE_RUNTIME` 开关默认关 + 哨兵告警为刻意可见态);F009 移出 → backlog `BL-M51-TENANT-INJECTION`(双 client 白名单 + withTenant/ALS 预裁决与硬 acceptance 已预写);F010 照原样;F011 报告须写清两层分工。批次 13→12 features。完整理由见 `M5-AUTH-RLS-F009-preimpl-audit.md` §4。

**裁-5(2026-08-04,F006 连带:登录留痕进 today feed 使 en-today 基线擦线翻红)**:CI 实证链 = auth.setup 登录一次 → F006 成功留痕落 dev 租户 OperationLog → today feed(page.tsx:302 直读)多一张卡 → 1612px > 1500 阈值。**裁定:留痕留在 feed**(OperationLog feed 反映真实事件,S-M45-1 同一哲学;登录事件对营销操盘手可见是合理审计面),重生 en-today Linux 基线(烘入恒定的 1 行登录卡——auth.setup 每轮恰登录一次,确定性成立)。本机 today 基线本就是已登记翻红项(S-RV2-5 家族),不受影响。

**裁-4(编排重排)**:F003 落地使既有 playwright 23 条因未登录 307 翻红(Generator 实测),CI visual job 将红。按 CI 守门纪律「红了先修」,**F012 提前至 A2 之前执行**,恢复 CI 绿后再回 F004-F006。

## 8. L1 / L2 边界

- L1:全部行为断言 mock/本地驱动(登录、注册、401、RLS 隔离、default-deny、哨兵)。
- L2(未授权不执行):真多用户并发下会话正确性 · 生产 RLS 实测(部署后跨租户手测)· 邮箱验证缺失的真实滥用面 · 分布式限流。
