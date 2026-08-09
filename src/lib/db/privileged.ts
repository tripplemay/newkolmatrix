// M5.1-TENANT-INJECTION F001（spec D-2 / D-5）— 特权 client：恒 DATABASE_URL，**仅引导白名单可用**。
//
// 【谁是「引导」】租户还不存在 / 还未知时必须碰库的那几处：登录按 email 查用户、失败登录留痕、
// 注册建租户、slug→租户解析、启动哨兵。它们在 kol_app 连接下必被 RLS 拒（M5 F009 开工前审计
// B2-1/2/3 实测），所以必须走特权连接——但特权连接绕过**全部** RLS policy（owner / SUPERUSER
// / BYPASSRLS），这是一道后门，不是一个方便入口。
//
// 【后门怎么防滥用】裁决对例外的实质要求是「可数、可钉、可复查」：白名单 = import 本模块的
// 文件集，由 F003 普查产出、逐处写明理由。有两道源码级普查钉在这个面上，各守一半：
//   · tests/unit/bootstrap-whitelist-census.test.ts  越权面（谁在动 privilegedDb 这个标识符）
//   · tests/unit/db-layer-importer-census.test.ts    文档面（下面那份清单与实物是否同步）
// **本注释不对这两道钉的覆盖面作任何承诺** —— 它们各自守到哪、已知抓不到哪些形态，
// 一律以那两个文件的头注与用例名为准（那里有变异证活的实跑记录，也有盲区登记）。
// 本模块刻意**不读** DB_APP_ROLE_RUNTIME / DATABASE_URL_APP：
// privileged = 特权，不依赖任何间接解析。
//
// > 更正（M5.1c F002，用户裁决「删承诺句、不再加钉」）：上一版这里写的是
// > 「白名单外的任何新 import 都会让那条钉红并点名文件」。两处不成立：
// > ① 那道白名单钉扫的是 **privilegedDb 标识符的使用**，不是 import —— 而它自己的
// >   「盲区登记」段就列着四种作者未采用的写法能绕过它；
// > ② 这句话把两道钉当成了一道，而两个文件的头注都写着「别互相派生」。
// > 承诺覆盖面的写法把读者的核查责任转移给了一道谁也没证明其完备的判据；改为只指路。
//
// 【引导白名单 as-built（M5.1b F003 普查产出，实测 5 处 / 5 文件）】
//   ① src/lib/auth/index.ts                      登录查用户 ×2 + 登录留痕 ×2（B2-1）
//   ② src/lib/auth/register.ts                   注册事务：要建的租户此刻还不存在（B2-2）
//   ③ src/lib/agent/context.ts                   tenantIdBySlug：systemContext 第一步（B2-3）
//   ④ src/app/api/auth/register/route.ts         注册限速留痕（判定在解析入参之前）
//   ⑤ src/app/api/auth/[...nextauth]/route.ts    登录限速留痕（判定在会话建立之前）
// 每处的「为什么必须绕过 RLS」写在该文件的 import 旁。两道钉各守一面、互不派生：
//   · tests/unit/db-layer-importer-census.test.ts  文档面（清单与实物同步）
//   · tests/unit/bootstrap-whitelist-census.test.ts 越权面（谁在用 + 每条必须有理由）
//
// 【spec D-5 表的两处出入（F003 实测更正）】① 该表漏列了上面 ④⑤ 两个路由文件；
// ② 该表把 src/instrumentation.ts 列为引导点，**判定有误** —— 启动哨兵要问的是
// 「运行时连接是谁」，指向本模块会恒答「特权」。它已改用 getRuntimeDb()，不在本白名单内。
//
// 新增引导点前先回答：为什么这里必须在租户已知之前碰库？把理由写在调用点旁边（spec D-5）。

import { PrismaClient } from '@prisma/client';

// Next dev 热重载会反复 new PrismaClient → 连接风暴；globalThis 单例兜底（同原 prisma.ts 惯例）。
const globalForPrivileged = globalThis as unknown as {
  privilegedDb: PrismaClient | undefined;
};

export const privilegedDb =
  globalForPrivileged.privilegedDb ??
  new PrismaClient({
    // 恒 DATABASE_URL：schema.prisma 的 datasource 本来就是 env("DATABASE_URL")，
    // 显式写出是为了让「这条 client 是特权连接」在源码里一眼可核，不依赖间接默认。
    ...(process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrivileged.privilegedDb = privilegedDb;
}
