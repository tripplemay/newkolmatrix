// M5.1-TENANT-INJECTION F001（spec D-2 / D-5）— 特权 client：恒 DATABASE_URL，**仅引导白名单可用**。
//
// 【谁是「引导」】租户还不存在 / 还未知时必须碰库的那几处：登录按 email 查用户、失败登录留痕、
// 注册建租户、slug→租户解析、启动哨兵。它们在 kol_app 连接下必被 RLS 拒（M5 F009 开工前审计
// B2-1/2/3 实测），所以必须走特权连接——但特权连接绕过**全部** RLS policy（owner / SUPERUSER
// / BYPASSRLS），这是一道后门，不是一个方便入口。
//
// 【后门怎么防滥用】裁决对例外的实质要求是「可数、可钉、可复查」：白名单 = import 本模块的
// 文件集，由 F003 普查产出、逐处写明理由，并由源码级普查钉钉死——白名单外的任何新 import
// 都会让那条钉红并点名文件。本模块刻意**不读** DB_APP_ROLE_RUNTIME / DATABASE_URL_APP：
// privileged = 特权，不依赖任何间接解析。
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
