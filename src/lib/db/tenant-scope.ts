// M5.1-TENANT-INJECTION F001（spec D-3 底座 / D-4）— 租户作用域：AsyncLocalStorage + withTenant
// + MissingTenantScopeError。
//
// 【它解决什么】RLS policy 认会话变量 app.tenant_id
//（prisma/migrations/20260804180000_m5_rls_tenant_isolation/migration.sql:32-36），
// 而该变量必须以 is_local=true 设在**事务内**——set_config 第三参 true = 事务结束即失效；
// 用会话级（false）会粘连接池，审计 B3 实测 12 次并发有 1 次看得见别租户数据，比没有 RLS 更坏。
// withTenant 把「开事务 → SET LOCAL → 业务回调」钉成一个不可拆开的整体，ALS 把这次事务的
// tx client 传给它作用域内的所有数据访问点——注入落点因此能做成 ALS 感知代理
//（D-1：73 个 src 文件、206 处调用点零改写），代理本体在 lib/db/prisma.ts。
//
// 【嵌套语义归 F002】同租户嵌套复用既有 tx（不开第二事务）、跨租户嵌套抛错，连同 B1-4 原子性
// 与 B3 残留两条硬回归，都是 F002 的 acceptance。本 feature（F001）只交付单层语义——全仓此刻
// 没有任何 withTenant 调用点（15 处 $transaction 迁移是 F004），提前写嵌套分支 = 没有测试锚的
// 死代码。在 F002 落地前**不要嵌套调用** withTenant。

import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma } from '@prisma/client';
import { getRuntimeDb } from './runtime';

/** withTenant 开出的 interactive transaction client 类型（spec D-3 签名里的 TenantTx）。 */
export type TenantTx = Prisma.TransactionClient;

/** ALS 里携带的一次租户事务作用域。 */
export interface TenantTxScope {
  tenantId: string;
  tx: TenantTx;
}

/**
 * 开关打开且无 ALS 作用域时，`prisma` 代理抛这个错（spec D-4：fail-closed）。
 *
 * 为什么必须抛而不是回落运行时 client：回落 = 无 app.tenant_id 变量的 kol_app 查询
 *  = default-deny policy 下**静默零行**——正是 app-role.ts:98-107 点名的失败模式
 * （"没数据但不报错"比报错危险得多）。独立错误类是为了让断言钉类型而不是钉字符串：
 * 有人把抛错改回回落时，「返回了 client」和「抛了别的错」两种退化都逃不过用例。
 */
export class MissingTenantScopeError extends Error {
  constructor() {
    super(
      '[db] DB_APP_ROLE_RUNTIME=1（运行时走 kol_app，RLS 真实生效）但当前数据访问不在任何 ' +
        'withTenant 租户作用域内——继续下去只会得到静默零行。入口须先建立租户作用域' +
        '（会话面由入口包裹，无会话面显式 withTenant）；引导查询（登录/注册/slug 解析等）' +
        '改用 privilegedDb，白名单见 spec D-5 / F003。',
    );
    this.name = 'MissingTenantScopeError';
  }
}

const tenantTxAls = new AsyncLocalStorage<TenantTxScope>();

/** 当前 ALS 里的租户事务作用域；没有则 undefined。`prisma` 代理每访问一次属性就查一次。 */
export function getTenantTxScope(): TenantTxScope | undefined {
  return tenantTxAls.getStore();
}

/**
 * 在租户作用域内执行 fn（spec D-3）：
 *  ① 在运行时 client 上开一个 interactive 事务，第一条语句把 app.tenant_id 以
 *     is_local=true SET LOCAL 进该事务（spec §4.3 定死的形态；第三参改 false 必须让
 *     F002 的 B3 回归红）；
 *  ② fn 及 ALS 作用域内所有经 `prisma` 代理的访问（含 $queryRawUnsafe / $executeRawUnsafe，
 *     B1-2「raw SQL 不在覆盖面」的根治点）都落在这同一个事务上；
 *  ③ fn 抛错 → 事务回滚，错误原样上抛（原子性归调用方——审计 B1-4 实测「$extends 方案
 *     回滚后行仍在」的根治点）。
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return getRuntimeDb().$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
    return tenantTxAls.run({ tenantId, tx }, () => fn(tx));
  });
}
