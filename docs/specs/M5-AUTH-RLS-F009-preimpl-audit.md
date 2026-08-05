# M5-AUTH-RLS · F009 开工前审计 / 规格偏差报告

> **发起者：** Generator（受限 subagent，B1 域）
> **日期：** 2026-08-04
> **触发条件：** `pre-impl-adjudication.md` §2.1「spec 文字含糊（机制未定）」+「数据模型/架构 gap」；
> 且编排信封已预授权：「F009 的 $extends 机制若判断 spec 行为契约有歧义（itx 兼容 / AsyncLocalStorage 选型），
> **先停 F009 提规格偏差报告**，F007/F008 照常交付」。
> **状态：** **等 Planner 裁决后才开工。F009 未实现、features.json 未改，仍为 pending。**
> **不受本报告阻塞：** F007（commit `adeb9a9`）、F008（commit `de616c4`）已交付。
> **证据可复现：** `node --env-file=.env --import tsx scripts/test/f009-injection-probe.ts`
> （探针脚本，非实现代码；零外呼，只在 dev 租户下建/删一行探针 Project）。

---

## 0. 一句话结论

spec D-7 的**行为契约**（「经该 client 的任意查询在 kol_app 下只见当前租户行；未注入上下文得零行」）
是清楚的；但它默认成立的两个前提在本仓实物上**都不成立**：

1. **机制层**：D-7 字面机制（client extension 每操作事务内 set_config）**无法覆盖 interactive
   `$transaction`**，而按 Prisma 官方 RLS 范例写出来的版本会**静默废掉调用方事务的原子性**——
   实测：事务内写一行后主动回滚，那一行**仍然留在库里**（B1-4）。src 有 14 处 `$transaction`
   调用点 / 10 个文件，其中包含闸门（`gate.ts` ×3）、注册（`register.ts`）、放款（`delivery/register.ts` ×3）
   这些"原子性就是全部意义"的地方。
2. **语义层（更根本）**：登录、注册、slug→租户解析这三件事**发生在"租户已知"之前**，
   在 kol_app + RLS 下分别得到 null / 被拒 / null（B2-1、B2-2、B2-3）。也就是说，
   只要把应用运行时切到 kol_app，**没有人能登录、没有人能注册、`systemContext` 解析不出租户**——
   与注入机制怎么写无关。spec 未对这条"引导路径"作任何裁决。

因此：**F009 不是"选一种注入写法"的实现题，而是一个需要 Planner 定架构的决策题。**
我不自行选路（铁律 10 / pre-impl §2），把实测证据与候选方案交上来。

---

## 1. 实测证据（全部来自真库 + 真 RLS + 真 kol_app 连接）

探针一次运行的原样输出：

```
[B2-1 登录查用户] 特权=命中 / kol_app 无租户变量=null（null ⇒ 登录不可能：租户正是这次查询的产物）
[B2-2 注册建租户] kol_app 无租户变量下被拒：RLS WITH CHECK 违例
[B2-3 slug→租户解析] kol_app 无租户变量 tenant.findUnique(slug=dev) = null（null ⇒ systemContext / F010 无会话面在 kol_app 下不可用）
[B1-1 单次操作] 扩展后 project.findMany 得 3 行（>0 = 注入生效）
[B1-2 raw SQL 面] 紧接着的裸 raw 查询得 0 行（0 = $allModels 不覆盖 7 处 raw SQL）
[B1-3 interactive 事务内] 事务连接上的 app.tenant_id=""，同事务 findMany 却得 3 行（变量为 NULL 而仍有行 ⇒ 查询根本没在这个事务里执行）
[B1-4 原子性] 调用方事务回滚后那一行仍存在 = 1（1 ⇒ 写操作逃出了调用方事务，$transaction 的原子性被静默废掉）
[B3 会话级变量残留] set_config(local=false) 后 12 次并发 count = [4,0,0,0,0,0,0,0,0,0,0,0]（有非零 ⇒ 变量粘在某条池连接上，后续无关请求可能继承别人的租户上下文）
```

逐条读法：

| 编号 | 事实 | 为什么致命 |
|---|---|---|
| **B1-1** | 扩展对**单次**模型操作有效 | 这是 D-7 唯一成立的那部分 |
| **B1-2** | 扩展挂在 `$allModels` 上时，紧随其后的 `$queryRawUnsafe` 得 0 行 | 6 处产品 raw SQL（pgvector 检索、kol-sync）不在覆盖面内。改挂 client 级 `$allOperations` 能拦到 raw（已实测可拦），但同样受 B1-3/B1-4 的约束 |
| **B1-3** | interactive 事务连接上 `app.tenant_id` 是空的，同一段代码却查到了 3 行 | 说明 `query(args)` **没有在调用方的事务里执行**——它被扩展搬进了另一个事务 |
| **B1-4** | 调用方事务回滚后，事务内写的那行**还在** | `$transaction` 退化成"看起来像事务"。gate.ts 的两步票据、register.ts 的"要么全成要么全无"全部依赖真原子性 |
| **B2-1** | `user.findUnique({email})`（`src/lib/auth/index.ts:25`、`:61`）在 kol_app 下恒 null | 登录的输入只有 email，租户是这次查询的**产物**；RLS 却要求先有租户才能查 |
| **B2-2** | `tenant.create` 被 WITH CHECK 拒 | 注册要在事务里建 Tenant，而"要建的那个租户"此刻还不存在，无从注入 |
| **B2-3** | `tenant.findUnique({slug})` 恒 null | `tenantIdBySlug`（`src/lib/agent/context.ts:31`）是 `systemContext` 的第一步，F010 的 scheduler/scripts 全依赖它 |
| **B3** | `set_config(local=false)` 后 12 次并发查询里有 1 次看得见数据 | 会话级变量**粘在某条池连接上**。用非事务局部注入 = 制造一个"后续无关请求继承上一个租户上下文"的跨租户泄漏面，比没有 RLS 更坏 |

> B3 同时是对 F009 acceptance 那条「跨事务不残留」的正面回答：**只有 `SET LOCAL`（`set_config(..., true)`）
> 语义可用**，而它要求每条查询都在一个**已经注入过**的事务里——这正是 B1-3/B1-4 卡住的地方。

---

## 2. 需要裁决的问题

### Q1 · 引导路径（bootstrap）怎么办？ ← **必须先答，其余都依赖它**

登录查用户、注册建租户、slug→租户解析，这三件事在 RLS 下无解，除非给它们一条例外通道。候选：

| 方案 | 做法 | 代价 / 风险 |
|---|---|---|
| **Q1-A 双 client** | 保留一个**特权** client 专供白名单引导查询（`findUserByEmail` / `tenantIdBySlug` / 注册事务），其余全走 kol_app | 需要一份**显式白名单 + 源码级普查钉**（否则白名单会悄悄变长，RLS 变装饰）。改动落在 `src/lib/auth/**`（本域硬边界外，需 Planner 指派） |
| **Q1-B policy 例外** | 给 `User` 加一条允许按 email 精确查的 policy、给 `Tenant` 加 INSERT 例外 | policy 里写 `USING (true) FOR SELECT` 就等于把 User 表整张开放；"按 email 精确查"在 RLS 里表达不出来（policy 看不到 WHERE 条件） |
| **Q1-C SECURITY DEFINER 函数** | 引导查询走特权函数（`auth_lookup_user(email)` 等），函数内部限定只返回必要列 | 表达力足够、面最小；但把一段业务逻辑搬进 SQL 函数，迁移与测试都要跟着改 |
| **Q1-D 认证域不上 RLS** | `User` / `Tenant` 两张表不启用 RLS，靠应用层 where + 会话保证 | 与 D-6「Tenant 按 id 隔离」直接冲突，且 `User` 表泄漏面 = 全租户邮箱清单 |

**Generator 倾向 Q1-A（双 client + 白名单 + 普查钉）**：它把"例外"变成**可数、可钉、可复查**的一小撮
（当前 = 3 个查询点），而 Q1-B 的例外写进 policy 后没人再能从代码里看见它，Q1-D 直接放弃两张最敏感的表。

### Q2 · 注入机制选哪一种？（Q1 定了才有意义）

| 方案 | 做法 | 实测/评估 |
|---|---|---|
| **Q2-A** D-7 字面（每操作自开批量事务） | Prisma 官方 RLS 范例 | **已实测不可用**：B1-3 / B1-4，静默毁原子性 |
| **Q2-B** 显式租户事务包装器 | 提供 `withTenant(tenantId, fn)`：内部开 interactive tx → 先 `set_config(local=true)` → 回调里用该 tx；14 处 `$transaction` 调用点改为它，非事务的单次查询也经它 | 语义正确、原子性保留；**代价 = 触碰全部数据访问点**，且"忘了包"不会报错（需要一条普查断言把裸用单例的点钉住） |
| **Q2-C** AsyncLocalStorage + 包装器 | 在 `buildToolContext` / `systemContext` 处 `als.enterWith(tenantId)`，包装器从 ALS 取租户 | 调用点改动小得多；但 ALS 在 Next 的 RSC / route / scheduler 三种执行上下文里的传播需实测（尤其 `enterWith` 的边界），且"忘了进入 ALS"同样静默 |
| **Q2-D** 每租户连接 | 按租户取连接并在连接上 `SET`（非 local） | **实测不可行**：B3 证明连接池不给这种保证 |

**Generator 倾向 Q2-C，但把 Q2-B 的包装器作为其底座**（ALS 只负责"租户从哪来"，包装器负责"事务内注入"），
并要求配套一条**源码级普查断言**：任何直接使用单例 client 的数据访问点必须在白名单里。
**前提是 Q1 已定**——否则包装器包不住引导查询。

### Q3 · 本批要不要真把运行时切到 kol_app？

Q1+Q2 落地是**跨域大改**（auth 域 + 全部数据访问点 + 14 处事务 + 6 处 raw SQL + F010 的 scheduler/scripts 面），
远超 F009 一条 feature 的体量。可选：

- **Q3-A**：本批只到 F008（RLS 已就位、default-deny 已可证、kol_app 已建、哨兵已装），
  **运行时暂不切换**（`DB_APP_ROLE_RUNTIME` 保持关闭），F009/F010 的注入与收敛另开一批；
  F011 负向套件照做——它本来就自建 kol_app 连接，能真实证明"DB 侧隔离已生效"。
- **Q3-B**：本批硬吃下 Q1+Q2，接受批次规模翻倍与 auth 域被改动。

**Generator 倾向 Q3-A**：F007+F008 已经把"RLS 从 0 到 1"这件不可逆的地基做完且可证；
把"全站切非特权连接"这件牵动每一处数据访问的事塞进同一批，会让本批的验收面变成整站回归。
> 注：Q3-A 下 F009 acceptance 的「性能：全量 vitest 时长不劣化 >20%」自然满足（未接管运行时 → 零开销），
> 但那不是"做到了"，是"没做"——如实标注，不当成绿。

### Q4 · 若采纳 Q3-A，F009/F010/F011 的口径怎么改？

- **F009**：改写为"注入机制设计 + 双 client 白名单 + 包装器 + 普查钉"的**独立批次**（建议 M5.1），
  acceptance 里必须含 B1-4 那条原子性回归（回滚后零残留）与 B3 那条残留回归。
- **F010**：`systemContext` 在 kol_app 下不可用（B2-3）。若运行时不切换，F010 照原样可做；
  若切换，它必须先有 Q1 的通道。
- **F011**：不受影响，可照原 acceptance 做（自建 kol_app 连接 + 双租户 + API/DB 双证）。
  但 **API 层那半条**要注意：应用运行时仍是特权连接时，API 层证的是"应用层 where 有效"，
  **不是** RLS 有效——报告里必须写清楚这两层的分工，不能让它读起来像"RLS 在 API 层也证过了"。

---

## 3. 本域已交付部分与 F009 的接线关系（供裁决参考）

- F007 已把"应用运行时是否走 kol_app"做成**一个显式开关** `DB_APP_ROLE_RUNTIME=1`（默认关）。
  这就是 F009 的唯一接线点：注入落地后打开它，其余代码不用再改连接。
- 开关关闭时：应用/脚本/既有 137 个测试文件全部走特权连接，**RLS 对它们完全无影响**（F008 已实测）；
  启动哨兵会持续打印「RLS 不生效」告警——刻意保留的可见状态，别当噪声消掉。
- 开关打开而连接串配回特权时：启动即抛（fail-closed，已双向实测）。

---

## 4. Planner 裁决段（2026-08-04,用户实答确认)

**短格式:#Q1:A #Q2:B+C #Q3:A #Q4:按报告建议采纳。**

| 决议 | 理由(可复用) |
|---|---|
| Q3:**A**(本批止步 F008,F009 移出另立 M5.1) | 「全站切非特权连接」牵动每一处数据访问点(14 处事务 + 6 处 raw + auth 域 + F010 面),塞进同批会让验收面变成整站回归——违反范围克制原则(partial-pending 裁决属良性,pre-impl §11);F007 的 `DB_APP_ROLE_RUNTIME` 开关(默认关+哨兵告警)已把「地基就位但未切换」做成可见、可证、fail-closed 的中间态,不留静默半成品 |
| Q1:**A**(双 client + 显式白名单 + 源码级普查钉) | 例外必须**可数、可钉、可复查**(当前恰 3 个引导查询点);Q1-B 的 policy 例外写进 DB 后从代码不可见,Q1-D 直接放弃两张最敏感的表(User 泄漏面=全租户邮箱清单),Q1-C 把业务逻辑搬进 SQL 函数的迁移/测试成本本批不值 |
| Q2:**B+C**(withTenant 包装器为底座保事务内 SET LOCAL,ALS 只负责「租户从哪来」) | 原子性是不可让步项(B1-4 回归必须入 M5.1 acceptance);ALS 减少调用点改动但传播性(RSC/route/scheduler 三上下文)必须实测为硬 acceptance;「忘了包/忘了进 ALS」两类静默都由普查钉兜(裸用单例必须在白名单) |
| Q4 | F009 → M5.1 批次(backlog `BL-M51-TENANT-INJECTION`,B1-4 原子性回归 + B3 残留回归写死为 acceptance);F010 照原样(运行时未切,systemContext 可用);F011 照做,但**报告必须写清两层分工**:API 层证的是应用层 where 有效,DB 层(自建 kol_app 连接)证的才是 RLS 有效——不得读起来像「RLS 在 API 层也证过了」(F011 acceptance 已同步修订) |

**同步修订文件清单(同 commit):** `features.json`(F009 移出,F011 acceptance 补两层分工句)· `backlog.json`(+BL-M51-TENANT-INJECTION)· `docs/specs/M5-AUTH-RLS-spec.md`(§7 裁-6)· `progress.json`(total 13→12)。

**Generator 可直接开工 F010/F011,不必再确认。**
