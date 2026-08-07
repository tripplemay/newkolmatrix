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
// 与 B3 残留两条硬回归，都是 F002 的 acceptance。本模块此刻只交付**单层**语义——**产品代码
// （src/）零 withTenant 调用点**（15 处 $transaction 迁移是 F004），提前写嵌套分支 = 没有
// 测试锚的死代码。在 F002 落地前**不要嵌套调用** withTenant：现在没有嵌套守卫，嵌套会静默
// 开第二个事务（正是审计 B1-4 的病灶形态）。
//
// > 更正记录（M5.1b F008）：原文写「全仓此刻没有任何 withTenant 调用点」，**该陈述不成立**——
// > 同批交付的 tests/integration/tenant-injection-proxy.test.ts 自带 5 处调用（:101 :117 :131
// > :223 :247）。「全仓」与「产品代码」不是一回事，此处要的是后者。该失实由 M5.1 的 spec-lock
// > 稽核以 grep 证伪（docs/test-reports/M5.1-F001-spec-lock-review.md §4）。
// > 本段的 importer / 调用点类陈述现由 tests/unit/db-layer-importer-census.test.ts 机械守住。

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

/**
 * 在租户 A 的作用域内又对租户 B 调 withTenant 时抛出（spec D-3 语义三）。
 *
 * 为什么必须抛，而不是「切到 B」也不是「沿用 A」：
 *   · 切到 B —— 外层事务的 app.tenant_id 是 SET LOCAL 的，改了它整个外层事务都跟着变，
 *     外层后续的写会落到 B 名下；调用方完全看不见这次静默换租户。
 *   · 沿用 A —— 调用方明确写了 B，却拿到 A 的数据，是最坏的一种「不报错的错」。
 * 两条都比抛错危险得多。独立错误类是为了让断言钉类型而不是钉字符串。
 */
export class CrossTenantNestingError extends Error {
  readonly outerTenantId: string;
  readonly innerTenantId: string;
  constructor(outerTenantId: string, innerTenantId: string) {
    super(
      `[db] 跨租户嵌套 withTenant：外层作用域是租户 ${outerTenantId}，内层却要求租户 ` +
        `${innerTenantId}。外层事务的 app.tenant_id 是 SET LOCAL 的，改它会把整个外层事务` +
        `一起换掉（后续写将落到别人名下），沿用外层则是「你要 B 却拿到 A」——两种都是静默的` +
        `跨租户事故，故此处 fail-closed。需要跨租户时请在各自的 withTenant 里分别完成。`,
    );
    this.name = 'CrossTenantNestingError';
    this.outerTenantId = outerTenantId;
    this.innerTenantId = innerTenantId;
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
/** 透传给 `$transaction` 的事务选项（M5.1b F004：gate 的外呼事务需放宽超时）。 */
export interface TenantTxOptions {
  timeout?: number;
  maxWait?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * 在**已有**租户作用域内又传事务选项时抛出（M5.1b F004）。
 *
 * 为什么不静默忽略：嵌套时不开新事务，选项无处可施。若静默吞掉，
 * `withTenant(t, fn, { timeout: 90_000 })` 这种「我知道这段要跑很久」的显式声明会**悄悄失效**，
 * 外层默认 5s 超时一到就把长事务打断——而调用点看起来明明写了 90s。
 * 这在 M5.2 把入口面统一包进 withTenant 之后会真实发生（届时所有内层调用都变成嵌套），
 * 故此处 fail-closed，逼调用方显式处理，而不是留一个只在生产超时才现形的坑。
 */
export class NestedTransactionOptionsError extends Error {
  constructor(tenantId: string) {
    super(
      `[db] 已处于租户 ${tenantId} 的 withTenant 作用域内，此处又传了事务选项（timeout / maxWait /` +
        ` isolationLevel）。嵌套不开新事务，这些选项无处可施——静默忽略会让「我知道这段要跑很久」` +
        `的声明悄悄失效。请把选项提到最外层那次 withTenant，或让这段不要被嵌套。`,
    );
    this.name = 'NestedTransactionOptionsError';
  }
}

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
  txOptions?: TenantTxOptions,
): Promise<T> {
  const outer = getTenantTxScope();
  if (outer) {
    if (txOptions) throw new NestedTransactionOptionsError(outer.tenantId);
    // 【嵌套语义（M5.1b F002，spec D-3 语义二/三）】
    // 跨租户 → 抛（理由见 CrossTenantNestingError）。
    if (outer.tenantId !== tenantId) {
      throw new CrossTenantNestingError(outer.tenantId, tenantId);
    }
    // 同租户 → **复用外层事务**：不开第二个事务，也不重设 app.tenant_id。
    //
    // 为什么这条是原子性的关键：若这里另起一个事务，内层的写会在自己的事务里**独立提交**，
    // 外层随后回滚也带不走它——这正是审计 B1-4 实测到的「$transaction 原子性被静默废掉」
    // 的形态（回滚后行仍在）。原子性必须归调用方所有：外层回滚 = 内外层全部回滚。
    // 也不重设变量：SET LOCAL 作用于整个事务，重设等于允许中途改租户（见上面的抛错理由）。
    return fn(outer.tx);
  }
  return getRuntimeDb().$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT set_config('app.tenant_id', $1, true)`, tenantId);
    return tenantTxAls.run({ tenantId, tx }, () => fn(tx));
  }, txOptions);
}
