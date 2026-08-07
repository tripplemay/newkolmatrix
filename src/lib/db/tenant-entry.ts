// M5.1b-TENANT-INJECTION F005（spec D-6 最小闭环）— **会话面入口**的租户作用域包裹点。
//
// 【它在链条上的位置】
//   middleware（401/302）→ 入口（route handler / RSC page）→ **本模块** → withTenant
//     → ALS 作用域 → lib/db/prisma 代理解析到该事务的 tx → 领域函数/数据访问点
//
// 入口是**唯一**能同时知道「谁在请求」（会话）与「这一整段是一次事务」（请求边界）的地方：
// 更靠里包（在领域函数里包）会让同一请求开出多个互不原子的事务；更靠外包（middleware）
// 拿不到 Prisma（edge runtime）也划不出事务边界。故会话面的包裹点定死在入口这一层。
//
// 【为什么会话解析在事务**外**】`requireSessionIdentity()` 读的是 JWT（next-auth 的
// cookie 解码），不碰库。把它放进 `withTenant` 的回调里等于「先占一条连接开着事务，
// 再去解 cookie」——白白拉长事务持有时间；解不出会话时还得先回滚一个什么都没做的事务。
// 而且租户 id 是开作用域的**入参**，本来就必须先于事务存在。
//
// 【当前接线面（F005 = 最小闭环的三条，不是全站）】
//   · route handler：src/app/api/nav-badges/route.ts
//   · RSC page：    src/app/admin/knowledge/page.tsx
//   · scheduler：   src/lib/jobs/scheduler.ts 的 health-scan（无会话面，直接 withTenant，不经本模块）
// 其余 30 个 route / 12 个 admin page / 3 条例程**尚未包裹**——这是 spec D-6 划定的边界
//（M5.1b 只证机制成立，全站收口在 M5.2），未覆盖清单由 F007 落盘。开关未开时它们行为不变；
// 开关一开，未包裹的入口会**当场抛 MissingTenantScopeError**（fail-closed，不是静默零行）。
//
// 【嵌套是预期形态，不是意外】入口包裹后，领域层既有的 `withTenant`（F004 迁移的 13 处）
// 全部变成同租户嵌套 → 复用外层事务、不开第二个（tenant-scope.ts 的嵌套语义）。
// 但**带事务选项的那种嵌套会抛** `NestedTransactionOptionsError`（如 gate.ts 的 90s 外呼事务）——
// 这是刻意的 fail-closed，M5.2 把入口面铺开时必须逐条处置，不能靠本模块偷偷吞掉选项。
// 当前三条入口的下游均无带选项的 withTenant（F005 实测普查，见 commit 正文）。

import { requireSessionIdentity, type SessionIdentity } from 'lib/auth/session-tenant';
import { withTenant, type TenantTx, type TenantTxOptions } from 'lib/db/tenant-scope';

/**
 * 在「当前登录会话的租户」作用域内执行 fn（会话面入口的标准包裹）。
 *
 * 无会话 → `MissingSessionTenantError`（fail-closed，不回落任何默认租户）；
 * 有会话 → 开一个事务、SET LOCAL app.tenant_id、在 ALS 作用域内跑 fn。
 *
 * fn 拿到 `identity`（租户 + 留痕用 actor）与 `tx`；**多数调用点只需要 identity.tenantId**，
 * 数据访问照旧写 `prisma.xxx`（代理自动落到这个 tx 上），不必把 tx 一路传下去——
 * 「调用点零改写」正是 D-1 选 ALS 代理的理由。
 */
export async function withSessionTenant<T>(
  fn: (identity: SessionIdentity, tx: TenantTx) => Promise<T>,
  txOptions?: TenantTxOptions,
): Promise<T> {
  const identity = await requireSessionIdentity();
  return withTenant(identity.tenantId, (tx) => fn(identity, tx), txOptions);
}
