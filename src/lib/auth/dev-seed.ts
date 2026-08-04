// M5-AUTH-RLS F001（spec §5 数据准备）— dev 测试用户的凭据与**生产禁建**判定。
//
// 判定单独成模块（而不是写在 scripts/ 里）是为了让「prod 不建」这条约束被单测钉住：
// 脚本文件不在 vitest 收集范围内，写在脚本里的 if 等于没有守门。

/** dev 租户既有用户（AGENT-FOUNDATION F004 seed），本批为其补 passwordHash。 */
export const DEV_TEST_USER_EMAIL = 'dev@newkolmatrix.local';

/**
 * 默认 dev 口令：满足 D-4 强度（≥10 位、含字母与数字）。
 * **只对本机 dev / CI 一次性库有效**，不是任何生产凭据；可用 DEV_TEST_USER_PASSWORD 覆盖。
 */
export const DEFAULT_DEV_TEST_USER_PASSWORD = 'DevPassw0rd2026';

export interface DevTestUserCredentials {
  email: string;
  password: string;
}

/**
 * 生产禁建守门。NODE_ENV=production 一律抛错——dev 测试用户是**已知公开凭据**，
 * 进生产库等于开后门。无 escape hatch：需要生产账号请走 /signup 正常注册（D-4）。
 */
export function assertDevSeedAllowed(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): void {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      '[seed:dev-user] 生产环境禁止创建 dev 测试用户（已知公开凭据）。生产账号请走 /signup 注册。',
    );
  }
}

/** 解析测试用户凭据（env 可覆盖；覆盖值仍须满足 D-4 强度，由调用侧的注册校验兜底）。 */
export function resolveDevTestUserCredentials(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): DevTestUserCredentials {
  return {
    email: (env.DEV_TEST_USER_EMAIL?.trim() || DEV_TEST_USER_EMAIL).toLowerCase(),
    password:
      env.DEV_TEST_USER_PASSWORD?.trim() || DEFAULT_DEV_TEST_USER_PASSWORD,
  };
}
