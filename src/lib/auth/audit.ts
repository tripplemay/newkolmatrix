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
