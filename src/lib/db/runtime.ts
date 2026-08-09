// M5.1-TENANT-INJECTION F001（spec D-2）— 应用运行时 client（三层分工的第二层）。
//
//   privilegedDb（lib/db/privileged.ts）  恒 DATABASE_URL，仅引导白名单用，RLS 对它不生效
//   本模块（运行时 client）               DB_APP_ROLE_RUNTIME=1 → DATABASE_URL_APP（kol_app，
//                                         RLS 真实生效）；否则 DATABASE_URL（与今日逐位一致，D-8）
//   prisma（lib/db/prisma.ts）            ALS 感知代理，全部既有调用点不动
//
// 【谁在直接 import 本模块（as-built，实测）】src/ 下恰三处：
//   ① lib/db/prisma.ts        代理的分支三：无 ALS 作用域且开关未开时回落到运行时 client
//   ② lib/db/tenant-scope.ts  withTenant 在其上开 interactive 事务
//   ③ src/instrumentation.ts  BYPASSRLS 启动哨兵（M5.1b F003 接入）——它要问的正是
//      「应用运行时到底连的是谁」，因此必须拿**运行时 client** 本体：
//        · 传 `prisma` 代理 → 开关开时无 ALS 作用域，代理抛 MissingTenantScopeError，
//          而该异常被 app-role.ts 的「连不上库只告警」catch 吞掉 → status='unknown'，
//          哨兵 enforced=true 却永远走不到判定，**安全装置静默失效**；
//        · 传 privilegedDb → 恒是特权连接，哨兵恒答「特权」→ 永假警报。
// 其余任何 src/ 文件 import 本模块都等于绕过 ALS 注入面。
//
// 【这份清单有一道钉在守：tests/unit/db-layer-importer-census.test.ts】
// **本注释不对那道钉的覆盖面作任何承诺** —— 它抓得到什么、抓不到什么，以那个文件的
// 「扫描口径与两类已知假阳性」「已知边界」两段为准（那里有实测支撑的回归用例）。
//
// > fix-3 更正（用户裁决：注释只指向钉，不承诺完备性）：上一版这里写的是
// > 「机械守住（新增 importer 即红并点名）」。第二次复验实测证伪 —— 当时至少两种**真实
// > import 语法**逃逸（侧效应 import 后跟 from-import；反引号动态 import），
// > 而 src/instrumentation.ts 用的正是动态 import。那两条已修并配回归用例，
// > 但「即红并点名」这种**承诺完备性**的写法本身才是病根：它把读者的核查责任
// > 转移给了一道谁也没证明其完备的正则。以后一律只指路，不背书。
// >（docs/test-reports/M5.1b-rv2-F008-F001.md）
//
// > 更正记录（M5.1b F008；行号部分经首轮验收再次更正，见下）：原文写「只有
// > ① lib/db/tenant-scope.ts ② src/instrumentation.ts」，**两头都错**——漏列了真实 importer
// > lib/db/prisma.ts；而 src/instrumentation.ts 当时动态 import 的并不是本模块。该失实由
// > M5.1 的 spec-lock 稽核以 grep 证伪，且会直接把 F003 的白名单口径带偏
// > （docs/test-reports/M5.1-F001-spec-lock-review.md §4）。
// >
// > 二次更正（M5.1b fix-1）：上一版更正记录里写的「见该文件 :14-15」在批末已失实——F003 把
// > instrumentation.ts 的哨兵改成取**运行时 client 本体**之后，那两条动态 import 变成
// > `./lib/db/runtime` 与 `./lib/db/app-role`，位置也随之移动。**故此处不再写行号**：
// > 行号是最容易漂的一类事实，而本段没有钉守它。上面那份 importer 清单（① ② ③）才是
// > 有钉守的部分（tests/unit/db-layer-importer-census.test.ts 扫实物比对）——覆盖面以那个文件为准，
// > 此处不作承诺（同上条 fix-3 裁决）。
//
// 【与 F003 白名单的分工，别混】本清单守的是「谁在用运行时 client」（注入面完整性）；
// F003 的普查钉守的是「谁在用 privilegedDb」（越权面）。两者判据不得互相派生——
// 互相派生则一处失效两处同时瞎。
//
// 连接串解析**复用** app-role.ts:91-117 的 resolveRuntimeDatabaseUrl / isAppRoleRuntimeEnabled
//（M5 F007 已交付），不重写。schema.prisma 的 datasource 刻意不动：那会把 prisma migrate 的
// 连接一起改掉，而迁移必须保持特权（M5 D-5）。

import { PrismaClient } from '@prisma/client';
import { resolveRuntimeDatabaseUrl } from './app-role';

// Next dev 热重载会反复 new PrismaClient → 连接风暴（原 prisma.ts 单例的既有教训），
// globalThis 兜底。缓存键 = 解析出的连接串：正常情况下一个进程只有一条；测试进程用
// 进程级 env 覆盖翻开关时（spec §5.1 的最小闭环跑法），会按串各拿一个 client，
// 而不是粘着进程启动时解析到的那一条。
const globalForRuntime = globalThis as unknown as {
  runtimeClients: Map<string, PrismaClient> | undefined;
};

function createRuntimeClient(datasourceUrl: string | null): PrismaClient {
  return new PrismaClient({
    // null = 未开开关 / 未配 kol_app 串 → 回落 schema datasource 的 env("DATABASE_URL")，
    // 与原 prisma.ts 单例的构造参数逐位一致（D-8：开关关 = 行为不变）。
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/**
 * 运行时 client 单例。连接串在**每次调用时**重新解析（process.env 是进程级事实，
 * 读取零成本），同一串命中同一个实例——这使「开关开 → kol_app」对测试进程可观测，
 * 而生产进程 env 不变、恒命中同一实例。
 */
export function getRuntimeDb(): PrismaClient {
  const url = resolveRuntimeDatabaseUrl();
  const key = url ?? '__default__';
  const cache = (globalForRuntime.runtimeClients ??= new Map<string, PrismaClient>());
  let client = cache.get(key);
  if (!client) {
    client = createRuntimeClient(url);
    cache.set(key, client);
  }
  return client;
}

// 【刻意在模块加载时就构造一次（F001 building 期实测回归的修复）】
// new PrismaClient() 的构造会重载 .env（Prisma 6 client runtime 内嵌 dotenv；只补缺失键、
// 不覆盖在场键——探针实测：delete 掉的 AIGCGATEWAY_API_KEY 在构造后重新出现）。
// 原 prisma.ts 单例在**模块 import 时**构造，这次重载因此发生在任何测试 beforeAll 清凭据之前；
// 若改成首次访问才懒构造，重载会落在「清凭据」之后，把已删的 AIGCGATEWAY_* 重新塞回，
// weekly-draft-routine 的「零外呼降级」用例就会真打网关（Invalid API key，2 条红）。
// 保持 import 期构造 = 保持原时序 = 开关关时逐位不变（D-8）。测试进程翻开关时
// getRuntimeDb() 按连接串缓存再建第二个实例，与本行的急切构造不冲突。
getRuntimeDb();
