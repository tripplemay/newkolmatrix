// M5-AUTH-RLS F007（spec D-5）— 应用运行时的 DB 角色：连接串解析 + BYPASSRLS 运行时哨兵。
//
// 【背景】RLS 对 SUPERUSER 和带 BYPASSRLS 属性的角色**完全不生效，且不报错**。
// 也就是说「连接串配回特权用户」这一个失误，会让 F008 的全部 policy 静默作废——应用照常
// 返回数据，测试照常绿，隔离却已经没了。这是 D-5 点名的本决策最大风险，因此需要一个在
// 运行时**主动去问数据库「我现在是谁」**的哨兵，而不是靠"我们配对了"的信念。
//
// 【双连接分工（D-5 / D-8）】
//   DATABASE_URL      特权（dev=kol / CI=postgres）：prisma migrate、seed、既有 vitest 集成测
//   DATABASE_URL_APP  非特权 kol_app：应用运行时、RLS 负向套件
// 未设 DATABASE_URL_APP 时单例回落 DATABASE_URL —— 这正是本机 dev 与既有 135 个测试文件
// 行为不变的原因（D-8：不为 RLS 翻修既有测试）。

/** 只依赖 raw 查询能力，便于用任意 PrismaClient 实例（含测试里另建的第二连接）调用。 */
export interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface ConnectionRoleInfo {
  /** 连接的有效角色名（current_user）。 */
  role: string;
  /** rolsuper：超级用户无条件绕过 RLS。 */
  superuser: boolean;
  /** rolbypassrls：显式的 RLS 豁免属性。 */
  bypassRls: boolean;
}

/** 哨兵判定为「这条连接能绕过 RLS」时抛出。 */
export class PrivilegedConnectionError extends Error {
  readonly info: ConnectionRoleInfo;
  constructor(info: ConnectionRoleInfo) {
    super(
      `[db] 应用运行时连接用的是特权角色「${info.role}」（rolsuper=${info.superuser} ` +
        `rolbypassrls=${info.bypassRls}）——该角色绕过全部 RLS policy，租户隔离形同虚设。` +
        `请把 DATABASE_URL_APP 指向 kol_app（见 scripts/db/create-app-role.sql）。`,
    );
    this.name = 'PrivilegedConnectionError';
    this.info = info;
  }
}

/** 问数据库这条连接的当前角色及其 RLS 豁免属性。 */
export async function inspectConnectionRole(
  client: RawQueryClient,
): Promise<ConnectionRoleInfo> {
  const rows = await client.$queryRawUnsafe<
    Array<{ role: string; rolsuper: boolean; rolbypassrls: boolean }>
  >(
    `SELECT current_user::text AS role, r.rolsuper, r.rolbypassrls
       FROM pg_roles r WHERE r.rolname = current_user`,
  );
  const row = rows[0];
  if (!row) {
    // 理论上不可达（current_user 必在 pg_roles）。真发生了就当作"查不清 = 不安全"。
    throw new Error('[db] 无法读取当前连接角色（pg_roles 无 current_user 行）');
  }
  return { role: row.role, superuser: row.rolsuper, bypassRls: row.rolbypassrls };
}

/** 能绕过 RLS 的连接 = 特权连接。 */
export function isPrivilegedConnection(info: ConnectionRoleInfo): boolean {
  return info.superuser || info.bypassRls;
}

/**
 * 断言这条连接**不能**绕过 RLS。
 *
 * kol_app 连接下返回角色信息（绿）；特权连接（kol / postgres）下抛 PrivilegedConnectionError（红）。
 * 这条双向性就是 F007 acceptance 的「双向实测」，测试见 tests/integration/db-app-role-sentinel.test.ts。
 */
export async function assertNonPrivilegedConnection(
  client: RawQueryClient,
): Promise<ConnectionRoleInfo> {
  const info = await inspectConnectionRole(client);
  if (isPrivilegedConnection(info)) {
    throw new PrivilegedConnectionError(info);
  }
  return info;
}

type EnvLike = Record<string, string | undefined>;

/**
 * 非特权 kol_app 连接串（`DATABASE_URL_APP`），没配则 null。
 * 空串 / 纯空白视为未设——compose 里 `${VAR:-}` 插值出来的就是空串，不能当成"配了"。
 *
 * **谁消费它**：① RLS 相关测试套件（本域哨兵测试 / F011 负向套件）——它们显式建自己的
 * PrismaClient，永远消费；② 应用运行时单例——见下面的 `resolveRuntimeDatabaseUrl`，
 * 需要额外开关。
 */
export function resolveAppDatabaseUrl(env: EnvLike = process.env): string | null {
  const raw = env.DATABASE_URL_APP;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * 应用运行时是否已切到 kol_app（`DB_APP_ROLE_RUNTIME=1`）。
 *
 * 【为什么不是"配了 DATABASE_URL_APP 就切"】非特权连接下 RLS 真的生效，而 policy 认的是
 * 会话变量 `app.tenant_id`（F008）。在**租户变量注入（spec D-7 / F009）落地之前**把运行时切过去，
 * 每一条查询都会得零行——dev 服务器、e2e 脚本、生产应用全部"没数据但不报错"。
 * 而 DATABASE_URL_APP 又必须能被测试进程读到（vitest 读同一份 .env / 同一份 CI job env），
 * 于是"有连接串"和"运行时用它"必须是两件事：前者是事实，后者是决定。
 *
 * 这个开关就是 F009 的接线点：注入落地后由 F009 / 部署配置打开（deploy.md 前置段已写明）。
 */
export function isAppRoleRuntimeEnabled(env: EnvLike = process.env): boolean {
  return env.DB_APP_ROLE_RUNTIME === '1';
}

/** 单例真正使用的连接串：开关打开且连接串已配 → kol_app；否则 null（回落 DATABASE_URL）。 */
export function resolveRuntimeDatabaseUrl(env: EnvLike = process.env): string | null {
  if (!isAppRoleRuntimeEnabled(env)) return null;
  return resolveAppDatabaseUrl(env);
}

/**
 * 哨兵是否为强制模式（违反即抛，而非只告警）。
 *
 * 强制条件 = 配置已**声明**"应用运行时跑非特权角色"（`DB_APP_ROLE_RUNTIME=1`）。
 * 声明了却连上特权角色 = 连接串被配回特权 / DATABASE_URL_APP 漏配，正是 D-5 点名的
 * 「RLS 静默失效」事故 → 必须炸，不能继续跑。
 */
export function isRoleSentinelEnforced(env: EnvLike = process.env): boolean {
  return isAppRoleRuntimeEnabled(env);
}

export interface SentinelOutcome {
  info: ConnectionRoleInfo | null;
  enforced: boolean;
  /** 'ok' 非特权；'violation' 特权且强制（此时本函数已抛）；'warned' 特权但非强制；'unknown' 连不上库。 */
  status: 'ok' | 'violation' | 'warned' | 'unknown';
}

/**
 * 启动期哨兵（src/instrumentation.ts 调用）。
 *
 * - 非特权连接 → ok
 * - 特权连接 + 强制 → 抛 PrivilegedConnectionError（fail-closed）
 * - 特权连接 + 非强制（本机 dev 现状：未配 DATABASE_URL_APP）→ 大声告警，不阻断
 * - 连不上库 → 只告警：启动期的连通性问题不该由这个哨兵来定生死（它管的是"是谁"，不是"通不通"）
 */
export async function runConnectionRoleSentinel(
  client: RawQueryClient,
  env: EnvLike = process.env,
  logger: Pick<Console, 'warn' | 'error' | 'info'> = console,
): Promise<SentinelOutcome> {
  const enforced = isRoleSentinelEnforced(env);
  let info: ConnectionRoleInfo;
  try {
    info = await inspectConnectionRole(client);
  } catch (err) {
    logger.warn(
      `[db] BYPASSRLS 哨兵未能读取连接角色（不阻断启动）：${(err as Error).message}`,
    );
    return { info: null, enforced, status: 'unknown' };
  }

  if (!isPrivilegedConnection(info)) {
    logger.info(`[db] BYPASSRLS 哨兵通过：连接角色 ${info.role}（不可绕过 RLS）`);
    return { info, enforced, status: 'ok' };
  }

  if (enforced) {
    const error = new PrivilegedConnectionError(info);
    logger.error(error.message);
    throw error;
  }

  logger.warn(
    `[db] ⚠️ 应用运行时连接角色为 ${info.role}（rolsuper=${info.superuser} ` +
      `rolbypassrls=${info.bypassRls}）→ **RLS 不生效，租户隔离只剩应用层 where 一道**。` +
      `这是未打开 DB_APP_ROLE_RUNTIME 时的预期状态（本机 dev / 既有测试面，D-8）；` +
      `生产在租户变量注入（D-7）落地后须配 DATABASE_URL_APP 并打开该开关，见 docs/dev/deploy.md。`,
  );
  return { info, enforced, status: 'warned' };
}
