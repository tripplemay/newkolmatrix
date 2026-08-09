// M5.1-TENANT-INJECTION F001（spec D-1 / D-4）— `prisma` 导出名不变，实体换成 ALS 感知代理。
//
// 【为什么是代理（D-1，2026-08-06 用户实答）】src/ 下 73 个文件、206 处模型调用点逐个改写，
// 等于付了 ALS 的复杂度却不收它「调用点改动小」的收益；既有 142 个测试文件按 D-8 不翻修。
// 代理把注入落点收进这一个模块——每次属性访问时按**当下**状态解析真实目标（spec D-4 三分支）：
//
//   ① ALS 有租户事务（withTenant 作用域内）→ 该事务的 tx client。
//      模型调用与 $queryRawUnsafe / $executeRawUnsafe 都落在这同一个事务上
//     （后者是审计 B1-2「raw SQL 不在覆盖面」的根治点）。TransactionClient 没有
//      $transaction —— 作用域内调它会在运行期当场暴露，15 处调用点的迁移是 F004。
//   ② 无 ALS + DB_APP_ROLE_RUNTIME 未开 → 运行时 client（= 特权连接，行为与今日逐位一致，
//      D-8：既有测试面 / dev server / scripts 零改动零影响）。
//   ③ 无 ALS + DB_APP_ROLE_RUNTIME=1 → 抛 MissingTenantScopeError（fail-closed）。
//      回落到「无变量的 kol_app 查询」= default-deny 下静默零行，是 app-role.ts:98-107
//      点名的失败模式；「忘了包裹」必须当场炸，不能装作没数据。
//
// 【历史沿革】原 M5-AUTH-RLS F007 单例（连接串分工 + globalThis 防热重载连接风暴）已搬入
// lib/db/runtime.ts（D-2 三层分工）；schema.prisma 的 datasource 刻意不动（迁移必须保持
// 特权，M5 D-5）。

import { Prisma, PrismaClient } from '@prisma/client';
import { isAppRoleRuntimeEnabled } from './app-role';
import { getRuntimeDb } from './runtime';
import { MissingTenantScopeError, getTenantTxScope } from './tenant-scope';

/** 代理每一次属性访问都重新解析目标：ALS 状态与开关都是「当下」事实，不是模块加载时的快照。 */
function resolveDelegate(): PrismaClient | Prisma.TransactionClient {
  const scope = getTenantTxScope();
  if (scope) return scope.tx;
  if (isAppRoleRuntimeEnabled()) throw new MissingTenantScopeError();
  return getRuntimeDb();
}

/**
 * 全部既有调用点经此代理。类型保持 PrismaClient，调用点零改写、零感知。
 *
 * 【这里原本写着三个数字，M5.1b fix-1 删掉了】原文「73 个 src 文件 / 206 处模型调用 /
 * 15 处 $transaction」经首轮验收实测在批末已全部陈旧（F004 把事务调用点迁走了大半）。
 * 同批 tenant-scope.ts 栽在同一件事上，处置口径统一（理由见该文件说明段）：
 * **注释里的可变数字要么有钉守着，要么不写。**
 *
 * 顺带一条自己踩到的：改这段时想复述一个「当前有多少个 src 文件 import 本模块」的数，
 * 结果 `grep -rl "db/prisma'"` 与 `grep -rl 'db/prisma'` 给出的答案就不一样（一个含尾引号、
 * 一个不含）—— 同一件事换个判据换个数字，正说明这类数不该刻进注释。要看当下实况，
 * 跑 `npm run census:entrypoints`（口径写在脚本里，可复跑、可审）。
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const delegate = resolveDelegate();
    const value = Reflect.get(delegate, prop);
    // PrismaClient 的方法（$queryRawUnsafe / $transaction / $connect …）依赖 this，
    // 必须绑到解析出的真实 client；模型 delegate（prisma.user 这类对象）原样返回即可
    //（它内部已持有所属 client 的引用）。
    return typeof value === 'function' ? value.bind(delegate) : value;
  },
});
