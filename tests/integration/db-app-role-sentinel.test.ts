// M5-AUTH-RLS F007（spec D-5）— 非特权应用角色 kol_app + BYPASSRLS 哨兵的**双向实测**。
//
// 为什么必须打真库：本 feature 断言的全部内容都是「数据库里那个角色到底是什么属性」——
// 角色属性、GRANT 覆盖面、DEFAULT PRIVILEGES、以及哨兵在两种连接下的相反结论。mock 一个
// pg_roles 行只能证明「代码会读这张表」，证不了角色真的建成了非特权。
//
// 两条连接（D-5 / D-8）：
//   DATABASE_URL      特权（dev=kol / CI=postgres）：迁移与既有 135 个测试文件继续走它
//   DATABASE_URL_APP  非特权 kol_app：应用运行时与 RLS 套件走它
// 本文件**显式各建一个 client**（不用 lib/db/prisma 单例）——单例在测试进程里恒是特权连接
//（DB_APP_ROLE_RUNTIME 未开），要证"两种连接结论相反"就必须自己持有两条。
//
// 缺 DATABASE_URL_APP 时本文件**直接失败而不是跳过**：一道"没配就自动通过"的门等于没有门
//（本仓 vitest.config.ts 注释里对 CI 无库的同款反模式已有定论）。建角色：`npm run db:app-role`。

import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import {
  PrivilegedConnectionError,
  assertNonPrivilegedConnection,
  inspectConnectionRole,
  isAppRoleRuntimeEnabled,
  isPrivilegedConnection,
  isRoleSentinelEnforced,
  resolveAppDatabaseUrl,
  resolveRuntimeDatabaseUrl,
  runConnectionRoleSentinel,
} from '../../src/lib/db/app-role';

const privilegedUrl = process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_URL_APP;

if (!privilegedUrl) {
  throw new Error('[F007] 缺 DATABASE_URL（特权连接）——集成测试需要真库');
}
if (!appUrl) {
  throw new Error(
    '[F007] 缺 DATABASE_URL_APP（非特权 kol_app 连接）。' +
      '本机：npm run db:app-role 后按 .env.example 补该键；CI：见 ci.yml unit job。' +
      '刻意不 skip——静默跳过的隔离测试比没有测试更危险。',
  );
}

/** 特权连接（迁移/既有测试用的那条）。显式建：本文件要拿它做"哨兵必须翻红"的反向证明。 */
const privileged = new PrismaClient({ datasourceUrl: privilegedUrl });
/** 非特权连接（应用运行时目标角色）。显式建：单例在测试进程里不会切过来。 */
const app = new PrismaClient({ datasourceUrl: appUrl });

afterAll(async () => {
  await Promise.all([privileged.$disconnect(), app.$disconnect()]);
});

/** 记录用的静默 logger（哨兵会往 console 写，测试里不需要噪声，但要能断言分级）。 */
function collectLogger() {
  const lines: { level: string; msg: string }[] = [];
  return {
    lines,
    logger: {
      info: (m: string) => lines.push({ level: 'info', msg: m }),
      warn: (m: string) => lines.push({ level: 'warn', msg: m }),
      error: (m: string) => lines.push({ level: 'error', msg: m }),
    },
  };
}

describe('F007 kol_app 角色本体（scripts/db/create-app-role.sql 的落库结果）', () => {
  it('kol_app 存在且属性为 NOSUPERUSER / NOBYPASSRLS / NOCREATEDB / 可登录', async () => {
    const rows = await privileged.$queryRawUnsafe<
      Array<{
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolcanlogin: boolean;
      }>
    >(
      `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
         FROM pg_roles WHERE rolname = 'kol_app'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolcanlogin: true,
    });
  });

  it('迁移连接（DATABASE_URL）保持特权 —— D-5 明文分工，不是巧合', async () => {
    const info = await inspectConnectionRole(privileged);
    expect(isPrivilegedConnection(info)).toBe(true);
  });

  it('DATABASE_URL_APP 连上去的确实是非特权角色（不是同一条串写了两遍）', async () => {
    const [appInfo, privilegedInfo] = await Promise.all([
      inspectConnectionRole(app),
      inspectConnectionRole(privileged),
    ]);
    expect(appInfo.superuser).toBe(false);
    expect(appInfo.bypassRls).toBe(false);
    expect(appInfo.role).not.toBe(privilegedInfo.role);
  });

  it('kol_app 对全部业务表持有常规 DML（GRANT 覆盖面 = 库里实物表清单）', async () => {
    const rows = await privileged.$queryRawUnsafe<
      Array<{ relname: string; sel: boolean; ins: boolean; upd: boolean; del: boolean }>
    >(
      `SELECT c.relname,
              has_table_privilege('kol_app', c.oid, 'SELECT') AS sel,
              has_table_privilege('kol_app', c.oid, 'INSERT') AS ins,
              has_table_privilege('kol_app', c.oid, 'UPDATE') AS upd,
              has_table_privilege('kol_app', c.oid, 'DELETE') AS del
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND c.relname <> '_prisma_migrations'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(24);
    const missing = rows.filter((r) => !r.sel || !r.ins || !r.upd || !r.del);
    expect(missing.map((r) => r.relname)).toEqual([]);
  });

  it('kol_app 拿不到 TRUNCATE（TRUNCATE 不受 RLS 约束，给了就是绕过隔离的后门）', async () => {
    const rows = await privileged.$queryRawUnsafe<Array<{ trunc: boolean }>>(
      `SELECT has_table_privilege('kol_app', '"Kol"'::regclass, 'TRUNCATE') AS trunc`,
    );
    expect(rows[0]?.trunc).toBe(false);
  });

  it('DEFAULT PRIVILEGES 已挂在迁移角色上 —— 将来新建的表自动带 DML 授权', async () => {
    const rows = await privileged.$queryRawUnsafe<Array<{ acl: string }>>(
      `SELECT array_to_string(d.defaclacl, ',') AS acl
         FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
        WHERE n.nspname = 'public' AND d.defaclobjtype = 'r'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.acl.includes('kol_app='))).toBe(true);
  });
});

describe('F007 BYPASSRLS 哨兵：同一函数，两条连接，结论相反', () => {
  it('kol_app 连接 → 通过并返回角色信息（绿）', async () => {
    const info = await assertNonPrivilegedConnection(app);
    expect(info.superuser).toBe(false);
    expect(info.bypassRls).toBe(false);
  });

  it('特权连接 → 抛 PrivilegedConnectionError（红），错误里点名角色与属性', async () => {
    await expect(assertNonPrivilegedConnection(privileged)).rejects.toBeInstanceOf(
      PrivilegedConnectionError,
    );
    const err: Error | null = await assertNonPrivilegedConnection(privileged).then(
      (): Error | null => null,
      (e: Error): Error => e,
    );
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/rolsuper=true|rolbypassrls=true/);
    expect(err!.message).toContain('DATABASE_URL_APP');
  });

  it('启动哨兵在"已声明跑非特权角色"时对特权连接 fail-closed（抛，且 error 级日志）', async () => {
    const { lines, logger } = collectLogger();
    const env = { DB_APP_ROLE_RUNTIME: '1', DATABASE_URL_APP: appUrl };
    expect(isRoleSentinelEnforced(env)).toBe(true);
    await expect(runConnectionRoleSentinel(privileged, env, logger)).rejects.toBeInstanceOf(
      PrivilegedConnectionError,
    );
    expect(lines.some((l) => l.level === 'error')).toBe(true);
  });

  it('启动哨兵在未声明时只告警不阻断（本机 dev / 既有测试的现状，D-8）', async () => {
    const { lines, logger } = collectLogger();
    const outcome = await runConnectionRoleSentinel(privileged, {}, logger);
    expect(outcome.status).toBe('warned');
    expect(lines.some((l) => l.level === 'warn' && l.msg.includes('RLS 不生效'))).toBe(true);
  });

  it('启动哨兵在 kol_app 连接下恒 ok（无论是否强制）', async () => {
    const { logger } = collectLogger();
    await expect(
      runConnectionRoleSentinel(app, { DB_APP_ROLE_RUNTIME: '1', DATABASE_URL_APP: appUrl }, logger),
    ).resolves.toMatchObject({ status: 'ok', enforced: true });
    await expect(runConnectionRoleSentinel(app, {}, logger)).resolves.toMatchObject({
      status: 'ok',
      enforced: false,
    });
  });
});

describe('F007 连接串解析：事实（有串）与决定（运行时用不用）是两件事', () => {
  it('空串 / 空白视为未配（compose ${VAR:-} 插值出来的就是空串）', () => {
    expect(resolveAppDatabaseUrl({})).toBeNull();
    expect(resolveAppDatabaseUrl({ DATABASE_URL_APP: '' })).toBeNull();
    expect(resolveAppDatabaseUrl({ DATABASE_URL_APP: '   ' })).toBeNull();
    expect(resolveAppDatabaseUrl({ DATABASE_URL_APP: ' postgres://x ' })).toBe('postgres://x');
  });

  it('只有 DB_APP_ROLE_RUNTIME=1 时单例才切 kol_app（默认不切 → 既有面零影响）', () => {
    const withUrl = { DATABASE_URL_APP: 'postgres://x' };
    expect(isAppRoleRuntimeEnabled(withUrl)).toBe(false);
    expect(resolveRuntimeDatabaseUrl(withUrl)).toBeNull();
    expect(resolveRuntimeDatabaseUrl({ ...withUrl, DB_APP_ROLE_RUNTIME: '1' })).toBe(
      'postgres://x',
    );
    // 开关开了但没配串 → 仍回落特权，且哨兵此时是强制模式（会把这种漏配当场炸出来）
    expect(resolveRuntimeDatabaseUrl({ DB_APP_ROLE_RUNTIME: '1' })).toBeNull();
    expect(isRoleSentinelEnforced({ DB_APP_ROLE_RUNTIME: '1' })).toBe(true);
  });

  it('测试进程内的单例走的是特权连接（D-8：既有 135 个测试文件不为 RLS 翻修）', async () => {
    const { prisma } = await import('../../src/lib/db/prisma');
    const info = await inspectConnectionRole(prisma);
    expect(isPrivilegedConnection(info)).toBe(true);
  });
});
