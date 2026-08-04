// M5-AUTH-RLS F004（spec D-3）— 会话 → 租户身份的**唯一解析点**。
//
// 本批之前，租户来源是 lib/agent/context 里那个硬编码 slug='dev' + 模块级缓存的解析函数。本模块把它换成
// 「当前登录会话」，并且**只有一个出口**：要么拿到会话身份，要么抛错。没有第三条路——
// 尤其没有「取不到会话就当 dev 租户」的回落。那条回落是静默跨租户读写的唯一入口
//（A 用户的请求落到 dev 租户的数据上，无任何报错、无任何日志），故负向断言钉死
//（tests/unit/session-tenant-context.test.ts）。
//
// 【为什么单独一个模块而不是写在 lib/agent/context.ts 里】
//   1. context.ts 被 scripts/ 与 tests/ 大量引用，它们跑在**没有 Next 请求作用域**的进程里；
//      把 next-auth 的 `auth()` 静态引进 context.ts 会让每个脚本都拖上 next-auth 模块图。
//      这里用**动态 import**，显式租户路径（systemContext / 测试床）因此完全不触 next-auth。
//   2. 测试床需要一个可被 `vi.mock` 精确替换的注入点。模块边界就是那个点——
//      route / page 的代码路径（会话 → ctx → 查询）在测试里原样跑，只有「会话从哪来」被替换。
//
// 【401 语义】本模块只负责「有没有会话租户」。未登录请求在**到不了这里之前**就已被
// F003 的 middleware 拦成 401（spec 裁-1：401 的承载层 = middleware）。故这里抛错等价于
// 「middleware 豁免清单与数据层口径不一致」的内部错误，不是给终端用户看的认证失败。

/** 会话解析出的执行身份。actor 用于留痕（OperationLog.actor），不参与任何权限判定。 */
export interface SessionIdentity {
  tenantId: string;
  /** 操作者标识 = 登录邮箱（spec D-3：actor=email）。取不到邮箱时回落 user:<id>。 */
  actor: string;
}

/**
 * 无会话租户时抛出。**独立错误类**是为了让负向断言能断言类型而不是断言字符串——
 * 一旦有人加了 dev 回落，这个错误就不会再出现，测试当场红（断言 `toThrow(MissingSessionTenantError)`
 * 对「返回了 dev 租户」和「抛了别的错（如 Prisma 连不上）」两种情况都不放过）。
 */
export class MissingSessionTenantError extends Error {
  constructor(message?: string) {
    super(
      message ??
        '[auth] 当前请求没有会话租户，且未显式传入租户。' +
          'HTTP 面应经登录会话（middleware 已保证）；无会话面（scheduler / scripts / seed）' +
          '必须显式走 systemContext(tenantSlug)。**不提供回落到 dev 租户的路径**（spec D-3）。',
    );
    this.name = 'MissingSessionTenantError';
  }
}

/**
 * 读当前请求的会话身份；无会话 / 会话缺租户 → null。
 *
 * 动态 import：见文件头注释第 1 条。`auth()` 依赖 next/headers 的请求作用域，
 * 在没有请求作用域的进程里会抛错——**不 catch**：把「认证机制本身坏了」伪装成
 * 「未登录」是最糟的失败模式（前者需要立刻修，后者只是跳登录页）。调用方 require* 一律 fail-closed。
 */
export async function readSessionIdentity(): Promise<SessionIdentity | null> {
  const { auth } = await import('./index');
  const session = await auth();
  const user = session?.user;
  const tenantId = user?.tenantId?.trim();
  if (!tenantId) return null;
  const email = user?.email?.trim();
  return { tenantId, actor: email || `user:${user?.id ?? 'unknown'}` };
}

/** 会话身份，取不到即抛（fail-closed）。 */
export async function requireSessionIdentity(): Promise<SessionIdentity> {
  const identity = await readSessionIdentity();
  if (!identity) throw new MissingSessionTenantError();
  return identity;
}

/** 只要租户 id 的便捷式（route / RSC 里最常见的用法）。 */
export async function requireSessionTenantId(): Promise<string> {
  return (await requireSessionIdentity()).tenantId;
}
