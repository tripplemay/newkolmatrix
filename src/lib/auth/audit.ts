// M5-AUTH-RLS F005/F006（spec D-4）— 认证面审计留痕的**元数据口径**（单一真相源）。
//
// 【隐私红线】认证事件的留痕**只记元数据**：邮箱域名 + 结果 + 事件名。
//   - 不记明文口令（任何形态）
//   - 不记口令摘要（bcrypt 串是离线爆破的直接输入，进日志等于把它复制一份到低防护面）
//   - 不记邮箱本体（本地部分即用户身份；域名足以回答「哪家公司在注册/被撞库」）
// 这套口径由 tests/integration/auth-register.test.ts 的隐私断言串逐条钉住：
// 用一个独一无二的口令与邮箱本地部分注册，然后**在整张 OperationLog 上**搜这两个串，
// 一次命中即红——断言不从写入点清单派生，新增留痕点漏了也会被扫到。
//
// 【为什么复用既有 kind 枚举而不新增】OperationLogKind 是 DB enum，新增值要迁移，
// 而本域零迁移（spec §3 / 编排边界）。映射如下，语义上站得住：
//   - 认证成功 / 注册成功 → `auto`（系统自动记录的元数据事件，同 loop 遥测口径）
//   - 认证失败 / 限速拒绝 → `block`（既有语义就是「被拦下」，gate.ts:442 先例）

/** OperationLog.actor 的固定值——认证面不把邮箱写进 actor（见隐私红线）。 */
export const AUTH_AUDIT_ACTOR = 'auth';

/** summary 前缀（便于按前缀检索认证事件，同 PLAN_ACK_MARKER 范式）。 */
export const AUTH_AUDIT_MARKER = '[auth]';

export type AuthAuditEvent = 'register' | 'login';

export type AuthAuditResult =
  /** 成功。 */
  | 'ok'
  /** 注册：邮箱已被占用。 */
  | 'email_taken'
  /** 登录：凭据不正确（用户不存在 / 口令错 / 无摘要，三者对外同一结果）。 */
  | 'invalid_credentials'
  /** 被 fail-closed 限速拦下（F006）。 */
  | 'rate_limited';

/**
 * 取邮箱域名。取不到（形状非法 / 缺 @）→ 'unknown'，**绝不回落成整个邮箱**：
 * 那正是把本地部分泄进日志的经典写法。
 */
export function emailDomainOf(email: string | null | undefined): string {
  const at = (email ?? '').lastIndexOf('@');
  if (at < 0) return 'unknown';
  const domain = email!.slice(at + 1).trim().toLowerCase();
  return domain || 'unknown';
}

/** 人读摘要。**只含事件、结果、域名**三段。 */
export function authAuditSummary(
  event: AuthAuditEvent,
  result: AuthAuditResult,
  emailDomain: string,
): string {
  return `${AUTH_AUDIT_MARKER} ${event} ${result} domain=${emailDomain}`;
}

/** 结构化载荷（同样只有元数据；字段名固定，检索/统计据此）。 */
export function authAuditPayload(
  event: AuthAuditEvent,
  result: AuthAuditResult,
  emailDomain: string,
): { event: AuthAuditEvent; result: AuthAuditResult; emailDomain: string } {
  return { event, result, emailDomain };
}

/** 结果 → OperationLogKind（见文件头「为什么复用既有 kind 枚举」）。 */
export function authAuditKind(result: AuthAuditResult): 'auto' | 'block' {
  return result === 'ok' ? 'auto' : 'block';
}

/* ================================================================== *
 * F006：匿名认证事件的留痕落点
 * ================================================================== */

/**
 * **认证审计占位租户**。
 *
 * 【为什么需要它】OperationLog.tenantId 非空，而认证面有两类事件天生没有租户：
 *   ① 限速拒绝——发生在任何凭据判定之前，除了 IP 什么都不知道；
 *   ② 未知邮箱的登录失败——查无此人，没有可归属的租户。
 * 不给它们一个落点，这两类事件就只能不落库；而它们恰恰是**最需要留痕的两类**
 *（撞库与扫号的唯一可见痕迹）。
 *
 * 【为什么是真 Tenant 行而不是一个常量假 id】假 id 会让「每条 OperationLog 的 tenantId
 * 都指向真实租户」这条不变量破掉，F008 的 RLS policy 与后续任何按租户聚合的统计都得为它开特例。
 * 建一行真租户则天然自洽：它**没有任何 User**，因此没有任何会话的 tenantId 会等于它，
 * RLS 开启后这些行对所有租户都不可见——正是匿名安全事件该有的可见性。
 *
 * 【它不是产品租户】slug 带双下划线前缀，不建任何业务数据；出现在任何用户可见面即是 bug。
 */
export const AUTH_AUDIT_TENANT_SLUG = '__auth-audit__';
export const AUTH_AUDIT_TENANT_NAME = '认证审计（系统占位，无用户）';

/** 最小 DB 依赖面（便于测试注入，也让本模块不必 import 整个 PrismaClient 类型）。 */
export interface AuthAuditDb {
  tenant: {
    upsert(args: {
      where: { slug: string };
      update: Record<string, never>;
      create: { slug: string; name: string };
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  operationLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/** 取（必要时建）审计占位租户。upsert 幂等，并发下不炸。 */
export async function authAuditTenantId(db: AuthAuditDb): Promise<string> {
  const row = await db.tenant.upsert({
    where: { slug: AUTH_AUDIT_TENANT_SLUG },
    update: {},
    create: { slug: AUTH_AUDIT_TENANT_SLUG, name: AUTH_AUDIT_TENANT_NAME },
    select: { id: true },
  });
  return row.id;
}

export interface WriteAuthAuditInput {
  event: AuthAuditEvent;
  result: AuthAuditResult;
  /** 只用于取域名，**不会**被写进任何字段。 */
  email?: string | null;
  /** 已知归属租户（登录成功 = 该用户的租户；登录失败 = 被尝试的那个账号的租户）。 */
  tenantId?: string | null;
}

/**
 * 写一行认证留痕。**永不抛**：留痕失败不能把登录/注册本身打死
 *（与 F005 注册成功那行的区别：那行在事务内，属于「注册成功」这个事实的一部分，
 *  回滚了就不该留下；这里的是旁路观测）。失败只 console.error，不吞掉声音。
 */
export async function writeAuthAudit(
  input: WriteAuthAuditInput,
  db: AuthAuditDb,
): Promise<void> {
  try {
    const emailDomain = emailDomainOf(input.email);
    const tenantId = input.tenantId ?? (await authAuditTenantId(db));
    await db.operationLog.create({
      data: {
        tenantId,
        kind: authAuditKind(input.result),
        actor: AUTH_AUDIT_ACTOR,
        summary: authAuditSummary(input.event, input.result, emailDomain),
        payloadJson: authAuditPayload(input.event, input.result, emailDomain),
      },
    });
  } catch (error) {
    console.error('[auth/audit] 留痕失败（不影响认证结果）:', error);
  }
}
